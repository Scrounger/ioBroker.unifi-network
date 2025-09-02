import type { myCommonChannelArray, myCommonState, myCommoneChannelObject } from '../myTypes.js';
export declare namespace client {
    const idChannel = "clients";
    const idChannelUsers = "clients.users";
    const idChannelGuests = "clients.guests";
    const idChannelVpn = "clients.vpn";
    function get(): {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
