import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes";
export declare namespace wlan {
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
}
