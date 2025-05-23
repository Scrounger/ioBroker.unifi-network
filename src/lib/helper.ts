import _ from "lodash";
import { myCommonState, myCommoneChannelObject, myCommonChannelArray } from "./myTypes";

export function isDeviceCommonEqual(objCommon: ioBroker.DeviceCommon, myCommon: ioBroker.DeviceCommon): boolean {
    return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) &&
        (!myCommon.icon || objCommon.icon === myCommon.icon) &&
        objCommon.desc === myCommon.desc &&
        objCommon.role === myCommon.role &&
        _.isEqual(objCommon.statusStates, myCommon.statusStates)
}

export function isChannelCommonEqual(objCommon: ioBroker.ChannelCommon, myCommon: ioBroker.ChannelCommon): boolean {
    return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) &&
        (!myCommon.icon || objCommon.icon === myCommon.icon) &&
        objCommon.desc === myCommon.desc &&
        objCommon.role === myCommon.role
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

/** Compare common properties of State
 * @param {ioBroker.StateCommon} objCommon
 * @param {ioBroker.StateCommon} myCommon
 * @returns {boolean}
 */
export function isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon): boolean {
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

export function zeroPad(source: any, places: number): string {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}

/**
 * Id without last part
 * @param id 
 * @returns 
 */
export function getIdWithoutLastPart(id: string): string {
    const lastIndex = id.lastIndexOf('.');
    return id.substring(0, lastIndex);
}

/**
 * last part of id
 * @param id 
 * @returns 
 */
export function getIdLastPart(id: string): string {
    let result = id.split('.').pop();
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
export const deepDiffBetweenObjects = (object: any, base: any, adapter: ioBroker.Adapter, allowedKeys: any = undefined, prefix: string = ''): any => {
    const logPrefix = '[deepDiffBetweenObjects]:';

    try {
        const changes = (object, base, prefixInner = ''): any => {
            return _.transform(object, (result, value, key) => {
                const fullKey: string = prefixInner ? `${prefixInner}.${key as string}` : (key as string);

                try {
                    if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                        if (_.isArray(value)) {

                            if (_.some(value, (item: any) => _.isObject(item))) {
                                // objects in array exists
                                const tmp = [];
                                let empty = true;

                                for (let i = 0; i <= value.length - 1; i++) {
                                    const res = deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);

                                    if (!_.isEmpty(res) || res === 0 || res === false) {
                                        // if (!_.has(result, key)) result[key] = [];
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
                                // is pure array
                                adapter.log.warn(`${key}: pure Array (base: ${base[key]}, val: ${value})`);
                                if (!_.isEqual(value, base[key])) {
                                    result[key] = value
                                }
                            }
                        } else if (_.isObject(value) && _.isObject(base[key])) {
                            const res = changes(value, base[key] ? base[key] : {}, fullKey);
                            if (!_.isEmpty(res) || res === 0 || res === false) {
                                result[key] = res;
                            }
                        } else {
                            result[key] = value;
                        }
                    }
                } catch (error) {
                    adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                }
            });
        };

        return changes(object, base, prefix);
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
    }

    return object;
};

/**
 * Collect all properties used in tree defintions
 *
 * @param treefDefintion @see tree-devices.ts @see tree-clients.ts
 * @returns
 */
export function getAllKeysOfTreeDefinition(treefDefintion: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray }): string[] {
    const keys = [];

    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = ''): void {
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
            } else {
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

export function getAllIdsOfTreeDefinition(treefDefintion: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray }): string[] {
    const keys = [];

    // Hilfsfunktion für rekursive Durchsuchung des Objekts
    function recurse(currentObj, prefix = ''): void {
        _.forOwn(currentObj, (value, key) => {
            let fullKey = prefix ? `${prefix}.${key}` : key;

            if (Object.hasOwn(value, 'idChannel') && !_.isObject(value.idChannel)) {
                fullKey = prefix ? `${prefix}.${value.idChannel}` : value.idChannel;
            } else if (Object.hasOwn(value, 'id') && !_.isObject(value.id)) {
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

export function radioToFrequency(radioVal: string, adapter: ioBroker.Adapter): string {
    if (radioVal === 'ng') {
        return '2.4 GHz'
    } else if (radioVal === 'na') {
        return '5 GHz'
    } else {
        adapter.log.warn(`radio ${radioVal} interpreter not implemented! Please create an issue on github.`);
        return radioVal
    }
}

export function radio_nameToFrequency(radio_nameVal: string, adapter: ioBroker.Adapter): string {
    if (radio_nameVal === 'wifi0' || radio_nameVal === 'ra0') {
        return '2.4 GHz'
    } else if (radio_nameVal === 'wifi1' || radio_nameVal === 'rai0') {
        return '5 GHz'
    } else {
        adapter.log.warn(`radio ${radio_nameVal} interpreter not implemented! Please create an issue on github.`);
        return 'n/a'
    }
}