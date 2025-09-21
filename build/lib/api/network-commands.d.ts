import { type NetworkApi } from "./network-api.js";
import type { NetworkClient } from "./network-types-client.js";
export declare class NetworkCommands {
    private ufn;
    private adapter;
    private log;
    private logPrefixCls;
    constructor(ufn: NetworkApi, adapter: ioBroker.myAdapter);
    Clients: {
        authorizeGuest: (client: NetworkClient) => Promise<boolean>;
        unauthorizeGuest: (client: NetworkClient) => Promise<boolean>;
        setName: (client: NetworkClient, name: string) => Promise<boolean>;
    };
    private ackCommand;
    private logCommandSuccess;
}
