export var reportInterval;
(function (reportInterval) {
    reportInterval["5minutes"] = "5minutes";
    reportInterval["hourly"] = "hourly";
    reportInterval["daily"] = "daily";
    reportInterval["monthly"] = "monthly";
})(reportInterval || (reportInterval = {}));
export var reportType;
(function (reportType) {
    reportType["site"] = "site";
    reportType["gateway"] = "gw";
    reportType["switch"] = "sw";
    reportType["accessPoint"] = "ap";
    reportType["client"] = "user";
})(reportType || (reportType = {}));
