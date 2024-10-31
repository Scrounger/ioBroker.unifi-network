import { NetworkLogging } from "./network-logging";
import { RequestOptions, Response } from '@adobe/fetch';
import { EventEmitter } from 'node:events';
export declare class NetworkApi extends EventEmitter {
    private logPrefix;
    private apiErrorCount;
    private apiLastSuccess;
    private fetch;
    private headers;
    private log;
    private host;
    private password;
    private username;
    private _eventsWs;
    constructor(log?: NetworkLogging);
    login(host: string, username: string, password: string): Promise<boolean>;
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
     * @param url       - Complete URL to execute **without** any additional parameters you want to pass (e.g. https://unvr.local/proxy/protect/cameras/someid/snapshot).
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
    private _retrieve;
    retrievData(url: string, options?: RequestOptions): Promise<any | null>;
    getApiEndpoint(endpoint: ApiEndpoints): string;
}
export declare enum ApiEndpoints {
    login = "login",
    self = "self"
}
