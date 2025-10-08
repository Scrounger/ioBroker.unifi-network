import type { NetworkClient } from "./network-types-client.js";
import type { NetworkDevice } from "./network-types-device.js";
import type { FirewallGroup } from "./network-types-firewall.js";
import type { NetworkLanConfig } from "./network-types-lan-config.js";
import type { NetworkWlanConfig } from "./network-types-wlan-config.js";
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
export interface NetworkEventWlanConfig {
    meta: NetworkEventMeta;
    data: NetworkWlanConfig[];
}
export interface NetworkEventLanConfig {
    meta: NetworkEventMeta;
    data: NetworkLanConfig[];
}
export interface NetworkEventSpeedTest {
    meta: NetworkEventMeta;
    data: NetworkEventSpeedTestData[];
}
export interface NetworkEventFirewallGroup {
    meta: NetworkEventMeta;
    data: FirewallGroup[];
}
export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line?: string;
}
export interface NetworkEventData {
    ap?: string;
    ap_displayName?: string;
    ap_from?: string;
    ap_name?: string;
    ap_to?: string;
    channel?: string;
    channel_from?: string;
    channel_to?: string;
    client?: string;
    datetime: string;
    dm?: string;
    guest?: string;
    gw?: string;
    gw_name?: string;
    gw_displayName?: string;
    iface?: string;
    key: string;
    msg: string;
    port?: number;
    radio_from?: string;
    radio_to?: string;
    ssid?: string;
    state?: string;
    sw?: string;
    sw_name?: string;
    sw_displayName?: string;
    subsystem: string;
    time: number;
    user?: string;
}
export interface NetworkEventSpeedTestData {
    latency: number;
    rundate: number;
    runtime: number;
    source_interface: string;
    status_download: number;
    status_ping: number;
    status_summary: number;
    status_upload: number;
    xput_download: number;
    xput_upload: number;
    timestamp: number;
    interface_name: string;
    "upload-progress"?: {
        id: number;
        records: any[];
    }[];
    "download-progress"?: {
        id: number;
        records: any[];
    }[];
}
