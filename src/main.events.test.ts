import { expect } from 'chai';
import { type MainContext, type Spy, createMainContext, spyOn } from '../tools/mainTestHelpers.js';
import { setCachedClient } from '../tools/offlineAdapterStub.js';
import { eventHandler } from './lib/eventHandler.js';
import { WebSocketEvent } from './lib/myTypes.js';

/** Handlers of `eventHandler` that `onNetworkEvent` calls. Each one is spied in the routing tests. */
const EVENT_HANDLERS = {
    clientConnected: { target: eventHandler.client, method: 'connected' },
    clientRoamed: { target: eventHandler.client, method: 'roamed' },
    clientRoamedRadio: { target: eventHandler.client, method: 'roamedRadio' },
    clientBlock: { target: eventHandler.client, method: 'block' },
    deviceRestarted: { target: eventHandler.device, method: 'restarted' },
    deviceConnected: { target: eventHandler.device, method: 'connected' },
    deviceLostContact: { target: eventHandler.device, method: 'lostContact' },
    deviceWanTransition: { target: eventHandler.device, method: 'wanTransition' },
    deviceDeleted: { target: eventHandler.device, method: 'deleted' },
} as const;

type EventHandlerName = keyof typeof EVENT_HANDLERS;

/** Client connection keys. Each of them has to reach `clientConnected` and no other handler. */
const CLIENT_CONNECTION_KEYS: readonly string[] = [...WebSocketEvent.client.Connected, ...WebSocketEvent.client.Disconnected];

/**
 * `EVT_LG_Connected` is listed as client and as device event. `onNetworkEvent` checks clients first,
 * so the device route only uses the keys that are not client keys.
 */
const DEVICE_CONNECTION_KEYS: readonly string[] = [...WebSocketEvent.device.Connected, ...WebSocketEvent.device.Disconnected].filter(
    key => !CLIENT_CONNECTION_KEYS.includes(key),
);

const EVENT_ROUTES: { handler: EventHandlerName; keys: readonly string[] }[] = [
    { handler: 'clientConnected', keys: CLIENT_CONNECTION_KEYS },
    { handler: 'clientRoamed', keys: WebSocketEvent.client.Roamed },
    { handler: 'clientRoamedRadio', keys: WebSocketEvent.client.RoamedRadio },
    { handler: 'clientBlock', keys: [...WebSocketEvent.client.Blocked, ...WebSocketEvent.client.Unblocked] },
    { handler: 'deviceRestarted', keys: WebSocketEvent.device.Restarted },
    { handler: 'deviceConnected', keys: DEVICE_CONNECTION_KEYS },
    { handler: 'deviceLostContact', keys: WebSocketEvent.device.LostContact },
    { handler: 'deviceWanTransition', keys: WebSocketEvent.device.WANTransition },
    { handler: 'deviceDeleted', keys: WebSocketEvent.device.Deleted },
];

const MAC = 'aa:bb:cc:dd:ee:01';

describe('main: WebSocket-Events', () => {
    let context: MainContext;
    const restorers: Spy[] = [];

    /**
     * Spies a method for the current test. The spy is restored in `afterEach`, because the handlers are shared objects.
     *
     * @param target object that owns the method
     * @param method name of the method
     */
    const track = (target: object, method: string): Spy => {
        const spy = spyOn(target, method);
        restorers.push(spy);
        return spy;
    };

    beforeEach(() => {
        context = createMainContext();
    });

    afterEach(() => {
        for (const spy of restorers.splice(0)) {
            spy.restore();
        }
    });

    describe('onNetworkEvent (Routing)', () => {
        let spies: Record<string, Spy>;

        beforeEach(() => {
            spies = {};
            for (const [name, handler] of Object.entries(EVENT_HANDLERS)) {
                spies[name] = track(handler.target, handler.method);
            }
        });

        for (const route of EVENT_ROUTES) {
            for (const key of route.keys) {
                it(`routet '${key}' nur an ${route.handler}`, async () => {
                    const meta = { message: 'events', rc: 'ok' };
                    const data = { key, mac: MAC };

                    await context.instance.onNetworkEvent({ meta, data: [data] });

                    for (const name of Object.keys(spies)) {
                        expect(spies[name].calls.length, `Handler ${name}`).to.equal(name === route.handler ? 1 : 0);
                    }
                    const [callMeta, callData, callInstance, callCache] = spies[route.handler].calls[0];
                    expect(callMeta).to.deep.equal(meta);
                    expect(callData).to.equal(data);
                    expect(callInstance).to.equal(context.instance);
                    expect(callCache).to.equal(context.stub.cache);
                    expect(context.stub.errors).to.deep.equal([]);
                });
            }
        }

        it('behandelt EVT_LG_Connected als Client-Event, weil Clients vor Geräten geprüft werden', async () => {
            await context.instance.onNetworkEvent({ meta: { message: 'events' }, data: [{ key: 'EVT_LG_Connected' }] });

            expect(spies.clientConnected.calls.length).to.equal(1);
            expect(spies.deviceConnected.calls.length).to.equal(0);
        });

        it('verarbeitet alle Events einer Nachricht', async () => {
            await context.instance.onNetworkEvent({
                meta: { message: 'events' },
                data: [{ key: 'EVT_WG_Connected' }, { key: 'EVT_GW_WANTransition' }],
            });

            expect(spies.clientConnected.calls.length).to.equal(1);
            expect(spies.deviceWanTransition.calls.length).to.equal(1);
        });

        it('loggt einen unbekannten Key als Warnung und ruft keinen Handler auf', async () => {
            await context.instance.onNetworkEvent({ meta: { message: 'events' }, data: [{ key: 'EVT_UNKNOWN_Foo' }] });

            for (const spy of Object.values(spies)) {
                expect(spy.calls.length).to.equal(0);
            }
            expect(context.stub.warnings.join('\n')).to.include('not implemented event');
        });

        it('loggt einen bekannten, nicht umgesetzten Key nur als Debug', async () => {
            // EVT_AP_Upgraded is a device event without a handler (WebSocketEvent.device.Upgrade)
            await context.instance.onNetworkEvent({ meta: { message: 'events' }, data: [{ key: 'EVT_AP_Upgraded' }] });

            for (const spy of Object.values(spies)) {
                expect(spy.calls.length).to.equal(0);
            }
            expect(context.stub.warnings).to.deep.equal([]);
        });

        it('ignoriert eine Nachricht ohne data', async () => {
            await context.instance.onNetworkEvent({ meta: { message: 'events' }, data: undefined });

            expect(context.stub.warnings).to.deep.equal([]);
            expect(context.stub.errors).to.deep.equal([]);
        });
    });

    describe('onNetworkClientEvent', () => {
        it('ruft vpnDisconnect für ein VPN-Client-Disconnect auf', async () => {
            const vpnDisconnect = track(eventHandler.client, 'vpnDisconnect');
            const client = { type: 'VPN', ip: '10.0.0.5', mac: MAC };
            const meta = { message: 'client:disconnected' };

            await context.instance.onNetworkClientEvent({ meta, data: [client] });

            expect(vpnDisconnect.calls.length).to.equal(1);
            expect(vpnDisconnect.calls[0][0]).to.deep.equal(meta);
            expect(vpnDisconnect.calls[0][1]).to.equal(client);
        });

        it('loggt ein Disconnect eines anderen Client-Typs als Warnung', async () => {
            const vpnDisconnect = track(eventHandler.client, 'vpnDisconnect');

            await context.instance.onNetworkClientEvent({
                meta: { message: 'client:disconnected' },
                data: [{ type: 'WIRED', mac: MAC }],
            });

            expect(vpnDisconnect.calls.length).to.equal(0);
            expect(context.stub.warnings.join('\n')).to.include('not implemented event');
        });

        it('loggt eine nicht umgesetzte Client-Nachricht als Warnung', async () => {
            const vpnDisconnect = track(eventHandler.client, 'vpnDisconnect');

            await context.instance.onNetworkClientEvent({ meta: { message: 'client:connected' }, data: [{ type: 'VPN' }] });

            expect(vpnDisconnect.calls.length).to.equal(0);
            expect(context.stub.warnings.join('\n')).to.include('not implemented event');
        });
    });

    describe('onNetworkUserEvent', () => {
        it('ignoriert User-Events, wenn Clients, Gäste und VPN deaktiviert sind', async () => {
            context = createMainContext({ clientsEnabled: false, guestsEnabled: false, vpnEnabled: false });
            const clientRemoved = track(eventHandler.user, 'clientRemoved');
            setCachedClient(context.stub.cache, MAC, { name: 'Laptop', last_seen: 1000 });

            await context.instance.onNetworkUserEvent({ meta: { message: 'user:delete' }, data: [{ mac: MAC }] });
            await context.instance.onNetworkUserEvent({
                meta: { message: 'user:sync' },
                data: [{ mac: MAC, name: 'Laptop', last_seen: 2000 }],
            });

            expect(clientRemoved.calls.length).to.equal(0);
            expect(context.iobCalls).to.deep.equal([]);
        });

        it('ruft clientRemoved mit Meta, Event, Instanz und Cache auf bei user:delete', async () => {
            const clientRemoved = track(eventHandler.user, 'clientRemoved');
            const event = { mac: MAC };
            const meta = { message: 'user:delete' };

            await context.instance.onNetworkUserEvent({ meta, data: [event] });

            expect(clientRemoved.calls.length).to.equal(1);
            expect(clientRemoved.calls[0][0]).to.deep.equal(meta);
            expect(clientRemoved.calls[0][1]).to.equal(event);
            expect(clientRemoved.calls[0][2]).to.equal(context.instance);
            expect(clientRemoved.calls[0][3]).to.equal(context.stub.cache);
        });

        it('schreibt einen Client bei user:sync als Device und States unter clients.users', async () => {
            setCachedClient(context.stub.cache, MAC, { name: 'Laptop', last_seen: 1000 });
            const event = { mac: MAC, name: 'Laptop', is_guest: false, last_seen: 2000 };

            await context.instance.onNetworkUserEvent({ meta: { message: 'user:sync' }, data: [event] });

            const device = context.iobCalls.find(call => call.method === 'createOrUpdateDevice');
            expect(device?.id).to.equal(`clients.users.${MAC}`);
            expect(device?.args[0]).to.equal('Laptop');

            const states = context.iobCalls.find(call => call.method === 'createOrUpdateStates');
            expect(states?.id).to.equal(`clients.users.${MAC}`);
            expect((states?.args[1] as { last_seen: number }).last_seen).to.equal(2000);
        });

        it('übernimmt den neueren last_seen aus dem Cache, wenn das Event älter ist', async () => {
            setCachedClient(context.stub.cache, MAC, { name: 'Laptop', last_seen: 3000 });
            const event = { mac: MAC, name: 'Laptop', is_guest: false, last_seen: 2000 };

            await context.instance.onNetworkUserEvent({ meta: { message: 'user:sync' }, data: [event] });

            const states = context.iobCalls.find(call => call.method === 'createOrUpdateStates');
            expect((states?.args[1] as { last_seen: number }).last_seen).to.equal(3000);
        });

        it('schreibt einen Gast bei user:sync unter clients.guests', async () => {
            setCachedClient(context.stub.cache, MAC, { name: 'Gast', last_seen: 1000 });

            await context.instance.onNetworkUserEvent({
                meta: { message: 'user:sync' },
                data: [{ mac: MAC, name: 'Gast', is_guest: true, last_seen: 2000 }],
            });

            expect(context.iobCalls.find(call => call.method === 'createOrUpdateDevice')?.id).to.equal(`clients.guests.${MAC}`);
        });

        it('schreibt keinen Client, der auf der Blacklist steht', async () => {
            context = createMainContext({ clientBlackList: [{ mac: MAC }] });
            setCachedClient(context.stub.cache, MAC, { name: 'Laptop', last_seen: 1000 });

            await context.instance.onNetworkUserEvent({
                meta: { message: 'user:sync' },
                data: [{ mac: MAC, name: 'Laptop', is_guest: false, last_seen: 2000 }],
            });

            expect(context.iobCalls).to.deep.equal([]);
        });

        it('loggt einen Fehler, wenn user:sync einen Client ohne Cache-Eintrag erhält', async () => {
            await context.instance.onNetworkUserEvent({
                meta: { message: 'user:sync' },
                data: [{ mac: MAC, name: 'Laptop', is_guest: false, last_seen: 2000 }],
            });

            expect(context.stub.errors.join('\n')).to.include('[onNetworkUserEvent]');
        });
    });

    describe('onNetworkWlanConfEvent', () => {
        it('ruft updateWlanConfig bei wlanconf:sync mit den Daten auf', async () => {
            const updateWlanConfig = track(context.instance, 'updateWlanConfig');
            const data = [{ _id: 'w1', name: 'Home' }];

            await context.instance.onNetworkWlanConfEvent({ meta: { message: 'wlanconf:sync' }, data });

            expect(updateWlanConfig.calls.length).to.equal(1);
            expect(updateWlanConfig.calls[0][0]).to.equal(data);
        });

        it('ruft wlanConf.deleted bei wlanconf:delete auf', async () => {
            const deleted = track(eventHandler.wlanConf, 'deleted');
            const data = [{ _id: 'w1' }];

            await context.instance.onNetworkWlanConfEvent({ meta: { message: 'wlanconf:delete' }, data });

            expect(deleted.calls.length).to.equal(1);
            expect(deleted.calls[0][1]).to.equal(data);
        });

        it('ignoriert WLAN-Events, wenn die WLAN-Konfiguration deaktiviert ist', async () => {
            context = createMainContext({ wlanConfigEnabled: false });
            const updateWlanConfig = track(context.instance, 'updateWlanConfig');
            const deleted = track(eventHandler.wlanConf, 'deleted');

            await context.instance.onNetworkWlanConfEvent({ meta: { message: 'wlanconf:sync' }, data: [] });
            await context.instance.onNetworkWlanConfEvent({ meta: { message: 'wlanconf:delete' }, data: [] });

            expect(updateWlanConfig.calls.length).to.equal(0);
            expect(deleted.calls.length).to.equal(0);
        });
    });

    describe('onNetworkLanConfEvent', () => {
        it('ruft updateLanConfig nur mit den Netzen ohne VPN-Zweck auf', async () => {
            const updateLanConfig = track(context.instance, 'updateLanConfig');

            await context.instance.onNetworkLanConfEvent({
                meta: { message: 'networkconf:update' },
                data: [
                    { _id: 'l1', purpose: 'corporate' },
                    { _id: 'l2', purpose: 'vpn-client' },
                ],
            });

            expect(updateLanConfig.calls.length).to.equal(1);
            expect(updateLanConfig.calls[0][0]).to.deep.equal([{ _id: 'l1', purpose: 'corporate' }]);
        });

        it('ruft updateLanConfig nicht auf, wenn keine Netze übertragen werden', async () => {
            const updateLanConfig = track(context.instance, 'updateLanConfig');

            await context.instance.onNetworkLanConfEvent({ meta: { message: 'networkconf:update' }, data: [] });

            expect(updateLanConfig.calls.length).to.equal(0);
        });

        it('ruft lanConf.deleted bei networkconf:delete auf', async () => {
            const deleted = track(eventHandler.lanConf, 'deleted');
            const data = [{ _id: 'l1' }];

            await context.instance.onNetworkLanConfEvent({ meta: { message: 'networkconf:delete' }, data });

            expect(deleted.calls.length).to.equal(1);
            expect(deleted.calls[0][1]).to.equal(data);
        });

        it('ignoriert LAN-Events, wenn die LAN-Konfiguration deaktiviert ist', async () => {
            context = createMainContext({ lanConfigEnabled: false });
            const updateLanConfig = track(context.instance, 'updateLanConfig');
            const deleted = track(eventHandler.lanConf, 'deleted');

            await context.instance.onNetworkLanConfEvent({ meta: { message: 'networkconf:update' }, data: [{ _id: 'l1' }] });
            await context.instance.onNetworkLanConfEvent({ meta: { message: 'networkconf:delete' }, data: [{ _id: 'l1' }] });

            expect(updateLanConfig.calls.length).to.equal(0);
            expect(deleted.calls.length).to.equal(0);
        });
    });

    describe('onNetworkFirewallGroupEvent', () => {
        it('ruft updateFirewallGroup bei firewallgroup:update auf', async () => {
            const updateFirewallGroup = track(context.instance, 'updateFirewallGroup');
            const data = [{ _id: 'f1', name: 'Blocked' }];

            await context.instance.onNetworkFirewallGroupEvent({ meta: { message: 'firewallgroup:update' }, data });

            expect(updateFirewallGroup.calls.length).to.equal(1);
            expect(updateFirewallGroup.calls[0][0]).to.equal(data);
        });

        it('ruft firewall.group.deleted bei firewallgroup:delete auf', async () => {
            const deleted = track(eventHandler.firewall.group, 'deleted');
            const data = [{ _id: 'f1' }];

            await context.instance.onNetworkFirewallGroupEvent({ meta: { message: 'firewallgroup:delete' }, data });

            expect(deleted.calls.length).to.equal(1);
            expect(deleted.calls[0][1]).to.equal(data);
        });

        it('ignoriert Firewall-Gruppen-Events, wenn die Konfiguration deaktiviert ist', async () => {
            context = createMainContext({ firewallGroupConfigEnabled: false });
            const updateFirewallGroup = track(context.instance, 'updateFirewallGroup');
            const deleted = track(eventHandler.firewall.group, 'deleted');

            await context.instance.onNetworkFirewallGroupEvent({ meta: { message: 'firewallgroup:update' }, data: [] });
            await context.instance.onNetworkFirewallGroupEvent({ meta: { message: 'firewallgroup:delete' }, data: [] });

            expect(updateFirewallGroup.calls.length).to.equal(0);
            expect(deleted.calls.length).to.equal(0);
        });
    });

    describe('onNetworkSpeedTestEvent', () => {
        it('ruft device.speedTest mit Event, Instanz und Cache auf', async () => {
            const speedTest = track(eventHandler.device, 'speedTest');
            const event = { meta: { message: 'speed-test:update' }, data: [] };

            await context.instance.onNetworkSpeedTestEvent(event);

            expect(speedTest.calls.length).to.equal(1);
            expect(speedTest.calls[0][0]).to.equal(event);
            expect(speedTest.calls[0][1]).to.equal(context.instance);
            expect(speedTest.calls[0][2]).to.equal(context.stub.cache);
        });

        it('ignoriert Speedtests, wenn Geräte deaktiviert sind', async () => {
            context = createMainContext({ devicesEnabled: false });
            const speedTest = track(eventHandler.device, 'speedTest');

            await context.instance.onNetworkSpeedTestEvent({ meta: { message: 'speed-test:update' }, data: [] });

            expect(speedTest.calls.length).to.equal(0);
        });
    });
});
