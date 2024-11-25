import _ from 'lodash';
import { NetworkDevice, NetworkDeviceStorage, NetworkDevicePortTable, NetworkDeviceRadioTableStat, NetworkDeviceTemperature, NetworkDeviceVapTable } from '../api/network-types-device.js';
import { myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject, myNetworkClient } from '../myTypes.js';
import * as myHelper from '../helper.js';


export namespace device {
    let keys: string[] = undefined;

    export const idChannel = 'devices'

    export function get(): { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray } {
        return {
            connected_clients: {
                id: 'connected_clients',
                iobType: 'number',
                name: 'connected clients',
                valFromProperty: 'user-num_sta',
            },
            connected_guests: {
                id: 'connected_guests',
                iobType: 'number',
                name: 'connected guests',
                valFromProperty: 'guest-num_sta',
            },
            disabled: {
                id: 'disabled',
                iobType: 'boolean',
                name: 'access point is disabled',
                conditionToCreateState(objValues: NetworkDevice, adapter: ioBroker.Adapter): boolean {
                    // only wireless clients
                    return objValues.is_access_point;
                },
                read: false,
                write: true,
                role: 'button'
            },
            hasError: {
                id: 'hasError',
                iobType: 'boolean',
                name: 'device reported errors',
                valFromProperty: 'state',
                required: true,
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return val === 6 || val === 9
                },
            },
            imageUrl: {
                iobType: 'string',
                name: 'imageUrl',
                expert: true,
                subscribeMe: true,
                valFromProperty: 'model',
                required: true,
                readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    if (val && adapter.config.deviceImageDownload) {
                        const find = _.find(cache.deviceModels, (x) => x.model_name.includes(val));

                        if (find) {
                            return `https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/${find.id}/default/${find.default_image_id}.png&w=256?q=100`
                        }
                    }
                    return null;
                }
            },
            image: {
                id: 'image',
                iobType: 'string',
                name: 'base64 image'
            },
            ip: {
                iobType: 'string',
                name: 'ip address'
            },
            isOnline: {
                id: 'isOnline',
                iobType: 'boolean',
                name: 'is device online',
                valFromProperty: 'state',
                required: true,
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return val !== 0 && val !== 6 && val !== 9
                },
            },
            led_override: {
                iobType: 'string',
                name: 'led override',
                write: true,
                states: {
                    'on': 'on',
                    'off': 'off',
                    'default': 'default'
                }
            },
            last_seen: {
                iobType: 'number',
                name: 'last seen',
                required: true
            },
            mac: {
                iobType: 'string',
                name: 'mac address',
                required: true
            },
            name: {
                iobType: 'string',
                name: 'device name'
            },
            restart: {
                id: 'restart',
                iobType: 'boolean',
                name: 'restart device',
                read: false,
                write: true,
                role: 'button'
            },
            rx_bytes: {
                iobType: 'number',
                name: 'RX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            state: {
                iobType: 'number',
                name: 'device state',
                states: {
                    0: "offline",
                    1: "connected",
                    2: "pending adoption",
                    4: "updating",
                    5: "provisioning",
                    6: "unreachable",
                    7: "adopting",
                    9: "adoption error",
                    11: "isolated",
                    999: "restarting"
                }
            },
            port_table: {
                idChannel: 'ports',
                channelName: 'port table',
                arrayChannelIdFromProperty(objValues: NetworkDevicePortTable, i: number, adapter: ioBroker.Adapter): string {
                    return `port_${myHelper.zeroPad(objValues.port_idx, 2)}`
                },
                arrayChannelNameFromProperty(objValues: any, adapter: ioBroker.Adapter): string {
                    return objValues['name']
                },
                array: {
                    name: {
                        iobType: 'string',
                        name: 'port name'
                    },
                    enable: {
                        iobType: 'boolean',
                        name: 'enabled'
                    },
                    is_uplink: {
                        iobType: 'boolean',
                        name: 'is uplink port'
                    },
                    poe_enable: {
                        id: 'poe_enable',
                        iobType: 'boolean',
                        name: 'POE enabled',
                        conditionToCreateState(objValues: NetworkDevicePortTable, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.port_poe === true;
                        },
                        valFromProperty: 'poe_mode',
                        read: true,
                        write: true,
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return val === 'auto';
                        }
                    },
                    poe_cycle: {
                        id: 'poe_cycle',
                        iobType: 'boolean',
                        name: 'temporary interruption of the power supply to the poe port of the switch',
                        read: false,
                        write: true,
                        role: 'button',
                        conditionToCreateState(objValues: NetworkDevicePortTable, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.port_poe === true;
                        },
                    },
                    poe_power: {
                        iobType: 'number',
                        name: 'POE power consumption',
                        unit: 'W',
                        conditionToCreateState(objValues: NetworkDevicePortTable, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.port_poe === true;
                        },
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return parseFloat(val);
                        }
                    },
                    poe_voltage: {
                        iobType: 'number',
                        name: 'POE voltage',
                        unit: 'V',
                        conditionToCreateState(objValues: NetworkDevicePortTable, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.port_poe === true;
                        },
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return parseFloat(val);
                        }
                    },
                    port_idx: {
                        iobType: 'number',
                        name: 'Port number'
                    },
                    rx_bytes: {
                        iobType: 'number',
                        name: 'RX Bytes',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        conditionToCreateState(objValues: NetworkDevicePortTable, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.satisfaction >= 0 ? true : false;
                        },
                        unit: '%'
                    },
                    speed: {
                        iobType: 'number',
                        name: 'speed',
                        unit: 'mbps'
                    },
                    tx_bytes: {
                        iobType: 'number',
                        name: 'TX Bytes',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    }
                },
            },
            radio_table: {
                idChannel: 'radio',
                channelName: 'WLAN Radio',
                arrayChannelNameFromProperty(objValues: any, adapter: ioBroker.Adapter): string {
                    return myHelper.radio_nameToFrequency(objValues['name'], adapter);
                },
                array: {
                    channel: {
                        iobType: 'number',
                        name: 'channel'
                    },
                    channel_name: {
                        id: 'channel_frequency',
                        iobType: 'string',
                        name: 'channel name',
                        valFromProperty: 'name',
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return myHelper.radio_nameToFrequency(val, adapter);
                        }
                    },
                    channel_width: {
                        id: 'channel_width',
                        iobType: 'number',
                        name: 'channel width / frequency',
                        valFromProperty: 'ht',
                        unit: 'MHz'
                    },
                    transmit_power: {
                        id: 'transmit_power',
                        iobType: 'string',
                        name: 'transmit power',
                        valFromProperty: 'tx_power_mode'
                    }
                }
            },
            radio_table_stats: {
                idChannel: 'radio',
                channelName: 'WLAN Radio',
                arrayChannelNameFromProperty(objValues: NetworkDeviceRadioTableStat, adapter: ioBroker.Adapter): string {
                    return myHelper.radio_nameToFrequency(objValues.name, adapter);
                },
                array: {
                    connected_clients: {
                        id: 'connected_clients',
                        iobType: 'number',
                        name: 'connected clients',
                        valFromProperty: 'user-num_sta',
                    },
                    connected_guests: {
                        id: 'connected_guests',
                        iobType: 'number',
                        name: 'connected guests',
                        valFromProperty: 'guest-num_sta',
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        conditionToCreateState(objValues: NetworkDeviceRadioTableStat, adapter: ioBroker.Adapter): boolean {
                            // only create state if it's a poe port
                            return objValues.satisfaction >= 0 ? true : false;
                        },
                        unit: '%'
                    },
                }
            },
            satisfaction: {
                iobType: 'number',
                name: 'satisfaction',
                conditionToCreateState(objValues: NetworkDevice, adapter: ioBroker.Adapter): boolean {
                    // only create state if it's a poe port
                    return objValues.satisfaction >= 0 ? true : false;
                },
                unit: '%'
            },
            storage: {
                channelName: 'storage',
                arrayChannelNameFromProperty(objValues: NetworkDeviceStorage, adapter: ioBroker.Adapter) {
                    return objValues.name
                },
                array: {
                    'mount_point': {
                        iobType: 'string',
                        name: 'mount point'
                    },
                    name: {
                        iobType: 'string',
                        name: 'name'
                    },
                    size: {
                        iobType: 'number',
                        name: 'size',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    type: {
                        iobType: 'string',
                        name: 'type'
                    },
                    used: {
                        iobType: 'number',
                        name: 'used',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    }
                }
            },
            "system-stats": {
                idChannel: 'system',
                channelName: 'system statistics',
                object: {
                    cpu: {
                        iobType: 'number',
                        unit: '%',
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return parseFloat(val);
                        },

                    },
                    mem: {
                        iobType: 'number',
                        unit: '%',
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return parseFloat(val);
                        },
                    }
                }
            },
            temperatures: {
                channelName: 'temperature',
                arrayChannelIdFromProperty(objValues: NetworkDeviceTemperature, i: number, adapter: ioBroker.Adapter): string {
                    return objValues.name
                },
                arrayChannelNameFromProperty(objValues: NetworkDeviceTemperature, adapter: ioBroker.Adapter): string {
                    return objValues.name
                },
                array: {
                    type: {
                        iobType: 'string',
                        name: 'type'
                    },
                    value: {
                        iobType: 'number',
                        name: 'value',
                        unit: '°C',
                        readVal: function (val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val * 10) / 10;
                        },
                    },
                },
            },
            temperature: {
                id: 'temperature',
                iobType: 'number',
                name: 'temperature',
                unit: '°C',
                valFromProperty: 'general_temperature',
                readVal: function (val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return Math.round(val * 10) / 10;
                },
            },
            tx_bytes: {
                iobType: 'number',
                name: 'TX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                    return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                }
            },
            power: {
                id: 'power',
                iobType: 'number',
                name: 'total power consumption',
                unit: 'W',
                valFromProperty: 'total_used_power'
            },
            upgradable: {
                iobType: 'boolean',
                name: 'new firmware available'
            },
            upgrade: {
                id: 'upgrade',
                iobType: 'boolean',
                name: 'upgrade device to new firmware',
                read: false,
                write: true,
                role: 'button'
            },
            uplink: {
                channelName: 'uplink device',
                object: {
                    // Ip is same as from device, it's not the ip of the uplink device
                    // ip: {
                    //     iobType: 'string',
                    //     name: 'uplink device ip address'
                    // },
                    name: {
                        id: 'name',
                        iobType: 'string',
                        name: 'uplink device name',
                        valFromProperty: 'uplink_device_name'
                    },
                    mac: {
                        id: 'mac',
                        iobType: 'string',
                        name: 'uplink device MAC address',
                        valFromProperty: 'uplink_mac'
                    },
                    port_id: {
                        id: 'port_id',
                        iobType: 'number',
                        name: 'uplink device port number',
                        valFromProperty: 'uplink_remote_port'
                    },
                    speed: {
                        iobType: 'number',
                        name: 'uplink speed to device',
                        unit: 'mbps'
                    },
                    type: {
                        iobType: 'string',
                        name: 'uplink type to device'
                    }
                }
            },
            uptime: {
                iobType: 'number',
                name: 'uptime',
                unit: 's',
            },
            vap_table: {
                idChannel: 'wlan',
                channelName: 'WLAN Network Statistics',
                arrayChannelIdFromProperty(objValues: NetworkDeviceVapTable, i: number, adapter: ioBroker.Adapter): string | undefined {
                    if (objValues.id) {
                        return `${objValues.id}_${objValues.radio_name.replace('wifi', '').replace('ra0', '0').replace('rai0', '1')}`
                    } else {
                        return undefined
                    }
                },
                arrayChannelNameFromProperty(objValues: NetworkDeviceVapTable, adapter: ioBroker.Adapter): string {
                    return `${objValues.essid} - ${myHelper.radio_nameToFrequency(objValues.radio_name, adapter)}`
                },
                array: {
                    avg_client_signal: {
                        iobType: 'number',
                        name: 'average client signal',
                        unit: 'dBm'
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
                        readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return myHelper.radio_nameToFrequency(val, adapter);
                        }
                    },
                    connected_clients: {
                        id: 'connected_clients',
                        iobType: 'number',
                        name: 'connected clients',
                        conditionToCreateState(objValues: NetworkDeviceVapTable, adapter: ioBroker.Adapter): boolean {
                            return !objValues.is_guest
                        },
                        valFromProperty: 'num_sta',
                    },
                    connected_guests: {
                        id: 'connected_guests',
                        iobType: 'number',
                        name: 'connected guests',
                        conditionToCreateState(objValues: NetworkDeviceVapTable, adapter: ioBroker.Adapter): boolean {
                            return objValues.is_guest
                        },
                        valFromProperty: 'num_sta',
                    },
                    essid: {
                        iobType: 'string',
                        name: 'WLAN SSID'
                    },
                    id: {
                        iobType: 'string',
                        name: 'WLAN internal id',
                        expert: true,
                        required: true,
                    },
                    is_guest: {
                        iobType: 'boolean',
                        name: 'is guest wlan'
                    },
                    rx_bytes: {
                        iobType: 'number',
                        name: 'RX Bytes',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        unit: '%',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return val >= 0 ? val : 0
                        },
                    },
                    tx_bytes: {
                        iobType: 'number',
                        name: 'TX Bytes',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                }
            },
            active_geo_info: {
                idChannel: 'internet',
                channelName: 'Internet statistics',
                object: {
                    WAN: {
                        idChannel: 'wan1',
                        channelName: 'WAN 1',
                        object: _WAN_GEO_INFO_PROPERTIES
                    },
                    WAN2: {
                        idChannel: 'wan2',
                        channelName: 'WAN 2',
                        object: _WAN_GEO_INFO_PROPERTIES
                    },
                }
            },
            uptime_stats: {
                idChannel: 'internet',
                channelName: 'Internet statistics',
                object: {
                    WAN: {
                        idChannel: 'wan1',
                        channelName: 'WAN 1',
                        object: _WAN_UPTIME_PROPERTIES
                    },
                    WAN2: {
                        idChannel: 'wan2',
                        channelName: 'WAN 2',
                        object: _WAN_UPTIME_PROPERTIES
                    }
                }
            },
            wan1: {
                idChannel: 'internet.wan1',
                channelName: 'WAN 1',
                object: _WAN_PROPERTIES
            },
            wan2: {
                idChannel: 'internet.wan2',
                channelName: 'WAN 2',
                object: _WAN_PROPERTIES
            }
        }
    }

    export function getKeys(): string[] {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }

        return keys
    }

    export function getStateIDs(): string[] {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }


    const _WAN_PROPERTIES: { [key: string]: myCommonState } = {
        availability: {
            iobType: 'number',
            name: 'availability',
            unit: '%'
        },
        current_download: {
            iobType: 'number',
            name: 'current download rate',
            unit: 'Mbps',
            valFromProperty: 'rx_rate',
            readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 * 1000) / 1000;
            }
        },
        current_upload: {
            iobType: 'number',
            name: 'current upload rate',
            unit: 'Mbps',
            valFromProperty: 'tx_rate',
            readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 * 1000) / 1000;
            }
        },
        ip: {
            iobType: 'string',
            name: 'ip address',
        },
        latency: {
            iobType: 'number',
            name: 'latency',
            unit: 'ms'
        },
        port_idx: {
            iobType: 'number',
            name: 'Port'
        },
        rx_bytes: {
            iobType: 'number',
            name: 'RX Bytes',
            unit: 'GB',
            readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
        },
        tx_bytes: {
            iobType: 'number',
            name: 'TX Bytes',
            unit: 'GB',
            readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | myNetworkClient): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
        },
        isOnline: {
            iobType: 'boolean',
            name: 'is connected to internet service provider',
            valFromProperty: 'up'
        },
        speedtest_download: {
            id: 'speedtest_download',
            iobType: 'number',
            name: 'speed test download rate',
            unit: 'Mbps'
        },
        speedtest_upload: {
            id: 'speedtest_upload',
            iobType: 'number',
            name: 'speed test upload rate',
            unit: 'Mbps'
        },
        speedtest_run: {
            id: 'speedtest_run',
            iobType: 'boolean',
            name: 'run speedtest',
            read: false,
            write: true,
            role: 'button'
        },
    }

    const _WAN_UPTIME_PROPERTIES: { [key: string]: myCommonState } = {
        uptime: {
            iobType: 'number',
            name: 'uptime',
            unit: 's',
        }
    }

    const _WAN_GEO_INFO_PROPERTIES: { [key: string]: myCommonState } = {
        address: {
            id: 'isp_ip',
            iobType: 'string',
            name: 'internet ip address',
        },
        isp_name: {
            iobType: 'string',
            name: 'internet service provider name'
        },
        isp_organization: {
            iobType: 'string',
            name: 'internet service provider organization'
        }
    }
}