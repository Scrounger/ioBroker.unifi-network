import _ from "lodash";
function isDeviceCommonEqual(objCommon, myCommon) {
  return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role && _.isEqual(objCommon.statusStates, myCommon.statusStates);
}
function isChannelCommonEqual(objCommon, myCommon) {
  return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role;
}
function getObjectByString(path, obj, separator = ".") {
  const properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce((prev, curr) => prev == null ? void 0 : prev[curr], obj);
}
function getAllowedCommonStates(path, obj, separator = ".") {
  const objByString = getObjectByString(path, obj, separator);
  const states = {};
  if (objByString) {
    for (const str of objByString) {
      states[str] = str;
    }
    return states;
  }
  return void 0;
}
function isStateCommonEqual(objCommon, myCommon) {
  return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.type, myCommon.type) && _.isEqual(objCommon.read, myCommon.read) && _.isEqual(objCommon.write, myCommon.write) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.def, myCommon.def) && _.isEqual(objCommon.unit, myCommon.unit) && _.isEqual(objCommon.icon, myCommon.icon) && _.isEqual(objCommon.desc, myCommon.desc) && _.isEqual(objCommon.max, myCommon.max) && _.isEqual(objCommon.min, myCommon.min) && _.isEqual(objCommon.states, myCommon.states);
}
function zeroPad(source, places) {
  const zero = places - source.toString().length + 1;
  return Array(+(zero > 0 && zero)).join("0") + source;
}
function getIdWithoutLastPart(id) {
  const lastIndex = id.lastIndexOf(".");
  return id.substring(0, lastIndex);
}
function getIdLastPart(id) {
  let result = id.split(".").pop();
  return result ? result : "";
}
const deepDiffBetweenObjects = (object, base, adapter, allowedKeys = void 0, prefix = "") => {
  const logPrefix = "[deepDiffBetweenObjects]:";
  try {
    const changes = (object2, base2, prefixInner = "") => {
      return _.transform(object2, (result, value, key) => {
        const fullKey = prefixInner ? `${prefixInner}.${key}` : key;
        try {
          if (!_.isEqual(value, base2[key]) && (allowedKeys && allowedKeys.includes(fullKey) || allowedKeys === void 0)) {
            if (_.isArray(value)) {
              if (_.some(value, (item) => _.isObject(item))) {
                const tmp = [];
                let empty = true;
                for (let i = 0; i <= value.length - 1; i++) {
                  const res = deepDiffBetweenObjects(value[i], base2[key] && base2[key][i] ? base2[key][i] : {}, adapter, allowedKeys, fullKey);
                  if (!_.isEmpty(res) || res === 0 || res === false) {
                    tmp.push(res);
                    empty = false;
                  } else {
                    tmp.push(null);
                  }
                }
                if (!empty) {
                  result[key] = tmp;
                }
              } else {
                adapter.log.warn(`${key.toString()}: pure Array (base: ${base2[key]}, val: ${value})`);
                if (!_.isEqual(value, base2[key])) {
                  result[key] = value;
                }
              }
            } else if (_.isObject(value) && _.isObject(base2[key])) {
              const res = changes(value, base2[key] ? base2[key] : {}, fullKey);
              if (!_.isEmpty(res) || res === 0 || res === false) {
                result[key] = res;
              }
            } else {
              result[key] = value;
            }
          }
        } catch (error) {
          adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object2)}, base: ${JSON.stringify(base2)}`);
        }
      });
    };
    return changes(object, base, prefix);
  } catch (error) {
    adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
  }
  return object;
};
function getAllKeysOfTreeDefinition(treefDefintion) {
  const keys = [];
  function recurse(currentObj, prefix = "") {
    _.forOwn(currentObj, (value, key) => {
      const fullKey = (prefix ? `${prefix}.${key}` : key).replace(".array", "").replace(".object", "");
      if (_.isObject(value) && typeof value !== "function" && key !== "states") {
        keys.push(fullKey);
        if (_.isArray(value) || _.isObject(value)) {
          recurse(value, fullKey);
        }
      } else {
        if (key === "valFromProperty") {
          const prefixCleared = getIdWithoutLastPart(prefix);
          keys.push(`${prefixCleared ? `${prefixCleared}.` : ""}${value}`);
        }
      }
    });
  }
  recurse(treefDefintion);
  return _.uniq(keys);
}
function getAllIdsOfTreeDefinition(treefDefintion) {
  const keys = [];
  function recurse(currentObj, prefix = "") {
    _.forOwn(currentObj, (value, key) => {
      let fullKey = prefix ? `${prefix}.${key}` : key;
      if (Object.hasOwn(value, "idChannel") && !_.isObject(value.idChannel)) {
        fullKey = prefix ? `${prefix}.${value.idChannel}` : value.idChannel;
      } else if (Object.hasOwn(value, "id") && !_.isObject(value.id)) {
        fullKey = prefix ? `${prefix}.${value.id}` : value.id;
      }
      fullKey = fullKey.replace(".array", "").replace(".object", "");
      if (_.isObject(value) && typeof value !== "function" && key !== "states") {
        if (!_.has(value, "required")) {
          keys.push(fullKey);
        }
        if (_.isArray(value) || _.isObject(value)) {
          recurse(value, fullKey);
        }
      }
    });
  }
  recurse(treefDefintion);
  return _.uniq(keys);
}
function radioToFrequency(radioVal, adapter) {
  if (radioVal === "ng") {
    return "2.4 GHz";
  } else if (radioVal === "na") {
    return "5 GHz";
  } else {
    adapter.log.warn(`radio ${radioVal} interpreter not implemented! Please create an issue on github.`);
    return radioVal;
  }
}
function radio_nameToFrequency(radio_nameVal, adapter) {
  if (radio_nameVal === "wifi0" || radio_nameVal === "ra0") {
    return "2.4 GHz";
  } else if (radio_nameVal === "wifi1" || radio_nameVal === "rai0") {
    return "5 GHz";
  } else {
    adapter.log.warn(`radio ${radio_nameVal} interpreter not implemented! Please create an issue on github.`);
    return "n/a";
  }
}
export {
  deepDiffBetweenObjects,
  getAllIdsOfTreeDefinition,
  getAllKeysOfTreeDefinition,
  getAllowedCommonStates,
  getIdLastPart,
  getIdWithoutLastPart,
  getObjectByString,
  isChannelCommonEqual,
  isDeviceCommonEqual,
  isStateCommonEqual,
  radioToFrequency,
  radio_nameToFrequency,
  zeroPad
};
//# sourceMappingURL=helper.js.map
