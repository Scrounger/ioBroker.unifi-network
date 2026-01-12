import * as myHelper from '../helper.js';
export var sysInfo;
(function (sysInfo) {
    let keys = undefined;
    sysInfo.idChannel = 'info';
    function get() {
        return {
            version: {
                iobType: "string",
            },
            uptime: {
                iobType: 'number',
                name: 'uptime',
                unit: 's',
            },
            upgradable: {
                iobType: 'boolean',
                name: 'new network controller version available',
                valFromProperty: 'update_available',
            },
        };
    }
    sysInfo.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
            // manual add keys here:
            keys.push(...['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        }
        return keys;
    }
    sysInfo.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    sysInfo.getStateIDs = getStateIDs;
})(sysInfo || (sysInfo = {}));
