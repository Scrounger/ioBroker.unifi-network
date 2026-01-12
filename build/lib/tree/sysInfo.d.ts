import { myTreeDefinition } from "../myIob";
export declare namespace sysInfo {
    const idChannel = "info";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
