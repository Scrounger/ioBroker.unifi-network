import type { NetworkLanConfig } from "../api/network-types-lan-config.js";
import * as myHelper from '../helper.js';
import type { myTreeDefinition } from "../myIob.js";

export namespace lan {
    let keys: string[] = undefined;

    export const idChannel = 'lan';

    export function get(): { [key: string]: myTreeDefinition } {
        return {
            connected_clients: {
                id: 'connected_clients',
                iobType: 'number',
                name: 'connected clients',
                conditionToCreateState(objDevice: NetworkLanConfig, objChannel: NetworkLanConfig, adapter: ioBroker.myAdapter): boolean {
                    return objDevice?.purpose !== 'guest'
                },
                valFromProperty: 'dhcp_active_leases',
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                conditionToCreateState(objDevice: NetworkLanConfig, objChannel: NetworkLanConfig, adapter: ioBroker.myAdapter): boolean {
                    return objDevice?.purpose === 'guest'
                },
                valFromProperty: 'dhcp_active_leases',
            },
            enabled: {
                iobType: 'boolean',
                name: 'WLAN enabled',
                read: true,
                write: true
            },
            ip_subnet: {
                iobType: 'string',
                name: 'IP subnet'
            },
            internet_access_enabled: {
                id: 'internet_enabled',
                iobType: 'boolean',
                name: 'internet access enabled',
                read: true,
                write: true,
                valFromProperty: 'internet_access_enabled'
            },
            name: {
                iobType: 'string',
                name: 'name',
                required: true
            },
            purpose: {
                id: 'type',
                iobType: 'string',
                name: 'type of network'
            },
            vlan: {
                iobType: 'number',
                name: 'VLAN Id',
                readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkLanConfig, id: string): ioBroker.StateValue {
                    return parseInt(val);
                },
            }
        }
    }

    export function getGlobal(): { [key: string]: myTreeDefinition } {
        return {
            connected_clients: {
                id: 'connected_clients',
                iobType: 'number',
                name: 'connected clients',
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
            },
        }
    }

    export function getKeys(): string[] {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }

        return keys
    }

    export function getStateIDs(): string[] {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
}