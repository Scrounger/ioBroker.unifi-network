import { Headers, context } from "@adobe/fetch";
import { EventEmitter } from "node:events";
export class NetworkApi extends EventEmitter {
    logPrefix = 'NetworkApi';
    adapter;
    _eventsWs;
    apiErrorCount;
    apiLastSuccess;
    fetch;
    headers;
    host;
    password;
    username;
    constructor(adapter) {
        // Initialize our parent.
        super();
        const logPrefix = `[${this.logPrefix}.constructor]`;
        this.adapter = adapter;
        this._eventsWs = null;
        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.fetch = context({ alpnProtocols: ["h2" /* ALPNProtocol.ALPN_HTTP2 */], rejectUnauthorized: false, userAgent: "unifi-protect" }).fetch;
        this.headers = new Headers();
        this.host = "";
        this.username = "";
        this.password = "";
        this.adapter.log.warn(`${logPrefix} init`);
    }
}
