/*
 * Created with @iobroker/create-adapter v2.6.5
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
// API imports
import { NetworkApi } from './lib/api/network-api.js';
// Adapter imports
import * as myHelper from './lib/helper.js';
import { DeviceImages } from './lib/images-device.js';
import { WebSocketEventKeys, WebSocketEventMessages } from './lib/myTypes.js';
import { clientTree } from './lib/tree-client.js';
import { deviceTree } from './lib/tree-device.js';
class UnifiNetwork extends utils.Adapter {
    ufn = undefined;
    isConnected = false;
    aliveInterval = 30;
    aliveTimeout = undefined;
    aliveTimestamp = moment().valueOf();
    connectionMaxRetries = 200;
    connectionRetries = 0;
    eventListener = (event) => this.onNetworkMessage(event);
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
            if (this.config.host, this.config.user, this.config.password) {
                this.ufn = new NetworkApi(this.config.host, this.config.user, this.config.password, this.log);
                await this.establishConnection(true);
                this.ufn.on('message', this.eventListener);
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
            this.removeListener('message', this.eventListener);
            if (this.aliveTimeout)
                clearTimeout(this.aliveTimeout);
            if (this.ufn) {
                this.ufn.logout();
                this.setConnectionStatus(false);
                this.log.info(`${logPrefix} Logged out successfully from the Unifi-Network controller API. (host: ${this.config.host})`);
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
            this.createOrUpdateChannel('devices', 'unifi devices', undefined, true);
            await this.updateDevices(await this.ufn.getDevices(), true);
            await this.updateClients(await this.ufn.getClients(), true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateDevices(data, isAdapterStart = false) {
        const logPrefix = '[updateDevices]:';
        try {
            if (this.connected && this.isConnected) {
                const idChannel = 'devices';
                if (isAdapterStart)
                    this.log.info(`${logPrefix} Discovered ${data.length} devices`);
                for (let device of data) {
                    // if (isAdapterStart) this.log.debug(`${logPrefix} Discovered ${device.name} (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname})`);
                    this.createOrUpdateDevice(`${idChannel}.${device.mac}`, device.name, `${this.namespace}.${idChannel}.${device.mac}.isOnline`, `${this.namespace}.${idChannel}.${device.mac}.hasError`, DeviceImages[device.model] || undefined, isAdapterStart);
                    await this.createGenericState(`${idChannel}.${device.mac}`, deviceTree, device, 'devices', device, isAdapterStart);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateClients(data, isAdapterStart = false) {
        const logPrefix = '[updateClients]:';
        try {
            if (this.connected && this.isConnected) {
                const idChannel = 'clients';
                if (isAdapterStart)
                    this.log.info(`${logPrefix} Discovered ${data.length} clients`);
                for (let client of data) {
                    // if (isAdapterStart) this.log.debug(`${logPrefix} Discovered ${client.name} (IP: ${client.ip}, mac: ${client.mac}, state: ${client.status})`);
                    this.createOrUpdateDevice(`${idChannel}.${client.mac}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, `${this.namespace}.${idChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart);
                    await this.createGenericState(`${idChannel}.${client.mac || 'VPN - ' + client.ip}`, clientTree, client, 'clients', client, isAdapterStart);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * create or update a device object, update will only be done on adapter start
     * @param id
     * @param name
     * @param onlineId
     * @param icon
     * @param isAdapterStart
     */
    async createOrUpdateDevice(id, name, onlineId, errorId = undefined, icon = undefined, isAdapterStart = false) {
        const logPrefix = '[createOrUpdateDevice]:';
        try {
            const i18n = utils.I18n.getTranslatedObject(name);
            let common = {
                name: Object.keys(i18n).length > 1 ? i18n : name,
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
            }
            else {
                if (isAdapterStart) {
                    const obj = await this.getObjectAsync(id);
                    if (obj && obj.common) {
                        if (!myHelper.isDeviceCommonEqual(obj.common, common)) {
                            await this.extendObject(id, { common: common });
                            this.log.debug(`${logPrefix} device updated '${id}'`);
                        }
                    }
                }
            }
        }
        catch (error) {
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
    async createOrUpdateChannel(id, name, icon = undefined, isAdapterStart = false) {
        const logPrefix = '[createOrUpdateChannel]:';
        try {
            const i18n = utils.I18n.getTranslatedObject(name);
            let common = {
                name: Object.keys(i18n).length > 1 ? i18n : name,
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
                if (isAdapterStart) {
                    const obj = await this.getObjectAsync(id);
                    if (obj && obj.common) {
                        if (!myHelper.isChannelCommonEqual(obj.common, common)) {
                            await this.extendObject(id, { common: common });
                            this.log.debug(`${logPrefix} channel updated '${id}'`);
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createGenericState(channel, treeDefinition, objValues, filterComparisonId, objOrg, isAdapterStart = false) {
        const logPrefix = '[createGenericState]:';
        try {
            if (this.connected && this.isConnected) {
                if (!isAdapterStart && this.config.updateInterval > 0) {
                    // only update data if lastSeen is older than configured in the adapter settings -> with this the load of the adapater can be reduced
                    const lastSeen = await this.getStateAsync(`${channel}.last_seen`);
                    if (lastSeen && lastSeen.val && moment().diff(lastSeen.val * 1000, 'seconds') < this.config.updateInterval) {
                        return;
                    }
                }
                for (const key in treeDefinition) {
                    let logMsgState = '.' + `${channel}.${key}`.split('.')?.slice(1)?.join('.');
                    try {
                        // if we have an own defined state which takes val from other property
                        const valKey = Object.prototype.hasOwnProperty.call(objValues, treeDefinition[key].valFromProperty) && treeDefinition[key].valFromProperty ? treeDefinition[key].valFromProperty : key;
                        if (key && (objValues[valKey] || objValues[valKey] === 0 || objValues[valKey] === false) && Object.prototype.hasOwnProperty.call(treeDefinition[key], 'iobType') && !Object.prototype.hasOwnProperty.call(treeDefinition[key], 'object') && !Object.prototype.hasOwnProperty.call(treeDefinition[key], 'array')) {
                            // if we have a 'iobType' property, then it's a state
                            let stateId = key;
                            if (Object.prototype.hasOwnProperty.call(treeDefinition[key], 'id')) {
                                // if we have a custom state, use defined id
                                stateId = treeDefinition[key].id;
                            }
                            logMsgState = '.' + `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');
                            // if (!this.blacklistedStates.includes(`${filterComparisonId}.${id}`)) {
                            // 	// not on blacklist
                            if (!await this.objectExists(`${channel}.${stateId}`)) {
                                // create State
                                this.log.silly(`${logPrefix} ${objOrg.name} - creating state '${logMsgState}'`);
                                const obj = {
                                    type: 'state',
                                    common: await this.getCommonGenericState(key, treeDefinition, objOrg, logMsgState),
                                    native: {}
                                };
                                // @ts-ignore
                                await this.setObjectAsync(`${channel}.${stateId}`, obj);
                            }
                            else {
                                // update State if needed (only on adapter start)
                                if (isAdapterStart) {
                                    const obj = await this.getObjectAsync(`${channel}.${stateId}`);
                                    const commonUpdated = await this.getCommonGenericState(key, treeDefinition, objOrg, logMsgState);
                                    if (obj && obj.common) {
                                        if (!myHelper.isStateCommonEqual(obj.common, commonUpdated)) {
                                            await this.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
                                            this.log.debug(`${logPrefix} ${objOrg.name} - updated common properties of state '${logMsgState}'`);
                                        }
                                    }
                                }
                            }
                            if (treeDefinition[key].write && treeDefinition[key].write === true) {
                                // ToDo - Handle when device is new during runtime
                                // state is writeable -> subscribe it
                                this.log.silly(`${logPrefix} ${objValues.name} - subscribing state '${logMsgState}'`);
                                await this.subscribeStatesAsync(`${channel}.${stateId}`);
                            }
                            if (objValues && (Object.prototype.hasOwnProperty.call(objValues, key) || (Object.prototype.hasOwnProperty.call(objValues, treeDefinition[key].valFromProperty)))) {
                                const val = treeDefinition[key].readVal ? await treeDefinition[key].readVal(objValues[valKey], this) : objValues[valKey];
                                let changedObj = await this.setStateChangedAsync(`${channel}.${stateId}`, val, true);
                                if (!isAdapterStart && changedObj && Object.prototype.hasOwnProperty.call(changedObj, 'notChanged') && !changedObj.notChanged) {
                                    this.log.silly(`${logPrefix} value of state '${logMsgState}' changed to ${val}`);
                                }
                            }
                            else {
                                if (!Object.prototype.hasOwnProperty.call(treeDefinition[key], 'id')) {
                                    // only report it if it's not a custom defined state
                                    this.log.debug(`${logPrefix} ${objOrg.name} - property '${logMsgState}' not exists in bootstrap values (sometimes this option may first need to be activated / used in the Unifi Network application or will update by an event)`);
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
                            if (objValues[key] && objValues[key].constructor.name === 'Object' && Object.prototype.hasOwnProperty.call(treeDefinition[key], 'object')) {
                                await this.createOrUpdateChannel(`${channel}.${key}`, Object.prototype.hasOwnProperty.call(treeDefinition[key], 'channelName') ? treeDefinition[key].channelName : key, Object.prototype.hasOwnProperty.call(treeDefinition[key], 'icon') ? treeDefinition[key].icon : undefined, isAdapterStart);
                                await this.createGenericState(`${channel}.${key}`, treeDefinition[key].object, objValues[key], `${filterComparisonId}.${key}`, objOrg, isAdapterStart);
                            }
                            // it's a channel from type array
                            if (objValues[key] && objValues[key].constructor.name === 'Array' && Object.prototype.hasOwnProperty.call(treeDefinition[key], 'array')) {
                                if (objValues[key].length > 0) {
                                    await this.createOrUpdateChannel(`${channel}.${key}`, Object.prototype.hasOwnProperty.call(treeDefinition[key], 'channelName') ? treeDefinition[key].channelName : key, Object.prototype.hasOwnProperty.call(treeDefinition[key], 'icon') ? treeDefinition[key].icon : undefined, isAdapterStart);
                                    for (let i = 0; i <= objValues[key].length - 1; i++) {
                                        const idChannel = `${channel}.${key}.${objValues[key][i][treeDefinition[key].arrayChannelIdFromProperty] || `${treeDefinition[key].arrayChannelIdPrefix || ''}${myHelper.zeroPad(i, treeDefinition[key].arrayChannelIdZeroPad || 0)}`}`;
                                        await this.createOrUpdateChannel(idChannel, objValues[key][i][treeDefinition[key].arrayChannelNameFromProperty] || treeDefinition[key].arrayChannelNamePrefix + i || i.toString(), undefined, isAdapterStart);
                                        await this.createGenericState(idChannel, treeDefinition[key].array, objValues[key][i], `${filterComparisonId}.${key}`, objOrg, isAdapterStart);
                                    }
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
                        this.log.error(`${logPrefix} [id: ${key}] error: ${error}, stack: ${error.stack}`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async getCommonGenericState(id, treeDefinition, objOrg, logMsgState) {
        const logPrefix = '[getCommonGenericState]:';
        try {
            let name = id;
            if (treeDefinition[id].name) {
                const i18n = utils.I18n.getTranslatedObject(treeDefinition[id].name);
                name = Object.keys(i18n).length > 1 ? i18n : treeDefinition[id].name;
            }
            const common = {
                name: name,
                type: treeDefinition[id].iobType,
                read: treeDefinition[id].read ? treeDefinition[id].read : true,
                write: treeDefinition[id].write ? treeDefinition[id].write : false,
                role: treeDefinition[id].role ? treeDefinition[id].role : 'state',
            };
            if (treeDefinition[id].unit)
                common.unit = treeDefinition[id].unit;
            if (treeDefinition[id].min || treeDefinition[id].min === 0)
                common.min = treeDefinition[id].min;
            if (treeDefinition[id].max || treeDefinition[id].max === 0)
                common.max = treeDefinition[id].max;
            if (treeDefinition[id].step)
                common.step = treeDefinition[id].step;
            if (treeDefinition[id].expert)
                common.expert = treeDefinition[id].expert;
            if (treeDefinition[id].states) {
                common.states = treeDefinition[id].states;
            }
            else if (Object.prototype.hasOwnProperty.call(treeDefinition[id], 'statesFromProperty')) {
                const statesFromProp = myHelper.getAllowedCommonStates(treeDefinition[id].statesFromProperty, objOrg);
                common.states = statesFromProp;
                this.log.debug(`${logPrefix} ${objOrg.name} - set allowed common.states for '${logMsgState}' (from: ${treeDefinition[id].statesFromProperty})`);
            }
            if (treeDefinition[id].desc)
                common.desc = treeDefinition[id].desc;
            return common;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    //#region WS Listener
    async onNetworkMessage(event) {
        const logPrefix = '[onNetworkMessage]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            if (event.meta.message === WebSocketEventMessages.device) {
                await this.updateDevices(event.data);
            }
            else if (event.meta.message === WebSocketEventMessages.client) {
                await this.updateClients(event.data);
            }
            else if (event.meta.message === WebSocketEventMessages.events) {
                await this.onNetworkEvent(event);
            }
            else {
                if (!event.meta.message.includes('unifi-device:sync') && !event.meta.message.includes('session-metadata:sync')) {
                    this.log.warn(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! data: ${JSON.stringify(event.data)}`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkEvent(event) {
        const logPrefix = '[onNetworkEvent]:';
        try {
            this.log.error(JSON.stringify(event.meta) + ' - ' + JSON.stringify(event.data));
            if (event && event.data) {
                for (const myEvent of event.data) {
                    if (!myEvent.key.includes('_Roam')) {
                        let mac = undefined;
                        let connected = false;
                        if (myEvent.key === WebSocketEventKeys.clientConnected || myEvent.key === WebSocketEventKeys.clientDisconnected) {
                            mac = myEvent.user;
                            connected = myEvent.key === WebSocketEventKeys.clientConnected;
                        }
                        else if ((myEvent.key === WebSocketEventKeys.guestConnected || myEvent.key === WebSocketEventKeys.guestDisconnected)) {
                            mac = myEvent.guest;
                            connected = myEvent.key === WebSocketEventKeys.guestConnected;
                        }
                        const id = `clients.${mac}.isOnline`;
                        if (await this.objectExists(id)) {
                            await this.setState(`clients.${mac}.isOnline`, connected, true);
                            if (await this.objectExists(`clients.${mac}`)) {
                                const obj = await this.getObjectAsync(`clients.${mac}`);
                                if (obj && obj.common && obj.common.name) {
                                    this.log.debug(`${logPrefix} client '${obj.common.name}' (${mac}) ${connected ? 'connected' : 'disconnected'}`);
                                }
                                else {
                                    this.log.debug(`${logPrefix} client '${mac}' ${connected ? 'connected' : 'disconnected'}`);
                                }
                            }
                            else {
                                this.log.debug(`${logPrefix} client '${mac}' ${connected ? 'connected' : 'disconnected'}`);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
// otherwise start the instance directly
(() => new UnifiNetwork())();
