import _ from 'lodash';
import { NetworkClient } from './api/network-types-client.js';
import { NetworkDevice } from './api/network-types-device.js';
import { myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject } from './myTypes.js';

export const deviceTree: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray; } = {
    hasError: {
        id: 'hasError',
        iobType: 'boolean',
        name: 'device reported errors',
        valFromProperty: 'state',
        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            return val === 6 || val === 9
        },
    },
    imageUrl: {
        iobType: 'string',
        name: 'imageUrl',
        expert: true,
        subscribeMe: true,
        valFromProperty: 'model',
        async readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            if (val && adapter.config.deviceImageDownload) {
                if (await adapter.objectExists('devices.publicData')) {
                    const publicData = await adapter.getStateAsync('devices.publicData');

                    if (publicData && publicData.val) {
                        const data: any = JSON.parse(publicData.val as string);

                        const find = _.find(data.devices, (x) => x.shortnames.includes(val));

                        if (find) {
                            return `https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/${find.id}/default/${find.images.default}.png&w=256?q=100`
                        }
                    }
                }
            }
            return null;
        }
    },
    image: {
        id: 'image',
        iobType: 'string',
        name: 'base64 image'
    },
    ip: {
        iobType: 'string',
        name: 'ip address'
    },
    isOnline: {
        id: 'isOnline',
        iobType: 'boolean',
        name: 'Is device online',
        valFromProperty: 'state',
        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            return val !== 0 && val !== 6 && val !== 9
        },
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
    restart: {
        id: 'restart',
        iobType: 'boolean',
        name: 'restart device',
        read: false,
        write: true,
        role: 'button'
    },
    state: {
        iobType: 'number',
        name: 'device state',
        states: {
            0: "offline",
            1: "connected",
            2: "pending adoption",
            4: "updating",
            5: "provisioning",
            6: "unreachable",
            7: "adopting",
            9: "adoption error",
            11: "isolated"
        }
    },
    port_table: {
        channelName: 'port table',
        arrayChannelIdPrefix: 'Port_',
        arrayChannelIdZeroPad: 2,
        arrayChannelNameFromProperty: 'name',
        array: {
            name: {
                iobType: 'string',
                name: 'port name'
            }
        },
    },
    "system-stats": {
        channelName: 'system statistics',
        object: {
            cpu: {
                iobType: 'number',
                unit: '%',
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return parseFloat(val);
                },

            },
            mem: {
                iobType: 'number',
                unit: '%',
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return parseFloat(val);
                },
            },
            uptime: {
                iobType: 'number',
                unit: 's',
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return parseFloat(val);
                },
            },
        }
    },
    temperatures: {
        channelName: 'temperature',
        arrayChannelIdFromProperty: 'name',
        arrayChannelNameFromProperty: 'name',
        array: {
            type: {
                iobType: 'string',
                name: 'type'
            },
            value: {
                iobType: 'number',
                name: 'value',
                unit: '°C',
                readVal: function (val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return Math.round(val * 10) / 10;
                },
            },
        },
    },
    uptime: {
        iobType: 'number',
        name: 'uptime',
        unit: 's',
    }
}