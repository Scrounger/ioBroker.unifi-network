import { NetworkApi } from "./network-api";
import { NetworkDevice } from "./network-types-device";

export const apiCommands = {
    devices: {
        async restart(ufn: NetworkApi, mac: string): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'restart', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
        async cyclePoePortPower(ufn: NetworkApi, mac: string, port_idx: number, device: NetworkDevice) {
            const logPrefix = '[apiCommands.cyclePoePortPower]'

            try {
                const port_table = device.port_table;

                if (port_table && port_table.length > 0) {
                    const indexOfPort = port_table.findIndex(x => x.port_idx === port_idx);

                    if (indexOfPort !== -1) {
                        if (!port_table[indexOfPort].poe_enable) {
                            ufn.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: cycle poe power not possible, because poe is not enabled for this port!`);
                            return false;
                        }
                    }
                }

                const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'power-cycle', port_idx: port_idx, mac: mac.toLowerCase() });
                return result === null ? false : true;

            } catch (error) {
                ufn.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }

            return false;
        },
        async switchPoePort(val: boolean, port_idx: number, ufn: NetworkApi, device: NetworkDevice): Promise<boolean> {
            const logPrefix = '[apiCommands.switchPoePort]'

            let port_overrides = device.port_overrides;

            if (port_overrides && port_overrides.length > 0) {
                const indexOfPort = port_overrides.findIndex(x => x.port_idx === port_idx);

                if (indexOfPort !== -1) {

                    // port_overrides has settings for this port
                    if (port_overrides[indexOfPort].portconf_id) {
                        // ethernet profil is configured, change poe not possible
                        ufn.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: switch poe not possible, because 'ethernet port profile' is configured!`);
                        return false;
                    } else {
                        port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                    }
                } else {
                    // port_overrides has no settings for this port
                    ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: not exists in port_overrides object -> create item`);
                    port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                }

                const result = await ufn.sendData(`/api/s/${ufn.site}/rest/device/${device.device_id.trim()}`, { port_overrides: port_overrides }, 'PUT');

                return result === null ? false : true;

            } else {
                ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: no port_overrides object exists!`);

                return false;
            }
        },
        async ledOverride(val: string, ufn: NetworkApi, device: NetworkDevice): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/rest/device/${device.device_id.trim()}`, { led_override: val }, 'PUT');

            return result === null ? false : true;
        },
        async upgrade(ufn: NetworkApi, device: NetworkDevice): Promise<boolean> {
            const logPrefix = '[apiCommands.upgrade]'

            if (device.upgradable) {
                const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr/upgrade`, { mac: device.mac.toLowerCase() });

                return result === null ? false : true;
            } else {
                ufn.log.warn(`${logPrefix} ${device.name} (mac: ${device.mac}): upgrade not possible, no new firmware avaiable`);
            }

            return false;
        },
        async runSpeedtest(ufn: NetworkApi): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'speedtest' });

            return result === null ? false : true;
        }
    },
    clients: {
        async block(ufn: NetworkApi, mac: string): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'block-sta', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
        async unblock(ufn: NetworkApi, mac: string): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'unblock-sta', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
        async reconncet(ufn: NetworkApi, mac: string): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'kick-sta', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
        // async remove(ufn: NetworkApi, mac: string) {
        //     // controller 5.9.x only
        //     const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'forget-sta', mac: mac.toLowerCase() });

        //     return result === null ? false : true;
        // },
    },
    wlanConf: {
        async enable(ufn: NetworkApi, wlan_id: string, enabled: boolean): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/rest/wlanconf/${wlan_id.trim()}`, { enabled: enabled }, 'PUT');

            return result === null ? false : true;
        }
    },
    lanConf: {
        async enable(ufn: NetworkApi, lan_id: string, enabled: boolean): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/rest/networkconf/${lan_id.trim()}`, { enabled: enabled }, 'PUT');

            return result === null ? false : true;
        },
        async internet_access_enabled(ufn: NetworkApi, lan_id: string, enabled: boolean): Promise<boolean> {
            const result = await ufn.sendData(`/api/s/${ufn.site}/rest/networkconf/${lan_id.trim()}`, { internet_access_enabled: enabled }, 'PUT');

            return result === null ? false : true;
        }
    }
}