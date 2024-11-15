import { Fingerprint, NetworkClient } from "./api/network-types-client";
import { NetworkDevice } from "./api/network-types-device";
import { NetworkWlanConfig } from "./api/network-types-wlan-config";
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
    readVal?(val: ioBroker.StateValue | Fingerprint, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient): ioBroker.StateValue | Promise<ioBroker.StateValue>;
    writeVal?(val: ioBroker.StateValue, adapter: ioBroker.Adapter, cache: myCache): ioBroker.StateValue | Promise<ioBroker.StateValue>;
    valFromProperty?: string;
    statesFromProperty?: string;
    conditionToCreateState?(objValues: any, adapter: ioBroker.Adapter): boolean;
    subscribeMe?: true;
}
export interface myCommoneChannelObject {
    idChannel?: string;
    channelName?: string;
    icon?: string;
    object: {
        [key: string]: myCommonState;
    };
}
export interface myCommonChannelArray {
    idChannel?: string;
    channelName?: string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?(objValues: any, i: number, adapter: ioBroker.Adapter): string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objValues: any, adapter: ioBroker.Adapter): string;
    arrayStartNumber?: number;
    array: {
        [key: string]: myCommonState;
    };
}
export declare enum WebSocketEventMessages {
    client = "client:sync",
    device = "device:sync",
    user = "user:",
    events = "events",
    speedTest = "speed-test:update",
    wlanConf = "wlanconf:"
}
export declare const WebSocketEvent_Connected: string[];
export declare const WebSocketEvent_Disconnected: string[];
export declare const WebSocketEvent: {
    device: {
        Connected: string[];
        Disconnected: string[];
        Restarted: string[];
    };
    client: {
        Connected: string[];
        Disconnected: string[];
        Roamed: string[];
        RoamedRadio: string[];
        Blocked: string[];
        Unblocked: string[];
    };
};
export interface myCache {
    devices: {
        [key: string]: NetworkDevice;
    };
    clients: {
        [key: string]: NetworkClient;
    };
    vpn: {
        [key: string]: NetworkClient;
    };
    wlan: {
        [key: string]: NetworkWlanConfig;
    };
}
export interface myImgCache {
    [key: string]: string[];
}
