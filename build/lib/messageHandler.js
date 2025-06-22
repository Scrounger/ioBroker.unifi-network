import _ from "lodash";
import * as tree from "./tree/index.js";
import * as myHelper from "./helper.js";
let deviceList = void 0;
let deviceStateList = void 0;
let clientList = void 0;
let clientStateList = void 0;
let wlanList = void 0;
let wlanStateList = void 0;
let lanList = void 0;
let lanStateList = void 0;
let firewallGroupList = void 0;
let firewallGroupStateList = void 0;
const messageHandler = {
  device: {
    async list(message, adapter, ufn) {
      var _a;
      if (deviceList === void 0) {
        const data = (_a = await ufn.getDevices_V2()) == null ? void 0 : _a.network_devices;
        deviceList = [];
        if (data && data !== null) {
          for (let device of data) {
            deviceList.push({
              label: `${device.name} (${device.mac})`,
              value: device.mac
            });
          }
        }
        deviceList = _.orderBy(deviceList, ["label"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, deviceList, message.callback);
    },
    async stateList(message, adapter, ufn) {
      if (deviceStateList === void 0) {
        const states = tree.device.getStateIDs();
        deviceStateList = [];
        if (states) {
          for (let i = 0; i <= states.length - 1; i++) {
            if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
              deviceStateList.push({
                label: `[Channel]	 ${states[i]}`,
                value: states[i]
              });
            } else {
              deviceStateList.push({
                label: `[State]		 ${states[i]}`,
                value: states[i]
              });
            }
          }
        }
        deviceStateList = _.orderBy(deviceStateList, ["value"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, deviceStateList, message.callback);
    }
  },
  client: {
    async list(message, adapter, ufn) {
      var _a;
      if (clientList === void 0) {
        const data = await ufn.getClients();
        clientList = [];
        if (data && data !== null) {
          for (let client of data) {
            const name = ((_a = client.unifi_device_info_from_ucore) == null ? void 0 : _a.name) || client.display_name || client.name || client.hostname;
            clientList.push({
              label: `${name} (${client.mac})`,
              value: client.mac
            });
          }
        }
        clientList = _.orderBy(clientList, ["label"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, clientList, message.callback);
    },
    async stateList(message, adapter, ufn) {
      if (clientStateList === void 0) {
        const states = tree.client.getStateIDs();
        clientStateList = [];
        if (states) {
          for (let i = 0; i <= states.length - 1; i++) {
            if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
              clientStateList.push({
                label: `[Channel]	 ${states[i]}`,
                value: states[i]
              });
            } else {
              clientStateList.push({
                label: `[State]		 ${states[i]}`,
                value: states[i]
              });
            }
          }
        }
        clientStateList = _.orderBy(clientStateList, ["value"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, clientStateList, message.callback);
    }
  },
  wlan: {
    async list(message, adapter, ufn) {
      if (wlanList === void 0) {
        const data = await ufn.getWlanConfig_V2();
        wlanList = [];
        if (data && data !== null) {
          for (let wlan of data) {
            wlanList.push({
              label: wlan.configuration.name,
              value: wlan.configuration._id
            });
          }
        }
        wlanList = _.orderBy(wlanList, ["label"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, wlanList, message.callback);
    },
    async stateList(message, adapter, ufn) {
      if (wlanStateList === void 0) {
        const states = tree.wlan.getStateIDs();
        wlanStateList = [];
        if (states) {
          for (let i = 0; i <= states.length - 1; i++) {
            if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
              wlanStateList.push({
                label: `[Channel]	 ${states[i]}`,
                value: states[i]
              });
            } else {
              wlanStateList.push({
                label: `[State]		 ${states[i]}`,
                value: states[i]
              });
            }
          }
        }
        wlanStateList = _.orderBy(wlanStateList, ["value"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, wlanStateList, message.callback);
    }
  },
  lan: {
    async list(message, adapter, ufn) {
      if (lanList === void 0) {
        const data = await ufn.getLanConfig_V2();
        lanList = [];
        if (data && data !== null) {
          for (let lan of data) {
            lanList.push({
              label: `${lan.configuration.name}${lan.configuration.vlan ? ` (VLAN: ${lan.configuration.vlan})` : ""}`,
              value: lan.configuration._id
            });
          }
        }
        lanList = _.orderBy(lanList, ["label"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, lanList, message.callback);
    },
    async stateList(message, adapter, ufn) {
      if (lanStateList === void 0) {
        const states = tree.lan.getStateIDs();
        lanStateList = [];
        if (states) {
          for (let i = 0; i <= states.length - 1; i++) {
            if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
              lanStateList.push({
                label: `[Channel]	 ${states[i]}`,
                value: states[i]
              });
            } else {
              lanStateList.push({
                label: `[State]		 ${states[i]}`,
                value: states[i]
              });
            }
          }
        }
        lanStateList = _.orderBy(lanStateList, ["value"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, lanStateList, message.callback);
    }
  },
  firewallGroup: {
    async list(message, adapter, ufn) {
      if (firewallGroupList === void 0) {
        const data = await ufn.getFirewallGroup();
        firewallGroupList = [];
        if (data && data !== null) {
          for (let firewallGroup of data) {
            firewallGroupList.push({
              label: `${firewallGroup.name}`,
              value: firewallGroup._id
            });
          }
        }
        firewallGroupList = _.orderBy(firewallGroupList, ["label"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, firewallGroupList, message.callback);
    },
    async stateList(message, adapter, ufn) {
      if (firewallGroupStateList === void 0) {
        const states = tree.firewallGroup.getStateIDs();
        firewallGroupStateList = [];
        if (states) {
          for (let i = 0; i <= states.length - 1; i++) {
            if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
              firewallGroupStateList.push({
                label: `[Channel]	 ${states[i]}`,
                value: states[i]
              });
            } else {
              firewallGroupStateList.push({
                label: `[State]		 ${states[i]}`,
                value: states[i]
              });
            }
          }
        }
        firewallGroupStateList = _.orderBy(firewallGroupStateList, ["value"], ["asc"]);
      }
      if (message.callback)
        adapter.sendTo(message.from, message.command, firewallGroupStateList, message.callback);
    }
  }
};
export {
  messageHandler
};
//# sourceMappingURL=messageHandler.js.map
