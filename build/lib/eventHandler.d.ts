import type { NetworkEventMeta, NetworkEventData, NetworkEventSpeedTest } from "./api/network-types.js";
import { type myCache, type myNetworkClient } from "./myTypes.js";
import type { NetworkWlanConfig } from "./api/network-types-wlan-config.js";
import type { NetworkLanConfig } from "./api/network-types-lan-config.js";
import type { FirewallGroup } from "./api/network-types-firewall.js";
export declare const disconnectDebounceList: {
    [mac: string]: {
        lc: number;
        timeout: ioBroker.Timeout;
    };
};
export declare const eventHandler: {
    device: {
        restarted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        deleted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        speedTest(event: NetworkEventSpeedTest, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        lostContact(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        wanTransition(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    client: {
        connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamed(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamedRadio(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        block(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        vpnDisconnect(meta: NetworkEventMeta, data: myNetworkClient, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    user: {
        clientRemoved(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        } | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    wlanConf: {
        deleted(meta: NetworkEventMeta, data: NetworkWlanConfig[] | any, adapter: ioBroker.myAdapter, cache: myCache): Promise<void>;
    };
    lanConf: {
        deleted(meta: NetworkEventMeta, data: NetworkLanConfig[] | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    firewall: {
        group: {
            deleted(meta: NetworkEventMeta, data: FirewallGroup[] | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        };
    };
};
