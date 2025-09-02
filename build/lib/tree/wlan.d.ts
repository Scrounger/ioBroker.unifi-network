import type { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes.js";
export declare namespace wlan {
    const idChannel = "wlan";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getGlobal(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
