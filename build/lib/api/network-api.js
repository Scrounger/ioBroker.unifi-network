// Lib imports
import { AbortError, FetchError, Headers, context, timeoutSignal } from '@adobe/fetch';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
// API imports
import { API_ERROR_LIMIT, API_RETRY_INTERVAL, API_TIMEOUT } from './network-settings.js';
import { NetworkReportInterval } from './network-types-report-stats.js';
import { SystemLogType } from './network-types-system-log.js';
export class NetworkApi extends EventEmitter {
    logPrefix = 'NetworkApi';
    // private adapter: ioBroker.Adapter;
    apiErrorCount;
    apiLastSuccess;
    fetch;
    headers;
    log;
    host;
    port;
    isUnifiOs;
    site;
    password;
    username;
    _eventsWs;
    constructor(host, port, isUnifiOs, site, username, password, log = console) {
        // Initialize our parent.
        super();
        this.log = log;
        this._eventsWs = null;
        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.fetch = context({ alpnProtocols: ["h2" /* ALPNProtocol.ALPN_HTTP2 */], rejectUnauthorized: false, userAgent: 'unifi-network' }).fetch;
        this.headers = new Headers();
        this.host = host;
        this.port = isUnifiOs ? '' : `:${port}`;
        this.isUnifiOs = isUnifiOs;
        this.site = site;
        this.username = username;
        this.password = password;
    }
    async login() {
        const logPrefix = `[${this.logPrefix}.login]`;
        try {
            this.logout();
            // Let's attempt to login.
            const loginSuccess = await this.loginController();
            // Publish the result to our listeners
            this.emit('login', loginSuccess);
            // Return the status of our login attempt.
            return loginSuccess;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
    // Login to the UniFi Network API.
    async loginController() {
        const logPrefix = `[${this.logPrefix}.loginController]`;
        try {
            // If we're already logged in, we're done.
            if (this.headers.has('Cookie') && this.headers.has('X-CSRF-Token')) {
                // this.log.debug(`${logPrefix} we are already logged in to the controller`);
                return true;
            }
            // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
            if (!this.headers.has('X-CSRF-Token')) {
                // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Network
                // controller and checking the headers for it.
                const response = await this.retrieve(`https://${this.host}${this.port}`, { method: 'GET' });
                if (response?.ok) {
                    const csrfToken = response.headers.get('X-CSRF-Token');
                    // Preserve the CSRF token, if found, for future API calls.
                    if (csrfToken) {
                        this.headers.set('X-CSRF-Token', csrfToken);
                    }
                }
            }
            // Log us in.
            const response = await this.retrieve(this.getApiEndpoint(ApiEndpoints.login), {
                body: JSON.stringify({ password: this.password, rememberMe: true, token: '', username: this.username }),
                method: 'POST'
            });
            // Something went wrong with the login call, possibly a controller reboot or failure.
            if (!response?.ok) {
                this.logout();
                return false;
            }
            // We're logged in. Let's configure our headers.
            const csrfToken = response.headers.get('X-Updated-CSRF-Token') ?? response.headers.get('X-CSRF-Token');
            const cookie = response.headers.get('Set-Cookie');
            // Save the refreshed cookie and CSRF token for future API calls and we're done.
            if (csrfToken && cookie) {
                // Only preserve the token element of the cookie and not the superfluous information that's been added to it.
                this.headers.set('Cookie', cookie.split(';')[0]);
                // Save the CSRF token.
                this.headers.set('X-CSRF-Token', csrfToken);
                this.log.debug(`${logPrefix} successfully logged into the controller (host: ${this.host}${this.port}, isUnifiOs: ${this.isUnifiOs})`);
                return true;
            }
            // Clear out our login credentials.
            this.logout();
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
    /**
     * Clear the login credentials and terminate any open connection to the UniFi Network API.
     *
     * @category Authentication
     */
    logout() {
        const logPrefix = `[${this.logPrefix}.logout]`;
        try {
            // Close any connection to the Network API.
            this.reset();
            // Save our CSRF token, if we have one.
            const csrfToken = this.headers?.get('X-CSRF-Token');
            // Initialize the headers we need.
            this.headers = new Headers();
            this.headers.set('Content-Type', 'application/json');
            // Restore the CSRF token if we have one.
            if (csrfToken) {
                this.headers.set('X-CSRF-Token', csrfToken);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Terminate any open connection to the UniFi Network API.
     *
     * @category Utilities
     */
    reset() {
        this._eventsWs?.terminate();
        this._eventsWs = null;
    }
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
    async retrieve(url, options = { method: 'GET' }) {
        return this._retrieve(url, options);
    }
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    async retrievData(url, options = { method: 'GET' }, retry = true) {
        const logPrefix = `[${this.logPrefix}.retrievData]`;
        try {
            // Log us in if needed.
            if (!(await this.loginController())) {
                return retry ? this.retrievData(url, options, false) : undefined;
            }
            const response = await this.retrieve(url, options);
            // Something went wrong. Retry the bootstrap attempt once, and then we're done.
            if (!response?.ok) {
                this.log.error(`${logPrefix} Unable to retrieve data. code: ${response.status}, text: ${response.statusText}`);
                return retry ? this.retrievData(url, options, false) : undefined;
            }
            const data = await response.json();
            if (data) {
                return data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    // Internal interface to communicating HTTP requests with a Network controller, with error handling.
    async _retrieve(url, options = { method: 'GET' }, decodeResponse = true, isRetry = false) {
        const logPrefix = `[${this.logPrefix}._retrieve]`;
        // Catch Network controller server-side issues:
        //
        // 400: Bad request.
        // 404: Not found.
        // 429: Too many requests.
        // 500: Internal server error.
        // 502: Bad gateway.
        // 503: Service temporarily unavailable.
        const isServerSideIssue = (code) => [400, 404, 429, 500, 502, 503].some(x => x === code);
        let response;
        // Create a signal handler to deliver the abort operation.
        const signal = timeoutSignal(API_TIMEOUT);
        options.headers = this.headers;
        options.signal = signal;
        try {
            const now = Date.now();
            // Throttle this after API_ERROR_LIMIT attempts.
            if (this.apiErrorCount >= API_ERROR_LIMIT) {
                // Let the user know we've got an API problem.
                if (this.apiErrorCount === API_ERROR_LIMIT) {
                    this.log.error(`Throttling API calls due to errors with the ${this.apiErrorCount} previous attempts. Pausing communication with the Network controller for ${API_RETRY_INTERVAL / 60} minutes.`);
                    this.apiErrorCount++;
                    this.apiLastSuccess = now;
                    this.reset();
                    return null;
                }
                // Check to see if we are still throttling our API calls.
                if ((this.apiLastSuccess + (API_RETRY_INTERVAL * 1000)) > now) {
                    return null;
                }
                // Inform the user that we're out of the penalty box and try again.
                this.log.error(`Resuming connectivity to the UniFi Network API after pausing for ${API_RETRY_INTERVAL / 60} minutes.`);
                this.apiErrorCount = 0;
                this.reset();
                if (!(await this.loginController())) {
                    return null;
                }
            }
            response = await this.fetch(url, options);
            // The caller will sort through responses instead of us.
            if (!decodeResponse) {
                return response;
            }
            // Preemptively increase the error count.
            this.apiErrorCount++;
            // Bad username and password.
            if (response.status === 401) {
                this.logout();
                this.log.error(`${logPrefix} code: ${response.status} - Invalid login credentials given. Please check your login and password.`);
                return null;
            }
            // Insufficient privileges.
            if (response.status === 403) {
                this.log.error(`${logPrefix} code: ${response.status} - Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.`);
                return null;
            }
            // Insufficient privileges.
            if (response.status === 429) {
                this.log.error(`${logPrefix} code: ${response.status} - Too many requests. Please check the settings at your unifi network controller or wait a while and restart the connection`);
                return null;
            }
            if (!response.ok && isServerSideIssue(response.status)) {
                this.log.error(`${logPrefix} code: ${response.status} - Unable to connect to the Network controller. This is usually temporary and will occur during device reboots.`);
                return null;
            }
            // Some other unknown error occurred.
            if (!response.ok) {
                this.log.error(`${logPrefix} code: ${response.status} - ${response.statusText}`);
                return null;
            }
            this.apiLastSuccess = Date.now();
            this.apiErrorCount = 0;
            return response;
        }
        catch (error) {
            this.apiErrorCount++;
            if (error instanceof AbortError) {
                this.log.error(`${logPrefix} Network controller is taking too long to respond to a request. This error can usually be safely ignored.`);
                this.log.debug(`${logPrefix} Original request was: ${url}`);
                return null;
            }
            if (error instanceof FetchError) {
                switch (error.code) {
                    case 'ECONNREFUSED':
                    case 'EHOSTDOWN':
                    case 'ERR_HTTP2_STREAM_CANCEL':
                    case 'ERR_HTTP2_STREAM_ERROR':
                        this.log.error(`${logPrefix} Connection refused.`);
                        break;
                    case 'ECONNRESET':
                        // Retry on connection reset, but no more than once.
                        if (!isRetry) {
                            return this._retrieve(url, options, decodeResponse, true);
                        }
                        this.log.error(`${logPrefix} Network connection to Network controller has been reset.`);
                        break;
                    case 'ENOTFOUND':
                        this.log.error(`${logPrefix} Hostname or IP address not found: ${this.host}${this.port}. Please ensure the address you configured for this UniFi Network controller is correct.`);
                        break;
                    default:
                        // If we're logging when we have an error, do so.
                        this.log.error(`${logPrefix} ${error.code} - ${error.message}`);
                        break;
                }
            }
            return null;
        }
        finally {
            // Clear out our response timeout if needed.
            signal.clear();
        }
    }
    async sendData(cmd, payload, method = 'POST') {
        const url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}${cmd}`;
        return await this.retrieve(url, {
            body: JSON.stringify(payload),
            method: method
        });
    }
    /**
     * Detailed list of all devices on site
     * @param mac optional: mac address to receive only the data for this device
     * @returns
     */
    async getDevices(mac = undefined) {
        const logPrefix = `[${this.logPrefix}.getDevices]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.devices)}${mac ? `/${mac.trim()}` : ''}`);
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * API V2 - Detailed list of all devices on site
     * @param mac optional: mac address to receive only the data for this device
     * @returns
     */
    async getDevices_V2(separateUnmanaged = false, includeTrafficUsage = false) {
        const logPrefix = `[${this.logPrefix}.getDevices_V2]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.devices)}?separateUnmanaged=${separateUnmanaged}&includeTrafficUsage=${includeTrafficUsage}`);
            if (res && res.length > 0) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List of all active (connected) clients
     * @returns
     */
    async getClientsActive() {
        const logPrefix = `[${this.logPrefix}.getClientsActive]`;
        try {
            const res = await this.retrievData(this.getApiEndpoint(ApiEndpoints.clientsActive));
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     *  V2 API - List of all active (connected) clients
     * @returns
     */
    async getClientsActive_V2(mac = undefined, includeTrafficUsage = false, includeUnifiDevices = true) {
        const logPrefix = `[${this.logPrefix}.getClientsActive_V2]`;
        try {
            const url = `${this.getApiEndpoint_V2(ApiEndpoints_V2.clientsActive)}${mac ? `/${mac}` : ''}?includeTrafficUsage=${includeTrafficUsage}&includeUnifiDevices=${includeUnifiDevices}`;
            const res = await this.retrievData(url);
            if (res && res.length > 0) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List of all configured / known clients on the site
     * @returns
     */
    async getClients() {
        const logPrefix = `[${this.logPrefix}.getClients]`;
        try {
            const res = await this.retrievData(this.getApiEndpoint(ApiEndpoints.clients));
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     *  V2 API - List of all disconnected clients
     * @returns
     */
    async getClientsHistory_V2(withinHour = 0, includeUnifiDevices = true) {
        const logPrefix = `[${this.logPrefix}.getClientsHistory_V2]`;
        try {
            const url = `${this.getApiEndpoint_V2(ApiEndpoints_V2.clientsHistory)}?includeUnifiDevices=${includeUnifiDevices}&withinHours=${withinHour}`;
            const res = await this.retrievData(url);
            if (res && res.length > 0) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List all WLan configurations
     * @param wlan_id optional: wlan id to receive only the configuration for this wlan
     * @returns
     */
    async getWlanConfig(wlan_id = undefined) {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.wlanConfig)}${wlan_id ? `/${wlan_id.trim()}` : ''}`);
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * API V2 - List all WLan configurations
     * @returns
     */
    async getWlanConfig_V2() {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.wlanConfig)}`);
            if (res && res.length > 0) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List all LAN configurations
     * @param network_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    async getLanConfig(network_id = undefined) {
        const logPrefix = `[${this.logPrefix}.getLanConfig]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.lanConfig)}${network_id ? `/${network_id.trim()}` : ''}`);
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * API V2 - List all Lan configurations
     * @returns
     */
    async getLanConfig_V2() {
        const logPrefix = `[${this.logPrefix}.getLanConfig_V2]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.lanConfig)}`);
            if (res && res.length > 0) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
      * API V2 - List model information for devices
      * @returns
      */
    async getDeviceModels_V2(model = undefined) {
        const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.models)}${model ? `/${model}` : ''}`);
            if (res && res.model_list && res.model_list.length > 0) {
                return res.model_list;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    async testConnection() {
        const logPrefix = `[${this.logPrefix}.testConnection]`;
        try {
            const res = await this.retrieve(`${this.getApiEndpoint(ApiEndpoints.self)}`);
            if (res?.ok) {
                return true;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
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
    async getReportStats(type, interval, attrs = undefined, mac = undefined, start = undefined, end = undefined) {
        const logPrefix = `[${this.logPrefix}.getReportStats]`;
        try {
            const url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/api/s/${this.site}/stat/report/${interval}.${type}`;
            if (!end) {
                end = Date.now();
            }
            if (!start) {
                if (interval === NetworkReportInterval['5minutes']) {
                    // 5 minutes: default 1h
                    start = end - (1 * 3600 * 1000);
                }
                else if (interval === NetworkReportInterval.hourly) {
                    // hourly: default 24h
                    start = end - (7 * 24 * 3600 * 1000);
                }
                else if (interval === NetworkReportInterval.daily) {
                    // daily: default 1 week
                    start = end - (1 * 7 * 24 * 3600 * 1000);
                }
                else {
                    // monthly: default 26 weeks
                    start = end - (26 * 7 * 24 * 3600 * 1000);
                }
            }
            if (!attrs) {
                attrs = ['time'];
            }
            else if (attrs !== 'ALL') {
                attrs = ['time', ...attrs];
            }
            else {
                attrs = ['bytes', 'cpu', 'lan-num_sta', 'mem', 'num_sta', 'rx_bytes', 'time', 'tx_bytes', 'wan-rx_bytes', 'wan-tx_bytes', 'wlan-num_sta', 'wlan_bytes'];
            }
            const payload = {
                attrs: attrs,
                start,
                end,
                mac: mac
            };
            const res = await this.retrievData(url, {
                method: 'POST',
                body: payload
            });
            if (res && res.data && res.data.length > 0) {
                return res.data;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    async getSystemLog(type, page_number = 0, pages_size = 10, start = undefined, end = undefined, macs = undefined) {
        const logPrefix = `[${this.logPrefix}.getSystemLog]`;
        try {
            const url = `https://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/v2/api/site/${this.site}/system-log/${type}`;
            this.log.warn(url);
            if (!end) {
                end = Date.now();
            }
            if (!start) {
                // default: 1 day
                start = end - (1 * 24 * 3600 * 1000);
            }
            const payload = {
                timestampFrom: start,
                timestampTo: end,
                pageNumber: page_number,
                pageSize: pages_size
            };
            if (type === SystemLogType.critical) {
                payload['nextAiCategory'] = ['CLIENT', 'DEVICE', 'INTERNET', 'VPN'];
            }
            else if (type === SystemLogType.devices) {
                if (!macs)
                    payload['macs'] = macs;
            }
            else if (type === SystemLogType.admin) {
                payload['activity_keys'] = ['ACCESSED_NETWORK_WEB', 'ACCESSED_NETWORK_IOS', 'ACCESSED_NETWORK_ANDROID'];
                payload['change_keys'] = ['CLIENT', 'DEVICE', 'HOTSPOT', 'INTERNET', 'NETWORK', 'PROFILE', 'ROUTING', 'SECURITY', 'SYSTEM', 'VPN', 'WIFI'];
            }
            else if (type === SystemLogType.updates) {
                payload['systemLogDeviceTypes'] = ['GATEWAYS', 'SWITCHES', 'ACCESS_POINT', 'SMART_POWER', 'BUILDING_TO_BUILDING_BRIDGES', 'UNIFI_LTE'];
            }
            else if (type === SystemLogType.clients) {
                payload['clientType'] = ['GUEST', 'TELEPORT', 'VPN', 'WIRELESS', 'RADIUS', 'WIRED'];
                payload['guestAuthorizationMethod'] = ['FACEBOOK_SOCIAL_GATEWAY', 'FREE_TRIAL', 'GOOGLE_SOCIAL_GATEWAY', 'NONE', 'PASSWORD', 'PAYMENT', 'RADIUS', 'VOUCHER'];
            }
            else if (type === SystemLogType.threats) {
                payload['threatTypes'] = ['HONEYPOT', 'THREAT'];
            }
            else if (type === SystemLogType.triggers) {
                payload['triggerTypes'] = ['TRAFFIC_RULE', 'TRAFFIC_ROUTE', 'FIREWALL_RULE'];
            }
            const res = await this.retrievData(url, {
                method: 'POST',
                body: payload
            });
            if (res) {
                return res;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    getApiEndpoint(endpoint) {
        //https://ubntwiki.com/products/software/unifi-controller/api
        let endpointSuffix;
        let endpointPrefix = this.isUnifiOs ? '/proxy/network' : '';
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
            case ApiEndpoints.clientsActive:
                endpointSuffix = `/api/s/${this.site}/stat/sta`;
                break;
            case ApiEndpoints.clients:
                endpointSuffix = `/api/s/${this.site}/rest/user`;
                break;
            case ApiEndpoints.wlanConfig:
                endpointSuffix = `/api/s/${this.site}/rest/wlanconf`;
                break;
            case ApiEndpoints.lanConfig:
                endpointSuffix = `/api/s/${this.site}/rest/networkconf`;
                break;
            default:
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`;
    }
    getApiEndpoint_V2(endpoint) {
        //https://ubntwiki.com/products/software/unifi-controller/api
        let endpointSuffix;
        let endpointPrefix = this.isUnifiOs ? '/proxy/network' : '';
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
                endpointSuffix = '';
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`;
    }
    async launchEventsWs() {
        const logPrefix = `[${this.logPrefix}.launchEventsWs]`;
        try {
            // Log us in if needed.
            if (!(await this.loginController())) {
                return false;
            }
            // If we already have a listener, we're already all set.
            if (this._eventsWs) {
                return true;
            }
            const url = `wss://${this.host}${this.port}${this.isUnifiOs ? '/proxy/network' : ''}/wss/s/${this.site}/events?clients=v2&next_ai_notifications=true&critical_notifications=true`;
            const ws = new WebSocket(url, {
                headers: {
                    Cookie: this.headers.get('Cookie') ?? ''
                },
                rejectUnauthorized: false
            });
            if (!ws) {
                this.log.error('Unable to connect to the realtime update events API. Will retry again later.');
                this._eventsWs = null;
                return false;
            }
            let messageHandler;
            // Cleanup after ourselves if our websocket closes for some resaon.
            ws.once('close', () => {
                this._eventsWs = null;
                if (messageHandler) {
                    ws.removeListener('message', messageHandler);
                    messageHandler = null;
                }
            });
            // Handle any websocket errors.
            ws.once('error', (error) => {
                this._eventsWs = null;
                // If we're closing before fully established it's because we're shutting down the API - ignore it.
                if (error.message !== 'WebSocket was closed before the connection was established') {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
                ws.removeListener('message', messageHandler);
                ws.terminate();
            });
            // Process messages as they come in.
            ws.on('message', messageHandler = (data) => {
                try {
                    if (data.toString().toLowerCase() === 'pong') {
                        this.log.warn('PONG');
                    }
                    if (data.toString() === 'pong') {
                        this.log.warn('PONG');
                    }
                    const event = JSON.parse(data.toString());
                    if (event) {
                        this.emit("message", event);
                    }
                }
                catch (error) {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
            });
            ws.on('pong', messageHandler = (data) => {
                try {
                    this.emit("pong");
                    this.log.silly ? this.log.silly(`pong received`) : this.log.debug(`pong received`);
                }
                catch (error) {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
            });
            // Make the websocket available, and then we're done.
            this._eventsWs = ws;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return true;
    }
    wsSendPing() {
        const logPrefix = `[${this.logPrefix}.wsSendPing]`;
        try {
            this._eventsWs.ping();
            this.log.silly ? this.log.silly(`ping sent`) : this.log.debug(`ping sent`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
export var ApiEndpoints;
(function (ApiEndpoints) {
    ApiEndpoints["login"] = "login";
    ApiEndpoints["self"] = "self";
    ApiEndpoints["devices"] = "devices";
    ApiEndpoints["clients"] = "clients";
    ApiEndpoints["clientsActive"] = "clientsActive";
    ApiEndpoints["wlanConfig"] = "wlanConfig";
    ApiEndpoints["lanConfig"] = "lanConfig";
})(ApiEndpoints || (ApiEndpoints = {}));
export var ApiEndpoints_V2;
(function (ApiEndpoints_V2) {
    ApiEndpoints_V2["devices"] = "devices";
    ApiEndpoints_V2["clientsActive"] = "clientsActive";
    ApiEndpoints_V2["clientsHistory"] = "clientsHistory";
    ApiEndpoints_V2["wlanConfig"] = "wlanConfig";
    ApiEndpoints_V2["lanConfig"] = "lanConfig";
    ApiEndpoints_V2["wanConfig"] = "wanConfig";
    ApiEndpoints_V2["models"] = "models";
})(ApiEndpoints_V2 || (ApiEndpoints_V2 = {}));
