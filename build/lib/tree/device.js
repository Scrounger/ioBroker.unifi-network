import _ from 'lodash';
import * as myHelper from '../helper.js';
export var device;
(function (device) {
    let keys = undefined;
    device.idChannel = 'devices';
    function get() {
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
                conditionToCreateState(objDevice, adapter) {
                    // only wireless clients
                    return objDevice?.is_access_point;
                },
                read: false,
                write: true,
                role: 'button',
                def: false,
            },
            fan_level: {
                iobType: 'number',
                name: 'fan level',
                unit: '%'
            },
            hasError: {
                id: 'hasError',
                iobType: 'boolean',
                name: 'device reported errors',
                valFromProperty: 'state',
                required: true,
                readVal(val, adapter, cache, deviceOrClient) {
                    return val === 6 || val === 9;
                },
            },
            imageUrl: {
                iobType: 'string',
                name: 'imageUrl',
                expert: true,
                subscribeMe: true,
                valFromProperty: 'model',
                required: true,
                readVal(val, adapter, cache, deviceOrClient) {
                    if (val && adapter.config.deviceImageDownload) {
                        const find = _.find(cache.deviceModels, (x) => x.model_name.includes(val));
                        if (find) {
                            return `https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/${find.id}/default/${find.default_image_id}.png&w=256?q=100`;
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
                name: 'ip address',
                required: true
            },
            isOnline: {
                id: 'isOnline',
                iobType: 'boolean',
                name: 'is device online',
                valFromProperty: 'state',
                required: true,
                readVal(val, adapter, cache, deviceOrClient) {
                    return val !== 0 && val !== 6 && val !== 9;
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
                readVal(val, adapter, cache, deviceOrClient) {
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
                    11: "isolated"
                }
            },
            port_table: {
                idChannel: 'ports',
                channelName: 'port table',
                arrayChannelIdFromProperty(objDevice, i, adapter) {
                    return `port_${myHelper.zeroPad(objDevice?.port_idx, 2)}`;
                },
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return objDevice['name'];
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
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.port_poe === true;
                        },
                        valFromProperty: 'poe_mode',
                        read: true,
                        write: true,
                        readVal(val, adapter, cache, deviceOrClient) {
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
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.port_poe === true;
                        },
                    },
                    poe_power: {
                        iobType: 'number',
                        name: 'POE power consumption',
                        unit: 'W',
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.port_poe === true;
                        },
                        readVal(val, adapter, cache, deviceOrClient) {
                            return parseFloat(val);
                        }
                    },
                    poe_voltage: {
                        iobType: 'number',
                        name: 'POE voltage',
                        unit: 'V',
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.port_poe === true;
                        },
                        readVal(val, adapter, cache, deviceOrClient) {
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
                        readVal(val, adapter, cache, deviceOrClient) {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.satisfaction >= 0 ? true : false;
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
                        readVal(val, adapter, cache, deviceOrClient) {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    }
                },
            },
            radio_table: {
                idChannel: 'radio',
                channelName: 'WLAN Radio',
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return myHelper.radio_nameToFrequency(objDevice['name'], adapter);
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
                        readVal(val, adapter, cache, deviceOrClient) {
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
                    tx_power_mode: {
                        iobType: 'string',
                        name: 'transmit power'
                    },
                    // tx_power_max: {
                    //     id: 'tx_power_max',
                    //     iobType: 'number',
                    //     name: 'max. TX Power ',
                    //     valFromProperty: 'max_txpower',
                    //     unit: 'dBm'
                    // },
                    // tx_power_min: {
                    //     id: 'tx_power_min',
                    //     iobType: 'number',
                    //     name: 'min. TX Power ',
                    //     valFromProperty: 'min_txpower',
                    //     unit: 'dBm'
                    // }
                }
            },
            radio_table_stats: {
                idChannel: 'radio',
                channelName: 'WLAN Radio',
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return myHelper.radio_nameToFrequency(objDevice?.name, adapter);
                },
                array: {
                    channel_utilization: {
                        iobType: 'number',
                        name: 'Channel Utilization',
                        unit: '%',
                        valFromProperty: 'cu_total'
                    },
                    channel_utilization_rx: {
                        iobType: 'number',
                        name: 'Channel Utilization RX',
                        unit: '%',
                        valFromProperty: 'cu_self_rx'
                    },
                    channel_utilization_tx: {
                        iobType: 'number',
                        name: 'Channel Utilization TX',
                        unit: '%',
                        valFromProperty: 'cu_self_tx'
                    },
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
                        conditionToCreateState(objDevice, adapter) {
                            // only create state if it's a poe port
                            return objDevice?.satisfaction >= 0 ? true : false;
                        },
                        unit: '%'
                    },
                    tx_packets: {
                        iobType: 'number',
                        name: 'TX Packets',
                    },
                    tx_power: {
                        iobType: 'number',
                        name: 'TX Power',
                        unit: 'dBm'
                    },
                    tx_retries: {
                        iobType: 'number',
                        name: 'TX Retries',
                    },
                }
            },
            satisfaction: {
                iobType: 'number',
                name: 'satisfaction',
                conditionToCreateState(objDevice, adapter) {
                    // only create state if it's a poe port
                    return objDevice?.satisfaction >= 0 ? true : false;
                },
                unit: '%'
            },
            storage: {
                channelName: 'storage',
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return objDevice?.name;
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
                        readVal(val, adapter, cache, deviceOrClient) {
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
                        readVal(val, adapter, cache, deviceOrClient) {
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
                        readVal(val, adapter, cache, deviceOrClient) {
                            return parseFloat(val);
                        },
                    },
                    mem: {
                        iobType: 'number',
                        unit: '%',
                        readVal(val, adapter, cache, deviceOrClient) {
                            return parseFloat(val);
                        },
                    }
                }
            },
            temperatures: {
                channelName: 'temperature',
                arrayChannelIdFromProperty(objDevice, i, adapter) {
                    return objDevice?.name;
                },
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return objDevice?.name;
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
                        readVal: function (val, adapter, cache, deviceOrClient) {
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
                readVal: function (val, adapter, cache, deviceOrClient) {
                    return Math.round(val * 10) / 10;
                },
            },
            tx_bytes: {
                iobType: 'number',
                name: 'TX Bytes',
                unit: 'GB',
                readVal(val, adapter, cache, deviceOrClient) {
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
                required: true
            },
            vap_table: {
                idChannel: 'wlan',
                channelName: 'WLAN Network Statistics',
                arrayChannelIdFromProperty(objDevice, i, adapter) {
                    if (objDevice?.id) {
                        return `${objDevice?.id}_${objDevice?.radio_name.replace('wifi', '').replace('ra0', '0').replace('rai0', '1')}`;
                    }
                    else {
                        return undefined;
                    }
                },
                arrayChannelNameFromProperty(objDevice, adapter) {
                    return `${objDevice?.essid} - ${myHelper.radio_nameToFrequency(objDevice?.radio_name, adapter)}`;
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
                        name: 'channel frequency',
                        valFromProperty: 'radio_name',
                        readVal(val, adapter, cache, deviceOrClient) {
                            return myHelper.radio_nameToFrequency(val, adapter);
                        }
                    },
                    connected_clients: {
                        id: 'connected_clients',
                        iobType: 'number',
                        name: 'connected clients',
                        conditionToCreateState(objDevice, adapter) {
                            return !objDevice?.is_guest;
                        },
                        valFromProperty: 'num_sta',
                    },
                    connected_guests: {
                        id: 'connected_guests',
                        iobType: 'number',
                        name: 'connected guests',
                        conditionToCreateState(objDevice, adapter) {
                            return objDevice?.is_guest;
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
                        readVal(val, adapter, cache, deviceOrClient) {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        unit: '%',
                        readVal(val, adapter, cache, deviceOrClient) {
                            return val >= 0 ? val : 0;
                        },
                    },
                    tx_bytes: {
                        iobType: 'number',
                        name: 'TX Bytes',
                        unit: 'GB',
                        readVal(val, adapter, cache, deviceOrClient) {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                }
            },
            active_geo_info: {
                idChannel: 'isp',
                channelName: 'internet service provider',
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
                idChannel: 'isp',
                channelName: 'internet service provider',
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
                idChannel: 'wan1',
                channelName: 'WAN 1',
                object: _WAN_PROPERTIES
            },
            wan2: {
                idChannel: 'wan2',
                channelName: 'WAN 2',
                object: _WAN_PROPERTIES
            }
        };
    }
    device.get = get;
    function getKeys() {
        if (keys === undefined) {
            keys = myHelper.getAllKeysOfTreeDefinition(get());
        }
        return keys;
    }
    device.getKeys = getKeys;
    function getStateIDs() {
        return myHelper.getAllIdsOfTreeDefinition(get());
    }
    device.getStateIDs = getStateIDs;
    const _WAN_PROPERTIES = {
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
            readVal(val, adapter, cache, deviceOrClient) {
                return Math.round(val / 1000 / 1000 * 1000) / 1000;
            }
        },
        current_upload: {
            iobType: 'number',
            name: 'current upload rate',
            unit: 'Mbps',
            valFromProperty: 'tx_rate',
            readVal(val, adapter, cache, deviceOrClient) {
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
        name: {
            iobType: 'string'
        },
        port_idx: {
            iobType: 'number',
            name: 'Port'
        },
        rx_bytes: {
            iobType: 'number',
            name: 'RX Bytes',
            unit: 'GB',
            readVal(val, adapter, cache, deviceOrClient) {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
        },
        tx_bytes: {
            iobType: 'number',
            name: 'TX Bytes',
            unit: 'GB',
            readVal(val, adapter, cache, deviceOrClient) {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
        },
        isOnline: {
            iobType: 'boolean',
            name: 'is connected to internet service provider',
            valFromProperty: 'is_uplink'
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
    };
    const _WAN_UPTIME_PROPERTIES = {
        uptime: {
            id: 'uptime',
            iobType: 'number',
            name: 'uptime',
            unit: 's',
            def: 0
        },
        downtime: {
            id: 'downtime',
            iobType: 'number',
            name: 'uptime',
            unit: 's',
            def: 0
        }
    };
    const _WAN_GEO_INFO_PROPERTIES = {
        address: {
            id: 'ip',
            iobType: 'string',
            name: 'internet ip address',
        },
        city: {
            iobType: 'string',
            name: 'city',
        },
        country_name: {
            id: 'country',
            iobType: 'string',
            name: 'country',
        },
        isp_name: {
            id: 'name',
            iobType: 'string',
            name: 'provider name'
        },
        isp_organization: {
            id: 'organization',
            iobType: 'string',
            name: 'provider organization'
        }
    };
})(device || (device = {}));
