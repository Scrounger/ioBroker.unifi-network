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
    states?: [key: string] | [key: number],
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
    idChannelPrefix: string,
    zeroPad: number,
    icon?: string,
    arrayChannelNamePrefix: string,
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
    }
}