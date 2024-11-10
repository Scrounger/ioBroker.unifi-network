export var WebSocketEventMessages;
(function (WebSocketEventMessages) {
    WebSocketEventMessages["client"] = "client:sync";
    WebSocketEventMessages["device"] = "device:sync";
    WebSocketEventMessages["user"] = "user:";
    WebSocketEventMessages["events"] = "events";
    WebSocketEventMessages["speedTest"] = "speed-test:update";
})(WebSocketEventMessages || (WebSocketEventMessages = {}));
export var WebSocketEventKeys;
(function (WebSocketEventKeys) {
    WebSocketEventKeys["connected"] = "_Connected";
    WebSocketEventKeys["disconnected"] = "_Disconnected";
    WebSocketEventKeys["blocked"] = "_Blocked";
    WebSocketEventKeys["unblocked"] = "_Unblocked";
    WebSocketEventKeys["roamed"] = "_Roam";
    WebSocketEventKeys["roamedRadio"] = "_RoamRadio";
    // client Wireless
    WebSocketEventKeys["clientWirelessConnected"] = "EVT_WU_Connected";
    WebSocketEventKeys["clientWirelessDisconnected"] = "EVT_WU_Disconnected";
    WebSocketEventKeys["clientWirelessRoamed"] = "EVT_WU_Roam";
    WebSocketEventKeys["clientWirelessRoamedRadio"] = "EVT_WU_RoamRadio";
    // client LAN
    WebSocketEventKeys["clientLanConnected"] = "EVT_LU_Connected";
    WebSocketEventKeys["clientLanDisconnected"] = "EVT_LU_Disconnected";
    WebSocketEventKeys["clientLanBlocked"] = "EVT_LU_Blocked";
    WebSocketEventKeys["clientLanUnblocked"] = "EVT_LU_Unblocked";
    // guest Wireless
    WebSocketEventKeys["guestWirelessConnected"] = "EVT_WG_Connected";
    WebSocketEventKeys["guestWirelessDisconnected"] = "EVT_WG_Disconnected";
    WebSocketEventKeys["guestWirelessRoamed"] = "EVT_WG_Roam";
    WebSocketEventKeys["guestWirelessRoamedRadio"] = "EVT_WG_RoamRadio";
    // guest LAN
    WebSocketEventKeys["guestLanConnected"] = "EVT_LG_Connected";
    WebSocketEventKeys["guestLanDisconnected"] = "EVT_LG_Disconnected";
    WebSocketEventKeys["guestLanBlocked"] = "EVT_LG_Blocked";
    WebSocketEventKeys["guestLanUnblocked"] = "EVT_LG_Unblocked";
    // client or guest Wireless
    WebSocketEventKeys["clientOrGuestWirelessBlocked"] = "EVT_WC_Blocked";
    WebSocketEventKeys["clientOrGuestWirelessUnblocked"] = "EVT_WC_Unblocked";
    // Gateway
    WebSocketEventKeys["gatewayRestarted"] = "EVT_GW_Restarted";
    // Switch
    WebSocketEventKeys["switchRestarted"] = "EVT_SW_Restarted";
    WebSocketEventKeys["switchAutoReadopted"] = "EVT_SW_AutoReadopted";
    WebSocketEventKeys["switchLostContact"] = "EVT_SW_Lost_Contact";
    WebSocketEventKeys["accessPointRestarted"] = "EVT_AP_Restarted";
})(WebSocketEventKeys || (WebSocketEventKeys = {}));
