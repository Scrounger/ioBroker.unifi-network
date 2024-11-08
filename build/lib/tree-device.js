import _ from 'lodash';
export const deviceTree = {
    hasError: {
        id: 'hasError',
        iobType: 'boolean',
        name: 'device reported errors',
        valFromProperty: 'state',
        readVal(val, adapter, cache, deviceOrClient) {
            return val === 6 || val === 9;
        },
    },
    imageUrl: {
        iobType: 'string',
        name: 'imageUrl',
        expert: true,
        subscribeMe: true,
        valFromProperty: 'model',
        async readVal(val, adapter, cache, deviceOrClient) {
            if (val && adapter.config.deviceImageDownload) {
                if (await adapter.objectExists('devices.publicData')) {
                    const publicData = await adapter.getStateAsync('devices.publicData');
                    if (publicData && publicData.val) {
                        const data = JSON.parse(publicData.val);
                        const find = _.find(data.devices, (x) => x.shortnames.includes(val));
                        if (find) {
                            return `https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/${find.id}/default/${find.images.default}.png&w=256?q=100`;
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
        readVal(val, adapter, cache, deviceOrClient) {
            return val !== 0 && val !== 6 && val !== 9;
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
            },
            enable: {
                iobType: 'boolean',
                name: 'enabled'
            },
            poe_enable: {
                id: 'poe_enable',
                iobType: 'boolean',
                name: 'POE enabled',
                conditionProperty: 'port_poe',
                conditionToCreateState(val) {
                    // only create state if it's a poe port
                    return val;
                },
                valFromProperty: 'poe_mode',
                read: true,
                write: true,
                readVal(val, adapter, cache, deviceOrClient) {
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
                conditionToCreateState(val) {
                    // only create state if it's a poe port
                    return val;
                }
            },
            poe_power: {
                iobType: 'number',
                name: 'POE power consumption',
                unit: 'W',
                readVal(val, adapter, cache, deviceOrClient) {
                    return parseFloat(val);
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
                readVal(val, adapter, cache, deviceOrClient) {
                    return parseFloat(val);
                },
            },
            mem: {
                iobType: 'number',
                unit: '%',
                readVal(val, adapter, cache, deviceOrClient) {
                    return parseFloat(val);
                },
            },
            uptime: {
                iobType: 'number',
                unit: 's',
                readVal(val, adapter, cache, deviceOrClient) {
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
                readVal: function (val, adapter, cache, deviceOrClient) {
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
};
