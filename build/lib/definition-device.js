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
        isArray: true,
        items: {
            name: {
                iobType: 'string',
                name: 'Port Name'
            }
        },
    }
};
