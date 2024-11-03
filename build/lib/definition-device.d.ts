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
    states?: {
        [key: string]: string;
    } | {
        [key: number]: string;
    };
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
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?: string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?: string;
    array: {
        [key: string]: iDeviceState;
    };
}
export declare const deviceDefinition: {
    [key: string]: iDeviceState | iDeviceObjectChannel | iDeviceArrayChannel;
};
