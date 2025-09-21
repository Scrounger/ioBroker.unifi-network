import { ApiEndpoints } from "../api/network-api.js";
import * as myHelper from '../helper.js';
export var lan;
(function (lan) {
    let keys = undefined;
    lan.idChannel = 'lan';
    function get() {
        return {
            connected_clients: {
                id: 'connected_clients',
                iobType: 'number',
                name: 'connected clients',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    return objDevice?.purpose !== 'guest';
                },
                valFromProperty: 'dhcp_active_leases',
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    return objDevice?.purpose === 'guest';
                },
                valFromProperty: 'dhcp_active_leases',
            },
            enabled: {
                iobType: 'boolean',
                name: 'WLAN enabled',
                read: true,
                write: true,
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[tree.lan.enable]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${device._id.trim()}`, { enabled: val }, 'PUT');
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `lan ${val ? 'enabled' : 'disabled'} - '${device.name}' (id: ${device._id})`);
                }
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
                valFromProperty: 'internet_access_enabled',
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[tree.lan.internet_enabled]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${device._id.trim()}`, { internet_access_enabled: val }, 'PUT');
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `internet access of lan ${val ? 'enabled' : 'disabled'} - '${device.name}' (id: ${device._id})`);
                }
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
                readVal(val, adapter, device, id) {
                    return parseInt(val);
                },
            }
        };
    }
    lan.get = get;
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
    lan.getGlobal = getGlobal;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    lan.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    lan.getStateIDs = getStateIDs;
})(lan || (lan = {}));
