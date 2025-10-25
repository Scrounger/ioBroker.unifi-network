import type { myTreeData } from './myTypes.js';
type ReadValFunction = (val: any, adapter: ioBroker.Adapter | ioBroker.myAdapter, device: myTreeData, channel: myTreeData, id: string) => ioBroker.StateValue | Promise<ioBroker.StateValue>;
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
    valFromProperty?: string;
    statesFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): Record<string, string> | string[] | string;
    conditionToCreateState?: ConditionToCreateStateFunction;
    subscribeMe?: true;
    required?: true;
}
export interface myTreeObject {
    idChannel?: string;
    name?: string | ioBroker.Translated | ((objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => string | ioBroker.Translated);
    icon?: string;
    object: {
        [key: string]: myTreeDefinition;
    };
    conditionToCreateState?: ConditionToCreateStateFunction;
}
export interface myTreeArray {
    idChannel?: string;
    name?: string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string | ioBroker.Translated;
    arrayStartNumber?: number;
    array: {
        [key: string]: myTreeDefinition;
    };
    conditionToCreateState?: ConditionToCreateStateFunction;
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
    createOrUpdateDevice(id: string, name: string | ioBroker.Translated, onlineId: string, errorId?: string, icon?: string | undefined, updateObject?: boolean, logChanges?: boolean, native?: Record<string, any>): Promise<void>;
    /**
     * create or update a channel object, update will only be done on adapter start
     *
     * @param id
     * @param name
     * @param icon
     * @param updateObject
     * @param native
     */
    createOrUpdateChannel(id: string, name: string | ioBroker.Translated, icon?: string, updateObject?: boolean, native?: Record<string, any>): Promise<void>;
    createOrUpdateStates(idChannel: string, treeDefinition: {
        [key: string]: myTreeDefinition;
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
    _findMissingTranslation(obj: any, logSuffix?: any): void;
    /**
     * generate a list with all defined names, that can be used for translation
     *
     * @param tree
     * @param adapter
     * @param i18n
     */
    private tree2Translation;
    private getTreeNameOrKey;
}
export {};
