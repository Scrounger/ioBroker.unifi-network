import { myCommonChannelArray, myCommonState, myCommoneChannelObject } from '../myTypes.js';
export declare namespace device {
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
}
