export function isChannelCommonEqual(objCommon, myCommon) {
    return JSON.stringify(objCommon.name) === JSON.stringify(myCommon.name) &&
        objCommon.icon == myCommon.icon &&
        objCommon.desc === myCommon.desc &&
        objCommon.role === myCommon.role;
}
