import _ from "lodash";
export function isDeviceCommonEqual(objCommon, myCommon) {
    return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) &&
        (!myCommon.icon || objCommon.icon === myCommon.icon) &&
        objCommon.desc === myCommon.desc &&
        objCommon.role === myCommon.role &&
        _.isEqual(objCommon.statusStates, myCommon.statusStates);
}
export function isChannelCommonEqual(objCommon, myCommon) {
    return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) &&
        (!myCommon.icon || objCommon.icon === myCommon.icon) &&
        objCommon.desc === myCommon.desc &&
        objCommon.role === myCommon.role;
}
export function getObjectByString(path, obj, separator = '.') {
    const properties = Array.isArray(path) ? path : path.split(separator);
    return properties.reduce((prev, curr) => prev?.[curr], obj);
}
export function getAllowedCommonStates(path, obj, separator = '.') {
    const objByString = getObjectByString(path, obj, separator);
    const states = {};
    if (objByString) {
        for (const str of objByString) {
            states[str] = str;
        }
        return states;
    }
    return undefined;
}
/**
 * Compare common properties of State
 *
 * @param objCommon
 * @param  myCommon
 * @returns
 */
export function isStateCommonEqual(objCommon, myCommon) {
    return _.isEqual(objCommon.name, myCommon.name) &&
        _.isEqual(objCommon.type, myCommon.type) &&
        _.isEqual(objCommon.read, myCommon.read) &&
        _.isEqual(objCommon.write, myCommon.write) &&
        _.isEqual(objCommon.role, myCommon.role) &&
        _.isEqual(objCommon.def, myCommon.def) &&
        _.isEqual(objCommon.unit, myCommon.unit) &&
        _.isEqual(objCommon.icon, myCommon.icon) &&
        _.isEqual(objCommon.desc, myCommon.desc) &&
        _.isEqual(objCommon.max, myCommon.max) &&
        _.isEqual(objCommon.min, myCommon.min) &&
        _.isEqual(objCommon.states, myCommon.states);
}
export function zeroPad(source, places) {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}
/**
 * Id without last part
 *
 * @param id
 * @returns
 */
export function getIdWithoutLastPart(id) {
    const lastIndex = id.lastIndexOf('.');
    return id.substring(0, lastIndex);
}
/**
 * last part of id
 *
 * @param id
 * @returns
 */
export function getIdLastPart(id) {
    const result = id.split('.').pop();
    return result ? result : "";
}
/**
 * Compare two objects and return properties that are diffrent
 *
 * @param object
 * @param base
 * @param adapter
 * @param allowedKeys
 * @param prefix
 * @returns
 */
export function deepDiffBetweenObjects(object, base, adapter, allowedKeys = undefined, prefix = '') {
    const logPrefix = '[deepDiffBetweenObjects]:';
    try {
        const changes = (object, base, prefixInner = '') => {
            return _.transform(object, (result, value, key) => {
                const fullKey = prefixInner ? `${prefixInner}.${key}` : key;
                try {
                    if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                        if (_.isArray(value)) {
                            if (_.some(value, (item) => _.isObject(item))) {
                                // objects in array exists
                                const tmp = [];
                                let empty = true;
                                for (let i = 0; i <= value.length - 1; i++) {
                                    const res = deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);
                                    if (!_.isEmpty(res) || res === 0 || res === false) {
                                        // if (!_.has(result, key)) result[key] = [];
                                        tmp.push(res);
                                        empty = false;
                                    }
                                    else {
                                        tmp.push(null);
                                    }
                                }
                                if (!empty) {
                                    result[key] = tmp;
                                }
                            }
                            else {
                                // is pure array
                                if (!_.isEqual(value, base[key])) {
                                    result[key] = value;
                                }
                            }
                        }
                        else if (_.isObject(value) && _.isObject(base[key])) {
                            const res = changes(value, base[key] ? base[key] : {}, fullKey);
                            if (!_.isEmpty(res) || res === 0 || res === false) {
                                result[key] = res;
                            }
                        }
                        else {
                            result[key] = value;
                        }
                    }
                }
                catch (error) {
                    adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                }
            });
        };
        return changes(object, base, prefix);
    }
    catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
    }
    return object;
}
/**
 * Collect all properties used in tree defintions
 *
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export function getAllKeysOfTreeDefinition(treefDefintion) {
    const keys = [];
    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = '') {
        _.forOwn(currentObj, (value, key) => {
            const fullKey = (prefix ? `${prefix}.${key}` : key).replace('.array', '').replace('.object', '');
            // Wenn der Wert ein Objekt ist (und kein Array), dann weiter rekursiv gehen
            if (_.isObject(value) && typeof value !== 'function' && key !== 'states') {
                keys.push(fullKey);
                // Wenn es ein Array oder Object ist, dann rekursiv weitergehen
                if (_.isArray(value) || _.isObject(value)) {
                    // Nur unter "array" oder "object" rekursiv weiter
                    recurse(value, fullKey);
                }
            }
            else {
                if (key === 'valFromProperty') {
                    const prefixCleared = getIdWithoutLastPart(prefix);
                    keys.push(`${prefixCleared ? `${prefixCleared}.` : ''}${value}`);
                }
            }
        });
    }
    // Start der Rekursion
    recurse(treefDefintion);
    return _.uniq(keys);
}
export function getAllIdsOfTreeDefinition(treefDefintion) {
    const keys = [];
    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = '') {
        _.forOwn(currentObj, (value, key) => {
            let fullKey = prefix ? `${prefix}.${key}` : key;
            if (Object.hasOwn(value, 'idChannel') && !_.isObject(value.idChannel)) {
                fullKey = prefix ? `${prefix}.${value.idChannel}` : value.idChannel;
            }
            else if (Object.hasOwn(value, 'id') && !_.isObject(value.id)) {
                fullKey = prefix ? `${prefix}.${value.id}` : value.id;
            }
            fullKey = fullKey.replace('.array', '').replace('.object', '');
            // Wenn der Wert ein Objekt ist (und kein Array), dann weiter rekursiv gehen
            if (_.isObject(value) && typeof value !== 'function' && key !== 'states') {
                if (!_.has(value, 'required')) {
                    keys.push(fullKey);
                }
                // Wenn es ein Array oder Object ist, dann rekursiv weitergehen
                if (_.isArray(value) || _.isObject(value)) {
                    // Nur unter "array" oder "object" rekursiv weiter
                    recurse(value, fullKey);
                }
            }
        });
    }
    // Start der Rekursion
    recurse(treefDefintion);
    return _.uniq(keys);
}
export function radioToFrequency(radioVal, adapter) {
    if (radioVal === 'ng') {
        return '2.4 GHz';
    }
    else if (radioVal === 'na') {
        return '5 GHz';
    }
    else {
        adapter.log.warn(`radio ${radioVal} interpreter not implemented! Please create an issue on github.`);
        return radioVal;
    }
}
export function radio_nameToFrequency(radio_nameVal, adapter) {
    if (radio_nameVal === 'wifi0' || radio_nameVal === 'ra0') {
        return '2.4 GHz';
    }
    else if (radio_nameVal === 'wifi1' || radio_nameVal === 'rai0') {
        return '5 GHz';
    }
    else {
        adapter.log.warn(`radio ${radio_nameVal} interpreter not implemented! Please create an issue on github.`);
        return 'n/a';
    }
}
export function getTreeNameOrKey(obj, path = []) {
    const result = {};
    if (obj && typeof obj === "object") {
        if ("iobType" in obj) {
            const lastKey = path[path.length - 1];
            result[obj.name ?? lastKey] = obj.name ?? lastKey;
        }
        for (const [childKey, value] of Object.entries(obj)) {
            if (value && typeof value === "object") {
                Object.assign(result, getTreeNameOrKey(value, [...path, childKey]));
            }
        }
    }
    return result;
}
/**
 * generate a list with all defined names, that can be used for translation
 *
 * @param tree
 * @param adapter
 * @param i18n
 */
export function tree2Translation(tree, adapter, i18n) {
    const result = getTreeNameOrKey(tree);
    for (const key of Object.keys(result)) {
        if (Object.keys(i18n.getTranslatedObject(key)).length > 1) {
            delete result[key];
        }
    }
    if (result && Object.keys(result).length > 0) {
        return result;
    }
    else {
        return null;
    }
}
