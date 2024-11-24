import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes";
export declare namespace lan {
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getGlobal(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
