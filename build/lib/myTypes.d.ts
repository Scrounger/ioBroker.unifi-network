import type { NetworkClient } from "./api/network-types-client.js";
import type { NetworkDevice, NetworkDevicePortTable, NetworkDeviceRadioTable, NetworkDeviceRadioTableStat, NetworkDeviceStorage, NetworkDeviceSystemStats, NetworkDeviceVapTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from "./api/network-types-device.js";
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { Firewall, FirewallGroup } from "./api/network-types-firewall.js";
import { NetworkSysInfo } from "./api/network-types-sysinfo.js";
export type myTreeData = NetworkDevice | NetworkDevicePortTable | NetworkDeviceRadioTable | NetworkDeviceRadioTableStat | NetworkDeviceVapTable | NetworkDeviceStorage | NetworkDeviceWan | NetworkDeviceWanUptimeStats | NetworkDeviceSystemStats | NetworkClient | myNetworkClient | ConnectedClients | NetworkLanConfig | NetworkWlanConfig | Firewall | FirewallGroup | NetworkSysInfo;
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
        PoeOverload: string[];
        WANTransition: string[];
        Upgrade: string[];
        Adopt: string[];
        DhcpPool: string[];
        Alert: string[];
        STP: string[];
        Deleted: string[];
        RougeDetected: string[];
        Authorization: string[];
    };
    client: {
        Connected: string[];
        Disconnected: string[];
        Roamed: string[];
        RoamedRadio: string[];
        Blocked: string[];
        Unblocked: string[];
        Authorization: string[];
    };
};
export interface myCache {
    devices: {
        [key: string]: NetworkDevice;
    };
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
    firewall: {
        groups: {
            [key: string]: FirewallGroup;
        };
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
