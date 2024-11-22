import _ from "lodash";
import { NetworkApi } from "./api/network-api";
import * as tree from './tree/index.js'
import { JsonConfigAutocompleteSendTo } from "./myTypes";
import * as myHelper from './helper.js';

let deviceList: JsonConfigAutocompleteSendTo[] = undefined;
let deviceStateList: JsonConfigAutocompleteSendTo[] = undefined;

let clientList: JsonConfigAutocompleteSendTo[] = undefined;

export const messageHandler = {
    device: {
        async list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi) {
            if (deviceList === undefined) {
                const data = (await ufn.getDevices_V2())?.network_devices;

                deviceList = [];

                if (data && data !== null) {
                    for (let device of data) {
                        deviceList.push({
                            label: `${device.name} (${device.mac})`,
                            value: device.mac,
                        });
                    }
                }

                deviceList = _.orderBy(deviceList, ['label'], ['asc']);
            }

            if (message.callback) adapter.sendTo(message.from, message.command, deviceList, message.callback);
        },
        async stateList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi) {
            if (deviceStateList === undefined) {
                const states = tree.device.getStateIDs();

                deviceStateList = [];

                if (states) {
                    for (let i = 0; i <= states.length - 1; i++) {

                        if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
                            deviceStateList.push({
                                label: `[Channel]\t ${states[i]}`,
                                value: states[i],
                            });
                        } else {
                            deviceStateList.push({
                                label: `[State]\t\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                    }
                }

                deviceStateList = _.orderBy(deviceStateList, ['value'], ['asc']);
            }

            if (message.callback) adapter.sendTo(message.from, message.command, deviceStateList, message.callback);
        }
    },
    client: {
        async list(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi) {
            if (clientList === undefined) {
                const data = await ufn.getClients();

                clientList = [];

                if (data && data !== null) {
                    for (let client of data) {
                        const name = client.unifi_device_info_from_ucore?.name || client.display_name || client.name || client.hostname;

                        clientList.push({
                            label: `${name} (${client.mac})`,
                            value: client.mac,
                        });
                    }
                }

                clientList = _.orderBy(clientList, ['label'], ['asc']);
            }

            if (message.callback) adapter.sendTo(message.from, message.command, clientList, message.callback);
        }
    }
}