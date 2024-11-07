import { NetworkApi } from "./network-api";

export const apiCommands = {
    devices: {
        async restart(ufn: NetworkApi, mac: string) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/devmgr`, { cmd: 'restart', mac: mac.toLowerCase() });

            return result === null ? false : true;
        }
    },
    clients: {
        async block(ufn: NetworkApi, mac: string) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'block-sta', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
        async unblock(ufn: NetworkApi, mac: string) {
            const result = await ufn.sendData(`/api/s/${ufn.site}/cmd/stamgr`, { cmd: 'unblock-sta', mac: mac.toLowerCase() });

            return result === null ? false : true;
        },
    }
}