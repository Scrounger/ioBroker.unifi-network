import { ApiEndpoints } from "../api/network-api.js";
import * as myHelper from '../helper.js';
export var wlan;
(function (wlan) {
    let keys = undefined;
    wlan.idChannel = 'wlan';
    wlan.nameChannel = 'WLAN';
    function get() {
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
                async writeVal(val, id, device, adapter) {
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
                conditionToCreateState(objDevice, objChannel, adapter) {
                    return !objDevice?.is_guest;
                },
                valFromProperty: 'current_client_count',
            },
            peak_client_count: {
                id: 'connected_clients_peak',
                iobType: 'number',
                name: 'peak of connected clients',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    return !objDevice?.is_guest;
                },
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    return objDevice?.is_guest;
                },
                valFromProperty: 'current_client_count',
            },
            current_satisfaction: {
                id: 'satisfaction',
                iobType: 'number',
                name: 'satisfaction',
                unit: '%',
                readVal(val, adapter, device, channel, id) {
                    return val >= 0 ? val : 0;
                },
            },
        };
    }
    wlan.get = get;
    function getGlobal() {
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
        };
    }
    wlan.getGlobal = getGlobal;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    wlan.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    wlan.getStateIDs = getStateIDs;
})(wlan || (wlan = {}));
