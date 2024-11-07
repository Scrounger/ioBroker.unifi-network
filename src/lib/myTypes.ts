import { Fingerprint, NetworkClient } from "./api/network-types-client";
import { NetworkDevice } from "./api/network-types-device";

export interface myCommonState {
    id?: string,
    iobType: ioBroker.CommonType,
    name?: string,
    role?: string,
    read?: boolean,
    write?: boolean,
    unit?: string,
    min?: number,
    max?: number,
    step?: number,
    states?: { [key: string]: string } | { [key: number]: string },
    expert?: true,
    icon?: string,
    def?: ioBroker.StateValue,
    desc?: string,

    readVal?(val: ioBroker.StateValue | Fingerprint, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient): ioBroker.StateValue | Promise<ioBroker.StateValue>,
    writeVal?(val: ioBroker.StateValue, adapter: ioBroker.Adapter, cache: myCache): ioBroker.StateValue | Promise<ioBroker.StateValue>,

    valFromProperty?: string             // Take value from other property in the corresponding tree
    statesFromProperty?: string         // ToDo: perhaps can be removed
    subscribeMe?: true                   // subscribe
}

export interface myCommoneChannelObject {
    channelName: string;
    icon?: string;
    object: { [key: string]: myCommonState; };
}

export interface myCommonChannelArray {
    channelName: string,
    icon?: string,
    arrayChannelIdPrefix?: string,                  // Array item id get a prefix e.g. myPrefix_0
    arrayChannelIdZeroPad?: number,                 // Array item id get a padding for the number
    arrayChannelIdFromProperty?: string,            // Array item id is taken from a property in the corresponding tree
    arrayChannelNamePrefix?: string,                // Array item common.name get a prefix e.g. myPrefix_0
    arrayChannelNameFromProperty?: string,          // Array item common.name is taken from a property in the corresponding tree
    array: { [key: string]: myCommonState; },
}

export enum WebSocketEventMessages {
    client = 'client:sync',
    device = 'device:sync',
    user = 'user:sync',
    events = 'events',
    speedTest = 'speed-test:update'
}

export enum WebSocketEventKeys {
    clientConnected = 'EVT_WU_Connected',
    clientDisconnected = 'EVT_WU_Disconnected',
    clientRoamed = 'EVT_WU_Roam',
    clientRoamedRadio = 'EVT_WU_RoamRadio',

    guestConnected = 'EVT_WG_Connected',
    guestDisconnected = 'EVT_WG_Disconnected',
    guestRoamed = 'EVT_WG_Roam',
    guestRoamedRadio = 'EVT_WG_RoamRadio',

    clientOrGuestBlocked = 'EVT_WC_Blocked',
    clientOrGuestUnblocked = 'EVT_WC_Unblocked',


    gatewayRestarted = 'EVT_GW_Restarted',


    switchRestarted = 'EVT_SW_Restarted',
    switchAutoReadopted = 'EVT_SW_AutoReadopted',
    switchLostContact = 'EVT_SW_Lost_Contact',


    accessPointRestarted = 'EVT_AP_Restarted',

}

export interface myCache {
    devices: { [key: string]: NetworkDevice; },
    clients: { [key: string]: NetworkClient; },
    vpn: { [key: string]: NetworkClient; }
}

export interface myImgCache {
    [key: string]: string[]
}