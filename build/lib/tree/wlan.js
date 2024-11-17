import * as myHelper from '../helper.js';
export var wlan;
(function (wlan) {
    let keys = undefined;
    function get() {
        return {
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
                name: 'name'
            },
            security: {
                iobType: 'string',
                name: 'security'
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
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    wlan.getKeys = getKeys;
})(wlan || (wlan = {}));
