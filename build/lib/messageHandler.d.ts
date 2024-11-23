import { NetworkApi } from "./api/network-api";
export declare const messageHandler: {
    device: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
    };
    client: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
        stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
    };
    wlan: {
        list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
    };
};
