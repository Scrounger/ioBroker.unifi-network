export const apiCommands = {
    clients: {
        async block(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'block-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
        async unblock(ufn, mac) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'unblock-sta', mac: mac.toLowerCase() });
            return result === null ? false : true;
        },
    }
};
