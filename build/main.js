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
// Adapter imports
import { WebSocketEvent, WebSocketEventMessages } from './lib/myTypes.js';
import { eventHandler, disconnectDebounceList } from './lib/eventHandler.js';
import * as tree from './lib/tree/index.js';
import { base64 } from './lib/base64.js';
import { messageHandler } from './lib/messageHandler.js';
import { myIob } from './lib/myIob.js';
class UnifiNetwork extends utils.Adapter {
    ufn = undefined;
    myIob;
    isConnected = false;
    controllerVersion = '';
    aliveTimeout = undefined;
    pingTimeout = undefined;
    aliveTimestamp = moment().valueOf();
    apiPollingTimeout = undefined;
    connectionRetries = 0;
    cache = {
        devices: {},
        clients: {},
        vpn: {},
        wlan: {},
        lan: {},
        isOnline: {},
        firewall: {
            groups: {}
        }
    };
    subscribedList = [];
    eventListener = async (event) => {
        await this.onNetworkMessage(event);
    };
    pongListener = async () => {
        await this.onPongMessage();
    };
    eventsToIgnore = [
        'device:update',
        'unifi-device:sync',
        'session-metadata:sync',
        'radio-ai:plan', // Channel AI events
    ];
    statesUsingValAsLastChanged = [
        'rundate',
    ];
    constructor(options = {}) {
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
    async onReady() {
        const logPrefix = '[onReady]:';
        try {
            moment.locale(this.language);
            await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);
            this.myIob = new myIob(this, utils, this.statesUsingValAsLastChanged);
            if (this.config.expertAliveInterval >= 30 && this.config.expertAliveInterval <= 10000 &&
                this.config.realTimeApiDebounceTime >= 0 && this.config.realTimeApiDebounceTime <= 10000 &&
                this.config.apiUpdateInterval >= 30 && this.config.apiUpdateInterval <= 10000 &&
                this.config.clientRealtimeDisconnectDebounceTime >= 0 && this.config.clientRealtimeDisconnectDebounceTime <= 10000) {
                if (this.config.host, this.config.user, this.config.password) {
                    this.ufn = new NetworkApi(this.config.host, this.config.port, this.config.site, this.config.user, this.config.password, this);
                    await this.establishConnection(true);
                    this.ufn.on('message', this.eventListener);
                    this.ufn.on('pong', this.pongListener);
                    this.log.info(`${logPrefix} Listening to WebSocket realtime API events started`);
                }
                else {
                    this.log.warn(`${logPrefix} no login credentials in adapter config set!`);
                }
                this.myIob.findMissingTranslation();
            }
            else {
                this.log.error(`${logPrefix} adapter config settings wrong!`);
                await this.stop({ reason: 'adapter config settings wrong' });
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    async onUnload(callback) {
        const logPrefix = '[onUnload]:';
        try {
            this.clearTimeout(this.ufn.connectionTimeout);
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
     *
     * @param id
     * @param state
     */
    async onStateChange(id, state) {
        const logPrefix = '[onStateChange]:';
        try {
            if (state) {
                if (state.from.includes(this.namespace)) {
                    // internal changes
                    if (this.myIob.getIdLastPart(id) === 'imageUrl') {
                        if (this.config.clientImageDownload && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`))) {
                            await this.downloadImage(state.val, [this.myIob.getIdWithoutLastPart(id)]);
                            this.log.debug(`${logPrefix} state '${id}' changed -> update client image`);
                        }
                        else if (this.config.deviceImageDownload && id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
                            await this.downloadImage(state.val, [this.myIob.getIdWithoutLastPart(id)]);
                            this.log.debug(`${logPrefix} state '${id}' changed -> update device image`);
                        }
                    }
                    else if (this.myIob.getIdLastPart(id) === 'isOnline' && (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelVpn}.`))) {
                        const macOrIp = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id)).replaceAll('_', '.');
                        if (state.val !== this.cache.isOnline[macOrIp].val) {
                            const old = {
                                wlan_id: this.cache.isOnline[macOrIp].wlan_id,
                                network_id: this.cache.isOnline[macOrIp].network_id,
                            };
                            this.cache.isOnline[macOrIp] = {
                                val: state.val,
                                wlan_id: this.cache.clients[macOrIp]?.wlanconf_id || this.cache.vpn[macOrIp]?.wlanconf_id || old.wlan_id,
                                network_id: this.cache.clients[macOrIp]?.network_id || this.cache.vpn[macOrIp]?.network_id || old.network_id,
                            };
                            this.log.debug(`${logPrefix} '${this.cache.clients[macOrIp]?.name || this.cache.vpn[macOrIp]?.ip}' .isOnline changed to '${state.val}' (${JSON.stringify(this.cache.isOnline[macOrIp])})`);
                            await this.updateWlanConnectedClients();
                            await this.updateLanConnectedClients();
                        }
                    }
                }
                else if (!state.from.includes(this.namespace) && state.ack === false) {
                    // state changed from outside of the adapter
                    if (id.startsWith(`${this.namespace}.${tree.client.idChannelUsers}.`) || id.startsWith(`${this.namespace}.${tree.client.idChannelGuests}.`)) {
                        // Client state changed
                        const mac = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));
                        const writeValKey = id.replace(`.${mac}.`, '.').replace(`${this.namespace}.`, '');
                        if (this.myIob.statesWithWriteFunction[writeValKey]) {
                            await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, this.cache.clients[mac], this);
                        }
                        else {
                            this.log.debug(`${logPrefix} client state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
                        }
                    }
                    else if (id.startsWith(`${this.namespace}.${tree.device.idChannel}.`)) {
                        // Device state changed						
                        const mac = id.replace(`${this.namespace}.${tree.device.idChannel}.`, '').split('.')[0];
                        const writeValKey = id.replace(`.${mac}.`, '.').replace(`${this.namespace}.`, '');
                        if (this.myIob.statesWithWriteFunction[writeValKey]) {
                            await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, this.cache.devices[mac], this);
                        }
                        else {
                            this.log.debug(`${logPrefix} device state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
                        }
                    }
                    else if (id.startsWith(`${this.namespace}.${tree.wlan.idChannel}.`)) {
                        const wlan_id = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));
                        const writeValKey = id.replace(`.${wlan_id}.`, '.').replace(`${this.namespace}.`, '');
                        if (this.myIob.statesWithWriteFunction[writeValKey]) {
                            await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, this.cache.wlan[wlan_id], this);
                        }
                        else {
                            this.log.debug(`${logPrefix} wlan state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
                        }
                    }
                    else if (id.startsWith(`${this.namespace}.${tree.lan.idChannel}.`)) {
                        const lan_id = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));
                        const writeValKey = id.replace(`.${lan_id}.`, '.').replace(`${this.namespace}.`, '');
                        if (this.myIob.statesWithWriteFunction[writeValKey]) {
                            await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, this.cache.lan[lan_id], this);
                        }
                        else {
                            this.log.debug(`${logPrefix} lan state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
                        }
                    }
                    else if (id.startsWith(`${this.namespace}.${tree.firewall.group.idChannel}.`)) {
                        const groupId = this.myIob.getIdLastPart(this.myIob.getIdWithoutLastPart(id));
                        const writeValKey = id.replace(`.${groupId}.`, '.').replace(`${this.namespace}.`, '');
                        if (this.myIob.statesWithWriteFunction[writeValKey]) {
                            await this.myIob.statesWithWriteFunction[writeValKey](state.val, id, this.cache.firewall.groups[groupId], this);
                        }
                        else {
                            this.log.debug(`${logPrefix} firewall group state ${id} changed: ${state.val} (ack = ${state.ack}) -> not implemented`);
                        }
                    }
                }
                else {
                    // The state was changed
                    // this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
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
    async onMessage(obj) {
        const logPrefix = '[onMessage]:';
        try {
            // this.log.info(`${logPrefix} ${JSON.stringify(obj)}`);
            if (typeof obj === 'object') {
                if (obj.command === 'deviceList') {
                    await messageHandler.device.list(obj, this, this.ufn);
                }
                else if (obj.command === 'deviceStateList') {
                    messageHandler.device.stateList(obj, this, this.ufn);
                }
                else if (obj.command === 'clientList') {
                    await messageHandler.client.list(obj, this, this.ufn);
                }
                else if (obj.command === 'clientStateList') {
                    messageHandler.client.stateList(obj, this, this.ufn);
                }
                else if (obj.command === 'wlanList') {
                    await messageHandler.wlan.list(obj, this, this.ufn);
                }
                else if (obj.command === 'wlanStateList') {
                    messageHandler.wlan.stateList(obj, this, this.ufn);
                }
                else if (obj.command === 'lanList') {
                    await messageHandler.lan.list(obj, this, this.ufn);
                }
                else if (obj.command === 'lanStateList') {
                    messageHandler.lan.stateList(obj, this, this.ufn);
                }
                else if (obj.command === 'firewallGroupList') {
                    await messageHandler.firewall.group.list(obj, this, this.ufn);
                }
                else if (obj.command === 'firewallGroupStateList') {
                    messageHandler.firewall.group.stateList(obj, this, this.ufn);
                }
            }
        }
        catch (error) {
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
    async establishConnection(isAdapterStart = false) {
        const logPrefix = '[establishConnection]:';
        try {
            if (this.pingTimeout) {
                this.clearTimeout(this.pingTimeout);
                this.pingTimeout = null;
            }
            if (await this.login()) {
                await this.updateRealTimeApiData(isAdapterStart);
                await this.updateApiData(isAdapterStart);
                this.sendPing(isAdapterStart);
            }
            else {
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Login into NVR and load bootstrap data
     *
     * @param isAdapterStart
     * @returns Connection status
     */
    async login(isAdapterStart = false) {
        const logPrefix = '[login]:';
        try {
            if (this.ufn) {
                const loginSuccessful = await this.ufn.login();
                if (loginSuccessful) {
                    this.controllerVersion = await this.ufn.getControllerVersion();
                    this.log.info(`${logPrefix} Logged in successfully to the Unifi-Network controller (host: ${this.config.host}:${this.config.port}, site: ${this.config.site}, version: ${this.controllerVersion}, isUnifiOs: ${this.ufn.isUnifiOs})`);
                    if (await this.ufn.launchEventsWs()) {
                        this.log.info(`${logPrefix} WebSocket connection to realtime API successfully established`);
                        await this.setConnectionStatus(true);
                        return true;
                    }
                    else {
                        this.log.error(`${logPrefix} unable to establish WebSocket connection to realtime API`);
                    }
                }
                else {
                    this.log.error(`${logPrefix} Login to the Unifi-Network controller API failed! (host: ${this.ufn.controllerUrl}, site: ${this.config.site})`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        await this.setConnectionStatus(false);
        return false;
    }
    /**
     * Check whether the connection to the controller exists, if not try to establish a new connection
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
                    }
                    else {
                        this.log.error(`${logPrefix} Connection to the Unifi-Network controller is down for more then ${(this.config.expertConnectionMaxRetries || 200) * (this.config.expertAliveInterval || 30)}s, stopping the adapter.`);
                        await this.stop({ reason: 'too many connection retries' });
                    }
                    return;
                }
                else {
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Set adapter info.connection state and internal var
     *
     * @param isConnected
     */
    async setConnectionStatus(isConnected) {
        const logPrefix = '[setConnectionStatus]:';
        try {
            this.isConnected = isConnected;
            this.connected = isConnected;
            await this.setState('info.connection', isConnected, true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * send websocket ping
     *
     * @param isAdapterStart
     */
    sendPing(isAdapterStart = false) {
        const logPrefix = '[sendPing]:';
        try {
            if (!isAdapterStart) {
                this.ufn.wsSendPing();
            }
            if (this.pingTimeout) {
                this.clearTimeout(this.pingTimeout);
                this.pingTimeout = null;
            }
            this.pingTimeout = this.setTimeout(() => {
                this.sendPing();
            }, ((this.config.expertAliveInterval || 30) / 2) * 1000);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    //#endregion
    //#region updateData
    async updateRealTimeApiData(isAdapterStart = false) {
        const logPrefix = '[updateRealTimeApiData]:';
        try {
            await this.updateDevices((await this.ufn.getDevices_V2())?.network_devices, isAdapterStart);
            await this.updateClients(null, isAdapterStart);
            await this.updateClients(await this.ufn.getClientsHistory_V2(), isAdapterStart, true);
            // await this.updatClientsOffline(await this.ufn.getClients(), isAdapterStart);
            await this.updateLanConfig(null, isAdapterStart);
            await this.updateLanConnectedClients(isAdapterStart);
            await this.updateWlanConfig(null, isAdapterStart);
            await this.updateWlanConnectedClients(isAdapterStart);
            if (this.config.firewallRuleConfigEnabled || this.config.firewallGroupConfigEnabled) {
                if (isAdapterStart) {
                    await this.myIob.createOrUpdateChannel(tree.firewall.idChannel, 'firewall', undefined, true);
                }
                await this.updateFirewallGroup(null, isAdapterStart);
            }
            else {
                if (await this.objectExists(tree.firewall.idChannel)) {
                    await this.delObjectAsync(tree.firewall.idChannel, { recursive: true });
                    this.log.debug(`${logPrefix} '${tree.firewall.idChannel}' deleted`);
                }
            }
            // const tmp = tree.lan.getStateIDs();
            // let list = []
            // for (let id of tmp) {
            // 	list.push({ id: id });
            // }
            // this.log.warn(JSON.stringify(list));
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateApiData(isAdapterStart = false) {
        const logPrefix = '[updateApiData]:';
        try {
            await this.updateSysInfo(await this.ufn.getSysInfo(), isAdapterStart);
            // only poll if api calls are enabled, that are not covered by the real-time api
            if (this.config.systemInformationEnabled) {
                if (this.apiPollingTimeout) {
                    this.clearTimeout(this.apiPollingTimeout);
                    this.apiPollingTimeout = undefined;
                }
                this.apiPollingTimeout = this.setTimeout(async () => {
                    await this.updateApiData();
                }, this.config.apiUpdateInterval * 1000);
                await this.setState('info.lastApiPoll', moment().valueOf(), true);
            }
            else {
                await this.setState('info.lastApiPoll', null, true);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateDevices(data = null, isAdapterStart = false) {
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
                                    countDevices++;
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
                                        continue;
                                    }
                                }
                                if (!this.cache.devices[device.mac]) {
                                    this.log.debug(`${logPrefix} Discovered device '${device.name}' (IP: ${device.ip}, mac: ${device.mac}, state: ${device.state}, model: ${device.model || device.shortname}, version: ${device.version})`);
                                }
                                let dataToProcess = device;
                                if (this.cache.devices[device.mac]) {
                                    // filter out unchanged properties
                                    dataToProcess = this.myIob.deepDiffBetweenObjects(device, this.cache.devices[device.mac], this, tree.device.getKeys());
                                }
                                if (!_.isEmpty(dataToProcess)) {
                                    this.cache.devices[device.mac] = { ...this.cache.devices[device.mac], ...device };
                                    this.cache.devices[device.mac].iobTimestamp = moment().unix();
                                    dataToProcess.mac = device.mac;
                                    this.log.silly(`${logPrefix} device '${device.name}' (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
                                    await this.myIob.createOrUpdateDevice(idDevice, device.name, `${idDevice}.isOnline`, `${idDevice}.hasError`, undefined, isAdapterStart, true);
                                    await this.myIob.createOrUpdateStates(idDevice, tree.device.get(), dataToProcess, device, this.config.deviceStatesBlackList, this.config.deviceStatesIsWhiteList, device.name, isAdapterStart);
                                }
                            }
                            else {
                                if (isAdapterStart) {
                                    countBlacklisted++;
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
                }
                else {
                    if (await this.objectExists(tree.device.idChannel)) {
                        await this.delObjectAsync(tree.device.idChannel, { recursive: true });
                        this.log.debug(`${logPrefix} '${tree.device.idChannel}' deleted`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateClients(data = null, isAdapterStart = false, isOfflineClients = false) {
        const logPrefix = '[updateClients]:';
        try {
            if (this.connected && this.isConnected) {
                if (isAdapterStart && !isOfflineClients) {
                    if (this.config.clientsEnabled) {
                        await this.myIob.createOrUpdateChannel(tree.client.idChannelUsers, 'users', undefined, true);
                    }
                    if (this.config.guestsEnabled) {
                        await this.myIob.createOrUpdateChannel(tree.client.idChannelGuests, 'guests', undefined, true);
                    }
                    if (this.config.vpnEnabled) {
                        await this.myIob.createOrUpdateChannel(tree.client.idChannelVpn, 'vpn users', undefined, true);
                    }
                    if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
                        await this.myIob.createOrUpdateChannel(tree.client.idChannel, 'client devices', undefined, true);
                        data = await this.ufn.getClientsActive_V2();
                    }
                    else {
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
                                        continue;
                                    }
                                }
                                const offlineSince = moment().diff((client.last_seen) * 1000, 'days');
                                if (this.config.clientsEnabled && client.mac && !client.is_guest) {
                                    // Clients
                                    if (this.config.deleteClientsOlderThan === 0 || offlineSince <= this.config.deleteClientsOlderThan) {
                                        if (isAdapterStart) {
                                            countClients++;
                                        }
                                        if (!this.cache.clients[client.mac]) {
                                            this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} client '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
                                            this.cache.isOnline[client.mac] = { val: !isOfflineClients };
                                        }
                                        let dataToProcess = client;
                                        if (this.cache.clients[client.mac]) {
                                            // filter out unchanged properties
                                            dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys());
                                        }
                                        if (!_.isEmpty(dataToProcess)) {
                                            this.cache.clients[client.mac] = { ...this.cache.clients[client.mac], ...client };
                                            this.cache.clients[client.mac].name = name;
                                            this.cache.clients[client.mac].timestamp = moment().unix();
                                            this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
                                            this.cache.isOnline[client.mac].network_id = client.network_id;
                                            dataToProcess.mac = client.mac;
                                            dataToProcess.name = name;
                                            if (!isAdapterStart) {
                                                this.log.silly(`${logPrefix} client ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
                                            }
                                            await this.myIob.createOrUpdateDevice(`${tree.client.idChannelUsers}.${client.mac}`, name, `${tree.client.idChannelUsers}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart, true);
                                            await this.myIob.createOrUpdateStates(`${tree.client.idChannelUsers}.${client.mac}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
                                        }
                                    }
                                    else {
                                        if (await this.objectExists(`${tree.client.idChannelUsers}.${client.mac}`)) {
                                            await this.delObjectAsync(`${tree.client.idChannelUsers}.${client.mac}`, { recursive: true });
                                            this.log.debug(`${logPrefix} client '${name}' deleted, because it's offline since ${offlineSince} days`);
                                        }
                                        else {
                                            this.log.silly(`${logPrefix} client '${name}' ingored, because it's offline since ${offlineSince} days`);
                                        }
                                    }
                                }
                                else if (this.config.guestsEnabled && client.mac && client.is_guest) {
                                    // Guests
                                    if (this.config.deleteGuestsOlderThan === 0 || offlineSince <= this.config.deleteGuestsOlderThan) {
                                        if (isAdapterStart) {
                                            countGuests++;
                                        }
                                        if (!this.cache.clients[client.mac]) {
                                            this.log.debug(`${logPrefix} Discovered ${isOfflineClients ? 'disconnected' : 'connected'} guest '${name}' (${!isOfflineClients ? `IP: ${client.ip}, ` : ''}mac: ${client.mac})`);
                                            this.cache.isOnline[client.mac] = { val: !isOfflineClients };
                                        }
                                        let dataToProcess = client;
                                        if (this.cache.clients[client.mac]) {
                                            // filter out unchanged properties
                                            dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.clients[client.mac], this, tree.client.getKeys());
                                        }
                                        if (!_.isEmpty(dataToProcess)) {
                                            this.cache.clients[client.mac] = { ...this.cache.clients[client.mac], ...client };
                                            this.cache.clients[client.mac].name = name;
                                            this.cache.clients[client.mac].timestamp = moment().unix();
                                            this.cache.isOnline[client.mac].wlan_id = client.wlanconf_id;
                                            this.cache.isOnline[client.mac].network_id = client.network_id;
                                            dataToProcess.mac = client.mac;
                                            dataToProcess.name = name;
                                            if (!isAdapterStart) {
                                                this.log.silly(`${logPrefix} guest ${dataToProcess.name} (mac: ${dataToProcess.mac}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
                                            }
                                            await this.myIob.createOrUpdateDevice(`${tree.client.idChannelGuests}.${client.mac}`, name, `${tree.client.idChannelGuests}.${client.mac}.isOnline`, undefined, undefined, isAdapterStart, true);
                                            await this.myIob.createOrUpdateStates(`${tree.client.idChannelGuests}.${client.mac}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
                                        }
                                    }
                                    else {
                                        if (await this.objectExists(`${tree.client.idChannelGuests}.${client.mac}`)) {
                                            await this.delObjectAsync(`${tree.client.idChannelGuests}.${client.mac}`, { recursive: true });
                                            this.log.info(`${logPrefix} guest '${name}' deleted, because it's offline since ${offlineSince} days`);
                                        }
                                        else {
                                            this.log.silly(`${logPrefix} guest '${name}' ingored, because it's offline since ${offlineSince} days`);
                                        }
                                    }
                                }
                                else {
                                    if (this.config.vpnEnabled && client.type === 'VPN' && client.ip) {
                                        // VPN Clients
                                        if (isAdapterStart) {
                                            countVpn++;
                                        }
                                        if (!this.cache.vpn[client.ip]) {
                                            this.log.debug(`${logPrefix} Discovered vpn client '${name}' (IP: ${client.ip}, remote_ip: ${client.remote_ip})`);
                                            this.cache.isOnline[client.ip] = { val: !isOfflineClients };
                                        }
                                        const idChannel = client.network_id;
                                        await this.myIob.createOrUpdateChannel(`${tree.client.idChannelVpn}.${idChannel}`, client.network_name || '', base64[client.vpn_type] || undefined);
                                        let dataToProcess = client;
                                        if (this.cache.vpn[client.ip]) {
                                            // filter out unchanged properties
                                            dataToProcess = this.myIob.deepDiffBetweenObjects(client, this.cache.vpn[client.ip], this, tree.client.getKeys());
                                        }
                                        const preparedIp = client.ip.replaceAll('.', '_');
                                        if (!_.isEmpty(dataToProcess)) {
                                            this.cache.vpn[client.ip] = { ...this.cache.vpn[client.ip], ...client };
                                            this.cache.vpn[client.ip].name = name;
                                            this.cache.vpn[client.ip].timestamp = moment().unix();
                                            this.cache.isOnline[client.ip].wlan_id = client.wlanconf_id;
                                            this.cache.isOnline[client.ip].network_id = client.network_id;
                                            dataToProcess.ip = client.ip;
                                            dataToProcess.name = name;
                                            if (!isAdapterStart) {
                                                this.log.silly(`${logPrefix} vpn ${dataToProcess.name} (ip: ${dataToProcess.ip}) follwing properties will be updated: ${JSON.stringify(dataToProcess)}`);
                                            }
                                            await this.myIob.createOrUpdateDevice(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}`, client.unifi_device_info_from_ucore?.name || client.name || client.hostname, `${tree.client.idChannelVpn}.${idChannel}.${preparedIp}.isOnline`, undefined, undefined, isAdapterStart, true);
                                            await this.myIob.createOrUpdateStates(`${tree.client.idChannelVpn}.${idChannel}.${preparedIp}`, tree.client.get(), dataToProcess, client, this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, client.name, isAdapterStart);
                                        }
                                    }
                                }
                            }
                            else {
                                if (isAdapterStart) {
                                    countBlacklisted++;
                                    const id = `${!client.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests}.${client.mac}`;
                                    if (await this.objectExists(id)) {
                                        await this.delObjectAsync(id, { recursive: true });
                                        this.log.info(`${logPrefix} device '${name}' (mac: ${client.mac}) delete, ${this.config.clientIsWhiteList ? 'it\'s not on the whitelist' : 'it\'s on the blacklist'}`);
                                    }
                                }
                            }
                        }
                        if (isAdapterStart) {
                            this.log.info(`${logPrefix} Discovered ${data.length} ${!isOfflineClients ? 'connected' : 'disconnected'} clients (clients: ${countClients}, guests: ${countGuests}, vpn: ${countVpn}, blacklisted: ${countBlacklisted}, states ${!this.config.clientStatesIsWhiteList ? 'blacklisted' : 'whitelisted'}: ${this.config.clientStatesBlackList.length})`);
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
                if (!this.config.vpnEnabled && await this.objectExists(tree.client.idChannelVpn)) {
                    await this.delObjectAsync(tree.client.idChannelVpn, { recursive: true });
                    this.log.debug(`${logPrefix} channel '${tree.client.idChannelVpn}' deleted`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updatClientsOffline(data, isAdapterStart = false) {
        const logPrefix = '[updatClientsOffline]:';
        try {
            if (data) {
                const result = [];
                for (const client of data) {
                    if (!this.cache.clients[client.mac] && !this.cache.clients[client.ip]) {
                        result.push(client);
                    }
                }
                await this.updateClients(result, isAdapterStart, true);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateIsOnlineState(isAdapterStart = false) {
        const logPrefix = '[updateIsOnlineState]:';
        try {
            const clients = await this.getStatesAsync(`${tree.client.idChannel}.*.last_seen`);
            for (const id in clients) {
                const typeOfClient = id.includes('.users.') ? 'client' : id.includes('.guests.') ? 'guest' : 'vpn';
                const offlineTimeout = typeOfClient === 'vpn' ? this.config.vpnOfflineTimeout : this.config.clientOfflineTimeout;
                const lastSeenState = clients[id];
                const isOnlineState = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.isOnline`);
                const mac = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.mac`);
                const ip = await this.getStateAsync(`${this.myIob.getIdWithoutLastPart(id)}.ip`);
                const client = typeOfClient !== 'vpn' ? this.cache.clients[mac.val] : this.cache.vpn[ip.val];
                const lastSeen = moment(lastSeenState.val * 1000);
                const diff = moment().diff(lastSeen, 'seconds');
                if (diff > offlineTimeout && isOnlineState.val) {
                    if (!isAdapterStart) {
                        this.log[this.config.clientDebugLevel || this.log.level](`${logPrefix} Fallback method - ${typeOfClient} '${client?.name}' (mac: ${client?.mac}, ip: ${client?.ip}) is offline, last_seen '${lastSeen.format('DD.MM. - HH:mm')}h' not updated since ${diff}s`);
                    }
                    await this.setState(`${this.myIob.getIdWithoutLastPart(id)}.isOnline`, false, true);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateWlanConfig(data, isAdapterStart = false) {
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
                            if (wlan && wlan.configuration) {
                                wlan = { ...wlan.configuration, ...wlan.details, ...wlan.statistics };
                            }
                            wlan = wlan;
                            const idWlan = `${idChannel}.${wlan._id}`;
                            if ((!this.config.wlanIsWhiteList && !_.some(this.config.wlanBlackList, { id: wlan._id })) || (this.config.wlanIsWhiteList && _.some(this.config.wlanBlackList, { id: wlan._id }))) {
                                if (isAdapterStart) {
                                    countWlan++;
                                }
                                if (!this.cache.wlan[wlan._id]) {
                                    this.log.debug(`${logPrefix} Discovered WLAN '${wlan.name}'`);
                                }
                                let dataToProcess = wlan;
                                if (this.cache.wlan[wlan._id]) {
                                    // filter out unchanged properties
                                    dataToProcess = this.myIob.deepDiffBetweenObjects(wlan, this.cache.wlan[wlan._id], this, tree.wlan.getKeys());
                                }
                                if (!_.isEmpty(dataToProcess)) {
                                    this.cache.wlan[wlan._id] = { ...this.cache.wlan[wlan._id], ...wlan };
                                    dataToProcess._id = wlan._id;
                                    await this.myIob.createOrUpdateDevice(idWlan, wlan.name, `${idChannel}.${wlan._id}.enabled`, undefined, undefined, isAdapterStart, true);
                                    await this.myIob.createOrUpdateStates(idWlan, tree.wlan.get(), dataToProcess, wlan, this.config.wlanStatesBlackList, this.config.wlanStatesIsWhiteList, wlan.name, isAdapterStart);
                                }
                            }
                            else {
                                if (isAdapterStart) {
                                    countBlacklisted++;
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
                }
                else {
                    if (await this.objectExists(idChannel)) {
                        await this.delObjectAsync(idChannel, { recursive: true });
                        this.log.debug(`${logPrefix} '${idChannel}' deleted`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateWlanConnectedClients(isAdapterStart = false) {
        const logPrefix = '[updateWlanConnectedClients]:';
        try {
            if (this.config.wlanConfigEnabled) {
                if (isAdapterStart) {
                    const obj = { connected_clients: 0, connected_guests: 0, name: 'wlan' };
                    await this.myIob.createOrUpdateStates('wlan', tree.wlan.getGlobal(), obj, obj, undefined, false, obj.name, true);
                }
                let sumClients = 0;
                let sumGuests = 0;
                for (const wlan_id in this.cache.wlan) {
                    const connectedClients = _.filter(this.cache.isOnline, (x) => x.val === true && x.wlan_id === wlan_id);
                    this.log.silly(`${logPrefix} WLAN '${this.cache.wlan[wlan_id].name}' (id: ${wlan_id}) connected ${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}: ${connectedClients.length}`);
                    if (!this.cache.wlan[wlan_id].is_guest) {
                        sumClients = sumClients + connectedClients.length;
                    }
                    else {
                        sumGuests = sumGuests + connectedClients.length;
                    }
                    const id = `wlan.${wlan_id}.connected_${!this.cache.wlan[wlan_id].is_guest ? 'clients' : 'guests'}`;
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateLanConfig(data, isAdapterStart = false) {
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
                            if (lan && lan.configuration) {
                                lan = { ...lan.configuration, ...lan.details, ...lan.statistics };
                            }
                            lan = lan;
                            const idLan = `${idChannel}.${lan._id}`;
                            if ((!this.config.lanIsWhiteList && !_.some(this.config.lanBlackList, { id: lan._id })) || (this.config.lanIsWhiteList && _.some(this.config.lanBlackList, { id: lan._id }))) {
                                if (isAdapterStart) {
                                    countLan++;
                                }
                                if (!this.cache.lan[lan._id]) {
                                    this.log.debug(`${logPrefix} Discovered LAN '${lan.name}'`);
                                }
                                let dataToProcess = lan;
                                if (this.cache.lan[lan._id]) {
                                    // filter out unchanged properties
                                    dataToProcess = this.myIob.deepDiffBetweenObjects(lan, this.cache.lan[lan._id], this, tree.lan.getKeys());
                                }
                                if (!_.isEmpty(dataToProcess)) {
                                    this.cache.lan[lan._id] = { ...this.cache.lan[lan._id], ...lan };
                                    dataToProcess._id = lan._id;
                                    await this.myIob.createOrUpdateDevice(idLan, `${lan.name}${lan.vlan ? ` (${lan.vlan})` : ''}`, `${idChannel}.${lan._id}.enabled`, undefined, undefined, isAdapterStart, true);
                                    await this.myIob.createOrUpdateStates(idLan, tree.lan.get(), dataToProcess, lan, this.config.lanStatesBlackList, this.config.lanStatesIsWhiteList, lan.name, isAdapterStart);
                                }
                            }
                            else {
                                if (isAdapterStart) {
                                    countBlacklisted++;
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
                }
                else {
                    if (await this.objectExists(idChannel)) {
                        await this.delObjectAsync(idChannel, { recursive: true });
                        this.log.debug(`${logPrefix} '${idChannel}' deleted`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateLanConnectedClients(isAdapterStart = false) {
        const logPrefix = '[updateLanConnectedClients]:';
        try {
            if (this.config.lanConfigEnabled) {
                if (isAdapterStart) {
                    const obj = { connected_clients: 0, connected_guests: 0, name: 'lan' };
                    await this.myIob.createOrUpdateStates('lan', tree.lan.getGlobal(), obj, obj, undefined, false, obj.name, true);
                }
                let sumClients = 0;
                let sumGuests = 0;
                for (const lan_id in this.cache.lan) {
                    const connectedClients = _.filter(this.cache.isOnline, (x) => x.val === true && x.network_id === lan_id);
                    this.log.silly(`${logPrefix} LAN '${this.cache.lan[lan_id].name}' (id: ${lan_id}) connected ${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}: ${connectedClients.length}`);
                    if (this.cache.lan[lan_id].purpose !== 'guest') {
                        sumClients = sumClients + connectedClients.length;
                    }
                    else {
                        sumGuests = sumGuests + connectedClients.length;
                    }
                    const id = `lan.${lan_id}.connected_${this.cache.lan[lan_id].purpose !== 'guest' ? 'clients' : 'guests'}`;
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateFirewallGroup(data, isAdapterStart = false) {
        const logPrefix = '[updateFirewallGroup]:';
        try {
            if (this.connected && this.isConnected) {
                const idChannel = tree.firewall.group.idChannel;
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
                                    countFirewallGroup++;
                                }
                                if (!this.cache.firewall.groups[firewallGroup._id]) {
                                    this.log.debug(`${logPrefix} Discovered Firewall Group '${firewallGroup.name}'`);
                                }
                                let dataToProcess = firewallGroup;
                                if (this.cache.firewall.groups[firewallGroup._id]) {
                                    // filter out unchanged properties
                                    dataToProcess = this.myIob.deepDiffBetweenObjects(firewallGroup, this.cache.firewall.groups[firewallGroup._id], this, tree.firewall.group.getKeys());
                                }
                                if (!_.isEmpty(dataToProcess)) {
                                    this.cache.firewall.groups[firewallGroup._id] = { ...this.cache.firewall.groups[firewallGroup._id], ...firewallGroup };
                                    dataToProcess._id = firewallGroup._id;
                                    await this.myIob.createOrUpdateDevice(idFirewallGroup, `${firewallGroup.name}`, `${idChannel}.${firewallGroup._id}.enabled`, undefined, undefined, isAdapterStart, true);
                                    await this.myIob.createOrUpdateStates(idFirewallGroup, tree.firewall.group.get(), dataToProcess, firewallGroup, this.config.firewallGroupStatesBlackList, this.config.firewallGroupStatesIsWhiteList, firewallGroup.name, isAdapterStart);
                                }
                            }
                            else {
                                if (isAdapterStart) {
                                    countBlacklisted++;
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
                }
                else {
                    if (await this.objectExists(idChannel)) {
                        await this.delObjectAsync(idChannel, { recursive: true });
                        this.log.debug(`${logPrefix} '${idChannel}' deleted`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateSysInfo(data, isAdapterStart = false) {
        const logPrefix = '[updateSysInfo]:';
        try {
            if (this.connected && this.isConnected) {
                if (this.config.systemInformationEnabled) {
                    if (isAdapterStart) {
                        await this.myIob.createOrUpdateChannel(tree.sysInfo.idChannel, undefined, undefined, true);
                    }
                    if (data && data !== null) {
                        await this.myIob.createOrUpdateStates(tree.sysInfo.idChannel, tree.sysInfo.get(), data, data, undefined, undefined, 'sysInfo', isAdapterStart);
                        if (isAdapterStart) {
                            this.log.info(`${logPrefix} System Information updated`);
                        }
                        else {
                            this.log.silly(`${logPrefix} System Information updated`);
                        }
                    }
                }
                else {
                    if (await this.objectExists(tree.sysInfo.idChannel)) {
                        for (const key of Object.keys(tree.sysInfo.get())) {
                            const id = `${tree.sysInfo.idChannel}.${tree.sysInfo.get()[key]?.id || key}`;
                            await this.delObjectAsync(id);
                            this.log.debug(`${logPrefix} '${id}' deleted`);
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
                const url = 'https://static.ui.com/fingerprint/ui/public.json';
                const response = await request(url);
                if (response && response.statusCode === 200) {
                    const data = await response.body.json();
                    if (data && data.devices) {
                        await this.setStateChangedAsync(`${tree.device.idChannel}.publicData`, JSON.stringify(data), true);
                    }
                }
                else {
                    if (response) {
                        this.log.error(`${logPrefix} API endpoint access error: ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`);
                    }
                    else {
                        this.log.error(`${logPrefix} API endpoint access error: response is ${JSON.stringify(response)}`);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Download image from a given url and update Channel icon if needed
     *
     * @param url
     * @param idChannelList
     */
    async downloadImage(url, idChannelList) {
        const logPrefix = '[downloadImage]:';
        try {
            let base64ImgString = undefined; // ToDo: nicht sauber gelöst!
            if (url !== null) {
                const response = await request(url);
                if (response && response.statusCode === 200) {
                    const imageBuffer = Buffer.from(await response.body.arrayBuffer());
                    const imageBase64 = imageBuffer.toString('base64');
                    base64ImgString = `data:image/png;base64,${imageBase64}`;
                    this.log.debug(`${logPrefix} image download successful -> update states: ${JSON.stringify(idChannelList)}`);
                }
                else {
                    if (response) {
                        this.log.error(`${logPrefix} API endpoint access error: ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`);
                    }
                    else {
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
        }
        catch (error) {
            const mac = this.myIob.getIdLastPart(idChannelList[0]);
            this.log.error(`${logPrefix} [mac: ${mac}, url: ${url}]: ${error}, stack: ${error.stack}`);
        }
    }
    async checkImageDownload(idImageUrl, url) {
        const logPrefix = '[checkImageDownload]:';
        try {
            const idChannel = this.myIob.getIdWithoutLastPart(idImageUrl);
            if (url) {
                if (await this.objectExists(idImageUrl)) {
                    const state = await this.getStateAsync(idImageUrl);
                    const image = await this.getStateAsync(`${idChannel}.image`);
                    if ((state && state.val !== url) || image === null || (image && image.val === null)) {
                        await this.downloadImage(url, [idChannel]);
                    }
                }
                else {
                    if (await this.objectExists(`${idChannel}.image`)) {
                        await this.downloadImage(url, [idChannel]);
                    }
                }
            }
            else {
                if (await this.objectExists(`${idChannel}.image`)) {
                    await this.setState(`${idChannel}.image`, null, true);
                    await this.myIob.createOrUpdateDevice(idChannel, undefined, `${idChannel}.isOnline`, undefined, null, true, false);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    //#endregion
    //#region WS Listener
    /**
     * Websocket pong received, sets the aliveTimestamp to the current timestamp
     */
    async onPongMessage() {
        const logPrefix = '[onPongMessage]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            this.log.silly('ping pong');
            await this.setState('info.lastRealTimeData', { val: this.aliveTimestamp, lc: this.aliveTimestamp }, true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkMessage(event) {
        const logPrefix = '[onNetworkMessage]:';
        try {
            this.aliveTimestamp = moment().valueOf();
            if (event.meta.message === WebSocketEventMessages.device) {
                await this.updateDevices(event.data);
            }
            else if (event.meta.message.startsWith(WebSocketEventMessages.client)) {
                if (event.meta.message.endsWith(':sync')) {
                    await this.updateClients(event.data);
                }
                else {
                    await this.onNetworkClientEvent(event);
                }
            }
            else if (event.meta.message === WebSocketEventMessages.events) {
                await this.onNetworkEvent(event);
            }
            else if (event.meta.message.startsWith(WebSocketEventMessages.user)) {
                await this.onNetworkUserEvent(event);
            }
            else if (event.meta.message.startsWith(WebSocketEventMessages.wlanConf)) {
                await this.onNetworkWlanConfEvent(event);
            }
            else if (event.meta.message.startsWith(WebSocketEventMessages.lanConf)) {
                await this.onNetworkLanConfEvent(event);
            }
            else if (event.meta.message === WebSocketEventMessages.speedTest) {
                await this.onNetworkSpeedTestEvent(event);
            }
            else if (event.meta.message.startsWith(WebSocketEventMessages.firewallGroup)) {
                await this.onNetworkFirewallGroupEvent(event);
            }
            else {
                if (!this.eventsToIgnore.includes(event.meta.message)) {
                    this.log.warn(`${logPrefix} meta: ${JSON.stringify(event.meta)} not implemented! version: ${this.controllerVersion}, data: ${JSON.stringify(event.data)}`);
                }
            }
            await this.setState('info.lastRealTimeData', { val: this.aliveTimestamp, lc: this.aliveTimestamp }, true);
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
                    if (WebSocketEvent.client.Connected.includes(myEvent.key) || WebSocketEvent.client.Disconnected.includes(myEvent.key)) {
                        // Client connect or disconnect
                        this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.client.connected(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.client.Roamed.includes(myEvent.key)) {
                        // Client roamed between AP's
                        this.log.debug(`${logPrefix} event 'roamed' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.client.roamed(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.client.RoamedRadio.includes(myEvent.key)) {
                        // Client roamed radio -> change channel
                        this.log.debug(`${logPrefix} event 'roamed radio' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.client.roamedRadio(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.client.Blocked.includes(myEvent.key) || WebSocketEvent.client.Unblocked.includes(myEvent.key)) {
                        // Client blocked or unblocked
                        this.log.debug(`${logPrefix} event 'block / unblock' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.client.block(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.device.Restarted.includes(myEvent.key)) {
                        // Device connect or disconnect
                        this.log.debug(`${logPrefix} event 'restarted' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.device.restarted(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.device.Connected.includes(myEvent.key) || WebSocketEvent.device.Disconnected.includes(myEvent.key)) {
                        // Device restarted
                        this.log.debug(`${logPrefix} event 'connected / disconnected' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.device.connected(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.device.LostContact.includes(myEvent.key)) {
                        // Device lost contact
                        this.log.debug(`${logPrefix} event 'lost contact' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.device.lostContact(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.device.WANTransition.includes(myEvent.key)) {
                        // WAN ISP Connection changed
                        this.log.debug(`${logPrefix} event 'wan transition' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.device.wanTransition(event.meta, myEvent, this, this.cache);
                    }
                    else if (WebSocketEvent.device.Deleted.includes(myEvent.key)) {
                        // Device deleted
                        this.log.debug(`${logPrefix} event 'device deleted' (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        await eventHandler.device.deleted(event.meta, myEvent, this, this.cache);
                    }
                    else {
                        const deviceEvent = Object.entries(WebSocketEvent.device).find(([key, arr]) => arr.includes(myEvent.key));
                        const clientEvent = Object.entries(WebSocketEvent.client).find(([key, arr]) => arr.includes(myEvent.key));
                        if (deviceEvent) {
                            this.log.debug(`${logPrefix} device event '${deviceEvent[0]}' not implemented (key: ${myEvent.key}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        }
                        else if (clientEvent) {
                            this.log.debug(`${logPrefix} client event '${clientEvent[0]}' not implemented (key: ${myEvent.key}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        }
                        else {
                            this.log.warn(`${logPrefix} not implemented event (${myEvent.key ? `key: ${myEvent.key}` : ''}) - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(myEvent)})`);
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkClientEvent(events) {
        const logPrefix = '[onNetworkClientEvent]:';
        try {
            if (events.meta.message.endsWith(':disconnected')) {
                for (const event of events.data) {
                    if (event.type === 'VPN') {
                        // VPN disconnect
                        this.log.debug(`${logPrefix} event 'vpn disconnected' (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);
                        await eventHandler.client.vpnDisconnect(events.meta, event, this, this.cache);
                    }
                    else {
                        this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);
                    }
                }
            }
            else {
                this.log.warn(`${logPrefix} not implemented event - Please report this to the developer and creating an issue on github! (version: ${this.controllerVersion}, meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(events.data)})`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkUserEvent(events) {
        const logPrefix = '[onNetworkUserEvent]:';
        try {
            if (this.config.clientsEnabled || this.config.guestsEnabled || this.config.vpnEnabled) {
                if (events && events.data) {
                    for (const event of events.data) {
                        this.log.debug(`${logPrefix} client event (meta: ${JSON.stringify(events.meta)}, data: ${JSON.stringify(event)})`);
                        if (events.meta.message === 'user:delete') {
                            // client removed client from unifi-controller
                            await eventHandler.user.clientRemoved(events.meta, event, this, this.cache);
                        }
                        else if (events.meta.message === 'user:sync') {
                            // client updated
                            const name = event.unifi_device_info_from_ucore?.name || event.display_name || event.name || event.hostname;
                            const idChannel = !event.is_guest ? tree.client.idChannelUsers : tree.client.idChannelGuests;
                            event.last_seen = event.last_seen >= this.cache.clients[event.mac]?.last_seen ? event.last_seen : this.cache.clients[event.mac]?.last_seen;
                            if ((!this.config.clientIsWhiteList && !_.some(this.config.clientBlackList, { mac: event.mac })) || (this.config.clientIsWhiteList && _.some(this.config.clientBlackList, { mac: event.mac }))) {
                                this.log.debug(`${logPrefix} update ${!event.is_guest ? 'client' : 'guest'} '${this.cache.clients[event.mac]?.name}'`);
                                await this.myIob.createOrUpdateDevice(`${idChannel}.${event.mac}`, name, `${idChannel}.${event.mac}.isOnline`, undefined, undefined, true);
                                await this.myIob.createOrUpdateStates(`${idChannel}.${event.mac}`, tree.client.get(), event, this.cache.clients[event.mac], this.config.clientStatesBlackList, this.config.clientStatesIsWhiteList, this.cache.clients[event.mac].name, true);
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
    async onNetworkWlanConfEvent(event) {
        const logPrefix = '[onNetworkWlanConfEvent]:';
        try {
            if (this.config.wlanConfigEnabled) {
                this.log.debug(`${logPrefix} wlan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);
                if (event.meta.message.endsWith(':delete')) {
                    await eventHandler.wlanConf.deleted(event.meta, event.data, this, this.cache);
                }
                else {
                    await this.updateWlanConfig(event.data);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkLanConfEvent(event) {
        const logPrefix = '[onNetworkLanConfEvent]:';
        try {
            if (this.config.lanConfigEnabled) {
                this.log.debug(`${logPrefix} lan conf event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);
                if (event.meta.message.endsWith(':delete')) {
                    await eventHandler.lanConf.deleted(event.meta, event.data, this, this.cache);
                }
                else {
                    await this.updateLanConfig(event.data);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkFirewallGroupEvent(event) {
        const logPrefix = '[onNetworkFirewallGroupEvent]:';
        try {
            if (this.config.firewallGroupConfigEnabled) {
                this.log.debug(`${logPrefix} firewall group event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(event.data)})`);
                if (event.meta.message.endsWith(':delete')) {
                    await eventHandler.firewall.group.deleted(event.meta, event.data, this, this.cache);
                }
                else {
                    await this.updateFirewallGroup(event.data);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onNetworkSpeedTestEvent(event) {
        const logPrefix = '[onNetworkSpeedTestEvent]:';
        try {
            if (this.config.devicesEnabled) {
                await eventHandler.device.speedTest(event, this, this.cache);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');
if (process.argv[1] === modulePath) {
    // start the instance directly
    new UnifiNetwork();
}
export default function startAdapter(options) {
    // compact mode
    return new UnifiNetwork(options);
}
