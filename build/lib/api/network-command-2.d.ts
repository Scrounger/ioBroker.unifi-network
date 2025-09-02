import { NetworkApi } from "./network-api.js";
import { NetworkDevice } from "./network-types-device.js";
import { NetworkClient } from "./network-types-client.js";
import { NetworkWlanConfig } from "./network-types-wlan-config.js";
import { NetworkLanConfig } from "./network-types-lan-config.js";
import { FirewallGroup } from "./network-types-firewall-group.js";
export declare class NetworkCommands {
    private ufn;
    private adapter;
    private log;
    private logPrefixCls;
    constructor(ufn: NetworkApi, adapter: ioBroker.Adapter);
    Devices: {
        restart: (device: NetworkDevice, id: string) => Promise<boolean>;
        ledOverride: (device: NetworkDevice, id: string, val: string) => Promise<boolean>;
        upgrade: (device: NetworkDevice, id: string) => Promise<boolean>;
        disableAccessPoint: (device: NetworkDevice, id: string, disabled: boolean) => Promise<boolean>;
        runSpeedtest: (device: NetworkDevice, id: string) => Promise<boolean>;
        Port: {
            cyclePoePower: (device: NetworkDevice, id: string) => Promise<boolean>;
            switchPoe: (device: NetworkDevice, id: string, val: boolean) => Promise<boolean>;
        };
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
