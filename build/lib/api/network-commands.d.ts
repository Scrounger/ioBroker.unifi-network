import { type NetworkApi } from "./network-api.js";
import type { NetworkDevice } from "./network-types-device.js";
import type { NetworkClient } from "./network-types-client.js";
import type { NetworkWlanConfig } from "./network-types-wlan-config.js";
import type { NetworkLanConfig } from "./network-types-lan-config.js";
import type { FirewallGroup } from "./network-types-firewall-group.js";
export declare class NetworkCommands {
    private ufn;
    private adapter;
    private log;
    private logPrefixCls;
    constructor(ufn: NetworkApi, adapter: ioBroker.myAdapter);
    Devices: {
        runSpeedtest: (device: NetworkDevice, id: string) => Promise<boolean>;
    };
    Clients: {
        block: (client: NetworkClient) => Promise<boolean>;
        unblock: (client: NetworkClient) => Promise<boolean>;
        reconnect: (client: NetworkClient, id: string) => Promise<boolean>;
        authorizeGuest: (client: NetworkClient) => Promise<boolean>;
        unauthorizeGuest: (client: NetworkClient) => Promise<boolean>;
        setName: (client: NetworkClient, name: string) => Promise<boolean>;
    };
    WLanConf: {
        enable: (wlanConf: NetworkWlanConfig, enabled: boolean) => Promise<boolean>;
    };
    LanConf: {
        enable: (lanConf: NetworkLanConfig, enabled: boolean) => Promise<boolean>;
        internet_access_enabled: (lanConf: NetworkLanConfig, enabled: boolean) => Promise<boolean>;
    };
    FirewallGroup: {
        setName: (firewallGroup: FirewallGroup, name: string) => Promise<boolean>;
        setGroupMembers: (firewallGroup: FirewallGroup, members: string) => Promise<boolean>;
    };
    private ackCommand;
    private logCommandSuccess;
}
