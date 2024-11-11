import { WebSocketEvent } from "./myTypes.js";
import { clientTree } from "./tree-client.js";
export const eventHandler = {
    device: {
        async restarted(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.device.restarted]:';
            try {
                const mac = data.sw || data.ap || data.gw;
                if (mac) {
                    if (await adapter.objectExists(`devices.${mac}.state`)) {
                        await adapter.setState(`devices.${mac}.state`, 999, true);
                    }
                    if (await adapter.objectExists(`devices.${mac}.isOnline`)) {
                        await adapter.setState(`devices.${mac}.isOnline`, false, true);
                    }
                    adapter.log.info(`${logPrefix} '${cache.devices[mac].name}' (mac: ${mac}) is going to restart`);
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'restarted' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    },
    client: {
        async connection(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.connection]:';
            try {
                const mac = data.user || data.guest;
                const connected = WebSocketEvent.client.Connected.includes(data.key);
                const isGuest = data.guest ? true : false;
                if (mac) {
                    const id = `${isGuest ? 'guests' : 'clients'}.${mac}.isOnline`;
                    if (await adapter.objectExists(id)) {
                        await adapter.setState(id, connected, true);
                        if (data.subsystem === 'wlan') {
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache.clients[mac].ip ? `, ip: ${cache.clients[mac].ip}` : ''}) ${connected ? 'to' : 'from'} '${data.ssid}' on '${data.ap_displayName || data.ap_name}'`);
                        }
                        else {
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache.clients[mac].ip ? `, ip: ${cache.clients[mac].ip}` : ''})`);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamed(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.roamed]:';
            try {
                const mac = data.user || data.guest;
                const isGuest = data.guest ? true : false;
                if (mac && data.ap_from && data.ap_to) {
                    adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' (mac: ${mac}, ip: ${cache.clients[mac].ip}) roamed from '${cache.devices[data.ap_from].name}' (mac: ${data.ap_from}) to '${cache.devices[data.ap_to].name}' (mac: ${data.ap_to})`);
                    const idApName = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_name`;
                    if (await adapter.objectExists(idApName)) {
                        await adapter.setState(idApName, cache.devices[data.ap_to].name ? cache.devices[data.ap_to].name : null, true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${idApName}' not exists!`);
                    }
                    const ipApMac = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_mac`;
                    if (await adapter.objectExists(ipApMac)) {
                        await adapter.setState(ipApMac, (data.ap_to) ? (data.ap_to) : null, true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${ipApMac}' not exists!`);
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'roam' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamedRadio(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.roamedRadio]:';
            try {
                const mac = data.user || data.guest;
                const isGuest = data.guest ? true : false;
                if (mac && data.channel_from && data.channel_to && data.ap) {
                    adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' (mac: ${mac}) roamed radio from channel '${data.channel_from}' to '${data.channel_to}' on '${cache.devices[data.ap].name}' (mac: ${cache.devices[data.ap].mac})`);
                    const ipChannel = `${isGuest ? 'guests' : 'clients'}.${mac}.channel`;
                    const valChannel = parseInt(data.channel_to);
                    if (await adapter.objectExists(ipChannel)) {
                        await adapter.setState(ipChannel, valChannel, true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${ipChannel}' not exists!`);
                    }
                    const ipChannelName = `${isGuest ? 'guests' : 'clients'}.${mac}.channel_name`;
                    if (await adapter.objectExists(ipChannelName)) {
                        await adapter.setState(ipChannelName, clientTree.channel_name.readVal(valChannel), true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${ipChannelName}' not exists!`);
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'roam radio' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async block(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.block]:';
            try {
                const mac = data.client;
                if (mac) {
                    const isGuest = cache.clients[mac].is_guest;
                    const blocked = data.key.includes('_Blocked');
                    const id = `${isGuest ? 'guests' : 'clients'}.${mac}.blocked`;
                    if (await adapter.objectExists(id)) {
                        await adapter.setState(id, blocked, true);
                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' ${blocked ? 'blocked' : 'unblocked'} (mac: ${mac}${cache.clients[mac].ip ? `, ip: ${cache.clients[mac].ip}` : ''})`);
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    },
    user: {
        async clientRemoved(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.user.clientRemoved]:';
            try {
                if (meta.message === 'user:delete' && data.mac) {
                    if (adapter.config.keepIobSynchron && cache.clients[data.mac]) {
                        const mac = data.mac;
                        const isGuest = cache.clients[mac].is_guest;
                        const idChannel = `${isGuest ? 'guests' : 'clients'}.${mac}`;
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.delObjectAsync(idChannel, { recursive: true });
                            adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' deleted, because it's removed by the unifi-controller`);
                        }
                    }
                }
                else {
                    adapter.log.error(`${logPrefix} not implemented user event. ${data.key ? `key: ${data.key},` : ''} meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    }
};
