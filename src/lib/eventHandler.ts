import dayjs from 'dayjs';

import type { FirewallGroup } from './api/network-types-firewall.js';
import type { NetworkLanConfig } from './api/network-types-lan-config.js';
import type { NetworkWlanConfig } from './api/network-types-wlan-config.js';
import type { NetworkEventData, NetworkEventMeta, NetworkEventSpeedTest } from './api/network-types.js';
import * as myHelper from './helper.js';
import { WebSocketEvent, type myCache, type myNetworkClient } from './myTypes.js';
import * as tree from './tree/index.js';

/** Value for `setState` / `setStateChangedAsync`: a plain value or an object with `val` and `lc`. */
type StateWrite = ioBroker.StateValue | ioBroker.SettableState;

/**
 * Pending client disconnects per MAC address. While an entry exists, the offline state is delayed by the debounce time.
 */
export const disconnectDebounceList: { [mac: string]: { lc: number, timeout: ioBroker.Timeout | null | undefined } } = {};

/** Speedtest running flag per WAN interface (`wan1`, `wan2`). */
const speedTestRunning: { [wan: string]: boolean } = {};

/**
 * Clears the module-level state (debounce list and speedtest flags). Only meant for tests.
 */
export function resetEventHandlerStateForTests(): void {
    for (const mac of Object.keys(disconnectDebounceList)) {
        delete disconnectDebounceList[mac];
    }
    for (const wan of Object.keys(speedTestRunning)) {
        delete speedTestRunning[wan];
    }
}

// ---------------------------------------------------------------------------
// Id helpers
// ---------------------------------------------------------------------------

/**
 * Returns the MAC address of a device event. The field depends on the device type (`sw`, `ap` or `gw`).
 *
 * @param data event data
 */
function deviceMac(data: NetworkEventData): string {
    return (data.sw || data.ap || data.gw) as string;
}

/**
 * Returns the id of a device channel or of a state below it, e.g. `devices.<mac>.isOnline`.
 *
 * @param mac MAC address of the device
 * @param path optional path below the device channel
 */
function deviceId(mac: string, path = ''): string {
    return path ? `${tree.device.idChannel}.${mac}.${path}` : `${tree.device.idChannel}.${mac}`;
}

/**
 * Returns the id of a client channel or of a state below it. Guests and users are stored in separate channels.
 *
 * @param mac MAC address of the client
 * @param isGuest true for guests
 * @param path optional path below the client channel
 */
function clientId(mac: string, isGuest: boolean, path = ''): string {
    const channel = isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers;
    return path ? `${channel}.${mac}.${path}` : `${channel}.${mac}`;
}

/**
 * Checks whether clients (`isGuest` false) or guests (`isGuest` true) are enabled in the adapter config.
 *
 * @param adapter adapter instance
 * @param isGuest true for guests
 */
function isClientEnabled(adapter: ioBroker.Adapter, isGuest: boolean): boolean {
    return isGuest ? !!adapter.config.guestsEnabled : !!adapter.config.clientsEnabled;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/**
 * Returns the log level for client messages: `clientDebugLevel`, falling back to the adapter log level.
 *
 * @param adapter adapter instance
 */
function clientLogLevel(adapter: ioBroker.Adapter): ioBroker.LogLevel {
    return (adapter.config.clientDebugLevel || adapter.log.level) as ioBroker.LogLevel;
}

/**
 * Checks whether debug messages are written. Used to skip building debug strings with `JSON.stringify` on hot paths.
 *
 * @param adapter adapter instance
 */
function isDebugEnabled(adapter: ioBroker.Adapter): boolean {
    return adapter.log.level === 'debug' || adapter.log.level === 'silly';
}

/**
 * Formats meta and data of an event for log messages.
 *
 * @param meta event meta
 * @param data event data
 */
function metaAndData(meta: NetworkEventMeta, data: unknown): string {
    return `meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`;
}

/**
 * Logs an error that was caught in an event handler.
 *
 * @param adapter adapter instance
 * @param logPrefix prefix of the handler
 * @param error caught error
 * @param context additional context of the event
 */
function logHandlerError(adapter: ioBroker.Adapter, logPrefix: string, error: any, context: string): void {
    adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, ${context}`);
}

// ---------------------------------------------------------------------------
// State and object helpers
// ---------------------------------------------------------------------------

/**
 * Writes a state if its object exists. A missing object means the state is not in use.
 *
 * @param adapter adapter instance
 * @param id state id
 * @param value value to write
 */
async function setStateIfExists(adapter: ioBroker.Adapter, id: string, value: StateWrite): Promise<void> {
    if (await adapter.objectExists(id)) {
        await adapter.setState(id, value, true);
    }
}

/**
 * Like `setStateIfExists`, but only writes if the value changed.
 *
 * @param adapter adapter instance
 * @param id state id
 * @param value value to write
 */
async function setStateChangedIfExists(adapter: ioBroker.Adapter, id: string, value: StateWrite): Promise<void> {
    if (await adapter.objectExists(id)) {
        await adapter.setStateChangedAsync(id, value, true);
    }
}

/**
 * Writes several states concurrently, each one only if its object exists.
 *
 * @param adapter adapter instance
 * @param writes pairs of state id and value
 */
async function setStatesIfExist(adapter: ioBroker.Adapter, writes: [string, StateWrite][]): Promise<void> {
    for (const [id, value] of writes) {
        await setStateIfExists(adapter, id, value);
    }
}

/**
 * Deletes a channel recursively if it exists.
 *
 * @param adapter adapter instance
 * @param idChannel id of the channel
 * @returns true if the channel existed and was deleted
 */
async function deleteChannelIfExists(adapter: ioBroker.Adapter, idChannel: string): Promise<boolean> {
    if (!(await adapter.objectExists(idChannel))) {
        return false;
    }
    await adapter.delObjectAsync(idChannel, { recursive: true });
    return true;
}

/**
 * Event handlers, grouped by the event source. Each handler is called from `src/main.ts`.
 */
export const eventHandler = {
    device: {
        async restarted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.restarted]:';

            try {
                const mac = deviceMac(data);

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'restarted' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!adapter.config.devicesEnabled) {
                    return;
                }

                await setStateChangedIfExists(adapter, deviceId(mac, 'isOnline'), false);
                adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) is going to restart`);
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.connected]:';

            try {
                const mac = deviceMac(data);

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!adapter.config.devicesEnabled) {
                    return;
                }

                const connected = WebSocketEvent.device.Connected.includes(data.key);
                adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) ${connected ? 'connected' : 'disconnected'}`);
                await setStateChangedIfExists(adapter, deviceId(mac, 'isOnline'), connected);
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async deleted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.deleted]:';

            try {
                const mac = deviceMac(data);

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'deleted' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!adapter.config.keepIobSynchron) {
                    return;
                }

                if (await deleteChannelIfExists(adapter, deviceId(mac))) {
                    adapter.log.info(`${logPrefix} device '${cache.devices[mac]?.name}' (mac: ${mac}) delete, because it's removed by the unifi-controller`);
                    delete cache.devices[mac];
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async speedTest(event: NetworkEventSpeedTest, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.speedTest]:';

            try {
                const mac = event.meta.mac as string;
                const device = cache.devices[mac];

                for (const data of event.data) {
                    // unknown interfaces fall back to 'wan1'
                    const wan = device?.wan1?.ifname === data.interface_name ? 'wan1' : device?.wan2?.ifname === data.interface_name ? 'wan2' : 'wan1';
                    const idChannel = deviceId(mac, wan);

                    if (Object.hasOwn(data, 'upload-progress') || Object.hasOwn(data, 'download-progress')) {
                        // speed test is running
                        if (!Object.hasOwn(speedTestRunning, wan)) {
                            adapter.log.info(`${logPrefix} speedtest for '${wan}' (mac: ${mac}, wan: ${wan}) started`);
                        }

                        await setStatesIfExist(adapter, [
                            [`${idChannel}.speedtest_download`, null],
                            [`${idChannel}.speedtest_upload`, null],
                            [`${idChannel}.latency`, null],
                        ]);

                        speedTestRunning[wan] = true;

                        if (isDebugEnabled(adapter)) {
                            adapter.log.debug(`${logPrefix} speedtest for '${wan}' in progress (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(data)})`);
                        }
                    } else if (speedTestRunning[wan] && data.rundate > 0 && data.runtime > 0) {
                        // speed test finished
                        adapter.log.info(`${logPrefix} speedtest for '${wan}' (mac: ${mac}, wan: ${wan}, runtime: ${data.runtime}s) finished`);
                        if (isDebugEnabled(adapter)) {
                            adapter.log.debug(`${logPrefix} speedtest for '${wan}' finished (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(data)})`);
                        }

                        delete speedTestRunning[wan];

                        const lc = data.rundate * 1000;
                        await setStatesIfExist(adapter, [
                            [`${idChannel}.speedtest_download`, { val: data.xput_download, lc }],
                            [`${idChannel}.speedtest_upload`, { val: data.xput_upload, lc }],
                            [`${idChannel}.latency`, { val: data.latency, lc }],
                        ]);
                    }
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, `event: ${JSON.stringify(event)}`);
            }
        },
        async lostContact(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.lostContact]:';

            try {
                const mac = deviceMac(data);

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'lost contact' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!adapter.config.devicesEnabled) {
                    return;
                }

                adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) 'lost contact'`);
                await setStateChangedIfExists(adapter, deviceId(mac, 'isOnline'), false);

                if (await adapter.objectExists(deviceId(mac, 'state'))) {
                    if (cache.devices[mac]) {
                        cache.devices[mac].state = 0;
                    }
                    await adapter.setStateChangedAsync(deviceId(mac, 'state'), 0, true);
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async wanTransition(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.device.wanTransition]:';

            try {
                const mac = (data.gw || data.dm) as string;

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'wan transition' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!adapter.config.devicesEnabled) {
                    return;
                }

                const ifname = data.iface as string;
                const device = cache?.devices[mac];
                const idWanInterface = device?.wan1?.ifname === ifname ? 'wan1' : device?.wan2?.ifname === ifname ? 'wan2' : undefined;

                if (!idWanInterface) {
                    return;
                }

                adapter.log.info(`${logPrefix} '${device?.name}' (mac: ${mac}) '${idWanInterface} transition', state: ${data.state}`);
                await setStateChangedIfExists(adapter, deviceId(mac, `isp.${idWanInterface}.isOnline`), data.state !== 'inactive');
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
    },
    client: {
        async connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.client.connected]:';

            try {
                const mac = (data.user || data.guest) as string;

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }

                const connected = WebSocketEvent.client.Connected.includes(data.key);
                const isGuest = !!data.guest;

                if (!isClientEnabled(adapter, isGuest)) {
                    return;
                }

                const id = clientId(mac, isGuest, 'isOnline');
                const kind = isGuest ? 'guest' : 'client';
                const clientIp = cache?.clients[mac]?.ip;
                const wlanInfo = data.subsystem === 'wlan' ? ` ${connected ? 'to' : 'from'} '${data.ssid}' on '${data.ap_displayName || data.ap_name}'` : '';
                const logMsg = `${logPrefix} ${kind} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${clientIp ? `, ip: ${clientIp}` : ''})${wlanInfo}`;
                const logLevel = clientLogLevel(adapter);
                const clientWithDebounceTime = adapter.config.clientDebouncingList.find(c => c?.mac?.toLowerCase() === mac.toLowerCase());

                if (connected || (adapter.config.clientRealtimeDisconnectDebounceTime === 0 && !clientWithDebounceTime)) {
                    adapter.log[logLevel](logMsg);

                    const pending = disconnectDebounceList[mac];
                    if (pending) {
                        if (pending.timeout) {
                            adapter.clearTimeout(pending.timeout);
                            adapter.log.debug(`${logPrefix} ${kind} '${cache?.clients[mac]?.name}' reconnected in the debounce time, timeout cleared`);
                        }
                        delete disconnectDebounceList[mac];
                    }

                    await setStateIfExists(adapter, id, connected);
                    return;
                }

                const debounceSeconds = clientWithDebounceTime?.debounceTime || adapter.config.clientRealtimeDisconnectDebounceTime;
                disconnectDebounceList[mac] = {
                    lc: dayjs().valueOf(),
                    timeout: null
                };

                adapter.log[logLevel](`${logMsg} -> debounce disconnection for ${debounceSeconds}s ${clientWithDebounceTime ? '(client specific)' : ''}`);

                // debounce disconnection if it's configured
                disconnectDebounceList[mac].timeout = adapter.setTimeout(async () => {
                    if (disconnectDebounceList[mac]) {
                        adapter.log[logLevel](`${logMsg} -> debounce time expired`);

                        if (await adapter.objectExists(id)) {
                            const lc = disconnectDebounceList[mac]?.lc;
                            if (lc) {
                                await adapter.setState(id, { val: connected, lc }, true);
                            } else {
                                await adapter.setState(id, connected, true);
                            }
                        }
                    } else {
                        adapter.log.debug(`${logPrefix} ${kind} '${cache?.clients[mac]?.name}' reconnected in the debounce time, nothing to do`);
                    }

                    if (disconnectDebounceList[mac]) {
                        delete disconnectDebounceList[mac];
                    }
                }, debounceSeconds * 1000);
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async roamed(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.client.roamed]:';

            try {
                const mac = (data.user || data.guest) as string;
                const isGuest = !!data.guest;

                if (!mac || !data.ap_from || !data.ap_to) {
                    adapter.log.warn(`${logPrefix} event 'roam' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                    return;
                }
                if (!isClientEnabled(adapter, isGuest)) {
                    return;
                }

                adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}, ip: ${cache?.clients[mac]?.ip}) roamed from '${cache?.devices[data.ap_from]?.name}' (mac: ${data.ap_from}) to '${cache?.devices[data.ap_to]?.name}' (mac: ${data.ap_to})`);

                const apToName = cache?.devices[data.ap_to]?.name;

                const idApName = clientId(mac, isGuest, 'uplink_name');
                if (await adapter.objectExists(idApName)) {
                    if (cache.clients[mac]) {
                        cache.clients[mac].last_uplink_name = apToName || undefined;
                    }
                    await adapter.setState(idApName, apToName || null, true);
                }

                const idApMac = clientId(mac, isGuest, 'uplink_mac');
                if (await adapter.objectExists(idApMac)) {
                    if (cache.clients[mac]) {
                        cache.clients[mac].last_uplink_mac = data.ap_to;
                    }
                    await adapter.setState(idApMac, data.ap_to, true);
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async roamedRadio(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.client.roamedRadio]:';

            try {
                const mac = (data.user || data.guest) as string;
                const isGuest = !!data.guest;

                if (!mac || !data.channel_from || !data.channel_to || !data.ap) {
                    adapter.log.warn(`${logPrefix} event 'roam radio' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                    return;
                }
                if (!isClientEnabled(adapter, isGuest)) {
                    return;
                }

                adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}) roamed radio from channel '${data.channel_from}' to '${data.channel_to}' on '${cache?.devices[data.ap]?.name || data.ap_displayName || data.ap_name}' (mac: ${cache?.devices[data.ap]?.mac || data.ap})`);

                const valChannel = parseInt(data.channel_to);
                const idChannel = clientId(mac, isGuest, 'channel');
                if (await adapter.objectExists(idChannel)) {
                    if (cache.clients[mac]) {
                        cache.clients[mac].channel = valChannel;
                    }
                    await adapter.setState(idChannel, valChannel, true);
                }

                const idChannelFrequency = clientId(mac, isGuest, 'channel_frequency');
                if (await adapter.objectExists(idChannelFrequency)) {
                    if (cache.clients[mac]) {
                        cache.clients[mac].radio_name = data.radio_to;
                    }
                    await adapter.setState(idChannelFrequency, myHelper.radioToFrequency(data.radio_to, adapter), true);
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        async block(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.client.block]:';

            try {
                const mac = data.client as string;

                if (!mac) {
                    adapter.log.warn(`${logPrefix} event 'block' has no mac address! (${metaAndData(meta, data)})`);
                    return;
                }
                if (!cache?.clients?.[mac]) {
                    return;
                }

                const client = cache.clients[mac];
                const isGuest = !!client.is_guest;
                const blocked = data.key.includes('_Blocked');
                const id = clientId(mac, isGuest, 'blocked');

                adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${client.name}' ${blocked ? 'blocked' : 'unblocked'} (mac: ${mac}${client.ip ? `, ip: ${client.ip}` : ''})`);

                await setStateIfExists(adapter, id, blocked);
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
        /**
         * @deprecated deprecated since 10.4.57, handle by onNetworkVpnUsersEvent in main.ts now 
         * @param meta 
         * @param data 
         * @param adapter 
         * @param cache 
         */
        async vpnDisconnect(meta: NetworkEventMeta, data: myNetworkClient, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.client.vpnDisconnect]:'

            try {
                if (data.ip && data.network_id) {
                    const preparedIp = data.ip.replaceAll('.', '_');

                    const id = `${tree.client.idChannelVpn}.${data.network_id}.${preparedIp}.isOnline`;

                    if (await adapter.objectExists(id)) {
                        await adapter.setState(id, false, true);
                    }

                    adapter.log.info(`${logPrefix} vpn client '${cache?.vpn[data.ip]?.name}' 'disconnected' (ip: ${cache?.vpn[data.ip]?.ip}, remote_ip: ${cache?.vpn[data.ip]?.remote_ip})`);
                } else {
                    adapter.log.warn(`${logPrefix} event 'vpn disconnected' has no ip address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error: any) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        }
    },
    user: {
        async clientRemoved(meta: NetworkEventMeta, data: { [key: string]: boolean | number | object | string } | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.user.clientRemoved]:';

            try {
                if (!adapter.config.keepIobSynchron) {
                    return;
                }

                const mac = data.mac as string;
                const client = cache?.clients?.[mac];

                if (!client) {
                    return;
                }

                const isGuest = !!client.is_guest;
                const idChannel = clientId(mac, isGuest);

                if (await deleteChannelIfExists(adapter, idChannel)) {
                    adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${client.name}' deleted, because it's removed by the unifi-controller`);

                    delete cache.clients[mac];
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
    },
    wlanConf: {
        async deleted(meta: NetworkEventMeta, data: NetworkWlanConfig[] | any, adapter: ioBroker.myAdapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.wlanConf.deleted]:';

            try {
                if (!data || !adapter.config.keepIobSynchron) {
                    return;
                }

                // device WLAN states are queried once for all deleted WLANs, not once per WLAN
                let deviceWlanStates: Record<string, ioBroker.State> = {};
                if (adapter.config.devicesEnabled && data.length > 0) {
                    deviceWlanStates = await adapter.getStatesAsync(`${tree.device.idChannel}.*.wlan.*.id`);
                }

                for (const wlan of data) {
                    const idChannel = `${tree.wlan.idChannel}.${wlan._id}`;

                    if (await deleteChannelIfExists(adapter, idChannel)) {
                        adapter.log.debug(`${logPrefix} wlan '${wlan.name}' (channel: ${idChannel}) deleted`);
                    }

                    for (const id in deviceWlanStates) {
                        if (deviceWlanStates[id].val === wlan._id) {
                            const deviceChannel = adapter.myIob?.getIdWithoutLastPart(id);

                            if (deviceChannel && await deleteChannelIfExists(adapter, deviceChannel)) {
                                adapter.log.debug(`${logPrefix} wlan '${wlan.name}' deleted from device (channel: ${deviceChannel})`);
                            }
                        }
                    }
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        },
    },
    lanConf: {
        async deleted(meta: NetworkEventMeta, data: NetworkLanConfig[] | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
            const logPrefix = '[eventHandler.lanConf.deleted]:';

            try {
                if (!data || !adapter.config.keepIobSynchron) {
                    return;
                }

                for (const lan of data) {
                    const idChannel = `${tree.lan.idChannel}.${lan._id}`;

                    if (await deleteChannelIfExists(adapter, idChannel)) {
                        adapter.log.debug(`${logPrefix} lan '${lan.name}' (channel: ${idChannel}) deleted`);
                    }
                }
            } catch (error: any) {
                logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
            }
        }
    },
    firewall: {
        group: {
            async deleted(meta: NetworkEventMeta, data: FirewallGroup[] | any, adapter: ioBroker.Adapter, cache: myCache): Promise<void> {
                const logPrefix = '[eventHandler.firewall.group.deleted]:';

                try {
                    if (!data || !adapter.config.keepIobSynchron) {
                        return;
                    }

                    for (const firewallGroup of data) {
                        const idChannel = `${tree.firewall.group.idChannel}.${firewallGroup._id}`;

                        if (await deleteChannelIfExists(adapter, idChannel)) {
                            adapter.log.debug(`${logPrefix} firewall group '${firewallGroup.name}' (channel: ${idChannel}) deleted`);
                        }
                    }
                } catch (error: any) {
                    logHandlerError(adapter, logPrefix, error, metaAndData(meta, data));
                }
            }
        }
    }
}