import { WebSocketEventKeys } from "./myTypes.js";
import { clientTree } from "./tree-client.js";
export const eventHandler = {
    device: {},
    client: {
        async connection(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.connection]:';
            try {
                let mac = undefined;
                let connected = false;
                const isGuest = data.guest ? true : false;
                if (data.key === WebSocketEventKeys.clientConnected || data.key === WebSocketEventKeys.clientDisconnected) {
                    mac = data.user;
                    connected = data.key === WebSocketEventKeys.clientConnected;
                }
                else if ((data.key === WebSocketEventKeys.guestConnected || data.key === WebSocketEventKeys.guestDisconnected)) {
                    mac = data.guest;
                    connected = data.key === WebSocketEventKeys.guestConnected;
                }
                const id = `${isGuest ? 'guests' : 'clients'}.${mac}.isOnline`;
                if (await adapter.objectExists(id)) {
                    await adapter.setState(id, connected, true);
                    adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache.clients[mac].ip ? `, ip: ${cache.clients[mac].ip}` : ''})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamed(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.roamed]:';
            try {
                const mac = (data.key === WebSocketEventKeys.clientRoamed) ? data.user : data.guest;
                const isGuest = data.guest ? true : false;
                if (data.ap_from && data.ap_to) {
                    adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' (mac: ${mac}) roamed from '${cache.devices[data.ap_from].name}' (mac: ${data.ap_from}) to '${cache.devices[data.ap_to].name}' (mac: ${data.ap_to})`);
                    const idApName = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_name`;
                    if (await adapter.objectExists(idApName)) {
                        await adapter.setState(idApName, cache.devices[data.ap_to].name ? cache.devices[data.ap_to].name : null, true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${idApName}' not exists!`);
                    }
                    const ipApMac = `${isGuest ? 'guests' : 'clients'}.${mac}.uplink_mac`;
                    if (await adapter.objectExists(ipApMac)) {
                        await adapter.setState(ipApMac, data.ap_to ? data.ap_to : null, true);
                    }
                    else {
                        adapter.log.warn(`${logPrefix} state '${ipApMac}' not exists!`);
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} roam event has no ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async roamedRadio(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.roamedRadio]:';
            try {
                const mac = (data.key === WebSocketEventKeys.clientRoamedRadio) ? data.user : data.guest;
                const isGuest = data.guest ? true : false;
                if (data.channel_from && data.channel_to && data.ap) {
                    adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' (mac: ${mac}) roamed radio from channel '${data.channel_from}' to '${data.channel_to}' on ${cache.devices[data.ap].name} (mac: ${cache.devices[data.ap].mac})`);
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
                    adapter.log.warn(`${logPrefix} roam radio event has no ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
        async block(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.block]:';
            try {
                const mac = data.client;
                const isGuest = cache.clients[mac].is_guest;
                const id = `${isGuest ? 'guests' : 'clients'}.${mac}.blocked`;
                if (await adapter.objectExists(id)) {
                    await adapter.setState(id, data.key === WebSocketEventKeys.clientOrGuestBlocked, true);
                    adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' ${data.key === WebSocketEventKeys.clientOrGuestBlocked ? 'blocked' : 'unblocked'} (mac: ${mac}${cache.clients[mac].ip ? `, ip: ${cache.clients[mac].ip}` : ''})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            }
        },
    },
    user: {
        async clientRemoved(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.block]:';
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
