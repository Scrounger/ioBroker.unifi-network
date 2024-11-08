export const apiCommands = {
    devices: {
        async restart(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'restart', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async cyclePoePortPower(ufn, mac, port_idx) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'power-cycle', port_idx: port_idx, mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async switchPoePort(val, port_idx, ufn, device) {
            const logPrefix = '[apiCommands.switchPoePort]';
            let port_overrides = device.port_overrides;
            if (port_overrides && port_overrides.length > 0) {
                const indexOfPort = port_overrides.findIndex(x => x.port_idx === port_idx);
                if (indexOfPort !== -1) {
                    // port_overrides has settings for this port
                    if (port_overrides[indexOfPort].portconf_id) {
                        // ethernet profil is configured, change poe not possible
                        ufn.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: switch poe not possible, because 'ethernet port profile' is configured!`);
                        return;
                    }
                    else {
                        port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                    }
                }
                else {
                    // port_overrides has no settings for this port
                    ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: not exists in port_overrides object -> create item`);
                    port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                }
                ufn.updateDeviceSettings(device.device_id, { port_overrides: port_overrides });
            }
            else {
                ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: no port_overrides object exists!`);
            }
        }
    },
    clients: {
        async block(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'block-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async unblock(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'unblock-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async reconncet(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'kick-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        // async remove(ufn: NetworkApi, mac: string) {
        //     // controller 5.9.x only
        //     const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'forget-sta', mac: mac.toLowerCase() });
        //     return result === null ? false : true;
        // },
    }
};
