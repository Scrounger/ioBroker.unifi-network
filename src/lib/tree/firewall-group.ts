import { myCommonState, myCommoneChannelObject, myCommonChannelArray, myCache, myNetworkClient } from "../myTypes";
import * as myHelper from '../helper.js';

export namespace firewallGroup {
    let keys: string[] = undefined;

    export const idChannel = 'firewall.groups';

    export function get(): { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } {
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
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: myNetworkClient, id: string): ioBroker.StateValue {
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