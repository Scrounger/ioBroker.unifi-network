export const deviceDefinition = {
    mac: {
        iobType: 'string',
        name: 'MAC Address'
    },
    name: {
        iobType: 'string',
        name: 'Device Name'
    },
    port_table: {
        channelName: 'Port Table',
        idChannelPrefix: 'Port_',
        zeroPad: 2,
        arrayChannelNamePrefix: 'Port ',
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
    }
};
