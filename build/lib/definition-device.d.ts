export interface iDeviceState {
    id?: string;
    iobType: string;
    name?: string;
    role?: string;
    read?: boolean;
    write?: boolean;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
    states?: [key: string] | [key: number];
    readVal?(val: ioBroker.StateValue): ioBroker.StateValue;
    writeVal?(val: ioBroker.StateValue): ioBroker.StateValue;
    icon?: string;
}
export interface iDeviceObjectChannel {
    channelName: string;
    icon?: string;
    object: {
        [key: string]: iDeviceState;
    };
}
export interface iDeviceArrayChannel {
    channelName: string;
    idChannelPrefix: string;
    zeroPad: number;
    icon?: string;
    arrayChannelNamePrefix: string;
    array: {
        [key: string]: iDeviceState;
    };
}
export declare const deviceDefinition: {
    [key: string]: iDeviceState | iDeviceObjectChannel | iDeviceArrayChannel;
};
