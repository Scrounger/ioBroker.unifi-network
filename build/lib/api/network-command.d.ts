import { NetworkApi } from "./network-api";
export declare const apiCommands: {
    devices: {
        restart(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
};
