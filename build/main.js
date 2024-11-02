/*
 * Created with @iobroker/create-adapter v2.6.5
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
// API imports
import { WebSocketListener, NetworkApi } from './lib/api/network-api.js';
// Adapter imports
import * as myHelper from './lib/helper.js';
import { DeviceImages } from './lib/images-device.js';
import { deviceDefinition } from './lib/definition-device.js';
class UnifiNetwork extends utils.Adapter {
    ufn = undefined;
    isConnected = false;
    aliveInterval = 15;
    aliveTimeout = undefined;
    aliveTimestamp = moment().valueOf();
    connectionMaxRetries = 200;
    connectionRetries = 0;
    constructor(options = {}) {
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
    async onReady() {
        const logPrefix = '[onReady]:';
        try {
            moment.locale(this.language);
            await utils.I18n.init('admin', this);
            this.log.warn(JSON.stringify(utils.I18n.getTranslatedObject('MAC Address')));
            if (this.config.host, this.config.user, this.config.password) {
                this.ufn = new NetworkApi(this.config.host, this.config.user, this.config.password, this.log);
                // listen to realtime events (must be given as function to be able to use this)
                this.networkEventsListener();
                await this.establishConnection(true);
                // await this.ufn.login();
                // const test = await this.ufn.retrievData(this.ufn.getApiEndpoint(ApiEndpoints.self));
                // this.log.warn(JSON.stringify(test));
                // this.ufn.launchEventsWs();
            }
            else {
                this.log.warn(`${logPrefix} no login credentials in adapter config set!`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        const logPrefix = '[onUnload]:';
        try {
            if (this.aliveTimeout)
                clearTimeout(this.aliveTimeout);
            if (this.ufn) {
                this.ufn.logout();
                this.setConnectionStatus(false);
                this.log.info(`${logPrefix} Logged out successfully from the Unifi-Protect controller API. (host: ${this.config.host})`);
            }
            callback();
        }
        catch (e) {
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
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
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
    async establishConnection(isAdapterStart = false) {
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /** Login into NVR and load bootstrap data
     * @returns {Promise<boolean>} Connection status
     */
    async login() {
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
                    }
                    else {
                        this.log.error(`${logPrefix} unable to start ws listener`);
                    }
                }
                else {
                    this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.config.host})`);
                }
            }
        }
        catch (error) {
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
                    }
                    else {
                        this.log.error(`${logPrefix} Connection to the Unifi-Network controller is down for more then ${this.connectionMaxRetries * this.aliveInterval}s, stopping the adapter.`);
                        this.stop({ reason: 'too many connection retries' });
                    }
                }
                else {
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /** Set adapter info.connection state and internal var
     * @param {boolean} isConnected
     */
    async setConnectionStatus(isConnected) {
        const logPrefix = '[setConnectionStatus]:';
        try {
            this.isConnected = isConnected;
            await this.setState('info.connection', isConnected, true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    //#endregion
    async updateData() {
        const logPrefix = '[updateData]:';
        try {
            await this.updateDevices(await this.ufn.getDevices());
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateDevices(data) {
        const logPrefix = '[updateDevices]:';
        try {
            // this.log.warn(JSON.stringify(data));
            const idChannel = 'devices';
            this.createOrUpdateChannel(idChannel, 'devices');
            for (let device of data) {
                this.log.info(`${logPrefix} Discovered ${device.name} (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname})`);
                this.createOrUpdateChannel(`${idChannel}.${device.mac}`, device.name, DeviceImages[device.model] || undefined);
                await this.createGenericState(`${idChannel}.${device.mac}`, deviceDefinition, device, 'devices', device);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createOrUpdateChannel(id, name, icon = undefined) {
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
            }
            else {
                const obj = await this.getObjectAsync(id);
                if (obj && obj.common) {
                    if (!myHelper.isChannelCommonEqual(obj.common, common)) {
                        await this.extendObject(id, { common: common });
                        this.log.info(`${logPrefix} channel updated '${id}'`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /** Create all states for a devices, that are defined in {@link myDeviceTypes}
     * @param {string} channel id of channel (e.g. camera id)
     * @param {object} deviceTypes defined states and types in {@link myDeviceTypes}
     * @param {object} objValues ufp bootstrap values of device
     * @param {string} filterComparisonId id for filter
     */
    async createGenericState(channel, deviceTypes, objValues, filterComparisonId, objOrg) {
        const logPrefix = '[createGenericState]:';
        try {
            // {@link myDevices}
            for (const id in deviceTypes) {
                let logMsgState = '.' + `${channel}.${id}`.split('.')?.slice(1)?.join('.');
                try {
                    if (id && objValues[id] && Object.prototype.hasOwnProperty.call(deviceTypes[id], 'iobType') && !Object.prototype.hasOwnProperty.call(deviceTypes[id], 'object') && !Object.prototype.hasOwnProperty.call(deviceTypes[id], 'array')) {
                        // if we have a 'iobType' property, then it's a state
                        let stateId = id;
                        if (Object.prototype.hasOwnProperty.call(deviceTypes[id], 'id')) {
                            // if we have a custom state, use defined id
                            stateId = deviceTypes[id].id;
                        }
                        logMsgState = '.' + `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');
                        // if (!this.blacklistedStates.includes(`${filterComparisonId}.${id}`)) {
                        // 	// not on blacklist
                        if (!await this.objectExists(`${channel}.${stateId}`)) {
                            // create State
                            this.log.debug(`${logPrefix} ${objOrg.name} - creating state '${logMsgState}'`);
                            const obj = {
                                type: 'state',
                                common: await this.getCommonGenericState(id, deviceTypes, objOrg, logMsgState),
                                native: {}
                            };
                            // @ts-ignore
                            await this.setObjectAsync(`${channel}.${stateId}`, obj);
                        }
                        else {
                            // update State if needed
                            const obj = await this.getObjectAsync(`${channel}.${stateId}`);
                            const commonUpdated = await this.getCommonGenericState(id, deviceTypes, objOrg, logMsgState);
                            if (obj && obj.common) {
                                if (!myHelper.isStateCommonEqual(obj.common, commonUpdated)) {
                                    await this.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
                                    this.log.debug(`${logPrefix} ${objOrg.name} - updated common properties of state '${logMsgState}'`);
                                }
                            }
                        }
                        if (deviceTypes[id].write && deviceTypes[id].write === true) {
                            // state is writeable -> subscribe it
                            this.log.silly(`${logPrefix} ${objValues.name} - subscribing state '${logMsgState}'`);
                            await this.subscribeStatesAsync(`${channel}.${stateId}`);
                        }
                        if (objValues && Object.prototype.hasOwnProperty.call(objValues, id)) {
                            // write current val to state
                            if (deviceTypes[id].readVal) {
                                await this.setStateChangedAsync(`${channel}.${stateId}`, deviceTypes[id].readVal(objValues[id]), true);
                            }
                            else {
                                await this.setStateChangedAsync(`${channel}.${stateId}`, objValues[id], true);
                            }
                        }
                        else {
                            if (!Object.prototype.hasOwnProperty.call(deviceTypes[id], 'id')) {
                                // only report it if it's not a custom defined state
                                this.log.debug(`${logPrefix} ${objOrg.name} - property '${logMsgState}' not exists in bootstrap values (sometimes this option may first need to be activated / used in the Unifi Protect application or will update by an event)`);
                            }
                        }
                        // } else {
                        // 	// is on blacklist
                        // 	if (await this.objectExists(`${channel}.${stateId}`)) {
                        // 		this.log.info(`${logPrefix} ${this.ufp?.getDeviceName(objOrg)} - deleting blacklisted state '${logMsgState}'`);
                        // 		await this.delObjectAsync(`${channel}.${stateId}`);
                        // 	} else {
                        // 		this.log.debug(`${logPrefix} ${this.ufp?.getDeviceName(objOrg)} - skip creating state '${logMsgState}', because it is on blacklist`);
                        // 	}
                        // }
                    }
                    else {
                        // if (!this.blacklistedStates.includes(`${filterComparisonId}.${id}`)) {
                        // it's a channel from type object
                        if (objValues[id] && objValues[id].constructor.name === 'Object' && Object.prototype.hasOwnProperty.call(deviceTypes[id], 'object')) {
                            await this.createOrUpdateChannel(`${channel}.${id}`, Object.prototype.hasOwnProperty.call(deviceTypes[id], 'channelName') ? deviceTypes[id].channelName : id, Object.prototype.hasOwnProperty.call(deviceTypes[id], 'icon') ? deviceTypes[id].icon : undefined);
                            await this.createGenericState(`${channel}.${id}`, deviceTypes[id].object, objValues[id], `${filterComparisonId}.${id}`, objOrg);
                        }
                        // it's a channel from type array
                        if (objValues[id] && objValues[id].constructor.name === 'Array' && Object.prototype.hasOwnProperty.call(deviceTypes[id], 'array')) {
                            await this.createOrUpdateChannel(`${channel}.${id}`, Object.prototype.hasOwnProperty.call(deviceTypes[id], 'channelName') ? deviceTypes[id].channelName : id, Object.prototype.hasOwnProperty.call(deviceTypes[id], 'icon') ? deviceTypes[id].icon : undefined);
                            for (let i = 0; i <= objValues[id].length - 1; i++) {
                                const idChannel = `${channel}.${id}.${deviceTypes[id].idChannelPrefix}${myHelper.zeroPad(i, deviceTypes[id].zeroPad)}`;
                                await this.createOrUpdateChannel(idChannel, Object.prototype.hasOwnProperty.call(deviceTypes[id], 'arrayChannelNamePrefix') ? deviceTypes[id].arrayChannelNamePrefix + i : i);
                                await this.createGenericState(idChannel, deviceTypes[id].array, objValues[id][i], `${filterComparisonId}.${id}`, objOrg);
                            }
                        }
                        // } else {
                        // 	if (await this.objectExists(`${channel}.${id}`)) {
                        // 		this.log.info(`${logPrefix} ${this.ufp?.getDeviceName(objOrg)} - deleting blacklisted channel '${logMsgState}'`);
                        // 		await this.delObjectAsync(`${channel}.${id}`, { recursive: true });
                        // 	} else {
                        // 		this.log.debug(`${logPrefix} ${this.ufp?.getDeviceName(objOrg)} - skip creating channel '${logMsgState}', because it is on blacklist`);
                        // 	}
                        // }
                    }
                }
                catch (error) {
                    this.log.error(`${logPrefix} [id: ${id}] error: ${error}, stack: ${error.stack}`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async getCommonGenericState(id, deviceTypes, objOrg, logMsgState) {
        const logPrefix = '[getCommonGenericState]:';
        try {
            const common = {
                name: deviceTypes[id].name ? deviceTypes[id].name : id,
                type: deviceTypes[id].iobType,
                read: deviceTypes[id].read ? deviceTypes[id].read : true,
                write: deviceTypes[id].write ? deviceTypes[id].write : false,
                role: deviceTypes[id].role ? deviceTypes[id].role : 'state',
            };
            if (deviceTypes[id].unit)
                common.unit = deviceTypes[id].unit;
            if (deviceTypes[id].min || deviceTypes[id].min === 0)
                common.min = deviceTypes[id].min;
            if (deviceTypes[id].max || deviceTypes[id].max === 0)
                common.max = deviceTypes[id].max;
            if (deviceTypes[id].step)
                common.step = deviceTypes[id].step;
            if (deviceTypes[id].states) {
                common.states = deviceTypes[id].states;
            }
            else if (Object.prototype.hasOwnProperty.call(deviceTypes[id], 'statesFromProperty')) {
                const statesFromProp = myHelper.getAllowedCommonStates(deviceTypes[id].statesFromProperty, objOrg);
                common.states = statesFromProp;
                this.log.debug(`${logPrefix} ${objOrg.name} - set allowed common.states for '${logMsgState}' (from: ${deviceTypes[id].statesFromProperty})`);
            }
            if (deviceTypes[id].desc)
                common.desc = deviceTypes[id].desc;
            return common;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    //#region WS Listener
    async networkEventsListener() {
        const logPrefix = '[onProtectEvent]:';
        try {
            this.ufn.on(WebSocketListener.device, (event) => this.onNetworkDeviceEvent(event));
            // this.ufn.on(WebSocketListener.client, (event) => this.onNetworkClientEvent(event));
            // this.ufn.on(WebSocketListener.events, (event) => this.onNetworkEvents(event));
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkDeviceEvent(event) {
        const logPrefix = '[onNetworkDeviceEvent]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            // this.log.warn(JSON.stringify(event.meta) + ' - count: ' + event.data.length);
            // this.log.warn(JSON.stringify(event.data[0].mac));
            // {"message":"session-metadata:sync","rc":"ok"} -> beim start
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkClientEvent(event) {
        const logPrefix = '[onNetworkClientEvent]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            this.log.warn(JSON.stringify(event.meta) + ' - count: ' + event.data.length);
            // {"message":"session-metadata:sync","rc":"ok"} -> beim start
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkEvents(event) {
        const logPrefix = '[onNetworkEvents]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            this.log.error(JSON.stringify(event.meta) + ' - count: ' + event.data.length);
            // {"message":"session-metadata:sync","rc":"ok"} -> beim start
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
// otherwise start the instance directly
(() => new UnifiNetwork())();
