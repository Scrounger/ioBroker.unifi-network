export declare function isDeviceCommonEqual(objCommon: ioBroker.DeviceCommon, myCommon: ioBroker.DeviceCommon): boolean;
export declare function isChannelCommonEqual(objCommon: ioBroker.ChannelCommon, myCommon: ioBroker.ChannelCommon): boolean;
export declare function getObjectByString(path: any, obj: any, separator?: string): any;
export declare function getAllowedCommonStates(path: any, obj: any, separator?: string): {};
/** Compare common properties of State
 * @param {ioBroker.StateCommon} objCommon
 * @param {ioBroker.StateCommon} myCommon
 * @returns {boolean}
 */
export declare function isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon): boolean;
export declare function zeroPad(source: any, places: number): string;
/**
 * Id without last part
 * @param id
 * @returns
 */
export declare function getIdWithoutLastPart(id: string): string;
/**
 * last part of id
 * @param id
 * @returns
 */
export declare function getIdLastPart(id: string): string;
/**
 * Compare two objects and return properties that are diffrent
 * @param obj1
 * @param obj2
 * @returns
 */
export declare const deepDiffBetweenObjects: (object: any, base: any, adapter: any, allowedKeys?: any, prefix?: string) => any;
/**
 * Collect all properties used in tree defintions
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export declare function getAllKeysOfTreeDefinition(treefDefintion: any): any[];
export declare function getAllIdsOfTreeDefinition(treefDefintion: any): any[];
export declare function radioToFrequency(radioVal: string, adapter: ioBroker.Adapter): string;
export declare function radio_nameToFrequency(radio_nameVal: string, adapter: ioBroker.Adapter): string;
