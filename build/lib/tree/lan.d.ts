import type { NetworkLanConfig } from "../api/network-types-lan-config.js";
import type { myTreeDefinition } from "../myIob.js";
export declare namespace lan {
    const idChannel = "lan";
    const nameChannel = "LAN";
    function get(): {
        [key: string]: myTreeDefinition<any, NetworkLanConfig, ioBroker.myAdapter>;
    };
    function getGlobal(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
