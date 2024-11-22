import _ from "lodash";
import * as tree from './tree/index.js';
import * as myHelper from './helper.js';
let deviceStateList = undefined;
export const messageHandler = {
    device: {
        async deviceList(message, adapter, ufn) {
            const data = (await ufn.getDevices_V2())?.network_devices;
            let deviceList = [];
            if (data && data !== null) {
                for (let device of data) {
                    deviceList.push({
                        label: `${device.name} (${device.mac})`,
                        value: device.mac,
                    });
                }
            }
            deviceList = _.orderBy(deviceList, ['label'], ['asc']);
            if (message.callback)
                adapter.sendTo(message.from, message.command, deviceList, message.callback);
        },
        async deviceStateList(message, adapter, ufn) {
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
    }
};
