interface IdeviceDefinition {
    iobType: string;
    name: string;
    role?: string;
    read?: boolean;
    write?: boolean;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
    states?: [key: string] | [key: number];
    readval?(val: ioBroker.StateValue): ioBroker.StateValue;
    writeVal?(val: ioBroker.StateValue): ioBroker.StateValue;
    isArray?: boolean;
}
export declare const deviceDefinition: {
    [key: string]: IdeviceDefinition;
};
export {};
