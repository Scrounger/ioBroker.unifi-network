export var WebSocketEventMessages;
(function (WebSocketEventMessages) {
    WebSocketEventMessages["client"] = "client:sync";
    WebSocketEventMessages["device"] = "device:sync";
    WebSocketEventMessages["user"] = "user:sync";
    WebSocketEventMessages["events"] = "events";
})(WebSocketEventMessages || (WebSocketEventMessages = {}));
export var WebSocketEventKeys;
(function (WebSocketEventKeys) {
    WebSocketEventKeys["clientConnected"] = "EVT_WU_Connected";
    WebSocketEventKeys["clientDisconnected"] = "EVT_WU_Disconnected";
    WebSocketEventKeys["clientRoamed"] = "EVT_WU_Roam";
    WebSocketEventKeys["clientRoamedRadio"] = "EVT_WU_RoamRadio";
    WebSocketEventKeys["guestConnected"] = "EVT_WG_Connected";
    WebSocketEventKeys["guestDisconnected"] = "EVT_WG_Disconnected";
    WebSocketEventKeys["guestRoamed"] = "EVT_WG_Roam";
    WebSocketEventKeys["guestRoamedRadio"] = "EVT_WG_RoamRadio";
})(WebSocketEventKeys || (WebSocketEventKeys = {}));
