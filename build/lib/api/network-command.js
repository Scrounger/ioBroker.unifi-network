import { ApiEndpoints } from "./network-api.js";
const apiCommands = {
  devices: {
    async restart(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: "restart", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async port_cyclePoePower(ufn, mac, port_idx, device) {
      const logPrefix = "[apiCommands.cyclePoePortPower]";
      try {
        const port_table = device.port_table;
        if (port_table && port_table.length > 0) {
          const indexOfPort = port_table.findIndex((x) => x.port_idx === port_idx);
          if (indexOfPort !== -1) {
            if (!port_table[indexOfPort].poe_enable) {
              ufn.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: cycle poe power not possible, because poe is not enabled for this port!`);
              return false;
            }
          }
        }
        const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: "power-cycle", port_idx, mac: mac.toLowerCase() });
        return result === null ? false : true;
      } catch (error) {
        ufn.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
      }
      return false;
    },
    async port_switchPoe(val, port_idx, ufn, device) {
      const logPrefix = "[apiCommands.switchPoePort]";
      let port_overrides = device.port_overrides;
      if (port_overrides && port_overrides.length > 0) {
        const indexOfPort = port_overrides.findIndex((x) => x.port_idx === port_idx);
        if (indexOfPort !== -1) {
          if (port_overrides[indexOfPort].portconf_id) {
            ufn.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: switch poe not possible, because 'ethernet port profile' is configured!`);
            return false;
          } else {
            port_overrides[indexOfPort].poe_mode = val ? "auto" : "off";
          }
        } else {
          ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: not exists in port_overrides object -> create item`);
          port_overrides[indexOfPort].poe_mode = val ? "auto" : "off";
        }
        const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { port_overrides }, "PUT");
        return result === null ? false : true;
      } else {
        ufn.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: no port_overrides object exists!`);
        return false;
      }
    },
    async ledOverride(val, ufn, device) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { led_override: val }, "PUT");
      return result === null ? false : true;
    },
    async upgrade(ufn, device) {
      const logPrefix = "[apiCommands.upgrade]";
      if (device.upgradable) {
        const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}/upgrade`, { mac: device.mac.toLowerCase() });
        return result === null ? false : true;
      } else {
        ufn.log.warn(`${logPrefix} ${device.name} (mac: ${device.mac}): upgrade not possible, no new firmware avaiable`);
      }
      return false;
    },
    async runSpeedtest(ufn, interface_name = void 0) {
      let payload = { cmd: "speedtest" };
      if (interface_name) {
        payload.interface_name = interface_name;
      }
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, payload);
      return result === null ? false : true;
    },
    async disableAccessPoint(ufn, ap_id, disabled) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${ap_id.trim()}`, { disabled }, "PUT");
      return result === null ? false : true;
    }
  },
  clients: {
    async block(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: "block-sta", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async unblock(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: "unblock-sta", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async reconncet(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: "kick-sta", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async authorizeGuest(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: "authorize-guest", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async unauthorizeGuest(ufn, mac) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: "unauthorize-guest", mac: mac.toLowerCase() });
      return result === null ? false : true;
    },
    async setName(ufn, user_id, name) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clients)}/${user_id.trim()}`, { _id: user_id, name }, "PUT");
      return result === null ? false : true;
    }
    // async remove(ufn: NetworkApi, mac: string) {
    //     // controller 5.9.x only
    //     const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'forget-sta', mac: mac.toLowerCase() });
    //     return result === null ? false : true;
    // },
  },
  wlanConf: {
    async enable(ufn, wlan_id, enabled) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.wlanConfig)}/${wlan_id.trim()}`, { enabled }, "PUT");
      return result === null ? false : true;
    }
  },
  lanConf: {
    async enable(ufn, lan_id, enabled) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${lan_id.trim()}`, { enabled }, "PUT");
      return result === null ? false : true;
    },
    async internet_access_enabled(ufn, lan_id, enabled) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.lanConfig)}/${lan_id.trim()}`, { internet_access_enabled: enabled }, "PUT");
      return result === null ? false : true;
    }
  },
  firewallGroup: {
    async setName(ufn, firewallGroup_id, name) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${firewallGroup_id.trim()}`, { name }, "PUT");
      return result === null ? false : true;
    },
    async setGroupMembers(ufn, firewallGroup_id, members) {
      const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.firewallGroup)}/${firewallGroup_id.trim()}`, { group_members: JSON.parse(members) }, "PUT");
      return result === null ? false : true;
    }
  }
};
export {
  apiCommands
};
//# sourceMappingURL=network-command.js.map
