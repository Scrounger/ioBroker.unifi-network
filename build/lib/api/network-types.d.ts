import { NetworkDevice } from "./network-types-device.js";
export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: NetworkDevice[];
}
export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line?: string;
}
