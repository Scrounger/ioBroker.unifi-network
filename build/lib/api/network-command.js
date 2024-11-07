export const apiCommands = {
    devices: {
        async restart(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'restart', mac: mac.toLowerCase() });
            return result === null ? false : true;
        }
    },
    clients: {
        async block(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'block-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async unblock(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'unblock-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async reconncet(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'kick-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async remove(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'forget-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
    }
};
