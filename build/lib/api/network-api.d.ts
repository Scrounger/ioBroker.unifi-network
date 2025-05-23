import { RequestOptions, Response } from '@adobe/fetch';
import { EventEmitter } from 'node:events';
import { NetworkLogging } from './network-logging.js';
import { NetworkDevice, NetworkDevice_V2 } from './network-types-device.js';
import { NetworkDeviceModels } from './network-types-device-models.js';
import { NetworkClient } from './network-types-client.js';
import { NetworkWlanConfig, NetworkWlanConfig_V2 } from './network-types-wlan-config.js';
import { NetworkLanConfig_V2 } from './network-types-lan-config.js';
import { NetworkReportInterval, NetworkReportStats, NetworkReportType } from './network-types-report-stats.js';
import { SystemLogType } from './network-types-system-log.js';
import { FirewallGroup } from './network-types-firewall-group.js';
export declare class NetworkApi extends EventEmitter {
    private logPrefix;
    private apiErrorCount;
    private apiLastSuccess;
    private fetch;
    private headers;
    log: NetworkLogging;
    private host;
    private port;
    isUnifiOs: boolean;
    site: string;
    private password;
    private username;
    private _eventsWs;
    constructor(host: string, port: number, isUnifiOs: boolean, site: string, username: string, password: string, log?: NetworkLogging);
    login(): Promise<boolean>;
    private loginController;
    /**
     * Clear the login credentials and terminate any open connection to the UniFi Network API.
     *
     * @category Authentication
     */
    logout(): void;
    /**
     * Terminate any open connection to the UniFi Network API.
     *
     * @category Utilities
     */
    reset(): void;
    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     *
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     *
     * @remarks This method should be used when direct access to the Network controller is needed, or when this library doesn't have a needed method to access
     *   controller capabilities. `options` must be a
     *   [Fetch API compatible](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) request options object.
     *
     * @category API Access
     */
    retrieve(url: string, options?: RequestOptions): Promise<Response | null>;
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    retrievData(url: string, options?: RequestOptions, retry?: boolean): Promise<any | undefined>;
    private _retrieve;
    sendData(cmd: string, payload: any, method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'PATCH'): Promise<Response>;
    /**
     * Detailed list of all devices on site
     * @param mac optional: mac address to receive only the data for this device
     * @returns
     */
    getDevices(mac?: string | undefined): Promise<NetworkDevice[] | undefined>;
    /**
     * API V2 - Detailed list of all devices on site
     * @param mac optional: mac address to receive only the data for this device
     * @returns
     */
    getDevices_V2(separateUnmanaged?: boolean, includeTrafficUsage?: boolean): Promise<NetworkDevice_V2 | undefined>;
    /**
     * List of all active (connected) clients
     * @returns
     */
    getClientsActive(): Promise<NetworkClient[] | undefined>;
    /**
     *  V2 API - List of all active (connected) clients
     * @returns
     */
    getClientsActive_V2(mac?: string, includeTrafficUsage?: boolean, includeUnifiDevices?: boolean): Promise<NetworkClient[] | NetworkClient | undefined>;
    /**
     * List of all configured / known clients on the site
     * @returns
     */
    getClients(): Promise<NetworkClient[] | undefined>;
    /**
     *  V2 API - List of all disconnected clients
     * @returns
     */
    getClientsHistory_V2(withinHour?: number, includeUnifiDevices?: boolean): Promise<NetworkClient[] | undefined>;
    /**
     * List all WLan configurations
     * @param wlan_id optional: wlan id to receive only the configuration for this wlan
     * @returns
     */
    getWlanConfig(wlan_id?: any): Promise<NetworkWlanConfig[] | undefined>;
    /**
     * API V2 - List all WLan configurations
     * @returns
     */
    getWlanConfig_V2(): Promise<NetworkWlanConfig_V2[] | undefined>;
    /**
     * List all LAN configurations
     * @param network_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    getLanConfig(network_id?: any): Promise<NetworkWlanConfig[] | undefined>;
    /**
     * API V2 - List all Lan configurations
     * @returns
     */
    getLanConfig_V2(): Promise<NetworkLanConfig_V2[] | undefined>;
    /**
      * API V2 - List model information for devices
      * @returns
      */
    getDeviceModels_V2(model?: string): Promise<NetworkDeviceModels[] | NetworkDeviceModels | undefined>;
    /**
     * List all LAN configurations
     * @param firewallGroup_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    getFirewallGroup(firewallGroup_id?: any): Promise<FirewallGroup[] | undefined>;
    testConnection(): Promise<boolean>;
    /**
     * get statistics for site, gateway, switches or access points
     * @param type report type @see reportType
     * @param interval report interval @see reportInterval
     * @param attrs filter by attributes @see NetworkReportStats
     * @param mac filter by mac
     * @param start repot start timestamp
     * @param end report end timestamp
     * @returns
     */
    getReportStats(type: NetworkReportType, interval: NetworkReportInterval, attrs?: (keyof NetworkReportStats)[] | 'ALL', mac?: string, start?: number, end?: number): Promise<NetworkReportStats[] | undefined>;
    getSystemLog(type: SystemLogType, page_number?: number, pages_size?: number, start?: number, end?: number, macs?: string[]): Promise<any>;
    getApiEndpoint(endpoint: ApiEndpoints): string;
    getApiEndpoint_V2(endpoint: ApiEndpoints_V2): string;
    launchEventsWs(): Promise<boolean>;
    wsSendPing(): void;
}
export declare enum ApiEndpoints {
    login = "login",
    self = "self",
    devices = "devices",
    clients = "clients",
    clientsActive = "clientsActive",
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
    models = "models"
}
