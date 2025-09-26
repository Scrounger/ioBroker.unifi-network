import { ApiEndpoints } from "../api/network-api.js";
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
                required: true,
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[firewallGroup.name]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${device._id.trim()}`, { name: val }, 'PUT');
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `firewall group '${device.name}' - 'name' set to '${val}' (id: ${device._id})`);
                },
            },
            group_members: {
                iobType: 'string',
                write: true,
                name: 'group members',
                readVal(val, adapter, device, channel, id) {
                    return JSON.stringify(val);
                },
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[firewallGroup.group_members]`;
                    try {
                        const memObj = JSON.parse(val);
                        const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${device._id.trim()}`, { group_members: memObj }, 'PUT');
                        await adapter.ufn.checkCommandSuccessful(result, logPrefix, `firewall group '${device.name}' - 'members' set to '${val}' (id: ${device._id})`);
                    }
                    catch (error) {
                        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
                    }
                },
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
