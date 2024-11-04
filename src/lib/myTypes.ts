export interface myCommonState {
    id?: string,
    iobType: string,
    name?: string,
    role?: string,
    read?: boolean,
    write?: boolean,
    unit?: string,
    min?: number,
    max?: number,
    step?: number,
    states?: { [key: string]: string } | { [key: number]: string },
    readVal?(val: ioBroker.StateValue): ioBroker.StateValue,
    writeVal?(val: ioBroker.StateValue): ioBroker.StateValue,
    icon?: string,
    def?: ioBroker.StateValue,
    valFromProperty?: string             // Take value from other property in the corresponding tree
}

export interface myCommoneChannelObject {
    channelName: string;
    icon?: string;
    object: { [key: string]: myCommonState; };
}

export interface myCommonChannelArray {
    channelName: string,
    icon?: string,
    arrayChannelIdPrefix?: string,                  // Array item id get a prefix e.g. myPrefix_0
    arrayChannelIdZeroPad?: number,                 // Array item id get a padding for the number
    arrayChannelIdFromProperty?: string,            // Array item id is taken from a property in the corresponding tree
    arrayChannelNamePrefix?: string,                // Array item common.name get a prefix e.g. myPrefix_0
    arrayChannelNameFromProperty?: string,          // Array item common.name is taken from a property in the corresponding tree
    array: { [key: string]: myCommonState; },
}