import type { NetworkClient } from "./api/network-types-client.js";
import type { NetworkDevice, NetworkDevicePortTable, NetworkDeviceRadioTable, NetworkDeviceRadioTableStat, NetworkDeviceStorage, NetworkDeviceVapTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from "./api/network-types-device.js";
import type { NetworkDeviceModels } from './api/network-types-device-models.js';
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { FirewallGroup } from "./api/network-types-firewall-group.js";
export type myTreeData = NetworkDevice | NetworkDevicePortTable | NetworkDeviceRadioTable | NetworkDeviceRadioTableStat | NetworkDeviceVapTable | NetworkDeviceStorage | NetworkDeviceWan | NetworkDeviceWanUptimeStats | NetworkClient | myNetworkClient | ConnectedClients | NetworkLanConfig | NetworkWlanConfig | FirewallGroup;
type ReadValFunction = (val: any, adapter: ioBroker.Adapter | ioBroker.myAdapter, device: myTreeData, id: string) => ioBroker.StateValue | Promise<ioBroker.StateValue>;
export type WriteValFunction = (val: ioBroker.StateValue, id?: string, device?: myTreeData, adapter?: ioBroker.Adapter | ioBroker.myAdapter) => any | Promise<any>;
type ConditionToCreateStateFunction = (objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => boolean;
export type myTreeDefinition = myTreeState | myTreeObject | myTreeArray;
export interface myTreeState {
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
    states?: Record<string, string> | string[] | string;
    expert?: true;
    icon?: string;
    def?: ioBroker.StateValue;
    desc?: string;
    readVal?: ReadValFunction;
    writeVal?: WriteValFunction;
    valFromProperty?: string;
    statesFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): Record<string, string> | string[] | string;
    conditionToCreateState?: ConditionToCreateStateFunction;
    subscribeMe?: true;
    required?: true;
}
export interface myTreeObject {
    idChannel?: string;
    name?: string | ((objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter) => string);
    icon?: string;
    object: {
        [key: string]: myTreeDefinition;
    };
    conditionToCreateState?: ConditionToCreateStateFunction;
}
export interface myTreeArray {
    idChannel?: string;
    name?: string;
    icon?: string;
    arrayChannelIdPrefix?: string;
    arrayChannelIdZeroPad?: number;
    arrayChannelIdFromProperty?(objDevice: myTreeData, objChannel: myTreeData, i: number, adapter: ioBroker.Adapter | ioBroker.myAdapter): string;
    arrayChannelNamePrefix?: string;
    arrayChannelNameFromProperty?(objDevice: myTreeData, objChannel: myTreeData, adapter: ioBroker.Adapter | ioBroker.myAdapter): string;
    arrayStartNumber?: number;
    array: {
        [key: string]: myTreeDefinition;
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
export {};
