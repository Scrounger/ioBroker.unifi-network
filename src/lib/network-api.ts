
import { ALPNProtocol, AbortError, FetchError, Headers, Request, RequestOptions, Response, context, timeoutSignal } from "@adobe/fetch";
import { EventEmitter } from "node:events";
import WebSocket from "ws";


export class NetworkApi extends EventEmitter {
    private logPrefix: string = 'NetworkApi'
    private adapter: ioBroker.Adapter;

    private _eventsWs: WebSocket | null;

    private apiErrorCount: number;
    private apiLastSuccess: number;
    private fetch: (url: string | Request, options?: RequestOptions) => Promise<Response>;
    private headers: Headers;
    private host: string;
    private password: string;
    private username: string;


    constructor(adapter: ioBroker.Adapter) {
        // Initialize our parent.
        super();

        const logPrefix = `[${this.logPrefix}.constructor]`

        this.adapter = adapter;

        this._eventsWs = null;
        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.fetch = context({ alpnProtocols: [ALPNProtocol.ALPN_HTTP2], rejectUnauthorized: false, userAgent: "unifi-protect" }).fetch;
        this.headers = new Headers();
        this.host = "";
        this.username = "";
        this.password = "";

        this.adapter.log.warn(`${logPrefix} init`);
    }

}