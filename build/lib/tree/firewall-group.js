import * as myHelper from '../helper.js';
export var firewallGroup;
(function (firewallGroup) {
    let keys = undefined;
    firewallGroup.idChannel = 'firewall.groups';
    function get() {
        return {
            name: {
                iobType: 'string',
                name: 'name',
                write: true,
                required: true
            },
            group_members: {
                iobType: 'string',
                write: true,
                name: 'group members',
                readVal(val, adapter, device, id) {
                    return JSON.stringify(val);
                }
            },
            group_type: {
                iobType: 'string',
                name: 'type',
                states: {
                    "port-group": 'Port',
                    "address-group": 'IPv4',
                    "ipv6-address-group": 'IPv6'
                }
            }
        };
    }
    firewallGroup.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    firewallGroup.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    firewallGroup.getStateIDs = getStateIDs;
})(firewallGroup || (firewallGroup = {}));
