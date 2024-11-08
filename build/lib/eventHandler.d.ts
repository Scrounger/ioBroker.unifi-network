import { NetworkEventMeta } from "./api/network-types.js";
import { myCache } from "./myTypes.js";
export declare const eventHandler: {
    device: {};
    client: {
        connection(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        }, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamed(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        }, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        roamedRadio(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        }, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
        block(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        }, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
    user: {
        clientRemoved(meta: NetworkEventMeta, data: {
            [key: string]: boolean | number | object | string;
        }, adapter: ioBroker.Adapter, cache: myCache): Promise<void>;
    };
};
