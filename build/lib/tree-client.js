import moment from 'moment';
export const clientTree = {
    essid: {
        iobType: 'string',
        name: 'WLAN SSID'
    },
    first_seen: {
        iobType: 'number',
        name: 'first seen'
    },
    imageUrl: {
        iobType: 'string',
        name: 'imageUrl',
        expert: true,
        subscribeMe: true,
        valFromProperty: 'fingerprint',
        readVal(val, adapter, cache, deviceOrClient) {
            if (val && adapter.config.clientImageDownload) {
                const client = deviceOrClient;
                if (client.unifi_device_info && client.unifi_device_info.icon_filename) {
                    return `https://static.ui.com/fingerprint/ui/icons/${client.unifi_device_info.icon_filename}_257x257.png?q=100`;
                }
                else if (Object.prototype.hasOwnProperty.call(val, 'computed_engine')) {
                    if (Object.prototype.hasOwnProperty.call(val, 'dev_id_override')) {
                        return `https://static.ui.com/fingerprint/${val.computed_engine}/${val.dev_id_override}_257x257.png?q=100`;
                    }
                    else if (Object.prototype.hasOwnProperty.call(val, 'dev_id')) {
                        return `https://static.ui.com/fingerprint/${val.computed_engine}/${val.dev_id}_257x257.png?q=100`;
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
        readVal(val, adapter, cache, deviceOrClient) {
            return moment().diff(val * 1000, 'seconds') <= adapter.config.clientOfflineTimeout;
        }
    },
    last_seen: {
        iobType: 'number',
        name: 'last seen'
    },
    last_uplink_mac: {
        id: 'uplink_mac',
        iobType: 'string',
        name: 'mac address of the connected access point or switch'
    },
    last_uplink_name: {
        id: 'uplink_name',
        iobType: 'string',
        name: 'name of the connected access point or switch'
    },
    mac: {
        iobType: 'string',
        name: 'mac address'
    },
    name: {
        iobType: 'string',
        name: 'device name'
    },
    network_name: {
        iobType: 'string',
        name: 'network name'
    },
    signal: {
        iobType: 'number',
        name: 'signal',
        unit: 'dBm'
    },
    uptime: {
        iobType: 'number',
        name: 'uptime',
        unit: 's',
    },
};
