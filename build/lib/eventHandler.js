import moment from "moment";
import { WebSocketEvent } from "./myTypes.js";
import * as myHelper from './helper.js';
import * as tree from './tree/index.js';
const disconnectDebounceList = {};
export const eventHandler = {
    device: {
        async restarted(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.device.restarted]:';
            try {
                const mac = data.sw || data.ap || data.gw;
                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        if (await adapter.objectExists(`${tree.device.idChannel}.${mac}.isOnline`)) {
                            await adapter.setStateChangedAsync(`${tree.device.idChannel}.${mac}.isOnline`, false, true);
                        }
                        adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) is going to restart`);
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'restarted' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async connected(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.device.connected]:';
            try {
                const mac = data.sw || data.ap || data.gw;
                const connected = WebSocketEvent.device.Connected.includes(data.key);
                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) ${connected ? 'connected' : 'disconnected'}`);
                        if (await adapter.objectExists(`${tree.device.idChannel}.${mac}.isOnline`)) {
                            await adapter.setStateChangedAsync(`${tree.device.idChannel}.${mac}.isOnline`, connected, true);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async speedTest(event, adapter, cache) {
            const logPrefix = '[eventHandler.device.speedTest]:';
            try {
                const mac = event.meta.mac;
                for (const data of event.data) {
                    if (!Object.hasOwn(data, 'upload-progress') && !Object.hasOwn(data, 'download-progress')) {
                        const wan = cache.devices[mac]?.wan1?.ifname === data.interface_name ? 'wan1' : cache.devices[mac]?.wan2?.ifname === data.interface_name ? 'wan2' : 'wan1';
                        adapter.log.debug(`${logPrefix} speedtest event (meta: ${JSON.stringify(event.meta)}, data: ${JSON.stringify(data)})`);
                        if (wan) {
                            const idChannel = `${tree.device.idChannel}.${mac}.${wan}`;
                            if (await adapter.objectExists(`${idChannel}.speedtest_download`)) {
                                await adapter.setState(`${idChannel}.speedtest_download`, { val: data.xput_download, lc: data.rundate * 1000 }, true);
                            }
                            if (await adapter.objectExists(`${idChannel}.speedtest_upload`)) {
                                await adapter.setState(`${idChannel}.speedtest_upload`, { val: data.xput_upload, lc: data.rundate * 1000 }, true);
                            }
                            if (await adapter.objectExists(`${idChannel}.latency`)) {
                                await adapter.setState(`${idChannel}.latency`, { val: data.latency, lc: data.rundate * 1000 }, true);
                            }
                        }
                    }
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, event: ${JSON.stringify(event)}`);
            }
        },
        async lostContact(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.device.lostContact]:';
            try {
                const mac = data.sw || data.ap || data.gw;
                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) 'lost contact'`);
                        if (await adapter.objectExists(`${tree.device.idChannel}.${mac}.isOnline`)) {
                            await adapter.setStateChangedAsync(`${tree.device.idChannel}.${mac}.isOnline`, false, true);
                        }
                        if (await adapter.objectExists(`${tree.device.idChannel}.${mac}.state`)) {
                            await adapter.setStateChangedAsync(`${tree.device.idChannel}.${mac}.state`, 0, true);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'lost contact' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async wanTransition(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.device.wanTransition]:';
            try {
                const mac = data.gw || data.dm;
                const ifname = data.iface;
                if (mac) {
                    if (adapter.config.devicesEnabled) {
                        const idWanInterface = cache?.devices[mac]?.wan1?.ifname === ifname ? 'wan1' : cache?.devices[mac]?.wan2?.ifname === ifname ? 'wan2' : undefined;
                        if (idWanInterface) {
                            adapter.log.info(`${logPrefix} '${cache?.devices[mac]?.name}' (mac: ${mac}) '${idWanInterface} transition', state: ${data.state}`);
                            const isOnlineId = `devices.${mac}.isp.${idWanInterface}.isOnline`;
                            if (await adapter.objectExists(isOnlineId)) {
                                await adapter.setStateChangedAsync(isOnlineId, data.state !== 'inactive', true);
                            }
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'lost contact' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
    },
    client: {
        async connected(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.connected]:';
            try {
                const mac = data.user || data.guest;
                const connected = WebSocketEvent.client.Connected.includes(data.key);
                const isGuest = data.guest ? true : false;
                if (mac) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        const id = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.isOnline`;
                        if (connected || adapter.config.clientRealtimeDisconnectDebounceTime === 0) {
                            if (data.subsystem === 'wlan') {
                                adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''}) ${connected ? 'to' : 'from'} '${data.ssid}' on '${data.ap_displayName || data.ap_name}'`);
                            }
                            else {
                                adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''})`);
                            }
                            if (delete disconnectDebounceList[mac]) {
                                delete disconnectDebounceList[mac];
                            }
                            if (await adapter.objectExists(id)) {
                                await adapter.setState(id, connected, true);
                            }
                        }
                        else {
                            disconnectDebounceList[mac] = moment().valueOf();
                            let logMsg = `${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''})`;
                            if (data.subsystem === 'wlan') {
                                logMsg = `${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${connected ? 'connected' : 'disconnected'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''}) ${connected ? 'to' : 'from'} '${data.ssid}' on '${data.ap_displayName || data.ap_name}'`;
                            }
                            adapter.log.debug(`${logMsg} -> debounce disconnection for ${adapter.config.clientRealtimeDisconnectDebounceTime}s`);
                            // debounce disconnection if it's configured
                            setTimeout(async () => {
                                if (disconnectDebounceList[mac]) {
                                    adapter.log.info(logMsg);
                                    if (await adapter.objectExists(id)) {
                                        await adapter.setState(id, connected, true);
                                    }
                                }
                                else {
                                    adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' 're-connected' in the debounce time, nothing to do`);
                                }
                                if (delete disconnectDebounceList[mac]) {
                                    delete disconnectDebounceList[mac];
                                }
                            }, adapter.config.clientRealtimeDisconnectDebounceTime * 1000);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async roamed(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.roamed]:';
            try {
                const mac = data.user || data.guest;
                const isGuest = data.guest ? true : false;
                if (mac && data.ap_from && data.ap_to) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}, ip: ${cache?.clients[mac]?.ip}) roamed from '${cache?.devices[data.ap_from]?.name}' (mac: ${data.ap_from}) to '${cache?.devices[data.ap_to]?.name}' (mac: ${data.ap_to})`);
                        const idApName = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.uplink_name`;
                        if (await adapter.objectExists(idApName)) {
                            await adapter.setState(idApName, cache?.devices[data.ap_to]?.name ? cache?.devices[data.ap_to]?.name : null, true);
                        }
                        const idApMac = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.uplink_mac`;
                        if (await adapter.objectExists(idApMac)) {
                            await adapter.setState(idApMac, (data.ap_to) ? (data.ap_to) : null, true);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'roam' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async roamedRadio(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.roamedRadio]:';
            try {
                const mac = data.user || data.guest;
                const isGuest = data.guest ? true : false;
                if (mac && data.channel_from && data.channel_to && data.ap) {
                    if ((!isGuest && adapter.config.clientsEnabled) || (isGuest && adapter.config.guestsEnabled)) {
                        adapter.log.debug(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' (mac: ${mac}) roamed radio from channel '${data.channel_from}' to '${data.channel_to}' on '${cache?.devices[data.ap]?.name || data.ap_displayName || data.ap_name}' (mac: ${cache?.devices[data.ap]?.mac || data.ap})`);
                        const idChannel = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.channel`;
                        const valChannel = parseInt(data.channel_to);
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.setState(idChannel, valChannel, true);
                        }
                        const idChannelName = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.channel_frequency`;
                        if (await adapter.objectExists(idChannelName)) {
                            await adapter.setState(idChannelName, myHelper.radioToFrequency(data.radio_to, adapter), true);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'roam radio' has no mac or ap information! (data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async block(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.block]:';
            try {
                const mac = data.client;
                if (mac) {
                    if (cache && cache.clients && cache.clients[mac]) {
                        const isGuest = cache.clients[mac].is_guest;
                        const blocked = data.key.includes('_Blocked');
                        const id = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}.blocked`;
                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache?.clients[mac]?.name}' ${blocked ? 'blocked' : 'unblocked'} (mac: ${mac}${cache?.clients[mac]?.ip ? `, ip: ${cache?.clients[mac]?.ip}` : ''})`);
                        if (await adapter.objectExists(id)) {
                            await adapter.setState(id, blocked, true);
                        }
                    }
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'connected / disconnected' has no mac address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
        async vpnDisconnect(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.client.vpnDisconnect]:';
            try {
                if (data.ip && data.network_id) {
                    const preparedIp = data.ip.replaceAll('.', '_');
                    const id = `vpn.${data.network_id}.${preparedIp}.isOnline`;
                    if (await adapter.objectExists(id)) {
                        await adapter.setState(id, false, true);
                    }
                    adapter.log.info(`${logPrefix} vpn client '${cache?.vpn[data.ip]?.name}' 'disconnected' (ip: ${cache?.vpn[data.ip]?.ip}, remote_ip: ${cache?.vpn[data.ip]?.remote_ip})`);
                }
                else {
                    adapter.log.warn(`${logPrefix} event 'vpn disconnected' has no ip address! (meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)})`);
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        }
    },
    user: {
        async clientRemoved(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.user.clientRemoved]:';
            try {
                if (adapter.config.keepIobSynchron && cache && cache.clients && cache.clients[data.mac]) {
                    const mac = data.mac;
                    const isGuest = cache.clients[mac].is_guest;
                    const idChannel = `${isGuest ? tree.client.idChannelGuests : tree.client.idChannelUsers}.${mac}`;
                    if (await adapter.objectExists(idChannel)) {
                        await adapter.delObjectAsync(idChannel, { recursive: true });
                        adapter.log.info(`${logPrefix} ${isGuest ? 'guest' : 'client'} '${cache.clients[mac].name}' deleted, because it's removed by the unifi-controller`);
                    }
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        },
    },
    wlanConf: {
        async deleted(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.wlanConf.deleted]:';
            try {
                if (data && adapter.config.keepIobSynchron) {
                    for (const wlan of data) {
                        const idChannel = `${tree.wlan.idChannel}.${wlan._id}`;
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.delObjectAsync(idChannel, { recursive: true });
                            adapter.log.debug(`${logPrefix} wlan '${wlan.name}' (channel: ${idChannel}) deleted`);
                        }
                        if (adapter.config.devicesEnabled) {
                            const devices = await adapter.getStatesAsync(`${tree.device.idChannel}.*.wlan.*.id`);
                            for (const id in devices) {
                                if (devices[id].val === wlan._id) {
                                    const idChannel = adapter.myIob.getIdWithoutLastPart(id);
                                    if (await adapter.objectExists(idChannel)) {
                                        await adapter.delObjectAsync(idChannel, { recursive: true });
                                        adapter.log.debug(`${logPrefix} wlan '${wlan.name}' deleted from device (channel: ${idChannel})`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        }
    },
    lanConf: {
        async deleted(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.lanConf.deleted]:';
            try {
                if (data && adapter.config.keepIobSynchron) {
                    for (const lan of data) {
                        const idChannel = `${tree.lan.idChannel}.${lan._id}`;
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.delObjectAsync(idChannel, { recursive: true });
                            adapter.log.debug(`${logPrefix} lan '${lan.name}' (channel: ${idChannel}) deleted`);
                        }
                    }
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        }
    },
    firewallGroup: {
        async deleted(meta, data, adapter, cache) {
            const logPrefix = '[eventHandler.firewallGroup.deleted]:';
            try {
                if (data && adapter.config.keepIobSynchron) {
                    for (const firewallGroup of data) {
                        const idChannel = `${tree.firewallGroup.idChannel}.${firewallGroup._id}`;
                        if (await adapter.objectExists(idChannel)) {
                            await adapter.delObjectAsync(idChannel, { recursive: true });
                            adapter.log.debug(`${logPrefix} firewall group '${firewallGroup.name}' (channel: ${idChannel}) deleted`);
                        }
                    }
                }
            }
            catch (error) {
                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, meta: ${JSON.stringify(meta)}, data: ${JSON.stringify(data)}`);
            }
        }
    }
};
