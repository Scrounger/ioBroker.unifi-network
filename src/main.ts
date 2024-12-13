/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
import { ALPNProtocol, FetchError, context } from '@adobe/fetch';
import _ from 'lodash';
import url from "node:url";

// API imports
import { NetworkApi } from './lib/api/network-api.js';
import { apiCommands } from './lib/api/network-command.js';
import { NetworkEvent, NetworkEventClient, NetworkEventDevice, NetworkEventLanConfig, NetworkEventSpeedTest, NetworkEventWlanConfig } from './lib/api/network-types.js';
import { NetworkDevice } from './lib/api/network-types-device.js';
import { NetworkDeviceModels } from './lib/api/network-types-device-models.js';
import { NetworkWlanConfig, NetworkWlanConfig_V2 } from './lib/api/network-types-wlan-config.js';

// Adapter imports
import * as myHelper from './lib/helper.js';
import { ConnectedClients, WebSocketEvent, WebSocketEventMessages, myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject, myImgCache, myNetworkClient } from './lib/myTypes.js';

import { eventHandler } from './lib/eventHandler.js';
import * as tree from './lib/tree/index.js'
import { base64 } from './lib/base64.js';
import { NetworkLanConfig, NetworkLanConfig_V2 } from './lib/api/network-types-lan-config.js';
import { messageHandler } from './lib/messageHandler.js';
import * as myI18n from './lib/i18n.js';


class UnifiNetwork extends utils.Adapter {
	ufn: NetworkApi = undefined;
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
		isOnline: {}
	}

	subscribedList: string[] = [];

	eventListener = (event: NetworkEvent) => this.onNetworkMessage(event);
	pongListener = () => this.onPongMessage();

	fetch = context(
		{
			alpnProtocols: [ALPNProtocol.ALPN_HTTP2],
			rejectUnauthorized: false,
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36',
		}
	).fetch;

	eventsToIngnore = [
		'device:update',
		'unifi-device:sync',
		'session-metadata:sync'
	]

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

			// ohne worte....
			await myI18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

			if (this.config.host, this.config.user, this.config.password) {
				this.ufn = new NetworkApi(this.config.host, this.config.port, this.config.isUnifiOs, this.config.site, this.config.user, this.config.password, this.log);

				await this.establishConnection();

				this.ufn.on('message', this.eventListener);
				this.ufn.on('pong', this.pongListener);
				this.log.info(`${logPrefix} WebSocket listener to realtime API successfully started`);
			} else {
				this.log.warn(`${logPrefix} no login credentials in adapter config set!`);
			}


		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		const logPrefix = '[onUnload]:';

		try {
			this.removeListener('message', this.eventListener);
			this.removeListener('pong', this.pongListener);

			this.clearTimeout(this.aliveTimeout);
			this.clearTimeout(this.pingTimeout);

			this.clearTimeout(this.imageUpdateTimeout);

			if (this.ufn) {
				this.ufn.logout();
				this.setConnectionStatus(false);
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
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		const logPrefix = '[onStateChange]:';

		try {
			if (state) {
				if (state.from.includes(this.namespace)) {
					// internal changes
					if (myHelper.getIdLastPart(id) === 'imageUrl') {
						if (this.config.clientImageDownload && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`))) {
							await this.downloadImage(state.val as string, [myHelper.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update client image`);
						} else if (this.config.deviceImageDownload && id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
							await this.downloadImage(state.val as string, [myHelper.getIdWithoutLastPart(id)]);
							this.log.debug(`${logPrefix} state '${id}' changed -> update device image`);
						}
					} else if (myHelper.getIdLastPart(id) === 'isOnline' && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelVpn}.`))) {
						const macOrIp = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id)).replaceAll('_', '.');

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
					const mac = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));

					if (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`)) {
						// Client state changed
						if (myHelper.getIdLastPart(id) === 'blocked') {
							if (state.val) {
								const res = await apiCommands.clients.block(this.ufn, mac);
								if (res) this.log.info(`${logPrefix} command sent: block - '${this.cache.clients[mac].name}' (mac: ${mac})`);
							} else {
								const res = await apiCommands.clients.unblock(this.ufn, mac);
								if (res) this.log.info(`${logPrefix} command sent: unblock - '${this.cache.clients[mac].name}' (mac: ${mac})`);
							}

						} else if (myHelper.getIdLastPart(id) === 'reconnect') {
							const res = await apiCommands.clients.reconncet(this.ufn, mac);

							if (res) this.log.info(`${logPrefix} command sent: reconnect - '${this.cache.clients[mac].name}' (mac: ${mac})`);
							// } else if (myHelper.getIdLastPart(id) === 'authorized') {
							// 	let res = undefined;

							// 	if (state.val === true) {
							// 		res = await apiCommands.clients.authorizeGuest(this.ufn, mac);
							// 	} else {
							// 		res = await apiCommands.clients.unauthorizeGuest(this.ufn, mac);
							// 	}

							// 	if (res) this.log.info(`${logPrefix} command sent: ${state.val ? 'authorize' : 'unauthorize'} guest - '${this.cache.clients[mac].name}' (mac: ${mac})`);
						} else if (myHelper.getIdLastPart(id) === 'name') {
							const res = await apiCommands.clients.setName(this.ufn, this.cache.clients[mac].user_id, state.val as string);

							if (res) this.log.info(`${logPrefix} command sent: set name - '${this.cache.clients[mac].name}' (mac: ${mac}, new name: ${state.val})`);
						} else {
							this.log.debug(`${logPrefix} client state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
						}
					} else if (id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
						if (myHelper.getIdLastPart(id) === 'restart') {
							const res = await apiCommands.devices.restart(this.ufn, mac);

							if (res) this.log.info(`${logPrefix} command sent: restart - '${this.cache.devices[mac].name}' (mac: ${mac})`);

						} else if (id.includes('.port_')) {
							if (myHelper.getIdLastPart(id) === 'poe_cycle') {
								const mac = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(myHelper.getIdWithoutLastPart(myHelper.getIdWithoutLastPart(id))));
								const port_idx: number = parseInt(myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id)).replace('port_', ''));

								const res = await apiCommands.devices.port_cyclePoePower(this.ufn, mac, port_idx, this.cache.devices[mac]);

								if (res) this.log.info(`${logPrefix} command sent: cycle poe power - '${this.cache.devices[mac].name}' (mac: ${mac}) - Port ${port_idx}`);
							} else if (myHelper.getIdLastPart(id) === 'poe_enable') {
								const mac = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(myHelper.getIdWithoutLastPart(myHelper.getIdWithoutLastPart(id))));
								const port_idx: number = parseInt(myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id)).replace('port_', ''));

								const res = await apiCommands.devices.port_switchPoe(state.val as boolean, port_idx, this.ufn, this.cache.devices[mac]);

								if (res) this.log.info(`${logPrefix} command sent: switch poe power - '${state.val ? 'on' : 'off'}' '${this.cache.devices[mac].name}' (mac: ${mac}) - Port ${port_idx}`);
							}
						} else if (myHelper.getIdLastPart(id) === 'led_override') {
							const res = await apiCommands.devices.ledOverride(state.val as string, this.ufn, this.cache.devices[mac]);

							if (res) this.log.info(`${logPrefix} command sent: LED override to '${state.val}' - '${this.cache.devices[mac].name}' (mac: ${mac}) - `);
						} else if (myHelper.getIdLastPart(id) === 'upgrade') {
							const res = await apiCommands.devices.upgrade(this.ufn, this.cache.devices[mac]);

							if (res) this.log.info(`${logPrefix} command sent: upgrade to new firmware version - '${this.cache.devices[mac].name}' (mac: ${mac})`);

						} else if (id.includes('wan')) {
							if (myHelper.getIdLastPart(id) === 'speedtest_run') {
								const wan_interface = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));
								const mac = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(myHelper.getIdWithoutLastPart(id)));
								const interface_name = this.cache.devices[mac][wan_interface].ifname;

								const res = await apiCommands.devices.runSpeedtest(this.ufn, interface_name);

								if (res) this.log.info(`${logPrefix} command sent: run speedtest (mac: ${mac}, wan: ${wan_interface}, interface: ${interface_name})`);
							}
						} else if (myHelper.getIdLastPart(id) === 'disabled') {
							const res = await apiCommands.devices.disableAccessPoint(this.ufn, this.cache.devices[mac]._id, state.val as boolean);

							if (res) this.log.info(`${logPrefix} command sent: ${state.val ? 'disable' : 'enable'} access point '${this.cache.devices[mac].name}' (mac: ${mac})`);
						} else {
							this.log.debug(`${logPrefix} device state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
						}
					} else if (id.startsWith(`${this.namespace}.wlan.`)) {
						if (myHelper.getIdLastPart(id) === 'enabled') {
							const wlan_id = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));

							const res = await apiCommands.wlanConf.enable(this.ufn, wlan_id, state.val as boolean);

							if (res) this.log.info(`${logPrefix} command sent: wlan ${state.val ? 'enabled' : 'disabled'} - '${this.cache.wlan[wlan_id].name}' (id: ${wlan_id})`);
						}
					} else if (id.startsWith(`${this.namespace}.lan.`)) {
						if (myHelper.getIdLastPart(id) === 'enabled') {
							const lan_id = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));

							const res = await apiCommands.lanConf.enable(this.ufn, lan_id, state.val as boolean);

							if (res) this.log.info(`${logPrefix} command sent: lan ${state.val ? 'enabled' : 'disabled'} - '${this.cache.lan[lan_id].name}' (id: ${lan_id})`);
						} else if (myHelper.getIdLastPart(id) === 'internet_enabled') {
							const lan_id = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));

							const res = await apiCommands.lanConf.internet_access_enabled(this.ufn, lan_id, state.val as boolean);

							if (res) this.log.info(`${logPrefix} command sent: internet access of lan ${state.val ? 'enabled' : 'disabled'} - '${this.cache.lan[lan_id].name}' (id: ${lan_id})`);
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
					messageHandler.device.list(obj, this, this.ufn);
				} else if (obj.command === 'deviceStateList') {
					messageHandler.device.stateList(obj, this, this.ufn);
				} else if (obj.command === 'clientList') {
					messageHandler.client.list(obj, this, this.ufn);
				} else if (obj.command === 'clientStateList') {
					messageHandler.client.stateList(obj, this, this.ufn);
				} else if (obj.command === 'wlanList') {
					messageHandler.wlan.list(obj, this, this.ufn);
				} else if (obj.command === 'wlanStateList') {
					messageHandler.wlan.stateList(obj, this, this.ufn);
				} else if (obj.command === 'lanList') {
					messageHandler.lan.list(obj, this, this.ufn);
				} else if (obj.command === 'lanStateList') {
					messageHandler.lan.stateList(obj, this, this.ufn);
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
	 * @param isAdapterStart 
	 */
	async establishConnection() {
		const logPrefix = '[establishConnection]:';

		try {

			if (this.pingTimeout) {
				this.clearTimeout(this.pingTimeout)
				this.pingTimeout = null;
			}

			if (await this.login()) {
				await this.updateRealTimeApiData();
				await this.updateIsOnlineState(true);

				await this.updateApiData();

				this.pingTimeout = this.setTimeout(() => {
					this.sendPing();
				}, ((this.config.expertAliveInterval || 30) / 2) * 1000);
			}

			// start the alive checker
			if (this.aliveTimeout) {
				this.clearTimeout(this.aliveTimeout);
				this.aliveTimeout = null;
			}

			this.aliveTimeout = this.setTimeout(() => {
				this.aliveChecker();
			}, (this.config.expertAliveInterval || 30) * 1000);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/** Login into NVR and load bootstrap data
	 * @returns {Promise<boolean>} Connection status
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


	/** Check whether the connection to the controller exists, if not try to establish a new connection
	 */
	async aliveChecker() {
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
						this.stop({ reason: 'too many connection retries' });
					}
					return;
				} else {
					this.log.silly(`${logPrefix} Connection to the Unifi-Network controller is alive (last alive signal is ${diff}s old)`);

					this.updateIsOnlineState();

					await this.setConnectionStatus(true);
					this.connectionRetries = 0;

					if (this.aliveTimeout) {
						this.clearTimeout(this.aliveTimeout);
						this.aliveTimeout = null;
					}

					this.aliveTimeout = this.setTimeout(() => {
						this.aliveChecker();
					}, (this.config.expertAliveInterval || 30) * 1000);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}


	/** Set adapter info.connection state and internal var
	 * @param {boolean} isConnected
	 */
	async setConnectionStatus(isConnected: boolean) {
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
	async sendPing(): Promise<void> {
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

	async updateRealTimeApiData() {
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


			// const tmp = tree.lan.getStateIDs();
			// let list = []

			// for (let id of tmp) {
			// 	list.push({ id: id });
			// }

			// this.log.warn(JSON.stringify(list));

			this.imageUpdateTimeout = this.setTimeout(() => { this.updateImages(); }, this.config.realTimeApiDebounceTime * 2 * 1000);

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateApiData() {
		const logPrefix = '[updateApiData]:';

		try {


		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateDevices(data: NetworkDevice[] | null = null, isAdapterStart: boolean = false) {
		const logPrefix = '[updateDevices]:';

		try {
			if (this.connected && this.isConnected) {
				if (this.config.devicesEnabled) {

					if (isAdapterStart) {
						await this.createOrUpdateChannel(tree.device.idChannel, 'unifi devices', undefined, true);
					}

					if (data && data !== null) {
						let countDevices = 0;
						let countBlacklisted = 0;

						for (let device of data) {
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
									dataToProcess = myHelper.deepDiffBetweenObjects(device, this.cache.devices[device.mac], this, tree.device.getKeys()) as NetworkDevice;
								}

								if (!_.isEmpty(dataToProcess)) {
									this.cache.devices[device.mac] = device;
									this.cache.devices[device.mac].iobTimestamp = moment().unix();

									dataToProcess.mac = device.mac;

									if (!isAdapterStart) this.log.silly(`${logPrefix} device '${device.name}' (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);

									await this.createOrUpdateDevice(idDevice, device.name, `${this.namespace}.${idDevice}.isOnline`, `${this.namespace}.${idDevice}.hasError`, undefined, isAdapterStart);
									await this.createOrUpdateGenericState(idDevice, tree.device.get(), dataToProcess, this.config.deviceStatesBlackList, this.config.deviceStatesIsWhiteList, device, device, isAdapterStart);
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

	async updateClients(data: myNetworkClient[] | null = null, isAdapterStart: boolean = false, isOfflineClients: boolean = false) {
		const logPrefix = '[updateClients]:';

		try {
			if (this.connected && this.isConnected) {
				const idChannel = tree.client.idChannelUsers;
				const idGuestChannel = tree.client.idChannelGuests;
				const idVpnChannel = tree.client.idChannelVpn;

				if (isAdapterStart && !isOfflineClients) {
					if (this.config.clientsEnabled) await this.createOrUpdateChannel(idChannel, 'users', undefined, true);
					if (this.config.guestsEnabled) await this.createOrUpdateChannel(idGuestChannel, 'guests', undefined, true);
					if (this.config.vpnEnabled) await this.createOrUpdateChannel(idVpnChannel, 'vpn users', undefined, true);

					if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
						await this.createOrUpdateChannel(tree.client.idChannel, 'client devices', undefined, true);
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

						for (let client of data) {
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
										if (isAdapterStart) countClients++

										if (!this.cache.clients[client.mac]) {
											this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} client '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
											this.cache.isOnline[client.mac] = { val: !isOfflineClients }
										}

										let dataToProcess = client;
										if (this.cache.clients[client.mac]) {
											// filter out unchanged properties
											dataToProcess = myHelper.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys()) as myNetworkClient;
										}

										if (Object.keys(dataToProcess).length > 0) {
											this.cache.clients[client.mac] = client;
											this.cache.clients[client.mac].name = name;
											this.cache.clients[client.mac].timestamp = moment().unix();

											this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
											this.cache.isOnline[client.mac].network_id = client.network_id;

											dataToProcess.mac = client.mac;
											dataToProcess.name = name

											if (!isAdapterStart) this.log.silly(`${logPrefix} client ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);

											await this.createOrUpdateDevice(`${idChannel}.${client.mac}`, name, `${this.namespace}.${idChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart);
											await this.createOrUpdateGenericState(`${idChannel}.${client.mac}`, tree.client.get(), dataToProcess, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client, client, isAdapterStart);
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
										if (isAdapterStart) countGuests++

										if (!this.cache.clients[client.mac]) {
											this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} guest '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
											this.cache.isOnline[client.mac] = { val: !isOfflineClients }
										}

										let dataToProcess = client;
										if (this.cache.clients[client.mac]) {
											// filter out unchanged properties
											dataToProcess = myHelper.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys()) as myNetworkClient;
										}

										if (Object.keys(dataToProcess).length > 0) {
											this.cache.clients[client.mac] = client;
											this.cache.clients[client.mac].name = name;
											this.cache.clients[client.mac].timestamp = moment().unix();

											this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
											this.cache.isOnline[client.mac].network_id = client.network_id;

											dataToProcess.mac = client.mac;
											dataToProcess.name = name

											if (!isAdapterStart) this.log.silly(`${logPrefix} guest ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);

											await this.createOrUpdateDevice(`${idGuestChannel}.${client.mac}`, name, `${this.namespace}.${idGuestChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart);
											await this.createOrUpdateGenericState(`${idGuestChannel}.${client.mac}`, tree.client.get(), dataToProcess, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client, client, isAdapterStart);
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
										if (isAdapterStart) countVpn++

										if (!this.cache.vpn[client.ip]) {
											this.log.debug(`${logPrefix} Discovered vpn client '${name}' (IP: ${client.ip}, remote_ip: ${client.remote_ip})`);
											this.cache.isOnline[client.ip] = { val: !isOfflineClients }
										}

										const idChannel = client.network_id;
										await this.createOrUpdateChannel(`${idVpnChannel}.${idChannel}`, client.network_name || '', base64[client.vpn_type] || undefined);

										let dataToProcess = client;
										if (this.cache.vpn[client.ip]) {
											// filter out unchanged properties
											dataToProcess = myHelper.deepDiffBetweenObjects(client, this.cache.vpn[client.ip], this, tree.client.getKeys()) as myNetworkClient;
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

											if (!isAdapterStart) this.log.silly(`${logPrefix} vpn ${dataToProcess.name} (ip: ${dataToProcess.ip}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);

											await this.createOrUpdateDevice(`${idVpnChannel}.${idChannel}.${preparedIp}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, `${this.namespace}.${idVpnChannel}.${idChannel}.${preparedIp}.isOnline`, undefined, undefined, isAdapterStart);
											await this.createOrUpdateGenericState(`${idVpnChannel}.${idChannel}.${preparedIp}`, tree.client.get(), dataToProcess, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client, client, isAdapterStart);
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

	async updatClientsOffline(data: myNetworkClient[], isAdapterStart: boolean = false) {
		const logPrefix = '[updatClientsOffline]:';

		try {
			if (data) {
				let result: myNetworkClient[] = [];
				for (let client of data) {
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

	async updateIsOnlineState(isAdapterStart: boolean = false) {
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

	async _updateIsOnlineState(clients: Record<string, ioBroker.State>, offlineTimeout: number, typeOfClient: string, isAdapterStart: boolean = false) {
		const logPrefix = '[_updateIsOnlineState]:';

		try {
			for (const id in clients) {

				const lastSeen = clients[id];
				const isOnline = await this.getStateAsync(`${myHelper.getIdWithoutLastPart(id)}.isOnline`);
				const mac = await this.getStateAsync(`${myHelper.getIdWithoutLastPart(id)}.mac`);
				const ip = await this.getStateAsync(`${myHelper.getIdWithoutLastPart(id)}.ip`);

				const client = typeOfClient !== 'vpn' ? this.cache.clients[mac.val as string] : this.cache.vpn[ip.val as string];

				const t = moment(isOnline.lc);
				const before = moment(lastSeen.val as number * 1000);
				const now = moment();

				if (!t.isBetween(before, now) || t.diff(before, 'seconds') <= 2) {
					// isOnline not changed between now an last reported last_seen val
					const diff = now.diff(before, 'seconds');
					await this.setState(`${myHelper.getIdWithoutLastPart(id)}.isOnline`, diff <= offlineTimeout, true);

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
				const idChannel = 'wlan';

				if (this.config.wlanConfigEnabled) {
					if (isAdapterStart) {
						await this.createOrUpdateChannel(idChannel, 'wlan', undefined, true);
						data = (await this.ufn.getWlanConfig_V2()) as NetworkWlanConfig_V2[];
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

							const idDevice = `${idChannel}.${wlan._id}`;

							if ((!this.config.wlanIsWhiteList && !_.some(this.config.wlanBlackList, { id: wlan._id })) || (this.config.wlanIsWhiteList && _.some(this.config.wlanBlackList, { id: wlan._id }))) {
								if (isAdapterStart) countWlan++

								if (!this.cache.wlan[wlan._id]) {
									this.log.debug(`${logPrefix} Discovered WLAN '${wlan.name}'`);
								}

								let dataToProcess = wlan;
								if (this.cache.wlan[wlan._id]) {
									// filter out unchanged properties
									dataToProcess = myHelper.deepDiffBetweenObjects(wlan, this.cache.wlan[wlan._id], this, tree.wlan.getKeys()) as NetworkWlanConfig;
								}

								this.cache.wlan[wlan._id] = wlan;

								if (!_.isEmpty(dataToProcess)) {
									dataToProcess._id = wlan._id;

									await this.createOrUpdateDevice(idDevice, wlan.name, `${this.namespace}.${idChannel}.${wlan._id}.enabled`, undefined, undefined, isAdapterStart);
									await this.createOrUpdateGenericState(idDevice, tree.wlan.get(), dataToProcess, this.config.wlanStatesBlackList, this.config.wlanStatesIsWhiteList, wlan, wlan, isAdapterStart);
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++
									if (await this.objectExists(idDevice)) {
										await this.delObjectAsync(idDevice, { recursive: true });
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
					await this.createOrUpdateGenericState('wlan', tree.wlan.getGlobal(), obj, undefined, false, obj, obj, true);
				}

				let sumClients = 0;
				let sumGuests = 0;

				for (let wlan_id in this.cache.wlan) {
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
				const idChannel = 'lan';

				if (this.config.lanConfigEnabled) {
					if (isAdapterStart) {
						await this.createOrUpdateChannel(idChannel, 'lan', undefined, true);
						data = (await this.ufn.getLanConfig_V2()) as NetworkLanConfig_V2[];
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

							const idDevice = `${idChannel}.${lan._id}`;

							if ((!this.config.lanIsWhiteList && !_.some(this.config.lanBlackList, { id: lan._id })) || (this.config.lanIsWhiteList && _.some(this.config.lanBlackList, { id: lan._id }))) {
								if (isAdapterStart) countLan++

								if (!this.cache.lan[lan._id]) {
									this.log.debug(`${logPrefix} Discovered LAN '${lan.name}'`);
								}

								let dataToProcess = lan;
								if (this.cache.lan[lan._id]) {
									// filter out unchanged properties
									dataToProcess = myHelper.deepDiffBetweenObjects(lan, this.cache.lan[lan._id], this, tree.lan.getKeys()) as NetworkLanConfig;
								}

								this.cache.lan[lan._id] = lan;

								if (!_.isEmpty(dataToProcess)) {
									dataToProcess._id = lan._id;

									await this.createOrUpdateDevice(idDevice, `${lan.name}${lan.vlan ? ` (${lan.vlan})` : ''}`, `${this.namespace}.${idChannel}.${lan._id}.enabled`, undefined, undefined, isAdapterStart);
									await this.createOrUpdateGenericState(idDevice, tree.lan.get(), dataToProcess, this.config.lanStatesBlackList, this.config.lanStatesIsWhiteList, lan, lan, isAdapterStart);
								}
							} else {
								if (isAdapterStart) {
									countBlacklisted++
									if (await this.objectExists(idDevice)) {
										await this.delObjectAsync(idDevice, { recursive: true });
										this.log.info(`${logPrefix} LAN '${lan.name}' (id: ${lan._id}) delete, ${this.config.lanIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}
						}

						if (isAdapterStart) {
							this.log.info(`${logPrefix} Discovered ${data.length} LAN's (WLAN's: ${countLan}, blacklisted: ${countBlacklisted})`);
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
					await this.createOrUpdateGenericState('lan', tree.lan.getGlobal(), obj, undefined, false, obj, obj, true);
				}

				let sumClients = 0;
				let sumGuests = 0;

				for (let lan_id in this.cache.lan) {
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

	/**
	 * @deprecated Download public data from ui with image url infos.
	 */
	async updateDevicesImages() {
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
				const response = await this.fetch(url, { follow: 0 });

				if (response.status === 200) {
					const data: any = await response.json();

					if (data && data.devices) {
						await this.setStateChangedAsync(`${tree.device.idChannel}.publicData`, JSON.stringify(data), true);
					}
				} else {
					this.log.error(`${logPrefix} error downloading image from '${url}', status: ${response.status}`);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateImages() {
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

	async _updateClientsImages(objs: Record<string, ioBroker.State>) {
		const logPrefix = '[_updateClientsImages]:';

		try {
			let imgCache: myImgCache = {}

			for (const id in objs) {
				const url = objs[id];

				if (url && url.val) {
					if (imgCache[url.val as string]) {
						imgCache[url.val as string].push(myHelper.getIdWithoutLastPart(id))
					} else {
						imgCache[url.val as string] = [myHelper.getIdWithoutLastPart(id)]
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
	 * @param url 
	 * @param idChannelList 
	 */
	async downloadImage(url: string | null, idChannelList: string[]) {
		const logPrefix = '[downloadImage]:';

		try {
			let base64ImgString = 'null';		// ToDo: nicht sauber gelöst!

			if (url !== null) {

				const response = await this.fetch(url, { follow: 0 });

				if (response.status === 200) {
					const imageBuffer = Buffer.from(await response.arrayBuffer());
					const imageBase64 = imageBuffer.toString('base64');
					base64ImgString = `data:image/png;base64,` + imageBase64;

					this.log.debug(`${logPrefix} image download successful -> update states: ${JSON.stringify(idChannelList)}`);
				} else {
					this.log.error(`${logPrefix} error downloading image from '${url}', status: ${response.status}`);
				}
			}

			for (const idChannel of idChannelList) {

				if (await this.objectExists(`${idChannel}.image`)) {
					await this.setStateChangedAsync(`${idChannel}.image`, base64ImgString, true);
				}

				if (await this.objectExists(`${idChannel}`)) {
					await this.createOrUpdateDevice(idChannel, undefined, `${idChannel}.isOnline`, undefined, base64ImgString, true, false);
				}
			}

		} catch (error) {
			const mac = myHelper.getIdLastPart(idChannelList[0]);

			if (error instanceof FetchError) {
				this.log.warn(`${logPrefix} [mac: ${mac}]: image download failed, reasign it directly via unifi-network controller`);
			} else {
				this.log.error(`${logPrefix} [mac: ${mac}, url: ${url}]: ${error}, stack: ${error.stack}`);
			}
		}
	}

	//#endregion

	//#region Device, Channel, State Handlers

	/**
	 * create or update a device object, update will only be done on adapter start
	 * @param id 
	 * @param name 
	 * @param onlineId 
	 * @param icon 
	 * @param isAdapterStart
	 */
	private async createOrUpdateDevice(id: string, name: string | undefined, onlineId: string, errorId: string = undefined, icon: string | undefined = undefined, isAdapterStart: boolean = false, logChanges: boolean = true): Promise<void> {
		const logPrefix = '[createOrUpdateDevice]:';

		try {
			const i18n = name ? myI18n.getTranslatedObject(name) : name;

			let common = {
				name: name && Object.keys(i18n).length > 1 ? i18n : name,
				icon: icon,
				statusStates: {
					onlineId: onlineId
				}
			};

			if (errorId) {
				common.statusStates["errorId"] = errorId;
			}

			if (!await this.objectExists(id)) {
				this.log.debug(`${logPrefix} creating device '${id}'`);
				await this.setObjectAsync(id, {
					type: 'device',
					common: common,
					native: {}
				});
			} else {
				if (isAdapterStart) {
					const obj = await this.getObjectAsync(id);

					if (obj && obj.common) {
						if (!myHelper.isDeviceCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
							await this.extendObject(id, { common: common });

							this.log.debug(`${logPrefix} device updated '${id}' ${logChanges ? `(updated properties: ${JSON.stringify(myHelper.deepDiffBetweenObjects(common, obj.common, this))})` : ''}`);
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	/**
	 * create or update a channel object, update will only be done on adapter start
	 * @param id 
	 * @param name 
	 * @param onlineId 
	 * @param icon 
	 * @param isAdapterStart
	 */
	private async createOrUpdateChannel(id: string, name: string, icon: string = undefined, isAdapterStart: boolean = false): Promise<void> {
		const logPrefix = '[createOrUpdateChannel]:';

		try {
			const i18n = name ? myI18n.getTranslatedObject(name) : name;

			let common = {
				name: name && Object.keys(i18n).length > 1 ? i18n : name,
				icon: icon
			};

			if (!await this.objectExists(id)) {
				this.log.debug(`${logPrefix} creating channel '${id}'`);
				await this.setObjectAsync(id, {
					type: 'channel',
					common: common,
					native: {}
				});
			} else {
				if (isAdapterStart) {
					const obj = await this.getObjectAsync(id);

					if (obj && obj.common) {
						if (!myHelper.isChannelCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
							await this.extendObject(id, { common: common });
							this.log.debug(`${logPrefix} channel updated '${id}' (updated properties: ${JSON.stringify(myHelper.deepDiffBetweenObjects(common, obj.common, this))})`);
						}
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async createOrUpdateGenericState(channel: string, treeDefinition: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } | myCommonState, objValues: NetworkDevice | myNetworkClient | NetworkWlanConfig | NetworkLanConfig | ConnectedClients, blacklistFilter: { id: string }[], isWhiteList: boolean, objOrg: NetworkDevice | myNetworkClient | NetworkWlanConfig | NetworkLanConfig | ConnectedClients, objOrgValues, isAdapterStart: boolean = false, filterId = '', isChannelOnWhitelist: boolean = false) {
		const logPrefix = '[createOrUpdateGenericState]:';

		try {
			if (this.connected && this.isConnected) {
				for (const key in treeDefinition) {
					let logMsgState = `${channel}.${key}`.split('.')?.slice(1)?.join('.');

					let logDetails = `${(objOrg as any)?.mac ? `mac: ${(objOrg as any)?.mac}` : (objOrg as any)?.ip ? `ip: ${(objOrg as any)?.ip}` : (objOrg as any)?._id ? `id: ${(objOrg as any)?._id}` : ''}`

					try {
						// if we have an own defined state which takes val from other property
						const valKey = Object.hasOwn(objValues, treeDefinition[key].valFromProperty) && treeDefinition[key].valFromProperty ? treeDefinition[key].valFromProperty : key

						const cond1 = (Object.hasOwn(objValues, valKey) && objValues[valKey] !== undefined) || (Object.hasOwn(treeDefinition[key], 'id') && !Object.hasOwn(treeDefinition[key], 'valFromProperty'));
						const cond2 = Object.hasOwn(treeDefinition[key], 'iobType') && !Object.hasOwn(treeDefinition[key], 'object') && !Object.hasOwn(treeDefinition[key], 'array');
						const cond3 = (Object.hasOwn(treeDefinition[key], 'conditionToCreateState') && treeDefinition[key].conditionToCreateState(objOrgValues, this) === true) || !Object.hasOwn(treeDefinition[key], 'conditionToCreateState');

						// if (channel === 'devices.f4:e2:c6:55:55:e2' && (key === 'satisfaction' || valKey === 'satisfaction')) {
						// 	this.log.warn(`cond 1: ${cond1}`);
						// 	this.log.warn(`cond 2: ${cond2}`);
						// 	this.log.warn(`cond 3: ${cond3}`)
						// 	this.log.warn(`val: ${objValues[valKey]}`);
						// }

						if (key && cond1 && cond2 && cond3) {
							// if we have a 'iobType' property, then it's a state
							let stateId = key;

							if (Object.hasOwn(treeDefinition[key], 'id')) {
								// if we have a custom state, use defined id
								stateId = treeDefinition[key].id;
							}

							logMsgState = `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');

							if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${stateId}` })) || (isWhiteList && _.some(blacklistFilter, { id: `${filterId}${stateId}` })) || isChannelOnWhitelist || Object.hasOwn(treeDefinition[key], 'required')) {
								if (!await this.objectExists(`${channel}.${stateId}`)) {
									// create State
									this.log.silly(`${logPrefix} ${objOrg?.name} - creating state '${logMsgState}'`);
									const obj = {
										type: 'state',
										common: await this.getCommonGenericState(key, (treeDefinition as { [key: string]: myCommonState }), objOrg, logMsgState),
										native: {}
									};

									// @ts-ignore
									await this.setObjectAsync(`${channel}.${stateId}`, obj);
								} else {
									// update State if needed (only on adapter start)
									if (isAdapterStart) {
										const obj: ioBroker.Object = await this.getObjectAsync(`${channel}.${stateId}`);

										const commonUpdated = await this.getCommonGenericState(key, (treeDefinition as { [key: string]: myCommonState }), objOrg, logMsgState);

										if (obj && obj.common) {
											if (!myHelper.isStateCommonEqual(obj.common as ioBroker.StateCommon, commonUpdated)) {
												await this.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
												this.log.debug(`${logPrefix} ${objOrg?.name} - updated common properties of state '${logMsgState}' (updated properties: ${JSON.stringify(myHelper.deepDiffBetweenObjects(commonUpdated, obj.common, this))})`);
											}
										}
									}
								}

								if (!this.subscribedList.includes(`${channel}.${stateId}`) && ((treeDefinition[key].write && treeDefinition[key].write === true) || Object.hasOwn(treeDefinition[key], 'subscribeMe'))) {
									// state is writeable or has subscribeMe Property -> subscribe it
									this.log.silly(`${logPrefix} ${objOrg?.name} - subscribing state '${logMsgState}'`);
									await this.subscribeStatesAsync(`${channel}.${stateId}`);

									this.subscribedList.push(`${channel}.${stateId}`);
								}

								if (objValues && (Object.hasOwn(objValues, key) || (Object.hasOwn(objValues, treeDefinition[key].valFromProperty)))) {
									const val = treeDefinition[key].readVal ? await treeDefinition[key].readVal(objValues[valKey], this, this.cache, objOrg) : objValues[valKey];

									let changedObj: any = undefined

									if (key === 'last_seen' || key === 'first_seen' || key === 'rundate') {
										// set lc to last_seen value
										changedObj = await this.setStateChangedAsync(`${channel}.${stateId}`, { val: val, lc: val * 1000 }, true);
									} else {
										changedObj = await this.setStateChangedAsync(`${channel}.${stateId}`, val, true);
									}

									if (!isAdapterStart && changedObj && Object.hasOwn(changedObj, 'notChanged') && !changedObj.notChanged) {
										this.log.silly(`${logPrefix} value of state '${logMsgState}' changed to ${val}`);
									}
								} else {
									if (!Object.hasOwn(treeDefinition[key], 'id')) {
										// only report it if it's not a custom defined state
										this.log.debug(`${logPrefix} ${objOrg?.name} - property '${logMsgState}' not exists in bootstrap values (sometimes this option may first need to be activated / used in the Unifi Network application or will update by an event)`);
									}
								}
							} else {
								// channel is on blacklist
								// delete also at runtime, because some properties are only available on websocket data
								if (await this.objectExists(`${channel}.${stateId}`)) {
									await this.delObjectAsync(`${channel}.${stateId}`);

									this.log.info(`${logPrefix} '${objOrg?.name}' ${logDetails ? `(${logDetails}) ` : ''}state '${channel}.${stateId}' delete, ${isWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
								}
							}
						} else {
							// it's a channel from type object
							if (Object.hasOwn(treeDefinition[key], 'object') && Object.hasOwn(objValues, key)) {
								const idChannelAppendix = Object.hasOwn(treeDefinition[key], 'idChannel') ? treeDefinition[key].idChannel : key
								const idChannel = `${channel}.${idChannelAppendix}`;

								if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && _.some(blacklistFilter, (x) => x.id.startsWith(`${filterId}${idChannelAppendix}`))) || Object.hasOwn(treeDefinition[key], 'required')) {
									await this.createOrUpdateChannel(`${idChannel}`, Object.hasOwn(treeDefinition[key], 'channelName') ? treeDefinition[key].channelName : key, Object.hasOwn(treeDefinition[key], 'icon') ? treeDefinition[key].icon : undefined, isAdapterStart);
									await this.createOrUpdateGenericState(`${idChannel}`, treeDefinition[key].object, objValues[key], blacklistFilter, isWhiteList, objOrg, objOrgValues[key], isAdapterStart, `${filterId}${idChannelAppendix}.`, isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` }));
								} else {
									// channel is on blacklist
									if (await this.objectExists(idChannel)) {
										await this.delObjectAsync(idChannel, { recursive: true });
										this.log.info(`${logPrefix} '${objOrg?.name}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel} delete, ${isWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
									}
								}
							}

							// it's a channel from type array
							if (Object.hasOwn(treeDefinition[key], 'array') && Object.hasOwn(objValues, key)) {

								if (objValues[key] !== null && objValues[key].length > 0) {
									const idChannelAppendix = Object.hasOwn(treeDefinition[key], 'idChannel') ? treeDefinition[key].idChannel : key
									const idChannel = `${channel}.${idChannelAppendix}`;

									if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && _.some(blacklistFilter, (x) => x.id.startsWith(`${filterId}${idChannelAppendix}`))) || Object.hasOwn(treeDefinition[key], 'required')) {
										await this.createOrUpdateChannel(`${idChannel}`, Object.hasOwn(treeDefinition[key], 'channelName') ? treeDefinition[key].channelName : key, Object.hasOwn(treeDefinition[key], 'icon') ? treeDefinition[key].icon : undefined, isAdapterStart);

										const arrayNumberAdd = Object.hasOwn(treeDefinition[key], 'arrayStartNumber') ? treeDefinition[key].arrayStartNumber : 0

										for (let i = 0; i <= objValues[key].length - 1; i++) {
											let nr = i + arrayNumberAdd;

											if (objValues[key][i] !== null && objValues[key][i] !== undefined) {
												let idChannelArray: string | undefined = myHelper.zeroPad(nr, treeDefinition[key].arrayChannelIdZeroPad || 0);

												if (Object.hasOwn(treeDefinition[key], 'arrayChannelIdFromProperty')) {
													idChannelArray = treeDefinition[key].arrayChannelIdFromProperty(objOrgValues[key][i], i, this);
												} else if (Object.hasOwn(treeDefinition[key], 'arrayChannelIdPrefix')) {
													idChannelArray = treeDefinition[key].arrayChannelIdPrefix + myHelper.zeroPad(nr, treeDefinition[key].arrayChannelIdZeroPad || 0);
												}

												if (idChannelArray !== undefined) {
													await this.createOrUpdateChannel(`${idChannel}.${idChannelArray}`, Object.hasOwn(treeDefinition[key], 'arrayChannelNameFromProperty') ? treeDefinition[key].arrayChannelNameFromProperty(objOrgValues[key][i], this) : treeDefinition[key].arrayChannelNamePrefix + nr || nr.toString(), undefined, true)
													await this.createOrUpdateGenericState(`${idChannel}.${idChannelArray}`, treeDefinition[key].array, objValues[key][i], blacklistFilter, isWhiteList, objOrg, objOrgValues[key][i], true, `${filterId}${idChannelAppendix}.`, isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` }));
												}
											}
										}
									} else {
										// channel is on blacklist, wlan is comming from realtime api
										if (await this.objectExists(idChannel)) {
											await this.delObjectAsync(idChannel, { recursive: true });
											this.log.info(`${logPrefix} '${objOrg?.name}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel} delete, ${isWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
										}
									}
								}
							}
						}
					} catch (error) {
						this.log.error(`${logPrefix} [id: ${key}, ${logDetails ? `${logDetails}, ` : ''}key: ${key}] error: ${error}, stack: ${error.stack}, data: ${JSON.stringify(objValues[key])}`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async getCommonGenericState(id: string, treeDefinition: { [key: string]: myCommonState }, objOrg, logMsgState: string) {
		const logPrefix = '[getCommonGenericState]:';

		try {
			let name: ioBroker.StringOrTranslated = id;

			if (treeDefinition[id].name) {
				const i18n = myI18n.getTranslatedObject(treeDefinition[id].name);

				name = Object.keys(i18n).length > 1 ? i18n : treeDefinition[id].name;
			}

			const common: ioBroker.StateCommon = {
				name: name,
				type: treeDefinition[id].iobType,
				read: (treeDefinition[id].read !== undefined) ? treeDefinition[id].read : true,
				write: (treeDefinition[id].write !== undefined) ? treeDefinition[id].write : false,
				role: treeDefinition[id].role ? treeDefinition[id].role : 'state',
			};

			if (treeDefinition[id].unit) common.unit = treeDefinition[id].unit;

			if (treeDefinition[id].min || treeDefinition[id].min === 0) common.min = treeDefinition[id].min;

			if (treeDefinition[id].max || treeDefinition[id].max === 0) common.max = treeDefinition[id].max;

			if (treeDefinition[id].step) common.step = treeDefinition[id].step;

			if (treeDefinition[id].expert) common.expert = treeDefinition[id].expert;

			if (treeDefinition[id].def || treeDefinition[id].def === 0 || treeDefinition[id].def === false) common.def = treeDefinition[id].def;

			if (treeDefinition[id].states) {
				common.states = treeDefinition[id].states;
			} else if (Object.hasOwn(treeDefinition[id], 'statesFromProperty')) {
				const statesFromProp = myHelper.getAllowedCommonStates(treeDefinition[id].statesFromProperty, objOrg);

				common.states = statesFromProp;
				this.log.debug(`${logPrefix} ${objOrg?.name} - set allowed common.states for '${logMsgState}' (from: ${treeDefinition[id].statesFromProperty})`);
			}

			if (treeDefinition[id].desc) common.desc = treeDefinition[id].desc;

			return common;
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}

		return undefined;
	}

	//#endregion

	//#region WS Listener

	/**
	 * Websocket pong received, sets the aliveTimestamp to the current timestamp
	 */
	async onPongMessage(): Promise<void> {
		const logPrefix = '[onPongMessage]:';

		try {
			this.aliveTimestamp = moment().valueOf();
			this.log.silly('ping pong');
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkMessage(event: NetworkEventDevice | NetworkEventClient | NetworkEvent | NetworkEventSpeedTest) {
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
			} else {
				if (!this.eventsToIngnore.includes(event.meta.message)) {
					this.log.debug(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! data: ${JSON.stringify(event.data)}`);
				}

				// if (!event.meta.message.includes('unifi-device:sync') && !event.meta.message.includes('session-metadata:sync')) {

				// }
			}

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkEvent(event: NetworkEvent) {
		const logPrefix = '[onNetworkEvent]:';

		try {
			if (event && event.data) {
				for (const myEvent of event.data) {
					if (WebSocketEvent.client.Connected.includes(myEvent.key) || WebSocketEvent.client.Disconnected.includes(myEvent.key)) {
						// Client connect or disconnect

						this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.client.connected(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.Roamed.includes(myEvent.key)) {
						// Client roamed between AP's

						this.log.debug(`${logPrefix} event 'roamed' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.client.roamed(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.RoamedRadio.includes(myEvent.key)) {
						// Client roamed radio -> change channel

						this.log.debug(`${logPrefix} event 'roamed radio' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.client.roamedRadio(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.client.Blocked.includes(myEvent.key) || WebSocketEvent.client.Unblocked.includes(myEvent.key)) {
						// Client blocked or unblocked

						this.log.debug(`${logPrefix} event 'block / unblock' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.client.block(event.meta, myEvent, this, this.cache);

					} else if (WebSocketEvent.device.Restarted.includes(myEvent.key)) {
						// Device connect or disconnect

						this.log.debug(`${logPrefix} event 'restarted' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.device.restarted(event.meta, myEvent, this, this.cache);
					} else if (WebSocketEvent.device.Connected.includes(myEvent.key) || WebSocketEvent.device.Disconnected.includes(myEvent.key)) {
						// Device restarted

						this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);

						eventHandler.device.connected(event.meta, myEvent, this, this.cache);
					} else if (WebSocketEvent.device.ChannelChanged.includes(myEvent.key)) {
						this.log.debug(`${logPrefix} event 'AP channel changed' - not implemented (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
					} else {
						this.log.warn(`${logPrefix} not implemented event (${myEvent.key ? `key: ${myEvent.key},` : ''}) - Please report this to the developer and creating an issue on github! (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkClientEvent(events: NetworkEventClient) {
		const logPrefix = '[onNetworkClientEvent]:';

		try {

			if (events.meta.message.endsWith(':disconnected')) {
				for (const event of events.data) {
					if (event.type === 'VPN') {
						// VPN disconnect
						this.log.debug(`${logPrefix} event 'vpn disconnected' (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);

						eventHandler.client.vpnDisconnect(events.meta, event as myNetworkClient, this, this.cache);
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

	async onNetworkUserEvent(events: NetworkEventClient) {
		const logPrefix = '[onNetworkUserEvent]:';

		try {
			if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
				if (events && events.data) {
					for (let event of events.data) {
						this.log.debug(`${logPrefix} client event (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);

						if (events.meta.message === 'user:delete') {
							// client removed client from unifi-controller
							eventHandler.user.clientRemoved(events.meta, event, this, this.cache);
						} else if (events.meta.message === 'user:sync') {
							// client updated
							const name = event.unifi_device_info_from_ucore?.name || event.display_name || event.name || event.hostname;
							const idChannel = !event.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests;

							event.last_seen = event.last_seen >= this.cache.clients[event.mac]?.last_seen ? event.last_seen : this.cache.clients[event.mac]?.last_seen;

							if ((!this.config.clientIsWhiteList && !_.some(this.config.clientBlackList, { mac: event.mac })) || (this.config.clientIsWhiteList && _.some(this.config.clientBlackList, { mac: event.mac }))) {
								this.log.debug(`${logPrefix} update ${!event.is_guest ? 'client' : 'guest'} '${this.cache.clients[event.mac]?.name}'`);

								await this.createOrUpdateDevice(`${idChannel}.${event.mac}`, name, `${this.namespace}.${idChannel}.${event.mac}.isOnline`, undefined, undefined, true);
								await this.createOrUpdateGenericState(`${idChannel}.${event.mac}`, tree.client.get(), event as myNetworkClient, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, this.cache.clients[event.mac], this.cache.clients[event.mac], true);
							}
						}
					}
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkWlanConfEvent(event: NetworkEventWlanConfig) {
		const logPrefix = '[onNetworkWlanConfEvent]:';

		try {
			if (this.config.wlanConfigEnabled) {
				this.log.debug(`${logPrefix} wlan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					eventHandler.wlanConf.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateWlanConfig(event.data as NetworkWlanConfig[]);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkLanConfEvent(event: NetworkEventLanConfig) {
		const logPrefix = '[onNetworkLanConfEvent]:';

		try {
			if (this.config.lanConfigEnabled) {
				this.log.debug(`${logPrefix} lan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);

				if (event.meta.message.endsWith(':delete')) {
					eventHandler.lanConf.deleted(event.meta, event.data, this, this.cache);
				} else {
					await this.updateLanConfig(event.data as NetworkLanConfig[]);
				}
			}
		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkSpeedTestEvent(event: NetworkEventSpeedTest) {
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
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined) {
	// compact mode
	return new UnifiNetwork(options);
}