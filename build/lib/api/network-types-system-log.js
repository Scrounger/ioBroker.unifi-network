export var SystemLogType;
(function (SystemLogType) {
    SystemLogType["critical"] = "next-ai-alert";
    SystemLogType["devices"] = "device-alert";
    SystemLogType["admin"] = "admin-activity";
    SystemLogType["updates"] = "update-alert";
    SystemLogType["clients"] = "client-alert";
    SystemLogType["threats"] = "threat-alert";
    SystemLogType["triggers"] = "triggers";
    SystemLogType["vpn"] = "vpn-alert";
})(SystemLogType || (SystemLogType = {}));
