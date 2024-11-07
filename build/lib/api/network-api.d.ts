import { RequestOptions, Response } from '@adobe/fetch';
import { EventEmitter } from 'node:events';
import { NetworkLogging } from './network-logging.js';
import { NetworkDevice } from './network-types-device.js';
import { NetworkClient } from './network-types-client.js';
export declare class NetworkApi extends EventEmitter {
    private logPrefix;
    private apiErrorCount;
    private apiLastSuccess;
    private fetch;
    private headers;
    private log;
    private host;
    private port;
    private site;
    private password;
    private username;
    private _eventsWs;
    constructor(host: string, port: number, site: string, username: string, password: string, log?: NetworkLogging);
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
    getDevices(): Promise<NetworkDevice[] | undefined>;
    getClients(): Promise<NetworkClient[] | undefined>;
    getApiEndpoint(endpoint: ApiEndpoints): string;
    launchEventsWs(): Promise<boolean>;
}
export declare enum ApiEndpoints {
    login = "login",
    self = "self",
    devices = "devices",
    clients = "clients"
}
