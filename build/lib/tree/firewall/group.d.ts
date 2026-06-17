import { FirewallGroup } from "../../api/network-types-firewall.js";
import type { myTreeDefinition } from "../../myIob.js";
export declare namespace group {
    const idChannel = "firewall.groups";
    function get(): {
        [key: string]: myTreeDefinition<any, FirewallGroup, ioBroker.myAdapter>;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
