import moment from 'moment';
export const clientTree = {
    ap_mac: {
        iobType: 'string',
        name: 'Mac address of the connected access point'
    },
    ap_name: {
        id: 'ap_name',
        iobType: 'string',
        name: 'Name of the connected access point',
        valFromProperty: 'ap_mac',
        async readVal(val, adapater, cache) {
            return cache.devices[val].name ? cache.devices[val].name : null;
        },
    },
    essid: {
        iobType: 'string',
        name: 'WLAN SSID'
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
        readVal(val, adapater, cache) {
            return moment().diff(val * 1000, 'seconds') <= adapater.config.deviceOfflineTimeout;
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
};
