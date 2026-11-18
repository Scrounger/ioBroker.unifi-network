import * as utils from '@iobroker/adapter-core';
import { myIob } from '../src/lib/myIob.js';
import { ignoredWebSocketMessages } from '../src/lib/myTypes.js';
import { UnifiNetwork } from '../src/main.js';
import { type AdapterStub, createAdapterStub } from './offlineAdapterStub.js';

/** Config values for `UnifiNetwork` tests. Tests override single values. */
const MAIN_CONFIG: Record<string, unknown> = {
    host: '192.168.1.1',
    port: 443,
    site: 'default',
    user: 'test',
    password: 'test',
    expertAliveInterval: 30,
    expertConnectionMaxRetries: 200,
    apiUpdateInterval: 30,
    systemInformationEnabled: false,
    deviceImageDownload: false,
    clientImageDownload: false,
    deleteClientsOlderThan: 0,
    deleteGuestsOlderThan: 0,
    clientOfflineTimeout: 60,
    vpnOfflineTimeout: 60,
    realTimeApiDebounceTime: 0,
    clientRealtimeDisconnectDebounceTime: 0,
    clientDebouncingList: [],
    clientDebugLevel: 'debug',
    keepIobSynchron: false,
    devicesEnabled: true,
    clientsEnabled: true,
    guestsEnabled: true,
    vpnEnabled: true,
    wlanConfigEnabled: true,
    lanConfigEnabled: true,
    clientIsWhiteList: false,
    clientBlackList: [],
    clientStatesBlackList: [],
    clientStatesIsWhiteList: false,
    firewallRuleConfigEnabled: false,
    firewallGroupConfigEnabled: true,
    deviceIsWhiteList: false,
    deviceBlackList: [],
    deviceStatesBlackList: [],
    deviceStatesIsWhiteList: false,
    wlanIsWhiteList: false,
    wlanBlackList: [],
    wlanStatesBlackList: [],
    wlanStatesIsWhiteList: false,
    lanIsWhiteList: false,
    lanBlackList: [],
    lanStatesBlackList: [],
    lanStatesIsWhiteList: false,
    firewallGroupIsWhiteList: false,
    firewallGroupBlackList: [],
    firewallGroupStatesBlackList: [],
    firewallGroupStatesIsWhiteList: false,
};

/** Adapter instance with the methods of `UnifiNetwork`. Typed loosely because the members are private. */
export type MainInstance = Record<string, any>;

/** One call of the `myIob` create methods, recorded instead of written to ioBroker. */
export interface IobCall {
    method: 'createOrUpdateChannel' | 'createOrUpdateDevice' | 'createOrUpdateStates';
    /** First argument: the id of the channel, device or state. */
    id: string;
    /** Remaining arguments. For `createOrUpdateStates` the data is `args[1]`. */
    args: unknown[];
}

/** Result of `createRecordingIob`. */
export interface RecordingIob {
    iob: myIob;
    calls: IobCall[];
}

/** Recorder for a method that is replaced in a test. */
export interface Spy {
    /** Arguments of each call, in call order. */
    calls: unknown[][];
    /** Puts the original method back. */
    restore: () => void;
}

/** Context of one test: stub, instance and the recorded `myIob` calls. */
export interface MainContext {
    stub: AdapterStub;
    instance: MainInstance;
    iobCalls: IobCall[];
}

/**
 * Creates the offline adapter stub with the config values `UnifiNetwork` needs.
 *
 * @param config config values that override the defaults
 */
export function createMainStub(config: Record<string, unknown> = {}): AdapterStub {
    return createAdapterStub({ ...MAIN_CONFIG, ...config });
}

/**
 * Creates a `myIob` whose create methods only record their calls.
 * The real `myIob` is kept for all other methods, e.g. `getIdLastPart`.
 *
 * @param stub adapter stub the `myIob` writes to
 */
export function createRecordingIob(stub: AdapterStub): RecordingIob {
    const calls: IobCall[] = [];
    const iob = new myIob(stub.adapter, utils, []);

    const record =
        (method: IobCall['method']) =>
            (id: string, ...args: unknown[]): Promise<void> => {
                calls.push({ method, id, args });
                return Promise.resolve();
            };

    Object.assign(iob, {
        createOrUpdateChannel: record('createOrUpdateChannel'),
        createOrUpdateDevice: record('createOrUpdateDevice'),
        createOrUpdateStates: record('createOrUpdateStates'),
    });

    return { iob, calls };
}

/**
 * Creates a `UnifiNetwork` instance without its constructor, which would connect to ioBroker.
 * The methods are the real ones. Fields the methods use are set here or via `fields`.
 *
 * @param stub adapter stub with the config and the cache
 * @param iob `myIob` used by the instance
 * @param fields additional fields, e.g. a fake `ufn` or replaced timers
 */
export function createMainInstance(stub: AdapterStub, iob: myIob, fields: Record<string, unknown> = {}): MainInstance {
    return Object.assign(
        Object.create(UnifiNetwork.prototype) as MainInstance,
        stub.adapter,
        {
            cache: stub.cache,
            myIob: iob,
            aliveTimestamp: 0,
            connected: true,
            isConnected: true,
            connectionRetries: 0,
            eventsToIgnore: ignoredWebSocketMessages,
            statesUsingValAsLastChanged: ['rundate'],
            controllerVersion: '10.6.109',
            removeListener: (): void => undefined,
            stop: (): Promise<void> => Promise.resolve(),
        },
        fields,
    );
}

/**
 * Creates stub, `myIob` recorder and instance in one step.
 *
 * @param config config values that override the defaults
 * @param fields additional instance fields
 */
export function createMainContext(config: Record<string, unknown> = {}, fields: Record<string, unknown> = {}): MainContext {
    const stub = createMainStub(config);
    const { iob, calls } = createRecordingIob(stub);
    return { stub, instance: createMainInstance(stub, iob, fields), iobCalls: calls };
}

/**
 * Fake of the UniFi API client (`ufn`). All calls succeed and return empty data unless overridden.
 *
 * @param overrides methods to replace, e.g. `login` returning `false`
 */
export function createFakeUfn(overrides: Record<string, unknown> = {}): MainInstance {
    return {
        on: (): void => undefined,
        login: (): Promise<boolean> => Promise.resolve(true),
        launchEventsWs: (): Promise<boolean> => Promise.resolve(true),
        getControllerVersion: (): Promise<string> => Promise.resolve('10.6.109'),
        logout: (): void => undefined,
        wsSendPing: (): void => undefined,
        getDevices_V2: (): Promise<{ network_devices: unknown[] }> => Promise.resolve({ network_devices: [] }),
        getClientsActive_V2: (): Promise<unknown[]> => Promise.resolve([]),
        getClientsHistory_V2: (): Promise<unknown[]> => Promise.resolve([]),
        getVpnUser: (): Promise<unknown[]> => Promise.resolve([]),
        getWlanConfig_V2: (): Promise<unknown[]> => Promise.resolve([]),
        getLanConfig_V2: (): Promise<unknown[]> => Promise.resolve([]),
        getFirewallGroup: (): Promise<unknown[]> => Promise.resolve([]),
        getSysInfo: (): Promise<Record<string, unknown>> => Promise.resolve({}),
        ...overrides,
    };
}

/**
 * Replaces a method with a recorder that returns a resolved promise.
 * Call `restore` after tests that spy on shared objects such as `eventHandler`.
 *
 * @param target object that owns the method
 * @param method name of the method
 */
export function spyOn(target: object, method: string): Spy {
    const owner = target as Record<string, unknown>;
    const original = owner[method];
    const calls: unknown[][] = [];
    owner[method] = (...args: unknown[]): Promise<void> => {
        calls.push(args);
        return Promise.resolve();
    };
    return {
        calls,
        restore: (): void => {
            owner[method] = original;
        },
    };
}
