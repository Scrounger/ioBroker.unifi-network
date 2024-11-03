export const deviceDefinition = {
    mac: {
        iobType: 'string',
        name: 'MAC Address'
    },
    name: {
        iobType: 'string',
        name: 'Device Name'
    },
    state: {
        iobType: 'number',
        name: 'Device state',
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
        channelName: 'Port Table',
        arrayChannelIdPrefix: 'Port_',
        arrayChannelIdZeroPad: 2,
        arrayChannelNameFromProperty: 'name',
        array: {
            name: {
                iobType: 'string',
                name: 'Port Name'
            }
        },
    },
    "system-stats": {
        channelName: 'System Statistics',
        object: {
            cpu: {
                iobType: 'number',
                unit: '%',
                readVal(val) {
                    return parseFloat(val);
                },
            },
            mem: {
                iobType: 'number',
                unit: '%',
                readVal(val) {
                    return parseFloat(val);
                },
            },
            uptime: {
                iobType: 'number',
                unit: 's',
                readVal(val) {
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
                readVal: function (val) {
                    return Math.round(val * 10) / 10;
                },
            },
        },
    }
};
