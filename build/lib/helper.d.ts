import type { myTreeDefinition } from "./myIob.js";
export declare function getObjectByString(path: string, obj: any, separator?: string): any;
export declare function getAllowedCommonStates(path: string, obj: any, separator?: string): any;
export declare function zeroPad(source: any, places: number): string;
/**
 * Collect all properties used in tree defintions
 *
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export declare function getAllKeysOfTreeDefinition(treefDefintion: {
    [key: string]: myTreeDefinition;
}): string[];
export declare function getAllIdsOfTreeDefinition(treefDefintion: {
    [key: string]: myTreeDefinition;
}): string[];
export declare function radioToFrequency(radioVal: string, adapter: ioBroker.Adapter): string;
export declare function radio_nameToFrequency(radio_nameVal: string, adapter: ioBroker.Adapter): string;
