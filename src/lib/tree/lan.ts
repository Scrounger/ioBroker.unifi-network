import { myCommonState, myCommoneChannelObject, myCommonChannelArray, myCache, myNetworkClient } from "../myTypes";
import * as myHelper from '../helper.js';
import { NetworkDevice } from "../api/network-types-device";

export namespace lan {
    let keys: string[] = undefined;

    export function get(): { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } {
        return {
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
                id: 'internet_access',
                iobType: 'boolean',
                name: 'internet access enabled',
                read: true,
                write: true
            },
            name: {
                iobType: 'string',
                name: 'name'
            },
            purpose: {
                id: 'type',
                iobType: 'string',
                name: 'type of network'
            },
            vlan: {
                iobType: 'number',
                name: 'VLAN Id',
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return parseInt(val);
                },
            }
        }
    }

    export function getGlobal(): { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } {
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
}