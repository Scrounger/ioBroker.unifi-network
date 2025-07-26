import { myCommonChannelArray, myCommonState, myCommoneChannelObject } from '../myTypes.js';
export declare namespace device {
    const idChannel = "devices";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
