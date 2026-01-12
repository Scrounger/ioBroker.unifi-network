import { myTreeDefinition } from "../myIob";
import * as myHelper from '../helper.js';

export namespace sysInfo {
    let keys: string[] = undefined;

    export const idChannel = 'info';

    export function get(): { [key: string]: myTreeDefinition } {
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
        }
    }

    export function getKeys(): string[] {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
            // manual add keys here:
            keys.push(...['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        }

        return keys
    }

    export function getStateIDs(): string[] {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
}