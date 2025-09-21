import { ApiEndpoints, type NetworkApi } from "./network-api.js";
import type { NetworkLogging } from "./network-logging.js";
import type { NetworkDevice } from "./network-types-device.js";
import type { NetworkClient } from "./network-types-client.js";
import type { NetworkWlanConfig } from "./network-types-wlan-config.js";
import type { NetworkLanConfig } from "./network-types-lan-config.js";
import type { FirewallGroup } from "./network-types-firewall-group.js";

export class NetworkCommands {
    private ufn: NetworkApi;
    private adapter: ioBroker.myAdapter;
    private log: NetworkLogging;
    private logPrefixCls = `NetworkCommands`

    constructor(ufn: NetworkApi, adapter: ioBroker.myAdapter) {
        this.ufn = ufn;
        this.adapter = adapter;
        this.log = adapter.log;
    }

    // Gerätebefehle als Pfeilfunktion im Objekt, damit der Kontext beibehalten wird
    public Clients = {
        block: async (client: NetworkClient): Promise<boolean> => {
            const logPrefix = `[${this.logPrefixCls}.Client.block]`;

            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'block-sta', mac: client.mac.toLowerCase() });

            if (result) {
                this.logCommandSuccess(logPrefix, `block - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        unblock: async (client: NetworkClient): Promise<boolean> => {
            const logPrefix = `[${this.logPrefixCls}.Client.unblock]`;

            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'unblock-sta', mac: client.mac.toLowerCase() });

            if (result) {
                this.logCommandSuccess(logPrefix, `unblock - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        reconnect: async (client: NetworkClient, id: string): Promise<boolean> => {
            const logPrefix = `[${this.logPrefixCls}.Client.reconnect]`;

            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'kick-sta', mac: client.mac.toLowerCase() });

            if (result) {
                await this.ackCommand(id, logPrefix, `reconnect - '${client.name}' (mac: ${client.mac})`);
            }
            return false;
        },
        authorizeGuest: async (client: NetworkClient): Promise<boolean> => {
            const logPrefix = `[${this.logPrefixCls}.Client.authorizeGuest]`;

            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'authorize-guest', mac: client.mac.toLowerCase() });

            if (result) {
                this.logCommandSuccess(logPrefix, `authorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        unauthorizeGuest: async (client: NetworkClient): Promise<boolean> => {
            const logPrefix = `[${this.logPrefixCls}.Client.unauthorizeGuest]`;

            const result = await this.ufn.sendData(`${this.ufn.getApiEndpoint(ApiEndpoints.clientCommand)}`, { cmd: 'unauthorize-guest', mac: client.mac.toLowerCase() });

            if (result) {
                this.logCommandSuccess(logPrefix, `unauthorize guest - '${client.name}' (mac: ${client.mac})`);
                return true;
            }
            return false;
        },
        setName: async (client: NetworkClient, name: string): Promise<boolean> => {
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
    }

    private async ackCommand(id: string, logPrefix: string, message: string): Promise<void> {
        await this.adapter.setState(id, { ack: true });

        this.logCommandSuccess(logPrefix, message);
    }

    private logCommandSuccess(logPrefix: string, message: string): void {
        this.log.info(`${logPrefix} command successfully sent: ${message}`);
    }
}