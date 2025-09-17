/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
import { request } from "undici";
import { STATUS_CODES } from 'node:http';
import _ from 'lodash';
import url from 'node:url';

// API imports
import { NetworkApi } from './lib/api/network-api.js';
import type { NetworkEvent, NetworkEventClient, NetworkEventDevice, NetworkEventFirewallGroup, NetworkEventLanConfig, NetworkEventSpeedTest, NetworkEventWlanConfig } from './lib/api/network-types.js';
import type { NetworkDevice } from './lib/api/network-types-device.js';
import type { NetworkDeviceModels } from './lib/api/network-types-device-models.js';
import type { NetworkWlanConfig, NetworkWlanConfig_V2 } from './lib/api/network-types-wlan-config.js';
import type { NetworkLanConfig, NetworkLanConfig_V2 } from './lib/api/network-types-lan-config.js';
import type { FirewallGroup } from './lib/api/network-types-firewall-group.js';

// Adapter imports
import { type ConnectedClients, WebSocketEvent, WebSocketEventMessages, type myCache, type myImgCache, type myNetworkClient } from './lib/myTypes.js';
import { eventHandler } from './lib/eventHandler.js';
import * as tree from './lib/tree/index.js'
import { base64 } from './lib/base64.js';
import { messageHandler } from './lib/messageHandler.js';
import { myIob } from './lib/myIob.js';

class UnifiNetwork extends utils.Adapter {
	ufn: NetworkApi = undefined;
	myIob: myIob;

	isConnected: boolean = false;

	aliveTimeout: ioBroker.Timeout | undefined = undefined;
	pingTimeout: ioBroker.Timeout | undefined = undefined;
	aliveTimestamp: number = moment().valueOf();

	imageUpdateTimeout: ioBroker.Timeout

	connectionRetries: number = 0;

	cache: myCache = {
		devices: {},
		deviceModels: [],
		clients: {},
		vpn: {},
		wlan: {},
		lan: {},
		isOnline: {},
		firewallGroup: {}
	}

	subscribedList: string[] = [];

	eventListener = async (event: NetworkEvent): Promise<void> => {
		await this.onNetworkMessage(event);
	};
	pongListener = (): void => {
		this.onPongMessage();
	};

	eventsToIgnore = [
		'device:update',
		'unifi-device:sync',
		'session-metadata:sync'
	]

	statesUsingValAsLastChanged = [          // id of states where lc is taken from the value
		'last_seen',
		'first_seen',
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

	//#region adapter methods

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		const logPrefix = '[onReady]:';

		try {
			moment.locale(this.language);

			await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

			this.myIob = new myIob(this, utils, this.statesUsingValAsLastChanged);

			if (this.config.host, this.config.user, this.config.password) {
				this.ufn = new NetworkApi(this.config.host, this.config.port, this.config.isUnifiOs, this.config.site, this.config.user, this.config.password, this);

				await this.establishConnection();

				this.ufn.on('message', this.eventListener);
				this.ufn.on('pong', this.pongListener);
				this.log.info(`${logPrefix} WebSocket listener to realtime API successfully started`);
			} else {
				this.log.warn(`${logPrefix} no login credentials in adapter config set!`);
			}

			this.myIob.findMissingTranslation();

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
			this.removeListener('message', this.eventListener);
			this.removeListener('pong', this.pongListener);

			this.clearTimeout(this.aliveTimeout);
			this.clearTimeout(this.pingTimeout);

			this.clearTimeout(this.imageUpdateTimeout);

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
					if (this.myIob.getIdLastPart(id) === 'imageUrl') {
						if (this.config.clientImageDownload && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`))) {
							await this.downloadImage(state.val as string, [this.myIob.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update client image`);
						} else if (this.config.deviceImageDownload && id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
							await this.downloadImage(state.val as string, [this.myIob.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update device image`);
						}
					} else if (this.myIob.getIdLastPart(id) === 'isOnline' && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelVpn}.`))) {
						const macOrIp = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id)).replaceAll('_', '.');

						if (state.val !== this.cache.isOnline[macOrIp].val) {
							const old = {
								wlan_id: this.cache.isOnline[macOrIp].wlan_id,
								network_id: this.cache.isOnline[macOrIp].network_id,
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
					const mac = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));

					if (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`)) {
						// Client state changed
						if (this.myIob.getIdLastPart(id) === 'blocked') {
							if (state.val) {
								await this.ufn.Commands.Clients.block(this.cache.clients[mac]);

							} else {
								await this.ufn.Commands.Clients.unblock(this.cache.clients[mac]);
							}

						} else if (this.myIob.getIdLastPart(id) === 'reconnect') {
							await this.ufn.Commands.Clients.reconnect(this.cache.clients[mac], id);

							// } else if (this.myIob.getIdLastPart(id) === 'authorized') {
							// 	let res = undefined;

							// 	if (state.val === true) {
							// 		res = await apiCommands.clients.authorizeGuest(this.ufn, mac);
							// 	} else {
							// 		res = await apiCommands.clients.unauthorizeGuest(this.ufn, mac);
							// 	}

							// 	if (res) this.log.info(`${logPrefix} command sent: ${state.val ? 'authorize' : 'unauthorize'} guest - '${this.cache.clients[mac].name}' (mac: ${mac})`);
						} else if (this.myIob.getIdLastPart(id) === 'name') {
							await this.ufn.Commands.Clients.setName(this.cache.clients[mac], state.val as string);

						} else {
							this.log.debug(`${logPrefix} client state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
						}
					} else if (id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
						// Device state changed
						if (this.myIob.getIdLastPart(id) === 'restart') {
							await this.ufn.Commands.Devices.restart(this.cache.devices[mac], id);

						} else if (id.includes('.port_')) {
							if (this.myIob.getIdLastPart(id) === 'poe_cycle') {
								const mac = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(this.myIob.getIdWithoutLastPart(this.myIob.getIdWithoutLastPart(id))));

								await this.ufn.Commands.Devices.Port.cyclePoePower(this.cache.devices[mac], id);

							} else if (this.myIob.getIdLastPart(id) === 'poe_enable') {
								const mac = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(this.myIob.getIdWithoutLastPart(this.myIob.getIdWithoutLastPart(id))));

								await this.ufn.Commands.Devices.Port.switchPoe(this.cache.devices[mac], id, state.val as boolean);

							}
						} else if (this.myIob.getIdLastPart(id) === 'led_override') {
							await this.ufn.Commands.Devices.ledOverride(this.cache.devices[mac], id, state.val as string);

						} else if (this.myIob.getIdLastPart(id) === 'upgrade') {
							await this.ufn.Commands.Devices.upgrade(this.cache.devices[mac], id);

						} else if (id.includes('wan')) {
							if (this.myIob.getIdLastPart(id) === 'speedtest_run') {
								const mac = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(this.myIob.getIdWithoutLastPart(id)));

								await this.ufn.Commands.Devices.runSpeedtest(this.cache.devices[mac], id);
							}
						} else if (this.myIob.getIdLastPart(id) === 'disabled') {
							await this.ufn.Commands.Devices.disableAccessPoint(this.cache.devices[mac], id, state.val as boolean);

						} else {
							this.log.debug(`${logPrefix} device state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
						}
					} else if (id.startsWith(`${this.namespace}.${tree.wlan.idChannel}.`)) {
						if (this.myIob.getIdLastPart(id) === 'enabled') {
							const wlan_id = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));

							await this.ufn.Commands.WLanConf.enable(this.cache.wlan[wlan_id], state.val as boolean);
						}
					} else if (id.startsWith(`${this.namespace}.${tree.lan.idChannel}.`)) {
						if (this.myIob.getIdLastPart(id) === 'enabled') {
							const lan_id = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));

							await this.ufn.Commands.LanConf.enable(this.cache.lan[lan_id], state.val as boolean);

						} else if (this.myIob.getIdLastPart(id) === 'internet_enabled') {
							const lan_id = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));

							await this.ufn.Commands.LanConf.internet_access_enabled(this.cache.lan[lan_id], state.val as boolean);

						}
					} else if (id.startsWith(`${this.namespace}.${tree.firewallGroup.idChannel}.`)) {
						const groupId = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));

						if (this.myIob.getIdLastPart(id) === 'name') {
							await this.ufn.Commands.FirewallGroup.setName(this.cache.firewallGroup[groupId], state.val as string);

						} else if (this.myIob.getIdLastPart(id) === 'group_members') {
							await this.ufn.Commands.FirewallGroup.setGroupMembers(this.cache.firewallGroup[groupId], state.val as string);

						}
					}
				} else {
					// The state was changed
					// this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				}
			} else {
				// The state was deleted
				this.log.info(`state ${id} deleted`);
			}

		} catch (error) {
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
				if (obj.command === 'deviceList') {
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
					await messageHandler.firewallGroup.list(obj, this, this.ufn);
				} else if (obj.command === 'firewallGroupStateList') {
					messageHandler.firewallGroup.stateList(obj, this, this.ufn);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region Establish Connection

	/**
	 * Establish Connection to NVR and starting the alive checker
	 */
	async establishConnection(): Promise<void> {
		const logPrefix = '[establishConnection]:';

		try {

			if (this.pingTimeout) {
				this.clearTimeout(this.pingTimeout)
				this.pingTimeout = null;
			}

			if (await this.login()) {
				await this.updateRealTimeApiData();
				await this.updateIsOnlineState(true);

				this.updateApiData();

				this.pingTimeout = this.setTimeout(() => {
					this.sendPing();
				}, ((this.config.expertAliveInterval || 30) / 2) * 1000);
			} else {
				await this.setConnectionStatus(false);
			}

			// start the alive checker
			if (this.aliveTimeout) {
				this.clearTimeout(this.aliveTimeout);
				this.aliveTimeout = null;
			}

			this.aliveTimeout = this.setTimeout(async () => {
				await this.aliveChecker();
			}, (this.config.expertAliveInterval || 30) * 1000);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/** 
	 * Login into NVR and load bootstrap data
	 *
	 * @returns Connection status
	 */
	async login(): Promise<boolean> {
		const logPrefix = '[login]:';

		try {
			if (this.ufn) {
				const loginSuccessful = await this.ufn.login();

				if (loginSuccessful) {
					this.log.info(`${logPrefix} Logged in successfully to the Unifi-Network controller (host: ${this.config.host}:${this.config.port}, site: ${this.config.site}, isUnifiOs: ${this.config.isUnifiOs})`);

					if (await this.ufn.launchEventsWs()) {
						this.log.info(`${logPrefix} WebSocket connection to realtime API successfully established`);

						await this.setConnectionStatus(true);
						return true;
					} else {
						this.log.error(`${logPrefix} unable to start ws listener`);
					}
				} else {
					this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.config.host}${this.config.isUnifiOs ? '' : `:${this.config.port}`}, site: ${this.config.site})`);
				}
			}
		} catch (error) {
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
				const diff = Math.round((moment().valueOf() - this.aliveTimestamp) / 1000);

				if (diff >= (this.config.expertAliveInterval || 30)) {
					this.log.warn(`${logPrefix} No connection to the Unifi-Network controller -> restart connection (retries: ${this.connectionRetries}, no data since ${diff}s)`);
					this.ufn.logout();

					await this.setConnectionStatus(false);

					if (this.connectionRetries < (this.config.expertConnectionMaxRetries || 200)) {
						this.connectionRetries++;

						await this.establishConnection();
					} else {
						this.log.error(`${logPrefix} Connection to the Unifi-Network controller is down for more then ${(this.config.expertConnectionMaxRetries || 200) * (this.config.expertAliveInterval || 30)}s, stopping the adapter.`);
						await this.stop({ reason: 'too many connection retries' });
					}
					return;
				} else {
					this.log.silly(`${logPrefix} Connection to the Unifi-Network controller is alive (last alive signal is ${diff}s old)`);

					await this.updateIsOnlineState();

					await this.setConnectionStatus(true);
					this.connectionRetries = 0;

					if (this.aliveTimeout) {
						this.clearTimeout(this.aliveTimeout);
						this.aliveTimeout = null;
					}

					this.aliveTimeout = this.setTimeout(async () => {
						await this.aliveChecker();
					}, (this.config.expertAliveInterval || 30) * 1000);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
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
			await this.setState('info.connection', isConnected, true);
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * send websocket ping
	 */
	sendPing(): void {
		const logPrefix = '[sendPing]:';

		try {
			this.ufn.wsSendPing();

			if (this.pingTimeout) {
				this.clearTimeout(this.pingTimeout)
				this.pingTimeout = null;
			}

			this.pingTimeout = this.setTimeout(() => {
				this.sendPing();
			}, ((this.config.expertAliveInterval || 30) / 2) * 1000);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region updateData

	async updateRealTimeApiData(): Promise<void> {
		const logPrefix = '[updateRealTimeApiData]:';

		try {
			this.cache.deviceModels = await this.ufn.getDeviceModels_V2() as NetworkDeviceModels[];

			await this.updateDevices((await this.ufn.getDevices_V2())?.network_devices, true);

			await this.updateClients(null, true);
			await this.updateClients(await this.ufn.getClientsHistory_V2() as myNetworkClient[], true, true);
			// await this.updatClientsOffline(await this.ufn.getClients(), true);

			await this.updateLanConfig(null, true);
			await this.updateLanConnectedClients(true);

			await this.updateWlanConfig(null, true);
			await this.updateWlanConnectedClients(true);

			await this.updateFirewallGroup(null, true);


			// const tmp = tree.lan.getStateIDs();
			// let list = []

			// for (let id of tmp) {
			// 	list.push({ id: id });
			// }

			// this.log.warn(JSON.stringify(list));

			this.imageUpdateTimeout = this.setTimeout(async () => {
				await this.updateImages();
			}, this.config.realTimeApiDebounceTime * 2 * 1000);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	updateApiData(): void {
		const logPrefix = '[updateApiData]:';

		try {
			this.log.silly(`${logPrefix} placeholder`);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateDevices(data: NetworkDevice[] | null = null, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateDevices]:';

		try {
			if (this.connected && this.isConnected) {
				if (this.config.devicesEnabled) {

					if (isAdapterStart) {
						await this.myIob.createOrUpdateChannel(tree.device.idChannel, 'unifi devices', undefined, true);
					}

					if (data && data !== null) {
						let countDevices = 0;
						let countBlacklisted = 0;

						for (const device of data) {
							const idDevice = `${tree.device.idChannel}.${device.mac}`;

							if ((!this.config.deviceIsWhiteList && !_.some(this.config.deviceBlackList, { mac: device.mac })) || (this.config.deviceIsWhiteList && _.some(this.config.deviceBlackList, { mac: device.mac }))) {
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
									if ((lastSeen && moment().diff(lastSeen * 1000, 'seconds') < this.config.realTimeApiDebounceTime) || (iobTimestamp && moment().diff(iobTimestamp * 1000, 'seconds') < this.config.realTimeApiDebounceTime)) {
										continue
									}
								}

								if (!this.cache.devices[device.mac]) {
									this.log.debug(`${logPrefix} Discovered device '${device.name}' (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname})`);
								}

								let dataToProcess = device;
								if (this.cache.devices[device.mac]) {
									// filter out unchanged properties
									dataToProcess = this.myIob.deepDiffBetweenObjects(device, this.cache.devices[device.mac], this, tree.device.getKeys()) as NetworkDevice;
								}

								if (!_.isEmpty(dataToProcess)) {
									this.cache.devices[device.mac] = device;
									this.cache.devices[device.mac].iobTimestamp = moment().unix();

									dataToProcess.mac = device.mac;

									if (!isAdapterStart) {
										this.log.silly(`${logPrefix} device '${device.name}' (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
									}

									await this.myIob.createOrUpdateDevice(idDevice, device.name, `${this.namespace}.${idDevice}.isOnline`, `${this.namespace}.${idDevice}.hasError`, undefined, isAdapterStart, true);
									await this.myIob.createOrUpdateStates(idDevice, tree.device.get(), dataToProcess, device, this.config.deviceStatesBlackList, this.config.deviceStatesIsWhiteList, device.name, isAdapterStart);
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
							this.log.info(`${logPrefix} Discovered ${data.length} devices (devices: ${countDevices}, blacklisted: ${countBlacklisted})`);
						}
					}
				} else {
					if (await this.objectExists(tree.device.idChannel)) {
						await this.delObjectAsync(tree.device.idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${tree.device.idChannel}' deleted`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateClients(data: myNetworkClient[] | null = null, isAdapterStart: boolean = false, isOfflineClients: boolean = false): Promise<void> {
		const logPrefix = '[updateClients]:';

		try {
			if (this.connected && this.isConnected) {
				const idChannel = tree.client.idChannelUsers;
				const idGuestChannel = tree.client.idChannelGuests;
				const idVpnChannel = tree.client.idChannelVpn;

				if (isAdapterStart && !isOfflineClients) {
					if (this.config.clientsEnabled) {
						await this.myIob.createOrUpdateChannel(idChannel, 'users', undefined, true);
					}

					if (this.config.guestsEnabled) {
						await this.myIob.createOrUpdateChannel(idGuestChannel, 'guests', undefined, true);
					}

					if (this.config.vpnEnabled) {
						await this.myIob.createOrUpdateChannel(idVpnChannel, 'vpn users', undefined, true);
					}

					if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
						await this.myIob.createOrUpdateChannel(tree.client.idChannel, 'client devices', undefined, true);
						data = await this.ufn.getClientsActive_V2() as myNetworkClient[];
					} else {
						if (await this.objectExists(tree.client.idChannel)) {
							await this.delObjectAsync(tree.client.idChannel, { recursive: true });
							this.log.info(`${logPrefix} channel clients delete`);
						}
					}
				}

				if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
					if (data && data !== null) {
						let countClients = 0;
						let countGuests = 0;
						let countVpn = 0;
						let countBlacklisted = 0;

						for (const client of data) {
							const name = client.unifi_device_info_from_ucore?.name || client.display_name || client.name || client.hostname;

							if ((!this.config.clientIsWhiteList && !_.some(this.config.clientBlackList, { mac: client.mac })) || (this.config.clientIsWhiteList && _.some(this.config.clientBlackList, { mac: client.mac }))) {
								if (!isAdapterStart && this.config.realTimeApiDebounceTime > 0 && (this.cache.clients[client.mac] || this.cache.clients[client.ip])) {
									// debounce real time data
									const lastSeen = this.cache.clients[client.mac].last_seen || this.cache.clients[client.ip].last_seen;
									const iobTimestamp = this.cache.clients[client.mac].timestamp || this.cache.clients[client.ip].timestamp;

									if ((lastSeen && moment().diff(lastSeen * 1000, 'seconds') < this.config.realTimeApiDebounceTime) || (iobTimestamp && moment().diff(iobTimestamp * 1000, 'seconds') < this.config.realTimeApiDebounceTime)) {
										continue
									}
								}

								const offlineSince = moment().diff((client.last_seen) * 1000, 'days');

								if (this.config.clientsEnabled && client.mac && !client.is_guest) {
									// Clients
									if (this.config.deleteClientsOlderThan === 0 || offlineSince <= this.config.deleteClientsOlderThan) {
										if (isAdapterStart) {
											countClients++
										}

										if (!this.cache.clients[client.mac]) {
											this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} client '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
											this.cache.isOnline[client.mac] = { val: !isOfflineClients }
										}

										let dataToProcess = client;
										if (this.cache.clients[client.mac]) {
											// filter out unchanged properties
											dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys()) as myNetworkClient;
										}

										if (Object.keys(dataToProcess).length > 0) {
											this.cache.clients[client.mac] = client;
											this.cache.clients[client.mac].name = name;
											this.cache.clients[client.mac].timestamp = moment().unix();

											this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
											this.cache.isOnline[client.mac].network_id = client.network_id;

											dataToProcess.mac = client.mac;
											dataToProcess.name = name

											if (!isAdapterStart) {
												this.log.silly(`${logPrefix} client ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
											}

											await this.myIob.createOrUpdateDevice(`${idChannel}.${client.mac}`, name, `${this.namespace}.${idChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart, true);
											await this.myIob.createOrUpdateStates(`${idChannel}.${client.mac}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
										}
									} else {

										if (await this.objectExists(`${idChannel}.${client.mac}`)) {
											await this.delObjectAsync(`${idChannel}.${client.mac}`, { recursive: true });
											this.log.debug(`${logPrefix} client '${name}' deleted, because it's offline since ${offlineSince} days`);
										} else {
											this.log.silly(`${logPrefix} client '${name}' ingored, because it's offline since ${offlineSince} days`);
										}
									}
								} else if (this.config.guestsEnabled && client.mac && client.is_guest) {
									// Guests
									if (this.config.deleteGuestsOlderThan === 0 || offlineSince <= this.config.deleteGuestsOlderThan) {
										if (isAdapterStart) {
											countGuests++
										}

										if (!this.cache.clients[client.mac]) {
											this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} guest '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
											this.cache.isOnline[client.mac] = { val: !isOfflineClients }
										}

										let dataToProcess = client;
										if (this.cache.clients[client.mac]) {
											// filter out unchanged properties
											dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys()) as myNetworkClient;
										}

										if (Object.keys(dataToProcess).length > 0) {
											this.cache.clients[client.mac] = client;
											this.cache.clients[client.mac].name = name;
											this.cache.clients[client.mac].timestamp = moment().unix();

											this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
											this.cache.isOnline[client.mac].network_id = client.network_id;

											dataToProcess.mac = client.mac;
											dataToProcess.name = name

											if (!isAdapterStart) {
												this.log.silly(`${logPrefix} guest ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
											}

											await this.myIob.createOrUpdateDevice(`${idGuestChannel}.${client.mac}`, name, `${this.namespace}.${idGuestChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart, true);
											await this.myIob.createOrUpdateStates(`${idGuestChannel}.${client.mac}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
										}

									} else {

										if (await this.objectExists(`${idGuestChannel}.${client.mac}`)) {
											await this.delObjectAsync(`${idGuestChannel}.${client.mac}`, { recursive: true });
											this.log.info(`${logPrefix} guest '${name}' deleted, because it's offline since ${offlineSince} days`);
										} else {
											this.log.silly(`${logPrefix} guest '${name}' ingored, because it's offline since ${offlineSince} days`);
										}
									}
								} else {
									if (this.config.vpnEnabled && client.type === 'VPN' && client.ip) {
										// VPN Clients
										if (isAdapterStart) {
											countVpn++
										}

										if (!this.cache.vpn[client.ip]) {
											this.log.debug(`${logPrefix} Discovered vpn client '${name}' (IP: ${client.ip}, remote_ip: ${client.remote_ip})`);
											this.cache.isOnline[client.ip] = { val: !isOfflineClients }
										}

										const idChannel = client.network_id;
										await this.myIob.createOrUpdateChannel(`${idVpnChannel}.${idChannel}`, client.network_name || '', base64[client.vpn_type] || undefined);

										let dataToProcess = client;
										if (this.cache.vpn[client.ip]) {
											// filter out unchanged properties
											dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.vpn[client.ip], this, tree.client.getKeys()) as myNetworkClient;
										}

										const preparedIp = client.ip.replaceAll('.', '_');

										if (Object.keys(dataToProcess).length > 0) {
											this.cache.vpn[client.ip] = client;
											this.cache.vpn[client.ip].name = name;
											this.cache.vpn[client.ip].timestamp = moment().unix();

											this.cache.isOnline[client.ip].wlan_id = client.wlanconf_id;
											this.cache.isOnline[client.ip].network_id = client.network_id;

											dataToProcess.ip = client.ip;
											dataToProcess.name = name

											if (!isAdapterStart) {
												this.log.silly(`${logPrefix} vpn ${dataToProcess.name} (ip: ${dataToProcess.ip}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
											}

											await this.myIob.createOrUpdateDevice(`${idVpnChannel}.${idChannel}.${preparedIp}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, `${this.namespace}.${idVpnChannel}.${idChannel}.${preparedIp}.isOnline`, undefined, undefined, isAdapterStart, true);
											await this.myIob.createOrUpdateStates(`${idVpnChannel}.${idChannel}.${preparedIp}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
										}
									}
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++;

									const id = `${!client.is_guest ? idChannel : idGuestChannel}.${client.mac}`
									if (await this.objectExists(id)) {
										await this.delObjectAsync(id, { recursive: true });
										this.log.info(`${logPrefix} device '${name}' (mac: ${client.mac}) delete, ${this.config.clientIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} ${!isOfflineClients ? 'connected' : 'disconnected'} clients (clients: ${countClients}, guests: ${countGuests}, vpn: ${countVpn}, blacklisted: ${countBlacklisted})`);
						}
					}
				}

				if (!this.config.clientsEnabled && await this.objectExists(idChannel)) {
					await this.delObjectAsync(idChannel, { recursive: true });
					this.log.debug(`${logPrefix} channel '${idChannel}' deleted`);
				}

				if (!this.config.guestsEnabled && await this.objectExists(idGuestChannel)) {
					await this.delObjectAsync(idGuestChannel, { recursive: true });
					this.log.debug(`${logPrefix} channel '${idGuestChannel}' deleted`);
				}

				if (!this.config.vpnEnabled && await this.objectExists(idVpnChannel)) {
					await this.delObjectAsync(idVpnChannel, { recursive: true });
					this.log.debug(`${logPrefix} channel '${idVpnChannel}' deleted`);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updatClientsOffline(data: myNetworkClient[], isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updatClientsOffline]:';

		try {
			if (data) {
				const result: myNetworkClient[] = [];
				for (const client of data) {
					if (!this.cache.clients[client.mac] && !this.cache.clients[client.ip]) {
						result.push(client);
					}
				}

				await this.updateClients(result, isAdapterStart, true);
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateIsOnlineState(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateIsOnlineState]:';

		try {
			//ToDo: vpn and perhaps device to include
			const clients = await this.getStatesAsync(`${tree.client.idChannelUsers}.*.last_seen`);
			await this._updateIsOnlineState(clients, this.config.clientOfflineTimeout, 'client', isAdapterStart);

			const guests = await this.getStatesAsync(`${tree.client.idChannelGuests}.*.last_seen`);
			await this._updateIsOnlineState(guests, this.config.clientOfflineTimeout, 'guest', isAdapterStart);

			const vpn = await this.getStatesAsync(`${tree.client.idChannelVpn}.*.last_seen`);
			await this._updateIsOnlineState(vpn, this.config.vpnOfflineTimeout, 'vpn', isAdapterStart);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async _updateIsOnlineState(clients: Record<string, ioBroker.State>, offlineTimeout: number, typeOfClient: string, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[_updateIsOnlineState]:';

		try {
			for (const id in clients) {

				const lastSeen = clients[id];
				const isOnline = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.isOnline`);
				const mac = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.mac`);
				const ip = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.ip`);

				const client = typeOfClient !== 'vpn' ? this.cache.clients[mac.val as string] : this.cache.vpn[ip.val as string];

				const t = moment(isOnline.lc);
				const before = moment(lastSeen.val as number * 1000);
				const now = moment();

				if (!t.isBetween(before, now) || t.diff(before, 'seconds') <= 2) {
					// isOnline not changed between now an last reported last_seen val
					const diff = now.diff(before, 'seconds');
					await this.setState(`${this.myIob.getIdWithoutLastPart(id)}.isOnline`, diff <= offlineTimeout, true);

					if (!isAdapterStart && diff > offlineTimeout && (isOnline.val !== diff <= offlineTimeout)) {
						this.log.info(`${logPrefix} fallback detection - ${typeOfClient} '${client?.name}' (mac: ${client?.mac}, ip: ${client?.ip}) is offline, last_seen '${before.format('DD.MM. - HH:mm')}h' not updated since ${diff}s`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateWlanConfig(data: NetworkWlanConfig[] | NetworkWlanConfig_V2[], isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateWlanConfig]:';

		try {
			if (this.connected && this.isConnected) {
				const idChannel = tree.wlan.idChannel;

				if (this.config.wlanConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob.createOrUpdateChannel(idChannel, 'wlan', undefined, true);
						data = await this.ufn.getWlanConfig_V2();
					}

					if (data && data !== null) {
						let countWlan = 0;
						let countBlacklisted = 0;

						for (let wlan of data) {
							// Convert API V2 to V1, because event is from type V1
							if ((wlan as NetworkWlanConfig_V2) && (wlan as NetworkWlanConfig_V2).configuration) {
								wlan = { ...(wlan as NetworkWlanConfig_V2).configuration, ...(wlan as NetworkWlanConfig_V2).details, ...(wlan as NetworkWlanConfig_V2).statistics }
							}

							wlan = (wlan as NetworkWlanConfig);

							const idWlan = `${idChannel}.${wlan._id}`;

							if ((!this.config.wlanIsWhiteList && !_.some(this.config.wlanBlackList, { id: wlan._id })) || (this.config.wlanIsWhiteList && _.some(this.config.wlanBlackList, { id: wlan._id }))) {
								if (isAdapterStart) {
									countWlan++
								}

								if (!this.cache.wlan[wlan._id]) {
									this.log.debug(`${logPrefix} Discovered WLAN '${wlan.name}'`);
								}

								let dataToProcess = wlan;
								if (this.cache.wlan[wlan._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob.deepDiffBetweenObjects(wlan, this.cache.wlan[wlan._id], this, tree.wlan.getKeys()) as NetworkWlanConfig;
								}

								this.cache.wlan[wlan._id] = wlan;

								if (!_.isEmpty(dataToProcess)) {
									dataToProcess._id = wlan._id;

									await this.myIob.createOrUpdateDevice(idWlan, wlan.name, `${this.namespace}.${idChannel}.${wlan._id}.enabled`, undefined, undefined, isAdapterStart, true);
									await this.myIob.createOrUpdateStates(idWlan, tree.wlan.get(), dataToProcess, wlan, this.config.wlanStatesBlackList, this.config.wlanStatesIsWhiteList, wlan.name, isAdapterStart);
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
							this.log.info(`${logPrefix} Discovered ${data.length} WLAN's (WLAN's: ${countWlan}, blacklisted: ${countBlacklisted})`);
						}
					}
				} else {
					if (await this.objectExists(idChannel)) {
						await this.delObjectAsync(idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${idChannel}' deleted`);
					}
				}
			}

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateWlanConnectedClients(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateWlanConnectedClients]:';

		try {
			if (this.config.wlanConfigEnabled) {
				if (isAdapterStart) {
					const obj: ConnectedClients = { connected_clients: 0, connected_guests: 0, name: 'wlan' };
					await this.myIob.createOrUpdateStates('wlan', tree.wlan.getGlobal(), obj, obj, undefined, false, obj.name, true);
				}

				let sumClients = 0;
				let sumGuests = 0;

				for (const wlan_id in this.cache.wlan) {
					const connectedClients = _.filter(this.cache.isOnline, (x) => x.val === true && x.wlan_id === wlan_id);
					this.log.silly(`${logPrefix} WLAN '${this.cache.wlan[wlan_id].name}' (id: ${wlan_id}) connected ${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}: ${connectedClients.length}`);

					if (!this.cache.wlan[wlan_id].is_guest) {
						sumClients = sumClients + connectedClients.length;
					} else {
						sumGuests = sumGuests + connectedClients.length;
					}

					const id = `wlan.${wlan_id}.connected_${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}`
					if (await this.objectExists(id)) {
						this.setStateChanged(id, connectedClients.length, true);
					}
				}

				const idSumClients = 'wlan.connected_clients';
				if (await this.objectExists(idSumClients)) {
					this.setStateChanged(idSumClients, sumClients, true);
				}

				const idSumGuests = 'wlan.connected_guests';
				if (await this.objectExists(idSumGuests)) {
					this.setStateChanged(idSumGuests, sumGuests, true);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateLanConfig(data: NetworkLanConfig[] | NetworkLanConfig_V2[], isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateLanConfig]:';

		try {

			if (this.connected && this.isConnected) {
				const idChannel = tree.lan.idChannel;

				if (this.config.lanConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob.createOrUpdateChannel(idChannel, 'lan', undefined, true);
						data = await this.ufn.getLanConfig_V2();
					}

					if (data && data !== null) {
						let countLan = 0;
						let countBlacklisted = 0;

						for (let lan of data) {

							// Convert API V2 to V1, because event is from type V1
							if ((lan as NetworkLanConfig_V2) && (lan as NetworkLanConfig_V2).configuration) {
								lan = { ...(lan as NetworkLanConfig_V2).configuration, ...(lan as NetworkLanConfig_V2).details, ...(lan as NetworkLanConfig_V2).statistics }
							}

							lan = (lan as NetworkLanConfig);

							const idLan = `${idChannel}.${lan._id}`;

							if ((!this.config.lanIsWhiteList && !_.some(this.config.lanBlackList, { id: lan._id })) || (this.config.lanIsWhiteList && _.some(this.config.lanBlackList, { id: lan._id }))) {
								if (isAdapterStart) {
									countLan++
								}

								if (!this.cache.lan[lan._id]) {
									this.log.debug(`${logPrefix} Discovered LAN '${lan.name}'`);
								}

								let dataToProcess = lan;
								if (this.cache.lan[lan._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob.deepDiffBetweenObjects(lan, this.cache.lan[lan._id], this, tree.lan.getKeys()) as NetworkLanConfig;
								}

								this.cache.lan[lan._id] = lan;

								if (!_.isEmpty(dataToProcess)) {
									dataToProcess._id = lan._id;

									await this.myIob.createOrUpdateDevice(idLan, `${lan.name}${lan.vlan ? ` (${lan.vlan})` : ''}`, `${this.namespace}.${idChannel}.${lan._id}.enabled`, undefined, undefined, isAdapterStart, true);
									await this.myIob.createOrUpdateStates(idLan, tree.lan.get(), dataToProcess, lan, this.config.lanStatesBlackList, this.config.lanStatesIsWhiteList, lan.name, isAdapterStart);
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
							this.log.info(`${logPrefix} Discovered ${data.length} LAN's (LAN's: ${countLan}, blacklisted: ${countBlacklisted})`);
						}
					}
				} else {
					if (await this.objectExists(idChannel)) {
						await this.delObjectAsync(idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${idChannel}' deleted`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateLanConnectedClients(isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateLanConnectedClients]:';

		try {
			if (this.config.lanConfigEnabled) {
				if (isAdapterStart) {
					const obj: ConnectedClients = { connected_clients: 0, connected_guests: 0, name: 'lan' };
					await this.myIob.createOrUpdateStates('lan', tree.lan.getGlobal(), obj, obj, undefined, false, obj.name, true);
				}

				let sumClients = 0;
				let sumGuests = 0;

				for (const lan_id in this.cache.lan) {
					const connectedClients = _.filter(this.cache.isOnline, (x) => x.val === true && x.network_id === lan_id);
					this.log.silly(`${logPrefix} LAN '${this.cache.lan[lan_id].name}' (id: ${lan_id}) connected ${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}: ${connectedClients.length}`);

					if (this.cache.lan[lan_id].purpose !== 'guest') {
						sumClients = sumClients + connectedClients.length;
					} else {
						sumGuests = sumGuests + connectedClients.length;
					}

					const id = `lan.${lan_id}.connected_${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}`
					if (await this.objectExists(id)) {
						this.setStateChanged(id, connectedClients.length, true);
					}
				}

				const idSumClients = 'lan.connected_clients';
				if (await this.objectExists(idSumClients)) {
					this.setStateChanged(idSumClients, sumClients, true);
				}

				const idSumGuests = 'lan.connected_guests';
				if (await this.objectExists(idSumGuests)) {
					this.setStateChanged(idSumGuests, sumGuests, true);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateFirewallGroup(data: FirewallGroup[], isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[updateFirewallGroup]:';

		try {
			if (this.connected && this.isConnected) {
				const idChannel = tree.firewallGroup.idChannel;

				if (this.config.firewallGroupConfigEnabled) {
					if (isAdapterStart) {
						await this.myIob.createOrUpdateChannel(idChannel, 'firewall group', undefined, true);
						data = await this.ufn.getFirewallGroup();
					}

					if (data && data !== null) {
						let countFirewallGroup = 0;
						let countBlacklisted = 0;

						for (const firewallGroup of data) {

							const idFirewallGroup = `${idChannel}.${firewallGroup._id}`;

							if ((!this.config.firewallGroupIsWhiteList && !_.some(this.config.firewallGroupBlackList, { id: firewallGroup._id })) || (this.config.firewallGroupIsWhiteList && _.some(this.config.firewallGroupBlackList, { id: firewallGroup._id }))) {
								if (isAdapterStart) {
									countFirewallGroup++
								}

								if (!this.cache.firewallGroup[firewallGroup._id]) {
									this.log.debug(`${logPrefix} Discovered Firewall Group '${firewallGroup.name}'`);
								}

								let dataToProcess = firewallGroup;
								if (this.cache.firewallGroup[firewallGroup._id]) {
									// filter out unchanged properties
									dataToProcess = this.myIob.deepDiffBetweenObjects(firewallGroup, this.cache.firewallGroup[firewallGroup._id], this, tree.firewallGroup.getKeys()) as FirewallGroup;
								}

								this.cache.firewallGroup[firewallGroup._id] = firewallGroup;

								if (!_.isEmpty(dataToProcess)) {
									dataToProcess._id = firewallGroup._id;

									await this.myIob.createOrUpdateDevice(idFirewallGroup, `${firewallGroup.name}`, `${this.namespace}.${idChannel}.${firewallGroup._id}.enabled`, undefined, undefined, isAdapterStart, true);
									await this.myIob.createOrUpdateStates(idFirewallGroup, tree.firewallGroup.get(), dataToProcess, firewallGroup, this.config.firewallGroupStatesBlackList, this.config.firewallGroupStatesIsWhiteList, firewallGroup.name, isAdapterStart);
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
							this.log.info(`${logPrefix} Discovered ${data.length} Firewall Group's (Firewall Group's: ${countFirewallGroup}, blacklisted: ${countBlacklisted})`);
						}
					}
				} else {
					if (await this.objectExists(idChannel)) {
						await this.delObjectAsync(idChannel, { recursive: true });
						this.log.debug(`${logPrefix} '${idChannel}' deleted`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * @deprecated Download public data from ui with image url infos.
	 */
	async updateDevicesImages(): Promise<void> {
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
					native: undefined
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
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateImages(): Promise<void> {
		const logPrefix = '[updateImages]:';

		try {
			if (this.config.deviceImageDownload) {
				const clients = await this.getStatesAsync(`${tree.device.idChannel}.*.imageUrl`);
				await this._updateClientsImages(clients)
			}

			if (this.config.clientImageDownload) {

				if (this.config.clientsEnabled) {
					const clients = await this.getStatesAsync(`${tree.client.idChannelUsers}.*.imageUrl`);
					await this._updateClientsImages(clients)
				}

				if (this.config.guestsEnabled) {
					const guests = await this.getStatesAsync(`${tree.client.idChannelGuests}.*.imageUrl`);
					await this._updateClientsImages(guests)
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async _updateClientsImages(objs: Record<string, ioBroker.State>): Promise<void> {
		const logPrefix = '[_updateClientsImages]:';

		try {
			const imgCache: myImgCache = {}

			for (const id in objs) {
				const url = objs[id];

				if (url && url.val) {
					if (imgCache[url.val as string]) {
						imgCache[url.val as string].push(this.myIob.getIdWithoutLastPart(id))
					} else {
						imgCache[url.val as string] = [this.myIob.getIdWithoutLastPart(id)]
					}
				}
			}

			for (const url in imgCache) {
				await this.downloadImage(url, imgCache[url]);
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Download image from a given url and update Channel icon if needed
	 * 
	 * @param url 
	 * @param idChannelList 
	 */
	async downloadImage(url: string | null, idChannelList: string[]): Promise<void> {
		const logPrefix = '[downloadImage]:';

		try {
			let base64ImgString = undefined;		// ToDo: nicht sauber gelöst!

			if (url !== null) {

				const response = await request(url);

				if (response && response.statusCode === 200) {
					const imageBuffer = Buffer.from(await response.body.arrayBuffer());
					const imageBase64 = imageBuffer.toString('base64');
					base64ImgString = `data:image/png;base64,${imageBase64}`;

					this.log.debug(`${logPrefix} image download successful -> update states: ${JSON.stringify(idChannelList)}`);
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
						await this.myIob.createOrUpdateDevice(idChannel, undefined, `${idChannel}.isOnline`, undefined, base64ImgString, true, false);
					}
				}
			}
		} catch (error) {
			const mac = this.myIob.getIdLastPart(idChannelList[0]);

			this.log.error(`${logPrefix} [mac: ${mac}, url: ${url}]: ${error}, stack: ${error.stack}`);
		}
	}

	//#endregion

	//#region WS Listener

	/**
	 * Websocket pong received, sets the aliveTimestamp to the current timestamp
	 */
	onPongMessage(): void {
		const logPrefix = '[onPongMessage]:';

		try {
			this.aliveTimestamp = moment().valueOf();
			this.log.silly('ping pong');
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkMessage(event: NetworkEventDevice | NetworkEventClient | NetworkEvent | NetworkEventSpeedTest | NetworkEventFirewallGroup): Promise<void> {
		const logPrefix = '[onNetworkMessage]:';

		try {
			this.aliveTimestamp = moment().valueOf();

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
			} else {
				if (!this.eventsToIgnore.includes(event.meta.message)) {
					this.log.debug(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! data: ${JSON.stringify(event.data)}`);
				}

				// if (!event.meta.message.includes('unifi-device:sync') && !event.meta.message.includes('session-metadata:sync')) {

				// }
			}

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkEvent(event: NetworkEvent): Promise<void> {
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

					} else if (WebSocketEvent.device.ChannelChanged.includes(myEvent.key)) {
						this.log.debug(`${logPrefix} event 'AP channel changed' - not implemented (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

					} else if (WebSocketEvent.device.PoeDisconnect.includes(myEvent.key)) {
						this.log.debug(`${logPrefix} event 'poe disconnect' - not implemented (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

					} else if (WebSocketEvent.device.Upgrade.includes(myEvent.key)) {
						this.log.debug(`${logPrefix} event 'upgrade' - not implemented (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

					} else if (WebSocketEvent.device.Adopt.includes(myEvent.key)) {
						this.log.debug(`${logPrefix} event 'adopt' - not implemented (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

					} else {
						this.log.warn(`${logPrefix} not implemented event (${myEvent.key ? `key: ${myEvent.key},` : ''}) - Please report this to the developer and creating an issue on github! (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkClientEvent(events: NetworkEventClient): Promise<void> {
		const logPrefix = '[onNetworkClientEvent]:';

		try {

			if (events.meta.message.endsWith(':disconnected')) {
				for (const event of events.data) {
					if (event.type === 'VPN') {
						// VPN disconnect
						this.log.debug(`${logPrefix} event 'vpn disconnected' (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);

						await eventHandler.client.vpnDisconnect(events.meta, event as myNetworkClient, this, this.cache);
					} else {
						this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);
					}
				}
			} else {
				this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(events.data)})`);
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkUserEvent(events: NetworkEventClient): Promise<void> {
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

							event.last_seen = event.last_seen >= this.cache.clients[event.mac]?.last_seen ? event.last_seen : this.cache.clients[event.mac]?.last_seen;

							if ((!this.config.clientIsWhiteList && !_.some(this.config.clientBlackList, { mac: event.mac })) || (this.config.clientIsWhiteList && _.some(this.config.clientBlackList, { mac: event.mac }))) {
								this.log.debug(`${logPrefix} update ${!event.is_guest ? 'client' : 'guest'} '${this.cache.clients[event.mac]?.name}'`);

								await this.myIob.createOrUpdateDevice(`${idChannel}.${event.mac}`, name, `${this.namespace}.${idChannel}.${event.mac}.isOnline`, undefined, undefined, true);
								await this.myIob.createOrUpdateStates(`${idChannel}.${event.mac}`, tree.client.get(), event as myNetworkClient, this.cache.clients[event.mac], this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, this.cache.clients[event.mac].name, true);
							}
						}
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkWlanConfEvent(event: NetworkEventWlanConfig): Promise<void> {
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
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkLanConfEvent(event: NetworkEventLanConfig): Promise<void> {
		const logPrefix = '[onNetworkLanConfEvent]:';

		try {
			if (this.config.lanConfigEnabled) {
				this.log.debug(`${logPrefix} lan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					await eventHandler.lanConf.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateLanConfig(event.data);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkFirewallGroupEvent(event: NetworkEventFirewallGroup): Promise<void> {
		const logPrefix = '[onNetworkFirewallGroupEvent]:';

		try {
			if (this.config.firewallGroupConfigEnabled) {
				this.log.debug(`${logPrefix} firewall group event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					await eventHandler.firewallGroup.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateFirewallGroup(event.data);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkSpeedTestEvent(event: NetworkEventSpeedTest): Promise<void> {
		const logPrefix = '[onNetworkSpeedTestEvent]:';

		try {
			if (this.config.devicesEnabled) {
				await eventHandler.device.speedTest(event, this, this.cache);
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
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