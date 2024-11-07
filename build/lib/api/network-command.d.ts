import { NetworkApi } from "./network-api";
export declare const apiCommands: {
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
};
