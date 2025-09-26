import { ApiEndpoints } from "../api/network-api.js";
import { FirewallGroup } from "../api/network-types-firewall-group.js";
import * as myHelper from '../helper.js';
import type { myTreeDefinition } from "../myIob.js";

export namespace firewallGroup {
    let keys: string[] = undefined;

    export const idChannel = 'firewall.groups';

    export function get(): { [key: string]: myTreeDefinition } {
        return {
            name: {
                iobType: 'string',
                name: 'name',
                write: true,
                required: true,
                async writeVal(val: string, id: string, device: FirewallGroup, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[firewallGroup.name]`;

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${device._id.trim()}`, { name: val }, 'PUT');

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `firewall group '${device.name}' - 'name' set to '${val}' (id: ${device._id})`);
                },
            },
            group_members: {
                iobType: 'string',
                write: true,
                name: 'group members',
                readVal(val: string, adapter: ioBroker.myAdapter, device: FirewallGroup, channel: FirewallGroup, id: string): ioBroker.StateValue {
                    return JSON.stringify(val);
                },
                async writeVal(val: string, id: string, device: FirewallGroup, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[firewallGroup.group_members]`;

                    try {
                        const memObj = JSON.parse(val);
                        const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${device._id.trim()}`, { group_members: memObj }, 'PUT');

                        await adapter.ufn.checkCommandSuccessful(result, logPrefix, `firewall group '${device.name}' - 'members' set to '${val}' (id: ${device._id})`);

                    } catch (error) {
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