import type { NetworkClient } from "./api/network-types-client.js";
import type { NetworkDevice, NetworkDevicePortTable, NetworkDeviceRadioTable, NetworkDeviceRadioTableStat, NetworkDeviceStorage, NetworkDeviceVapTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from "./api/network-types-device.js";
import type { NetworkDeviceModels } from './api/network-types-device-models.js';
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { FirewallGroup } from "./api/network-types-firewall-group.js";
export type myTreeData = NetworkDevice | NetworkDevicePortTable | NetworkDeviceRadioTable | NetworkDeviceRadioTableStat | NetworkDeviceVapTable | NetworkDeviceStorage | NetworkDeviceWan | NetworkDeviceWanUptimeStats | NetworkClient | myNetworkClient | ConnectedClients | NetworkLanConfig | NetworkWlanConfig | FirewallGroup;
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
        DhcpPool: string[];
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
