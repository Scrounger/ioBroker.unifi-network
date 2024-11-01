export interface IdeviceDefinition {
    id?: string,
    iobType?: string,
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
    isArray?: boolean,
    items?: any,
    channelName?: string,
    icon?: string,
}



export const deviceDefinition: { [key: string]: IdeviceDefinition; } = {
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
}