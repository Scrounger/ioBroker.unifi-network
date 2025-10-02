// Lib imports
import { type Dispatcher, Pool, errors, interceptors, request } from 'undici';
import { STATUS_CODES } from 'node:http';
import { EventEmitter } from 'node:events';
import util from 'node:util';
import WebSocket from 'ws';

// API imports
import { API_TIMEOUT } from './network-settings.js';
import type { NetworkLogging } from './network-logging.js';
import type { NetworkEvent } from './network-types.js'
import type { NetworkDevice, NetworkDevice_V2 } from './network-types-device.js'
import type { NetworkDeviceModels } from './network-types-device-models.js'
import type { NetworkClient } from './network-types-client.js';
import type { NetworkWlanConfig, NetworkWlanConfig_V2 } from './network-types-wlan-config.js';
import type { NetworkLanConfig_V2 } from './network-types-lan-config.js';
import { NetworkReportInterval, type NetworkReportStats, type NetworkReportType } from './network-types-report-stats.js';
import { SystemLogType } from './network-types-system-log.js';
import type { FirewallGroup } from './network-types-firewall-group.js';

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
} & Omit<Dispatcher.RequestOptions, 'origin' | 'path'>;

/**
 * Options to tailor the behavior
 */
export interface RetrieveOptions {
    timeout?: number;
}

export enum ApiEndpoints {
    login = 'login',
    self = 'self',
    devices = 'devices',
    deviceRest = 'deviceRest',
    deviceCommand = 'deviceCommand',
    clients = 'clients',
    clientsActive = 'clientsActive',
    clientCommand = 'clientCommand',
    wlanConfig = 'wlanConfig',
    lanConfig = 'lanConfig',
    firewallGroup = 'firewallGroup',

}

export enum ApiEndpoints_V2 {
    devices = 'devices',
    clientsActive = 'clientsActive',
    clientsHistory = 'clientsHistory',
    wlanConfig = 'wlanConfig',
    lanConfig = 'lanConfig',
    wanConfig = 'wanConfig',
    models = 'models',
    'network-members-group' = 'network-members-group',
    'network-members-groups' = 'network-members-groups'
}

export class NetworkApi extends EventEmitter {
    private logPrefix: string = 'NetworkApi'

    private adapter: ioBroker.Adapter;

    private dispatcher!: Dispatcher;

    private apiErrorCount: number;
    private apiLastSuccess: number;
    private headers: Record<string, string>;

    public log: NetworkLogging;

    private host: string;
    private port: string;
    isUnifiOs: boolean;
    public site: string;
    private password: string;
    private username: string;

    private _eventsWs: WebSocket | null;

    public connectionTimeout: ioBroker.Timeout | undefined = undefined;

    constructor(host: string, port: number, isUnifiOs: boolean, site: string, username: string, password: string, adapter: ioBroker.myAdapter) {
        // Initialize our parent.
        super();

        this.adapter = adapter;
        this.log = adapter.log;

        this._eventsWs = null;

        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.headers = {};

        this.host = host;
        this.port = isUnifiOs ? '' : `:${port}`;
        this.isUnifiOs = isUnifiOs;
        this.site = site;
        this.username = username;
        this.password = password;
    }

    public async login(): Promise<boolean> {
        const logPrefix = `[${this.logPrefix}.login]`

        try {
            this.logout();

            // Let's attempt to login.
            const loginSuccess = await this.loginController();

            // Publish the result to our listeners
            this.emit('login', loginSuccess);

            // Return the status of our login attempt.
            return loginSuccess;

        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return false;
    }

    private async loginController(): Promise<boolean> {
        const logPrefix = `[${this.logPrefix}.loginController]`

        try {
            // If we're already logged in, we're done.
            if (this.headers.cookie && this.headers['x-csrf-token']) {
                return true;
            }

            // Utility to grab the headers we're interested in a normalized manner.
            const getHeader = (name: string, headers?: Record<string, string | string[] | undefined>): Nullable<string> => {
                const rawHeader = headers?.[name.toLowerCase()];

                if (!rawHeader) {
                    return null;
                }

                // Normalize it to a string:
                return Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
            };

            // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
            if (!this.headers['x-csrf-token'] && this.adapter.config.isUnifiOs) {

                // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Network
                // controller and checking the headers for it.
                const response = await this.retrieve(`https://${this.host}${this.port}`, { method: 'GET' });

                if (this.responseOk(response?.statusCode)) {

                    const csrfToken = getHeader('X-CSRF-Token', response?.headers);

                    // Preserve the CSRF token, if found, for future API calls.
                    if (csrfToken) {

                        this.headers['x-csrf-token'] = csrfToken;
                    }
                }
            }

            // Log us in.
            const response = await this.retrieve(this.getApiEndpoint(ApiEndpoints.login), {
                body: JSON.stringify({ password: this.password, rememberMe: true, token: "", username: this.username }),
                method: "POST"
            });

            // Something went wrong with the login call, possibly a controller reboot or failure.
            if (!this.responseOk(response?.statusCode)) {

                this.logout();

                return false;
            }

            // We're logged in. Let's configure our headers.
            const csrfToken = getHeader('X-Updated-CSRF-Token', response?.headers) ?? getHeader('X-CSRF-Token', response?.headers);
            const cookie = getHeader('Set-Cookie', response?.headers);

            // Save the refreshed cookie and CSRF token for future API calls and we're done.
            if (cookie) {
                // Only preserve the token element of the cookie and not the superfluous information that's been added to it.
                this.headers.cookie = cookie.split(';')[0];

                if (csrfToken) {
                    // Unifi OS: Save the CSRF token.
                    this.headers['x-csrf-token'] = csrfToken;

                    return true;
                } else {
                    // self hosted controller, extract from cookie
                    const selfHostedCookie = response.headers['set-cookie'] as string[];
                    const csrfCookie = selfHostedCookie.find(cookie => cookie.startsWith("csrf_token="));

                    if (csrfCookie) {
                        const extractCsrf = csrfCookie.split(';')[0].split('=')[1];

                        this.headers['x-csrf-token'] = extractCsrf;

                        return true;
                    } else {
                        this.log.error(`${logPrefix} cookie not have a csrf token!`);
                        this.log.debug(`${logPrefix} headers: ${JSON.stringify(response?.headers)}`);
                        return false;
                    }
                }
            }

            // Clear out our login credentials.
            this.logout();
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return false;
    }


    /**
     * Clear the login credentials and terminate any open connection to the UniFi Network API.
     */
    public logout(): void {
        const logPrefix = `[${this.logPrefix}.logout]`

        try {

            // Close any connection to the Network API.
            this.reset();

            // Save our CSRF token, if we have one.
            const csrfToken = this.headers['x-csrf-token'];

            // Initialize the headers we need.
            this.headers = {};
            this.headers['content-type'] = 'application/json';

            // Restore the CSRF token if we have one.
            if (csrfToken) {

                this.headers['x-csrf-token'] = csrfToken;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Terminate any open connection to the UniFi Network API.
     */
    public reset(): void {
        this._eventsWs?.close();
        this._eventsWs = null;

        if (this.host) {

            // Cleanup any prior pool.
            void this.dispatcher?.destroy();

            // Create an interceptor that allows us to set the user agent to our liking.
            const ua: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) => {

                opts.headers ??= {};
                (opts.headers as Record<string, string>)['user-agent'] = 'unifi-network';

                return dispatch(opts, handler);
            };

            // Create a dispatcher using a new pool. We want to explicitly allow self-signed SSL certificates, enabled HTTP2 connections, and allow up to five connections at a
            // time and provide some robust retry handling - we retry each request up to three times, with backoff. We allow for up to five retries, with a maximum wait time of
            // 1500ms per retry, in factors of 2 starting from a 100ms delay.
            this.dispatcher = new Pool(`https://${this.host}${this.port}`, { allowH2: true, clientTtl: 60 * 1000, connect: { rejectUnauthorized: false }, connections: 5 })
                .compose(ua, interceptors.retry({
                    maxRetries: 5, maxTimeout: 1500, methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'], minTimeout: 100,
                    statusCodes: [400, 404, 429, 500, 502, 503, 504], timeoutFactor: 2
                }));
        }
    }

    public responseOk(code?: number): boolean {
        return (code !== undefined) && (code >= 200) && (code < 300);
    }

    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     * @param retrieveOptions
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     */
    public async retrieve(url: string, options: RequestOptions = { method: 'GET' }, retrieveOptions: RetrieveOptions = {}):
        Promise<Nullable<Dispatcher.ResponseData<unknown>>> {

        return this._retrieve(url, options, retrieveOptions);
    }

    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     * 
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    public async retrievData(url: string, options: RequestOptions = { method: 'GET' }, retry: boolean = true): Promise<Record<string, any> | undefined> {
        const logPrefix = `[${this.logPrefix}.retrievData]`

        try {
            // Log us in if needed.
            if (!(await this.loginController())) {

                return retry ? await this.retrievData(url, options, false) : undefined;
            }

            const response = await this.retrieve(url, options);

            if (response && response !== null) {
                if (response.statusCode !== 200) {
                    // Something went wrong. Retry the bootstrap attempt once, and then we're done.
                    this.log.error(`${logPrefix} Unable to retrieve data. code: ${response?.statusCode}, text: ${STATUS_CODES[response.statusCode]}, url: ${url}`);
                } else {
                    const data = await response.body.json() as Record<string, string>;

                    if (data) {
                        return data;
                    }
                }
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return retry ? await this.retrievData(url, options, false) : undefined;
    }

    // Internal interface to communicating HTTP requests with a Network controller, with error handling.
    private async _retrieve(url: string, options: RequestOptions = { method: 'GET' }, retrieveOptions: RetrieveOptions = {}, isRetry = false): Promise<Nullable<Dispatcher.ResponseData<unknown>>> {
        const logPrefix = `[${this.logPrefix}._retrieve]`

        retrieveOptions.timeout ??= API_TIMEOUT;

        // Catch Network controller server-side issues:
        //
        // 400: Bad request.
        // 404: Not found.
        // 429: Too many requests.
        // 500: Internal server error.
        // 502: Bad gateway.
        // 503: Service temporarily unavailable.
        const serverErrors = new Set([400, 404, 429, 500, 502, 503]);

        let response: Dispatcher.ResponseData<unknown>;

        // Create a signal handler to deliver the abort operation.
        const controller = new AbortController();
        this.connectionTimeout = this.adapter.setTimeout(() => controller.abort(), retrieveOptions.timeout);

        options.dispatcher = this.dispatcher;
        options.headers = this.headers;
        options.signal = controller.signal;

        try {
            // Execute the API request.
            response = await request(url, options);

            // Preemptively increase the error count.
            this.apiErrorCount++;

            // Bad username and password.
            if (response.statusCode === 401) {
                this.logout();
                this.log.error(`${logPrefix} Invalid login credentials given. Please check your login and password.`);

                return null;
            }

            // Insufficient privileges.
            if (response.statusCode === 403) {
                this.log.error(`${logPrefix} Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.`)

                return null;
            }

            if (!this.responseOk(response.statusCode)) {

                if (serverErrors.has(response.statusCode)) {
                    this.log.error(`${logPrefix} Unable to connect to the Network controller. This is temporary and may occur during device reboots.`);

                    return null;
                }

                // Some other unknown error occurred.
                this.log.error(`${logPrefix} ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`);
                return null;
            }

            // We're all good - return the response and we're done.
            this.apiLastSuccess = Date.now();
            this.apiErrorCount = 0;

            return response;
        } catch (error) {

            // Increment our API error count.
            this.apiErrorCount++;

            // We aborted the connection.
            if ((error instanceof DOMException) && (error.name === 'AbortError')) {
                this.log.error(`${logPrefix} Network controller is taking too long to respond to a request. This error can usually be safely ignored.`);

                return null;
            }

            // We destroyed the pool due to a reset event and our inflight connections are failing.
            if (error instanceof errors.ClientDestroyedError) {
                return null;
            }

            // We destroyed the pool due to a reset event and our inflight connections are failing.
            if (error instanceof errors.RequestRetryError) {
                this.log.error(`${logPrefix} Unable to connect to the Network controller. This is temporary and may occur during device reboots.`);

                return null;
            }

            // Connection timed out.
            if (error instanceof errors.ConnectTimeoutError) {
                this.log.error(`${logPrefix} Connection timed out.`);

                return null;
            }

            let cause;

            if (error instanceof TypeError) {
                cause = error.cause as NodeJS.ErrnoException;
            }

            if ((error instanceof Error) && ('code' in error) && (typeof (error as NodeJS.ErrnoException).code === 'string')) {
                cause = error;
            }

            if (cause) {

                switch (cause.code) {

                    case 'ECONNREFUSED':
                    case 'EHOSTDOWN':
                        this.log.error(`${logPrefix} Connection refused.`);

                        break;

                    case 'ECONNRESET':
                        this.log.error(`${logPrefix} Network connection to Network controller has been reset.`);

                        break;

                    case 'ENOTFOUND':
                        if (this.host) {
                            this.log.error(`${logPrefix} Hostname or IP address not found: ${this.host}. Please ensure the address you configured for this UniFi Network controller is correct.`)
                        } else {
                            this.log.error(`${logPrefix} No hostname or IP address provided.`);
                        }

                        break;

                    default:
                        // If we're logging when we have an error, do so.
                        this.log.error(`${logPrefix} Error: ${cause.code} | ${cause.message}`);

                        break;
                }

                return null;
            }

            this.log.error(`${logPrefix} Error: ${util.inspect(error, { colors: true, depth: null, sorted: true })}`);

            return null;
        } finally {

            // Clear out our response timeout.
            this.adapter.clearTimeout(this.connectionTimeout);
        }
    }

    public async sendData(cmd: string, payload: any, method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'PATCH' = 'POST'): Promise<Nullable<Dispatcher.ResponseData<unknown>>> {
        const logPrefix = `[${this.logPrefix}.sendData]`

        let url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}${cmd}`

        if (cmd.startsWith('https://')) {
            url = cmd
        }

        this.log.debug(`${logPrefix} url: ${url}, body: ${JSON.stringify(payload)}, method: ${method}`);

        return await this.retrieve(url, {
            body: JSON.stringify(payload),
            method: method
        });
    }

    /**
     * Detailed list of all devices on site
     * 
     * @param mac optional: mac address to receive only the data for this device
     * @returns 
     */
    public async getDevices(mac: string | undefined = undefined): Promise<NetworkDevice[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getDevices]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.devices)}${mac ? `/${mac.trim()}` : ''}`);

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * API V2 - Detailed list of all devices on site
     * 
     * @param separateUnmanaged
     * @param includeTrafficUsage
     * @returns 
     */
    public async getDevices_V2(separateUnmanaged: boolean = false, includeTrafficUsage: boolean = false): Promise<NetworkDevice_V2 | undefined> {
        const logPrefix = `[${this.logPrefix}.getDevices_V2]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.devices)}?separateUnmanaged=${separateUnmanaged}&includeTrafficUsage=${includeTrafficUsage}`);

            if (res) {
                return res as NetworkDevice_V2;
            }

        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * List of all active (connected) clients
     * 
     * @returns 
     */
    public async getClientsActive(): Promise<NetworkClient[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getClientsActive]`

        try {
            const res = await this.retrievData(this.getApiEndpoint(ApiEndpoints.clientsActive));

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     *  V2 API - List of all active (connected) clients
     * 
     * @param mac
     * @param includeTrafficUsage
     * @param includeUnifiDevices
     * @returns 
     */
    public async getClientsActive_V2(mac: string = undefined, includeTrafficUsage: boolean = false, includeUnifiDevices: boolean = true): Promise<NetworkClient[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getClientsActive_V2]`

        try {
            const url = `${this.getApiEndpoint_V2(ApiEndpoints_V2.clientsActive)}${mac ? `/${mac}` : ''}?includeTrafficUsage=${includeTrafficUsage}&includeUnifiDevices=${includeUnifiDevices}`
            const res = await this.retrievData(url);

            if (res && res.length > 0) {
                return res as NetworkClient[];
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * List of all configured / known clients on the site
     * 
     * @returns 
     */
    public async getClients(): Promise<NetworkClient[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getClients]`

        try {
            const res = await this.retrievData(this.getApiEndpoint(ApiEndpoints.clients));

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     *  V2 API - List of all disconnected clients
     * 
     * @param withinHour
     * @param includeUnifiDevices
     * @returns 
     */
    public async getClientsHistory_V2(withinHour: number = 0, includeUnifiDevices: boolean = true): Promise<NetworkClient[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getClientsHistory_V2]`

        try {
            const url = `${this.getApiEndpoint_V2(ApiEndpoints_V2.clientsHistory)}?includeUnifiDevices=${includeUnifiDevices}&withinHours=${withinHour}`
            const res = await this.retrievData(url);

            if (res && res.length > 0) {
                return res as NetworkClient[];
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * List all WLan configurations
     * 
     * @param wlan_id optional: wlan id to receive only the configuration for this wlan
     * @returns 
     */
    public async getWlanConfig(wlan_id = undefined): Promise<NetworkWlanConfig[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.wlanConfig)}${wlan_id ? `/${wlan_id.trim()}` : ''}`);

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * API V2 - List all WLan configurations
     * 
     * @returns 
     */
    public async getWlanConfig_V2(): Promise<NetworkWlanConfig_V2[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.wlanConfig)}`);

            if (res && res.length > 0) {
                return res as NetworkWlanConfig_V2[];
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * List all LAN configurations
     * 
     * @param network_id optional: network id to receive only the configuration for this wlan
     * @returns 
     */
    public async getLanConfig(network_id = undefined): Promise<NetworkWlanConfig[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getLanConfig]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.lanConfig)}${network_id ? `/${network_id.trim()}` : ''}`);

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * API V2 - List all Lan configurations
     * 
     * @returns 
     */
    public async getLanConfig_V2(): Promise<NetworkLanConfig_V2[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getLanConfig_V2]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.lanConfig)}`);

            if (res && res.length > 0) {
                return res as NetworkLanConfig_V2[];
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * API V2 - List model information for devices
     * 
     * @param model
     * @returns 
     */
    public async getDeviceModels_V2(model: string = undefined): Promise<NetworkDeviceModels[] | NetworkDeviceModels | undefined> {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.models)}${model ? `/${model}` : ''}`);

            if (res && res.model_list && res.model_list.length > 0) {
                return res.model_list;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    /**
     * List all LAN configurations
     * 
     * @param firewallGroup_id optional: network id to receive only the configuration for this wlan
     * @returns 
     */
    public async getFirewallGroup(firewallGroup_id = undefined): Promise<FirewallGroup[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getFirewallGroup]`

        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.firewallGroup)}${firewallGroup_id ? `/${firewallGroup_id.trim()}` : ''}`);

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

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
    public async getReportStats(type: NetworkReportType, interval: NetworkReportInterval, attrs: (keyof NetworkReportStats)[] | 'ALL' = undefined, mac: string = undefined, start: number = undefined, end: number = undefined): Promise<NetworkReportStats[] | undefined> {
        const logPrefix = `[${this.logPrefix}.getReportStats]`

        try {
            const url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/api/s/${this.site}/stat/report/${interval}.${type}`;

            if (!end) {
                end = Date.now()
            }

            if (!start) {
                if (interval === NetworkReportInterval['5minutes']) {
                    // 5 minutes: default 1h
                    start = end - (1 * 3600 * 1000);
                } else if (interval === NetworkReportInterval.hourly) {
                    // hourly: default 24h
                    start = end - (7 * 24 * 3600 * 1000);
                } else if (interval === NetworkReportInterval.daily) {
                    // daily: default 1 week
                    start = end - (1 * 7 * 24 * 3600 * 1000);
                } else {
                    // monthly: default 26 weeks
                    start = end - (26 * 7 * 24 * 3600 * 1000);
                }
            }

            if (!attrs) {
                attrs = ['time']
            } else if (attrs !== 'ALL') {
                attrs = ['time', ...attrs];
            } else {
                attrs = ['bytes', 'cpu', 'lan-num_sta', 'mem', 'num_sta', 'rx_bytes', 'time', 'tx_bytes', 'wan-rx_bytes', 'wan-tx_bytes', 'wlan-num_sta', 'wlan_bytes']
            }

            const payload = {
                attrs: attrs,
                start,
                end,
                mac: mac
            };

            const res = await this.retrievData(url, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res && res.data && res.data.length > 0) {
                return res.data;
            }

        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    public async getSystemLog(type: SystemLogType, page_number: number = 0, pages_size: number = 10, start: number = undefined, end: number = undefined, macs: string[] = undefined): Promise<Record<string, any>> {
        const logPrefix = `[${this.logPrefix}.getSystemLog]`

        try {
            const url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/v2/api/site/${this.site}/system-log/${type}`;
            this.log.warn(url);
            if (!end) {
                end = Date.now()
            }

            if (!start) {
                // default: 1 day
                start = end - (1 * 24 * 3600 * 1000);
            }

            const payload: any = {
                timestampFrom: start,
                timestampTo: end,
                pageNumber: page_number,
                pageSize: pages_size
            };

            if (type === SystemLogType.critical) {
                payload.nextAiCategory = ['CLIENT', 'DEVICE', 'INTERNET', 'VPN'];
            } else if (type === SystemLogType.devices) {
                if (!macs) {
                    payload.macs = macs;
                }
            } else if (type === SystemLogType.admin) {
                payload.activity_keys = ['ACCESSED_NETWORK_WEB', 'ACCESSED_NETWORK_IOS', 'ACCESSED_NETWORK_ANDROID'];
                payload.change_keys = ['CLIENT', 'DEVICE', 'HOTSPOT', 'INTERNET', 'NETWORK', 'PROFILE', 'ROUTING', 'SECURITY', 'SYSTEM', 'VPN', 'WIFI'];
            } else if (type === SystemLogType.updates) {
                payload.systemLogDeviceTypes = ['GATEWAYS', 'SWITCHES', 'ACCESS_POINT', 'SMART_POWER', 'BUILDING_TO_BUILDING_BRIDGES', 'UNIFI_LTE'];
            } else if (type === SystemLogType.clients) {
                payload.clientType = ['GUEST', 'TELEPORT', 'VPN', 'WIRELESS', 'RADIUS', 'WIRED'];
                payload.guestAuthorizationMethod = ['FACEBOOK_SOCIAL_GATEWAY', 'FREE_TRIAL', 'GOOGLE_SOCIAL_GATEWAY', 'NONE', 'PASSWORD', 'PAYMENT', 'RADIUS', 'VOUCHER'];
            } else if (type === SystemLogType.threats) {
                payload.threatTypes = ['HONEYPOT', 'THREAT'];
            } else if (type === SystemLogType.triggers) {
                payload.triggerTypes = ['TRAFFIC_RULE', 'TRAFFIC_ROUTE', 'FIREWALL_RULE'];
            }


            const res = await this.retrievData(url, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res) {
                return res;
            }

        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }

    public getApiEndpoint(endpoint: ApiEndpoints): string {
        //https://ubntwiki.com/products/software/unifi-controller/api

        let endpointSuffix: string;
        let endpointPrefix: string = this.isUnifiOs ? '/proxy/network' : '';

        switch (endpoint) {
            case ApiEndpoints.login:
                endpointPrefix = '/api/';
                endpointSuffix = this.isUnifiOs ? 'auth/login' : 'login';
                break;

            case ApiEndpoints.self:
                endpointPrefix = '/api/';
                endpointSuffix = this.isUnifiOs ? 'users/self' : 'self';
                break;

            case ApiEndpoints.devices:
                endpointSuffix = `/api/s/${this.site}/stat/device`;
                break;

            case ApiEndpoints.deviceRest:
                endpointSuffix = `/api/s/${this.site}/rest/device`;
                break;

            case ApiEndpoints.deviceCommand:
                endpointSuffix = `/api/s/${this.site}/cmd/devmgr`;
                break;

            case ApiEndpoints.clients:
                endpointSuffix = `/api/s/${this.site}/rest/user`;
                break;

            case ApiEndpoints.clientsActive:
                endpointSuffix = `/api/s/${this.site}/stat/sta`;
                break;

            case ApiEndpoints.clientCommand:
                endpointSuffix = `/api/s/${this.site}/cmd/stamgr`;
                break;

            case ApiEndpoints.wlanConfig:
                endpointSuffix = `/api/s/${this.site}/rest/wlanconf`;
                break;

            case ApiEndpoints.lanConfig:
                endpointSuffix = `/api/s/${this.site}/rest/networkconf`;
                break;

            case ApiEndpoints.firewallGroup:
                endpointSuffix = `/api/s/${this.site}/rest/firewallgroup`;
                break;

            default:
                break;
        }

        if (!endpointSuffix) {

            return '';
        }

        return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`
    }

    public getApiEndpoint_V2(endpoint: ApiEndpoints_V2): string {
        //https://ubntwiki.com/products/software/unifi-controller/api

        let endpointSuffix: string;
        const endpointPrefix: string = this.isUnifiOs ? '/proxy/network' : '';

        switch (endpoint) {
            case ApiEndpoints_V2.devices:
                endpointSuffix = `/v2/api/site/${this.site}/device`;
                break;

            case ApiEndpoints_V2.clientsActive:
                endpointSuffix = `/v2/api/site/${this.site}/clients/active`;
                break;

            case ApiEndpoints_V2.clientsHistory:
                endpointSuffix = `/v2/api/site/${this.site}/clients/history`;
                // onlyNonBlocked=false
                // onlyBlocked=true
                break;

            case ApiEndpoints_V2.wlanConfig:
                endpointSuffix = `/v2/api/site/${this.site}/wlan/enriched-configuration`;
                break;

            case ApiEndpoints_V2.lanConfig:
                endpointSuffix = `/v2/api/site/${this.site}/lan/enriched-configuration`;
                break;

            case ApiEndpoints_V2.models:
                endpointSuffix = `/v2/api/site/${this.site}/models`;
                break;

            default:
                endpointSuffix = ''
                break;
        }

        if (!endpointSuffix) {
            return '';
        }

        return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`
    }

    public async checkCommandSuccessful(result: Nullable<Dispatcher.ResponseData<unknown>>, logPrefix: string, message: string, id: string | undefined = undefined): Promise<void> {
        if (result) {
            if (id) {
                await this.adapter.setState(id, { ack: true });
            }

            this.log.info(`${logPrefix} command successfully sent: ${message}`);
        }
    }

    // /**
    //  * @deprecated this using undici websocket, but loosing very often connection, perhaps caused by the ping pong implementations
    //  * @returns 
    //  */
    // public async launchEventsWsUndici(): Promise<boolean> {
    // const logPrefix = `[${this.logPrefix}.launchEventsWs]`

    // try {
    //     // Log us in if needed.
    //     if (!(await this.loginController())) {

    //         return false;
    //     }

    //     // If we already have a listener, we're already all set.
    //     if (this._eventsWs) {

    //         return true;
    //     }

    //     const url = `wss://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/wss/s/${this.site}/events?clients=v2&next_ai_notifications=true&critical_notifications=true`

    //     const ws = new WebSocket(url, { dispatcher: new Agent({ connect: { rejectUnauthorized: false } }), headers: { Cookie: this.headers.cookie ?? '' } });

    //     if (!ws) {

    //         this.log.error('Unable to connect to the realtime update events API. Will retry again later.');
    //         this._eventsWs = null;

    //         return false;
    //     }

    //     let messageHandler: Nullable<(event: MessageEvent) => void>;

    //     // Cleanup after ourselves if our websocket closes for some resaon.
    //     ws.addEventListener('close', (): void => {

    //         this._eventsWs = null;

    //         if (messageHandler) {

    //             ws.removeEventListener('message', messageHandler);
    //             messageHandler = null;
    //         }
    //     }, { once: true });

    //     // Handle any websocket errors.
    //     ws.addEventListener('error', (event: ErrorEvent): void => {
    //         this.log.error(`${this.logPrefix} Events API error: ${JSON.stringify(event.error.cause)}`);
    //         this.log.error(`${this.logPrefix} ${util.inspect(event.error, { colors: true, depth: null, sorted: true })}`);

    //         ws.close();
    //     }, { once: true });

    //     // Process messages as they come in.
    //     ws.addEventListener('message', messageHandler = (event: MessageEvent): void => {
    //         try {
    //             if (event.data) {
    //                 if (event.data.toLowerCase() === 'pong') {
    //                     this.emit('pong');
    //                     this.log.level === 'silly' ? this.log.silly(`pong received`) : this.log.debug(`pong received`);
    //                 } else {
    //                     const data: NetworkEvent = JSON.parse(event.data);

    //                     if (data) {
    //                         this.emit('message', data);
    //                     }
    //                 }
    //             } else {
    //                 this.log.warn(`${logPrefix} event has no data!`);
    //             }
    //         } catch (error: any) {
    //             this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
    //         }
    //     });

    //     // Make the websocket available, and then we're done.
    //     this._eventsWs = ws;

    // } catch (error: any) {
    //     this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    // }

    //     return true;
    // }

    public async launchEventsWs(): Promise<boolean> {
        const logPrefix = `[${this.logPrefix}.launchEventsWs]`

        try {
            // Log us in if needed.
            if (!(await this.loginController())) {

                return false;
            }

            // If we already have a listener, we're already all set.
            if (this._eventsWs) {

                return true;
            }

            const url = `wss://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/wss/s/${this.site}/events?clients=v2&next_ai_notifications=true&critical_notifications=true`

            const ws = new WebSocket(url, {
                headers: {
                    Cookie: this.headers.cookie ?? ''
                },

                rejectUnauthorized: false
            });

            if (!ws) {

                this.log.error('Unable to connect to the realtime update events API. Will retry again later.');
                this._eventsWs = null;

                return false;
            }

            let messageHandler: ((data: string) => void) | null;

            // Cleanup after ourselves if our websocket closes for some resaon.
            ws.once('close', (): void => {

                this._eventsWs = null;

                if (messageHandler) {

                    ws.removeListener('message', messageHandler);
                    messageHandler = null;
                }
            });

            // Handle any websocket errors.
            ws.once('error', (error: Error): void => {

                this._eventsWs = null;

                // If we're closing before fully established it's because we're shutting down the API - ignore it.
                if (error.message !== 'WebSocket was closed before the connection was established') {
                    if (error.message === 'Unexpected server response: 502' || error.message === 'Unexpected server response: 503' || error.message === 'Unexpected server response: 200') {
                        this.log.error(`${logPrefix} Network controller - WebSocket service is unavailable. This is usually temporary and will occur during device reboots.`);
                    } else {
                        this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                    }
                }

                ws.removeListener('message', messageHandler);
                ws.terminate();
            });

            // Process messages as they come in.
            ws.on('message', messageHandler = (data: string): void => {
                try {
                    if (data.toString().toLowerCase() === 'pong') {
                        this.log.warn('PONG');
                    }
                    if (data.toString() === 'pong') {
                        this.log.warn('PONG');
                    }
                    const event: NetworkEvent = JSON.parse(data.toString());

                    if (event) {
                        this.emit('message', event);
                    }
                } catch (error: any) {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
            });

            ws.on('pong', messageHandler = (data: string): void => {
                try {
                    this.emit('pong');
                    this.log.silly(`pong received`);
                } catch (error: any) {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
            });

            // Make the websocket available, and then we're done.
            this._eventsWs = ws;

        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return true;
    }

    public wsSendPing(): void {
        const logPrefix = `[${this.logPrefix}.wsSendPing]`

        try {
            if (this._eventsWs && this._eventsWs !== null) {
                this._eventsWs.ping();
                this.log.silly(`ping sent`);
            }
        } catch (error: any) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}