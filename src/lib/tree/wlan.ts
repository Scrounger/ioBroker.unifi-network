import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "../myTypes";


export namespace wlan {

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
}
