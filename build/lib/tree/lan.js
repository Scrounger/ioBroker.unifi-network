import * as myHelper from "../helper.js";
var lan;
((lan2) => {
  let keys = void 0;
  lan2.idChannel = "lan";
  function get() {
    return {
      connected_clients: {
        id: "connected_clients",
        iobType: "number",
        name: "connected clients",
        conditionToCreateState(objDevice, adapter) {
          return (objDevice == null ? void 0 : objDevice.purpose) !== "guest";
        },
        valFromProperty: "dhcp_active_leases"
      },
      connected_guests: {
        id: "connected_guests",
        iobType: "number",
        name: "connected guests",
        conditionToCreateState(objDevice, adapter) {
          return (objDevice == null ? void 0 : objDevice.purpose) === "guest";
        },
        valFromProperty: "dhcp_active_leases"
      },
      enabled: {
        iobType: "boolean",
        name: "WLAN enabled",
        read: true,
        write: true
      },
      ip_subnet: {
        iobType: "string",
        name: "IP subnet"
      },
      internet_access_enabled: {
        id: "internet_enabled",
        iobType: "boolean",
        name: "internet access enabled",
        read: true,
        write: true,
        valFromProperty: "internet_access_enabled"
      },
      name: {
        iobType: "string",
        name: "name",
        required: true
      },
      purpose: {
        id: "type",
        iobType: "string",
        name: "type of network"
      },
      vlan: {
        iobType: "number",
        name: "VLAN Id",
        readVal(val, adapter, cache, deviceOrClient, id) {
          return parseInt(val);
        }
      }
    };
  }
  lan2.get = get;
  function getGlobal() {
    return {
      connected_clients: {
        id: "connected_clients",
        iobType: "number",
        name: "connected clients"
      },
      connected_guests: {
        id: "connected_guests",
        iobType: "number",
        name: "connected guests"
      }
    };
  }
  lan2.getGlobal = getGlobal;
  function getKeys() {
    if (keys === void 0) {
      keys = myHelper.getAllKeysOfTreeDefinition(get());
    }
    return keys;
  }
  lan2.getKeys = getKeys;
  function getStateIDs() {
    return myHelper.getAllIdsOfTreeDefinition(get());
  }
  lan2.getStateIDs = getStateIDs;
})(lan || (lan = {}));
export {
  lan
};
//# sourceMappingURL=lan.js.map
