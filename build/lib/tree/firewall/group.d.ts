import type { myTreeDefinition } from "../../myIob.js";
export declare namespace group {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
