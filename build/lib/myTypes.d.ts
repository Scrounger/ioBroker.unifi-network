export interface myCommonState {
    id?: string;
    iobType: ioBroker.CommonType;
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
    expert?: true;
    icon?: string;
    def?: ioBroker.StateValue;
    desc?: string;
    readVal?(val: ioBroker.StateValue): ioBroker.StateValue;
    writeVal?(val: ioBroker.StateValue): ioBroker.StateValue;
    valFromProperty?: string;
    statesFromProperty?: string;
}
export interface myCommoneChannelObject {
    channelName: string;
    icon?: string;
    object: {
        [key: string]: myCommonState;
    };
}
export interface myCommonChannelArray {
    channelName: string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?: string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?: string;
    array: {
        [key: string]: myCommonState;
    };
}
