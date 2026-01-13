import type { myTreeDefinition } from "../myIob.js";
export declare namespace lan {
    const idChannel = "lan";
    const nameChannel = "LAN";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getGlobal(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
