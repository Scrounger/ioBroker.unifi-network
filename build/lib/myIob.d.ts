import type { WriteValFunction, myTreeDefinition, myTreeData } from './myTypes.js';
export declare class myIob {
    private adapter;
    private log;
    private utils;
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
     */
    createOrUpdateDevice(id: string, name: string | undefined, onlineId: string, errorId?: string, icon?: string | undefined, updateObject?: boolean, logChanges?: boolean): Promise<void>;
    /**
     * create or update a channel object, update will only be done on adapter start
     *
     * @param id
     * @param name
     * @param icon
     * @param updateObject
     */
    createOrUpdateChannel(id: string, name: string, icon?: string, updateObject?: boolean): Promise<void>;
    createOrUpdateStates(idChannel: string, treeDefinition: {
        [key: string]: myTreeDefinition;
    }, partialData: myTreeData, fullData: myTreeData, blacklistFilter?: {
        id: string;
    }[] | undefined, isWhiteList?: boolean, logDeviceName?: string, updateObject?: boolean): Promise<void>;
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
