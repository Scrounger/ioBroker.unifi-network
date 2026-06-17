import type { myNetworkClient } from '../myTypes.js';
import type { myTreeDefinition } from '../myIob.js';
export declare namespace client {
    const idChannel = "clients";
    const nameChannel = "client devices";
    const idChannelUsers = "clients.users";
    const nameChannelUsers = "users";
    const idChannelGuests = "clients.guests";
    const nameChannelGuests = "guests";
    const idChannelVpn = "clients.vpn";
    const nameChannelVpn = "vpn clients";
    function get(): {
        [key: string]: myTreeDefinition<any, myNetworkClient, ioBroker.myAdapter>;
    };
    function getKeys(): string[];
    function getStateIDs(): string[];
}
