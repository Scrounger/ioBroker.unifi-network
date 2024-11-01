import { API_ERROR_LIMIT, API_RETRY_INTERVAL, API_TIMEOUT } from './settings-api.js';
import { AbortError, FetchError, Headers, context, timeoutSignal } from '@adobe/fetch';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
export class NetworkApi extends EventEmitter {
    logPrefix = 'NetworkApi';
    // private adapter: ioBroker.Adapter;
    apiErrorCount;
    apiLastSuccess;
    fetch;
    headers;
    log;
    host;
    password;
    username;
    _eventsWs;
    constructor(host, username, password, log = console) {
        // Initialize our parent.
        super();
        this.log = log;
        this._eventsWs = null;
        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.fetch = context({ alpnProtocols: ["h2" /* ALPNProtocol.ALPN_HTTP2 */], rejectUnauthorized: false, userAgent: 'unifi-network' }).fetch;
        this.headers = new Headers();
        this.host = host;
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
                this.log.debug(`${logPrefix} we are already logged in to the controller`);
                return true;
            }
            // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
            if (!this.headers.has('X-CSRF-Token')) {
                // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Network
                // controller and checking the headers for it.
                const response = await this.retrieve('https://' + this.host, { method: 'GET' });
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
                this.log.debug(`${logPrefix} successfully logged into the controller`);
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
                this.log.error(`${logPrefix} Invalid login credentials given. Please check your login and password.`);
                return null;
            }
            // Insufficient privileges.
            if (response.status === 403) {
                this.log.error(`${logPrefix} Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.`);
                return null;
            }
            if (!response.ok && isServerSideIssue(response.status)) {
                this.log.error(`${logPrefix} Unable to connect to the Network controller. This is usually temporary and will occur during device reboots.`);
                return null;
            }
            // Some other unknown error occurred.
            if (!response.ok) {
                this.log.error(`${logPrefix} ${response.status} - ${response.statusText}`);
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
                        this.log.error(`${logPrefix} Hostname or IP address not found: ${this.host}. Please ensure the address you configured for this UniFi Network controller is correct.`);
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
    getApiEndpoint(endpoint) {
        let endpointSuffix;
        let endpointPrefix = '/proxy/network/api/';
        switch (endpoint) {
            case ApiEndpoints.login:
                endpointPrefix = '/api/';
                endpointSuffix = 'auth/login';
                break;
            case ApiEndpoints.self:
                endpointPrefix = '/api/';
                endpointSuffix = 'users/self';
                break;
            default:
                break;
        }
        if (!endpointSuffix) {
            return '';
        }
        return 'https://' + this.host + endpointPrefix + endpointSuffix;
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
            const ws = new WebSocket('wss://' + this.host + '/proxy/network/wss/s/default/events?' + 'clients=v2&next_ai_notifications=true&critical_notifications=true', {
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
                // If we're closing before fully established it's because we're shutting down the API - ignore it.
                if (error.message !== 'WebSocket was closed before the connection was established') {
                    this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
                }
                ws.terminate();
            });
            // Process messages as they come in.
            ws.on('message', messageHandler = (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    if (event.meta.message === WebSocketEvents.client) {
                        this.emit(WebSocketListener.client, event);
                    }
                    else if (event.meta.message === WebSocketEvents.device) {
                        this.emit(WebSocketListener.device, event);
                    }
                    else if (event.meta.message === WebSocketEvents.events) {
                        this.emit(WebSocketListener.events, event);
                    }
                    else {
                        if (!event.meta.message.includes('unifi-device:sync') && !event.meta.message.includes('session-metadata:sync')) {
                            this.log.warn(`${logPrefix} meta.message: ${event.meta.message} not implemented!`);
                        }
                    }
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
}
export var ApiEndpoints;
(function (ApiEndpoints) {
    ApiEndpoints["login"] = "login";
    ApiEndpoints["self"] = "self";
})(ApiEndpoints || (ApiEndpoints = {}));
export var WebSocketListener;
(function (WebSocketListener) {
    WebSocketListener["client"] = "client";
    WebSocketListener["device"] = "device";
    WebSocketListener["events"] = "events";
})(WebSocketListener || (WebSocketListener = {}));
export var WebSocketEvents;
(function (WebSocketEvents) {
    WebSocketEvents["client"] = "client:sync";
    WebSocketEvents["device"] = "device:sync";
    WebSocketEvents["events"] = "events";
})(WebSocketEvents || (WebSocketEvents = {}));
