import type { NetworkApi } from "./api/network-api.js";
export declare const messageHandler: {
    device: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): void;
    };
    client: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): void;
    };
    wlan: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): void;
    };
    lan: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): void;
    };
    firewallGroup: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): void;
    };
};
