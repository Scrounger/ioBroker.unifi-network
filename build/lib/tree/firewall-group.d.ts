import type { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes.js";
export declare namespace firewallGroup {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
