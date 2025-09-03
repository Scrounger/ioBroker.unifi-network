import { type Dispatcher } from "undici";
import { EventEmitter } from 'node:events';
import type { NetworkLogging } from './network-logging.js';
import type { NetworkDevice, NetworkDevice_V2 } from './network-types-device.js';
import type { NetworkDeviceModels } from './network-types-device-models.js';
import type { NetworkClient } from './network-types-client.js';
import type { NetworkWlanConfig, NetworkWlanConfig_V2 } from './network-types-wlan-config.js';
import type { NetworkLanConfig_V2 } from './network-types-lan-config.js';
import { NetworkReportInterval, type NetworkReportStats, type NetworkReportType } from './network-types-report-stats.js';
import { SystemLogType } from './network-types-system-log.js';
import type { FirewallGroup } from './network-types-firewall-group.js';
import { NetworkCommands } from "./network-commands.js";
export type Nullable<T> = T | null;
/**
 * Configuration options for HTTP requests executed by `retrieve()`.
 */
export type RequestOptions = {
    /**
     * Optional custom Undici `Dispatcher` instance to use for this request. If omitted, the native `unifi-network` dispatcher is used, which should be suitable for most
     * use cases.
     */
    dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions, "origin" | "path">;
/**
 * Options to tailor the behavior
 */
export interface RetrieveOptions {
    timeout?: number;
}
export declare enum ApiEndpoints {
    login = "login",
    self = "self",
    devices = "devices",
    deviceRest = "deviceRest",
    deviceCommand = "deviceCommand",
    clients = "clients",
    clientsActive = "clientsActive",
    clientCommand = "clientCommand",
    wlanConfig = "wlanConfig",
    lanConfig = "lanConfig",
    firewallGroup = "firewallGroup"
}
export declare enum ApiEndpoints_V2 {
    devices = "devices",
    clientsActive = "clientsActive",
    clientsHistory = "clientsHistory",
    wlanConfig = "wlanConfig",
    lanConfig = "lanConfig",
    wanConfig = "wanConfig",
    models = "models",
    'network-members-group' = "network-members-group",
    'network-members-groups' = "network-members-groups"
}
export declare class NetworkApi extends EventEmitter {
    private logPrefix;
    private adapter;
    Commands: NetworkCommands;
    private dispatcher;
    private apiErrorCount;
    private apiLastSuccess;
    private headers;
    log: NetworkLogging;
    private host;
    private port;
    isUnifiOs: boolean;
    site: string;
    private password;
    private username;
    private _eventsWs;
    constructor(host: string, port: number, isUnifiOs: boolean, site: string, username: string, password: string, adapter: ioBroker.Adapter);
    login(): Promise<boolean>;
    private loginController;
    /**
     * Clear the login credentials and terminate any open connection to the UniFi Network API.
     */
    logout(): void;
    /**
     * Terminate any open connection to the UniFi Network API.
     */
    reset(): void;
    private responseOk;
    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     * @param retrieveOptions
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     */
    retrieve(url: string, options?: RequestOptions, retrieveOptions?: RetrieveOptions): Promise<Nullable<Dispatcher.ResponseData<unknown>>>;
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     *
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    retrievData(url: string, options?: RequestOptions, retry?: boolean): Promise<Record<string, any> | undefined>;
    private _retrieve;
    sendData(cmd: string, payload: any, method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'PATCH'): Promise<Nullable<Dispatcher.ResponseData<unknown>>>;
    /**
     * Detailed list of all devices on site
     *
     * @param mac optional: mac address to receive only the data for this device
     * @returns
     */
    getDevices(mac?: string | undefined): Promise<NetworkDevice[] | undefined>;
    /**
     * API V2 - Detailed list of all devices on site
     *
     * @param separateUnmanaged
     * @param includeTrafficUsage
     * @returns
     */
    getDevices_V2(separateUnmanaged?: boolean, includeTrafficUsage?: boolean): Promise<NetworkDevice_V2 | undefined>;
    /**
     * List of all active (connected) clients
     *
     * @returns
     */
    getClientsActive(): Promise<NetworkClient[] | undefined>;
    /**
     *  V2 API - List of all active (connected) clients
     *
     * @param mac
     * @param includeTrafficUsage
     * @param includeUnifiDevices
     * @returns
     */
    getClientsActive_V2(mac?: string, includeTrafficUsage?: boolean, includeUnifiDevices?: boolean): Promise<NetworkClient[] | undefined>;
    /**
     * List of all configured / known clients on the site
     *
     * @returns
     */
    getClients(): Promise<NetworkClient[] | undefined>;
    /**
     *  V2 API - List of all disconnected clients
     *
     * @param withinHour
     * @param includeUnifiDevices
     * @returns
     */
    getClientsHistory_V2(withinHour?: number, includeUnifiDevices?: boolean): Promise<NetworkClient[] | undefined>;
    /**
     * List all WLan configurations
     *
     * @param wlan_id optional: wlan id to receive only the configuration for this wlan
     * @returns
     */
    getWlanConfig(wlan_id?: any): Promise<NetworkWlanConfig[] | undefined>;
    /**
     * API V2 - List all WLan configurations
     *
     * @returns
     */
    getWlanConfig_V2(): Promise<NetworkWlanConfig_V2[] | undefined>;
    /**
     * List all LAN configurations
     *
     * @param network_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    getLanConfig(network_id?: any): Promise<NetworkWlanConfig[] | undefined>;
    /**
     * API V2 - List all Lan configurations
     *
     * @returns
     */
    getLanConfig_V2(): Promise<NetworkLanConfig_V2[] | undefined>;
    /**
     * API V2 - List model information for devices
     *
     * @param model
     * @returns
     */
    getDeviceModels_V2(model?: string): Promise<NetworkDeviceModels[] | NetworkDeviceModels | undefined>;
    /**
     * List all LAN configurations
     *
     * @param firewallGroup_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    getFirewallGroup(firewallGroup_id?: any): Promise<FirewallGroup[] | undefined>;
    /**
     * get statistics for site, gateway, switches or access points
     *
     * @param type report type @see reportType
     * @param interval report interval @see reportInterval
     * @param attrs filter by attributes @see NetworkReportStats
     * @param mac filter by mac
     * @param start repot start timestamp
     * @param end report end timestamp
     * @returns
     */
    getReportStats(type: NetworkReportType, interval: NetworkReportInterval, attrs?: (keyof NetworkReportStats)[] | 'ALL', mac?: string, start?: number, end?: number): Promise<NetworkReportStats[] | undefined>;
    getSystemLog(type: SystemLogType, page_number?: number, pages_size?: number, start?: number, end?: number, macs?: string[]): Promise<Record<string, any>>;
    getApiEndpoint(endpoint: ApiEndpoints): string;
    getApiEndpoint_V2(endpoint: ApiEndpoints_V2): string;
    launchEventsWs(): Promise<boolean>;
    wsSendPing(): void;
}
