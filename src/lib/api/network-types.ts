import { NetworkClient } from "./network-types-client.js";
import { NetworkDevice } from "./network-types-device.js";

export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: NetworkDevice[] | NetworkClient[] | Array<{ [key: string]: boolean | number | object | string }>;
}

export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line?: string;
}