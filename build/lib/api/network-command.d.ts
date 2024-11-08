import { NetworkApi } from "./network-api";
export declare const apiCommands: {
    devices: {
        restart(ufn: NetworkApi, mac: string): Promise<boolean>;
        cyclePoePortPower(ufn: NetworkApi, mac: string, port_idx: number): Promise<boolean>;
    };
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
        reconncet(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
};
