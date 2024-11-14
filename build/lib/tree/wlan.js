export var wlan;
(function (wlan) {
    function get() {
        return {
            enabled: {
                iobType: 'boolean',
                name: 'WLAN enabled',
                read: true,
                write: true
            },
            is_guest: {
                iobType: 'boolean',
                name: 'is guest'
            },
            name: {
                iobType: 'string',
                name: 'name'
            },
            security: {
                iobType: 'string',
                name: 'security'
            }
        };
    }
    wlan.get = get;
})(wlan || (wlan = {}));
