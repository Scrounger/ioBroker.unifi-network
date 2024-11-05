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
