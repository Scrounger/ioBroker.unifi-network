import { NetworkApi } from "./network-api";
import { NetworkDevice } from "./network-types-device";
export declare const apiCommands: {
    devices: {
        restart(ufn: NetworkApi, mac: string): Promise<boolean>;
        cyclePoePortPower(ufn: NetworkApi, mac: string, port_idx: number): Promise<boolean>;
        switchPoePort(val: boolean, port_idx: number, ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        ledOverride(val: string, ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        upgrade(ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        runSpeedtest(ufn: NetworkApi): Promise<boolean>;
    };
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
        reconncet(ufn: NetworkApi, mac: string): Promise<boolean>;
    };
    wlanConf: {
        enable(ufn: NetworkApi, wlan_id: string, enabled: boolean): Promise<boolean>;
    };
};
