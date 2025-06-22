import * as myHelper from "../helper.js";
var firewallGroup;
((firewallGroup2) => {
  let keys = void 0;
  firewallGroup2.idChannel = "firewall.groups";
  function get() {
    return {
      name: {
        iobType: "string",
        name: "name",
        write: true,
        required: true
      },
      group_members: {
        iobType: "string",
        write: true,
        name: "group members",
        readVal(val, adapter, cache, deviceOrClient, id) {
          return JSON.stringify(val);
        }
      },
      group_type: {
        iobType: "string",
        name: "type",
        states: {
          "port-group": "Port",
          "address-group": "IPv4",
          "ipv6-address-group": "IPv6"
        }
      }
    };
  }
  firewallGroup2.get = get;
  function getKeys() {
    if (keys === void 0) {
      keys = myHelper.getAllKeysOfTreeDefinition(get());
    }
    return keys;
  }
  firewallGroup2.getKeys = getKeys;
  function getStateIDs() {
    return myHelper.getAllIdsOfTreeDefinition(get());
  }
  firewallGroup2.getStateIDs = getStateIDs;
})(firewallGroup || (firewallGroup = {}));
export {
  firewallGroup
};
//# sourceMappingURL=firewall-group.js.map
