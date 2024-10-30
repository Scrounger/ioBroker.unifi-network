import { EventEmitter } from "node:events";
export declare class NetworkApi extends EventEmitter {
    private logPrefix;
    private adapter;
    private _eventsWs;
    private apiErrorCount;
    private apiLastSuccess;
    private fetch;
    private headers;
    private host;
    private password;
    private username;
    constructor(adapter: ioBroker.Adapter);
}
