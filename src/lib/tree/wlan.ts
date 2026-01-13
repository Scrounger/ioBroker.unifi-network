import { ApiEndpoints } from "../api/network-api.js";
import type { NetworkWlanConfig } from "../api/network-types-wlan-config.js";
import * as myHelper from '../helper.js';
import type { myTreeDefinition } from "../myIob.js";

export namespace wlan {
    let keys: string[] = undefined;

    export const idChannel = 'wlan';
    export const nameChannel = 'WLAN';

    export function get(): { [key: string]: myTreeDefinition } {
        return {
            current_access_point_count: {
                id: 'access_point_count',
                iobType: 'number',
                name: 'number of access points',
            },
            enabled: {
                iobType: 'boolean',
                name: 'WLAN enabled',
                read: true,
                write: true,
                async writeVal(val: boolean, id: string, device: NetworkWlanConfig, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[tree.wlan.enable]`;

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.wlanConfig)}/${device._id.trim()}`, { enabled: val }, 'PUT');

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `wlan ${val ? 'enabled' : 'disabled'} - '${device.name}' (id: ${device._id})`);
                }
            },
            is_guest: {
                iobType: 'boolean',
                name: 'is guest'
            },
            name: {
                iobType: 'string',
                name: 'name',
                required: true
            },
            connected_clients: {
                id: 'connected_clients',
                iobType: 'number',
                name: 'connected clients',
                conditionToCreateState(objDevice: NetworkWlanConfig, objChannel: NetworkWlanConfig, adapter: ioBroker.myAdapter): boolean {
                    return !objDevice?.is_guest
                },
                valFromProperty: 'current_client_count',
            },
            peak_client_count: {
                id: 'connected_clients_peak',
                iobType: 'number',
                name: 'peak of connected clients',
                conditionToCreateState(objDevice: NetworkWlanConfig, objChannel: NetworkWlanConfig, adapter: ioBroker.myAdapter): boolean {
                    return !objDevice?.is_guest
                },
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                conditionToCreateState(objDevice: NetworkWlanConfig, objChannel: NetworkWlanConfig, adapter: ioBroker.myAdapter): boolean {
                    return objDevice?.is_guest
                },
                valFromProperty: 'current_client_count',
            },
            current_satisfaction: {
                id: 'satisfaction',
                iobType: 'number',
                name: 'satisfaction',
                unit: '%',
                readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkWlanConfig, channel: NetworkWlanConfig, id: string): ioBroker.StateValue {
                    return val >= 0 ? val : 0
                },
            },
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
