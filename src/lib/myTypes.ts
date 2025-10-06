import type { NetworkClient } from "./api/network-types-client.js";
import type { NetworkDevice, NetworkDevicePortTable, NetworkDeviceRadioTable, NetworkDeviceRadioTableStat, NetworkDeviceStorage, NetworkDeviceSystemStats, NetworkDeviceVapTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from "./api/network-types-device.js";
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { FirewallGroup } from "./api/network-types-firewall-group.js";

export type myTreeData =
    NetworkDevice | NetworkDevicePortTable | NetworkDeviceRadioTable | NetworkDeviceRadioTableStat | NetworkDeviceVapTable | NetworkDeviceStorage | NetworkDeviceWan | NetworkDeviceWanUptimeStats | NetworkDeviceSystemStats |
    NetworkClient | myNetworkClient | ConnectedClients |
    NetworkLanConfig |
    NetworkWlanConfig |
    FirewallGroup;

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
    lanConf = 'networkconf',
    firewallGroup = 'firewallgroup:'
}

export const WebSocketEvent = {
    device: {
        Connected: ['EVT_SW_Connected', 'EVT_AP_Connected', 'EVT_GW_Connected', 'EVT_DM_Connected'],
        Disconnected: ['EVT_SW_Disconnected', 'EVT_AP_Disconnected', 'EVT_GW_Disconnected', 'EVT_DM_Disconnected'],
        Restarted: ['EVT_SW_Restarted', 'EVT_AP_Restarted', 'EVT_GW_Restarted'],
        ChannelChanged: ['EVT_AP_ChannelChanged'],
        LostContact: ['EVT_SW_Lost_Contact', 'EVT_DM_Lost_Contact', 'EVT_AP_Lost_Contact'],
        PoeDisconnect: ['EVT_SW_PoeDisconnect'],
        WANTransition: ['EVT_GW_WANTransition'],
        Upgrade: ['EVT_SW_UpgradeScheduled', 'EVT_SW_Upgraded'],
        Adopt: ['EVT_AP_AutoReadopted', 'EVT_SW_AutoReadopted', 'EVT_AP_Adopted'],
        DhcpPool: ['EVT_GW_DhcpPoolExhausted'],
        Alert: ['EVT_IPS_IpsAlert'],
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

export interface myCache {
    devices: { [key: string]: NetworkDevice; },
    clients: { [key: string]: myNetworkClient; },
    vpn: { [key: string]: myNetworkClient; }
    wlan: { [key: string]: NetworkWlanConfig; },
    lan: { [key: string]: NetworkLanConfig; }
    isOnline: { [key: string]: myIsOnline; }
    firewallGroup: { [key: string]: FirewallGroup; }
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