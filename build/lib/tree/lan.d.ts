import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes.js";
export declare namespace lan {
    const idChannel = "lan";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getGlobal(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
