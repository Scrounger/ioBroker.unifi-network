import { ApiEndpoints } from "./network-api.js";
import * as myHelper from '../helper.js';
export class NetworkCommands {
    ufn;
    adapter;
    log;
    logPrefixCls = `NetworkCommands`;
    constructor(ufn, adapter) {
        this.ufn = ufn;
        this.adapter = adapter;
        this.log = adapter.log;
    }
    // Gerätebefehle als Pfeilfunktion im Objekt, damit der Kontext beibehalten wird
    Devices = {
        restart: async (device, id) => {
            const logPrefix = `[${this.logPrefixCls}.Devices.restart]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: 'restart', mac: device.mac.toLowerCase() });
            if (result) {
                this.ackCommand(id, logPrefix, `'${device.name}' (mac: ${device.mac})`);
                return true;
            }
            return false;
        },
        ledOverride: async (device, id, val) => {
            const logPrefix = `[${this.logPrefixCls}.Devices.ledOverride]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { led_override: val }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `LED override to '${val}' - '${device.name}' (mac: ${device.mac})`);
                return true;
            }
            return false;
        },
        upgrade: async (device, id) => {
            const logPrefix = `[${this.logPrefixCls}.Devices.upgrade]`;
            if (device.upgradable) {
                const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}/upgrade`, { mac: device.mac.toLowerCase() });
                if (result) {
                    await this.ackCommand(id, logPrefix, `upgrade to new firmware version - '${device.name}' (mac: ${device.mac})`);
                    return true;
                }
            }
            else {
                this.log.warn(`${logPrefix} ${device.name} (mac: ${device.mac}): upgrade not possible, no new firmware avaiable`);
            }
            return false;
        },
        disableAccessPoint: async (device, id, disabled) => {
            const logPrefix = `[${this.logPrefixCls}.Devices.disableAccessPoint]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device._id.trim()}`, { disabled: disabled }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `{state.val ? 'disable' : 'enable'} access point '${device.name}' (mac: ${device.mac})`);
                return true;
            }
            return false;
        },
        runSpeedtest: async (device, id) => {
            const logPrefix = `[${this.logPrefixCls}.Devices.runSpeedtest]`;
            const wan_interface = myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id));
            const interface_name = device[wan_interface].ifname;
            const payload = { cmd: 'speedtest' };
            if (interface_name) {
                payload.interface_name = interface_name;
            }
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, payload);
            if (result) {
                await this.ackCommand(id, logPrefix, `run speedtest (mac: ${device.mac}, wan: ${wan_interface}, interface: ${interface_name})`);
                return true;
            }
            return false;
        },
        Port: {
            cyclePoePower: async (device, id) => {
                const logPrefix = `[${this.logPrefixCls}.Devices.Port.cyclePoePower]`;
                try {
                    const port_idx = parseInt(myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id)).replace('port_', ''));
                    const port_table = device.port_table;
                    if (port_table && port_table.length > 0) {
                        const indexOfPort = port_table.findIndex(x => x.port_idx === port_idx);
                        if (indexOfPort !== -1) {
                            if (!port_table[indexOfPort].poe_enable) {
                                this.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: cycle poe power not possible, because poe is not enabled for this port!`);
                                return false;
                            }
                        }
                    }
                    const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: 'power-cycle', port_idx: port_idx, mac: device.mac.toLowerCase() });
                    if (result) {
                        await this.ackCommand(id, logPrefix, `cycle poe power - '${device.name}' (mac: ${device.mac}) - Port ${port_idx}`);
                        return true;
                    }
                }
                catch (error) {
                    this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
                }
                return false;
            },
            switchPoe: async (device, id, val) => {
                const logPrefix = `[${this.logPrefixCls}.Devices.Port.port_switchPoe]`;
                const port_idx = parseInt(myHelper.getIdLastPart(myHelper.getIdWithoutLastPart(id)).replace('port_', ''));
                let port_overrides = device.port_overrides;
                if (port_overrides && port_overrides.length > 0) {
                    const indexOfPort = port_overrides.findIndex(x => x.port_idx === port_idx);
                    if (indexOfPort !== -1) {
                        // port_overrides has settings for this port
                        if (port_overrides[indexOfPort].portconf_id) {
                            // ethernet profil is configured, change poe not possible
                            this.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: switch poe not possible, because 'ethernet port profile' is configured!`);
                            return false;
                        }
                        else {
                            port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                        }
                    }
                    else {
                        // port_overrides has no settings for this port
                        this.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: not exists in port_overrides object -> create item`);
                        port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                    }
                    const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { port_overrides: port_overrides }, 'PUT');
                    if (result) {
                        this.logCommandSuccess(logPrefix, `command sent: switch poe power - '${val ? 'on' : 'off'}' '${device.name}' (mac: ${device.mac}) - Port ${port_idx}`);
                        return true;
                    }
                }
                else {
                    this.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: no port_overrides object exists!`);
                }
                return false;
            },
        }
    };
    Clients = {
        block: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.block]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'block-sta', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `block - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        unblock: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.unblock]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'unblock-sta', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `unblock - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        reconnect: async (client, id) => {
            const logPrefix = `[${this.logPrefixCls}.Client.reconnect]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'kick-sta', mac: client.mac.toLowerCase() });
            if (result) {
                await this.ackCommand(id, logPrefix, `reconnect - '${client.name}' (mac: ${client.mac})`);
            }
            return false;
        },
        authorizeGuest: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.authorizeGuest]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'authorize-guest', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `authorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        unauthorizeGuest: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.unauthorizeGuest]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'unauthorize-guest', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `unauthorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        setName: async (client, name) => {
            const logPrefix = `[${this.logPrefixCls}.Client.setName]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clients)}/${client.user_id.trim()}`, { _id: client.user_id, name: name }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `set name - '${client.name}' (mac: ${client.mac}, new name: ${name})`);
                return true;
            }
            return false;
        }
        // async remove(ufn: NetworkApi, mac: string) {
        //     // controller 5.9.x only
        //     const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'forget-sta', mac: mac.toLowerCase() });
        //     return result === null ? false : true;
        // },
    };
    WLanConf = {
        enable: async (wlanConf, enabled) => {
            const logPrefix = `[${this.logPrefixCls}.WLanConf.enable]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.wlanConfig)}/${wlanConf._id.trim()}`, { enabled: enabled }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `wlan ${enabled ? 'enabled' : 'disabled'} - '${wlanConf.name}' (id: ${wlanConf._id})`);
                return true;
            }
            return false;
        }
    };
    LanConf = {
        enable: async (lanConf, enabled) => {
            const logPrefix = `[${this.logPrefixCls}.LanConf.enable]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${lanConf._id.trim()}`, { enabled: enabled }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `lan ${enabled ? 'enabled' : 'disabled'} - '${lanConf.name}' (id: ${lanConf._id})`);
                return true;
            }
            return false;
        },
        internet_access_enabled: async (lanConf, enabled) => {
            const logPrefix = `[${this.logPrefixCls}.LanConf.internet_access_enabled]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${lanConf._id.trim()}`, { internet_access_enabled: enabled }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `internet access of lan ${enabled ? 'enabled' : 'disabled'} - '${lanConf.name}' (id: ${lanConf._id})`);
                return true;
            }
            return false;
        }
    };
    FirewallGroup = {
        setName: async (firewallGroup, name) => {
            const logPrefix = `[${this.logPrefixCls}.FirewallGroup.setName]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${firewallGroup._id.trim()}`, { name: name }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `firewall group '${firewallGroup.name}' - 'name' set to '${name}' (id: ${firewallGroup._id})`);
                return true;
            }
            return false;
        },
        setGroupMembers: async (firewallGroup, members) => {
            const logPrefix = `[${this.logPrefixCls}.FirewallGroup.setGroupMembers]`;
            try {
                const memObj = JSON.parse(members);
                const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${firewallGroup._id.trim()}`, { group_members: memObj }, 'PUT');
                if (result) {
                    this.logCommandSuccess(logPrefix, `firewall group '${firewallGroup.name}' - 'members' set to '${members}' (id: ${firewallGroup._id})`);
                    return true;
                }
            }
            catch (error) {
                this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
            return false;
        }
    };
    async ackCommand(id, logPrefix, message) {
        await this.adapter.setState(id, { ack: true });
        this.logCommandSuccess(logPrefix, message);
    }
    logCommandSuccess(logPrefix, message) {
        this.log.info(`${logPrefix} command successfully sent: ${message}`);
    }
}
