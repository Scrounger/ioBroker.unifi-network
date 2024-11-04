export var WebSocketEventMessages;
(function (WebSocketEventMessages) {
    WebSocketEventMessages["client"] = "client:sync";
    WebSocketEventMessages["device"] = "device:sync";
    WebSocketEventMessages["events"] = "events";
})(WebSocketEventMessages || (WebSocketEventMessages = {}));
export var WebSocketEventKeys;
(function (WebSocketEventKeys) {
    WebSocketEventKeys["clientConnected"] = "EVT_WU_Connected";
    WebSocketEventKeys["clientDisconnected"] = "EVT_WU_Disconnected";
    WebSocketEventKeys["clientRoamed"] = "EVT_WU_Roam";
    WebSocketEventKeys["guestConnected"] = "EVT_WG_Connected";
    WebSocketEventKeys["guestDisconnected"] = "EVT_WG_Disconnected";
    WebSocketEventKeys["guestRoamed"] = "EVT_WG_Roam";
})(WebSocketEventKeys || (WebSocketEventKeys = {}));
