import _ from 'lodash';
import * as myHelper from './helper.js';
// Boolean read+write: first matching rule wins, default 'switch'
const BOOLEAN_RW_ROLES = [
    { keywords: ['enable'], role: 'switch.enable' },
    { keywords: ['light', 'led'], role: 'switch.light' },
    { keywords: ['power', 'poe'], role: 'switch.power' },
];
// Boolean read only: first matching rule wins, default 'sensor'
const BOOLEAN_RO_ROLES = [
    { keywords: ['connected', 'reachable', 'isonline'], role: 'indicator.reachable' },
    { keywords: ['error'], role: 'indicator.error' },
    { keywords: ['alarm'], role: 'indicator.alarm' },
    { keywords: ['maintenance'], role: 'indicator.maintenance' },
];
// String read only: first matching rule wins, default 'text'
const STRING_RO_ROLES = [
    { keywords: ['firmware', 'version'], role: 'info.firmware' },
    { keywords: ['status'], role: 'info.status' },
    { keywords: ['model'], role: 'info.model' },
    { keywords: ['mac'], role: 'info.mac' },
    { keywords: ['name'], role: 'info.name' },
    { keywords: ['hardware'], role: 'info.hardware' },
    { keywords: ['serial'], role: 'info.serial' },
];
// Number: applied in order, the last matching rule defines the suffix
const NUMBER_SUFFIX_RULES = [
    { match: (unit, lowerId) => unit === '°C' || unit === '°F' || unit === 'K' || lowerId.includes('temperatur'), suffix: '.temperature' },
    { match: unit => unit === 'lux', suffix: '.brightness' },
    { match: unit => unit === 'ppm', suffix: '.co2' },
    { match: unit => unit === 'mbar', suffix: '.pressure' },
    { match: unit => unit === 'Wh' || unit === 'kWh', suffix: '.energy' },
    { match: unit => unit === 'W' || unit === 'kW', suffix: '.power' },
    { match: unit => unit === 'A', suffix: '.current' },
    { match: unit => unit === 'V', suffix: '.voltage' },
    { match: unit => unit === 'Hz', suffix: '.frequency' },
    { match: (_unit, lowerId) => lowerId.includes('longitude'), suffix: '.gps.longitude' },
    { match: (_unit, lowerId) => lowerId.includes('latitude'), suffix: '.gps.latitude' },
    { match: (unit, lowerId) => lowerId.includes('humidity') && unit !== '', suffix: '.humidity' },
    { match: (unit, lowerId) => lowerId.includes('battery') && unit === '%', suffix: '.battery' },
    { match: (unit, lowerId) => lowerId.includes('volume') && unit === '%', suffix: '.volume' },
];
/**
 * Returns the role of the first rule with a keyword contained in the lower-cased id.
 *
 * @param rules rules in priority order
 * @param lowerId lower-cased state id
 * @returns the role or undefined if no rule matches
 */
function firstKeywordRole(rules, lowerId) {
    return rules.find(rule => rule.keywords.some(keyword => lowerId.includes(keyword)))?.role;
}
/**
 * Returns the number suffix (e.g. '.temperature') for a unit and id. Later rules override earlier ones.
 *
 * @param unit unit of the state
 * @param lowerId lower-cased state id
 * @returns the suffix or an empty string
 */
function numberSuffix(unit, lowerId) {
    let suffix = '';
    for (const rule of NUMBER_SUFFIX_RULES) {
        if (rule.match(unit, lowerId)) {
            suffix = rule.suffix;
        }
    }
    return suffix;
}
export class myIob {
    adapter;
    log;
    utils;
    // ids of states where lc is taken from the value, filled once in the constructor
    statesUsingValAsLastChanged = new Set();
    // full ids of subscribed states, so each state is subscribed only once
    subscribedStates = new Set();
    statesWithWriteFunction = {};
    constructor(adapter, utils, statesUsingValAsLastChanged = []) {
        this.adapter = adapter;
        this.log = adapter.log;
        this.utils = utils;
        // copied into a Set; no caller changes the array after construction
        this.statesUsingValAsLastChanged = new Set(statesUsingValAsLastChanged);
    }
    /**
     * create or update a device object, update will only be done on adapter start
     *
     * @param id full id of the device
     * @param name name of the device, undefined keeps the stored name on update
     * @param options optional parameters, see DeviceOptions
     */
    async createOrUpdateDevice(id, name, options = {}) {
        const { onlineId, errorId, icon, updateObject = false, logChanges = true, native = {} } = options;
        const logPrefix = '[myIob.createOrUpdateDevice]:';
        try {
            const translatedName = this.translateName(name);
            const common = {
                name: translatedName ?? 'undefined',
                icon: icon,
            };
            if (onlineId) {
                common.statusStates = {
                    onlineId: onlineId.startsWith(this.adapter.namespace) ? onlineId : `${this.adapter.namespace}.${onlineId}`,
                };
            }
            if (errorId) {
                if (!common.statusStates) {
                    common.statusStates = {};
                }
                common.statusStates.errorId = errorId.startsWith(this.adapter.namespace) ? errorId : `${this.adapter.namespace}.${errorId}`;
            }
            await this.createOrUpdateObject({
                logPrefix,
                id,
                type: 'device',
                common,
                native,
                updateObject,
                isNameGiven: translatedName !== undefined,
                isCommonEqual: (objCommon, myCommon) => this.isDeviceCommonEqual(objCommon, myCommon),
                logChanges,
            });
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * translate a name if a translation exists for it, otherwise return the name unchanged
     *
     * @param name
     * @returns
     */
    translateName(name) {
        if (typeof name !== 'string') {
            return name;
        }
        const translation = this.utils.I18n.getTranslatedObject(name);
        return translation && Object.keys(translation).length > 1 ? translation : name;
    }
    /**
     * create a device or channel object, or on adapter start (updateObject) update its common properties if they differ
     *
     * @param options
     */
    async createOrUpdateObject(options) {
        const { logPrefix, id, type, common, native, updateObject, isNameGiven, isCommonEqual, logChanges } = options;
        if (!(await this.adapter.objectExists(id))) {
            this.log.debug(`${logPrefix} creating ${type} '${id}'`);
            await this.adapter.setObjectNotExistsAsync(id, {
                type: type,
                common: common,
                native,
            });
            return;
        }
        if (!updateObject) {
            return;
        }
        const obj = await this.adapter.getObjectAsync(id);
        if (obj && obj.common) {
            const storedName = obj.common.name;
            // no name passed -> keep the stored name instead of overwriting it with 'undefined'
            if (!isNameGiven && storedName && storedName !== 'undefined') {
                common.name = storedName;
            }
            if (!isCommonEqual(obj.common, common)) {
                await this.adapter.extendObject(id, { common: common });
                const diff = this.deepDiffBetweenObjects(common, obj.common, this.adapter);
                if (diff && diff.icon) {
                    diff.icon = _.truncate(diff.icon);
                } // reduce base64 image string for logging
                this.log.debug(`${logPrefix} ${type} updated '${id}' ${logChanges ? `(updated properties: ${JSON.stringify(diff)})` : ''}`);
            }
        }
    }
    /**
     * create or update a channel object, update will only be done on adapter start
     *
     * @param id
     * @param name
     * @param icon
     * @param updateObject
     * @param native
     */
    async createOrUpdateChannel(id, name, icon = undefined, updateObject = false, native = {}) {
        const logPrefix = '[myIob.createOrUpdateChannel]:';
        try {
            const translatedName = this.translateName(name);
            const common = {
                name: translatedName ?? 'undefined',
                icon: icon,
            };
            await this.createOrUpdateObject({
                logPrefix,
                id,
                type: 'channel',
                common,
                native,
                updateObject,
                isNameGiven: translatedName !== undefined,
                isCommonEqual: (objCommon, myCommon) => this.isChannelCommonEqual(objCommon, myCommon),
                logChanges: true,
            });
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * true if the state, channel or array is required. A required function is called with the device, the channel and the adapter.
     *
     * @param required the `required` value of the tree definition
     * @param objDevice the device data
     * @param objChannel the channel data
     */
    isRequired(required, objDevice, objChannel) {
        return typeof required === 'function' ? required(objDevice, objChannel, this.adapter) === true : required === true;
    }
    /**
     * create or update the states of a tree definition, recursive over channels and array items
     *
     * @param idChannel full id of the channel
     * @param treeDefinition tree definition of the channel
     * @param partialData data to process, may contain only a part of the properties
     * @param fullData full data of the object, used for conditions, units and log messages
     * @param options optional parameters, see StatesSyncOptions
     * @returns true if the value of at least one state changed
     */
    async createOrUpdateStates(idChannel, treeDefinition, partialData, fullData, options = {}) {
        const { blacklistFilter, isWhiteList = false, logDeviceName = 'not defined', updateObject = false } = options;
        // identifies the data object in log messages, the same for all keys of one call
        const idInfo = fullData;
        const ctx = {
            deviceId: this.getIdLastPart(idChannel),
            fullData,
            blacklistFilter,
            isWhiteList,
            logDeviceName,
            logDetails: `${idInfo?.mac ? `mac: ${idInfo.mac}` : idInfo?.ip ? `ip: ${idInfo.ip}` : idInfo?._id ? `id: ${idInfo._id}` : ''}`,
            // reason used in log messages when an object is deleted because it is not allowed
            blockReason: isWhiteList ? `it's not on the whitelist` : `it's on the blacklist`,
            logPrefix: '[myIob.createOrUpdateStates]:',
        };
        const level = { channel: idChannel, treeDefinition, treeData: partialData, channelData: fullData, updateObject, filterId: '', isChannelOnWhitelist: false };
        return await this._createOrUpdateStates(level, ctx);
    }
    /**
     * Checks whether a whitelist entry equals the given channel id or lies below it.
     * The check is delimiter-aware, so 'radio_table.x' does not match the channel 'radio'.
     *
     * @param blacklistFilter list of whitelist/blacklist entries
     * @param channelId full id of the channel (without trailing delimiter)
     */
    hasWhitelistEntryAtOrBelow(blacklistFilter, channelId) {
        return _.some(blacklistFilter, x => !!x.id && (x.id === channelId || x.id.startsWith(`${channelId}.`)));
    }
    /**
     * Decides whether an id passes the whitelist or blacklist filter.
     * isChannelOnWhitelist is only set for whitelists, so checking it first keeps the previous behaviour.
     *
     * @param blacklistFilter list of whitelist/blacklist entries
     * @param isWhiteList true for a whitelist, false for a blacklist
     * @param id full id of the state or channel (without trailing delimiter)
     * @param isChannelOnWhitelist true if a parent channel is allowed as a whole
     * @param matchChildren true for channels and array items: entries below the id count as well
     * @returns true if the id is allowed
     */
    isAllowedByFilter(blacklistFilter, isWhiteList, id, isChannelOnWhitelist, matchChildren) {
        if (isChannelOnWhitelist) {
            return true;
        }
        if (!isWhiteList) {
            return !_.some(blacklistFilter, { id });
        }
        return matchChildren ? this.hasWhitelistEntryAtOrBelow(blacklistFilter, id) : _.some(blacklistFilter, { id });
    }
    /**
     * Processes all keys of one tree level (a channel or an array item).
     *
     * @param level values of this level
     * @param ctx values shared by the whole recursion
     * @returns true if the value of at least one state changed
     */
    async _createOrUpdateStates(level, ctx) {
        let stateValueChanged = false;
        try {
            if (this.adapter.connected) {
                for (const key in level.treeDefinition) {
                    const treeDef = level.treeDefinition[key];
                    try {
                        // if we have an own defined state which takes val from other property
                        let valKey = key;
                        if (this.hasKey(treeDef, 'valFromProperty') && treeDef.valFromProperty) {
                            if (this.hasKey(level.treeData, treeDef.valFromProperty)) {
                                valKey = treeDef.valFromProperty;
                            }
                            else {
                                this.log.silly(`${ctx.logPrefix} '${ctx.logDeviceName}' ${ctx.logDetails ? `(${ctx.logDetails}) ` : ''} key '${key}' has valFromProperty '${treeDef.valFromProperty}' not exist in data -> skipping!`);
                                continue;
                            }
                        }
                        const cond1 = (this.hasKey(level.treeData, valKey) && level.treeData[valKey] !== undefined) || (this.hasKey(treeDef, 'id') && !this.hasKey(treeDef, 'valFromProperty'));
                        const cond2 = this.hasKey(treeDef, 'iobType') && !this.hasKey(treeDef, 'object') && !this.hasKey(treeDef, 'array');
                        if (key && cond1 && cond2) {
                            // if we have a 'iobType' property, then it's a state
                            if (await this.processState(key, valKey, treeDef, level, ctx)) {
                                stateValueChanged = true;
                            }
                        }
                        else {
                            // it's a channel from type object
                            if (await this.processObjectChannel(key, treeDef, level, ctx)) {
                                stateValueChanged = true;
                            }
                            // it's a channel from type array
                            if (await this.processArrayChannel(key, treeDef, level, ctx)) {
                                stateValueChanged = true;
                            }
                        }
                    }
                    catch (error) {
                        this.log.error(`${ctx.logPrefix} [id: ${key}, ${ctx.logDetails ? `${ctx.logDetails}, ` : ''}key: ${key}] error: ${error}, stack: ${error.stack}, data: ${this.hasKey(level.treeData, key) ? JSON.stringify(level.treeData[key]) : 'undefined'}`);
                    }
                }
            }
            else {
                if (this.log.level === 'debug') {
                    this.log.warn(`${ctx.logPrefix} adapter has no connection!`);
                }
            }
        }
        catch (error) {
            this.log.error(`${ctx.logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return stateValueChanged;
    }
    /**
     * Creates, updates or deletes one state and writes its value.
     *
     * @param key key of the state in the tree definition
     * @param valKey key of the value in the data (differs from key with valFromProperty)
     * @param treeDef tree definition of the state
     * @param level values of the current tree level
     * @param ctx values shared by the whole recursion
     * @returns true if the value of this state changed
     */
    async processState(key, valKey, treeDef, level, ctx) {
        const { channel, treeDefinition, treeData, channelData, updateObject, filterId, isChannelOnWhitelist } = level;
        const { deviceId, fullData, blacklistFilter, isWhiteList, logDeviceName, blockReason, logPrefix } = ctx;
        // if we have a custom state, use defined id
        const stateId = this.hasKey(treeDef, 'id') ? treeDef.id : key;
        if (!this.isConditionMet(treeDef, fullData, channelData)) {
            if (updateObject) {
                await this.deleteObjectWithLog(ctx, 'state', `${channel}.${stateId}`, false, `condition to create is 'false'`);
            }
            return false;
        }
        const logMsgState = `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');
        if (!(this.isAllowedByFilter(blacklistFilter, isWhiteList, `${filterId}${stateId}`, isChannelOnWhitelist, false) || this.isRequired(treeDef.required, fullData, channelData))) {
            // channel is on blacklist
            // delete also at runtime, because some properties are only available on websocket data
            await this.deleteObjectWithLog(ctx, 'state', `${channel}.${stateId}`, false, blockReason);
            return false;
        }
        if (!(await this.adapter.objectExists(`${channel}.${stateId}`))) {
            // create State
            this.log.silly(`${logPrefix} ${logDeviceName} - creating state '${logMsgState}'`);
            // common is undefined if getCommonForState failed, the object is then created without common
            const obj = {
                type: 'state',
                common: this.getCommonForState(key, treeDefinition, fullData, channelData, logMsgState, logDeviceName),
                native: {},
            };
            await this.adapter.setObjectNotExistsAsync(`${channel}.${stateId}`, obj);
        }
        else if (updateObject) {
            // update State if needed (only on adapter start)
            const obj = await this.adapter.getObjectAsync(`${channel}.${stateId}`);
            const commonUpdated = this.getCommonForState(key, treeDefinition, fullData, channelData, logMsgState, logDeviceName);
            // commonUpdated is undefined if getCommonForState failed, then the state is left unchanged
            if (obj && obj.common && commonUpdated) {
                if (!this.isStateCommonEqual(obj.common, commonUpdated)) {
                    await this.adapter.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
                    this.log.debug(`${logPrefix} ${logDeviceName} - updated common properties of state '${logMsgState}' (updated properties: ${JSON.stringify(this.deepDiffBetweenObjects(commonUpdated, obj.common, this.adapter))})`);
                }
            }
        }
        if (!this.subscribedStates.has(`${channel}.${stateId}`) && ((treeDef.write && treeDef.write === true) || this.hasKey(treeDef, 'subscribeMe'))) {
            // state is writeable or has subscribeMe Property -> subscribe it
            this.log.silly(`${logPrefix} ${logDeviceName} - subscribing state '${logMsgState}'`);
            await this.adapter.subscribeStatesAsync(`${channel}.${stateId}`);
            this.subscribedStates.add(`${channel}.${stateId}`);
        }
        const writeValKey = `${channel}.${stateId}`.replace(`.${deviceId}.`, '.');
        if (!this.statesWithWriteFunction[writeValKey] && treeDef.writeVal) {
            // state has a write conversation function -> store function in 'list' to use it before writing data to ufp
            this.statesWithWriteFunction[writeValKey] = treeDef.writeVal;
        }
        if (!(treeData && this.hasKey(treeData, valKey) && (this.hasKey(treeData, key) || this.hasKey(treeData, treeDef.valFromProperty)))) {
            if (!this.hasKey(treeDef, 'id')) {
                // only report it if it's not a custom defined state
                this.log.debug(`${logPrefix} ${logDeviceName} - property '${logMsgState}' not exists in data (sometimes this option may first need to be activated / used or will update by an event)`);
            }
            return false;
        }
        const val = treeDef.readVal ? await treeDef.readVal(treeData[valKey], this.adapter, fullData, channelData, `${channel}.${stateId}`) : treeData[valKey];
        // set lc to last_seen value (timestamps in ms), only possible for numbers (null is no valid lc, js-controller rejects it)
        // the adapter types declare the result as id (string), the code reads notChanged from the result at runtime
        const changedObj = (this.statesUsingValAsLastChanged.has(stateId ?? key)
            ? await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, typeof val === 'number' ? { val: val, lc: val } : { val: val }, true)
            : await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, val, true));
        // value of this state changed (only evaluated outside of object updates)
        const stateChanged = !updateObject && !!changedObj && this.hasKey(changedObj, 'notChanged') && !changedObj.notChanged;
        if (stateChanged) {
            this.log.silly(`${logPrefix} value of state '${logMsgState}' changed to ${val}`);
        }
        // updateTs depends only on this state: a changed value already updates the timestamp
        if (!stateChanged && this.hasKey(treeDef, 'updateTs') && treeDef.updateTs === true) {
            this.log.silly(`${logPrefix} timestamp of state '${logMsgState}' updated`);
            await this.adapter.setState(`${channel}.${stateId}`, val, true);
        }
        return stateChanged;
    }
    /**
     * Creates or updates a channel of type object and processes its tree definition.
     *
     * @param key key of the channel in the tree definition
     * @param treeDef tree definition of the key
     * @param level values of the current tree level
     * @param ctx values shared by the whole recursion
     * @returns true if the value of a state in this channel changed
     */
    async processObjectChannel(key, treeDef, level, ctx) {
        const { channel, treeDefinition, treeData, channelData, updateObject, filterId, isChannelOnWhitelist } = level;
        const { blacklistFilter, isWhiteList, fullData, blockReason } = ctx;
        if (!(this.hasKey(treeDef, 'object') && this.hasKey(treeData, key))) {
            return false;
        }
        const treeObjectDef = treeDefinition[key];
        const idChannelAppendix = this.hasKey(treeObjectDef, 'idChannel') ? treeObjectDef.idChannel : key;
        const idChannel = `${channel}.${idChannelAppendix}`;
        if (!this.isConditionMet(treeObjectDef, fullData, channelData)) {
            await this.deleteObjectWithLog(ctx, 'channel', idChannel, true, `condition to create is 'false'`);
            return false;
        }
        if (!(this.isAllowedByFilter(blacklistFilter, isWhiteList, `${filterId}${idChannelAppendix}`, isChannelOnWhitelist, true) || this.isRequired(treeObjectDef.required, fullData, channelData))) {
            // channel is on blacklist
            await this.deleteObjectWithLog(ctx, 'channel', idChannel, true, blockReason);
            return false;
        }
        await this.createOrUpdateChannel(`${idChannel}`, this.hasKey(treeObjectDef, 'name') ? (typeof treeObjectDef.name === 'function' ? treeObjectDef.name(fullData, channelData[key], this.adapter) : treeObjectDef.name) : key, this.hasKey(treeObjectDef, 'icon') ? treeObjectDef.icon : undefined, updateObject);
        const childLevel = {
            channel: `${idChannel}`,
            treeDefinition: treeObjectDef.object,
            treeData: treeData[key],
            channelData: channelData[key],
            updateObject,
            filterId: `${filterId}${idChannelAppendix}.`,
            isChannelOnWhitelist: this.isChildOnWhitelist(isChannelOnWhitelist, isWhiteList, blacklistFilter, `${filterId}${idChannelAppendix}`),
        };
        return await this._createOrUpdateStates(childLevel, ctx);
    }
    /**
     * Creates or updates a channel of type array and processes each array item.
     *
     * @param key key of the array in the tree definition
     * @param treeDef tree definition of the key
     * @param level values of the current tree level
     * @param ctx values shared by the whole recursion
     * @returns true if the value of a state in one of the array items changed
     */
    async processArrayChannel(key, treeDef, level, ctx) {
        const { channel, treeDefinition, treeData, channelData, filterId, isChannelOnWhitelist } = level;
        const { fullData, blacklistFilter, isWhiteList, blockReason } = ctx;
        if (!(this.hasKey(treeDef, 'array') && this.hasKey(treeData, key))) {
            return false;
        }
        const arrayData = treeData[key];
        if (!(arrayData !== null && arrayData.length > 0)) {
            return false;
        }
        const treeArrayDef = treeDefinition[key];
        const idChannelAppendix = this.hasKey(treeArrayDef, 'idChannel') ? treeArrayDef.idChannel : key;
        const idChannel = `${channel}.${idChannelAppendix}`;
        if (!this.isConditionMet(treeArrayDef, fullData, channelData)) {
            await this.deleteObjectWithLog(ctx, 'channel', idChannel, true, `condition to create is 'false'`);
            return false;
        }
        if (!(this.isAllowedByFilter(blacklistFilter, isWhiteList, `${filterId}${idChannelAppendix}`, isChannelOnWhitelist, true) || this.isRequired(treeArrayDef.required, fullData, channelData))) {
            // channel is on blacklist, wlan is coming from realtime api
            await this.deleteObjectWithLog(ctx, 'channel', idChannel, true, blockReason);
            return false;
        }
        await this.createOrUpdateChannel(`${idChannel}`, this.hasKey(treeArrayDef, 'name') ? treeArrayDef.name : key, this.hasKey(treeArrayDef, 'icon') ? treeArrayDef.icon : undefined, level.updateObject);
        const arrayNumberAdd = (this.hasKey(treeArrayDef, 'arrayStartNumber') ? treeArrayDef.arrayStartNumber : 0) ?? 0;
        let valueChanged = false;
        for (let i = 0; i <= arrayData.length - 1; i++) {
            const nr = i + arrayNumberAdd;
            if (treeData[key][i] === null || treeData[key][i] === undefined) {
                continue;
            }
            let idChannelArray = myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);
            if (this.hasKey(treeArrayDef, 'arrayChannelIdFromProperty')) {
                idChannelArray = treeArrayDef.arrayChannelIdFromProperty?.(fullData, channelData[key][i], i, this.adapter);
            }
            else if (this.hasKey(treeArrayDef, 'arrayChannelIdPrefix')) {
                idChannelArray = treeArrayDef.arrayChannelIdPrefix + myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);
            }
            if (idChannelArray === undefined) {
                continue;
            }
            await this.createOrUpdateChannel(`${idChannel}.${idChannelArray}`, this.hasKey(treeArrayDef, 'arrayChannelNameFromProperty') ? treeArrayDef.arrayChannelNameFromProperty?.(fullData, channelData[key][i], i, this.adapter) : (treeArrayDef.arrayChannelNamePrefix ?? '') + nr || nr.toString(), undefined, true);
            const itemLevel = {
                channel: `${idChannel}.${idChannelArray}`,
                treeDefinition: treeArrayDef.array,
                treeData: treeData[key][i],
                channelData: channelData[key][i],
                updateObject: true,
                filterId: `${filterId}${idChannelAppendix}.`,
                isChannelOnWhitelist: this.isChildOnWhitelist(isChannelOnWhitelist, isWhiteList, blacklistFilter, `${filterId}${idChannelAppendix}`),
            };
            if (await this._createOrUpdateStates(itemLevel, ctx)) {
                valueChanged = true;
            }
        }
        return valueChanged;
    }
    /**
     * delete an object if it exists
     *
     * @param id full id of the object
     * @param recursive also delete child objects
     * @returns true if the object existed and was deleted
     */
    async deleteObjectIfExists(id, recursive) {
        if (!(await this.adapter.objectExists(id))) {
            return false;
        }
        if (recursive) {
            await this.adapter.delObjectAsync(id, { recursive: true });
        }
        else {
            await this.adapter.delObjectAsync(id);
        }
        return true;
    }
    /**
     * true if a state, channel or array may be created. Without a conditionToCreateState the condition counts as met.
     *
     * @param treeDef tree definition with an optional conditionToCreateState
     * @param treeDef.conditionToCreateState optional condition, counts as met if missing
     * @param fullData full data of the device
     * @param channelData data of the channel
     */
    isConditionMet(treeDef, fullData, channelData) {
        if (!this.hasKey(treeDef, 'conditionToCreateState')) {
            return true;
        }
        return treeDef.conditionToCreateState?.(fullData, channelData, this.adapter) === true;
    }
    /**
     * Deletes an object if it exists and logs the reason. Used for objects that are not allowed.
     *
     * @param ctx values shared by the whole recursion, used for the log message
     * @param objectType 'state' or 'channel', used in the log message
     * @param id full id of the object
     * @param recursive also delete child objects
     * @param reason reason for the log message
     */
    async deleteObjectWithLog(ctx, objectType, id, recursive, reason) {
        if (await this.deleteObjectIfExists(id, recursive)) {
            this.log.info(`${ctx.logPrefix} '${ctx.logDeviceName}' ${ctx.logDetails ? `(${ctx.logDetails}) ` : ''}${objectType} '${id}' delete, ${reason}`);
        }
    }
    /**
     * true if a child channel or array item is allowed as a whole, because its parent is allowed or it is on the whitelist
     *
     * @param isChannelOnWhitelist true if the parent channel is allowed as a whole
     * @param isWhiteList true if blacklistFilter is a whitelist
     * @param blacklistFilter whitelist or blacklist entries
     * @param childId full id of the child without trailing delimiter
     */
    isChildOnWhitelist(isChannelOnWhitelist, isWhiteList, blacklistFilter, childId) {
        return isChannelOnWhitelist || (isWhiteList && _.some(blacklistFilter, { id: childId }));
    }
    getCommonForState(id, treeDefinition, fullData, channelData, logMsgState, logDeviceName) {
        const logPrefix = '[myIob.getCommonForState]:';
        try {
            // i18n translation if exists
            const i18n = this.utils.I18n.getTranslatedObject(treeDefinition[id].name || id);
            const name = Object.keys(i18n).length > 1 ? i18n : treeDefinition[id].name || id;
            const common = {
                name: name,
                type: treeDefinition[id].iobType,
                read: treeDefinition[id].read !== undefined ? treeDefinition[id].read : true,
                write: treeDefinition[id].write !== undefined ? treeDefinition[id].write : false,
                role: 'state'
            };
            if (treeDefinition[id].unit) {
                const unitTmp = treeDefinition[id]?.unit;
                const unit = (typeof unitTmp === 'function') ? unitTmp(fullData, channelData, this.adapter) : unitTmp;
                const unitI18 = this.utils.I18n.getTranslatedObject(unit);
                common.unit = Object.keys(unitI18).length > 1 && this.adapter.language && unitI18[this.adapter.language] ? unitI18[this.adapter.language] : unit;
            }
            if (treeDefinition[id].min || treeDefinition[id].min === 0) {
                common.min = treeDefinition[id].min;
            }
            if (treeDefinition[id].max || treeDefinition[id].max === 0) {
                common.max = treeDefinition[id].max;
            }
            if (treeDefinition[id].step) {
                common.step = treeDefinition[id].step;
            }
            if (treeDefinition[id].expert) {
                common.expert = treeDefinition[id].expert;
            }
            common.role = treeDefinition[id].role ? treeDefinition[id].role : this.assignPredefinedRoles(common, id);
            if (treeDefinition[id].def || treeDefinition[id].def === 0 || treeDefinition[id].def === false) {
                common.def = treeDefinition[id].def;
            }
            if (treeDefinition[id].states) {
                common.states = treeDefinition[id].states;
            }
            else if (this.hasKey(treeDefinition[id], 'statesFromProperty')) {
                common.states = treeDefinition[id].statesFromProperty?.(fullData, channelData, this.adapter);
                this.log.debug(`${logPrefix} ${logDeviceName} - set ${common.states?.length || Object.keys(common.states || {}).length} allowed common.states for '${logMsgState}'`);
                this.log.silly(`${logPrefix} ${logDeviceName} - set allowed common.states for '${logMsgState}' (from: ${JSON.stringify(common.states)})`);
            }
            if (treeDefinition[id].desc) {
                common.desc = treeDefinition[id].desc;
            }
            return common;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    assignPredefinedRoles(common, id) {
        //https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
        const logPrefix = '[myIob.assignPredefinedRoles]:';
        try {
            // lower case once, all keyword checks are case-insensitive
            const lowerId = this.getIdLastPart(id).toLowerCase();
            if (common.type === 'boolean') {
                if (common.read === true && common.write === true) {
                    return firstKeywordRole(BOOLEAN_RW_ROLES, lowerId) ?? 'switch';
                }
                if (common.read === true && common.write === false) {
                    return firstKeywordRole(BOOLEAN_RO_ROLES, lowerId) ?? 'sensor';
                }
            }
            if (common.type === 'number') {
                const suffix = numberSuffix(common.unit, lowerId);
                // read true/false with write true both map to 'level'
                if (common.write === true && typeof common.read === 'boolean') {
                    return `level${suffix}`;
                }
                if (common.read === true && common.write === false) {
                    return `value${suffix}`;
                }
            }
            if (common.type === 'string') {
                if (common.read === true && common.write === false) {
                    return firstKeywordRole(STRING_RO_ROLES, lowerId) ?? 'text';
                }
                return 'text';
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return 'state';
    }
    /**
     * check if state exists before setting value
     *
     * @param id
     * @param val
     * @param adapter
     * @param onlyChanges
     */
    async setStateExists(id, val, adapter, onlyChanges = false) {
        const logPrefix = '[myIob.setStateExists]:';
        try {
            if (await adapter.objectExists(id)) {
                if (!onlyChanges) {
                    await adapter.setState(id, val, true);
                }
                else {
                    await adapter.setStateChangedAsync(id, val, true);
                }
            }
        }
        catch (error) {
            adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Id without last part
     *
     * @param id
     * @returns
     */
    getIdWithoutLastPart(id) {
        const lastIndex = id.lastIndexOf('.');
        return id.substring(0, lastIndex);
    }
    /**
     * last part of id
     *
     * @param id
     * @returns
     */
    getIdLastPart(id) {
        const result = id.split('.').pop();
        return result ? result : '';
    }
    /**
     * Compare common properties of device
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    isDeviceCommonEqual(objCommon, myCommon) {
        return _.isEqual(objCommon.name, myCommon.name) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role && _.isEqual(objCommon.statusStates, myCommon.statusStates);
    }
    /**
     * Compare common properties of channel
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    isChannelCommonEqual(objCommon, myCommon) {
        return _.isEqual(objCommon.name, myCommon.name) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role;
    }
    /**
     * Compare common properties of state
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    isStateCommonEqual(objCommon, myCommon) {
        // step, expert and icon are only compared if the tree definition sets them.
        // Otherwise a manually set icon or a value that is no longer defined would cause
        // an extendObject call on every run.
        const isOptionalEqual = (key) => myCommon[key] === undefined || _.isEqual(objCommon[key], myCommon[key]);
        return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.type, myCommon.type) && _.isEqual(objCommon.read, myCommon.read) && _.isEqual(objCommon.write, myCommon.write) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.def, myCommon.def) && _.isEqual(objCommon.unit, myCommon.unit) && isOptionalEqual('icon') && isOptionalEqual('step') && isOptionalEqual('expert') && _.isEqual(objCommon.desc, myCommon.desc) && _.isEqual(objCommon.max, myCommon.max) && _.isEqual(objCommon.min, myCommon.min) && _.isEqual(objCommon.states, myCommon.states);
    }
    /**
     * Compare two objects and return properties that are different
     *
     * @param object
     * @param base
     * @param adapter
     * @param allowedKeys
     * @param prefix
     * @returns
     */
    deepDiffBetweenObjects = (object, base, adapter, allowedKeys = undefined, prefix = '') => {
        const logPrefix = '[myIob.deepDiffBetweenObjects]:';
        try {
            const changes = (object, base, prefixInner = '') => {
                return _.transform(object, (result, value, key) => {
                    const fullKey = prefixInner ? `${prefixInner}.${key}` : key;
                    try {
                        if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                            if (_.isArray(value)) {
                                if (_.some(value, (item) => _.isObject(item))) {
                                    // objects in array exists
                                    const tmp = [];
                                    let empty = true;
                                    for (let i = 0; i <= value.length - 1; i++) {
                                        const res = this.deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);
                                        if (!_.isEmpty(res) || res === 0 || res === false) {
                                            // if (!_.has(result, key)) result[key] = [];
                                            tmp.push(res);
                                            empty = false;
                                        }
                                        else {
                                            tmp.push(null);
                                        }
                                    }
                                    if (!empty) {
                                        result[key] = tmp;
                                    }
                                }
                                else {
                                    // is pure array
                                    if (!_.isEqual(value, base[key])) {
                                        result[key] = value;
                                    }
                                }
                            }
                            else if (_.isObject(value) && _.isObject(base[key])) {
                                const res = changes(value, base[key] ? base[key] : {}, fullKey);
                                if (!_.isEmpty(res) || res === 0 || res === false) {
                                    result[key] = res;
                                }
                            }
                            else {
                                result[key] = value;
                            }
                        }
                    }
                    catch (error) {
                        adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                    }
                });
            };
            return changes(object, base, prefix);
        }
        catch (error) {
            adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
        }
        return object;
    };
    /**
     * Checks the translations of all names in the given tree definitions.
     *
     * @param obj root object of the tree definitions (e.g. the tree module of the adapter)
     * @param logSuffix optional suffix for the log messages
     */
    findMissingTranslation(obj, logSuffix = undefined) {
        const logPrefix = `[myIob.findMissingTranslation]:${logSuffix ? ` ${logSuffix}` : ''}`;
        try {
            const tree = obj;
            for (const key in tree) {
                if (_.isObject(tree[key]) && !key.includes('events')) {
                    const childSuffix = logSuffix ? `${logSuffix}.${key}` : key;
                    if (this.hasKey(tree[key], 'get')) {
                        const result = this.tree2Translation(tree[key].get(), this.utils.I18n);
                        if (result && Object.keys(result).length > 0) {
                            this.log.warn(`${logPrefix} ${key} - missing translations ${JSON.stringify(result)}`);
                        }
                        if (Object.keys(tree[key]).length > 0) {
                            this.findMissingTranslation(tree[key], childSuffix);
                        }
                    }
                    else {
                        this.findMissingTranslation(tree[key], childSuffix);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * generate a list with all defined names, that can be used for translation
     *
     * @param tree
     * @param i18n
     */
    tree2Translation(tree, i18n) {
        const result = this.getTreeNameOrKey(tree);
        for (const key of Object.keys(result)) {
            if (Object.keys(i18n.getTranslatedObject(key)).length > 1) {
                delete result[key];
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }
    getTreeNameOrKey(obj, path = []) {
        const result = {};
        if (obj && typeof obj === "object") {
            if ("iobType" in obj || 'array' in obj || 'object' in obj) {
                const lastKey = path[path.length - 1];
                if (typeof obj.name !== 'function') {
                    result[obj.name ?? lastKey] = obj.name ?? lastKey;
                }
            }
            for (const [childKey, value] of Object.entries(obj)) {
                if (value && typeof value === "object") {
                    Object.assign(result, this.getTreeNameOrKey(value, [...path, childKey]));
                }
            }
        }
        return result;
    }
    hasKey(obj, key) {
        if (key) {
            return Object.hasOwn(obj, key);
        }
        return false;
    }
}
