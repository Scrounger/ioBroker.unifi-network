import { NetworkApi } from "./network-api";
import { NetworkDevice } from "./network-types-device";
export declare const apiCommands: {
    devices: {
        restart(ufn: NetworkApi, mac: string): Promise<boolean>;
        cyclePoePortPower(ufn: NetworkApi, mac: string, port_idx: number): Promise<boolean>;
        switchPoePort(val: boolean, port_idx: number, ufn: NetworkApi, device: NetworkDevice): Promise<void>;
    };
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
        reconncet(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
};
