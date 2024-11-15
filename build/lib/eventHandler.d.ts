import { NetworkEventMeta, NetworkEventData } from "./api/network-types.js";
import { myCache } from "./myTypes.js";
import { NetworkClient } from "./api/network-types-client.js";
export declare const eventHandler: {
    device: {
        restarted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    client: {
        connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamed(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamedRadio(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        block(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        vpnDisconnect(meta: NetworkEventMeta, data: NetworkClient, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    user: {
        clientRemoved(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        } | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
};
