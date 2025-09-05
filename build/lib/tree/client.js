import moment from 'moment';
import * as myHelper from '../helper.js';
export var client;
(function (client) {
    let keys = undefined;
    client.idChannel = 'clients';
    client.idChannelUsers = `${client.idChannel}.users`;
    client.idChannelGuests = `${client.idChannel}.guests`;
    client.idChannelVpn = `${client.idChannel}.vpn`;
    function get() {
        return {
            // authorized: {                                --> just kicks the client, use case ???
            //     iobType: 'boolean',
            //     name: 'client is authorized',
            //     read: true,
            //     write: true,
            //     conditionToCreateState(objDevice: myNetworkClient, adapter: ioBroker.Adapter): boolean {
            //         // only wired and wireless clients
            //         return objDevice.is_guest;
            //     },
            // },
            blocked: {
                iobType: 'boolean',
                name: 'client is blocked',
                read: true,
                write: true,
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
                readVal(val, adapter, cache, deviceOrClient, id) {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
                readVal(val, adapter, cache, deviceOrClient, id) {
                    if (deviceOrClient.fingerprint && adapter.config.clientImageDownload) {
                        if (deviceOrClient.unifi_device_info && deviceOrClient.unifi_device_info.icon_filename) {
                            return `https://static.ui.com/fingerprint/ui/icons/${deviceOrClient.unifi_device_info.icon_filename}_257x257.png?q=100`;
                        }
                        else if (Object.prototype.hasOwnProperty.call(deviceOrClient.fingerprint, 'computed_engine')) {
                            if (Object.prototype.hasOwnProperty.call(deviceOrClient.fingerprint, 'dev_id_override')) {
                                return `https://static.ui.com/fingerprint/${deviceOrClient.fingerprint.computed_engine}/${deviceOrClient.fingerprint.dev_id_override}_257x257.png?q=100`;
                            }
                            else if (Object.prototype.hasOwnProperty.call(deviceOrClient.fingerprint, 'dev_id')) {
                                return `https://static.ui.com/fingerprint/${deviceOrClient.fingerprint.computed_engine}/${deviceOrClient.fingerprint.dev_id}_257x257.png?q=100`;
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
                conditionToCreateState(objDevice, adapter) {
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
                readVal(val, adapter, cache, deviceOrClient, id) {
                    const diff = moment().diff(val * 1000, 'seconds');
                    if (deviceOrClient.type !== 'VPN') {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                }
            },
            last_uplink_name: {
                id: 'uplink_name',
                iobType: 'string',
                name: 'name of the connected access point or switch',
                conditionToCreateState(objDevice, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                }
            },
            sw_port: {
                id: 'uplink_port',
                iobType: 'number',
                name: 'port of the connected switch',
                conditionToCreateState(objDevice, adapter) {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
            },
            name: {
                iobType: 'string',
                name: 'device name',
                read: true,
                write: true
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
                readVal(val, adapter, cache, deviceOrClient, id) {
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
                readVal(val, adapter, cache, deviceOrClient, id) {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wireless clients
                    return (!objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === 'WIRELESS';
                },
                read: false,
                write: true,
                role: 'button'
            },
            remote_ip: {
                iobType: 'string',
                name: 'remote ip',
                conditionToCreateState(objDevice, adapter) {
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
                readVal(val, adapter, cache, deviceOrClient, id) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            rx_rate: {
                iobType: 'number',
                name: 'Rx Rate',
                unit: 'mbps',
                readVal(val, adapter, cache, deviceOrClient, id) {
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
                readVal(val, adapter, cache, deviceOrClient, id) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            tx_rate: {
                iobType: 'number',
                name: 'Tx Rate',
                unit: 'mbps',
                readVal(val, adapter, cache, deviceOrClient, id) {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wired and wireless clients
                    return objDevice?.type === undefined || objDevice?.type !== "VPN";
                },
            },
            wired_rate_mbps: {
                id: 'speed',
                iobType: 'number',
                name: 'wired speed',
                unit: 'mbps',
                conditionToCreateState(objDevice, adapter) {
                    // only wired clients
                    return (objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === "WIRED";
                },
            },
            wifi_experience_average: {
                id: 'wlan_experience',
                iobType: 'number',
                name: 'experience',
                unit: '%',
                conditionToCreateState(objDevice, adapter) {
                    // only wireless clients
                    return (!objDevice?.is_wired && objDevice?.type === undefined) || objDevice?.type === 'WIRELESS';
                },
            },
            wifi_tx_retries_percentage: {
                id: 'wlan_tx_retries',
                iobType: 'number',
                name: 'TX Retries',
                unit: '%',
                conditionToCreateState(objDevice, adapter) {
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
