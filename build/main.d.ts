import * as utils from '@iobroker/adapter-core';
import { NetworkApi } from './lib/api/network-api.js';
import { NetworkEvent, NetworkEventClient, NetworkEventDevice, NetworkEventLanConfig, NetworkEventSpeedTest, NetworkEventWlanConfig } from './lib/api/network-types.js';
import { NetworkDevice } from './lib/api/network-types-device.js';
import { NetworkWlanConfig, NetworkWlanConfig_V2 } from './lib/api/network-types-wlan-config.js';
import { ConnectedClients, myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject, myNetworkClient } from './lib/myTypes.js';
import { NetworkLanConfig, NetworkLanConfig_V2 } from './lib/api/network-types-lan-config.js';
declare class UnifiNetwork extends utils.Adapter {
    ufn: NetworkApi;
    isConnected: boolean;
    aliveTimeout: ioBroker.Timeout | undefined;
    aliveTimestamp: number;
    imageUpdateTimeout: ioBroker.Timeout;
    connectionRetries: number;
    cache: myCache;
    subscribedList: string[];
    eventListener: (event: NetworkEvent) => Promise<void>;
    fetch: typeof import("@adobe/fetch").fetch;
    eventsToIngnore: string[];
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload;
    /**
     * Is called if a subscribed state changes
     */
    private onStateChange;
    private onMessage;
    /**
     * Establish Connection to NVR and starting the alive checker
     * @param isAdapterStart
     */
    establishConnection(): Promise<void>;
    /** Login into NVR and load bootstrap data
     * @returns {Promise<boolean>} Connection status
     */
    login(): Promise<boolean>;
    /** Check whether the connection to the controller exists, if not try to establish a new connection
     */
    aliveChecker(): Promise<void>;
    /** Set adapter info.connection state and internal var
     * @param {boolean} isConnected
     */
    setConnectionStatus(isConnected: boolean): Promise<void>;
    updateRealTimeApiData(): Promise<void>;
    updateApiData(): Promise<void>;
    updateDevices(data?: NetworkDevice[] | null, isAdapterStart?: boolean): Promise<void>;
    updateClients(data?: myNetworkClient[] | null, isAdapterStart?: boolean, isOfflineClients?: boolean): Promise<void>;
    updatClientsOffline(data: myNetworkClient[], isAdapterStart?: boolean): Promise<void>;
    updateIsOnlineState(isAdapterStart?: boolean): Promise<void>;
    _updateIsOnlineState(clients: Record<string, ioBroker.State>, offlineTimeout: number, typeOfClient: string, isAdapterStart?: boolean): Promise<void>;
    updateWlanConfig(data: NetworkWlanConfig[] | NetworkWlanConfig_V2[], isAdapterStart?: boolean): Promise<void>;
    updateWlanConnectedClients(isAdapterStart?: boolean): Promise<void>;
    updateLanConfig(data: NetworkLanConfig[] | NetworkLanConfig_V2[], isAdapterStart?: boolean): Promise<void>;
    updateLanConnectedClients(isAdapterStart?: boolean): Promise<void>;
    /**
     * @deprecated Download public data from ui with image url infos.
     */
    updateDevicesImages(): Promise<void>;
    updateImages(): Promise<void>;
    _updateClientsImages(objs: Record<string, ioBroker.State>): Promise<void>;
    /**
     * Download image from a given url and update Channel icon if needed
     * @param url
     * @param idChannelList
     */
    downloadImage(url: string | null, idChannelList: string[]): Promise<void>;
    /**
     * create or update a device object, update will only be done on adapter start
     * @param id
     * @param name
     * @param onlineId
     * @param icon
     * @param isAdapterStart
     */
    private createOrUpdateDevice;
    /**
     * create or update a channel object, update will only be done on adapter start
     * @param id
     * @param name
     * @param onlineId
     * @param icon
     * @param isAdapterStart
     */
    private createOrUpdateChannel;
    createOrUpdateGenericState(channel: string, treeDefinition: {
        [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray;
    } | myCommonState, objValues: NetworkDevice | myNetworkClient | NetworkWlanConfig | NetworkLanConfig | ConnectedClients, blacklistFilter: {
        id: string;
    }[], isWhiteList: boolean, objOrg: NetworkDevice | myNetworkClient | NetworkWlanConfig | NetworkLanConfig | ConnectedClients, objOrgValues: any, isAdapterStart?: boolean, filterId?: string, isChannelOnWhitelist?: boolean): Promise<void>;
    getCommonGenericState(id: string, treeDefinition: {
        [key: string]: myCommonState;
    }, objOrg: any, logMsgState: string): Promise<ioBroker.StateCommon>;
    onNetworkMessage(event: NetworkEventDevice | NetworkEventClient | NetworkEvent | NetworkEventSpeedTest): Promise<void>;
    onNetworkEvent(event: NetworkEvent): Promise<void>;
    onNetworkClientEvent(events: NetworkEventClient): Promise<void>;
    onNetworkUserEvent(events: NetworkEventClient): Promise<void>;
    onNetworkWlanConfEvent(event: NetworkEventWlanConfig): Promise<void>;
    onNetworkLanConfEvent(event: NetworkEventLanConfig): Promise<void>;
    onNetworkSpeedTestEvent(event: NetworkEventSpeedTest): Promise<void>;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): UnifiNetwork;
export {};
