import type { myTreeDefinition } from "../myTypes.js";
export declare namespace firewallGroup {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
