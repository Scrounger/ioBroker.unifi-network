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
            }
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
