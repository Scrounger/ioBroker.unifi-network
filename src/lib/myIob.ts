import _ from 'lodash';

import * as myHelper from './helper.js';
import type { myTreeData } from './myTypes.js';
import * as tree from './tree/index.js';

type ReadValFunction<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter>
    = (val: Type, adapter: Adapter, device: Device, channel: Device, id: string)
        => ioBroker.StateValue | Promise<ioBroker.StateValue>


export type WriteValFunction<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter>
    = (val: Type, id: string, device: Device, adapter: Adapter)
        => any | Promise<any>;


type ConditionToCreateStateFunction<
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter>
    = (objDevice: Device, objChannel: Device, adapter: Adapter)
        => boolean;

export type myTreeDefinition<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> =
    | myTreeState<Type, Device, Adapter>
    | myTreeObject<Type, Device, Adapter>
    | myTreeArray<Type, Device, Adapter>;

export type unitDefinition<
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> = string | ((objDevice: Device, objChannel: Device, adapter: Adapter) => string);

/** required state, channel or array: true or false, or a function of device, channel and adapter that returns true or false. Required items can not be blacklisted. */
export type requiredDefinition<
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> = boolean | ((objDevice: Device, objChannel: Device, adapter: Adapter) => boolean);

export interface myTreeState<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> {
    id?: string;
    iobType: ioBroker.CommonType;
    name?: string;
    role?: string;
    read?: boolean;
    write?: boolean;
    unit?: unitDefinition<Device, Adapter>;
    min?: number;
    max?: number;
    step?: number;
    states?: Record<string, string> | string[] | string;
    expert?: true;
    icon?: string;
    def?: ioBroker.StateValue;
    desc?: string;

    readVal?: ReadValFunction<Type, Device, Adapter>;
    writeVal?: WriteValFunction<Type, Device, Adapter>;

    valFromProperty?: string; // Take value from other property in the corresponding tree. If this property is an object, @link ./helper.ts [getAllKeysOfTreeDefinition] must added manual if they should be recognized
    statesFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): Record<string, string> | string[] | string; // ToDo: perhaps can be removed

    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>; // condition to create state

    subscribeMe?: true; // subscribe
    required?: requiredDefinition<Device, Adapter>; // required, can not be blacklisted
    updateTs?: true; // always update state, so that timestamp is updated
}

export type nameDefinition<
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> = string | ((objDevice: Device, objChannel: Device, adapter: Adapter) => string | ioBroker.Translated);

export interface myTreeObject<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> {
    idChannel?: string;
    name?: nameDefinition<Device, Adapter>;
    icon?: string;
    object: { [key: string]: myTreeDefinition<Type, Device, Adapter> };
    required?: requiredDefinition<Device, Adapter>; // required, can not be blacklisted
    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>; // condition to create state
}

export type arrayChannelIdFromPropertyFunction<
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> = (objDevice: Device, objChannel: Device, i: number, adapter: Adapter) => string | undefined;

export interface myTreeArray<
    Type extends ioBroker.StateValue = ioBroker.StateValue,
    Device extends myTreeData = myTreeData,
    Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter
> {
    idChannel?: string;
    name?: string;
    icon?: string;
    arrayChannelIdPrefix?: string; // Array item id get a prefix e.g. myPrefix_0
    arrayChannelIdZeroPad?: number; // Array item id get a padding for the number
    arrayChannelIdFromProperty?: arrayChannelIdFromPropertyFunction<Device, Adapter>; // Array item id is taken from a property in the corresponding tree
    arrayChannelNamePrefix?: string; // Array item common.name get a prefix e.g. myPrefix_0
    arrayChannelNameFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string | ioBroker.Translated; // Array item common.name is taken from a property in the corresponding tree
    arrayStartNumber?: number; // Array custom start number of array
    array: { [key: string]: myTreeDefinition<Type, Device, Adapter> };
    required?: requiredDefinition<Device, Adapter>; // required, can not be blacklisted
    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>; // condition to create state
}

/** Parameters for creating or updating a device or channel object */
interface ObjectWriteOptions<TCommon extends ioBroker.DeviceCommon | ioBroker.ChannelCommon> {
    logPrefix: string;
    id: string;
    type: 'device' | 'channel';
    common: TCommon;
    native: Record<string, any>;
    updateObject: boolean;
    /** false if no name was passed, then the stored name is kept on update */
    isNameGiven: boolean;
    isCommonEqual: (objCommon: TCommon, myCommon: TCommon) => boolean;
    logChanges: boolean;
}

export class myIob {
    private adapter: ioBroker.Adapter
    private log: ioBroker.Logger
    public utils: typeof import("@iobroker/adapter-core")

    // ids of states where lc is taken from the value, filled once in the constructor
    private statesUsingValAsLastChanged: Set<string> = new Set();

    // full ids of subscribed states, so each state is subscribed only once
    private subscribedStates: Set<string> = new Set();

    public statesWithWriteFunction: { [key: string]: WriteValFunction } = {};

    constructor(adapter: ioBroker.Adapter, utils: typeof import("@iobroker/adapter-core"), statesUsingValAsLastChanged: string[] = []) {
        this.adapter = adapter;
        this.log = adapter.log;
        this.utils = utils;
        // copied into a Set; no caller changes the array after construction
        this.statesUsingValAsLastChanged = new Set(statesUsingValAsLastChanged);
    }

    /**
 * create or update a device object, update will only be done on adapter start
 *
 * @param id
 * @param name
 * @param onlineId
 * @param errorId
 * @param icon
 * @param updateObject
 * @param logChanges
 * @param native
 */
    public async createOrUpdateDevice(id: string, name: string | ioBroker.Translated | undefined, onlineId: string | undefined = undefined, errorId: string | undefined = undefined, icon: string | undefined = undefined, updateObject: boolean = false, logChanges: boolean = true, native: Record<string, any> = {}): Promise<void> {
        const logPrefix = '[myIob.createOrUpdateDevice]:';

        try {
            const translatedName = this.translateName(name);

            const common: ioBroker.DeviceCommon = {
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
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * translate a name if a translation exists for it, otherwise return the name unchanged
     *
     * @param name
     * @returns
     */
    private translateName(name: string | ioBroker.Translated | undefined): string | ioBroker.Translated | undefined {
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
    private async createOrUpdateObject<TCommon extends ioBroker.DeviceCommon | ioBroker.ChannelCommon>(options: ObjectWriteOptions<TCommon>): Promise<void> {
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
            const storedName = (obj.common as TCommon).name;

            // no name passed -> keep the stored name instead of overwriting it with 'undefined'
            if (!isNameGiven && storedName && storedName !== 'undefined') {
                common.name = storedName;
            }

            if (!isCommonEqual(obj.common as TCommon, common)) {
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
    public async createOrUpdateChannel(id: string, name: string | ioBroker.Translated | undefined, icon: string | undefined = undefined, updateObject: boolean = false, native: Record<string, any> = {}): Promise<void> {
        const logPrefix = '[myIob.createOrUpdateChannel]:';

        try {
            const translatedName = this.translateName(name);

            const common: ioBroker.ChannelCommon = {
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
        } catch (error: any) {
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
    private isRequired(required: requiredDefinition | undefined, objDevice: myTreeData, objChannel: myTreeData): boolean {
        return typeof required === 'function' ? required(objDevice, objChannel, this.adapter) === true : required === true;
    }

    public async createOrUpdateStates(idChannel: string, treeDefinition: { [key: string]: myTreeDefinition<any, any, ioBroker.myAdapter> }, partialData: myTreeData, fullData: myTreeData, blacklistFilter: { id: string }[] | undefined = undefined, isWhiteList: boolean = false, logDeviceName: string = 'not defined', updateObject: boolean = false): Promise<boolean> {
        return await this._createOrUpdateStates(idChannel, this.getIdLastPart(idChannel), treeDefinition, partialData, blacklistFilter, isWhiteList, fullData, fullData, logDeviceName, updateObject);
    }

    /**
     * Checks whether a whitelist entry equals the given channel id or lies below it.
     * The check is delimiter-aware, so 'radio_table.x' does not match the channel 'radio'.
     *
     * @param blacklistFilter list of whitelist/blacklist entries
     * @param channelId full id of the channel (without trailing delimiter)
     */
    private hasWhitelistEntryAtOrBelow(blacklistFilter: { id: string }[] | undefined, channelId: string): boolean {
        return _.some(blacklistFilter, x => !!x.id && (x.id === channelId || x.id.startsWith(`${channelId}.`)));
    }

    private async _createOrUpdateStates(channel: string, deviceId: string, treeDefinition: { [key: string]: myTreeDefinition<any, any, ioBroker.myAdapter> }, treeData: myTreeData, blacklistFilter: { id: string }[] | undefined, isWhiteList: boolean, fullData: myTreeData, channelData: myTreeData, logDeviceName: string = 'not defined', updateObject: boolean = false, filterId = '', isChannelOnWhitelist: boolean = false): Promise<boolean> {
        const logPrefix = '[myIob.createOrUpdateStates]:';

        let stateValueChanged = false;

        // reason used in log messages when an object is deleted because it is not allowed
        const blockReason = isWhiteList ? `it's not on the whitelist` : `it's on the blacklist`;

        try {
            if (this.adapter.connected) {
                // identifies the data object in log messages, the same for all keys of this call
                const idInfo = fullData as { mac?: string; ip?: string; _id?: string } | undefined;
                const logDetails = `${idInfo?.mac ? `mac: ${idInfo.mac}` : idInfo?.ip ? `ip: ${idInfo.ip}` : idInfo?._id ? `id: ${idInfo._id}` : ''}`;

                for (const key in treeDefinition) {
                    let logMsgState = `${channel}.${key}`.split('.')?.slice(1)?.join('.');

                    const treeDef = treeDefinition[key] as myTreeState<any, any, any>;

                    try {
                        // if we have an own defined state which takes val from other property
                        let valKey = key;

                        if (this.hasKey(treeDef, 'valFromProperty') && treeDef.valFromProperty) {
                            if (this.hasKey(treeData, treeDef.valFromProperty)) {
                                valKey = treeDef.valFromProperty
                            } else {
                                this.log.silly(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''} key '${key}' has valFromProperty '${treeDef.valFromProperty}' not exist in data -> skipping!`);
                                continue;
                            }
                        }

                        const cond1 = (this.hasKey(treeData, valKey) && treeData[valKey] !== undefined) || (this.hasKey(treeDef, 'id') && !this.hasKey(treeDef, 'valFromProperty'));
                        const cond2 = this.hasKey(treeDef, 'iobType') && !this.hasKey(treeDef, 'object') && !this.hasKey(treeDef, 'array');

                        if (key && cond1 && cond2) {
                            // if we have a 'iobType' property, then it's a state
                            let stateId: string | undefined = key;

                            if (this.hasKey(treeDef, 'id')) {
                                // if we have a custom state, use defined id
                                stateId = treeDef.id;
                            }

                            if ((this.hasKey(treeDef, 'conditionToCreateState') && treeDef.conditionToCreateState?.(fullData, channelData, this.adapter) === true) || !this.hasKey(treeDef, 'conditionToCreateState')) {

                                logMsgState = `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');

                                if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${stateId}` })) || (isWhiteList && _.some(blacklistFilter, { id: `${filterId}${stateId}` })) || isChannelOnWhitelist || this.isRequired(treeDef.required, fullData, channelData)) {
                                    if (!(await this.adapter.objectExists(`${channel}.${stateId}`))) {
                                        // create State
                                        this.log.silly(`${logPrefix} ${logDeviceName} - creating state '${logMsgState}'`);
                                        const obj: any = {
                                            type: 'state',
                                            common: this.getCommonForState(key, treeDefinition as { [key: string]: myTreeState }, fullData, channelData, logMsgState, logDeviceName),
                                            native: {},
                                        };

                                        await this.adapter.setObjectNotExistsAsync(`${channel}.${stateId}`, obj);
                                    } else {
                                        // update State if needed (only on adapter start)
                                        if (updateObject) {
                                            const obj: ioBroker.Object | null | undefined = await this.adapter.getObjectAsync(`${channel}.${stateId}`);

                                            const commonUpdated = this.getCommonForState(key, treeDefinition as { [key: string]: myTreeState }, fullData, channelData, logMsgState, logDeviceName);

                                            if (obj && obj.common) {
                                                if (!this.isStateCommonEqual(obj.common as ioBroker.StateCommon, commonUpdated)) {
                                                    await this.adapter.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
                                                    this.log.debug(`${logPrefix} ${logDeviceName} - updated common properties of state '${logMsgState}' (updated properties: ${JSON.stringify(this.deepDiffBetweenObjects(commonUpdated, obj.common, this.adapter))})`);
                                                }
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

                                    if (treeData && this.hasKey(treeData, valKey) && (this.hasKey(treeData, key) || this.hasKey(treeData, treeDef.valFromProperty))) {
                                        const val = treeDef.readVal ? await treeDef.readVal(treeData[valKey], this.adapter, fullData, channelData, `${channel}.${stateId}`) : treeData[valKey];

                                        let changedObj: any = undefined;

                                        if (this.statesUsingValAsLastChanged.has(stateId ?? key)) {
                                            // set lc to last_seen value (timestamps in ms), only possible for numbers (null is no valid lc, js-controller rejects it)
                                            changedObj = await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, typeof val === 'number' ? { val: val, lc: val } : { val: val }, true);
                                        } else {
                                            changedObj = await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, val, true);
                                        }

                                        // value of this state changed (only evaluated outside of object updates)
                                        const stateChanged = !updateObject && !!changedObj && this.hasKey(changedObj, 'notChanged') && !changedObj.notChanged;
                                        if (stateChanged) {
                                            stateValueChanged = true;
                                            this.log.silly(`${logPrefix} value of state '${logMsgState}' changed to ${val}`);
                                        }

                                        // updateTs depends only on this state: a changed value already updates the timestamp
                                        if (!stateChanged && this.hasKey(treeDef, 'updateTs') && treeDef.updateTs === true) {
                                            this.log.silly(`${logPrefix} timestamp of state '${logMsgState}' updated`);
                                            await this.adapter.setState(`${channel}.${stateId}`, val, true)
                                        }

                                    } else {
                                        if (!this.hasKey(treeDef, 'id')) {
                                            // only report it if it's not a custom defined state
                                            this.log.debug(`${logPrefix} ${logDeviceName} - property '${logMsgState}' not exists in data (sometimes this option may first need to be activated / used or will update by an event)`);
                                        }
                                    }

                                } else {
                                    // channel is on blacklist
                                    // delete also at runtime, because some properties are only available on websocket data
                                    if (await this.deleteObjectIfExists(`${channel}.${stateId}`, false)) {
                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}state '${channel}.${stateId}' delete, ${blockReason}`);
                                    }
                                }
                            } else {
                                if (updateObject) {
                                    if (await this.deleteObjectIfExists(`${channel}.${stateId}`, false)) {
                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}state '${channel}.${stateId}' delete, condition to create is 'false'`);
                                    }
                                }
                            }
                        } else {
                            // it's a channel from type object
                            if (this.hasKey(treeDef, 'object') && this.hasKey(treeData, key)) {
                                const treeObjectDef = treeDefinition[key] as myTreeObject;

                                const idChannelAppendix = this.hasKey(treeObjectDef, 'idChannel') ? treeObjectDef.idChannel : key;
                                const idChannel = `${channel}.${idChannelAppendix}`;

                                if ((this.hasKey(treeObjectDef, 'conditionToCreateState') && treeObjectDef.conditionToCreateState?.(fullData, channelData, this.adapter) === true) || !this.hasKey(treeObjectDef, 'conditionToCreateState')) {
                                    if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && (isChannelOnWhitelist || this.hasWhitelistEntryAtOrBelow(blacklistFilter, `${filterId}${idChannelAppendix}`))) || this.isRequired(treeObjectDef.required, fullData, channelData)) {
                                        await this.createOrUpdateChannel(`${idChannel}`, this.hasKey(treeObjectDef, 'name') ? (typeof treeObjectDef.name === 'function' ? treeObjectDef.name(fullData, channelData[key], this.adapter) : treeObjectDef.name) : key, this.hasKey(treeObjectDef, 'icon') ? treeObjectDef.icon : undefined, updateObject);
                                        const result = await this._createOrUpdateStates(`${idChannel}`, deviceId, treeObjectDef.object, treeData[key], blacklistFilter, isWhiteList, fullData, channelData[key], logDeviceName, updateObject, `${filterId}${idChannelAppendix}.`, isChannelOnWhitelist || (isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })));
                                        stateValueChanged = result ? result : stateValueChanged;
                                    } else {
                                        // channel is on blacklist
                                        if (await this.deleteObjectIfExists(idChannel, true)) {
                                            this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, ${blockReason}`);
                                        }
                                    }
                                } else {
                                    if (await this.deleteObjectIfExists(idChannel, true)) {
                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, condition to create is 'false'`);
                                    }
                                }
                            }

                            // it's a channel from type array
                            if (this.hasKey(treeDef, 'array') && this.hasKey(treeData, key)) {
                                const arrayData = treeData[key] as unknown[] | null;

                                if (arrayData !== null && arrayData.length > 0) {
                                    const treeArrayDef = treeDefinition[key] as myTreeArray<any, any, any>;

                                    const idChannelAppendix = this.hasKey(treeArrayDef, 'idChannel') ? treeArrayDef.idChannel : key;
                                    const idChannel = `${channel}.${idChannelAppendix}`;

                                    if ((this.hasKey(treeArrayDef, 'conditionToCreateState') && treeArrayDef.conditionToCreateState?.(fullData, channelData, this.adapter) === true) || !this.hasKey(treeArrayDef, 'conditionToCreateState')) {
                                        if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && (isChannelOnWhitelist || this.hasWhitelistEntryAtOrBelow(blacklistFilter, `${filterId}${idChannelAppendix}`))) || this.isRequired(treeArrayDef.required, fullData, channelData)) {
                                            await this.createOrUpdateChannel(`${idChannel}`, this.hasKey(treeArrayDef, 'name') ? treeArrayDef.name : key, this.hasKey(treeArrayDef, 'icon') ? treeArrayDef.icon : undefined, updateObject);

                                            const arrayNumberAdd = (this.hasKey(treeArrayDef, 'arrayStartNumber') ? treeArrayDef.arrayStartNumber : 0) ?? 0;

                                            for (let i = 0; i <= arrayData.length - 1; i++) {
                                                const nr = i + arrayNumberAdd;

                                                if (treeData[key][i] !== null && treeData[key][i] !== undefined) {
                                                    let idChannelArray: string | undefined = myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);

                                                    if (this.hasKey(treeArrayDef, 'arrayChannelIdFromProperty')) {
                                                        idChannelArray = treeArrayDef.arrayChannelIdFromProperty?.(fullData, channelData[key][i], i, this.adapter);
                                                    } else if (this.hasKey(treeArrayDef, 'arrayChannelIdPrefix')) {
                                                        idChannelArray = treeArrayDef.arrayChannelIdPrefix + myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);
                                                    }

                                                    if (idChannelArray !== undefined) {
                                                        await this.createOrUpdateChannel(`${idChannel}.${idChannelArray}`, this.hasKey(treeArrayDef, 'arrayChannelNameFromProperty') ? treeArrayDef.arrayChannelNameFromProperty?.(fullData, channelData[key][i], i, this.adapter) : (treeArrayDef.arrayChannelNamePrefix ?? '') + nr || nr.toString(), undefined, true);
                                                        const result = await this._createOrUpdateStates(`${idChannel}.${idChannelArray}`, deviceId, treeArrayDef.array, treeData[key][i], blacklistFilter, isWhiteList, fullData, channelData[key][i], logDeviceName, true, `${filterId}${idChannelAppendix}.`, isChannelOnWhitelist || (isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })));
                                                        stateValueChanged = result ? result : stateValueChanged;
                                                    }
                                                }
                                            }
                                        } else {
                                            // channel is on blacklist, wlan is coming from realtime api
                                            if (await this.deleteObjectIfExists(idChannel, true)) {
                                                this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, ${blockReason}`);
                                            }
                                        }
                                    } else {
                                        if (await this.deleteObjectIfExists(idChannel, true)) {
                                            this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, condition to create is 'false'`);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error: any) {
                        this.log.error(`${logPrefix} [id: ${key}, ${logDetails ? `${logDetails}, ` : ''}key: ${key}] error: ${error}, stack: ${error.stack}, data: ${this.hasKey(treeData, key) ? JSON.stringify(treeData[key]) : 'undefined'}`);
                    }
                }
            } else {
                if (this.log.level === 'debug') {
                    this.log.warn(`${logPrefix} adapter has no connection!`);
                }
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return stateValueChanged
    }

    /**
     * delete an object if it exists
     *
     * @param id full id of the object
     * @param recursive also delete child objects
     * @returns true if the object existed and was deleted
     */
    private async deleteObjectIfExists(id: string, recursive: boolean): Promise<boolean> {
        if (!(await this.adapter.objectExists(id))) {
            return false;
        }

        if (recursive) {
            await this.adapter.delObjectAsync(id, { recursive: true });
        } else {
            await this.adapter.delObjectAsync(id);
        }

        return true;
    }

    private getCommonForState(id: string, treeDefinition: { [key: string]: myTreeState<any, any, any> }, fullData: myTreeData, channelData: any, logMsgState: string, logDeviceName: string): ioBroker.StateCommon | undefined {
        const logPrefix = '[myIob.getCommonForState]:';

        try {
            // i18n translation if exists
            const i18n = this.utils.I18n.getTranslatedObject(treeDefinition[id].name || id);
            const name = Object.keys(i18n).length > 1 ? i18n : treeDefinition[id].name || id;

            const common: ioBroker.StateCommon = {
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
            } else if (this.hasKey(treeDefinition[id], 'statesFromProperty')) {
                common.states = treeDefinition[id].statesFromProperty?.(fullData, channelData, this.adapter);
                this.log.debug(`${logPrefix} ${logDeviceName} - set ${common.states?.length || Object.keys(common.states || {}).length} allowed common.states for '${logMsgState}'`);
                this.log.silly(`${logPrefix} ${logDeviceName} - set allowed common.states for '${logMsgState}' (from: ${JSON.stringify(common.states)})`);
            }

            if (treeDefinition[id].desc) {
                common.desc = treeDefinition[id].desc;
            }

            return common;
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    private assignPredefinedRoles(common: ioBroker.StateCommon, id: string): string {
        //https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md

        const logPrefix = '[myIob.assignPredefinedRoles]:';

        try {
            id = this.getIdLastPart(id);
            // lower case once, all checks below are case-insensitive
            const lowerId = id.toLowerCase();

            if (common.type === 'boolean') {
                if (common.read === true && common.write === true) {
                    if (lowerId.includes('enable')) {
                        return 'switch.enable'
                    }
                    if (lowerId.includes('light') || lowerId.includes('led')) {
                        return 'switch.light'
                    }
                    if (lowerId.includes('power') || lowerId.includes('poe')) {
                        return 'switch.power'
                    }

                    return 'switch';
                }

                if (common.read === true && common.write === false) {
                    if (lowerId.includes('connected') || lowerId.includes('reachable') || lowerId.includes('isonline')) {
                        return 'indicator.reachable'
                    }
                    if (lowerId.includes('error')) {
                        return 'indicator.error'
                    }
                    if (lowerId.includes('alarm')) {
                        return 'indicator.alarm'
                    }
                    if (lowerId.includes('maintenance')) {
                        return 'indicator.maintenance'
                    }

                    return 'sensor'
                }
            }

            if (common.type === 'number') {
                let suffix = '';

                if (common.unit === '°C' || common.unit === '°F' || common.unit === 'K' || lowerId.includes('temperatur')) {
                    suffix = '.temperature';
                }
                if (common.unit === 'lux') {
                    suffix = '.brightness';
                }
                if (common.unit === 'ppm') {
                    suffix = '.co2';
                }
                if (common.unit === 'mbar') {
                    suffix = '.pressure';
                }
                if (common.unit === 'Wh' || common.unit === 'kWh') {
                    suffix = '.energy';
                }
                if (common.unit === 'W' || common.unit === 'kW') {
                    suffix = '.power';
                }
                if (common.unit === 'A') {
                    suffix = '.current';
                }
                if (common.unit === 'V') {
                    suffix = '.voltage';
                }
                if (common.unit === 'Hz') {
                    suffix = '.frequency';
                }
                if (lowerId.includes('longitude')) {
                    suffix = '.gps.longitude'
                }
                if (lowerId.includes('latitude')) {
                    suffix = '.gps.latitude'
                }
                if (lowerId.includes('humidity') && common.unit !== '') {
                    suffix = '.humidity';
                }
                if (lowerId.includes('battery') && common.unit === '%') {
                    suffix = '.battery';
                }
                if (lowerId.includes('volume') && common.unit === '%') {
                    suffix = '.volume';
                }

                if (common.read === true && common.write === true) {
                    return `level${suffix}`;
                }

                if (common.read === false && common.write === true) {
                    return `level${suffix}`;
                }

                if (common.read === true && common.write === false) {
                    return `value${suffix}`;
                }
            }

            if (common.type === 'string') {
                if (common.read === true && common.write === false) {
                    if (lowerId.includes('firmware') || lowerId.includes('version')) {
                        return 'info.firmware';
                    } else if (lowerId.includes('status')) {
                        return 'info.status';
                    } else if (lowerId.includes('model')) {
                        return 'info.model';
                    } else if (lowerId.includes('mac')) {
                        return 'info.mac';
                    } else if (lowerId.includes('name')) {
                        return 'info.name';
                    } else if (lowerId.includes('hardware')) {
                        return 'info.hardware';
                    } else if (lowerId.includes('serial')) {
                        return 'info.serial';
                    } else {
                        return 'text';
                    }
                } else {
                    return 'text';
                }
            }
        } catch (error: any) {
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
    public async setStateExists(id: string, val: any, adapter: ioBroker.Adapter, onlyChanges: boolean = false): Promise<void> {
        const logPrefix = '[myIob.setStateExists]:';

        try {
            if (await adapter.objectExists(id)) {
                if (!onlyChanges) {
                    await adapter.setState(id, val, true);
                } else {
                    await adapter.setStateChangedAsync(id, val, true);
                }
            }
        } catch (error: any) {
            adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Id without last part
     *
     * @param id
     * @returns
     */
    public getIdWithoutLastPart(id: string): string {
        const lastIndex = id.lastIndexOf('.');
        return id.substring(0, lastIndex);
    }

    /**
     * last part of id
     *
     * @param id
     * @returns
     */
    public getIdLastPart(id: string): string {
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
    private isDeviceCommonEqual(objCommon: ioBroker.DeviceCommon, myCommon: ioBroker.DeviceCommon): boolean {
        return _.isEqual(objCommon.name, myCommon.name) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role && _.isEqual(objCommon.statusStates, myCommon.statusStates);
    }

    /**
     * Compare common properties of channel
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isChannelCommonEqual(objCommon: ioBroker.ChannelCommon, myCommon: ioBroker.ChannelCommon): boolean {
        return _.isEqual(objCommon.name, myCommon.name) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role;
    }

    /**
     * Compare common properties of state
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon | undefined): boolean {
        return _.isEqual(objCommon.name, myCommon?.name) && _.isEqual(objCommon.type, myCommon?.type) && _.isEqual(objCommon.read, myCommon?.read) && _.isEqual(objCommon.write, myCommon?.write) && _.isEqual(objCommon.role, myCommon?.role) && _.isEqual(objCommon.def, myCommon?.def) && _.isEqual(objCommon.unit, myCommon?.unit) && _.isEqual(objCommon.icon, myCommon?.icon) && _.isEqual(objCommon.desc, myCommon?.desc) && _.isEqual(objCommon.max, myCommon?.max) && _.isEqual(objCommon.min, myCommon?.min) && _.isEqual(objCommon.states, myCommon?.states);
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
    public deepDiffBetweenObjects = (object: any, base: any, adapter: ioBroker.Adapter, allowedKeys: any = undefined, prefix: string = ''): any => {
        const logPrefix = '[myIob.deepDiffBetweenObjects]:';

        try {
            const changes = (object: any, base: any, prefixInner = ''): any => {
                return _.transform(object, (result, value, key) => {
                    const fullKey: string = prefixInner ? `${prefixInner}.${key as string}` : (key as string);

                    try {
                        if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                            if (_.isArray(value)) {

                                if (_.some(value, (item: any) => _.isObject(item))) {
                                    // objects in array exists
                                    const tmp = [];
                                    let empty = true;

                                    for (let i = 0; i <= value.length - 1; i++) {
                                        const res = this.deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);

                                        if (!_.isEmpty(res) || res === 0 || res === false) {
                                            // if (!_.has(result, key)) result[key] = [];
                                            tmp.push(res);
                                            empty = false;
                                        } else {
                                            tmp.push(null);
                                        }
                                    }

                                    if (!empty) {
                                        result[key] = tmp;
                                    }
                                } else {
                                    // is pure array
                                    if (!_.isEqual(value, base[key])) {
                                        result[key] = value;
                                    }
                                }
                            } else if (_.isObject(value) && _.isObject(base[key])) {
                                const res = changes(value, base[key] ? base[key] : {}, fullKey);
                                if (!_.isEmpty(res) || res === 0 || res === false) {
                                    result[key] = res;
                                }
                            } else {
                                result[key] = value;
                            }
                        }
                    } catch (error: any) {
                        adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                    }
                });
            };

            return changes(object, base, prefix);
        } catch (error: any) {
            adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
        }

        return object;
    };

    public findMissingTranslation(): void {
        const logPrefix = '[myIob.findMissingTranslation]:';

        try {
            this._findMissingTranslation(tree);
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public _findMissingTranslation(obj: any, logSuffix: string | undefined = undefined): void {
        const logPrefix = `[myIob.findMissingTranslation]:${logSuffix ? ` ${logSuffix}` : ''}`;

        try {
            for (const key in obj) {
                if (_.isObject(obj[key]) && !key.includes('events')) {
                    if (this.hasKey(obj[key], 'get')) {
                        const result = this.tree2Translation((obj[key] as { get: () => any }).get(), this.adapter, this.utils.I18n);

                        if (result && Object.keys(result).length > 0) {
                            this.log.warn(`${logPrefix} ${key} - missing translations ${JSON.stringify(result)}`);
                        }

                        if (Object.keys(obj[key]).length > 0) {
                            this._findMissingTranslation(obj[key], logSuffix ? `${logSuffix}.${key}` : key);
                        }
                    } else {
                        this._findMissingTranslation(obj[key], logSuffix ? `${logSuffix}.${key}` : key);
                    }
                }
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * generate a list with all defined names, that can be used for translation
     * 
     * @param tree 
     * @param adapter
     * @param i18n
     */
    private tree2Translation(tree: { [key: string]: myTreeDefinition }, adapter: ioBroker.Adapter, i18n: any): Record<string, string> | null {
        const result = this.getTreeNameOrKey(tree);

        for (const key of Object.keys(result)) {

            if (Object.keys(i18n.getTranslatedObject(key)).length > 1) {
                delete result[key]
            }
        }

        if (result && Object.keys(result).length > 0) {
            return result;
        } else {
            return null
        }
    }

    private getTreeNameOrKey(obj: { [key: string]: any }, path: string[] = []): Record<string, string> {
        const result: Record<string, string> = {};

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

    public hasKey<T extends object>(
        obj: T,
        key: PropertyKey | undefined
    ): key is keyof T {
        if (key) {
            return Object.hasOwn(obj, key);
        }
        return false;
    }
}