import * as myHelper from '../helper.js';
export var wlan;
(function (wlan) {
    let keys = undefined;
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
                write: true
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
                conditionToCreateState(objValues, adapter) {
                    return !objValues.is_guest;
                },
                valFromProperty: 'current_client_count',
            },
            peak_client_count: {
                id: 'connected_clients_peak',
                iobType: 'number',
                name: 'peak of connected clients',
                conditionToCreateState(objValues, adapter) {
                    return !objValues.is_guest;
                },
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                conditionToCreateState(objValues, adapter) {
                    return objValues.is_guest;
                },
                valFromProperty: 'current_client_count',
            },
            current_satisfaction: {
                id: 'satisfaction',
                iobType: 'number',
                name: 'satisfaction',
                unit: '%',
                readVal(val, adapter, cache, deviceOrClient) {
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
