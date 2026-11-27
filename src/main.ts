import * as utils from '@iobroker/adapter-core';
import dayjs from 'dayjs';
import _ from 'lodash';
import { STATUS_CODES } from 'node:http';
import url from 'node:url';
import { request } from "undici";
import { NetworkApi } from './lib/api/network-api.js';
import type { NetworkDevice } from './lib/api/network-types-device.js';
import type { FirewallGroup } from './lib/api/network-types-firewall.js';
import type { NetworkLanConfig, NetworkLanConfig_V2 } from './lib/api/network-types-lan-config.js';
import { NetworkSysInfo } from './lib/api/network-types-sysinfo.js';
import type { NetworkWlanConfig, NetworkWlanConfig_V2 } from './lib/api/network-types-wlan-config.js';
import type { NetworkEvent, NetworkEventClient, NetworkEventDevice, NetworkEventFirewallGroup, NetworkEventLanConfig, NetworkEventSpeedTest, NetworkEventWlanConfig } from './lib/api/network-types.js';
import { base64 } from './lib/base64.js';
import { disconnectDebounceList, eventHandler } from './lib/eventHandler.js';
import { COMMANDS, HELP } from './lib/help.js';
import { messageHandler } from './lib/messageHandler.js';
import { migration } from './lib/migration.js';
import { myIob, myTreeState, type WriteValFunction } from './lib/myIob.js';
import { ignoredWebSocketMessages, WebSocketEvent, WebSocketEventMessages, type ConnectedClients, type myCache, type myNetworkClient } from './lib/myTypes.js';
import * as tree from './lib/tree/index.js';

// Interval in ms in which the alive checker verifies that the controller session is still valid
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;
// A session that expires within this time is renewed in the next session check, i.e. 5 to 10 minutes before it expires
const SESSION_RENEW_BEFORE_EXPIRY = 10 * 60 * 1000;

export class UnifiNetwork extends utils.Adapter {
	ufn: NetworkApi | undefined;
	myIob: myIob | undefined;

	isConnected: boolean = false;

	controllerVersion: string | undefined = undefined;

	aliveTimeout: ioBroker.Timeout | undefined = undefined;
	pingTimeout: ioBroker.Timeout | undefined = undefined;
	aliveTimestamp: number = dayjs().valueOf();
	apiPollingTimeout: ioBroker.Timeout | undefined = undefined;

	connectionRetries: number = 0;
	lastSessionCheck: number = 0;

	cache: myCache = {
		devices: {},
		clients: {},
		vpn: {},
		wlan: {},
		lan: {},
		isOnline: {},
		firewall: {
			groups: {}
		}
	}

	subscribedList: string[] = [];

	eventListener = async (event: NetworkEvent): Promise<void> => {
		await this.onNetworkMessage(event);
	};

	pongListener = async (): Promise<void> => {
		await this.onPongMessage();
	};

	eventsToIgnore: readonly string[] = ignoredWebSocketMessages;

	statesUsingValAsLastChanged = [          // id of states where lc is taken from the value
		'rundate',
	];

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'unifi-network',
			useFormatDate: true
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	//#region helpers

	/**
	 * Returns the display name of a client from the real-time API data
	 *
	 * @param client client data
	 * @returns display name of the client
	 */
	private getClientName(client: myNetworkClient): string {
		return client.unifi_device_info_from_ucore?.name || client.display_name || client.name || client.hostname;
	}

	/**
	 * Checks whether a whitelist or blacklist setting allows processing of an item
	 *
	 * @param isWhiteList true if the list is a whitelist, false if it is a blacklist
	 * @param list whitelist or blacklist
	 * @param match properties used to find the item in the list
	 * @returns true if the item should be processed
	 */
	private isProcessedByFilter<T extends object>(isWhiteList: boolean, list: T[] | undefined, match: Partial<T>): boolean {
		const isListed = _.some(list, match);
		return isWhiteList ? isListed : !isListed;
	}

	/**
	 * Checks whether a real-time update is debounced, because the last update is more recent than `realTimeApiDebounceTime`
	 *
	 * @param lastSeen last_seen of the cached object (unix timestamp in seconds)
	 * @param iobTimestamp timestamp of the last update by the adapter (unix timestamp in seconds)
	 * @returns true if the update should be skipped
	 */
	private isRealTimeDebounced(lastSeen: number | null | undefined, iobTimestamp: number | null | undefined): boolean {
		const debounceTime = this.config.realTimeApiDebounceTime;

		return !!((lastSeen && dayjs().diff(lastSeen * 1000, 'second') < debounceTime) || (iobTimestamp && dayjs().diff(iobTimestamp * 1000, 'second') < debounceTime));
	}

	/**
	 * Counts the connected (online) clients per WLAN or LAN in one pass over the cache
	 *
	 * @param attribute cache attribute that references the WLAN or LAN
	 * @returns map of WLAN or LAN id to the number of connected clients
	 */
	private countConnectedClientsBy(attribute: 'wlan_id' | 'network_id'): Map<string, number> {
		const counts = new Map<string, number>();

		for (const online of Object.values(this.cache.isOnline)) {
			const id = online.val === true ? online[attribute] : undefined;

			if (id !== undefined) {
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
		}

		return counts;
	}

	/**
	 * Restarts the timer of the alive checker
	 */
	private scheduleAliveChecker(): void {
		if (this.aliveTimeout) {
			this.clearTimeout(this.aliveTimeout);
			this.aliveTimeout = null;
		}

		this.aliveTimeout = this.setTimeout(async () => {
			await this.aliveChecker();
		}, (this.config.expertAliveInterval || 30) * 1000);
	}

	/**
	 * Calls the write function of a state that was changed from outside of the adapter (ack = false)
	 *
	 * @param id id of the changed state
	 * @param state the changed state
	 * @param objectId id of the object the state belongs to (mac, wlan id, lan id, ...)
	 * @param cache cache of the object type
	 * @param logLabel label for the log messages, e.g. 'client'
	 */
	private async writeExternalState(id: string, state: ioBroker.State, objectId: string | undefined, cache: Record<string, Parameters<WriteValFunction>[2]>, logLabel: string): Promise<void> {
		const logPrefix = '[onStateChange]:';

		const writeValKey = id.replace(`.${objectId}.`, '.').replace(`${this.namespace}.`, '');
		if (this.myIob?.statesWithWriteFunction[writeValKey] && objectId) {
			await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, cache[objectId], this);
		} else {
			this.log.debug(`${logPrefix} ${logLabel} state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
		}
	}
	//#endregion

	//#region adapter methods

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		const logPrefix = '[onReady]:';

		try {
			await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

			this.myIob = new myIob(this, utils, this.statesUsingValAsLastChanged);

			if (this.config.expertAliveInterval >= 30 && this.config.expertAliveInterval <= 10000 &&
				this.config.realTimeApiDebounceTime >= 0 && this.config.realTimeApiDebounceTime <= 10000 &&
				this.config.apiUpdateInterval >= 30 && this.config.apiUpdateInterval <= 10000 &&
				this.config.clientRealtimeDisconnectDebounceTime >= 0 && this.config.clientRealtimeDisconnectDebounceTime <= 10000) {

				if (this.config.host && this.config.user && this.config.password) {
					this.ufn = new NetworkApi(this.config.host, this.config.port, this.config.site, this.config.user, this.config.password, this);

					migration(this);

					await this.establishConnection(true);

					this.ufn.on('message', this.eventListener);
					this.ufn.on('pong', this.pongListener);

					this.log.info(`${logPrefix} Listening to WebSocket realtime API events started`);

				} else {
					this.log.warn(`${logPrefix} no login credentials in adapter config set!`);
				}

				this.myIob.findMissingTranslation(tree);
			} else {
				this.log.error(`${logPrefix} adapter config settings wrong!`);
				await this.stop?.({ reason: 'adapter config settings wrong' });
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * 
	 * @param callback 
	 */
	private async onUnload(callback: () => void): Promise<void> {
		const logPrefix = '[onUnload]:';

		try {
			this.ufn?.clearConnectionTimeouts();

			this.removeListener('message', this.eventListener);
			this.removeListener('pong', this.pongListener);

			this.clearTimeout(this.aliveTimeout);
			this.clearTimeout(this.pingTimeout);
			this.clearTimeout(this.apiPollingTimeout);

			for (const item in disconnectDebounceList) {
				this.clearTimeout(disconnectDebounceList[item].timeout);
			}

			if (this.ufn) {
				this.ufn.logout();
				await this.setConnectionStatus(false);
				this.log.info(`${logPrefix} Logged out successfully from the Unifi-Network controller API. (host: ${this.config.host}:${this.config.port})`);
			}

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	// private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * 
	 * @param id 
	 * @param state 
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		const logPrefix = '[onStateChange]:';

		try {
			if (state) {
				if (state.from.includes(this.namespace)) {
					// internal changes
					if (this.myIob?.getIdLastPart(id) === 'imageUrl') {
						if (this.config.clientImageDownload && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`))) {
							await this.downloadImage(state.val as string, [this.myIob.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update client image`);
						} else if (this.config.deviceImageDownload && id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
							await this.downloadImage(state.val as string, [this.myIob.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update device image`);
						}
					} else if (this.myIob?.getIdLastPart(id) === 'isOnline' && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelVpn}.`))) {
						const macOrIp = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id)).replaceAll('_', '.');

						const currentOnline = this.cache.isOnline[macOrIp];
						if (state.val !== currentOnline?.val) {
							const old = {
								wlan_id: currentOnline?.wlan_id,
								network_id: currentOnline?.network_id,
							}
							this.cache.isOnline[macOrIp] = {
								val: state.val as boolean,
								wlan_id: this.cache.clients[macOrIp]?.wlanconf_id || this.cache.vpn[macOrIp]?.wlanconf_id || old.wlan_id,
								network_id: this.cache.clients[macOrIp]?.network_id || this.cache.vpn[macOrIp]?.network_id || old.network_id,
							}

							this.log.debug(`${logPrefix} '${this.cache.clients[macOrIp]?.name || this.cache.vpn[macOrIp]?.ip}' .isOnline changed to '${state.val}' (${JSON.stringify(this.cache.isOnline[macOrIp])})`);

							await this.updateWlanConnectedClients();
							await this.updateLanConnectedClients();
						}
					}
				} else if (!state.from.includes(this.namespace) && state.ack === false) {
					// state changed from outside of the adapter


					if (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`)) {
						// Client state changed
						await this.writeExternalState(id, state, this.myIob?.getIdLastPart(this.myIob.getIdWithoutLastPart(id)), this.cache.clients, 'client');
					} else if (id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
						// Device state changed
						await this.writeExternalState(id, state, id.replace(`${this.namespace}.${tree.device.idChannel}.`, '').split('.')[0], this.cache.devices, 'device');
					} else if (id.startsWith(`${this.namespace}.${tree.wlan.idChannel}.`)) {
						await this.writeExternalState(id, state, this.myIob?.getIdLastPart(this.myIob.getIdWithoutLastPart(id)), this.cache.wlan, 'wlan');
					} else if (id.startsWith(`${this.namespace}.${tree.lan.idChannel}.`)) {
						await this.writeExternalState(id, state, this.myIob?.getIdLastPart(this.myIob.getIdWithoutLastPart(id)), this.cache.lan, 'lan');
					} else if (id.startsWith(`${this.namespace}.${tree.firewall.group.idChannel}.`)) {
						await this.writeExternalState(id, state, this.myIob?.getIdLastPart(this.myIob.getIdWithoutLastPart(id)), this.cache.firewall.groups, 'firewall group');
					}
				} else {
					// The state was changed
					// this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				}
			} else {
				// The state was deleted
				this.log.info(`state ${id} deleted`);
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		const logPrefix = '[onMessage]:';

		try {
			// this.log.info(`${logPrefix} ${JSON.stringify(obj)}`);

			if (typeof obj === 'object') {
				if (obj.command === 'help') {
					// the description of all commands for AI agents and scripts, also without a connection
					if (obj.callback) {
						this.sendTo(obj.from, obj.command, { help: HELP, commands: COMMANDS }, obj.callback);
					}
				} else if (obj.command === 'deviceList') {
					await messageHandler.device.list(obj, this, this.ufn);
				} else if (obj.command === 'deviceStateList') {
					messageHandler.device.stateList(obj, this, this.ufn);
				} else if (obj.command === 'clientList') {
					await messageHandler.client.list(obj, this, this.ufn);
				} else if (obj.command === 'clientStateList') {
					messageHandler.client.stateList(obj, this, this.ufn);
				} else if (obj.command === 'wlanList') {
					await messageHandler.wlan.list(obj, this, this.ufn);
				} else if (obj.command === 'wlanStateList') {
					messageHandler.wlan.stateList(obj, this, this.ufn);
				} else if (obj.command === 'lanList') {
					await messageHandler.lan.list(obj, this, this.ufn);
				} else if (obj.command === 'lanStateList') {
					messageHandler.lan.stateList(obj, this, this.ufn);
				} else if (obj.command === 'firewallGroupList') {
					await messageHandler.firewall.group.list(obj, this, this.ufn);
				} else if (obj.command === 'firewallGroupStateList') {
					messageHandler.firewall.group.stateList(obj, this, this.ufn);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region Establish Connection

	/**
	 * Establish Connection to NVR and starting the alive checker
	 * 
	 * @param isAdapterStart
	 */
	async establishConnection(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[establishConnection]:';

		try {

			if (this.pingTimeout) {
				this.clearTimeout(this.pingTimeout)
				this.pingTimeout = null;
			}

			if (await this.login()) {
				// the login has just validated the session
				this.lastSessionCheck = dayjs().valueOf();

				await this.updateRealTimeApiData(isAdapterStart);

				await this.updateApiData(isAdapterStart);

				this.sendPing(isAdapterStart);
			} else {
				await this.setConnectionStatus(false);
			}

			// start the alive checker
			this.scheduleAliveChecker();

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/** 
	 * Login into NVR and load bootstrap data
	 *
	 * @param isAdapterStart
	 * @returns Connection status
	 */
	async login(isAdapterStart: boolean = false): Promise<boolean> {
		const logPrefix = '[login]:';

		try {
			if (this.ufn) {
				const loginSuccessful = await this.ufn.login();

				if (loginSuccessful) {
					this.controllerVersion = await this.ufn.getControllerVersion();

					// Add the session expiry (ioBroker date format) if the controller reported one.
					const sessionExpiry = this.ufn.getSessionExpiry();
					const sessionInfo = sessionExpiry === null ? '' : `, session expire: ${dayjs(sessionExpiry).format(`${this.dateFormat || 'DD.MM.YYYY'} HH:mm:ss`)}`;

					this.log.info(`${logPrefix} Logged in successfully to the Unifi-Network controller (host: ${this.config.host}:${this.config.port}, site: ${this.config.site}, version: ${this.controllerVersion}, isUnifiOs: ${this.ufn.isUnifiOs}${sessionInfo})`);

					if (await this.ufn.launchEventsWs()) {
						this.log.info(`${logPrefix} WebSocket connection to realtime API successfully established`);

						await this.setConnectionStatus(true);

						return true;
					} else {
						this.log.error(`${logPrefix} unable to establish WebSocket connection to realtime API`);
					}
				} else {
					this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.ufn.controllerUrl}, site: ${this.config.site})`);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		await this.setConnectionStatus(false);

		return false;
	}



	/** 
	 * Check whether the connection to the controller exists, if not try to establish a new connection
	 */
	async aliveChecker(): Promise<void> {
		const logPrefix = '[aliveChecker]:';

		try {
			if (this.ufn) {
				const diff = Math.round((dayjs().valueOf() - this.aliveTimestamp) / 1000);

				if (diff >= (this.config.expertAliveInterval || 30)) {
					this.log.warn(`${logPrefix} No connection to the Unifi-Network controller -> restart connection (retries: ${this.connectionRetries}, no data since ${diff}s)`);
					this.ufn.logout();

					await this.setConnectionStatus(false);

					if (this.connectionRetries < (this.config.expertConnectionMaxRetries || 200)) {
						this.connectionRetries++;

						await this.establishConnection();
					} else {
						this.log.error(`${logPrefix} Connection to the Unifi-Network controller is down for more then ${(this.config.expertConnectionMaxRetries || 200) * (this.config.expertAliveInterval || 30)}s, stopping the adapter.`);
						await this.stop?.({ reason: 'too many connection retries' });
					}
					return;
				} else {
					this.log.silly(`${logPrefix} Connection to the Unifi-Network controller is alive (last alive signal is ${diff}s old)`);

					// Pongs can keep arriving after the session expired, so the session is checked explicitly and in a fixed interval.
					if (dayjs().valueOf() - this.lastSessionCheck >= SESSION_CHECK_INTERVAL) {
						this.lastSessionCheck = dayjs().valueOf();

						const sessionExpiry = this.ufn.getSessionExpiry();

						if (sessionExpiry !== null && sessionExpiry - dayjs().valueOf() <= SESSION_RENEW_BEFORE_EXPIRY) {
							// The controller reported the expiry, so the session is renewed before it runs out. The events WebSocket stays open.
							this.log.info(`${logPrefix} Session of the Unifi-Network controller expires soon, renewing it`);

							if (!(await this.ufn.renewSession())) {
								await this.restartConnection(`${logPrefix} Session renewal failed, logging in again`);
								return;
							}
						} else if (await this.ufn.checkSession() === 'expired') {
							await this.restartConnection(`${logPrefix} Session of the Unifi-Network controller expired, logging in again`);
							return;
						}
					}

					await this.updateIsOnlineState();

					await this.setConnectionStatus(true);
					this.connectionRetries = 0;

					this.scheduleAliveChecker();
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}


	/**
	 * Restarts the connection with a fresh login. Used as fallback when the session cannot be renewed or has expired.
	 *
	 * @param reason message for the log
	 */
	private async restartConnection(reason: string): Promise<void> {
		this.log.info(reason);

		// logout() also closes the events WebSocket, establishConnection() opens a new one.
		this.ufn?.logout();

		await this.setConnectionStatus(false);

		await this.establishConnection();
	}

	/**
	 * Set adapter info.connection state and internal var
	 *  
	 * @param isConnected
	 */
	async setConnectionStatus(isConnected: boolean): Promise<void> {
		const logPrefix = '[setConnectionStatus]:';

		try {
			this.isConnected = isConnected;
			this.connected = isConnected;

			await this.setState('info.connection', isConnected, true);
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * send websocket ping
	 * 
	 * @param isAdapterStart
	 */
	sendPing(isAdapterStart: boolean = false): void {
		const logPrefix = '[sendPing]:';

		try {
			if (!isAdapterStart) {
				this.ufn?.wsSendPing();
			}

			if (this.pingTimeout) {
				this.clearTimeout(this.pingTimeout)
				this.pingTimeout = null;
			}

			this.pingTimeout = this.setTimeout(() => {
				this.sendPing();
			}, ((this.config.expertAliveInterval || 30) / 2) * 1000);

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region updateData

	async updateRealTimeApiData(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateRealTimeApiData]:';

		try {
			await this.updateDevices((await this.ufn?.getDevices_V2())?.network_devices, isAdapterStart);

			await this.updateClients(null, isAdapterStart);
			await this.updateClients(await this.ufn?.getClientsHistory_V2() as myNetworkClient[], isAdapterStart, true);
			await this.updateVpnClients(null, isAdapterStart);

			await this.updateLanConfig(null, isAdapterStart);
			await this.updateLanConnectedClients(isAdapterStart);

			await this.updateWlanConfig(null, isAdapterStart);
			await this.updateWlanConnectedClients(isAdapterStart);

			if (this.config.firewallRuleConfigEnabled || this.config.firewallGroupConfigEnabled) {

				if (isAdapterStart) {
					await this.myIob?.createOrUpdateChannel(tree.firewall.idChannel, 'firewall', undefined, true);
				}

				await this.updateFirewallGroup(null, isAdapterStart);
			} else {
				if (await this.objectExists(tree.firewall.idChannel)) {
					await this.delObjectAsync(tree.firewall.idChannel, { recursive: true });
					this.log.debug(`${logPrefix} '${tree.firewall.idChannel}' deleted`);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateApiData(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateApiData]:';

		try {
			await this.updateSysInfo(await this.ufn?.getSysInfo(), isAdapterStart);

			// only poll if api calls are enabled, that are not covered by the real-time api
			if (this.config.systemInformationEnabled) {
				if (this.apiPollingTimeout) {
					this.clearTimeout(this.apiPollingTimeout);
					this.apiPollingTimeout = undefined;
				}

				this.apiPollingTimeout = this.setTimeout(async () => {
					await this.updateApiData();
				}, this.config.apiUpdateInterval * 1000);

				await this.setState('info.lastApiPoll', dayjs().valueOf(), true);
			} else {
				await this.setState('info.lastApiPoll', null, true);
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateDevices(data: NetworkDevice[] | null = null, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateDevices]:';

		try {
			if (this.connected && this.isConnected) {
				if (this.config.devicesEnabled) {

					if (isAdapterStart) {
						await this.myIob?.createOrUpdateChannel(tree.device.idChannel, tree.device.nameChannel, undefined, true);
					}

					if (data && data !== null) {
						let countDevices = 0;
						let countBlacklisted = 0;

						for (const device of data) {
							const idDevice = `${tree.device.idChannel}.${device.mac}`;

							if (this.isProcessedByFilter(this.config.deviceIsWhiteList, this.config.deviceBlackList, { mac: device.mac })) {
								if (isAdapterStart) {
									countDevices++

									if (device.vap_table) {
										// API V2 has no id for wlan, so we remove this and wait for real-time data
										delete device.vap_table;
									}
								}

								if (!isAdapterStart && this.config.realTimeApiDebounceTime > 0 && this.cache.devices[device.mac]) {
									// debounce real time data
									const lastSeen = this.cache.devices[device.mac].last_seen;
									const iobTimestamp = this.cache.devices[device.mac].iobTimestamp;
									if (this.isRealTimeDebounced(lastSeen, iobTimestamp)) {
										continue
									}
								}

								if (!this.cache.devices[device.mac]) {
									this.log.debug(`${logPrefix} Discovered device '${device.name}' (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname}, version: ${device.version})`);
								}

								let dataToProcess = device;
								if (this.cache.devices[device.mac]) {
									// filter out unchanged properties
									dataToProcess = this.myIob?.deepDiffBetweenObjects(device, this.cache.devices[device.mac], this, tree.device.getKeys()) as NetworkDevice;
								}

								if (!_.isEmpty(dataToProcess)) {
									this.cache.devices[device.mac] = { ...this.cache.devices[device.mac], ...device };
									this.cache.devices[device.mac].iobTimestamp = dayjs().unix();

									dataToProcess.mac = device.mac;

									this.log.silly(`${logPrefix} device '${device.name}' (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);

									await this.myIob?.createOrUpdateDevice(idDevice, device.name, { onlineId: `${idDevice}.isOnline`, errorId: `${idDevice}.hasError`, updateObject: isAdapterStart, logChanges: true });
									await this.myIob?.createOrUpdateStates(idDevice, tree.device.get(), dataToProcess, device, { blacklistFilter: this.config.deviceStatesBlackList, isWhiteList: this.config.deviceStatesIsWhiteList, logDeviceName: device.name, updateObject: isAdapterStart });
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++

									if (await this.objectExists(idDevice)) {
										await this.delObjectAsync(idDevice, { recursive: true });
										this.log.info(`${logPrefix} device '${device.name}' (mac: ${device.mac}) delete, ${this.config.deviceIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} devices (devices: ${countDevices}, blacklisted: ${countBlacklisted}, states ${!this.config.deviceStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.deviceStatesBlackList.length})`);
						}
					}
				} else {
					if (await this.objectExists(tree.device.idChannel)) {
						await this.delObjectAsync(tree.device.idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${tree.device.idChannel}' deleted`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateClients(data: myNetworkClient[] | null | undefined = null, isAdapterStart: boolean = false, isOfflineClients: boolean = false): Promise<void> {
		const logPrefix = '[updateClients]:';

		try {
			if (this.connected && this.isConnected) {

				if (isAdapterStart && !isOfflineClients) {
					if (this.config.clientsEnabled) {
						await this.myIob?.createOrUpdateChannel(tree.client.idChannelUsers, tree.client.nameChannelUsers, undefined, true);
					}

					if (this.config.guestsEnabled) {
						await this.myIob?.createOrUpdateChannel(tree.client.idChannelGuests, tree.client.nameChannelGuests, undefined, true);
					}

					if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
						await this.myIob?.createOrUpdateChannel(tree.client.idChannel, tree.client.nameChannel, undefined, true);
						data = await this.ufn?.getClientsActive_V2();
					} else {
						if (await this.objectExists(tree.client.idChannel)) {
							await this.delObjectAsync(tree.client.idChannel, { recursive: true });
							this.log.info(`${logPrefix} channel clients delete`);
						}
					}
				}

				if (this.config.clientsEnabled || this.config.guestsEnabled) {
					if (data && data !== null) {
						let countClients = 0;
						let countGuests = 0;
						let countBlacklisted = 0;

						for (const client of data) {
							const name = this.getClientName(client);

							if (this.isProcessedByFilter(this.config.clientIsWhiteList, this.config.clientBlackList, { mac: client.mac })) {
								const cachedByMac = this.cache.clients[client.mac];
								const cachedByIp = this.cache.clients[client.ip];

								if (!isAdapterStart && this.config.realTimeApiDebounceTime > 0 && (cachedByMac || cachedByIp)) {
									// debounce real time data
									const lastSeen = cachedByMac?.last_seen || cachedByIp?.last_seen;
									const iobTimestamp = cachedByMac?.timestamp || cachedByIp?.timestamp;

									if (this.isRealTimeDebounced(lastSeen, iobTimestamp)) {
										continue
									}
								}

								if (client.mac) {
									if (this.config.clientsEnabled && !client.is_guest) {
										if (await this.updateClientOrGuest(client, name, false, isAdapterStart, isOfflineClients, logPrefix) && isAdapterStart) {
											countClients++;
										}
									} else if (this.config.guestsEnabled && client.is_guest) {
										if (await this.updateClientOrGuest(client, name, true, isAdapterStart, isOfflineClients, logPrefix) && isAdapterStart) {
											countGuests++;
										}
									}
								} else {
									this.log.warn(`${logPrefix} client '${name}' has no mac address -> ignored`);
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++;

									const id = `${!client.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests}.${client.mac}`
									if (await this.objectExists(id)) {
										await this.delObjectAsync(id, { recursive: true });
										this.log.info(`${logPrefix} device '${name}' (mac: ${client.mac}) delete, ${this.config.clientIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} ${!isOfflineClients ? 'connected' : 'disconnected'} clients (clients: ${countClients}, guests: ${countGuests}, blacklisted: ${countBlacklisted}, states ${!this.config.clientStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.clientStatesBlackList.length})`);
						}
					}
				}

				if (!this.config.clientsEnabled && await this.objectExists(tree.client.idChannelUsers)) {
					await this.delObjectAsync(tree.client.idChannelUsers, { recursive: true });
					this.log.debug(`${logPrefix} channel '${tree.client.idChannelUsers}' deleted`);
				}

				if (!this.config.guestsEnabled && await this.objectExists(tree.client.idChannelGuests)) {
					await this.delObjectAsync(tree.client.idChannelGuests, { recursive: true });
					this.log.debug(`${logPrefix} channel '${tree.client.idChannelGuests}' deleted`);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Creates or updates a client or guest and its states. Clients and guests share the same logic,
	 * only the channel, the retention setting and some log texts differ.
	 *
	 * @param client client data
	 * @param name display name of the client
	 * @param isGuest true if the client is a guest
	 * @param isAdapterStart true during the adapter start
	 * @param isOfflineClients true if the data contains disconnected clients (client history)
	 * @param logPrefix prefix for the log messages
	 * @returns true if the client is kept, false if it is deleted or ignored because of the retention setting
	 */
	private async updateClientOrGuest(client: myNetworkClient, name: string, isGuest: boolean, isAdapterStart: boolean, isOfflineClients: boolean, logPrefix: string): Promise<boolean> {
		const type = isGuest ? 'guest' : 'client';
		const idChannel = isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers;
		const deleteOlderThan = isGuest ? this.config.deleteGuestsOlderThan : this.config.deleteClientsOlderThan;
		const offlineSince = dayjs().diff((client.last_seen) * 1000, 'day');

		if (deleteOlderThan === 0 || offlineSince <= deleteOlderThan) {
			if (!this.cache.clients[client.mac]) {
				this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} ${type} '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
				this.cache.isOnline[client.mac] = { val: !isOfflineClients };
			}

			let dataToProcess = client;
			if (this.cache.clients[client.mac]) {
				// filter out unchanged properties, compare with the display name the cache stores
				dataToProcess = this.myIob?.deepDiffBetweenObjects({ ...client, name }, this.cache.clients[client.mac], this, tree.client.getKeys()) as myNetworkClient;
			}

			if (!_.isEmpty(dataToProcess)) {
				this.cache.clients[client.mac] = { ...this.cache.clients[client.mac], ...client };
				this.cache.clients[client.mac].name = name;
				this.cache.clients[client.mac].timestamp = dayjs().unix();

				this.cache.isOnline[client.mac] ??= { val: !isOfflineClients };
				this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
				this.cache.isOnline[client.mac].network_id = client.network_id;

				dataToProcess.mac = client.mac;
				dataToProcess.name = name;

				if (!isAdapterStart) {
					this.log.silly(`${logPrefix} ${type} ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
				}

				await this.myIob?.createOrUpdateDevice(`${idChannel}.${client.mac}`, name, { onlineId: `${idChannel}.${client.mac}.isOnline`, updateObject: isAdapterStart, logChanges: true });
				await this.myIob?.createOrUpdateStates(`${idChannel}.${client.mac}`, tree.client.get(), dataToProcess, client, { blacklistFilter: this.config.clientStatesBlackList, isWhiteList: this.config.clientStatesIsWhiteList, logDeviceName: client.name, updateObject: isAdapterStart });
			}

			return true;
		}

		if (await this.objectExists(`${idChannel}.${client.mac}`)) {
			await this.delObjectAsync(`${idChannel}.${client.mac}`, { recursive: true });
			this.log[isGuest ? 'info' : 'debug'](`${logPrefix} ${type} '${name}' deleted, because it's offline since ${offlineSince} days`);
		} else {
			this.log.silly(`${logPrefix} ${type} '${name}' ingored, because it's offline since ${offlineSince} days`);
		}

		return false;
	}

	private async updateVpnClients(data: myNetworkClient[] | null | undefined = null, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateVpnClients]:';

		try {
			if (this.connected && this.isConnected) {
				if (isAdapterStart) {
					if (this.config.vpnEnabled) {
						await this.myIob?.createOrUpdateChannel(tree.client.idChannel, tree.client.nameChannel, undefined, true);
						await this.myIob?.createOrUpdateChannel(tree.client.idChannelVpn, tree.client.nameChannelVpn, undefined, true);
						data = await this.ufn?.getVpnUser();
					}

					if (!this.config.clientsEnabled && !this.config.guestsEnabled && !this.config.vpnEnabled) {
						if (await this.objectExists(tree.client.idChannel)) {
							await this.delObjectAsync(tree.client.idChannel, { recursive: true });
							this.log.info(`${logPrefix} channel clients delete`);
						}
					}
				}

				if (this.config.vpnEnabled) {
					if (data && data !== null) {
						let countVpn = 0;
						let countBlacklisted = 0;

						for (const client of data) {
							const name = this.getClientName(client);

							if (this.isProcessedByFilter(this.config.clientIsWhiteList, this.config.clientBlackList, { mac: client.mac })) {
								if (!isAdapterStart && this.config.realTimeApiDebounceTime > 0 && (this.cache.vpn[client.ip])) {
									// debounce real time data
									const lastSeen = this.cache.vpn[client.ip].last_seen;
									const iobTimestamp = this.cache.vpn[client.ip].timestamp;

									if (this.isRealTimeDebounced(lastSeen, iobTimestamp)) {
										continue
									}
								}

								if (client.type === 'VPN' && client.ip) {
									// VPN Clients
									if (isAdapterStart) {
										countVpn++
									}

									if (!this.cache.vpn[client.ip]) {
										this.log.debug(`${logPrefix} Discovered vpn client '${name}' (IP: ${client.ip}, remote_ip: ${client.remote_ip})`);
										this.cache.isOnline[client.ip] = { val: client.status === 'online' }
									}

									const idChannel = client.network_id;
									await this.myIob?.createOrUpdateChannel(`${tree.client.idChannelVpn}.${idChannel}`, client.network_name, client.vpn_type ? base64[client.vpn_type] : undefined);

									let dataToProcess = client;
									if (this.cache.vpn[client.ip]) {
										// filter out unchanged properties
										dataToProcess = this.myIob?.deepDiffBetweenObjects({ ...client, name }, this.cache.vpn[client.ip], this, tree.client.getKeys()) as myNetworkClient;
									}

									const preparedIp = client.ip.replaceAll('.', '_');

									if (!_.isEmpty(dataToProcess)) {
										this.cache.vpn[client.ip] = { ...this.cache.vpn[client.ip], ...client };
										this.cache.vpn[client.ip].name = name;
										this.cache.vpn[client.ip].timestamp = dayjs().unix();

										this.cache.isOnline[client.ip] ??= { val: client.status === 'online' };
										this.cache.isOnline[client.ip].network_id = client.network_id;

										dataToProcess.ip = client.ip;
										dataToProcess.name = name

										if (!isAdapterStart) {
											this.log.silly(`${logPrefix} vpn ${dataToProcess.name} (ip: ${dataToProcess.ip}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
										}

										await this.myIob?.createOrUpdateDevice(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, { onlineId: `${tree.client.idChannelVpn}.${idChannel}.${preparedIp}.isOnline`, updateObject: isAdapterStart, logChanges: true });
										await this.myIob?.createOrUpdateStates(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}`, tree.client.get(), dataToProcess, client, { blacklistFilter: this.config.clientStatesBlackList, isWhiteList: this.config.clientStatesIsWhiteList, logDeviceName: client.name, updateObject: isAdapterStart });
									}

									if (client.status === 'offline' && await this.objectExists(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}.isOnline`)) {
										// fallback method, because if status is offline, last_seen not changed
										await this.setState(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}.isOnline`, false, true);
									}
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++;

									const id = `${!client.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests}.${client.mac}`
									if (await this.objectExists(id)) {
										await this.delObjectAsync(id, { recursive: true });
										this.log.info(`${logPrefix} device '${name}' (mac: ${client.mac}) delete, ${this.config.clientIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} VPN clients (vpn: ${countVpn}, blacklisted: ${countBlacklisted}, states ${!this.config.clientStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.clientStatesBlackList.length})`);
						}
					}
				}

				if (!this.config.vpnEnabled && await this.objectExists(tree.client.idChannelVpn)) {
					await this.delObjectAsync(tree.client.idChannelVpn, { recursive: true });
					this.log.debug(`${logPrefix} channel '${tree.client.idChannelVpn}' deleted`);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateIsOnlineState(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateIsOnlineState]:';

		try {
			const clients = await this.getStatesAsync(`${tree.client.idChannel}.*.last_seen`);

			for (const id in clients) {
				const typeOfClient = id.includes('.users.') ? 'client' : id.includes('.guests.') ? 'guest' : 'vpn';
				const offlineTimeout = typeOfClient === 'vpn' ? this.config.vpnOfflineTimeout : this.config.clientOfflineTimeout;

				const lastSeenState = clients[id];
				const channelId = this.myIob?.getIdWithoutLastPart(id);
				const [isOnlineState, mac, ip] = await Promise.all([
					this.getStateAsync(`${channelId}.isOnline`),
					this.getStateAsync(`${channelId}.mac`),
					this.getStateAsync(`${channelId}.ip`),
				]);

				const client = typeOfClient !== 'vpn' ? this.cache.clients[mac?.val as string] : this.cache.vpn[ip?.val as string];

				const lastSeen = dayjs(lastSeenState.val as number * 1000);
				const diff = dayjs().diff(lastSeen, 'second');

				if (diff > offlineTimeout && isOnlineState && isOnlineState.val) {
					if (!isAdapterStart) {
						this.log[(this.config.clientDebugLevel || this.log.level) as ioBroker.LogLevel](`${logPrefix} Fallback method - ${typeOfClient} '${client?.name}' (mac: ${client?.mac}, ip: ${client?.ip}) is offline, last_seen '${lastSeen.format('DD.MM. - HH:mm')}h' not updated since ${diff}s`);
					}

					await this.setState(`${this.myIob?.getIdWithoutLastPart(id)}.isOnline`, false, true);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateWlanConfig(data: NetworkWlanConfig[] | NetworkWlanConfig_V2[] | null | undefined, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateWlanConfig]:';

		try {
			if (this.connected && this.isConnected) {

				if (this.config.wlanConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob?.createOrUpdateChannel(tree.wlan.idChannel, tree.wlan.nameChannel, undefined, true);
						data = await this.ufn?.getWlanConfig_V2();
					}

					if (data && data !== null) {
						let countWlan = 0;
						let countBlacklisted = 0;

						for (let wlan of data) {
							// Convert API V2 to V1, because event is from type V1
							if ((wlan as NetworkWlanConfig_V2) && (wlan as NetworkWlanConfig_V2).configuration) {
								wlan = { ...(wlan as NetworkWlanConfig_V2).configuration, ...(wlan as NetworkWlanConfig_V2).details, ...(wlan as NetworkWlanConfig_V2).statistics }
							}

							// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
							wlan = (wlan as NetworkWlanConfig);

							const idWlan = `${tree.wlan.idChannel}.${wlan._id}`;

							if (this.isProcessedByFilter(this.config.wlanIsWhiteList, this.config.wlanBlackList, { id: wlan._id })) {
								if (isAdapterStart) {
									countWlan++
								}

								if (wlan._id && !this.cache.wlan[wlan._id]) {
									this.log.debug(`${logPrefix} Discovered WLAN '${wlan.name}'`);
								}

								let dataToProcess = wlan;
								if (wlan._id && this.cache.wlan[wlan._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob?.deepDiffBetweenObjects(wlan, this.cache.wlan[wlan._id], this, tree.wlan.getKeys()) as NetworkWlanConfig;
								}

								if (wlan._id && !_.isEmpty(dataToProcess)) {
									this.cache.wlan[wlan._id] = { ... this.cache.wlan[wlan._id], ...wlan };
									dataToProcess._id = wlan._id;

									await this.myIob?.createOrUpdateDevice(idWlan, wlan.name, { onlineId: `${tree.wlan.idChannel}.${wlan._id}.enabled`, updateObject: isAdapterStart, logChanges: true });
									await this.myIob?.createOrUpdateStates(idWlan, tree.wlan.get(), dataToProcess, wlan, { blacklistFilter: this.config.wlanStatesBlackList, isWhiteList: this.config.wlanStatesIsWhiteList, logDeviceName: wlan.name, updateObject: isAdapterStart });
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++
									if (await this.objectExists(idWlan)) {
										await this.delObjectAsync(idWlan, { recursive: true });
										this.log.info(`${logPrefix} WLAN '${wlan.name}' (id: ${wlan._id}) delete, ${this.config.wlanIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} WLAN's (WLAN's: ${countWlan}, blacklisted: ${countBlacklisted}, states ${!this.config.wlanStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.wlanStatesBlackList.length})`);
						}
					}
				} else {
					if (await this.objectExists(tree.wlan.idChannel)) {
						await this.delObjectAsync(tree.wlan.idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${tree.wlan.idChannel}' deleted`);
					}
				}
			}

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateWlanConnectedClients(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateWlanConnectedClients]:';

		try {
			if (this.config.wlanConfigEnabled) {
				if (isAdapterStart) {
					const obj: ConnectedClients = { connected_clients: 0, connected_guests: 0, name: 'wlan' };
					await this.myIob?.createOrUpdateStates(tree.wlan.idChannel, tree.wlan.getGlobal(), obj, obj, { isWhiteList: false, logDeviceName: obj.name, updateObject: true });
				}

				let sumClients = 0;
				let sumGuests = 0;
				const connectedByWlan = this.countConnectedClientsBy('wlan_id');

				for (const wlan_id in this.cache.wlan) {
					const connectedCount = connectedByWlan.get(wlan_id) ?? 0;
					this.log.silly(`${logPrefix} WLAN '${this.cache.wlan[wlan_id].name}' (id: ${wlan_id}) connected ${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}: ${connectedCount}`);

					if (!this.cache.wlan[wlan_id].is_guest) {
						sumClients = sumClients + connectedCount;
					} else {
						sumGuests = sumGuests + connectedCount;
					}

					const id = `${tree.wlan.idChannel}.${wlan_id}.connected_${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}`
					if (await this.objectExists(id)) {
						this.setStateChanged(id, connectedCount, true);
					}
				}

				const idSumClients = `${tree.wlan.idChannel}.connected_clients`;
				if (await this.objectExists(idSumClients)) {
					this.setStateChanged(idSumClients, sumClients, true);
				}

				const idSumGuests = `${tree.wlan.idChannel}.connected_guests`;
				if (await this.objectExists(idSumGuests)) {
					this.setStateChanged(idSumGuests, sumGuests, true);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateLanConfig(data: NetworkLanConfig[] | NetworkLanConfig_V2[] | null | undefined, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateLanConfig]:';

		try {

			if (this.connected && this.isConnected) {

				if (this.config.lanConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob?.createOrUpdateChannel(tree.lan.idChannel, tree.lan.nameChannel, undefined, true);
						data = await this.ufn?.getLanConfig_V2();
					}

					if (data && data !== null) {
						let countLan = 0;
						let countBlacklisted = 0;

						for (let lan of data) {

							// Convert API V2 to V1, because event is from type V1
							if ((lan as NetworkLanConfig_V2) && (lan as NetworkLanConfig_V2).configuration) {
								lan = { ...(lan as NetworkLanConfig_V2).configuration, ...(lan as NetworkLanConfig_V2).details, ...(lan as NetworkLanConfig_V2).statistics }
							}

							// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
							lan = (lan as NetworkLanConfig);

							const idLan = `${tree.lan.idChannel}.${lan._id}`;

							if (this.isProcessedByFilter(this.config.lanIsWhiteList, this.config.lanBlackList, { id: lan._id })) {
								if (isAdapterStart) {
									countLan++
								}

								if (lan._id && !this.cache.lan[lan._id]) {
									this.log.debug(`${logPrefix} Discovered LAN '${lan.name}'`);
								}

								let dataToProcess = lan;
								if (lan._id && this.cache.lan[lan._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob?.deepDiffBetweenObjects(lan, this.cache.lan[lan._id], this, tree.lan.getKeys()) as NetworkLanConfig;
								}

								if (lan._id && !_.isEmpty(dataToProcess)) {
									this.cache.lan[lan._id] = { ... this.cache.lan[lan._id], ...lan };

									dataToProcess._id = lan._id;

									await this.myIob?.createOrUpdateDevice(idLan, `${lan.name}${lan.vlan ? ` (${lan.vlan})` : ''}`, { onlineId: `${tree.lan.idChannel}.${lan._id}.enabled`, icon: lan.vpn_type ? base64[lan.vpn_type] : undefined, updateObject: isAdapterStart, logChanges: true });
									await this.myIob?.createOrUpdateStates(idLan, tree.lan.get(), dataToProcess, lan, { blacklistFilter: this.config.lanStatesBlackList, isWhiteList: this.config.lanStatesIsWhiteList, logDeviceName: lan.name, updateObject: isAdapterStart });
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++
									if (await this.objectExists(idLan)) {
										await this.delObjectAsync(idLan, { recursive: true });
										this.log.info(`${logPrefix} LAN '${lan.name}' (id: ${lan._id}) delete, ${this.config.lanIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} LAN's (LAN's: ${countLan}, blacklisted: ${countBlacklisted}, states ${!this.config.lanStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.lanStatesBlackList.length})`);
						}
					}
				} else {
					if (await this.objectExists(tree.lan.idChannel)) {
						await this.delObjectAsync(tree.lan.idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${tree.lan.idChannel}' deleted`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateLanConnectedClients(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateLanConnectedClients]:';

		try {
			if (this.config.lanConfigEnabled) {
				if (isAdapterStart) {
					const obj: ConnectedClients = { connected_clients: 0, connected_guests: 0, name: 'lan' };
					await this.myIob?.createOrUpdateStates(tree.lan.idChannel, tree.lan.getGlobal(), obj, obj, { isWhiteList: false, logDeviceName: obj.name, updateObject: true });
				}

				let sumClients = 0;
				let sumGuests = 0;
				const connectedByLan = this.countConnectedClientsBy('network_id');

				for (const lan_id in this.cache.lan) {
					const connectedCount = connectedByLan.get(lan_id) ?? 0;
					this.log.silly(`${logPrefix} LAN '${this.cache.lan[lan_id].name}' (id: ${lan_id}) connected ${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}: ${connectedCount}`);

					if (this.cache.lan[lan_id].purpose !== 'guest') {
						sumClients = sumClients + connectedCount;
					} else {
						sumGuests = sumGuests + connectedCount;
					}

					const id = `${tree.lan.idChannel}.${lan_id}.connected_${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}`
					if (await this.objectExists(id)) {
						this.setStateChanged(id, connectedCount, true);
					}
				}

				const idSumClients = `${tree.lan.idChannel}.connected_clients`;
				if (await this.objectExists(idSumClients)) {
					this.setStateChanged(idSumClients, sumClients, true);
				}

				const idSumGuests = `${tree.lan.idChannel}.connected_guests`;
				if (await this.objectExists(idSumGuests)) {
					this.setStateChanged(idSumGuests, sumGuests, true);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateFirewallGroup(data: FirewallGroup[] | null | undefined, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateFirewallGroup]:';

		try {
			if (this.connected && this.isConnected) {
				const idChannel = tree.firewall.group.idChannel;

				if (this.config.firewallGroupConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob?.createOrUpdateChannel(idChannel, 'firewall group', undefined, true);
						data = await this.ufn?.getFirewallGroup();
					}

					if (data && data !== null) {
						let countFirewallGroup = 0;
						let countBlacklisted = 0;

						for (const firewallGroup of data) {

							const idFirewallGroup = `${idChannel}.${firewallGroup._id}`;

							if (this.isProcessedByFilter(this.config.firewallGroupIsWhiteList, this.config.firewallGroupBlackList, { id: firewallGroup._id })) {
								if (isAdapterStart) {
									countFirewallGroup++
								}

								if (!this.cache.firewall.groups[firewallGroup._id]) {
									this.log.debug(`${logPrefix} Discovered Firewall Group '${firewallGroup.name}'`);
								}

								let dataToProcess = firewallGroup;
								if (this.cache.firewall.groups[firewallGroup._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob?.deepDiffBetweenObjects(firewallGroup, this.cache.firewall.groups[firewallGroup._id], this, tree.firewall.group.getKeys()) as FirewallGroup;
								}

								if (!_.isEmpty(dataToProcess)) {
									this.cache.firewall.groups[firewallGroup._id] = { ...this.cache.firewall.groups[firewallGroup._id], ...firewallGroup };
									dataToProcess._id = firewallGroup._id;

									await this.myIob?.createOrUpdateDevice(idFirewallGroup, `${firewallGroup.name}`, { onlineId: `${idChannel}.${firewallGroup._id}.enabled`, updateObject: isAdapterStart, logChanges: true });
									await this.myIob?.createOrUpdateStates(idFirewallGroup, tree.firewall.group.get(), dataToProcess, firewallGroup, { blacklistFilter: this.config.firewallGroupStatesBlackList, isWhiteList: this.config.firewallGroupStatesIsWhiteList, logDeviceName: firewallGroup.name, updateObject: isAdapterStart });
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++
									if (await this.objectExists(idFirewallGroup)) {
										await this.delObjectAsync(idFirewallGroup, { recursive: true });
										this.log.info(`${logPrefix} Firewall Group '${firewallGroup.name}' (id: ${firewallGroup._id}) delete, ${this.config.firewallGroupIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} Firewall Group's (Firewall Group's: ${countFirewallGroup}, blacklisted: ${countBlacklisted}, states ${!this.config.firewallGroupStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.firewallGroupStatesBlackList.length})`);
						}
					}
				} else {
					if (await this.objectExists(idChannel)) {
						await this.delObjectAsync(idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${idChannel}' deleted`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async updateSysInfo(data: NetworkSysInfo | null | undefined, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateSysInfo]:';

		try {
			if (this.connected && this.isConnected) {

				if (this.config.systemInformationEnabled) {
					if (isAdapterStart) {
						await this.myIob?.createOrUpdateChannel(tree.sysInfo.idChannel, undefined, undefined, true);
					}

					if (data && data !== null) {
						await this.myIob?.createOrUpdateStates(tree.sysInfo.idChannel, tree.sysInfo.get(), data, data, { logDeviceName: 'sysInfo', updateObject: isAdapterStart });

						if (isAdapterStart) {
							this.log.info(`${logPrefix} System Information updated`);
						} else {
							this.log.silly(`${logPrefix} System Information updated`);
						}
					}
				} else {
					if (await this.objectExists(tree.sysInfo.idChannel)) {
						for (const key of Object.keys(tree.sysInfo.get())) {
							const id = `${tree.sysInfo.idChannel}.${(tree.sysInfo.get()[key] as myTreeState)?.id || key}`;
							await this.delObjectAsync(id);
							this.log.debug(`${logPrefix} '${id}' deleted`);
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * @deprecated Download public data from ui with image url infos.
	 */
	private async updateDevicesImages(): Promise<void> {
		const logPrefix = '[updateDevicesImages]:';

		try {
			if (this.config.deviceImageDownload) {

				//@ts-ignore
				await this.setObjectNotExistsAsync(`${tree.device.idChannel}.publicData`, {
					type: 'state',
					common: {
						type: 'json',
						name: 'ui public json data',
						expert: true,
						read: true,
						write: false,
						role: 'state'
					},
					native: {}
				});

				const url = 'https://static.ui.com/fingerprint/ui/public.json'
				const response = await request(url);

				if (response && response.statusCode === 200) {
					const data: any = await response.body.json();

					if (data && data.devices) {
						await this.setStateChangedAsync(`${tree.device.idChannel}.publicData`, JSON.stringify(data), true);
					}
				} else {
					if (response) {
						this.log.error(`${logPrefix} API endpoint access error: ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`);
					} else {
						this.log.error(`${logPrefix} API endpoint access error: response is ${JSON.stringify(response)}`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Download image from a given url and update Channel icon if needed
	 * 
	 * @param url 
	 * @param idChannelList 
	 */
	private async downloadImage(url: string | null, idChannelList: string[]): Promise<void> {
		const logPrefix = '[downloadImage]:';

		try {
			let base64ImgString = undefined;		// ToDo: nicht sauber gelöst!

			if (url !== null) {

				const response = await request(url);

				if (response && response.statusCode === 200) {
					const contentType = String(response.headers['content-type'] ?? '');
					const mimeType = /^image\/[\w.+-]+/i.exec(contentType)?.[0];

					if (mimeType) {
						const imageBuffer = Buffer.from(await response.body.arrayBuffer());
						const imageBase64 = imageBuffer.toString('base64');
						base64ImgString = `data:${mimeType};base64,${imageBase64}`;

						this.log.debug(`${logPrefix} image download successful -> update states: ${JSON.stringify(idChannelList)}`);
					} else {
						await response.body.dump();
						this.log.error(`${logPrefix} unexpected content-type "${contentType}" for url: ${url}`);
					}
				} else {
					if (response) {
						this.log.error(`${logPrefix} API endpoint access error: ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`);
					} else {
						this.log.error(`${logPrefix} API endpoint access error: response is ${JSON.stringify(response)}`);
					}
				}
			}

			if (base64ImgString) {
				for (const idChannel of idChannelList) {

					if (await this.objectExists(`${idChannel}.image`)) {
						await this.setStateChangedAsync(`${idChannel}.image`, base64ImgString, true);
					}

					if (await this.objectExists(`${idChannel}`)) {
						await this.myIob?.createOrUpdateDevice(idChannel, undefined, { onlineId: `${idChannel}.isOnline`, icon: base64ImgString, updateObject: true, logChanges: false });
					}
				}
			}
		} catch (error: any) {
			const mac = this.myIob?.getIdLastPart(idChannelList[0]);

			this.log.error(`${logPrefix} [mac: ${mac}, url: ${url}]: ${error}, stack: ${error.stack}`);
		}
	}

	public async checkImageDownload(idImageUrl: string, url: string): Promise<void> {
		const logPrefix = '[checkImageDownload]:';

		try {
			const idChannel = this.myIob?.getIdWithoutLastPart(idImageUrl);

			if (idChannel) {
				if (url) {
					if (await this.objectExists(idImageUrl)) {
						const state = await this.getStateAsync(idImageUrl);
						const image = await this.getStateAsync(`${idChannel}.image`);

						if ((state && state.val !== url) || image === null || (image && image.val === null)) {
							await this.downloadImage(url, [idChannel]);
						}
					} else {
						if (await this.objectExists(`${idChannel}.image`)) {
							await this.downloadImage(url, [idChannel]);
						}
					}
				} else {
					if (await this.objectExists(`${idChannel}.image`)) {
						await this.setState(`${idChannel}.image`, null, true);
						await this.myIob?.createOrUpdateDevice(idChannel, undefined, { onlineId: `${idChannel}.isOnline`, updateObject: true, logChanges: false });
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region WS Listener

	/**
	 * Websocket pong received, sets the aliveTimestamp to the current timestamp
	 */
	private async onPongMessage(): Promise<void> {
		const logPrefix = '[onPongMessage]:';

		try {
			this.aliveTimestamp = dayjs().valueOf();
			this.log.silly('ping pong');

			await this.setState('info.lastRealTimeData', { val: this.aliveTimestamp, lc: this.aliveTimestamp }, true);
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkMessage(event: NetworkEventDevice | NetworkEventClient | NetworkEvent | NetworkEventSpeedTest | NetworkEventFirewallGroup): Promise<void> {
		const logPrefix = '[onNetworkMessage]:';

		try {
			this.aliveTimestamp = dayjs().valueOf();

			if (event.meta.message === WebSocketEventMessages.device) {
				await this.updateDevices(event.data as NetworkDevice[]);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.client)) {
				if (event.meta.message.endsWith(':sync')) {
					await this.updateClients(event.data as myNetworkClient[]);
				} else {
					await this.onNetworkClientEvent(event as NetworkEventClient);
				}
			} else if (event.meta.message === WebSocketEventMessages.events) {
				await this.onNetworkEvent(event as NetworkEvent);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.user)) {
				await this.onNetworkUserEvent(event as NetworkEventClient);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.wlanConf)) {
				await this.onNetworkWlanConfEvent(event as NetworkEventWlanConfig);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.lanConf)) {
				await this.onNetworkLanConfEvent(event as NetworkEventLanConfig);
			} else if (event.meta.message === WebSocketEventMessages.speedTest) {
				await this.onNetworkSpeedTestEvent(event as NetworkEventSpeedTest);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.firewallGroup)) {
				await this.onNetworkFirewallGroupEvent(event as NetworkEventFirewallGroup);
			} else if (event.meta.message.startsWith(WebSocketEventMessages.vpnUsers)) {
				// await this.onNetworkVpnUsersEvent(event as NetworkEventClient);
				await this.updateVpnClients(event.data as myNetworkClient[]);
			} else {
				if (!this.eventsToIgnore.includes(event.meta.message)) {
					this.log.warn(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! version: ${this.controllerVersion}, data: ${JSON.stringify(event.data)}`);
				}
			}

			await this.setState('info.lastRealTimeData', { val: this.aliveTimestamp, lc: this.aliveTimestamp }, true);

		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkEvent(event: NetworkEvent): Promise<void> {
		const logPrefix = '[onNetworkEvent]:';

		try {
			if (event && event.data) {
				for (const myEvent of event.data) {
					if (WebSocketEvent.client.Connected.includes(myEvent.key) || WebSocketEvent.client.Disconnected.includes(myEvent.key)) {
						// Client connect or disconnect
						this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.client.connected(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.Roamed.includes(myEvent.key)) {
						// Client roamed between AP's
						this.log.debug(`${logPrefix} event 'roamed' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.client.roamed(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.RoamedRadio.includes(myEvent.key)) {
						// Client roamed radio -> change channel
						this.log.debug(`${logPrefix} event 'roamed radio' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.client.roamedRadio(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.Blocked.includes(myEvent.key) || WebSocketEvent.client.Unblocked.includes(myEvent.key)) {
						// Client blocked or unblocked
						this.log.debug(`${logPrefix} event 'block / unblock' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.client.block(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.device.Restarted.includes(myEvent.key)) {
						// Device connect or disconnect
						this.log.debug(`${logPrefix} event 'restarted' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.device.restarted(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.device.Connected.includes(myEvent.key) || WebSocketEvent.device.Disconnected.includes(myEvent.key)) {
						// Device restarted
						this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.device.connected(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.device.LostContact.includes(myEvent.key)) {
						// Device lost contact
						this.log.debug(`${logPrefix} event 'lost contact' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.device.lostContact(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.device.WANTransition.includes(myEvent.key)) {
						// WAN ISP Connection changed
						this.log.debug(`${logPrefix} event 'wan transition' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.device.wanTransition(event.meta, myEvent, this, this.cache);
					} else if (WebSocketEvent.device.Deleted.includes(myEvent.key)) {
						// Device deleted
						this.log.debug(`${logPrefix} event 'device deleted' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						await eventHandler.device.deleted(event.meta, myEvent, this, this.cache);

					} else {
						const deviceEvent = Object.entries(WebSocketEvent.device).find(([key, arr]) => arr.includes(myEvent.key));
						const clientEvent = Object.entries(WebSocketEvent.client).find(([key, arr]) => arr.includes(myEvent.key));

						if (deviceEvent) {
							this.log.debug(`${logPrefix} device event '${deviceEvent[0]}' not implemented (key: ${myEvent.key}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						} else if (clientEvent) {
							this.log.debug(`${logPrefix} client event '${clientEvent[0]}' not implemented (key: ${myEvent.key}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						} else {
							this.log.warn(`${logPrefix} not implemented event (${myEvent.key ? `key: ${myEvent.key}` : ''}) - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkClientEvent(events: NetworkEventClient): Promise<void> {
		const logPrefix = '[onNetworkClientEvent]:';

		try {
			if (events.meta.message.endsWith(':disconnected')) {
				for (const event of events.data) {
					if (event.type === 'VPN') {
						// ToDo: VPN disconnect (deprecated since 10.4.57)
						this.log.debug(`${logPrefix} event 'vpn disconnected' (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);

						await eventHandler.client.vpnDisconnect(events.meta, event as myNetworkClient, this, this.cache);
					} else {
						this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);
					}
				}
			} else {
				this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(events.data)})`);
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkUserEvent(events: NetworkEventClient): Promise<void> {
		const logPrefix = '[onNetworkUserEvent]:';

		try {
			if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
				if (events && events.data) {
					for (const event of events.data) {
						this.log.debug(`${logPrefix} client event (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);

						if (events.meta.message === 'user:delete') {
							// client removed client from unifi-controller
							await eventHandler.user.clientRemoved(events.meta, event, this, this.cache);
						} else if (events.meta.message === 'user:sync') {
							// client updated
							const name = event.unifi_device_info_from_ucore?.name || event.display_name || event.name || event.hostname;
							const idChannel = !event.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests;

							const cachedClient = this.cache.clients[event.mac];
							// without a cache entry keep the event's own last_seen instead of setting it to undefined
							if (cachedClient) {
								event.last_seen = event.last_seen >= cachedClient.last_seen ? event.last_seen : cachedClient.last_seen;
							}

							if (this.isProcessedByFilter(this.config.clientIsWhiteList, this.config.clientBlackList, { mac: event.mac })) {
								this.log.debug(`${logPrefix} update ${!event.is_guest ? 'client' : 'guest'} '${cachedClient?.name}'`);

								await this.myIob?.createOrUpdateDevice(`${idChannel}.${event.mac}`, name, { onlineId: `${idChannel}.${event.mac}.isOnline`, updateObject: true });
								await this.myIob?.createOrUpdateStates(`${idChannel}.${event.mac}`, tree.client.get(), event, cachedClient ?? event, { blacklistFilter: this.config.clientStatesBlackList, isWhiteList: this.config.clientStatesIsWhiteList, logDeviceName: cachedClient ? cachedClient.name : name, updateObject: true });
							}
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkWlanConfEvent(event: NetworkEventWlanConfig): Promise<void> {
		const logPrefix = '[onNetworkWlanConfEvent]:';

		try {
			if (this.config.wlanConfigEnabled) {
				this.log.debug(`${logPrefix} wlan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					await eventHandler.wlanConf.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateWlanConfig(event.data);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkLanConfEvent(event: NetworkEventLanConfig): Promise<void> {
		const logPrefix = '[onNetworkLanConfEvent]:';

		try {
			if (this.config.lanConfigEnabled) {
				this.log.silly(`${logPrefix} lan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					await eventHandler.lanConf.deleted(event.meta, event.data, this, this.cache);
				} else {
					if (event.data.length > 0) {
						// seperate events for lan's and vpn
						const noVPN = event.data.filter(lan => !lan.purpose?.includes('vpn'));
						await this.updateLanConfig(noVPN);

						// ToDo: Handling of Gateway VPN Client Connection
						const vpnLans = event.data.filter(lan => lan.purpose?.includes('vpn'));
						this.log.debug(`${logPrefix} VPN conf are not yet supported! (version: ${this.controllerVersion}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(vpnLans)})`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkFirewallGroupEvent(event: NetworkEventFirewallGroup): Promise<void> {
		const logPrefix = '[onNetworkFirewallGroupEvent]:';

		try {
			if (this.config.firewallGroupConfigEnabled) {
				this.log.debug(`${logPrefix} firewall group event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					await eventHandler.firewall.group.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateFirewallGroup(event.data);
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async onNetworkSpeedTestEvent(event: NetworkEventSpeedTest): Promise<void> {
		// errors are logged by eventHandler.device.speedTest, onNetworkMessage catches anything else
		if (this.config.devicesEnabled) {
			await eventHandler.device.speedTest(event, this, this.cache);
		}
	}

	//#endregion
}

// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');

if (process.argv[1] === modulePath) {
	// start the instance directly
	new UnifiNetwork();
}

export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): UnifiNetwork {
	// compact mode
	return new UnifiNetwork(options);
}