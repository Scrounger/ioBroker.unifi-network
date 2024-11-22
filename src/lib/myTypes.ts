import { NetworkClient, NetworkClientFingerprint } from "./api/network-types-client";
import { NetworkDevice } from "./api/network-types-device";
import { NetworkDeviceModels } from './api/network-types-device-models'
import { NetworkWlanConfig } from "./api/network-types-wlan-config";
import { NetworkLanConfig } from "./api/network-types-lan-config";

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

    readVal?(val: ioBroker.StateValue | NetworkClientFingerprint, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue | Promise<ioBroker.StateValue>,
    writeVal?(val: ioBroker.StateValue, adapter: ioBroker.Adapter, cache: myCache): ioBroker.StateValue | Promise<ioBroker.StateValue>,

    valFromProperty?: string                                        // Take value from other property in the corresponding tree. If this property is an object, @link ./helper.ts [getAllKeysOfTreeDefinition] must added manual if they should be regoniczed
    statesFromProperty?: string                                     // ToDo: perhaps can be removed

    conditionToCreateState?(objValues: any, adapter: ioBroker.Adapter): boolean     // condition to create state

    subscribeMe?: true                                              // subscribe
    required?: true                                                 // required, can not be blacklisted
}

export interface myCommoneChannelObject {
    idChannel?: string;
    channelName?: string;
    icon?: string;
    object: { [key: string]: myCommonState; };
}

export interface myCommonChannelArray {
    idChannel?: string;
    channelName?: string,
    icon?: string,
    arrayChannelIdPrefix?: string,                                                                  // Array item id get a prefix e.g. myPrefix_0
    arrayChannelIdZeroPad?: number,                                                                 // Array item id get a padding for the number
    arrayChannelIdFromProperty?(objValues: any, i: number, adapter: ioBroker.Adapter): string,      // Array item id is taken from a property in the corresponding tree
    arrayChannelNamePrefix?: string,                                                                // Array item common.name get a prefix e.g. myPrefix_0
    arrayChannelNameFromProperty?(objValues: any, adapter: ioBroker.Adapter): string,               // Array item common.name is taken from a property in the corresponding tree
    arrayStartNumber?: number,                                                                      // Array custom start number of array
    array: { [key: string]: myCommonState; },
}

export interface myNetworkClient extends NetworkClient {
    isOnline: boolean;
    timestamp: number;
}

export interface ConnectedClients {
    connected_clients: number;
    connected_guests: number;
    name: string;
}

export enum WebSocketEventMessages {
    client = 'client',
    device = 'device:sync',
    user = 'user:',
    events = 'events',
    speedTest = 'speed-test:update',
    wlanConf = 'wlanconf:',
    lanConf = 'networkconf'
}

export const WebSocketEvent_Connected = ['EVT_WU_Connected', 'EVT_WG_Connected', 'EVT_LU_Connected', 'EVT_LG_Connected'];
export const WebSocketEvent_Disconnected = ['EVT_WU_Disconnected', 'EVT_WG_Disconnected', 'EVT_LU_Disconnected', 'EVT_LG_Disconnected'];

export const WebSocketEvent = {
    device: {
        Connected: ['EVT_SW_Connected', 'EVT_AP_Connected', 'EVT_GW_Connected'],
        Disconnected: ['EVT_SW_Disconnected', 'EVT_AP_Disconnected', 'EVT_GW_Disconnected'],
        Restarted: ['EVT_SW_Restarted', 'EVT_AP_Restarted', 'EVT_GW_Restarted'],
    },
    client: {
        Connected: ['EVT_WU_Connected', 'EVT_WG_Connected', 'EVT_LU_Connected', 'EVT_LG_Connected'],
        Disconnected: ['EVT_WU_Disconnected', 'EVT_WG_Disconnected', 'EVT_LU_Disconnected', 'EVT_LG_Disconnected'],
        Roamed: ['EVT_WU_Roam', 'EVT_WG_Roam'],
        RoamedRadio: ['EVT_WU_RoamRadio', 'EVT_WG_RoamRadio'],
        Blocked: ['EVT_WC_Blocked', 'EVT_LC_Blocked'],
        Unblocked: ['EVT_WC_Unblocked', 'EVT_LC_Unblocked'],
    },
}

// export enum WebSocketEventKeys {
//     connected = '_Connected',
//     disconnected = '_Disconnected',
//     blocked = '_Blocked',
//     unblocked = '_Unblocked',
//     roamed = '_Roam',
//     roamedRadio = '_RoamRadio',
//     restarted = '_Restarted',

//     // client Wireless
//     clientWirelessConnected = 'EVT_WU_Connected',
//     clientWirelessDisconnected = 'EVT_WU_Disconnected',
//     clientWirelessRoamed = 'EVT_WU_Roam',
//     clientWirelessRoamedRadio = 'EVT_WU_RoamRadio',

//     // client LAN
//     clientLanConnected = 'EVT_LU_Connected',
//     clientLanDisconnected = 'EVT_LU_Disconnected',
//     clientLanBlocked = 'EVT_LU_Blocked',
//     clientLanUnblocked = 'EVT_LU_Unblocked',

//     // guest Wireless
//     guestWirelessConnected = 'EVT_WG_Connected',
//     guestWirelessDisconnected = 'EVT_WG_Disconnected',
//     guestWirelessRoamed = 'EVT_WG_Roam',
//     guestWirelessRoamedRadio = 'EVT_WG_RoamRadio',

//     // guest LAN
//     guestLanConnected = 'EVT_LG_Connected',
//     guestLanDisconnected = 'EVT_LG_Disconnected',
//     guestLanBlocked = 'EVT_LG_Blocked',
//     guestLanUnblocked = 'EVT_LG_Unblocked',

//     // client or guest Wireless
//     clientOrGuestWirelessBlocked = 'EVT_WC_Blocked',
//     clientOrGuestWirelessUnblocked = 'EVT_WC_Unblocked',

//     // Gateway
//     gatewayRestarted = 'EVT_GW_Restarted',

//     // Switch
//     switchRestarted = 'EVT_SW_Restarted',
//     switchAutoReadopted = 'EVT_SW_AutoReadopted',
//     switchLostContact = 'EVT_SW_Lost_Contact',


//     accessPointRestarted = 'EVT_AP_Restarted',

// }

export interface myCache {
    devices: { [key: string]: NetworkDevice; },
    deviceModels: NetworkDeviceModels[],
    clients: { [key: string]: myNetworkClient; },
    vpn: { [key: string]: myNetworkClient; }
    wlan: { [key: string]: NetworkWlanConfig; },
    lan: { [key: string]: NetworkLanConfig; }
    isOnline: { [key: string]: myIsOnline; }
}

export interface myImgCache {
    [key: string]: string[]
}

export interface myIsOnline {
    val: boolean;
    wlan_id?: string | undefined;
    network_id?: string | undefined;
}

export interface JsonConfigAutocompleteSendTo {
    value: string,
    label: string
}