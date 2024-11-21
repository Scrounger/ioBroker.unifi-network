import _ from "lodash";
export const messageHandler = {
    device: {
        async deviceList(message, adapter, ufn) {
            const data = (await ufn.getDevices_V2())?.network_devices;
            let deviceList = [];
            if (data && data !== null) {
                for (let device of data) {
                    deviceList.push({
                        label: device.name,
                        value: device.mac,
                    });
                }
            }
            deviceList = _.orderBy(deviceList, ['label'], ['asc']);
            if (message.callback)
                adapter.sendTo(message.from, message.command, deviceList, message.callback);
        }
    }
};
