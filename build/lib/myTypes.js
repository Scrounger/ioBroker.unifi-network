export var WebSocketEventMessages;
(function (WebSocketEventMessages) {
    WebSocketEventMessages["client"] = "client";
    WebSocketEventMessages["device"] = "device:sync";
    WebSocketEventMessages["user"] = "user:";
    WebSocketEventMessages["events"] = "events";
    WebSocketEventMessages["speedTest"] = "speed-test:update";
    WebSocketEventMessages["wlanConf"] = "wlanconf:";
    WebSocketEventMessages["lanConf"] = "networkconf";
})(WebSocketEventMessages || (WebSocketEventMessages = {}));
export const WebSocketEvent_Connected = ['EVT_WU_Connected', 'EVT_WG_Connected', 'EVT_LU_Connected', 'EVT_LG_Connected'];
export const WebSocketEvent_Disconnected = ['EVT_WU_Disconnected', 'EVT_WG_Disconnected', 'EVT_LU_Disconnected', 'EVT_LG_Disconnected'];
export const WebSocketEvent = {
    device: {
        Connected: ['EVT_SW_Connected', 'EVT_AP_Connected', 'EVT_GW_Connected'],
        Disconnected: ['EVT_SW_Disconnected', 'EVT_AP_Disconnected', 'EVT_GW_Disconnected'],
        Restarted: ['EVT_SW_Restarted', 'EVT_AP_Restarted', 'EVT_GW_Restarted'],
        ChannelChanged: ['EVT_AP_ChannelChanged']
    },
    client: {
        Connected: ['EVT_WU_Connected', 'EVT_WG_Connected', 'EVT_LU_Connected', 'EVT_LG_Connected'],
        Disconnected: ['EVT_WU_Disconnected', 'EVT_WG_Disconnected', 'EVT_LU_Disconnected', 'EVT_LG_Disconnected'],
        Roamed: ['EVT_WU_Roam', 'EVT_WG_Roam'],
        RoamedRadio: ['EVT_WU_RoamRadio', 'EVT_WG_RoamRadio'],
        Blocked: ['EVT_WC_Blocked', 'EVT_LC_Blocked'],
        Unblocked: ['EVT_WC_Unblocked', 'EVT_LC_Unblocked'],
    },
};
