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
    readVal?(val: ioBroker.StateValue, adapater: ioBroker.Adapter): ioBroker.StateValue | Promise<ioBroker.StateValue>;
    writeVal?(val: ioBroker.StateValue, adapater: ioBroker.Adapter): ioBroker.StateValue | Promise<ioBroker.StateValue>;
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
export declare enum WebSocketEventMessages {
    client = "client:sync",
    device = "device:sync",
    events = "events"
}
export declare enum WebSocketEventKeys {
    clientConnected = "EVT_WU_Connected",
    clientDisconnected = "EVT_WU_Disconnected",
    clientRoamed = "EVT_WU_Roam",
    guestConnected = "EVT_WG_Connected",
    guestDisconnected = "EVT_WG_Disconnected",
    guestRoamed = "EVT_WG_Roam"
}
