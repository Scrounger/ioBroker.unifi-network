import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes";
export declare namespace firewallGroup {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
