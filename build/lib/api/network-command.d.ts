import { NetworkApi } from "./network-api";
import { NetworkDevice } from "./network-types-device";
export declare const apiCommands: {
    devices: {
        restart(ufn: NetworkApi, mac: string): Promise<boolean>;
        port_cyclePoePower(ufn: NetworkApi, mac: string, port_idx: number, device: NetworkDevice): Promise<boolean>;
        port_switchPoe(val: boolean, port_idx: number, ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        ledOverride(val: string, ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        upgrade(ufn: NetworkApi, device: NetworkDevice): Promise<boolean>;
        runSpeedtest(ufn: NetworkApi, interface_name?: string | undefined): Promise<boolean>;
        disableAccessPoint(ufn: NetworkApi, ap_id: string, disabled: boolean): Promise<boolean>;
    };
    clients: {
        block(ufn: NetworkApi, mac: string): Promise<boolean>;
        unblock(ufn: NetworkApi, mac: string): Promise<boolean>;
        reconncet(ufn: NetworkApi, mac: string): Promise<boolean>;
        authorizeGuest(ufn: NetworkApi, mac: string): Promise<boolean>;
        unauthorizeGuest(ufn: NetworkApi, mac: string): Promise<boolean>;
        setName(ufn: NetworkApi, user_id: string, name: string): Promise<boolean>;
    };
    wlanConf: {
        enable(ufn: NetworkApi, wlan_id: string, enabled: boolean): Promise<boolean>;
    };
    lanConf: {
        enable(ufn: NetworkApi, lan_id: string, enabled: boolean): Promise<boolean>;
        internet_access_enabled(ufn: NetworkApi, lan_id: string, enabled: boolean): Promise<boolean>;
    };
};
