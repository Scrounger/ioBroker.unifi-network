import type { NetworkWlanConfig } from "../api/network-types-wlan-config.js";
import type { myTreeDefinition } from "../myIob.js";
export declare namespace wlan {
    const idChannel = "wlan";
    const nameChannel = "WLAN";
    function get(): {
        [key: string]: myTreeDefinition<any, NetworkWlanConfig, ioBroker.myAdapter>;
    };
    function getGlobal(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
