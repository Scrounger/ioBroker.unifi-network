import type { NetworkClient } from "./api/network-types-client.js";
import type { NetworkDevice, NetworkDevicePortTable, NetworkDeviceRadioTable, NetworkDeviceRadioTableStat, NetworkDeviceStorage, NetworkDeviceSystemStats, NetworkDeviceVapTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from "./api/network-types-device.js";
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { Firewall, FirewallGroup } from "./api/network-types-firewall.js";

export type myTreeData =
    NetworkDevice | NetworkDevicePortTable | NetworkDeviceRadioTable | NetworkDeviceRadioTableStat | NetworkDeviceVapTable | NetworkDeviceStorage | NetworkDeviceWan | NetworkDeviceWanUptimeStats | NetworkDeviceSystemStats |
    NetworkClient | myNetworkClient | ConnectedClients |
    NetworkLanConfig |
    NetworkWlanConfig |
    Firewall | FirewallGroup;

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
    // defined in web-socket-manager.xxxxxxx.js
    device: {
        Connected: ['EVT_AP_Connected', 'EVT_BB_Connected', 'EVT_GW_Connected', 'EVT_LG_Connected', 'EVT_SW_Connected', 'EVT_XG_Connected'],
        Disconnected: ['EVT_AP_Disconnected', 'EVT_BB_Disconnected', 'EVT_GW_Disconnected', 'EVT_SW_Disconnected', 'EVT_XG_Disconnected'],
        Restarted: ['EVT_AP_Restarted', 'EVT_BB_Restarted', 'EVT_GW_Restarted', 'EVT_SW_Restarted', 'EVT_XG_Restarted', 'EVT_AP_RestartedUnknown', 'EVT_BB_RestartedUnknown', 'EVT_GW_RestartedUnknown', 'EVT_SW_RestartedUnknown', 'EVT_XG_RestartedUnknown'],
        ChannelChanged: ['EVT_AP_ChannelChanged', 'EVT_BB_ChannelChanged'],
        LostContact: ['EVT_AP_Lost_Contact', 'EVT_BB_Lost_Contact', 'EVT_DEV_Lost_Contact', 'EVT_GW_Lost_Contact', 'EVT_SW_Lost_Contact', 'EVT_XG_Lost_Contact'],
        PoeDisconnect: ['EVT_SW_PoeDisconnect'],
        WANTransition: ['EVT_GW_WANTransition'],
        Upgrade: ['EVT_AP_Upgraded', 'EVT_BB_Upgraded', 'EVT_GW_Upgraded', 'EVT_SW_Upgraded', 'EVT_AP_UpgradeScheduled', 'EVT_BB_UpgradeScheduled', 'EVT_GW_UpgradeScheduled', 'EVT_SW_UpgradeScheduled', 'EVT_XG_UpgradeScheduled',],
        Adopt: ['EVT_AP_Adopted', 'EVT_BB_Adopted', 'EVT_GW_Adopted', 'EVT_LTE_Adopted', 'EVT_SW_Adopted', 'EVT_XG_Adopted', 'EVT_AP_AutoReadopted', 'EVT_BB_AutoReadopted', 'EVT_GW_AutoReadopted', 'EVT_LTE_AutoReadopted', 'EVT_SW_AutoReadopted', 'EVT_XG_AutoReadopted'],
        DhcpPool: ['EVT_GW_DhcpPoolExhausted', 'EVT_GW_DhcpPoolNearExhausted'],
        Alert: ['EVT_IPS_IpsAlert'],
        STP: ['EVT_SW_StpPortBlocking'],
        Deleted: ['EVT_AP_Deleted', 'EVT_BB_Deleted', 'EVT_GW_Deleted', 'EVT_LTE_Deleted', 'EVT_SW_Deleted', 'EVT_XG_Deleted'],
        RougeDetected: ['EVT_AP_DetectRogueAP', 'EVT_SW_DetectRogueDHCP'],
        Authorization: ['EVT_HS_AuthedByNoAuth', 'EVT_HS_AuthedByPassword'],
    },
    client: {
        Connected: ['EVT_LG_Connected', 'EVT_LU_Connected', 'EVT_WG_Connected', 'EVT_WU_Connected'],
        Disconnected: ['EVT_LG_Disconnected', 'EVT_LU_Disconnected', 'EVT_WG_Disconnected', 'EVT_WU_Disconnected'],
        Roamed: ['EVT_WU_Roam', 'EVT_WG_Roam'],
        RoamedRadio: ['EVT_WU_RoamRadio', 'EVT_WG_RoamRadio'],
        Blocked: ['EVT_LC_Blocked', 'EVT_WC_Blocked'],
        Unblocked: ['EVT_LC_Unblocked', 'EVT_WC_Unblocked'],
        Authorization: ['EVT_WG_AuthorizationEnded', 'EVT_WG_AuthorizationEndedByQuota'],
    },
}

export interface myCache {
    devices: { [key: string]: NetworkDevice; },
    clients: { [key: string]: myNetworkClient; },
    vpn: { [key: string]: myNetworkClient; }
    wlan: { [key: string]: NetworkWlanConfig; },
    lan: { [key: string]: NetworkLanConfig; }
    isOnline: { [key: string]: myIsOnline; }
    firewall: {
        groups: { [key: string]: FirewallGroup };
    }
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