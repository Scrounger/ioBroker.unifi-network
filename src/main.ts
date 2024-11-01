/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';

// API imports
import { WebSocketListener, NetworkApi } from './lib/api/network-api.js';
import { NetworkEvent } from './lib/api/network-types.js';
import { NetworkDevice } from './lib/api/network-types-device.js';

// Adapter imports
import * as myHelper from './lib/helper.js';
import { DeviceImages } from './lib/images-device.js';


class UnifiNetwork extends utils.Adapter {
	ufn: NetworkApi = undefined;
	isConnected: boolean = false;

	aliveInterval: number = 15;
	aliveTimeout: NodeJS.Timeout | undefined = undefined;
	aliveTimestamp: number = moment().valueOf();

	connectionMaxRetries: number = 200;
	connectionRetries: number = 0;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'unifi-network',
			useFormatDate: true
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		const logPrefix = '[onReady]:';

		try {
			moment.locale(this.language);

			if (this.config.host, this.config.user, this.config.password) {
				this.ufn = new NetworkApi(this.config.host, this.config.user, this.config.password, this.log);

				// listen to realtime events (must be given as function to be able to use this)
				this.networkEventsListener();

				await this.establishConnection(true);




				// await this.ufn.login();

				// const test = await this.ufn.retrievData(this.ufn.getApiEndpoint(ApiEndpoints.self));

				// this.log.warn(JSON.stringify(test));

				// this.ufn.launchEventsWs();


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
			if (this.aliveTimeout) clearTimeout(this.aliveTimeout);

			if (this.ufn) {
				this.ufn.logout();
				this.setConnectionStatus(false);
				this.log.info(`${logPrefix} Logged out successfully from the Unifi-Protect controller API. (host: ${this.config.host})`);
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
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

	//#region Establish Connection

	/**
	 * Establish Connection to NVR and starting the alive checker
	 * @param isAdapterStart 
	 */
	async establishConnection(isAdapterStart: boolean = false) {
		const logPrefix = '[establishConnection]:';

		try {
			if (await this.login()) {
				await this.updateData();
			}

			// start the alive checker
			if (this.aliveTimeout) {
				clearTimeout(this.aliveTimeout);
				this.aliveTimeout = null;
			}

			this.aliveTimeout = setTimeout(() => {
				this.aliveChecker();
			}, this.aliveInterval * 1000);

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
					this.log.info(`${logPrefix} Logged in successfully to the Unifi-Network controller (host: ${this.config.host})`);

					if (await this.ufn.launchEventsWs()) {
						this.log.info(`${logPrefix} WebSocket conncection to realtime API successfully established`);

						await this.setConnectionStatus(true);
						return true;
					} else {
						this.log.error(`${logPrefix} unable to start ws listener`);
					}
				} else {
					this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.config.host})`);
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

				if (diff >= this.aliveInterval) {
					this.log.warn(`${logPrefix} No connection to the Unifi-Network controller -> restart connection (retries: ${this.connectionRetries})`);
					this.ufn.logout();

					await this.setConnectionStatus(false);

					if (this.connectionRetries < this.connectionMaxRetries) {
						this.connectionRetries++;

						await this.establishConnection();
					} else {
						this.log.error(`${logPrefix} Connection to the Unifi-Network controller is down for more then ${this.connectionMaxRetries * this.aliveInterval}s, stopping the adapter.`);
						this.stop({ reason: 'too many connection retries' });
					}
				} else {
					this.log.silly(`${logPrefix} Connection to the Unifi-Network controller is alive (last alive signal is ${diff}s old)`);

					await this.setConnectionStatus(true);
					this.connectionRetries = 0;

					if (this.aliveTimeout) {
						clearTimeout(this.aliveTimeout);
						this.aliveTimeout = null;
					}

					this.aliveTimeout = setTimeout(() => {
						this.aliveChecker();
					}, this.aliveInterval * 1000);
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

	//#endregion

	async updateData() {
		const logPrefix = '[updateData]:';

		try {
			await this.updateDevices(await this.ufn.getDevices());

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async updateDevices(data: NetworkDevice[]) {
		const logPrefix = '[updateDevices]:';

		try {
			const idChannel = 'devices';
			this.createOrUpdateChannel(idChannel, 'devices');

			for (let device of data) {
				this.log.info(`${logPrefix} Discovered ${device.name} (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname})`);

				this.createOrUpdateChannel(`${idChannel}.${device.mac}`, device.name, DeviceImages[device.model] || undefined);

			}

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	private async createOrUpdateChannel(id: string, name: string, icon: string = undefined): Promise<void> {
		const logPrefix = '[createOrUpdateChannel]:';

		try {
			let common = {
				name: name,
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
				const obj = await this.getObjectAsync(id);

				if (obj && obj.common) {
					if (!myHelper.isChannelCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
						await this.extendObject(id, { common: common });
						this.log.info(`${logPrefix} channel updated '${id}'`);
					}
				}
			}
		} catch (error: any) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	//#region WS Listener

	async networkEventsListener() {
		const logPrefix = '[onProtectEvent]:';

		try {
			this.ufn.on(WebSocketListener.device, (event) => this.onNetworkDeviceEvent(event));
			// this.ufn.on(WebSocketListener.client, (event) => this.onNetworkClientEvent(event));
			// this.ufn.on(WebSocketListener.events, (event) => this.onNetworkEvents(event));

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkDeviceEvent(event: NetworkEvent) {
		const logPrefix = '[onNetworkDeviceEvent]:';

		try {
			this.aliveTimestamp = moment().valueOf();

			// this.log.warn(JSON.stringify(event.meta) + ' - count: ' + event.data.length);
			// this.log.warn(JSON.stringify(event.data[0].mac));

			// {"message":"session-metadata:sync","rc":"ok"} -> beim start

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkClientEvent(event: NetworkEvent) {
		const logPrefix = '[onNetworkClientEvent]:';

		try {
			this.aliveTimestamp = moment().valueOf();

			this.log.warn(JSON.stringify(event.meta) + ' - count: ' + event.data.length);

			// {"message":"session-metadata:sync","rc":"ok"} -> beim start

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}

	async onNetworkEvents(event: NetworkEvent) {
		const logPrefix = '[onNetworkEvents]:';

		try {
			this.aliveTimestamp = moment().valueOf();

			this.log.error(JSON.stringify(event.meta) + ' - count: ' + event.data.length);

			// {"message":"session-metadata:sync","rc":"ok"} -> beim start

		} catch (error) {
			this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
		}
	}
	//#endregion
}

// otherwise start the instance directly
(() => new UnifiNetwork())();