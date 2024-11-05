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
