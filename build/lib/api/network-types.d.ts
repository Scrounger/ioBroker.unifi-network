import { NetworkClient } from "./network-types-client.js";
import { NetworkDevice } from "./network-types-device.js";
export interface NetworkEventDevice {
    meta: NetworkEventMeta;
    data: NetworkDevice[];
}
export interface NetworkEventClient {
    meta: NetworkEventMeta;
    data: NetworkClient[];
}
export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: NetworkEventData[];
}
export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line?: string;
}
export interface NetworkEventData {
    ap: string;
    ap_displayName?: string;
    ap_from?: string;
    ap_name?: string;
    ap_to?: string;
    channel?: string;
    channel_from?: string;
    channel_to?: string;
    client?: string;
    datetime: string;
    guest?: string;
    key: string;
    msg: string;
    port?: number;
    ssid?: string;
    sw?: string;
    sw_name?: string;
    sw_displayName?: string;
    subsystem: string;
    time: number;
    user?: string;
}
