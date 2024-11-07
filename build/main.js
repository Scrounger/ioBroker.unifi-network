/*
 * Created with @iobroker/create-adapter v2.6.5
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import moment from 'moment';
import { FetchError, context } from '@adobe/fetch';
// API imports
import { NetworkApi } from './lib/api/network-api.js';
// Adapter imports
import * as myHelper from './lib/helper.js';
import { WebSocketEventKeys, WebSocketEventMessages } from './lib/myTypes.js';
import { clientTree } from './lib/tree-client.js';
import { deviceTree } from './lib/tree-device.js';
class UnifiNetwork extends utils.Adapter {
    ufn = undefined;
    isConnected = false;
    aliveInterval = 30;
    aliveTimeout = undefined;
    aliveTimestamp = moment().valueOf();
    imageUpdateTimeout;
    connectionMaxRetries = 200;
    connectionRetries = 0;
    cache = {
        devices: {},
        clients: {},
        vpn: {}
    };
    subscribedList = [];
    eventListener = (event) => this.onNetworkMessage(event);
    fetch = context({
        alpnProtocols: ["h2" /* ALPNProtocol.ALPN_HTTP2 */],
        rejectUnauthorized: false,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36',
    }).fetch;
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
    //#region adapter methods
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const logPrefix = '[onReady]:';
        try {
            moment.locale(this.language);
            await utils.I18n.init('admin', this);
            if (this.config.host, this.config.user, this.config.password) {
                this.ufn = new NetworkApi(this.config.host, this.config.port, this.config.site, this.config.user, this.config.password, this.log);
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
            this.clearTimeout(this.aliveTimeout);
            this.clearTimeout(this.imageUpdateTimeout);
            if (this.ufn) {
                this.ufn.logout();
                this.setConnectionStatus(false);
                this.log.info(`${logPrefix} Logged out successfully from the Unifi-Network controller API. (host: ${this.config.host}:${this.config.port})`);
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
    async onStateChange(id, state) {
        const logPrefix = '[onStateChange]:';
        try {
            if (state) {
                if (myHelper.getIdLastPart(id) === 'imageUrl' && state.val !== null) {
                    if (this.config.clientImageDownload && id.startsWith(`${this.namespace}.clients.`)) {
                        await this.downloadImage(state.val, [myHelper.getIdWithoutLastPart(id)]);
                        this.log.debug(`${logPrefix} state '${id}' changed -> update client image`);
                    }
                    else if (this.config.deviceImageDownload && id.startsWith(`${this.namespace}.devices.`)) {
                        await this.downloadImage(state.val, [myHelper.getIdWithoutLastPart(id)]);
                        this.log.debug(`${logPrefix} state '${id}' changed -> update device image`);
                    }
                }
                else {
                    // The state was changed
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                }
            }
            else {
                // The state was deleted
                this.log.info(`state ${id} deleted`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
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
    //#endregion
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
                await this.updateIsOnlineState();
            }
            // start the alive checker
            if (this.aliveTimeout) {
                this.clearTimeout(this.aliveTimeout);
                this.aliveTimeout = null;
            }
            this.aliveTimeout = this.setTimeout(() => {
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
                    this.log.info(`${logPrefix} Logged in successfully to the Unifi-Network controller (host: ${this.config.host}:${this.config.port})`);
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
                    this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.config.host}:${this.config.port})`);
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
                    this.updateIsOnlineState();
                    await this.setConnectionStatus(true);
                    this.connectionRetries = 0;
                    if (this.aliveTimeout) {
                        this.clearTimeout(this.aliveTimeout);
                        this.aliveTimeout = null;
                    }
                    this.aliveTimeout = this.setTimeout(() => {
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
    //#region updateData
    async updateData() {
        const logPrefix = '[updateData]:';
        try {
            await this.updateDevicesImages();
            this.createOrUpdateChannel('devices', 'unifi devices', undefined, true);
            await this.updateDevices(await this.ufn.getDevices(), true);
            this.createOrUpdateChannel('clients', 'clients', undefined, true);
            this.createOrUpdateChannel('vpn', 'vpn', undefined, true);
            await this.updateClients(await this.ufn.getClients(), true);
            this.imageUpdateTimeout = this.setTimeout(() => { this.updateClientsImages(); }, this.config.updateInterval * 2 * 1000);
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
                    // ToDo: uncomment
                    // if (!this.cache.devices[device.mac]) {
                    // 	this.log.debug(`${logPrefix} Discovered device '${device.name}' (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname})`);
                    // }
                    if (!isAdapterStart && this.config.updateInterval > 0 && this.cache.devices[device.mac]) {
                        const lastSeen = this.cache.devices[device.mac].last_seen;
                        if (lastSeen && moment().diff((lastSeen) * 1000, 'seconds') < this.config.updateInterval) {
                            continue;
                        }
                    }
                    this.cache.devices[device.mac] = device;
                    this.createOrUpdateDevice(`${idChannel}.${device.mac}`, device.name, `${this.namespace}.${idChannel}.${device.mac}.isOnline`, `${this.namespace}.${idChannel}.${device.mac}.hasError`, undefined, isAdapterStart);
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
                    const name = client.unifi_device_info_from_ucore?.name || client.name || client.hostname;
                    if (client.mac) {
                        // ToDo: uncomment
                        // if (!this.cache.clients[client.mac]) {
                        // 	this.log.debug(`${logPrefix} Discovered client '${client.name}' (IP: ${client.ip}, mac: ${client.mac})`);
                        // }
                        if (!isAdapterStart && this.config.updateInterval > 0 && this.cache.clients[client.mac]) {
                            const lastSeen = this.cache.clients[client.mac].last_seen;
                            if (lastSeen && moment().diff((lastSeen) * 1000, 'seconds') < this.config.updateInterval) {
                                continue;
                            }
                        }
                        this.cache.clients[client.mac] = client;
                        this.cache.clients[client.mac].name = name;
                        this.createOrUpdateDevice(`${idChannel}.${client.mac}`, name, `${this.namespace}.${idChannel}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart);
                        await this.createGenericState(`${idChannel}.${client.mac}`, clientTree, client, 'clients', client, isAdapterStart);
                    }
                    else {
                        if (client.type === 'VPN' && client.ip) {
                            // ToDo: uncomment
                            // if (this.cache.vpn[client.ip]) {
                            // 	this.log.debug(`${logPrefix} Discovered vpn '${client.name}' (IP: ${client.ip}, mac: ${client.mac})`);
                            // }
                            if (!isAdapterStart && this.config.updateInterval > 0 && this.cache.vpn[client.ip]) {
                                const lastSeen = this.cache.vpn[client.ip].last_seen;
                                if (lastSeen && moment().diff((lastSeen) * 1000, 'seconds') < this.config.updateInterval) {
                                    continue;
                                }
                            }
                            this.cache.vpn[client.ip] = client;
                            this.cache.vpn[client.ip].name = name;
                            const idVpnChannel = 'vpn';
                            const preparedIp = client.ip.replaceAll('.', '_');
                            this.createOrUpdateDevice(`${idVpnChannel}.${preparedIp}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, `${this.namespace}.${idVpnChannel}.${preparedIp}.isOnline`, undefined, undefined, isAdapterStart);
                            await this.createGenericState(`${idVpnChannel}.${preparedIp}`, clientTree, client, 'vpn', client, isAdapterStart);
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateIsOnlineState() {
        const logPrefix = '[updateIsOnlineState]:';
        try {
            //ToDo: vpn and perhaps device to include
            const clients = await this.getStatesAsync('clients.*.last_seen');
            for (const id in clients) {
                const lastSeen = await this.getStateAsync(id);
                const isOnline = await this.getStateAsync(`${myHelper.getIdWithoutLastPart(id)}.isOnline`);
                const t = moment(isOnline.lc);
                const before = moment(lastSeen.val * 1000);
                const now = moment();
                if (!t.isBetween(before, now)) {
                    // isOnline not changed between now an last reported last_seen val
                    await this.setState(`${myHelper.getIdWithoutLastPart(id)}.isOnline`, now.diff(before, 'seconds') <= this.config.clientOfflineTimeout, true);
                    //ToDo: Debug log message inkl. name, mac, ip
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Download public data from ui with image url infos.
     */
    async updateDevicesImages() {
        const logPrefix = '[updateDevicesImages]:';
        try {
            if (this.config.deviceImageDownload) {
                //@ts-ignore
                await this.setObjectNotExistsAsync('devices.publicData', {
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
                const url = 'https://static.ui.com/fingerprint/ui/public.json';
                const response = await this.fetch(url, { follow: 0 });
                if (response.status === 200) {
                    const data = await response.json();
                    if (data && data.devices) {
                        await this.setStateChangedAsync('devices.publicData', JSON.stringify(data), true);
                    }
                }
                else {
                    this.log.error(`${logPrefix} error downloading image from '${url}', status: ${response.status}`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateClientsImages() {
        const logPrefix = '[updateClientsImages]:';
        try {
            if (this.config.clientImageDownload) {
                const clients = await this.getStatesAsync('clients.*.imageUrl');
                let imgCache = {};
                for (const id in clients) {
                    const url = await this.getStateAsync(id);
                    if (url && url.val && url.val !== null) {
                        if (imgCache[url.val]) {
                            imgCache[url.val].push(myHelper.getIdWithoutLastPart(id));
                        }
                        else {
                            imgCache[url.val] = [myHelper.getIdWithoutLastPart(id)];
                        }
                    }
                }
                for (const url in imgCache) {
                    await this.downloadImage(url, imgCache[url]);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Download image from a given url and update Channel icon if needed
     * @param url
     * @param idChannelList
     */
    async downloadImage(url, idChannelList) {
        const logPrefix = '[downloadImage]:';
        try {
            const response = await this.fetch(url, { follow: 0 });
            if (response.status === 200) {
                const imageBuffer = Buffer.from(await response.arrayBuffer());
                const imageBase64 = imageBuffer.toString('base64');
                const base64ImgString = `data:image/png;base64,` + imageBase64;
                this.log.debug(`${logPrefix} image download successful -> update states: ${JSON.stringify(idChannelList)}`);
                for (const idChannel of idChannelList) {
                    await this.setStateChangedAsync(`${idChannel}.image`, base64ImgString, true);
                    this.createOrUpdateDevice(idChannel, undefined, `${idChannel}.isOnline`, undefined, base64ImgString, true);
                }
            }
            else {
                this.log.error(`${logPrefix} error downloading image from '${url}', status: ${response.status}`);
            }
        }
        catch (error) {
            const mac = myHelper.getIdLastPart(idChannelList[0]);
            if (error instanceof FetchError) {
                this.log.warn(`${logPrefix} [mac: ${mac}]: image download failed, reasign it directly via unifi-network controller`);
            }
            else {
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
    async createOrUpdateDevice(id, name, onlineId, errorId = undefined, icon = undefined, isAdapterStart = false) {
        const logPrefix = '[createOrUpdateDevice]:';
        try {
            const i18n = name ? utils.I18n.getTranslatedObject(name) : name;
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
            }
            else {
                if (isAdapterStart) {
                    const obj = await this.getObjectAsync(id);
                    if (obj && obj.common) {
                        if (!myHelper.isDeviceCommonEqual(obj.common, common)) {
                            await this.extendObject(id, { common: common });
                            this.log.debug(`${logPrefix} device updated '${id}' (updated properties: ${JSON.stringify(myHelper.getObjectDiff(common, obj.common))})`);
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
            const i18n = name ? utils.I18n.getTranslatedObject(name) : name;
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
            }
            else {
                if (isAdapterStart) {
                    const obj = await this.getObjectAsync(id);
                    if (obj && obj.common) {
                        if (!myHelper.isChannelCommonEqual(obj.common, common)) {
                            await this.extendObject(id, { common: common });
                            this.log.debug(`${logPrefix} channel updated '${id}' (updated properties: ${JSON.stringify(myHelper.getObjectDiff(common, obj.common))})`);
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
                for (const key in treeDefinition) {
                    let logMsgState = `${channel}.${key}`.split('.')?.slice(1)?.join('.');
                    try {
                        // if we have an own defined state which takes val from other property
                        const valKey = Object.prototype.hasOwnProperty.call(objValues, treeDefinition[key].valFromProperty) && treeDefinition[key].valFromProperty ? treeDefinition[key].valFromProperty : key;
                        if (key
                            && (objValues[valKey] || objValues[valKey] === 0 || objValues[valKey] === false || (Object.prototype.hasOwnProperty.call(treeDefinition[key], 'id') && !Object.prototype.hasOwnProperty.call(treeDefinition[key], 'valFromProperty')))
                            && Object.prototype.hasOwnProperty.call(treeDefinition[key], 'iobType') && !Object.prototype.hasOwnProperty.call(treeDefinition[key], 'object') && !Object.prototype.hasOwnProperty.call(treeDefinition[key], 'array')) {
                            // if we have a 'iobType' property, then it's a state
                            let stateId = key;
                            if (Object.prototype.hasOwnProperty.call(treeDefinition[key], 'id')) {
                                // if we have a custom state, use defined id
                                stateId = treeDefinition[key].id;
                            }
                            logMsgState = `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');
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
                                            this.log.debug(`${logPrefix} ${objOrg.name} - updated common properties of state '${logMsgState}' (updated properties: ${JSON.stringify(myHelper.getObjectDiff(commonUpdated, obj.common))})`);
                                        }
                                    }
                                }
                            }
                            if (!this.subscribedList.includes(`${channel}.${stateId}`) && ((treeDefinition[key].write && treeDefinition[key].write === true) || Object.prototype.hasOwnProperty.call(treeDefinition[key], 'subscribeMe'))) {
                                // state is writeable or has subscribeMe Property -> subscribe it
                                this.log.silly(`${logPrefix} ${objOrg.name} - subscribing state '${logMsgState}'`);
                                await this.subscribeStatesAsync(`${channel}.${stateId}`);
                                this.subscribedList.push(`${channel}.${stateId}`);
                            }
                            if (objValues && (Object.prototype.hasOwnProperty.call(objValues, key) || (Object.prototype.hasOwnProperty.call(objValues, treeDefinition[key].valFromProperty)))) {
                                const val = treeDefinition[key].readVal ? await treeDefinition[key].readVal(objValues[valKey], this, this.cache, objOrg) : objValues[valKey];
                                let changedObj = undefined;
                                if (key === 'last_seen' || key === 'first_seen') {
                                    // set lc to last_seen value
                                    changedObj = await this.setStateChangedAsync(`${channel}.${stateId}`, { val: val, lc: val * 1000 }, true);
                                }
                                else {
                                    changedObj = await this.setStateChangedAsync(`${channel}.${stateId}`, val, true);
                                }
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
    //#endregion
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
                    this.log.debug(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! data: ${JSON.stringify(event.data)}`);
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
            if (event && event.data) {
                for (const myEvent of event.data) {
                    if (myEvent.key.includes('_Connected') || myEvent.key.includes('_Disconnected')) {
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
                            await this.setState(id, connected, true);
                            this.log.info(`${logPrefix} client '${this.cache.clients[mac].name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${this.cache.clients[mac].ip ? `, ip: ${this.cache.clients[mac].ip})` : ''}`);
                        }
                    }
                    else if (myEvent.key === WebSocketEventKeys.clientRoamed || myEvent.key === WebSocketEventKeys.guestRoamed) {
                        let mac = (myEvent.key === WebSocketEventKeys.clientRoamed) ? myEvent.user : myEvent.guest;
                        if (myEvent.ap_from && myEvent.ap_to) {
                            this.log.debug(`${logPrefix} client '${this.cache.clients[mac].name}' (mac: ${mac}) roamed from '${this.cache.devices[myEvent.ap_from].name}' (mac: ${myEvent.ap_from}) to '${this.cache.devices[myEvent.ap_to].name}' (mac: ${myEvent.ap_to})`);
                            const idApName = `clients.${mac}.uplink_name`;
                            if (await this.objectExists(idApName)) {
                                await this.setState(idApName, this.cache.devices[myEvent.ap_to].name ? this.cache.devices[myEvent.ap_to].name : null, true);
                            }
                            else {
                                this.log.warn(`${logPrefix} state '${idApName}' not exists!`);
                            }
                            const ipApMac = `clients.${mac}.uplink_mac`;
                            if (await this.objectExists(ipApMac)) {
                                await this.setState(ipApMac, myEvent.ap_to ? myEvent.ap_to : null, true);
                            }
                            else {
                                this.log.warn(`${logPrefix} state '${ipApMac}' not exists!`);
                            }
                        }
                        else {
                            this.log.warn(`${logPrefix} roam event has no ap information! (data: ${JSON.stringify(event.data)})`);
                        }
                    }
                    else {
                        this.log.error(`${logPrefix} not implemented event. meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)}`);
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
