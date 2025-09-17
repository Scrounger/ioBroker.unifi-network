import * as utils from '@iobroker/adapter-core';
import { NetworkApi } from './lib/api/network-api.js';
import type { NetworkEvent, NetworkEventClient, NetworkEventDevice, NetworkEventFirewallGroup, NetworkEventLanConfig, NetworkEventSpeedTest, NetworkEventWlanConfig } from './lib/api/network-types.js';
import type { NetworkDevice } from './lib/api/network-types-device.js';
import type { NetworkWlanConfig, NetworkWlanConfig_V2 } from './lib/api/network-types-wlan-config.js';
import type { NetworkLanConfig, NetworkLanConfig_V2 } from './lib/api/network-types-lan-config.js';
import type { FirewallGroup } from './lib/api/network-types-firewall-group.js';
import { type myCache, type myNetworkClient } from './lib/myTypes.js';
import { myIob } from './lib/myIob.js';
declare class UnifiNetwork extends utils.Adapter {
    ufn: NetworkApi;
    myIob: myIob;
    isConnected: boolean;
    aliveTimeout: ioBroker.Timeout | undefined;
    pingTimeout: ioBroker.Timeout | undefined;
    aliveTimestamp: number;
    imageUpdateTimeout: ioBroker.Timeout;
    connectionRetries: number;
    cache: myCache;
    subscribedList: string[];
    eventListener: (event: NetworkEvent) => Promise<void>;
    pongListener: () => void;
    eventsToIgnore: string[];
    statesUsingValAsLastChanged: string[];
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    private onUnload;
    /**
     * Is called if a subscribed state changes
     *
     * @param id
     * @param state
     */
    private onStateChange;
    private onMessage;
    /**
     * Establish Connection to NVR and starting the alive checker
     */
    establishConnection(): Promise<void>;
    /**
     * Login into NVR and load bootstrap data
     *
     * @returns Connection status
     */
    login(): Promise<boolean>;
    /**
     * Check whether the connection to the controller exists, if not try to establish a new connection
     */
    aliveChecker(): Promise<void>;
    /**
     * Set adapter info.connection state and internal var
     *
     * @param isConnected
     */
    setConnectionStatus(isConnected: boolean): Promise<void>;
    /**
     * send websocket ping
     */
    sendPing(): void;
    updateRealTimeApiData(): Promise<void>;
    updateApiData(): void;
    updateDevices(data?: NetworkDevice[] | null, isAdapterStart?: boolean): Promise<void>;
    updateClients(data?: myNetworkClient[] | null, isAdapterStart?: boolean, isOfflineClients?: boolean): Promise<void>;
    updatClientsOffline(data: myNetworkClient[], isAdapterStart?: boolean): Promise<void>;
    updateIsOnlineState(isAdapterStart?: boolean): Promise<void>;
    _updateIsOnlineState(clients: Record<string, ioBroker.State>, offlineTimeout: number, typeOfClient: string, isAdapterStart?: boolean): Promise<void>;
    updateWlanConfig(data: NetworkWlanConfig[] | NetworkWlanConfig_V2[], isAdapterStart?: boolean): Promise<void>;
    updateWlanConnectedClients(isAdapterStart?: boolean): Promise<void>;
    updateLanConfig(data: NetworkLanConfig[] | NetworkLanConfig_V2[], isAdapterStart?: boolean): Promise<void>;
    updateLanConnectedClients(isAdapterStart?: boolean): Promise<void>;
    updateFirewallGroup(data: FirewallGroup[], isAdapterStart?: boolean): Promise<void>;
    /**
     * @deprecated Download public data from ui with image url infos.
     */
    updateDevicesImages(): Promise<void>;
    updateImages(): Promise<void>;
    _updateClientsImages(objs: Record<string, ioBroker.State>): Promise<void>;
    /**
     * Download image from a given url and update Channel icon if needed
     *
     * @param url
     * @param idChannelList
     */
    downloadImage(url: string | null, idChannelList: string[]): Promise<void>;
    /**
     * Websocket pong received, sets the aliveTimestamp to the current timestamp
     */
    onPongMessage(): void;
    onNetworkMessage(event: NetworkEventDevice | NetworkEventClient | NetworkEvent | NetworkEventSpeedTest | NetworkEventFirewallGroup): Promise<void>;
    onNetworkEvent(event: NetworkEvent): Promise<void>;
    onNetworkClientEvent(events: NetworkEventClient): Promise<void>;
    onNetworkUserEvent(events: NetworkEventClient): Promise<void>;
    onNetworkWlanConfEvent(event: NetworkEventWlanConfig): Promise<void>;
    onNetworkLanConfEvent(event: NetworkEventLanConfig): Promise<void>;
    onNetworkFirewallGroupEvent(event: NetworkEventFirewallGroup): Promise<void>;
    onNetworkSpeedTestEvent(event: NetworkEventSpeedTest): Promise<void>;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): UnifiNetwork;
export {};
