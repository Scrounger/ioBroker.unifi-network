import _ from 'lodash';

import * as myHelper from './helper.js';
import type { myTreeData } from './myTypes.js';
import * as tree from './tree/index.js';

type ReadValFunction = (val: any, adapter: ioBroker.Adapter | ioBroker.myAdapter, device: myTreeData, channel: myTreeData, id: string) => ioBroker.StateValue | Promise<ioBroker.StateValue>
export type WriteValFunction = (val: ioBroker.StateValue, id: string, device: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => any | Promise<any>;
type ConditionToCreateStateFunction = (objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => boolean;

export type myTreeDefinition = myTreeState | myTreeObject | myTreeArray;

export interface myTreeState {
    id?: string;
    iobType: ioBroker.CommonType;
    name?: string;
    role?: string;
    read?: boolean;
    write?: boolean;
    unit?: string | ((objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => string);
    min?: number;
    max?: number;
    step?: number;
    states?: Record<string, string> | string[] | string;
    expert?: true;
    icon?: string;
    def?: ioBroker.StateValue;
    desc?: string;

    readVal?: ReadValFunction;
    writeVal?: WriteValFunction;

    valFromProperty?: string; // Take value from other property in the corresponding tree. If this property is an object, @link ./helper.ts [getAllKeysOfTreeDefinition] must added manual if they should be regoniczed
    statesFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): Record<string, string> | string[] | string; // ToDo: perhaps can be removed

    conditionToCreateState?: ConditionToCreateStateFunction // condition to create state

    subscribeMe?: true; // subscribe
    required?: true; // required, can not be blacklisted
}

export interface myTreeObject {
    idChannel?: string;
    name?: string | ioBroker.Translated | ((objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => string | ioBroker.Translated);
    icon?: string;
    object: { [key: string]: myTreeDefinition };
    conditionToCreateState?: ConditionToCreateStateFunction // condition to create state
}

export interface myTreeArray {
    idChannel?: string;
    name?: string;
    icon?: string;
    arrayChannelIdPrefix?: string; // Array item id get a prefix e.g. myPrefix_0
    arrayChannelIdZeroPad?: number; // Array item id get a padding for the number
    arrayChannelIdFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string; // Array item id is taken from a property in the corresponding tree
    arrayChannelNamePrefix?: string; // Array item common.name get a prefix e.g. myPrefix_0
    arrayChannelNameFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string | ioBroker.Translated; // Array item common.name is taken from a property in the corresponding tree
    arrayStartNumber?: number; // Array custom start number of array
    array: { [key: string]: myTreeDefinition };
    conditionToCreateState?: ConditionToCreateStateFunction // condition to create state
}

export class myIob {
    private adapter: ioBroker.Adapter
    private log: ioBroker.Logger
    public utils: typeof import("@iobroker/adapter-core")

    private statesUsingValAsLastChanged: string[] = [];

    private subscribedStates: string[] = [];

    public statesWithWriteFunction: { [key: string]: WriteValFunction } = {};

    constructor(adapter: ioBroker.Adapter, utils: typeof import("@iobroker/adapter-core"), statesUsingValAsLastChanged: string[] = []) {
        this.adapter = adapter;
        this.log = adapter.log;
        this.utils = utils;
        this.statesUsingValAsLastChanged = statesUsingValAsLastChanged;
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
    public async createOrUpdateDevice(id: string, name: string | ioBroker.Translated, onlineId: string, errorId: string = undefined, icon: string | undefined = undefined, updateObject: boolean = false, logChanges: boolean = true, native: Record<string, any> = {}): Promise<void> {
        const logPrefix = '[myIob.createOrUpdateDevice]:';

        try {
            if (typeof name === 'string') {
                const translation = this.utils.I18n.getTranslatedObject(name);
                name = translation && Object.keys(translation).length > 1 ? translation : name
            }

            const common: ioBroker.DeviceCommon = {
                name: name,
                icon: icon,
            };

            if (onlineId) {
                common.statusStates = {
                    onlineId: onlineId,
                };
            }

            if (errorId) {
                common.statusStates.errorId = errorId;
            }

            if (!(await this.adapter.objectExists(id))) {
                this.log.debug(`${logPrefix} creating device '${id}'`);
                await this.adapter.setObject(id, {
                    type: 'device',
                    common: common,
                    native,
                });
            } else {
                if (updateObject) {
                    const obj = await this.adapter.getObjectAsync(id);

                    if (obj && obj.common) {
                        if (!this.isDeviceCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
                            await this.adapter.extendObject(id, { common: common });

                            const diff = this.deepDiffBetweenObjects(common, obj.common, this.adapter);
                            if (diff && diff.icon) {
                                diff.icon = _.truncate(diff.icon);
                            } // reduce base64 image string for logging

                            this.log.debug(`${logPrefix} device updated '${id}' ${logChanges ? `(updated properties: ${JSON.stringify(diff)})` : ''}`);
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
     *
     * @param id
     * @param name
     * @param icon
     * @param updateObject
     * @param native
     */
    public async createOrUpdateChannel(id: string, name: string | ioBroker.Translated, icon: string = undefined, updateObject: boolean = false, native: Record<string, any> = {}): Promise<void> {
        const logPrefix = '[myIob.createOrUpdateChannel]:';

        try {
            if (typeof name === 'string') {
                const translation = this.utils.I18n.getTranslatedObject(name);
                name = translation && Object.keys(translation).length > 1 ? translation : name
            }

            const common = {
                name: name,
                icon: icon,
            };

            if (!(await this.adapter.objectExists(id))) {
                this.log.debug(`${logPrefix} creating channel '${id}'`);
                await this.adapter.setObject(id, {
                    type: 'channel',
                    common: common,
                    native,
                });
            } else {
                if (updateObject) {
                    const obj = await this.adapter.getObjectAsync(id);

                    if (obj && obj.common) {
                        if (!this.isChannelCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
                            await this.adapter.extendObject(id, { common: common });

                            const diff = this.deepDiffBetweenObjects(common, obj.common, this.adapter);
                            if (diff && diff.icon) {
                                diff.icon = _.truncate(diff.icon);
                            } // reduce base64 image string for logging

                            this.log.debug(`${logPrefix} channel updated '${id}' (updated properties: ${JSON.stringify(diff)})`);
                        }
                    }
                }
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async createOrUpdateStates(idChannel: string, treeDefinition: { [key: string]: myTreeDefinition }, partialData: myTreeData, fullData: myTreeData, blacklistFilter: { id: string }[] | undefined = undefined, isWhiteList: boolean = false, logDeviceName: string = 'not defined', updateObject: boolean = false): Promise<boolean> {
        return await this._createOrUpdateStates(idChannel, this.getIdLastPart(idChannel), treeDefinition, partialData, blacklistFilter, isWhiteList, fullData, fullData, logDeviceName, updateObject);
    }

    private async _createOrUpdateStates(channel: string, deviceId: string, treeDefinition: { [key: string]: myTreeDefinition }, treeData: myTreeData, blacklistFilter: { id: string }[] | undefined, isWhiteList: boolean, fullData: myTreeData, channelData: myTreeData, logDeviceName: string = 'not defined', updateObject: boolean = false, filterId = '', isChannelOnWhitelist: boolean = false): Promise<boolean> {
        const logPrefix = '[myIob.createOrUpdateStates]:';

        let stateValueChanged = false;

        try {
            if (this.adapter.connected) {
                for (const key in treeDefinition) {
                    let logMsgState = `${channel}.${key}`.split('.')?.slice(1)?.join('.');

                    const treeDef = treeDefinition[key] as myTreeState;

                    const logDetails = `${(fullData as any)?.mac ? `mac: ${(fullData as any)?.mac}` : (fullData as any)?.ip ? `ip: ${(fullData as any)?.ip}` : (fullData as any)?._id ? `id: ${(fullData as any)?._id}` : ''}`;

                    try {
                        // if we have an own defined state which takes val from other property
                        let valKey = key;

                        if (Object.hasOwn(treeDef, 'valFromProperty')) {
                            if (Object.hasOwn(treeData, treeDef.valFromProperty)) {
                                valKey = treeDef.valFromProperty
                            } else {
                                this.log.silly(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''} key '${key}' has valFromProperty '${treeDef.valFromProperty}' not exist in data -> skipping!`);
                                continue;
                            }
                        }

                        const cond1 = (Object.hasOwn(treeData, valKey) && treeData[valKey] !== undefined) || (Object.hasOwn(treeDef, 'id') && !Object.hasOwn(treeDef, 'valFromProperty'));
                        const cond2 = Object.hasOwn(treeDef, 'iobType') && !Object.hasOwn(treeDef, 'object') && !Object.hasOwn(treeDef, 'array');

                        if (key && cond1 && cond2) {
                            // if we have a 'iobType' property, then it's a state
                            let stateId = key;

                            if (Object.hasOwn(treeDef, 'id')) {
                                // if we have a custom state, use defined id
                                stateId = treeDef.id;
                            }

                            if ((Object.hasOwn(treeDef, 'conditionToCreateState') && treeDef.conditionToCreateState(fullData, channelData, this.adapter) === true) || !Object.hasOwn(treeDef, 'conditionToCreateState')) {

                                logMsgState = `${channel}.${stateId}`.split('.')?.slice(1)?.join('.');

                                if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${stateId}` })) || (isWhiteList && _.some(blacklistFilter, { id: `${filterId}${stateId}` })) || isChannelOnWhitelist || Object.hasOwn(treeDef, 'required')) {
                                    if (!(await this.adapter.objectExists(`${channel}.${stateId}`))) {
                                        // create State
                                        this.log.silly(`${logPrefix} ${logDeviceName} - creating state '${logMsgState}'`);
                                        const obj: any = {
                                            type: 'state',
                                            common: this.getCommonForState(key, treeDefinition as { [key: string]: myTreeState }, fullData, channelData, logMsgState, logDeviceName),
                                            native: {},
                                        };

                                        await this.adapter.setObject(`${channel}.${stateId}`, obj);
                                    } else {
                                        // update State if needed (only on adapter start)
                                        if (updateObject) {
                                            const obj: ioBroker.Object = await this.adapter.getObjectAsync(`${channel}.${stateId}`);

                                            const commonUpdated = this.getCommonForState(key, treeDefinition as { [key: string]: myTreeState }, fullData, channelData, logMsgState, logDeviceName);

                                            if (obj && obj.common) {
                                                if (!this.isStateCommonEqual(obj.common as ioBroker.StateCommon, commonUpdated)) {
                                                    await this.adapter.extendObject(`${channel}.${stateId}`, { common: commonUpdated });
                                                    this.log.debug(`${logPrefix} ${logDeviceName} - updated common properties of state '${logMsgState}' (updated properties: ${JSON.stringify(this.deepDiffBetweenObjects(commonUpdated, obj.common, this.adapter))})`);
                                                }
                                            }
                                        }
                                    }

                                    if (!this.subscribedStates.includes(`${channel}.${stateId}`) && ((treeDef.write && treeDef.write === true) || Object.hasOwn(treeDef, 'subscribeMe'))) {
                                        // state is writeable or has subscribeMe Property -> subscribe it
                                        this.log.silly(`${logPrefix} ${logDeviceName} - subscribing state '${logMsgState}'`);
                                        await this.adapter.subscribeStatesAsync(`${channel}.${stateId}`);

                                        this.subscribedStates.push(`${channel}.${stateId}`);
                                    }

                                    const writeValKey = `${channel}.${stateId}`.replace(`.${deviceId}.`, '.');
                                    if (!this.statesWithWriteFunction[writeValKey] && treeDef.writeVal) {
                                        // state has a write conversation function -> store function in 'list' to use it before writing data to ufp
                                        this.statesWithWriteFunction[writeValKey] = treeDef.writeVal;
                                    }

                                    if (treeData && (Object.hasOwn(treeData, key) || Object.hasOwn(treeData, treeDef.valFromProperty))) {
                                        const val = treeDef.readVal ? await treeDef.readVal(treeData[valKey], this.adapter, fullData, channelData, `${channel}.${stateId}`) : treeData[valKey];

                                        let changedObj: any = undefined;

                                        if (this.statesUsingValAsLastChanged.includes(key)) {
                                            // set lc to last_seen value
                                            changedObj = await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, { val: val, lc: val }, true);
                                        } else {
                                            changedObj = await this.adapter.setStateChangedAsync(`${channel}.${stateId}`, val, true);
                                        }

                                        if (!updateObject && changedObj && Object.hasOwn(changedObj, 'notChanged') && !changedObj.notChanged) {
                                            stateValueChanged = true;
                                            this.log.silly(`${logPrefix} value of state '${logMsgState}' changed to ${val}`);
                                        }
                                    } else {
                                        if (!Object.hasOwn(treeDef, 'id')) {
                                            // only report it if it's not a custom defined state
                                            this.log.debug(`${logPrefix} ${logDeviceName} - property '${logMsgState}' not exists in data (sometimes this option may first need to be activated / used or will update by an event)`);
                                        }
                                    }

                                } else {
                                    // channel is on blacklist
                                    // delete also at runtime, because some properties are only available on websocket data
                                    if (await this.adapter.objectExists(`${channel}.${stateId}`)) {
                                        await this.adapter.delObjectAsync(`${channel}.${stateId}`);

                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}state '${channel}.${stateId}' delete, ${isWhiteList ? `it's not on the whitelist` : `it's on the blacklist`}`);
                                    }
                                }
                            } else {
                                if (updateObject) {
                                    if (await this.adapter.objectExists(`${channel}.${stateId}`)) {
                                        await this.adapter.delObjectAsync(`${channel}.${stateId}`);
                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}state '${channel}.${stateId}' delete, condition to create is 'false'`);
                                    }
                                }
                            }
                        } else {
                            // it's a channel from type object
                            if (Object.hasOwn(treeDef, 'object') && Object.hasOwn(treeData, key)) {
                                const treeObjectDef = treeDefinition[key] as myTreeObject;

                                const idChannelAppendix = Object.hasOwn(treeObjectDef, 'idChannel') ? treeObjectDef.idChannel : key;
                                const idChannel = `${channel}.${idChannelAppendix}`;

                                if ((Object.hasOwn(treeObjectDef, 'conditionToCreateState') && treeObjectDef.conditionToCreateState(fullData, channelData, this.adapter) === true) || !Object.hasOwn(treeObjectDef, 'conditionToCreateState')) {
                                    if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && _.some(blacklistFilter, x => x.id && x.id.startsWith(`${filterId}${idChannelAppendix}`))) || Object.hasOwn(treeObjectDef, 'required')) {
                                        await this.createOrUpdateChannel(`${idChannel}`, Object.hasOwn(treeObjectDef, 'name') ? (typeof treeObjectDef.name === 'function' ? treeObjectDef.name(fullData, channelData[key], this.adapter) : treeObjectDef.name) : key, Object.hasOwn(treeObjectDef, 'icon') ? treeObjectDef.icon : undefined, updateObject);
                                        const result = await this._createOrUpdateStates(`${idChannel}`, deviceId, treeObjectDef.object, treeData[key], blacklistFilter, isWhiteList, fullData, channelData[key], logDeviceName, updateObject, `${filterId}${idChannelAppendix}.`, isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` }));
                                        stateValueChanged = result ? result : stateValueChanged;
                                    } else {
                                        // channel is on blacklist
                                        if (await this.adapter.objectExists(idChannel)) {
                                            await this.adapter.delObjectAsync(idChannel, { recursive: true });
                                            this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, ${isWhiteList ? `it's not on the whitelist` : `it's on the blacklist`}`);
                                        }
                                    }
                                } else {
                                    if (await this.adapter.objectExists(idChannel)) {
                                        await this.adapter.delObjectAsync(idChannel, { recursive: true });
                                        this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, condition to create is 'false'`);
                                    }
                                }
                            }

                            // it's a channel from type array
                            if (Object.hasOwn(treeDef, 'array') && Object.hasOwn(treeData, key)) {
                                if (treeData[key] !== null && treeData[key].length > 0) {
                                    const treeArrayDef = treeDefinition[key] as myTreeArray;

                                    const idChannelAppendix = Object.hasOwn(treeArrayDef, 'idChannel') ? treeArrayDef.idChannel : key;
                                    const idChannel = `${channel}.${idChannelAppendix}`;

                                    if ((Object.hasOwn(treeArrayDef, 'conditionToCreateState') && treeArrayDef.conditionToCreateState(fullData, channelData, this.adapter) === true) || !Object.hasOwn(treeArrayDef, 'conditionToCreateState')) {
                                        if ((!isWhiteList && !_.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` })) || (isWhiteList && _.some(blacklistFilter, x => x.id && x.id.startsWith(`${filterId}${idChannelAppendix}`))) || Object.hasOwn(treeArrayDef, 'required')) {
                                            await this.createOrUpdateChannel(`${idChannel}`, Object.hasOwn(treeArrayDef, 'name') ? treeArrayDef.name : key, Object.hasOwn(treeArrayDef, 'icon') ? treeArrayDef.icon : undefined, updateObject);

                                            const arrayNumberAdd = Object.hasOwn(treeArrayDef, 'arrayStartNumber') ? treeArrayDef.arrayStartNumber : 0;

                                            for (let i = 0; i <= treeData[key].length - 1; i++) {
                                                const nr = i + arrayNumberAdd;

                                                if (treeData[key][i] !== null && treeData[key][i] !== undefined) {
                                                    let idChannelArray: string | undefined = myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);

                                                    if (Object.hasOwn(treeArrayDef, 'arrayChannelIdFromProperty')) {
                                                        idChannelArray = treeArrayDef.arrayChannelIdFromProperty(fullData, channelData[key][i], i, this.adapter);
                                                    } else if (Object.hasOwn(treeArrayDef, 'arrayChannelIdPrefix')) {
                                                        idChannelArray = treeArrayDef.arrayChannelIdPrefix + myHelper.zeroPad(nr, treeArrayDef.arrayChannelIdZeroPad || 0);
                                                    }

                                                    if (idChannelArray !== undefined) {
                                                        await this.createOrUpdateChannel(`${idChannel}.${idChannelArray}`, Object.hasOwn(treeArrayDef, 'arrayChannelNameFromProperty') ? treeArrayDef.arrayChannelNameFromProperty(fullData, channelData[key][i], i, this.adapter) : treeArrayDef.arrayChannelNamePrefix + nr || nr.toString(), undefined, true);
                                                        const result = await this._createOrUpdateStates(`${idChannel}.${idChannelArray}`, deviceId, treeArrayDef.array, treeData[key][i], blacklistFilter, isWhiteList, fullData, channelData[key][i], logDeviceName, true, `${filterId}${idChannelAppendix}.`, isWhiteList && _.some(blacklistFilter, { id: `${filterId}${idChannelAppendix}` }));
                                                        stateValueChanged = result ? result : stateValueChanged;
                                                    }
                                                }
                                            }
                                        } else {
                                            // channel is on blacklist, wlan is comming from realtime api
                                            if (await this.adapter.objectExists(idChannel)) {
                                                await this.adapter.delObjectAsync(idChannel, { recursive: true });
                                                this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, ${isWhiteList ? `it's not on the whitelist` : `it's on the blacklist`}`);
                                            }
                                        }
                                    } else {
                                        if (await this.adapter.objectExists(idChannel)) {
                                            await this.adapter.delObjectAsync(idChannel, { recursive: true });
                                            this.log.info(`${logPrefix} '${logDeviceName}' ${logDetails ? `(${logDetails}) ` : ''}channel '${idChannel}' delete, condition to create is 'false'`);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        this.log.error(`${logPrefix} [id: ${key}, ${logDetails ? `${logDetails}, ` : ''}key: ${key}] error: ${error}, stack: ${error.stack}, data: ${JSON.stringify(treeData[key])}`);
                    }
                }
            } else {
                this.log.warn(`${logPrefix} adapter has no connection!`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return stateValueChanged
    }

    private getCommonForState(id: string, treeDefinition: { [key: string]: myTreeState }, fullData: myTreeData, channelData: any, logMsgState: string, logDeviceName: string): ioBroker.StateCommon {
        const logPrefix = '[myIob.getCommonForState]:';

        try {
            // i18x translation if exists
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

                common.unit = Object.keys(unitI18).length > 1 && unitI18[this.adapter.language] ? unitI18[this.adapter.language] : unit;
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
            } else if (Object.hasOwn(treeDefinition[id], 'statesFromProperty')) {
                common.states = treeDefinition[id].statesFromProperty(fullData, channelData, this.adapter);
                this.log.debug(`${logPrefix} ${logDeviceName} - set ${common.states.length || Object.keys(common.states).length} allowed common.states for '${logMsgState}'`);
                this.log.silly(`${logPrefix} ${logDeviceName} - set allowed common.states for '${logMsgState}' (from: ${JSON.stringify(common.states)})`);
            }

            if (treeDefinition[id].desc) {
                common.desc = treeDefinition[id].desc;
            }

            return common;
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    private assignPredefinedRoles(common: ioBroker.StateCommon, id: string): string {
        //https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md

        const logPrefix = '[myIob.assignPredefinedRoles]:';

        try {
            id = this.getIdLastPart(id);

            if (common.type === 'boolean') {
                if (common.read === true && common.write === true) {
                    if (id.toLocaleLowerCase().includes('enable')) {
                        return 'switch.enable'
                    }
                    if (id.toLocaleLowerCase().includes('light') || id.toLocaleLowerCase().includes('led')) {
                        return 'switch.light'
                    }
                    if (id.toLocaleLowerCase().includes('power') || id.toLocaleLowerCase().includes('poe')) {
                        return 'switch.power'
                    }

                    return 'switch';
                }

                if (common.read === true && common.write === false) {
                    if (id.toLocaleLowerCase().includes('connected') || id.toLocaleLowerCase().includes('reachable') || id.toLocaleLowerCase().includes('isonline')) {
                        return 'indicator.reachable'
                    }
                    if (id.toLocaleLowerCase().includes('error')) {
                        return 'indicator.error'
                    }
                    if (id.toLocaleLowerCase().includes('alarm')) {
                        return 'indicator.alarm'
                    }
                    if (id.toLocaleLowerCase().includes('maintenance')) {
                        return 'indicator.maintenance'
                    }

                    return 'sensor'
                }
            }

            if (common.type === 'number') {
                let suffix = '';

                if (common.unit === '°C' || common.unit === '°F' || common.unit === 'K' || id.toLowerCase().includes('temperatur')) {
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
                if (id.toLocaleLowerCase().includes('longitude')) {
                    suffix = '.gps.longitude'
                }
                if (id.toLocaleLowerCase().includes('latitude')) {
                    suffix = '.gps.latitude'
                }
                if (id.toLowerCase().includes('humidity') && common.unit !== '') {
                    suffix = '.humidity';
                }
                if (id.toLowerCase().includes('battery') && common.unit === '%') {
                    suffix = '.battery';
                }
                if (id.toLowerCase().includes('volume') && common.unit === '%') {
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
                    if (id.toLocaleLowerCase().includes('firmware') || id.toLocaleLowerCase().includes('version')) {
                        return 'info.firmware';
                    } else if (id.toLocaleLowerCase().includes('status')) {
                        return 'info.status';
                    } else if (id.toLocaleLowerCase().includes('model')) {
                        return 'info.model';
                    } else if (id.toLocaleLowerCase().includes('mac')) {
                        return 'info.mac';
                    } else if (id.toLocaleLowerCase().includes('name')) {
                        return 'info.name';
                    } else if (id.toLocaleLowerCase().includes('hardware')) {
                        return 'info.hardware';
                    } else if (id.toLocaleLowerCase().includes('serial')) {
                        return 'info.serial';
                    } else {
                        return 'text';
                    }
                } else {
                    return 'text';
                }
            }
        } catch (error) {
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
        } catch (error) {
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
        return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role && _.isEqual(objCommon.statusStates, myCommon.statusStates);
    }

    /**
     * Compare common properties of channel
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isChannelCommonEqual(objCommon: ioBroker.ChannelCommon, myCommon: ioBroker.ChannelCommon): boolean {
        return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role;
    }

    /**
     * Compare common properties of state
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon): boolean {
        return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.type, myCommon.type) && _.isEqual(objCommon.read, myCommon.read) && _.isEqual(objCommon.write, myCommon.write) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.def, myCommon.def) && _.isEqual(objCommon.unit, myCommon.unit) && _.isEqual(objCommon.icon, myCommon.icon) && _.isEqual(objCommon.desc, myCommon.desc) && _.isEqual(objCommon.max, myCommon.max) && _.isEqual(objCommon.min, myCommon.min) && _.isEqual(objCommon.states, myCommon.states);
    }

    /**
     * Compare two objects and return properties that are diffrent
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
            const changes = (object, base, prefixInner = ''): any => {
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
                    } catch (error) {
                        adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                    }
                });
            };

            return changes(object, base, prefix);
        } catch (error) {
            adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
        }

        return object;
    };

    public findMissingTranslation(): void {
        const logPrefix = '[myIob.findMissingTranslation]:';

        try {
            this._findMissingTranslation(tree);
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public _findMissingTranslation(obj: any, logSuffix = undefined): void {
        const logPrefix = `[myIob.findMissingTranslation]:${logSuffix ? ` ${logSuffix}` : ''}`;

        try {
            for (const key in obj) {
                if (_.isObject(obj[key]) && !key.includes('events')) {
                    if (Object.hasOwn(obj[key], 'get')) {
                        //@ts-ignore
                        const result = this.tree2Translation(obj[key].get(), this.adapter, this.utils.I18n);

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
        } catch (error) {
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
    private tree2Translation(tree: { [key: string]: myTreeDefinition }, adapter: ioBroker.Adapter, i18n: any): Record<string, string> {
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
}