import type { NetworkApi } from "./api/network-api.js";
export declare const messageHandler: {
    device: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi | undefined): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.myAdapter, ufn: NetworkApi | undefined): void;
    };
    client: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi | undefined): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.myAdapter, ufn: NetworkApi | undefined): void;
    };
    wlan: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi | undefined): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.myAdapter, ufn: NetworkApi | undefined): void;
    };
    lan: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi | undefined): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.myAdapter, ufn: NetworkApi | undefined): void;
    };
    firewall: {
        group: {
            list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi | undefined): Promise<void>;
            stateList(message: ioBroker.Message, adapter: ioBroker.myAdapter, ufn: NetworkApi | undefined): void;
        };
    };
};
