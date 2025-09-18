import { myTreeDefinition } from '../myIob.js';
export declare namespace device {
    const idChannel = "devices";
    function get(): {
        [key: string]: myTreeDefinition;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
