import { ApiEndpoints } from "./network-api.js";
export class NetworkCommands {
    ufn;
    adapter;
    log;
    logPrefixCls = `NetworkCommands`;
    constructor(ufn, adapter) {
        this.ufn = ufn;
        this.adapter = adapter;
        this.log = adapter.log;
    }
    // Gerätebefehle als Pfeilfunktion im Objekt, damit der Kontext beibehalten wird
    Clients = {
        authorizeGuest: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.authorizeGuest]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'authorize-guest', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `authorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        unauthorizeGuest: async (client) => {
            const logPrefix = `[${this.logPrefixCls}.Client.unauthorizeGuest]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'unauthorize-guest', mac: client.mac.toLowerCase() });
            if (result) {
                this.logCommandSuccess(logPrefix, `unauthorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        setName: async (client, name) => {
            const logPrefix = `[${this.logPrefixCls}.Client.setName]`;
            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clients)}/${client.user_id.trim()}`, { _id: client.user_id, name: name }, 'PUT');
            if (result) {
                this.logCommandSuccess(logPrefix, `set name - '${client.name}' (mac: ${client.mac}, new name: ${name})`);
                return true;
            }
            return false;
        }
        // async remove(ufn: NetworkApi, mac: string) {
        //     // controller 5.9.x only
        //     const result = await ufn.sendData(`${ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'forget-sta', mac: mac.toLowerCase() });
        //     return result === null ? false : true;
        // },
    };
    async ackCommand(id, logPrefix, message) {
        await this.adapter.setState(id, { ack: true });
        this.logCommandSuccess(logPrefix, message);
    }
    logCommandSuccess(logPrefix, message) {
        this.log.info(`${logPrefix} command successfully sent: ${message}`);
    }
}
