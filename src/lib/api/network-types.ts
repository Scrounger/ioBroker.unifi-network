import { NetworkClient } from "./network-types-client.js";
import { NetworkDevice } from "./network-types-device.js";


export interface NetworkEventDevice {
    meta: NetworkEventMeta;
    // data: Array<{ [key: string]: boolean | number | object | string }>;
    data: NetworkDevice[];
}

export interface NetworkEventClient {
    meta: NetworkEventMeta;
    data: NetworkClient[];
}

export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: Array<{ [key: string]: boolean | number | object | string }>;
}

export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line?: string;
}