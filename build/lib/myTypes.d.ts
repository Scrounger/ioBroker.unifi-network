import { Fingerprint, NetworkClient } from "./api/network-types-client";
import { NetworkDevice } from "./api/network-types-device";
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
    conditionProperty?: string;
    conditionToCreateState?(val: ioBroker.StateValue, adapter: ioBroker.Adapter): boolean;
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
    arrayChannelIdFromProperty?: string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objValues: any): string;
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
    speedTest = "speed-test:update"
}
export declare enum WebSocketEventKeys {
    connected = "_Connected",
    disconnected = "_Disconnected",
    blocked = "_Blocked",
    unblocked = "_Unblocked",
    roamed = "_Roam",
    roamedRadio = "_RoamRadio",
    clientWirelessConnected = "EVT_WU_Connected",
    clientWirelessDisconnected = "EVT_WU_Disconnected",
    clientWirelessRoamed = "EVT_WU_Roam",
    clientWirelessRoamedRadio = "EVT_WU_RoamRadio",
    clientLanConnected = "EVT_LU_Connected",
    clientLanDisconnected = "EVT_LU_Disconnected",
    clientLanBlocked = "EVT_LU_Blocked",
    clientLanUnblocked = "EVT_LU_Unblocked",
    guestWirelessConnected = "EVT_WG_Connected",
    guestWirelessDisconnected = "EVT_WG_Disconnected",
    guestWirelessRoamed = "EVT_WG_Roam",
    guestWirelessRoamedRadio = "EVT_WG_RoamRadio",
    guestLanConnected = "EVT_LG_Connected",
    guestLanDisconnected = "EVT_LG_Disconnected",
    guestLanBlocked = "EVT_LG_Blocked",
    guestLanUnblocked = "EVT_LG_Unblocked",
    clientOrGuestWirelessBlocked = "EVT_WC_Blocked",
    clientOrGuestWirelessUnblocked = "EVT_WC_Unblocked",
    gatewayRestarted = "EVT_GW_Restarted",
    switchRestarted = "EVT_SW_Restarted",
    switchAutoReadopted = "EVT_SW_AutoReadopted",
    switchLostContact = "EVT_SW_Lost_Contact",
    accessPointRestarted = "EVT_AP_Restarted"
}
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
}
export interface myImgCache {
    [key: string]: string[];
}
