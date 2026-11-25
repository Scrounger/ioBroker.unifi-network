import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NetworkApi } from '../../../src/lib/api/network-api.js';
import { messageHandler, resetListCachesForTests } from '../../../src/lib/messageHandler.js';
import type { JsonConfigAutocompleteSendTo } from '../../../src/lib/myTypes.js';
import { fixtureDir, latestFixtureVersion, requireFixtures } from '../../../tools/fixtureVersions.js';

const API_DIR = fixtureDir(latestFixtureVersion() ?? 'none', 'api');

/**
 * Returns the `response` of a recorded API fixture.
 *
 * @param name Name of the fixture file without `.json`.
 */
function responseOf<T>(name: string): T {
    const fixture = JSON.parse(readFileSync(path.join(API_DIR, `${name}.json`), 'utf8')) as { response: T };
    return fixture.response;
}

/**
 * `messageHandler` keeps its lists in module-level variables. Resetting them before each test keeps lists from
 * leaking from one test into the next. The shared module instance is used so that c8 keeps its coverage.
 *
 * @returns The shared `messageHandler` with empty list caches.
 */
function freshMessageHandler(): Promise<typeof messageHandler> {
    resetListCachesForTests();
    return Promise.resolve(messageHandler);
}

interface SentMessage {
    to: string;
    command: string;
    list: JsonConfigAutocompleteSendTo[];
    callback: unknown;
}

interface AdapterSpy {
    adapter: ioBroker.myAdapter;
    sent: SentMessage[];
}

/** Adapter with `sendTo` recorded and the `myIob` helper that the state lists use. */
function createAdapterSpy(): AdapterSpy {
    const sent: SentMessage[] = [];
    const adapter = {
        sendTo: (to: string, command: string, list: JsonConfigAutocompleteSendTo[], callback: unknown): void => {
            sent.push({ to, command, list, callback });
        },
        myIob: {
            getIdWithoutLastPart: (id: string): string => id.substring(0, id.lastIndexOf('.')),
        },
    };
    return { adapter: adapter as unknown as ioBroker.myAdapter, sent };
}

function createMessage(command: string, withCallback = true): ioBroker.Message {
    return {
        command,
        from: 'system.adapter.admin.0',
        callback: withCallback ? { id: 1 } : undefined,
    } as unknown as ioBroker.Message;
}

/**
 * Returns an API stub with the given getter results. Missing getters are `undefined`.
 *
 * @param getters Getter implementations keyed by method name.
 */
function createApi(getters: Partial<Record<keyof NetworkApi, () => Promise<unknown>>>): NetworkApi {
    return getters as unknown as NetworkApi;
}

function isSorted(values: string[]): boolean {
    return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

describe('messageHandler mit aufgezeichneten API-Antworten (offline)', () => {
    before(() => {
        requireFixtures(API_DIR);
    });

    describe('device.list', () => {
        it('liefert je Gerät ein Eintrag mit Name und MAC als Label und MAC als Wert', async () => {
            const devices = responseOf<{ network_devices: { name: string; mac: string }[] }>('devicesV2').network_devices;
            const spy = createAdapterSpy();
            const api = createApi({ getDevices_V2: () => Promise.resolve(responseOf('devicesV2')) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(createMessage('listDevices'), spy.adapter, api);

            expect(spy.sent).to.have.length(1);
            const list = spy.sent[0].list;
            expect(list).to.have.length(devices.length);
            expect(list.map(entry => entry.value).sort()).to.deep.equal(devices.map(device => device.mac).sort());
            for (const device of devices) {
                expect(list).to.deep.include({ label: `${device.name} (${device.mac})`, value: device.mac });
            }
        });

        it('sortiert die Geräte-Liste aufsteigend nach Label', async () => {
            const spy = createAdapterSpy();
            const api = createApi({ getDevices_V2: () => Promise.resolve(responseOf('devicesV2')) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(createMessage('listDevices'), spy.adapter, api);

            const labels = spy.sent[0].list.map(entry => entry.label);
            expect(isSorted(labels)).to.equal(true);
        });

        it('antwortet an den Absender und die Callback-ID', async () => {
            const spy = createAdapterSpy();
            const api = createApi({ getDevices_V2: () => Promise.resolve(responseOf('devicesV2')) });
            const message = createMessage('listDevices');

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(message, spy.adapter, api);

            expect(spy.sent[0].to).to.equal('system.adapter.admin.0');
            expect(spy.sent[0].command).to.equal('listDevices');
            expect(spy.sent[0].callback).to.deep.equal({ id: 1 });
        });

        it('sendet keine Antwort ohne Callback', async () => {
            const spy = createAdapterSpy();
            const api = createApi({ getDevices_V2: () => Promise.resolve(responseOf('devicesV2')) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(createMessage('listDevices', false), spy.adapter, api);

            expect(spy.sent).to.have.length(0);
        });

        it('liefert eine leere Liste, wenn der Controller keine Antwort liefert', async () => {
            const spy = createAdapterSpy();
            const api = createApi({ getDevices_V2: () => Promise.resolve(undefined) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(createMessage('listDevices'), spy.adapter, api);

            expect(spy.sent[0].list).to.deep.equal([]);
        });

        it('verwendet die gecachte Liste beim zweiten Aufruf ohne erneute API-Abfrage', async () => {
            const spy = createAdapterSpy();
            let calls = 0;
            const api = createApi({
                getDevices_V2: () => {
                    calls++;
                    return Promise.resolve(responseOf('devicesV2'));
                },
            });

            const messageHandler = await freshMessageHandler();
            await messageHandler.device.list(createMessage('listDevices'), spy.adapter, api);
            await messageHandler.device.list(createMessage('listDevices'), spy.adapter, undefined);

            expect(calls).to.equal(1);
            expect(spy.sent[1].list).to.deep.equal(spy.sent[0].list);
        });
    });

    describe('client.list', () => {
        it('liefert je Client ein Eintrag mit MAC als Wert und MAC am Ende des Labels', async () => {
            const clients = responseOf<{ data: { mac: string }[] }>('clients').data;
            const spy = createAdapterSpy();
            const api = createApi({ getClients: () => Promise.resolve(clients) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.client.list(createMessage('listClients'), spy.adapter, api);

            const list = spy.sent[0].list;
            expect(list).to.have.length(clients.length);
            expect(list.map(entry => entry.value).sort()).to.deep.equal(clients.map(client => client.mac).sort());
            for (const entry of list) {
                expect(entry.label.endsWith(`(${entry.value})`)).to.equal(true);
            }
        });

        it('sortiert die Client-Liste aufsteigend nach Label', async () => {
            const clients = responseOf<{ data: unknown[] }>('clients').data;
            const spy = createAdapterSpy();
            const api = createApi({ getClients: () => Promise.resolve(clients) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.client.list(createMessage('listClients'), spy.adapter, api);

            expect(isSorted(spy.sent[0].list.map(entry => entry.label))).to.equal(true);
        });
    });

    describe('wlan.list', () => {
        it('liefert je WLAN den Namen als Label und die _id als Wert', async () => {
            const wlans = responseOf<{ configuration: { _id: string; name: string } }[]>('wlanConfigV2');
            const spy = createAdapterSpy();
            const api = createApi({ getWlanConfig_V2: () => Promise.resolve(wlans) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.wlan.list(createMessage('listWlans'), spy.adapter, api);

            const list = spy.sent[0].list;
            expect(list).to.have.length(wlans.length);
            for (const wlan of wlans) {
                expect(list).to.deep.include({ label: wlan.configuration.name, value: wlan.configuration._id });
            }
            expect(isSorted(list.map(entry => entry.label))).to.equal(true);
        });
    });

    describe('lan.list', () => {
        it('hängt die VLAN-ID nur an Netze mit VLAN an', async () => {
            const lans = responseOf<{ configuration: { _id: string; name: string; vlan?: number } }[]>('lanConfigV2');
            const spy = createAdapterSpy();
            const api = createApi({ getLanConfig_V2: () => Promise.resolve(lans) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.lan.list(createMessage('listLans'), spy.adapter, api);

            const list = spy.sent[0].list;
            expect(list).to.have.length(lans.length);
            for (const lan of lans) {
                const expectedLabel = lan.configuration.vlan
                    ? `${lan.configuration.name} (VLAN: ${lan.configuration.vlan})`
                    : lan.configuration.name;
                expect(list).to.deep.include({ label: expectedLabel, value: lan.configuration._id });
            }
        });
    });

    describe('firewall.group.list', () => {
        it('liefert je Firewall-Gruppe den Namen als Label', async () => {
            const groups = responseOf<{ data: { _id: string; name: string }[] }>('firewallGroup').data;
            const spy = createAdapterSpy();
            const api = createApi({ getFirewallGroup: () => Promise.resolve(groups) });

            const messageHandler = await freshMessageHandler();
            await messageHandler.firewall.group.list(createMessage('listFirewallGroups'), spy.adapter, api);

            const list = spy.sent[0].list;
            expect(list).to.have.length(groups.length);
            for (const group of groups) {
                expect(list).to.deep.include({ label: group.name, value: group._id });
            }
        });
    });

    describe('stateList', () => {
        it('unterscheidet Kanäle und Zustände im Label und sortiert nach Wert', async () => {
            const spy = createAdapterSpy();
            const messageHandler = await freshMessageHandler();

            messageHandler.device.stateList(createMessage('listDeviceStates'), spy.adapter, undefined);

            const list = spy.sent[0].list;
            expect(list.length).to.be.greaterThan(0);
            expect(list.some(entry => entry.label.startsWith('[Channel]'))).to.equal(true);
            expect(list.some(entry => entry.label.startsWith('[State]'))).to.equal(true);
            expect(isSorted(list.map(entry => entry.value))).to.equal(true);
        });

        it('liefert für jeden Client-Zustand ein Label, das mit dem Wert endet', async () => {
            const spy = createAdapterSpy();
            const messageHandler = await freshMessageHandler();

            messageHandler.client.stateList(createMessage('listClientStates'), spy.adapter, undefined);

            for (const entry of spy.sent[0].list) {
                expect(entry.label.endsWith(entry.value)).to.equal(true);
            }
        });
    });
});
