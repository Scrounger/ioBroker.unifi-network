import type { myTreeDefinition } from "../myIob.js";
export declare namespace firewallGroup {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
