import _ from 'lodash';
import type { NetworkDevice, NetworkDeviceStorage, NetworkDevicePortTable, NetworkDeviceRadioTableStat, NetworkDeviceTemperature, NetworkDeviceVapTable, NetworkDeviceRadioTable, NetworkDeviceWan, NetworkDeviceWanUptimeStats } from '../api/network-types-device.js';
import * as myHelper from '../helper.js';
import { myTreeDefinition, myTreeState } from '../myIob.js';
import { ApiEndpoints } from '../api/network-api.js';


export namespace device {
    let keys: string[] = undefined;

    export const idChannel = 'devices'

    const _WAN_PROPERTIES: { [key: string]: myTreeState } = {
        current_download: {
            iobType: 'number',
            name: 'current download rate',
            unit: 'Mbps',
            valFromProperty: 'rx_rate',
            readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 * 1000) / 1000;
            }
        },
        current_upload: {
            iobType: 'number',
            name: 'current upload rate',
            unit: 'Mbps',
            valFromProperty: 'tx_rate',
            readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
            readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
        },
        tx_bytes: {
            iobType: 'number',
            name: 'TX Bytes',
            unit: 'GB',
            readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
            }
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
            role: 'button',
            async writeVal(val: boolean, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                const logPrefix = `[tree.device.speedtest_run]:`;

                try {
                    const wan_interface = adapter.myIob.getIdLastPart(adapter.myIob.getIdWithoutLastPart(id));
                    const interface_name = device[wan_interface].ifname;

                    const payload: any = { cmd: 'speedtest' }

                    if (interface_name) {
                        payload.interface_name = interface_name
                    }

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, payload);

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `run speedtest (mac: ${device.mac}, wan: ${wan_interface}, interface: ${interface_name})`, id);

                } catch (error: any) {
                    adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
                }
            },
        },
        up: {
            iobType: 'boolean',
        }
    }

    const _ISP_UPTIME_PROPERTIES: { [key: string]: myTreeState } = {
        availability: {
            iobType: 'number',
            name: 'availability',
            unit: '%',
            readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                return Math.round(val);
            }
        },
        downtime: {
            id: 'downtime',
            iobType: 'number',
            name: 'uptime',
            unit: 's',
            def: 0,
            async readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): Promise<ioBroker.StateValue> {
                // if downtime increase, isp connection is down
                const isOnlineId = `${adapter.myIob.getIdWithoutLastPart(id)}.${_ISP_UPTIME_PROPERTIES.isOnline.id}`;
                if (await adapter.objectExists(isOnlineId)) {
                    await adapter.setStateChangedAsync(isOnlineId, false, true);
                }

                return val;
            }
        },
        isOnline: {
            id: 'isOnline',
            iobType: 'boolean',
            name: 'is connected to internet service provider'
        },
        uptime: {
            id: 'uptime',
            iobType: 'number',
            name: 'uptime',
            unit: 's',
            def: 0,
            async readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): Promise<ioBroker.StateValue> {
                // if uptime increase, isp connection is up
                const isOnlineId = `${adapter.myIob.getIdWithoutLastPart(id)}.${_ISP_UPTIME_PROPERTIES.isOnline.id}`;
                if (await adapter.objectExists(isOnlineId)) {
                    await adapter.setStateChangedAsync(isOnlineId, true, true);
                }

                return val;
            }
        },
    }

    const _ISP_GEO_INFO_PROPERTIES: { [key: string]: myTreeState } = {
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
    }

    export function get(): { [key: string]: myTreeDefinition } {
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
                conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevice, adapter: ioBroker.myAdapter): boolean {
                    // only wireless clients
                    return objDevice?.is_access_point;
                },
                read: true,
                write: true,
                def: false,
                async writeVal(val: boolean, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[tree.device.disabled]:`;

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device._id.trim()}`, { disabled: val }, 'PUT');

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `{state.val ? 'disable' : 'enable'} access point '${device.name}' (mac: ${device.mac})`);
                },
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
                readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                    return val === 6 || val === 9
                },
            },
            imageUrl: {
                iobType: 'string',
                name: 'image url',
                expert: true,
                subscribeMe: true,
                valFromProperty: 'model',
                required: true,
                readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                    if (val && adapter.config.deviceImageDownload) {
                        const find = _.find(adapter.cache.deviceModels, (x) => x.model_name.includes(val));

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
                name: 'ip address',
                required: true
            },
            isOnline: {
                id: 'isOnline',
                iobType: 'boolean',
                name: 'is device online',
                valFromProperty: 'state',
                required: true,
                readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                },
                async writeVal(val: string, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[tree.device.led_override]:`;

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { led_override: val }, 'PUT');

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `LED override to '${val}' - '${device.name}' (mac: ${device.mac})`);
                },
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
                role: 'button',
                async writeVal(val: boolean, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[tree.device.restart]:`;

                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: 'restart', mac: device.mac.toLowerCase() });

                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `'${device.name}' (mac: ${device.mac})`, id);
                },
            },
            rx_bytes: {
                iobType: 'number',
                name: 'RX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                name: 'port table',
                arrayChannelIdFromProperty(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, i: number, adapter: ioBroker.myAdapter): string {
                    return `port_${myHelper.zeroPad(objChannel?.port_idx, 2)}`
                },
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): string {
                    return objChannel.name
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
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.port_poe === true;
                        },
                        valFromProperty: 'poe_mode',
                        read: true,
                        write: true,
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return val === 'auto';
                        },
                        async writeVal(val: boolean, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                            const logPrefix = `[tree.devices.port.port_switchPoe]`;

                            try {
                                const port_idx: number = parseInt(adapter.myIob.getIdLastPart(adapter.myIob.getIdWithoutLastPart(id)).replace('port_', ''));
                                const port_overrides = device.port_overrides;

                                if (port_overrides && port_overrides.length > 0) {
                                    const indexOfPort = port_overrides.findIndex(x => x.port_idx === port_idx);

                                    if (indexOfPort !== -1) {

                                        // port_overrides has settings for this port
                                        if (port_overrides[indexOfPort].portconf_id) {
                                            // ethernet profil is configured, change poe not possible
                                            adapter.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: switch poe not possible, because 'ethernet port profile' is configured!`);
                                            return;
                                        } else {
                                            port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                                        }
                                    } else {
                                        // port_overrides has no settings for this port
                                        adapter.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: not exists in port_overrides object -> create item`);
                                        port_overrides[indexOfPort].poe_mode = val ? 'auto' : 'off';
                                    }

                                    const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceRest)}/${device.device_id.trim()}`, { port_overrides: port_overrides }, 'PUT');

                                    await adapter.ufn.checkCommandSuccessful(result, logPrefix, `command sent: switch poe power - '${val ? 'on' : 'off'}' '${device.name}' (mac: ${device.mac}) - Port ${port_idx}`);

                                } else {
                                    adapter.log.debug(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: no port_overrides object exists!`);
                                }
                            } catch (error: any) {
                                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
                            }
                        },
                    },
                    poe_cycle: {
                        id: 'poe_cycle',
                        iobType: 'boolean',
                        name: 'temporary interruption of the power supply to the poe port of the switch',
                        read: false,
                        write: true,
                        role: 'button',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.port_poe === true;
                        },
                        async writeVal(val: ioBroker.StateValue, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                            const logPrefix = `[tree.device.port.cyclePoePower]`;

                            try {
                                const port_idx: number = parseInt(adapter.myIob.getIdLastPart(adapter.myIob.getIdWithoutLastPart(id)).replace('port_', ''));
                                const port_table = device.port_table;

                                if (port_table && port_table.length > 0) {
                                    const indexOfPort = port_table.findIndex(x => x.port_idx === port_idx);

                                    if (indexOfPort !== -1) {
                                        if (!port_table[indexOfPort].poe_enable) {
                                            adapter.log.error(`${logPrefix} ${device.name} (mac: ${device.mac}) - Port ${port_idx}: cycle poe power not possible, because poe is not enabled for this port!`);
                                            return;
                                        }
                                    }
                                }

                                const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}`, { cmd: 'power-cycle', port_idx: port_idx, mac: device.mac.toLowerCase() });

                                await adapter.ufn.checkCommandSuccessful(result, logPrefix, `cycle poe power - '${device.name}' (mac: ${device.mac}) - Port ${port_idx}`, id);

                            } catch (error: any) {
                                adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
                            }
                        },
                    },
                    poe_power: {
                        iobType: 'number',
                        name: 'POE power consumption',
                        unit: 'W',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.port_poe === true;
                        },
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return parseFloat(val);
                        }
                    },
                    poe_voltage: {
                        iobType: 'number',
                        name: 'POE voltage',
                        unit: 'V',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.port_poe === true;
                        },
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevicePortTable, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.satisfaction >= 0 ? true : false;
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
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    }
                },
            },
            radio_table: {
                idChannel: 'radio',
                name: 'WLAN Radio',
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceRadioTable, adapter: ioBroker.myAdapter): string {
                    return myHelper.radio_nameToFrequency(objChannel.name, adapter);
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
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                name: 'WLAN Radio',
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceRadioTableStat, adapter: ioBroker.myAdapter): string {
                    return myHelper.radio_nameToFrequency(objChannel?.name, adapter);
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
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDeviceRadioTableStat, adapter: ioBroker.myAdapter): boolean {
                            // only create state if it's a poe port
                            return objChannel?.satisfaction >= 0 ? true : false;
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
                conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDevice, adapter: ioBroker.myAdapter): boolean {
                    // only create state if it's a poe port
                    return objDevice?.satisfaction >= 0 ? true : false;
                },
                unit: '%'
            },
            storage: {
                name: 'storage',
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceStorage, adapter: ioBroker.myAdapter) {
                    return objChannel?.name
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
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    }
                }
            },
            "system-stats": {
                idChannel: 'system',
                name: 'system statistics',
                object: {
                    cpu: {
                        iobType: 'number',
                        unit: '%',
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return parseFloat(val);
                        },

                    },
                    mem: {
                        iobType: 'number',
                        unit: '%',
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return parseFloat(val);
                        },
                    }
                }
            },
            temperatures: {
                name: 'temperature',
                arrayChannelIdFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceTemperature, i: number, adapter: ioBroker.myAdapter): string {
                    return objChannel?.name
                },
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceTemperature, adapter: ioBroker.myAdapter): string {
                    return objChannel?.name
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
                        readVal: function (val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                readVal: function (val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                    return Math.round(val * 10) / 10;
                },
            },
            tx_bytes: {
                iobType: 'number',
                name: 'TX Bytes',
                unit: 'GB',
                readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
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
                role: 'button',
                async writeVal(val: boolean, id: string, device: NetworkDevice, adapter: ioBroker.myAdapter): Promise<void> {
                    const logPrefix = `[tree.device.upgrade]:`;

                    if (device.upgradable) {
                        const result = await adapter.ufn.sendData(`${adapter.ufn.getApiEndpoint(ApiEndpoints.deviceCommand)}/upgrade`, { mac: device.mac.toLowerCase() });

                        await adapter.ufn.checkCommandSuccessful(result, logPrefix, `upgrade to new firmware version - '${device.name}' (mac: ${device.mac})`, id);

                    } else {
                        adapter.log.warn(`${logPrefix} ${device.name} (mac: ${device.mac}): upgrade not possible, no new firmware avaiable`);
                    }
                },
            },
            uplink: {
                name: 'uplink device',
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
                name: 'WLAN Network Statistics',
                arrayChannelIdFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceVapTable, i: number, adapter: ioBroker.myAdapter): string | undefined {
                    if (objChannel?.id) {
                        return `${objChannel?.id}_${objChannel?.radio_name.replace('wifi', '').replace('ra0', '0').replace('rai0', '1')}`
                    } else {
                        return undefined
                    }
                },
                arrayChannelNameFromProperty(objDevice: NetworkDevice, objChannel: NetworkDeviceVapTable, adapter: ioBroker.myAdapter): string {
                    return `${objChannel?.essid} - ${myHelper.radio_nameToFrequency(objChannel?.radio_name, adapter)}`
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
                        readVal(val: string, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return myHelper.radio_nameToFrequency(val, adapter);
                        }
                    },
                    connected_clients: {
                        id: 'connected_clients',
                        iobType: 'number',
                        name: 'connected clients',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDeviceVapTable, adapter: ioBroker.myAdapter): boolean {
                            return !objChannel?.is_guest
                        },
                        valFromProperty: 'num_sta',
                    },
                    connected_guests: {
                        id: 'connected_guests',
                        iobType: 'number',
                        name: 'connected guests',
                        conditionToCreateState(objDevice: NetworkDevice, objChannel: NetworkDeviceVapTable, adapter: ioBroker.myAdapter): boolean {
                            return objChannel?.is_guest
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
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                    satisfaction: {
                        iobType: 'number',
                        name: 'satisfaction',
                        unit: '%',
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return val >= 0 ? val : 0
                        },
                    },
                    tx_bytes: {
                        iobType: 'number',
                        name: 'TX Bytes',
                        unit: 'GB',
                        readVal(val: number, adapter: ioBroker.myAdapter, device: NetworkDevice, id: string): ioBroker.StateValue {
                            return Math.round(val / 1000 / 1000 / 1000 * 1000) / 1000;
                        }
                    },
                }
            },
            active_geo_info: {
                idChannel: 'isp',
                name: 'internet service provider',
                object: {
                    WAN: {
                        idChannel: 'wan1',
                        name(objDevice: NetworkDevice, objChannel: NetworkDeviceWan, adapter: ioBroker.myAdapter): string {
                            return objChannel.isp_name
                        },
                        object: _ISP_GEO_INFO_PROPERTIES
                    },
                    WAN2: {
                        idChannel: 'wan2',
                        name(objDevice: NetworkDevice, objChannel: NetworkDeviceWan, adapter: ioBroker.myAdapter): string {
                            return objChannel.isp_name
                        },
                        object: _ISP_GEO_INFO_PROPERTIES
                    },
                }
            },
            uptime_stats: {
                idChannel: 'isp',
                name: 'internet service provider',
                object: {
                    WAN: {
                        idChannel: 'wan1',
                        name(objDevice: NetworkDevice, objChannel: NetworkDeviceWanUptimeStats, adapter: ioBroker.myAdapter): string {
                            return objDevice.active_geo_info.WAN.isp_name
                        },
                        object: _ISP_UPTIME_PROPERTIES
                    },
                    WAN2: {
                        idChannel: 'wan2',
                        name(objDevice: NetworkDevice, objChannel: NetworkDeviceWanUptimeStats, adapter: ioBroker.myAdapter): string {
                            return objDevice.active_geo_info.WAN2.isp_name
                        },
                        object: _ISP_UPTIME_PROPERTIES
                    }
                }
            },
            wan1: {
                idChannel: 'wan1',
                name: 'WAN 1',
                object: _WAN_PROPERTIES
            },
            wan2: {
                idChannel: 'wan2',
                name: 'WAN 1',
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
}