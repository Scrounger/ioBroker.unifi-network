import moment from 'moment';
import * as myHelper from '../helper.js';
import { ApiEndpoints } from '../api/network-api.js';
export var client;
(function (client) {
    let keys = undefined;
    client.idChannel = 'clients';
    client.idChannelUsers = `${client.idChannel}.users`;
    client.idChannelGuests = `${client.idChannel}.guests`;
    client.idChannelVpn = `${client.idChannel}.vpn`;
    function get() {
        return {
            // authorized: {                                //-- > just kicks the client, use case ???
            //     iobType: 'boolean',
            //     name: 'client is authorized',
            //     read: true,
            //     write: true,
            //     conditionToCreateState(objDevice: myNetworkClient, objChannel: myNetworkClient, adapter: ioBroker.myAdapter): boolean {
            //         // only wired and wireless clients
            //         return objDevice.is_guest;
            //     },
            //     async writeVal(val: boolean, id: string, device: myNetworkClient, adapter: ioBroker.myAdapter): Promise<void> {
            //         const logPrefix = `[tree.client.authorized]`;
            //         const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: val ? 'authorize-guest' : 'unauthorize-guest', mac: device.mac.toLowerCase() });
            //         await adapter.ufn.checkCommandSuccessful(result, logPrefix, `${val ? 'authorize guest' : 'unauthorize guest'} - '${device.name}' (mac: ${device.mac})`);
            //     },
            // },
            blocked: {
                iobType: 'boolean',
                name: 'client is blocked',
                read: true,
                write: true,
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[tree.client.blocked]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: val ? 'block-sta' : 'unblock-sta', mac: device.mac.toLowerCase() });
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `${val ? 'block' : 'unblock'} - '${device.name}' (mac: ${device.mac})`);
                },
            },
            channel: {
                iobType: 'number',
                name: 'channel'
            },
            channel_name: {
                id: 'channel_frequency',
                iobType: 'string',
                name: 'channel name',
                valFromProperty: 'radio_name',
                readVal(val, adapter, device, channel, id) {
                    return myHelper.radio_nameToFrequency(val, adapter);
                }
            },
            essid: {
                iobType: 'string',
                name: 'WLAN SSID'
            },
            first_seen: {
                iobType: 'number',
                name: 'first seen'
            },
            hostname: {
                iobType: 'string',
                name: 'hostname'
            },
            imageUrl: {
                iobType: 'string',
                name: 'image url',
                expert: true,
                subscribeMe: true,
                valFromProperty: 'fingerprint',
                required: true,
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
                readVal(val, adapter, device, channel, id) {
                    if (device.fingerprint && adapter.config.clientImageDownload) {
                        if (device.unifi_device_info && device.unifi_device_info.icon_filename) {
                            return `https://static.ui.com/fingerprint/ui/icons/${device.unifi_device_info.icon_filename}_257x257.png?q=100`;
                        }
                        else if (Object.hasOwn(device.fingerprint, 'computed_engine')) {
                            if (Object.hasOwn(device.fingerprint, 'dev_id_override')) {
                                return `https://static.ui.com/fingerprint/${device.fingerprint.computed_engine}/${device.fingerprint.dev_id_override}_257x257.png?q=100`;
                            }
                            else if (Object.hasOwn(device.fingerprint, 'dev_id')) {
                                return `https://static.ui.com/fingerprint/${device.fingerprint.computed_engine}/${device.fingerprint.dev_id}_257x257.png?q=100`;
                            }
                        }
                    }
                    return null;
                }
            },
            image: {
                id: 'image',
                iobType: 'string',
                name: 'base64 image',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                }
            },
            // is_guest: {
            //     iobType: 'boolean',
            //     name: 'is guest'
            // },
            is_wired: {
                iobType: 'boolean',
                name: 'is wired'
            },
            ip: {
                iobType: 'string',
                name: 'ip address',
                required: true
            },
            isOnline: {
                id: 'isOnline',
                iobType: 'boolean',
                name: 'Is client online',
                valFromProperty: 'last_seen',
                subscribeMe: true,
                required: true,
                readVal(val, adapter, device, channel, id) {
                    const diff = moment().diff(val * 1000, 'seconds');
                    if (device.type !== 'VPN') {
                        return diff <= adapter.config.clientOfflineTimeout;
                    }
                    else {
                        return diff <= adapter.config.vpnOfflineTimeout;
                    }
                }
            },
            last_seen: {
                iobType: 'number',
                name: 'last seen',
                required: true
            },
            last_uplink_mac: {
                id: 'uplink_mac',
                iobType: 'string',
                name: 'mac address of the connected access point or switch',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                }
            },
            last_uplink_name: {
                id: 'uplink_name',
                iobType: 'string',
                name: 'name of the connected access point or switch',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                }
            },
            sw_port: {
                id: 'uplink_port',
                iobType: 'number',
                name: 'port of the connected switch',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired clients
                    return (objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === "WIRED";
                }
            },
            mac: {
                iobType: 'string',
                name: 'mac address',
                required: true
            },
            model_name: {
                id: 'model',
                iobType: 'string',
                name: 'model name',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
            },
            name: {
                iobType: 'string',
                name: 'device name',
                read: true,
                write: true,
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[tree.client.name]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.clients)}/${device.user_id.trim()}`, { name: val }, 'PUT');
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `set name - '${device.name}' (mac: ${device.mac}, new name: ${val})`);
                }
            },
            network_id: {
                iobType: 'string',
                name: 'network id'
            },
            network_members_group_ids: {
                //ToDo: writeable and best case selectable groups
                id: 'network_members_group',
                iobType: 'string',
                name: 'network member groups',
                readVal(val, adapter, device, channel, id) {
                    return JSON.stringify(val);
                },
            },
            network_name: {
                iobType: 'string',
                name: 'network name'
            },
            radio: {
                iobType: 'string',
                name: 'radio',
                valFromProperty: 'radio_proto'
            },
            radio_name: {
                id: 'radio_name',
                iobType: 'string',
                name: 'radio name',
                valFromProperty: 'radio_proto',
                readVal(val, adapter, device, channel, id) {
                    if (val) {
                        if (val === 'ax') {
                            return 'WiFi 6';
                        }
                        if (val === 'ac') {
                            return 'WiFi 5';
                        }
                        if (val === 'ng') {
                            return 'WiFi 4';
                        }
                        if (val === 'n') {
                            return 'WiFi 4';
                        }
                        if (val === 'g') {
                            return 'WiFi 3';
                        }
                        if (val === 'b') {
                            return 'WiFi 2';
                        }
                        if (val === 'a') {
                            return 'WiFi 1';
                        }
                    }
                    return 'tbd';
                }
            },
            reconnect: {
                id: 'reconnect',
                iobType: 'boolean',
                name: 'reconnect client',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wireless clients
                    return (!objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === 'WIRELESS';
                },
                read: false,
                write: true,
                role: 'button',
                async writeVal(val, id, device, adapter) {
                    const logPrefix = `[tree.client.reconnect]`;
                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'kick-sta', mac: device.mac.toLowerCase() });
                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `reconnect - '${device.name}' (mac: ${device.mac})`, id);
                },
            },
            remote_ip: {
                iobType: 'string',
                name: 'remote ip',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wireless clients
                    return objDevice?.type === 'VPN';
                },
            },
            // remove: {
            //     id: 'remove',
            //     iobType: 'boolean',
            //     name: 'remove client from controller',
            //     read: false,
            //     write: true,
            //     role: 'button'
            // },
            rx_bytes: {
                iobType: 'number',
                name: 'RX Bytes',
                unit: 'GB',
                readVal(val, adapter, device, channel, id) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            rx_rate: {
                iobType: 'number',
                name: 'Rx Rate',
                unit: 'mbps',
                readVal(val, adapter, device, channel, id) {
                    return Math.round(val / 1000);
                }
            },
            signal: {
                iobType: 'number',
                name: 'signal',
                unit: 'dBm'
            },
            tx_bytes: {
                iobType: 'number',
                name: 'TX Bytes',
                unit: 'GB',
                readVal(val, adapter, device, channel, id) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            tx_rate: {
                iobType: 'number',
                name: 'Tx Rate',
                unit: 'mbps',
                readVal(val, adapter, device, channel, id) {
                    return Math.round(val / 1000);
                }
            },
            type: {
                iobType: 'string',
                name: 'client type',
                states: {
                    "WIRED": 'LAN',
                    "WIRELESS": 'WLAN',
                    "VPN": 'VPN'
                }
            },
            uptime: {
                iobType: 'number',
                name: 'uptime',
                unit: 's',
                required: true,
            },
            vlan: {
                id: 'network_vlan',
                iobType: 'number',
                name: 'VLAN number',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
            },
            wired_rate_mbps: {
                id: 'speed',
                iobType: 'number',
                name: 'wired speed',
                unit: 'mbps',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wired clients
                    return (objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === "WIRED";
                },
            },
            wifi_experience_average: {
                id: 'wlan_experience',
                iobType: 'number',
                name: 'experience',
                unit: '%',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wireless clients
                    return (!objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === 'WIRELESS';
                },
            },
            wifi_tx_retries_percentage: {
                id: 'wlan_tx_retries',
                iobType: 'number',
                name: 'TX Retries',
                unit: '%',
                conditionToCreateState(objDevice, objChannel, adapter) {
                    // only wireless clients
                    return (!objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === 'WIRELESS';
                },
            },
        };
    }
    client.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
            // manual add keys here:
            keys.push(...['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        }
        return keys;
    }
    client.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    client.getStateIDs = getStateIDs;
})(client || (client = {}));
