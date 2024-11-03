export interface iDeviceState {
    id?: string,
    iobType: string,
    name?: string,
    role?: string,
    read?: boolean,
    write?: boolean,
    unit?: string,
    min?: number,
    max?: number,
    step?: number,
    states?: { [key: string]: string } | { [key: number]: string },
    readVal?(val: ioBroker.StateValue): ioBroker.StateValue,
    writeVal?(val: ioBroker.StateValue): ioBroker.StateValue,
    icon?: string,
}

export interface iDeviceObjectChannel {
    channelName: string;
    icon?: string;
    object: { [key: string]: iDeviceState; };
}

export interface iDeviceArrayChannel {
    channelName: string,
    icon?: string,
    arrayChannelIdPrefix?: string,
    arrayChannelIdZeroPad?: number,
    arrayChannelIdFromProperty?: string,
    arrayChannelNamePrefix?: string,
    arrayChannelNameFromProperty?: string,
    array: { [key: string]: iDeviceState; },
}

export const deviceDefinition: { [key: string]: iDeviceState | iDeviceObjectChannel | iDeviceArrayChannel; } = {
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
                readVal(val: string) {
                    return parseFloat(val);
                },

            },
            mem: {
                iobType: 'number',
                unit: '%',
                readVal(val: string) {
                    return parseFloat(val);
                },
            },
            uptime: {
                iobType: 'number',
                unit: 's',
                readVal(val: string) {
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
                readVal: function (val: number) {
                    return Math.round(val * 10) / 10;
                },
            },
        },
    }
}