import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes";
import * as myHelper from '../helper.js';

export namespace wlan {
    let keys: string[] = undefined;

    export function get(): { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } {
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
        }
    }

    export function getKeys(): string[] {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }

        return keys
    }
}
