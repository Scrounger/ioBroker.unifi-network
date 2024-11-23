import _ from "lodash";
import * as tree from './tree/index.js';
import * as myHelper from './helper.js';
let deviceList = undefined;
let deviceStateList = undefined;
let clientList = undefined;
let clientStateList = undefined;
let wlanList = undefined;
let wlanStateList = undefined;
let lanList = undefined;
let lanStateList = undefined;
export const messageHandler = {
    device: {
        async list(message, adapter, ufn) {
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
            if (message.callback)
                adapter.sendTo(message.from, message.command, deviceList, message.callback);
        },
        async stateList(message, adapter, ufn) {
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
                        }
                        else {
                            deviceStateList.push({
                                label: `[State]\t\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                    }
                }
                deviceStateList = _.orderBy(deviceStateList, ['value'], ['asc']);
            }
            if (message.callback)
                adapter.sendTo(message.from, message.command, deviceStateList, message.callback);
        }
    },
    client: {
        async list(message, adapter, ufn) {
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
            if (message.callback)
                adapter.sendTo(message.from, message.command, clientList, message.callback);
        },
        async stateList(message, adapter, ufn) {
            if (clientStateList === undefined) {
                const states = tree.client.getStateIDs();
                clientStateList = [];
                if (states) {
                    for (let i = 0; i <= states.length - 1; i++) {
                        if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
                            clientStateList.push({
                                label: `[Channel]\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                        else {
                            clientStateList.push({
                                label: `[State]\t\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                    }
                }
                clientStateList = _.orderBy(clientStateList, ['value'], ['asc']);
            }
            if (message.callback)
                adapter.sendTo(message.from, message.command, clientStateList, message.callback);
        }
    },
    wlan: {
        async list(message, adapter, ufn) {
            if (wlanList === undefined) {
                const data = await ufn.getWlanConfig_V2();
                wlanList = [];
                if (data && data !== null) {
                    for (let wlan of data) {
                        wlanList.push({
                            label: wlan.configuration.name,
                            value: wlan.configuration._id
                        });
                    }
                }
                wlanList = _.orderBy(wlanList, ['label'], ['asc']);
            }
            if (message.callback)
                adapter.sendTo(message.from, message.command, wlanList, message.callback);
        },
        async stateList(message, adapter, ufn) {
            if (wlanStateList === undefined) {
                const states = tree.wlan.getStateIDs();
                wlanStateList = [];
                if (states) {
                    for (let i = 0; i <= states.length - 1; i++) {
                        if (states[i + 1] && states[i] === myHelper.getIdWithoutLastPart(states[i + 1])) {
                            wlanStateList.push({
                                label: `[Channel]\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                        else {
                            wlanStateList.push({
                                label: `[State]\t\t ${states[i]}`,
                                value: states[i],
                            });
                        }
                    }
                }
                wlanStateList = _.orderBy(wlanStateList, ['value'], ['asc']);
            }
            if (message.callback)
                adapter.sendTo(message.from, message.command, wlanStateList, message.callback);
        }
    },
    lan: {
        async list(message, adapter, ufn) {
            if (lanList === undefined) {
                const data = await ufn.getLanConfig_V2();
                lanList = [];
                if (data && data !== null) {
                    for (let lan of data) {
                        lanList.push({
                            label: `${lan.configuration.name}${lan.configuration.vlan ? ` (VLAN: ${lan.configuration.vlan})` : ''}`,
                            value: lan.configuration._id
                        });
                    }
                }
                lanList = _.orderBy(lanList, ['label'], ['asc']);
            }
            if (message.callback)
                adapter.sendTo(message.from, message.command, lanList, message.callback);
        },
    }
};
