// Lib imports
import { Pool, errors, interceptors, request, Agent } from 'undici';
import { STATUS_CODES } from 'node:http';
import { EventEmitter } from 'node:events';
import util from 'node:util';
import WebSocket from 'ws';
import { CookieJar } from 'tough-cookie';
// API imports
import { API_TIMEOUT } from './network-settings.js';
import { NetworkReportInterval } from './network-types-report-stats.js';
import { SystemLogType } from './network-types-system-log.js';
export var ApiEndpoints;
(function (ApiEndpoints) {
    ApiEndpoints["login"] = "login";
    ApiEndpoints["self"] = "self";
    ApiEndpoints["devices"] = "devices";
    ApiEndpoints["deviceRest"] = "deviceRest";
    ApiEndpoints["deviceCommand"] = "deviceCommand";
    ApiEndpoints["clients"] = "clients";
    ApiEndpoints["clientsActive"] = "clientsActive";
    ApiEndpoints["clientCommand"] = "clientCommand";
    ApiEndpoints["wlanConfig"] = "wlanConfig";
    ApiEndpoints["lanConfig"] = "lanConfig";
    ApiEndpoints["firewallGroup"] = "firewallGroup";
    ApiEndpoints["sysinfo"] = "sysinfo";
    ApiEndpoints["sites"] = "sites";
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
    ApiEndpoints_V2["networkMembersGroups"] = "networkMemberGroups";
    ApiEndpoints_V2["networkMembersGroup"] = "networkMemberGroup";
    ApiEndpoints_V2["info"] = "info";
    ApiEndpoints_V2["vpnConnections"] = "vpnConnections";
})(ApiEndpoints_V2 || (ApiEndpoints_V2 = {}));
export class NetworkApi extends EventEmitter {
    logPrefix = 'NetworkApi';
    adapter;
    dispatcher;
    cookieJar = new CookieJar();
    apiErrorCount;
    // private apiLastSuccess: number;
    headers;
    log;
    host;
    port;
    isUnifiOs;
    site;
    password;
    username;
    _eventsWs;
    connectionTimeout = undefined;
    controllerUrl;
    isControllerDetected = false;
    constructor(host, port, site, username, password, adapter) {
        // Initialize our parent.
        super();
        this.adapter = adapter;
        this.log = adapter.log;
        this._eventsWs = null;
        this.apiErrorCount = 0;
        // this.apiLastSuccess = 0;
        this.headers = {};
        this.host = host;
        this.port = port;
        this.isUnifiOs = false;
        this.site = site;
        this.username = username;
        this.password = password;
        this.controllerUrl = `https://${this.host}:${port}`;
    }
    async login() {
        const logPrefix = `[${this.logPrefix}.login]`;
        try {
            if (!this.isControllerDetected) {
                // let us check if we have Unifi OS or self hosted controller
                await this.detectController();
            }
            this.logout();
            if (this.isControllerDetected) {
                // Let's attempt to login.
                const loginSuccess = await this.loginController();
                // Publish the result to our listeners
                this.emit('login', loginSuccess);
                // Return the status of our login attempt.
                return loginSuccess;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
    async detectController() {
        const logPrefix = `[${this.logPrefix}.detectUnifiOs]`;
        try {
            // for detection we need a diffrent dispatcher, because pool is bind to server address
            const tmpDispatcher = this.detectControllerDispatcher();
            const response = await this.retrieve(`https://${this.host}:${this.port}`, { method: 'GET', dispatcher: tmpDispatcher });
            this.log.debug(`${logPrefix} detect self hosted controller repsonse: ${JSON.stringify(response)}`);
            if (response !== null && response.statusCode === 302 && response.headers.location === '/manage') {
                this.controllerUrl = `https://${this.host}:${this.port}`;
                this.isUnifiOs = false;
                this.isControllerDetected = true;
                this.log.debug(`${logPrefix} self hosted controller detected`);
            }
            else {
                // Unifi OS controller on port 443 (e.g. UDM/UDM-Pro/UDR)
                const response = await this.retrieve(`https://${this.host}`, { method: 'GET', dispatcher: tmpDispatcher });
                this.log.debug(`${logPrefix} detect UniFi OS controller repsonse: ${JSON.stringify(response)}`);
                if (this.responseOk(response?.statusCode)) {
                    this.controllerUrl = `https://${this.host}`;
                    this.isUnifiOs = true;
                    this.isControllerDetected = true;
                    this.log.debug(`${logPrefix} UniFi OS controller detected`);
                }
                else {
                    // Unifi OS controller on custom port (e.g. UniFi OS Server)
                    const response = await this.retrieve(`https://${this.host}:${this.port}`, { method: 'GET', dispatcher: tmpDispatcher });
                    this.log.debug(`${logPrefix} detect UniFi OS controller on port ${this.port} repsonse: ${JSON.stringify(response)}`);
                    if (this.responseOk(response?.statusCode)) {
                        this.controllerUrl = `https://${this.host}:${this.port}`;
                        this.isUnifiOs = true;
                        this.isControllerDetected = true;
                        this.log.debug(`${logPrefix} UniFi OS controller on port ${this.port} detected`);
                    }
                    else {
                        this.log.error(`${logPrefix} Unable to detect UniFi OS or self hosted controller!`);
                        this.logout();
                    }
                }
            }
            void tmpDispatcher?.destroy();
        }
        catch (error) {
            this.log.error(`${logPrefix} Unable to detect UniFi OS or self hosted controller! ${error}`);
            this.logout();
        }
    }
    async loginController() {
        const logPrefix = `[${this.logPrefix}.loginController]`;
        try {
            // If we're already logged in, we're done.
            if (this.headers.cookie || this.headers['x-csrf-token']) {
                return true;
            }
            // Utility to grab the headers we're interested in a normalized manner.
            const getHeader = (name, headers) => {
                const rawHeader = headers?.[name.toLowerCase()];
                if (!rawHeader) {
                    return null;
                }
                // Normalize it to a string:
                return Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
            };
            // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
            if (!this.headers['x-csrf-token'] && this.isUnifiOs) {
                // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Network
                // controller and checking the headers for it.
                const response = await this.retrieve(this.controllerUrl, { method: 'GET' });
                if (this.responseOk(response?.statusCode)) {
                    const csrfToken = getHeader('X-Csrf-Token', response?.headers);
                    // Preserve the CSRF token, if found, for future API calls.
                    if (csrfToken) {
                        this.headers['x-csrf-token'] = csrfToken;
                    }
                }
            }
            // Log us in.
            const response = await this.retrieve(this.getApiEndpoint(ApiEndpoints.login), {
                body: JSON.stringify({ username: this.username, password: this.password, rememberMe: true }),
                method: "POST"
            });
            // Something went wrong with the login call, possibly a controller reboot or failure.
            if (!this.responseOk(response?.statusCode)) {
                this.logout();
                return false;
            }
            // We're logged in. Let's configure our headers.
            const csrfToken = getHeader('X-Updated-Csrf-Token', response?.headers) ?? getHeader('X-Csrf-Token', response?.headers);
            const cookie = await this.cookieJar.getCookieString(this.controllerUrl);
            if (cookie) {
                // Only preserve the token element of the cookie and not the superfluous information that's been added to it.
                if (csrfToken) {
                    // Unifi OS: Save the CSRF token.                    
                    this.headers['x-csrf-token'] = csrfToken;
                    this.log.debug(`${logPrefix} login to UniFi OS controller successful.`);
                    return await this.checkSites();
                }
                else {
                    if (cookie.includes('unifises') || cookie.includes('csrf_token')) {
                        // self hosted controller
                        this.log.debug(`${logPrefix} login to self hosted UniFi controller successful.`);
                        return await this.checkSites();
                    }
                    else {
                        this.log.error(`${logPrefix} no cookies found`);
                        this.log.debug(`${logPrefix} headers: ${JSON.stringify(response?.headers)}`);
                        this.log.debug(`${logPrefix} headers: ${JSON.stringify(cookie)}`);
                        return false;
                    }
                }
            }
            // Clear out our login credentials.
            this.logout();
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
    async checkSites() {
        const logPrefix = `[${this.logPrefix}.checkSites]`;
        try {
            const sites = await this.getSites();
            if (sites) {
                if (sites.find(site => site.name === this.site)) {
                    return true;
                }
                else {
                    this.log.error(`${logPrefix} site "${this.site}" not found on controller! (available sites: ${sites.map(site => site.name).join(', ')})`);
                }
            }
            else {
                this.log.error(`${logPrefix} unable to retrieve sites from controller!`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return false;
    }
    /**
     * Clear the login credentials and terminate any open connection to the UniFi Network API.
     */
    logout() {
        const logPrefix = `[${this.logPrefix}.logout]`;
        try {
            this.log.debug(`${logPrefix} Logging out and clearing credentials.`);
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Terminate any open connection to the UniFi Network API.
     */
    reset() {
        const logPrefix = `[${this.logPrefix}.reset]`;
        try {
            this._eventsWs?.close();
            this._eventsWs = null;
            if (this.host) {
                // Cleanup any prior pool.
                void this.dispatcher?.destroy();
                // Create an interceptor that allows us to set the user agent to our liking.
                const ua = (dispatch) => (opts, handler) => {
                    opts.headers ??= {};
                    opts.headers['user-agent'] = 'unifi-network';
                    return dispatch(opts, handler);
                };
                // Create a dispatcher using a new pool. We want to explicitly allow self-signed SSL certificates, enabled HTTP2 connections, and allow up to five connections at a
                // time and provide some robust retry handling - we retry each request up to three times, with backoff. We allow for up to five retries, with a maximum wait time of
                // 1500ms per retry, in factors of 2 starting from a 100ms delay.
                this.dispatcher = new Pool(this.controllerUrl, { allowH2: true, clientTtl: 60 * 1000, connect: { rejectUnauthorized: false }, connections: 5 })
                    .compose(ua, interceptors.retry({
                    maxRetries: 5, maxTimeout: 1500, methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH'], minTimeout: 100,
                    statusCodes: [400, 404, 429, 500, 502, 503, 504], timeoutFactor: 2
                }));
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    responseOk(code) {
        return (code !== undefined) && (code >= 200) && (code < 300);
    }
    detectControllerDispatcher() {
        const ua = (dispatch) => (opts, handler) => {
            opts.headers ??= {};
            opts.headers['user-agent'] = 'unifi-network';
            return dispatch(opts, handler);
        };
        return new Agent({ allowH2: true, clientTtl: 60 * 1000, connect: { rejectUnauthorized: false }, connections: 5 })
            .compose(ua, interceptors.retry({
            maxRetries: 5, maxTimeout: 1500, methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH'], minTimeout: 100,
            statusCodes: [400, 404, 429, 500, 502, 503, 504], timeoutFactor: 2
        }))
            .compose(interceptors.redirect({ maxRedirections: 0 }));
    }
    /**
     * Execute an HTTP fetch request to the Network controller.
     *
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   - Parameters to pass on for the endpoint request.
     * @param retrieveOptions
     * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
     */
    async retrieve(url, options = { method: 'GET' }, retrieveOptions = {}) {
        return await this._retrieve(url, options, retrieveOptions, false);
    }
    /**
     * Execute an HTTP fetch request to the Network controller and retriev data as json
     *
     * @param url       Complete URL to execute **without** any additional parameters you want to pass.
     * @param options   Parameters to pass on for the endpoint request.
     * @param retry     Retry once if we have an issue
     * @returns         Returns a promise json object
     */
    async retrievData(url, options = { method: 'GET' }, retry = true) {
        const logPrefix = `[${this.logPrefix}.retrievData]`;
        try {
            const response = await this.retrieve(url, options);
            if (this.responseOk(response?.statusCode)) {
                const data = await response.body.json();
                if (data) {
                    return data;
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return retry ? await this.retrievData(url, options, false) : undefined;
    }
    // Internal interface to communicating HTTP requests with a Network controller, with error handling.
    async _retrieve(url, options = { method: 'GET' }, retrieveOptions = {}, isRetry = false) {
        const logPrefix = `[${this.logPrefix}._retrieve]`;
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
        let response;
        // Create a signal handler to deliver the abort operation.
        const controller = new AbortController();
        this.connectionTimeout = this.adapter.setTimeout(() => controller.abort(), retrieveOptions.timeout);
        this.headers.cookie = await this.cookieJar.getCookieString(this.controllerUrl);
        options.dispatcher = options.dispatcher || this.dispatcher;
        options.headers = this.headers;
        options.signal = controller.signal;
        try {
            // Execute the API request.
            response = await request(url, options);
            // Preemptively increase the error count.
            this.apiErrorCount++;
            if (response.statusCode === 302 && !this.isControllerDetected) {
                return response;
            }
            // Bad username and password.
            if (response.statusCode === 401) {
                this.logout();
                this.log.error(`${logPrefix} Invalid login credentials given. Please check your login and password (code: ${response.statusCode}, url: ${url}).`);
                return null;
            }
            // Insufficient privileges.
            if (response.statusCode === 403) {
                this.log.error(`${logPrefix} Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges (code: ${response.statusCode}, url: ${url}).`);
                return null;
            }
            if (!this.responseOk(response.statusCode)) {
                if (serverErrors.has(response.statusCode)) {
                    this.log.error(`${logPrefix} Unable to connect to the Network controller. This is temporary and may occur during device reboots (code: ${response.statusCode}, url: ${url}).`);
                    return null;
                }
                // Some other unknown error occurred.
                this.log.error(`${logPrefix} ${response.statusCode} - ${STATUS_CODES[response.statusCode]}, url: ${url}`);
                return null;
            }
            // We're all good - return the response and we're done.
            // this.apiLastSuccess = Date.now();
            this.apiErrorCount = 0;
            const setCookie = response.headers['set-cookie'];
            if (setCookie) {
                if (Array.isArray(setCookie)) {
                    for (const c of setCookie) {
                        await this.cookieJar.setCookie(c, this.controllerUrl);
                    }
                }
                else {
                    await this.cookieJar.setCookie(setCookie, this.controllerUrl);
                }
            }
            return response;
        }
        catch (error) {
            if (!this.isControllerDetected) {
                return null;
            }
            // Increment our API error count.
            this.apiErrorCount++;
            // We aborted the connection.
            if ((error instanceof DOMException) && (error.name === 'AbortError')) {
                this.log.error(`${logPrefix} Network controller is taking too long to respond to a request. This error can usually be safely ignored (url: ${url})`);
                return null;
            }
            // We destroyed the pool due to a reset event and our inflight connections are failing.
            if (error instanceof errors.ClientDestroyedError) {
                return null;
            }
            // We destroyed the pool due to a reset event and our inflight connections are failing.
            if (error instanceof errors.RequestRetryError) {
                this.log.error(`${logPrefix} Unable to connect to the Network controller. This is temporary and may occur during device reboots (url: ${url})`);
                return null;
            }
            // Connection timed out.
            if (error instanceof errors.ConnectTimeoutError) {
                this.log.error(`${logPrefix} Connection timed out (url: ${url})`);
                return null;
            }
            let cause;
            if (error instanceof TypeError) {
                cause = error.cause;
            }
            if ((error instanceof Error) && ('code' in error) && (typeof error.code === 'string')) {
                cause = error;
            }
            if (cause) {
                switch (cause.code) {
                    case 'ECONNREFUSED':
                    case 'EHOSTDOWN':
                        this.log.error(`${logPrefix} Connection refused (url: ${url})`);
                        break;
                    case 'ECONNRESET':
                        this.log.error(`${logPrefix} Network connection to Network controller has been reset (url: ${url})`);
                        break;
                    case 'ENOTFOUND':
                        if (this.host) {
                            this.log.error(`${logPrefix} Hostname or IP address not found: ${this.host}. Please ensure the address you configured for this UniFi Network controller is correct (url: ${url})`);
                        }
                        else {
                            this.log.error(`${logPrefix} No hostname or IP address provided (url: ${url})`);
                        }
                        break;
                    default:
                        // If we're logging when we have an error, do so.
                        this.log.error(`${logPrefix} Error: ${cause.code} | ${cause.message}`);
                        break;
                }
                return null;
            }
            this.log.error(`${logPrefix} Error: ${util.inspect(error, { colors: true, depth: null, sorted: true })} (url: ${url})`);
            return null;
        }
        finally {
            // Clear out our response timeout.
            this.adapter.clearTimeout(this.connectionTimeout);
        }
    }
    async sendData(cmd, payload, method = 'POST') {
        const logPrefix = `[${this.logPrefix}.sendData]`;
        let url = `${this.controllerUrl}${this.isUnifiOs ? '/proxy/network' : ''}${cmd}`;
        if (cmd.startsWith('https://')) {
            url = cmd;
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
     *
     * @param separateUnmanaged
     * @param includeTrafficUsage
     * @returns
     */
    async getDevices_V2(separateUnmanaged = false, includeTrafficUsage = false) {
        const logPrefix = `[${this.logPrefix}.getDevices_V2]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.devices)}?separateUnmanaged=${separateUnmanaged}&includeTrafficUsage=${includeTrafficUsage}`);
            if (res) {
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
     *
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
     *
     * @param mac
     * @param includeTrafficUsage
     * @param includeUnifiDevices
     * @param filterKey
     * @param filterVal
     * @returns
     */
    async getClientsActive_V2(mac = undefined, includeTrafficUsage = true, includeUnifiDevices = true, filterKey = undefined, filterVal = undefined) {
        const logPrefix = `[${this.logPrefix}.getClientsActive_V2]`;
        try {
            const url = `${this.getApiEndpoint_V2(ApiEndpoints_V2.clientsActive)}${mac ? `/${mac}` : ''}?includeTrafficUsage=${includeTrafficUsage}&includeUnifiDevices=${includeUnifiDevices}`;
            const res = await this.retrievData(url);
            if (res && res.length > 0) {
                if (!filterKey) {
                    return res;
                }
                else {
                    return res.filter(x => x[filterKey] === filterVal);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List of all configured / known clients on the site
     *
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
     *
     * @param withinHour
     * @param includeUnifiDevices
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
     *
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
     *
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
     *
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
     *
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
     *
     * @param model
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
    /**
     * List all LAN configurations
     *
     * @param firewallGroup_id optional: network id to receive only the configuration for this wlan
     * @returns
     */
    async getFirewallGroup(firewallGroup_id = undefined) {
        const logPrefix = `[${this.logPrefix}.getFirewallGroup]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.firewallGroup)}${firewallGroup_id ? `/${firewallGroup_id.trim()}` : ''}`);
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
     * List all network member groups
     *
     * @returns
     */
    async getNetworkMemberGroups() {
        const logPrefix = `[${this.logPrefix}.getNetworkMemberGroups]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint_V2(ApiEndpoints_V2.networkMembersGroups)}`);
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
    async getReportStats(type, interval, attrs = undefined, mac = undefined, start = undefined, end = undefined) {
        const logPrefix = `[${this.logPrefix}.getReportStats]`;
        try {
            const url = `${this.controllerUrl}${this.isUnifiOs ? '/proxy/network' : ''}/api/s/${this.site}/stat/report/${interval}.${type}`;
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
                body: JSON.stringify(payload)
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
            const url = `${this.controllerUrl}${this.isUnifiOs ? '/proxy/network' : ''}/v2/api/site/${this.site}/system-log/${type}`;
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
                payload.nextAiCategory = ['CLIENT', 'DEVICE', 'INTERNET', 'VPN'];
            }
            else if (type === SystemLogType.devices) {
                if (!macs) {
                    payload.macs = macs;
                }
            }
            else if (type === SystemLogType.admin) {
                payload.activity_keys = ['ACCESSED_NETWORK_WEB', 'ACCESSED_NETWORK_IOS', 'ACCESSED_NETWORK_ANDROID'];
                payload.change_keys = ['CLIENT', 'DEVICE', 'HOTSPOT', 'INTERNET', 'NETWORK', 'PROFILE', 'ROUTING', 'SECURITY', 'SYSTEM', 'VPN', 'WIFI'];
            }
            else if (type === SystemLogType.updates) {
                payload.systemLogDeviceTypes = ['GATEWAYS', 'SWITCHES', 'ACCESS_POINT', 'SMART_POWER', 'BUILDING_TO_BUILDING_BRIDGES', 'UNIFI_LTE'];
            }
            else if (type === SystemLogType.clients) {
                payload.clientType = ['GUEST', 'TELEPORT', 'VPN', 'WIRELESS', 'RADIUS', 'WIRED'];
                payload.guestAuthorizationMethod = ['FACEBOOK_SOCIAL_GATEWAY', 'FREE_TRIAL', 'GOOGLE_SOCIAL_GATEWAY', 'NONE', 'PASSWORD', 'PAYMENT', 'RADIUS', 'VOUCHER'];
            }
            else if (type === SystemLogType.threats) {
                payload.threatTypes = ['HONEYPOT', 'THREAT'];
            }
            else if (type === SystemLogType.triggers) {
                payload.triggerTypes = ['TRAFFIC_RULE', 'TRAFFIC_ROUTE', 'FIREWALL_RULE'];
            }
            const res = await this.retrievData(url, {
                method: 'POST',
                body: JSON.stringify(payload),
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
    async getSysInfo() {
        const logPrefix = `[${this.logPrefix}.getSites]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.sysinfo)}`);
            if (res && res.data && res.data.length > 0) {
                return res.data[0];
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    async getControllerVersion() {
        const logPrefix = `[${this.logPrefix}.getSites]`;
        try {
            const res = await this.getSysInfo();
            if (res && res.version) {
                return res.version;
            }
            else {
                this.log.warn(`${logPrefix} unable to retrieve controller version!`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
    /**
     * List all sites of self hosted controller
     *
     * @returns
     */
    async getSites() {
        const logPrefix = `[${this.logPrefix}.getSites]`;
        try {
            const res = await this.retrievData(`${this.getApiEndpoint(ApiEndpoints.sites)}`);
            if (res && res.data && res.data.length > 0) {
                return res.data;
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
            case ApiEndpoints.sysinfo:
                endpointSuffix = `/api/s/${this.site}/stat/sysinfo`;
                break;
            case ApiEndpoints.sites:
                // only available on self hosted controller
                endpointSuffix = `/api/self/sites`;
                break;
            default:
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        // ToDo: set to silly
        this.log.debug(`getApiEndpoint: ${this.controllerUrl}${endpointPrefix}${endpointSuffix}`);
        return `${this.controllerUrl}${endpointPrefix}${endpointSuffix}`;
    }
    getApiEndpoint_V2(endpoint) {
        //https://ubntwiki.com/products/software/unifi-controller/api
        let endpointSuffix;
        const endpointPrefix = this.isUnifiOs ? '/proxy/network' : '';
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
            case ApiEndpoints_V2.networkMembersGroups:
                endpointSuffix = `/v2/api/site/${this.site}/network-members-groups`;
                break;
            case ApiEndpoints_V2.networkMembersGroup:
                endpointSuffix = `/v2/api/site/${this.site}/network-members-group`;
                break;
            case ApiEndpoints_V2.info:
                endpointSuffix = `/v2/api/site/${this.site}/info`;
                break;
            case ApiEndpoints_V2.vpnConnections:
                endpointSuffix = `/v2/api/site/${this.site}/vpn/connections`;
                break;
            default:
                endpointSuffix = '';
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        // ToDo: set to silly
        this.log.debug(`getApiEndpoint_V2: ${this.controllerUrl}${endpointPrefix}${endpointSuffix}`);
        return `${this.controllerUrl}${endpointPrefix}${endpointSuffix}`;
    }
    async checkCommandSuccessful(result, logPrefix, message, id = undefined) {
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
            this.headers.cookie = await this.cookieJar.getCookieString(this.controllerUrl);
            const url = `${this.controllerUrl.replace('https', 'wss')}${this.isUnifiOs ? '/proxy/network' : ''}/wss/s/${this.site}/events?clients=v2&next_ai_notifications=true&critical_notifications=true`;
            const ws = new WebSocket(url, {
                headers: this.headers,
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
                    if (error.message === 'Unexpected server response: 502' || error.message === 'Unexpected server response: 503' || error.message === 'Unexpected server response: 200') {
                        this.log.error(`${logPrefix} Network controller - WebSocket service is unavailable. This is usually temporary and will occur during device reboots.`);
                    }
                    else {
                        this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                    }
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
                        this.emit('message', event);
                    }
                }
                catch (error) {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
            });
            ws.on('pong', messageHandler = (data) => {
                try {
                    this.emit('pong');
                    this.log.silly(`pong received`);
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
            return false;
        }
        return true;
    }
    wsSendPing() {
        const logPrefix = `[${this.logPrefix}.wsSendPing]`;
        try {
            if (this._eventsWs && this._eventsWs !== null) {
                this._eventsWs.ping();
                this.log.silly(`ping sent`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
