import { NetworkClient, NetworkClientFingerprint } from "./api/network-types-client";
import { NetworkDevice } from "./api/network-types-device";
import { NetworkDeviceModels } from './api/network-types-device-models';
import { NetworkWlanConfig } from "./api/network-types-wlan-config";
import { NetworkLanConfig } from "./api/network-types-lan-config";
import { FirewallGroup } from "./api/network-types-firewall-group";
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
    readVal?(val: ioBroker.StateValue | NetworkClientFingerprint, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient, id: string): ioBroker.StateValue | Promise<ioBroker.StateValue>;
    writeVal?(val: ioBroker.StateValue, adapter: ioBroker.Adapter, cache: myCache): ioBroker.StateValue | Promise<ioBroker.StateValue>;
    valFromProperty?: string;
    statesFromProperty?: string;
    conditionToCreateState?(objDevice: any, adapter: ioBroker.Adapter): boolean;
    subscribeMe?: true;
    required?: true;
}
export interface myCommoneChannelObject {
    idChannel?: string;
    channelName?(objDevice: NetworkDevice | myNetworkClient, objChannel: any, adapter: ioBroker.Adapter): string;
    icon?: string;
    object: {
        [key: string]: myCommonState | myCommoneChannelObject;
    };
}
export interface myCommonChannelArray {
    idChannel?: string;
    channelName?(objDevice: NetworkDevice | myNetworkClient, objChannel: any, adapter: ioBroker.Adapter): string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?(objDevice: any, i: number, adapter: ioBroker.Adapter): string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objDevice: any, adapter: ioBroker.Adapter): string;
    arrayStartNumber?: number;
    array: {
        [key: string]: myCommonState;
    };
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
export declare enum WebSocketEventMessages {
    client = "client",
    device = "device:sync",
    user = "user:",
    events = "events",
    speedTest = "speed-test:update",
    wlanConf = "wlanconf:",
    lanConf = "networkconf",
    firewallGroup = "firewallgroup:"
}
export declare const WebSocketEvent: {
    device: {
        Connected: string[];
        Disconnected: string[];
        Restarted: string[];
        ChannelChanged: string[];
        LostContact: string[];
        PoeDisconnect: string[];
        WANTransition: string[];
        Upgrade: string[];
        Adopt: string[];
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
    deviceModels: NetworkDeviceModels[];
    clients: {
        [key: string]: myNetworkClient;
    };
    vpn: {
        [key: string]: myNetworkClient;
    };
    wlan: {
        [key: string]: NetworkWlanConfig;
    };
    lan: {
        [key: string]: NetworkLanConfig;
    };
    isOnline: {
        [key: string]: myIsOnline;
    };
    firewallGroup: {
        [key: string]: FirewallGroup;
    };
}
export interface myImgCache {
    [key: string]: string[];
}
export interface myIsOnline {
    val: boolean;
    wlan_id?: string | undefined;
    network_id?: string | undefined;
}
export interface JsonConfigAutocompleteSendTo {
    value: string;
    label: string;
}
