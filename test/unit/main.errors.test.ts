import { expect } from 'chai';
import { type MainContext, type MainInstance, createFakeUfn, createMainContext } from '../../tools/mainTestHelpers.js';

/** Adapter methods that are replaced by a failing version in every test. */
const BROKEN_IO_METHODS = [
    'objectExists',
    'getStateAsync',
    'getStatesAsync',
    'setState',
    'setStateChanged',
    'setStateChangedAsync',
    'delObjectAsync',
] as const;

/** `myIob` create methods that are replaced by a failing version in every test. */
const BROKEN_IOB_METHODS = ['createOrUpdateChannel', 'createOrUpdateDevice', 'createOrUpdateStates'] as const;

/**
 * Simulates an ioBroker call that fails.
 */
function ioError(): Promise<never> {
    return Promise.reject(new Error('io broken'));
}

/**
 * Replaces all I/O methods of the instance and of `myIob` with failing versions,
 * so every handler that writes or reads ioBroker data ends in its catch block.
 *
 * @param ctx test context
 */
function breakIo(ctx: MainContext): void {
    for (const method of BROKEN_IO_METHODS) {
        ctx.instance[method] = ioError;
    }
    for (const method of BROKEN_IOB_METHODS) {
        ctx.instance.myIob[method] = ioError;
    }
}

/**
 * Device as the API returns it, reduced to the fields the handlers need.
 */
const DEVICE = { mac: 'aa:bb:cc:dd:ee:10', name: 'AP Wohnzimmer', ip: '192.168.1.2', state: 1, model: 'U7PG2' };

/**
 * Client as the API returns it, reduced to the fields the handlers need.
 */
const CLIENT = { mac: 'aa:bb:cc:dd:ee:01', name: 'Laptop', hostname: 'laptop', ip: '192.168.1.10', is_guest: false, last_seen: 0 };

interface ErrorCase {
    /** Name of the handler, used as test title. */
    name: string;
    /** Log prefix the handler writes on error. */
    prefix: string;
    /** Replaces additional members before the call, e.g. the `ufn` methods. */
    setup?: (ctx: MainContext) => void;
    /**
     * Calls the handler under test.
     *
     * @param instance adapter instance of the test
     */
    run: (instance: MainInstance) => Promise<unknown>;
}

const cases: ErrorCase[] = [
    {
        name: 'updateDevices',
        prefix: '[updateDevices]:',
        run: i => i.updateDevices([DEVICE], true),
    },
    {
        name: 'updateClients',
        prefix: '[updateClients]:',
        run: i => i.updateClients([CLIENT], true),
    },
    {
        name: 'updateClients mit ungültigem Eintrag',
        prefix: '[updateClients]:',
        run: i => i.updateClients([null]),
    },
    {
        name: 'updateVpnClients',
        prefix: '[updateVpnClients]:',
        run: i => i.updateVpnClients([{ type: 'VPN', ip: '10.0.0.5', name: 'Remote', status: 'online', last_seen: 0 }], true),
    },
    {
        name: 'updateWlanConfig',
        prefix: '[updateWlanConfig]:',
        run: i => i.updateWlanConfig([{ _id: 'wlan1', name: 'WLAN' }], true),
    },
    {
        name: 'updateWlanConnectedClients',
        prefix: '[updateWlanConnectedClients]:',
        run: i => i.updateWlanConnectedClients(true),
    },
    {
        name: 'updateLanConfig',
        prefix: '[updateLanConfig]:',
        run: i => i.updateLanConfig([{ _id: 'lan1', name: 'LAN', purpose: 'corporate' }], true),
    },
    {
        name: 'updateLanConnectedClients',
        prefix: '[updateLanConnectedClients]:',
        run: i => i.updateLanConnectedClients(true),
    },
    {
        name: 'updateFirewallGroup',
        prefix: '[updateFirewallGroup]:',
        run: i => i.updateFirewallGroup([{ _id: 'group1', name: 'Gruppe', group_members: [], group_type: 'address-group' }], true),
    },
    {
        name: 'updateSysInfo',
        prefix: '[updateSysInfo]:',
        run: i => i.updateSysInfo({ version: '10.6.109', timezone: 'Europe/Berlin' }, true),
    },
    {
        name: 'updateIsOnlineState',
        prefix: '[updateIsOnlineState]:',
        run: i => i.updateIsOnlineState(true),
    },
    {
        name: 'updateRealTimeApiData',
        prefix: '[updateRealTimeApiData]:',
        setup: ctx => {
            ctx.instance.ufn = createFakeUfn({ getDevices_V2: ioError });
        },
        run: i => i.updateRealTimeApiData(true),
    },
    {
        name: 'updateApiData',
        prefix: '[updateApiData]:',
        setup: ctx => {
            ctx.instance.ufn = createFakeUfn({ getSysInfo: ioError });
        },
        run: i => i.updateApiData(),
    },
    {
        name: 'aliveChecker',
        prefix: '[aliveChecker]:',
        setup: ctx => {
            ctx.instance.ufn = createFakeUfn({
                logout: (): never => {
                    throw new Error('logout broken');
                },
            });
            ctx.instance.aliveTimestamp = 0;
        },
        run: i => i.aliveChecker(),
    },
    {
        name: 'sendPing',
        prefix: '[sendPing]:',
        setup: ctx => {
            ctx.instance.ufn = createFakeUfn({
                wsSendPing: (): never => {
                    throw new Error('ping broken');
                },
            });
        },
        run: i => i.sendPing(false),
    },
    {
        name: 'setConnectionStatus',
        prefix: '[setConnectionStatus]:',
        run: i => i.setConnectionStatus(true),
    },
    {
        name: 'onPongMessage',
        prefix: '[onPongMessage]:',
        run: i => i.onPongMessage(),
    },
    {
        name: 'onStateChange ohne from',
        prefix: '[onStateChange]:',
        run: i => i.onStateChange('unifi-network.0.clients.users.aa_bb_cc_dd_ee_01.name', { val: 'x', ack: false }),
    },
    {
        name: 'onMessage ohne sendTo',
        prefix: '[onMessage]:',
        run: i => i.onMessage({ command: 'help', from: 'system.adapter.test.0', callback: { id: 1 }, message: {} }),
    },
    {
        name: 'onNetworkEvent mit ungültigem Eintrag',
        prefix: '[onNetworkEvent]:',
        run: i => i.onNetworkEvent({ meta: { message: 'events' }, data: [null] }),
    },
    {
        name: 'onNetworkClientEvent mit null',
        prefix: '[onNetworkClientEvent]:',
        run: i => i.onNetworkClientEvent(null),
    },
    {
        name: 'onNetworkWlanConfEvent mit null',
        prefix: '[onNetworkWlanConfEvent]:',
        run: i => i.onNetworkWlanConfEvent(null),
    },
    {
        name: 'onNetworkLanConfEvent mit null',
        prefix: '[onNetworkLanConfEvent]:',
        run: i => i.onNetworkLanConfEvent(null),
    },
    {
        name: 'onNetworkFirewallGroupEvent mit null',
        prefix: '[onNetworkFirewallGroupEvent]:',
        run: i => i.onNetworkFirewallGroupEvent(null),
    },
    {
        // the error is caught inside eventHandler.device.speedTest, which logs with its own prefix
        name: 'onNetworkSpeedTestEvent mit null',
        prefix: '[eventHandler.device.speedTest]:',
        run: i => i.onNetworkSpeedTestEvent(null),
    },
];

describe('main: Fehlerbehandlung (catch-Zweige)', () => {
    for (const errorCase of cases) {
        it(`protokolliert einen Fehler in ${errorCase.name}, statt ihn zu werfen`, async () => {
            const ctx = createMainContext();
            breakIo(ctx);
            errorCase.setup?.(ctx);

            await errorCase.run(ctx.instance);

            expect(ctx.stub.errors.some(message => message.includes(errorCase.prefix)), `kein Fehler mit ${errorCase.prefix} protokolliert`).to.equal(true);
        });
    }
});
