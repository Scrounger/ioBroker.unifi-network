import type { myTreeDefinition } from "../myTypes.js";
export declare namespace lan {
    const idChannel = "lan";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getGlobal(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
