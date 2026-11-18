import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NetworkEventData } from '../../src/lib/api/network-types.js';
import { ignoredWebSocketMessages } from '../../src/lib/myTypes.js';
import * as tree from '../../src/lib/tree/index.js';
import { UnifiNetwork } from '../../src/main.js';
import { fixtureDir, latestFixtureVersion } from '../../tools/fixtureVersions.js';
import { type AdapterStub, createAdapterStub, setCachedClient } from '../../tools/offlineAdapterStub.js';

/**
 * Runs `onNetworkMessage` with the recorded WebSocket events of the newest controller version.
 * The suite is skipped if the events directory does not exist.
 */
const FIXTURE_DIR = fixtureDir(latestFixtureVersion() ?? 'keine-version', 'events');
const describeWithFixtures = existsSync(FIXTURE_DIR) ? describe : describe.skip;

/** Handler methods that `onNetworkMessage` can route to. Spied in the dispatch test. */
const ROUTE_METHODS = [
    'updateDevices',
    'updateClients',
    'updateVpnClients',
    'onNetworkClientEvent',
    'onNetworkEvent',
    'onNetworkUserEvent',
    'onNetworkWlanConfEvent',
    'onNetworkLanConfEvent',
    'onNetworkFirewallGroupEvent',
    'onNetworkSpeedTestEvent',
] as const;

const onNetworkMessage = (
    UnifiNetwork.prototype as unknown as { onNetworkMessage: (event: unknown) => Promise<void> }
).onNetworkMessage;

/**
 * Expected route per `meta.message`. A recorded message without an entry fails the dispatch test,
 * so new message types have to be added here on purpose.
 *
 * @param message value of `meta.message`
 */
function expectedRoute(message: string): (typeof ROUTE_METHODS)[number] | undefined {
    if (message === 'device:sync') {
        return 'updateDevices';
    }
    if (message.startsWith('client')) {
        return message.endsWith(':sync') ? 'updateClients' : 'onNetworkClientEvent';
    }
    if (message === 'events') {
        return 'onNetworkEvent';
    }
    if (message.startsWith('user:')) {
        return 'onNetworkUserEvent';
    }
    if (message.startsWith('wlanconf:')) {
        return 'onNetworkWlanConfEvent';
    }
    if (message.startsWith('networkconf')) {
        return 'onNetworkLanConfEvent';
    }
    if (message === 'speed-test:update') {
        return 'onNetworkSpeedTestEvent';
    }
    if (message.startsWith('firewallgroup:')) {
        return 'onNetworkFirewallGroupEvent';
    }
    if (message.startsWith('vpn-users:')) {
        return 'updateVpnClients';
    }
    return undefined;
}

/**
 * Creates a `UnifiNetwork` instance without its constructor, which would connect to ioBroker.
 * The methods are the real ones. Only the fields they use are set.
 *
 * @param stub adapter stub with the config and the cache
 */
function createInstance(stub: AdapterStub): object {
    return Object.assign(Object.create(UnifiNetwork.prototype) as object, stub.adapter, {
        cache: stub.cache,
        aliveTimestamp: 0,
        eventsToIgnore: ignoredWebSocketMessages,
        controllerVersion: '10.6.109',
    });
}

/**
 * Replaces the route methods with recorders. The calls are appended to `calls` in order.
 *
 * @param instance adapter instance from `createInstance`
 * @param calls list that receives the names of the called methods
 */
function recordRoutes(instance: object, calls: string[]): void {
    for (const name of ROUTE_METHODS) {
        Object.assign(instance, {
            [name]: (): Promise<void> => {
                calls.push(name);
                return Promise.resolve();
            },
        });
    }
}

/**
 * Loads a recorded WebSocket event of the newest controller version, as received from the controller.
 *
 * @param file fixture name without extension, e.g. `EVT_WG_Connected`
 */
function loadEvent<T>(file: string): { meta: { message: string; rc?: string }; data: T } {
    const fixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${file}.json`), 'utf8')) as {
        message: string;
        samples: { meta: { message: string; rc?: string }; data: unknown }[];
    };
    const sample = fixture.samples[0];
    // Event samples store one item (see tools/recordEventFixtures.ts). A WebSocket `events` message carries its items as array.
    const data = fixture.message === 'events' ? [sample.data] : sample.data;
    return { meta: sample.meta, data: data as T };
}

describeWithFixtures('onNetworkMessage mit aufgezeichneten Fixtures (offline)', () => {
    it('routet jede aufgezeichnete Nachricht an genau einen Handler', async () => {
        for (const file of readdirSync(FIXTURE_DIR).filter(name => name.endsWith('.json'))) {
            const event = loadEvent<unknown>(file.replace(/\.json$/, ''));
            const route = expectedRoute(event.meta.message);
            expect(route, `${file}: Nachricht '${event.meta.message}' hat keine erwartete Route`).to.not.equal(
                undefined,
            );

            const instance = createInstance(createAdapterStub());
            const calls: string[] = [];
            recordRoutes(instance, calls);

            await onNetworkMessage.call(instance, event);

            expect(calls, file).to.deep.equal([route]);
        }
    });

    it('setzt info.lastRealTimeData nach jeder Nachricht', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);

        await onNetworkMessage.call(instance, loadEvent<unknown>('EVT_WG_Connected'));

        expect(stub.states.get('info.lastRealTimeData')).to.be.a('number').and.to.be.greaterThan(0);
        expect(stub.errors).to.deep.equal([]);
    });

    it('setzt isOnline eines Gasts über EVT_WG_Connected', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);
        const event = loadEvent<NetworkEventData[]>('EVT_WG_Connected');
        const id = `${tree.client.idChannelGuests}.${event.data[0].guest}.isOnline`;
        stub.objects.add(id);

        await onNetworkMessage.call(instance, event);

        expect(stub.states.get(id)).to.equal(true);
        expect(stub.errors).to.deep.equal([]);
    });

    it('entfernt Client und Objekte bei user:delete', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);
        const event = loadEvent<{ mac: string }[]>('user-delete');
        const mac = event.data[0].mac;
        setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
        stub.objects.add(`${tree.client.idChannelUsers}.${mac}`);
        stub.objects.add(`${tree.client.idChannelUsers}.${mac}.isOnline`);

        await onNetworkMessage.call(instance, event);

        expect([...stub.objects].filter(id => id.startsWith(`${tree.client.idChannelUsers}.${mac}`))).to.deep.equal([]);
        expect(stub.cache.clients[mac]).to.equal(undefined);
    });

    it('ändert bei user:delete nichts, wenn Clients, Gäste und VPN deaktiviert sind', async () => {
        const stub = createAdapterStub({ clientsEnabled: false, guestsEnabled: false, vpnEnabled: false });
        const instance = createInstance(stub);
        const event = loadEvent<{ mac: string }[]>('user-delete');
        const mac = event.data[0].mac;
        setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
        const id = `${tree.client.idChannelUsers}.${mac}.isOnline`;
        stub.objects.add(id);

        await onNetworkMessage.call(instance, event);

        expect(stub.objects.has(id)).to.equal(true);
    });

    it('entfernt die WLAN-Konfiguration bei wlanconf:delete', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);
        const event = loadEvent<{ _id: string }[]>('wlanconf-delete');
        const id = `${tree.wlan.idChannel}.${event.data[0]._id}`;
        stub.objects.add(id);
        stub.objects.add(`${id}.name`);

        await onNetworkMessage.call(instance, event);

        expect([...stub.objects].filter(existing => existing.startsWith(id))).to.deep.equal([]);
    });

    it('ändert bei wlanconf:delete nichts, wenn die WLAN-Konfiguration deaktiviert ist', async () => {
        const stub = createAdapterStub({ wlanConfigEnabled: false });
        const instance = createInstance(stub);
        const event = loadEvent<{ _id: string }[]>('wlanconf-delete');
        const id = `${tree.wlan.idChannel}.${event.data[0]._id}`;
        stub.objects.add(id);

        await onNetworkMessage.call(instance, event);

        expect(stub.objects.has(id)).to.equal(true);
    });

    it('entfernt das LAN bei networkconf:delete', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);
        const event = loadEvent<{ _id: string }[]>('networkconf-delete');
        const id = `${tree.lan.idChannel}.${event.data[0]._id}`;
        stub.objects.add(id);
        stub.objects.add(`${id}.name`);

        await onNetworkMessage.call(instance, event);

        expect([...stub.objects].filter(existing => existing.startsWith(id))).to.deep.equal([]);
    });

    it('entfernt die Firewall-Gruppe bei firewallgroup:delete', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);
        const event = loadEvent<{ _id: string }[]>('firewallgroup-delete');
        const id = `${tree.firewall.group.idChannel}.${event.data[0]._id}`;
        stub.objects.add(id);
        stub.objects.add(`${id}.name`);

        await onNetworkMessage.call(instance, event);

        expect([...stub.objects].filter(existing => existing.startsWith(id))).to.deep.equal([]);
    });
});

describe('onNetworkMessage (offline)', () => {
    it('warnt bei unbekannten Nachrichten', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);

        await onNetworkMessage.call(instance, { meta: { message: 'unbekannt:test', rc: 'ok' }, data: [] });

        expect(stub.warnings).to.have.length(1);
        expect(stub.warnings[0]).to.include('unbekannt:test');
    });

    it('warnt nicht bei Nachrichten aus eventsToIgnore', async () => {
        const stub = createAdapterStub();
        const instance = Object.assign(createInstance(stub), { eventsToIgnore: ['unbekannt:test'] });

        await onNetworkMessage.call(instance, { meta: { message: 'unbekannt:test', rc: 'ok' }, data: [] });

        expect(stub.warnings).to.deep.equal([]);
    });

    it('protokolliert Fehler einer Nachricht, statt sie zu werfen', async () => {
        const stub = createAdapterStub();
        const instance = createInstance(stub);

        await onNetworkMessage.call(instance, {});

        expect(stub.errors).to.have.length(1);
        expect(stub.errors[0]).to.include('[onNetworkMessage]');
    });
});
