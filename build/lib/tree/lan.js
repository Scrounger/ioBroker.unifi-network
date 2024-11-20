import * as myHelper from '../helper.js';
export var lan;
(function (lan) {
    let keys = undefined;
    function get() {
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
                readVal(val, adapter, cache, deviceOrClient) {
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
})(lan || (lan = {}));
