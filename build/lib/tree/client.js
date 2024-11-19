import moment from 'moment';
import * as myHelper from '../helper.js';
export var client;
(function (client) {
    let keys = undefined;
    function get() {
        return {
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
                readVal(val, adapter, cache, deviceOrClient) {
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
                name: 'imageUrl',
                expert: true,
                subscribeMe: true,
                valFromProperty: 'fingerprint',
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
                },
                readVal(val, adapter, cache, deviceOrClient) {
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
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
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
                name: 'ip address'
            },
            isOnline: {
                id: 'isOnline',
                iobType: 'boolean',
                name: 'Is client online',
                valFromProperty: 'last_seen',
                subscribeMe: true,
                readVal(val, adapter, cache, deviceOrClient) {
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
                name: 'last seen'
            },
            last_uplink_mac: {
                id: 'uplink_mac',
                iobType: 'string',
                name: 'mac address of the connected access point or switch',
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
                }
            },
            last_uplink_name: {
                id: 'uplink_name',
                iobType: 'string',
                name: 'name of the connected access point or switch',
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
                }
            },
            sw_port: {
                id: 'uplink_port',
                iobType: 'number',
                name: 'port of the connected switch',
                conditionToCreateState(objValues, adapter) {
                    // only wired clients
                    return (objValues.is_wired && objValues.type === undefined) || objValues.type === "WIRED";
                }
            },
            mac: {
                iobType: 'string',
                name: 'mac address'
            },
            model_name: {
                id: 'model',
                iobType: 'string',
                name: 'model name',
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
                },
            },
            name: {
                iobType: 'string',
                name: 'device name'
            },
            network_id: {
                iobType: 'string',
                name: 'network id'
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
                readVal(val, adapter, cache, deviceOrClient) {
                    if (val) {
                        if (val === 'ax')
                            return 'WiFi 6';
                        if (val === 'ac')
                            return 'WiFi 5';
                        if (val === 'ng')
                            return 'WiFi 4';
                        if (val === 'n')
                            return 'WiFi 4';
                        if (val === 'g')
                            return 'WiFi 3';
                        if (val === 'b')
                            return 'WiFi 2';
                        if (val === 'a')
                            return 'WiFi 1';
                    }
                    return 'tbd';
                }
            },
            reconnect: {
                id: 'reconnect',
                iobType: 'boolean',
                name: 'reconnect client',
                conditionToCreateState(objValues, adapter) {
                    // only wireless clients
                    return (!objValues.is_wired && objValues.type === undefined) || objValues.type === 'WIRELESS';
                },
                read: false,
                write: true,
                role: 'button'
            },
            remote_ip: {
                iobType: 'string',
                name: 'remote ip',
                conditionToCreateState(objValues, adapter) {
                    // only wireless clients
                    return objValues.type === 'VPN';
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
                readVal(val, adapter, cache, deviceOrClient) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            rx_rate: {
                iobType: 'number',
                name: 'Rx Rate',
                unit: 'mbps',
                readVal(val, adapter, cache, deviceOrClient) {
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
                readVal(val, adapter, cache, deviceOrClient) {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            tx_rate: {
                iobType: 'number',
                name: 'Tx Rate',
                unit: 'mbps',
                readVal(val, adapter, cache, deviceOrClient) {
                    return Math.round(val / 1000);
                }
            },
            type: {
                iobType: 'string',
                name: 'client type',
                states: {
                    "WIRED": 'Wired',
                    "WIRELESS": 'WiFi',
                    "VPN": 'VPN'
                }
            },
            vlan: {
                id: 'network_vlan',
                iobType: 'number',
                name: 'VLAN number',
                conditionToCreateState(objValues, adapter) {
                    // only wired and wireless clients
                    return objValues.type === undefined || objValues.type !== "VPN";
                },
            },
            wired_rate_mbps: {
                id: 'speed',
                iobType: 'number',
                name: 'wired speed',
                unit: 'mbps',
                conditionToCreateState(objValues, adapter) {
                    // only wired clients
                    return (objValues.is_wired && objValues.type === undefined) || objValues.type === "WIRED";
                },
            },
            wifi_experience_average: {
                id: 'wifi_experience',
                iobType: 'number',
                name: 'experience',
                unit: '%',
                conditionToCreateState(objValues, adapter) {
                    // only wireless clients
                    return (!objValues.is_wired && objValues.type === undefined) || objValues.type === 'WIRELESS';
                },
            },
            wifi_tx_retries_percentage: {
                id: 'wifi_tx_retries',
                iobType: 'number',
                name: 'TX Retries',
                unit: '%',
                conditionToCreateState(objValues, adapter) {
                    // only wireless clients
                    return (!objValues.is_wired && objValues.type === undefined) || objValues.type === 'WIRELESS';
                },
            },
            uptime: {
                iobType: 'number',
                name: 'uptime',
                unit: 's',
            },
        };
    }
    client.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    client.getKeys = getKeys;
})(client || (client = {}));
