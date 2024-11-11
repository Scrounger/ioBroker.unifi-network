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
/** Compare common properties of State
 * @param {ioBroker.StateCommon} objCommon
 * @param {ioBroker.StateCommon} myCommon
 * @returns {boolean}
 */
export function isStateCommonEqual(objCommon, myCommon) {
    return _.isEqual(objCommon.name, myCommon.name) &&
        objCommon.type === myCommon.type &&
        objCommon.read === myCommon.read &&
        objCommon.write === objCommon.write &&
        objCommon.role === myCommon.role &&
        objCommon.def === myCommon.def &&
        objCommon.unit === myCommon.unit &&
        objCommon.icon === myCommon.icon &&
        objCommon.desc == myCommon.desc &&
        objCommon.max === myCommon.max &&
        objCommon.min === myCommon.min &&
        _.isEqual(objCommon.states, myCommon.states);
}
export function zeroPad(source, places) {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}
/**
 * Id without last part
 * @param id
 * @returns
 */
export function getIdWithoutLastPart(id) {
    const lastIndex = id.lastIndexOf('.');
    return id.substring(0, lastIndex);
}
/**
 * last part of id
 * @param id
 * @returns
 */
export function getIdLastPart(id) {
    let result = id.split('.').pop();
    return result ? result : "";
}
/**
 * Compare two objects and return properties that are diffrent
 * @param obj1
 * @param obj2
 * @returns
 */
export function difference(object, base) {
    function changes(object, base) {
        return _.transform(object, function (result, value, key) {
            if (!_.isEqual(value, base[key])) {
                result[key] = (_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value;
            }
        });
    }
    return changes(object, base);
}
