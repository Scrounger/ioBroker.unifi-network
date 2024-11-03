import { myCommonChannelArray, myCommonState, myCommoneChannelObject } from './myTypes.js';

export const clientTree: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray; } = {
    essid: {
        iobType: 'string',
        name: 'WLAN SSID'
    },
    ip: {
        iobType: 'string',
        name: 'ip address'
    },
    last_seen: {
        iobType: 'number',
        name: 'last seen'
    },
    mac: {
        iobType: 'string',
        name: 'mac address'
    },
    name: {
        iobType: 'string',
        name: 'device name'
    },
    status: {
        iobType: 'string',
        name: 'status'
    },
    uptime: {
        iobType: 'number',
        name: 'uptime',
        unit: 's',
    },
    tags: {
        iobType: 'json',
        name: 'tags',
        readVal(val) {
            return JSON.stringify(val);
        },
    }
}