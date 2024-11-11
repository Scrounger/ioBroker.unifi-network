import { NetworkEventMeta, NetworkEventData } from "./api/network-types.js";
import { myCache } from "./myTypes.js";
export declare const eventHandler: {
    device: {
        restarted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    client: {
        connection(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamed(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamedRadio(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        block(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    user: {
        clientRemoved(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        } | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
};
