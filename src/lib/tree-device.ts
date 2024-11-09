import _ from 'lodash';
import { NetworkClient } from './api/network-types-client.js';
import { NetworkDevice } from './api/network-types-device.js';
import { myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject } from './myTypes.js';

export const deviceTree: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } = {
    connected_clients: {
        id: 'connected_clients',
        iobType: 'number',
        name: 'connected clients',
        valFromProperty: 'user-num_sta',
    },
    connected_guests: {
        id: 'connected_guests',
        iobType: 'number',
        name: 'connected clients',
        valFromProperty: 'guest-num_sta',
    },
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
    led_override: {
        iobType: 'string',
        name: 'led override',
        write: true,
        states: {
            'on': 'on',
            'off': 'off',
            'default': 'default'
        }
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
        arrayStartNumber: 1,
        array: {
            name: {
                iobType: 'string',
                name: 'port name'
            },
            enable: {
                iobType: 'boolean',
                name: 'enabled'
            },
            is_uplink: {
                iobType: 'boolean',
                name: 'is uplink port'
            },
            poe_enable: {
                id: 'poe_enable',
                iobType: 'boolean',
                name: 'POE enabled',
                conditionProperty: 'port_poe',
                conditionToCreateState(val: boolean) {
                    // only create state if it's a poe port
                    return val;
                },
                valFromProperty: 'poe_mode',
                read: true,
                write: true,
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return val === 'auto';
                }
            },
            poe_cycle: {
                id: 'poe_cycle',
                iobType: 'boolean',
                name: 'temporary interruption of the power supply to the poe port of the switch',
                read: false,
                write: true,
                role: 'button',
                conditionProperty: 'port_poe',
                conditionToCreateState(val: boolean) {
                    // only create state if it's a poe port
                    return val;
                }
            },
            poe_power: {
                iobType: 'number',
                name: 'POE power consumption',
                unit: 'W',
                conditionProperty: 'port_poe',
                conditionToCreateState(val: boolean) {
                    // only create state if it's a poe port
                    return val;
                },
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return parseFloat(val);
                }
            },
            poe_voltage: {
                iobType: 'number',
                name: 'POE voltage',
                unit: 'V',
                conditionProperty: 'port_poe',
                conditionToCreateState(val: boolean) {
                    // only create state if it's a poe port
                    return val;
                },
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return parseFloat(val);
                }
            },
            rx_bytes: {
                iobType: 'number',
                name: 'RX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return Math.round(val / 1000 / 1000 / 1000 * 100) / 100;
                }
            },
            satisfaction: {
                iobType: 'number',
                name: 'satisfaction',
                unit: '%'
            },
            speed: {
                iobType: 'number',
                name: 'speed',
                unit: 'mbps'
            },
            tx_bytes: {
                iobType: 'number',
                name: 'TX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
                    return Math.round(val / 1000 / 1000 / 1000 * 100) / 100;
                }
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
    temperature: {
        id: 'temperature',
        iobType: 'number',
        name: 'temperature',
        unit: '°C',
        valFromProperty: 'general_temperature',
        readVal: function (val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            return Math.round(val * 10) / 10;
        },
    },
    power: {
        id: 'power',
        iobType: 'number',
        name: 'total power consumption',
        unit: 'W',
        valFromProperty: 'total_used_power'
    },
    upgradable: {
        iobType: 'boolean',
        name: 'new firmware available'
    },
    upgrade: {
        id: 'upgrade',
        iobType: 'boolean',
        name: 'upgrade device to new firmware',
        read: false,
        write: true,
        role: 'button'
    },
    uptime: {
        iobType: 'number',
        name: 'uptime',
        unit: 's',
    }
}