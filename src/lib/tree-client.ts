import moment from 'moment';
import { myCache, myCommonChannelArray, myCommonState, myCommoneChannelObject } from './myTypes.js';
import { Fingerprint, NetworkClient } from './api/network-types-client.js';
import { NetworkDevice } from './api/network-types-device.js';

export const clientTree: { [key: string]: myCommonState | myCommoneChannelObject | myCommonChannelArray; } = {
    ap_mac: {
        iobType: 'string',
        name: 'Mac address of the connected access point'
    },
    ap_name: {
        id: 'ap_name',
        iobType: 'string',
        name: 'Name of the connected access point',
        valFromProperty: 'ap_mac',
        async readVal(val: string, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            return cache.devices[val].name ? cache.devices[val].name : null
        },
    },
    essid: {
        iobType: 'string',
        name: 'WLAN SSID'
    },
    imageUrl: {
        iobType: 'string',
        name: 'imageUrl',
        expert: true,
        valFromProperty: 'fingerprint',
        readVal(val: Fingerprint, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            if (val) {
                const client = deviceOrClient as NetworkClient;
                if (client.unifi_device_info && client.unifi_device_info.icon_filename) {
                    return `https://static.ui.com/fingerprint/ui/icons/${client.unifi_device_info.icon_filename}_129x129.png`
                } else if (Object.prototype.hasOwnProperty.call(val, 'computed_engine')) {
                    if (Object.prototype.hasOwnProperty.call(val, 'dev_id_override')) {
                        return `https://static.ui.com/fingerprint/${val.computed_engine}/${val.dev_id_override}_129x129.png`
                    } else if (Object.prototype.hasOwnProperty.call(val, 'dev_id')) {
                        return `https://static.ui.com/fingerprint/${val.computed_engine}/${val.dev_id}_129x129.png`
                    }
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
        name: 'Is client online',
        valFromProperty: 'last_seen',
        readVal(val: number, adapter: ioBroker.Adapter, cache: myCache, deviceOrClient: NetworkDevice | NetworkClient) {
            return moment().diff(val * 1000, 'seconds') <= adapter.config.deviceOfflineTimeout
        }
    },
    last_seen: {
        iobType: 'number',
        name: 'last seen'
    },
    mac: {
        iobType: 'string',
        name: 'mac address'
    },
    name: {
        iobType: 'string',
        name: 'device name'
    },
    status: {
        iobType: 'string',
        name: 'status'
    },
    uptime: {
        iobType: 'number',
        name: 'uptime',
        unit: 's',
    },
}