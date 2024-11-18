import { NetworkEventMeta, NetworkEventData } from "./api/network-types.js";
import { WebSocketEvent, myCache, myNetworkClient } from "./myTypes.js";
import * as myHelper from './helper.js';

export const eventHandler = {
    device: {
        async restarted(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.device.restarted]:'

            try {
                const mac: string = data.sw || data.ap || data.gw;

                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        if (await adapter.objectExists(`devices.${mac}.isOnline`)) {
                            await adapter.setStateChangedAsync(`devices.${mac}.isOnline`, false, true);
                        }

                        adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) is going to restart`);
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'restarted' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.device.connected]:'

            try {
                const mac: string = data.sw || data.ap || data.gw
                const connected = WebSocketEvent.device.Connected.includes(data.key);

                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) ${connected ? 'connected' : 'disconnected'}`);
                        if (await adapter.objectExists(`devices.${mac}.isOnline`)) {
                            await adapter.setStateChangedAsync(`devices.${mac}.isOnline`, connected, true);
                        }
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    },
    client: {
        async connected(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.client.connected]:'

            try {
                const mac: string = data.user || data.guest;
                const connected = WebSocketEvent.client.Connected.includes(data.key);
                const isGuest = data.guest ? true : false;

                if (mac) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        const id = `${isGuest ? 'guests' : 'clients'}.${mac}.isOnline`;

                        if (data.subsystem === 'wlan') {
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''}) ${connected ? 'to' : 'from'} '${data.ssid}' on '${data.ap_displayName || data.ap_name}'`);
                        } else {
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''})`);
                        }

                        if (await adapter.objectExists(id)) {
                            await adapter.setState(id, connected, true);
                        }
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamed(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.client.roamed]:'

            try {
                const mac: string = data.user || data.guest;
                const isGuest = data.guest ? true : false;

                if (mac && data.ap_from && data.ap_to) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}, ip: ${cache?.clients[mac]?.ip}) roamed from '${cache?.devices[data.ap_from]?.name}' (mac: ${data.ap_from}) to '${cache?.devices[data.ap_to]?.name}' (mac: ${data.ap_to})`);

                        const idApName = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_name`;
                        if (await adapter.objectExists(idApName)) {
                            await adapter.setState(idApName, cache.devices[data.ap_to].name ? cache.devices[data.ap_to].name : null, true);
                        }

                        const idApMac = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_mac`;
                        if (await adapter.objectExists(idApMac)) {
                            await adapter.setState(idApMac, (data.ap_to) ? (data.ap_to) : null, true);
                        }
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'roam' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamedRadio(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.client.roamedRadio]:'

            try {
                const mac: string = data.user || data.guest;
                const isGuest = data.guest ? true : false;

                if (mac && data.channel_from && data.channel_to && data.ap) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}) roamed radio from channel '${data.channel_from}' to '${data.channel_to}' on '${cache?.devices[data.ap]?.name}' (mac: ${cache?.devices[data.ap]?.mac})`);

                        const idChannel = `${isGuest ? 'guests' : 'clients'}.${mac}.channel`;
                        const valChannel = parseInt(data.channel_to);
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.setState(idChannel, valChannel, true);
                        }

                        const idChannelName = `${isGuest ? 'guests' : 'clients'}.${mac}.channel_frequency`;
                        if (await adapter.objectExists(idChannelName)) {
                            await adapter.setState(idChannelName, myHelper.radioToFrequency(data.radio_to, adapter), true);
                        }
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'roam radio' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }

            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async block(meta: NetworkEventMeta, data: NetworkEventData, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.client.block]:'

            try {
                const mac: string = data.client;

                if (mac) {
                    if (cache && cache.clients && cache.clients[mac]) {
                        const isGuest = cache.clients[mac].is_guest;
                        const blocked = data.key.includes('_Blocked');

                        const id = `${isGuest ? 'guests' : 'clients'}.${mac}.blocked`;

                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${blocked ? 'blocked' : 'unblocked'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''})`);

                        if (await adapter.objectExists(id)) {
                            await adapter.setState(id, blocked, true);
                        }
                    }
                } else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async vpnDisconnect(meta: NetworkEventMeta, data: myNetworkClient, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.client.vpnDisconnect]:'

            try {
                if (data.ip && data.network_id) {
                    const preparedIp = data.ip.replaceAll('.', '_');

                    const id = `vpn.${data.network_id}.${preparedIp}.isOnline`;

                    if (await adapter.objectExists(id)) {
                        await adapter.setState(id, false, true);
                    }

                    adapter.log.info(`${logPrefix} vpn client '${cache?.vpn[data.ip]?.name}' 'disconnected' (ip: ${cache?.vpn[data.ip].ip}, remote_ip: ${cache?.vpn[data.ip].remote_ip})`);
                } else {
                    adapter.log.warn(`${logPrefix} event 'vpn disconnected' has no ip address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        }
    },
    user: {
        async clientRemoved(meta: NetworkEventMeta, data: { [key: string]: boolean | number | object | string } | any, adapter: ioBroker.Adapter, cache: myCache) {
            const logPrefix = '[eventHandler.user.clientRemoved]:'

            try {
                if (meta.message === 'user:delete' && data.mac) {
                    if (adapter.config.keepIobSynchron && cache && cache.clients && cache.clients[data.mac as string]) {
                        const mac = data.mac;
                        const isGuest = cache.clients[mac as string].is_guest;
                        const idChannel = `${isGuest ? 'guests' : 'clients'}.${mac}`

                        if (await adapter.objectExists(idChannel)) {
                            await adapter.delObjectAsync(idChannel, { recursive: true });
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac as string].name}' deleted, because it's removed by the unifi-controller`);
                        }
                    }
                } else {
                    adapter.log.error(`${logPrefix} not implemented user event. ${data.key ? `key: ${data.key},` : ''} meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
                }

            } catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    }
}