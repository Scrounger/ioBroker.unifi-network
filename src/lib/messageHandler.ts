import _ from "lodash";
import { NetworkApi } from "./api/network-api";

export const messageHandler = {
    device: {
        async deviceList(message: ioBroker.Message, adapter: ioBroker.Adapter, ufn: NetworkApi) {
            const data = (await ufn.getDevices_V2())?.network_devices;

            let deviceList = []

            if (data && data !== null) {
                for (let device of data) {
                    deviceList.push({
                        label: device.name,
                        value: device.mac,
                    })
                }
            }

            deviceList = _.orderBy(deviceList, ['label'], ['asc']);

            if (message.callback) adapter.sendTo(message.from, message.command, deviceList, message.callback);
        }
    }
}