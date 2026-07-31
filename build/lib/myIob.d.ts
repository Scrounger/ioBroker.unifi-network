import type { myTreeData } from './myTypes.js';
type ReadValFunction<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = (val: Type, adapter: Adapter, device: Device, channel: Device, id: string) => ioBroker.StateValue | Promise<ioBroker.StateValue>;
export type WriteValFunction<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = (val: Type, id: string, device: Device, adapter: Adapter) => any | Promise<any>;
type ConditionToCreateStateFunction<Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = (objDevice: Device, objChannel: Device, adapter: Adapter) => boolean;
export type myTreeDefinition<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = myTreeState<Type, Device, Adapter> | myTreeObject<Type, Device, Adapter> | myTreeArray<Type, Device, Adapter>;
export type unitDefinition<Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = string | ((objDevice: Device, objChannel: Device, adapter: Adapter) => string);
export interface myTreeState<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> {
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
    valFromProperty?: string;
    statesFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): Record<string, string> | string[] | string;
    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>;
    subscribeMe?: true;
    required?: true;
    updateTs?: true;
}
export type nameDefinition<Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = string | ((objDevice: Device, objChannel: Device, adapter: Adapter) => string | ioBroker.Translated);
export interface myTreeObject<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> {
    idChannel?: string;
    name?: nameDefinition<Device, Adapter>;
    icon?: string;
    object: {
        [key: string]: myTreeDefinition<Type, Device, Adapter>;
    };
    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>;
}
export type arrayChannelIdFromPropertyFunction<Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> = (objDevice: Device, objChannel: Device, i: number, adapter: Adapter) => string | undefined;
export interface myTreeArray<Type extends ioBroker.StateValue = ioBroker.StateValue, Device extends myTreeData = myTreeData, Adapter extends ioBroker.Adapter | ioBroker.myAdapter = ioBroker.Adapter | ioBroker.myAdapter> {
    idChannel?: string;
    name?: string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?: arrayChannelIdFromPropertyFunction<Device, Adapter>;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string | ioBroker.Translated;
    arrayStartNumber?: number;
    array: {
        [key: string]: myTreeDefinition<Type, Device, Adapter>;
    };
    conditionToCreateState?: ConditionToCreateStateFunction<Device, Adapter>;
}
export declare class myIob {
    private adapter;
    private log;
    utils: typeof import("@iobroker/adapter-core");
    private statesUsingValAsLastChanged;
    private subscribedStates;
    statesWithWriteFunction: {
        [key: string]: WriteValFunction;
    };
    constructor(adapter: ioBroker.Adapter, utils: typeof import("@iobroker/adapter-core"), statesUsingValAsLastChanged?: string[]);
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
    createOrUpdateDevice(id: string, name: string | ioBroker.Translated | undefined, onlineId?: string | undefined, errorId?: string | undefined, icon?: string | undefined, updateObject?: boolean, logChanges?: boolean, native?: Record<string, any>): Promise<void>;
    /**
     * create or update a channel object, update will only be done on adapter start
     *
     * @param id
     * @param name
     * @param icon
     * @param updateObject
     * @param native
     */
    createOrUpdateChannel(id: string, name: string | ioBroker.Translated | undefined, icon?: string | undefined, updateObject?: boolean, native?: Record<string, any>): Promise<void>;
    createOrUpdateStates(idChannel: string, treeDefinition: {
        [key: string]: myTreeDefinition<any, any, ioBroker.myAdapter>;
    }, partialData: myTreeData, fullData: myTreeData, blacklistFilter?: {
        id: string;
    }[] | undefined, isWhiteList?: boolean, logDeviceName?: string, updateObject?: boolean): Promise<boolean>;
    private _createOrUpdateStates;
    private getCommonForState;
    private assignPredefinedRoles;
    /**
     * check if state exists before setting value
     *
     * @param id
     * @param val
     * @param adapter
     * @param onlyChanges
     */
    setStateExists(id: string, val: any, adapter: ioBroker.Adapter, onlyChanges?: boolean): Promise<void>;
    /**
     * Id without last part
     *
     * @param id
     * @returns
     */
    getIdWithoutLastPart(id: string): string;
    /**
     * last part of id
     *
     * @param id
     * @returns
     */
    getIdLastPart(id: string): string;
    /**
     * Compare common properties of device
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isDeviceCommonEqual;
    /**
     * Compare common properties of channel
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isChannelCommonEqual;
    /**
     * Compare common properties of state
     *
     * @param objCommon
     * @param myCommon
     * @returns
     */
    private isStateCommonEqual;
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
    deepDiffBetweenObjects: (object: any, base: any, adapter: ioBroker.Adapter, allowedKeys?: any, prefix?: string) => any;
    findMissingTranslation(): void;
    _findMissingTranslation(obj: any, logSuffix?: string | undefined): void;
    /**
     * generate a list with all defined names, that can be used for translation
     *
     * @param tree
     * @param adapter
     * @param i18n
     */
    private tree2Translation;
    private getTreeNameOrKey;
    hasKey<T extends object>(obj: T, key: PropertyKey | undefined): key is keyof T;
}
export {};
