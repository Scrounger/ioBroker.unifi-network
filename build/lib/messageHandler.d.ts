import { NetworkApi } from "./api/network-api";
export declare const messageHandler: {
    device: {
        deviceList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi): Promise<void>;
    };
};
