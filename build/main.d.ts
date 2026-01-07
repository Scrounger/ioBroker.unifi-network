import * as utils from '@iobroker/adapter-core';
import { NetworkApi } from './lib/api/network-api.js';
import type { NetworkEvent } from './lib/api/network-types.js';
import { type myCache } from './lib/myTypes.js';
import { myIob } from './lib/myIob.js';
declare class UnifiNetwork extends utils.Adapter {
    ufn: NetworkApi;
    myIob: myIob;
    isConnected: boolean;
    controllerVersion: string;
    aliveTimeout: ioBroker.Timeout | undefined;
    pingTimeout: ioBroker.Timeout | undefined;
    aliveTimestamp: number;
    connectionRetries: number;
    cache: myCache;
    subscribedList: string[];
    eventListener: (event: NetworkEvent) => Promise<void>;
    pongListener: () => Promise<void>;
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
     *
     * @param isAdapterStart
     */
    establishConnection(isAdapterStart?: boolean): Promise<void>;
    /**
     * Login into NVR and load bootstrap data
     *
     * @param isAdapterStart
     * @returns Connection status
     */
    login(isAdapterStart?: boolean): Promise<boolean>;
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
     *
     * @param isAdapterStart
     */
    sendPing(isAdapterStart?: boolean): void;
    updateRealTimeApiData(isAdapterStart?: boolean): Promise<void>;
    private updateApiData;
    private updateDevices;
    private updateClients;
    private updatClientsOffline;
    private updateIsOnlineState;
    private updateWlanConfig;
    private updateWlanConnectedClients;
    private updateLanConfig;
    private updateLanConnectedClients;
    private updateFirewallGroup;
    /**
     * @deprecated Download public data from ui with image url infos.
     */
    private updateDevicesImages;
    /**
     * Download image from a given url and update Channel icon if needed
     *
     * @param url
     * @param idChannelList
     */
    private downloadImage;
    checkImageDownload(idImageUrl: string, url: string): Promise<void>;
    /**
     * Websocket pong received, sets the aliveTimestamp to the current timestamp
     */
    private onPongMessage;
    private onNetworkMessage;
    private onNetworkEvent;
    private onNetworkClientEvent;
    private onNetworkUserEvent;
    private onNetworkWlanConfEvent;
    private onNetworkLanConfEvent;
    private onNetworkFirewallGroupEvent;
    private onNetworkSpeedTestEvent;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): UnifiNetwork;
export {};
