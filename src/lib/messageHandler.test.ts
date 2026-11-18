import { expect } from 'chai';
import { type AdapterStub, createAdapterStub } from '../../tools/offlineAdapterStub.js';
import type { NetworkApi } from './api/network-api.js';
import { messageHandler, resetListCachesForTests } from './messageHandler.js';
import type { JsonConfigAutocompleteSendTo } from './myTypes.js';

/**
 * Returns the message handler with empty list caches. The lists are cached at module level, so they are cleared before
 * each use. A query-string import would give a separate module instance, but its coverage is not merged by c8 when the
 * full suite also imports the plain module.
 */
function loadMessageHandler(): Promise<typeof messageHandler> {
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

/**
 * Creates an adapter stub that records all `sendTo` calls and provides a `myIob` helper.
 */
function createAdapterSpy(): AdapterSpy {
    const stub: AdapterStub = createAdapterStub();
    const sent: SentMessage[] = [];
    Object.assign(stub.adapter, {
        sendTo: (to: string, command: string, list: JsonConfigAutocompleteSendTo[], callback: unknown): void => {
            sent.push({ to, command, list, callback });
        },
        myIob: {
            getIdWithoutLastPart: (id: string): string => id.substring(0, id.lastIndexOf('.')),
        },
    });
    return { adapter: stub.adapter, sent };
}

/**
 * Creates a message as sent by the admin UI.
 *
 * @param command command name of the message
 * @param withCallback whether the message expects an answer
 */
function createMessage(command: string, withCallback = true): ioBroker.Message {
    return {
        command,
        from: 'system.adapter.admin.0',
        callback: withCallback ? { id: 1 } : undefined,
    } as unknown as ioBroker.Message;
}

/**
 * Creates a network API stub with the given getters.
 *
 * @param getters API methods to provide
 */
function createApi(getters: Partial<Record<keyof NetworkApi, () => Promise<unknown>>>): NetworkApi {
    return getters as unknown as NetworkApi;
}

const MAC_1 = 'aa:bb:cc:00:00:10';
const MAC_2 = 'aa:bb:cc:00:00:11';
const MAC_3 = 'aa:bb:cc:00:00:12';
const MAC_4 = 'aa:bb:cc:00:00:13';

describe('messageHandler (offline, synthetische Daten)', () => {
    afterEach(() => {
        resetListCachesForTests();
    });

    describe('device.list', () => {
        it('liefert Name und MAC der Geräte, sortiert nach Label', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({
                getDevices_V2: () =>
                    Promise.resolve({
                        network_devices: [
                            { name: 'Switch', mac: 'aa:bb:cc:00:00:02' },
                            { name: 'AP', mac: 'aa:bb:cc:00:00:01' },
                        ],
                    }),
            });

            await messageHandler.device.list(createMessage('devices'), adapter, ufn);

            expect(sent[0].list).to.deep.equal([
                { label: 'AP (aa:bb:cc:00:00:01)', value: 'aa:bb:cc:00:00:01' },
                { label: 'Switch (aa:bb:cc:00:00:02)', value: 'aa:bb:cc:00:00:02' },
            ]);
        });

        it('liefert eine leere Liste ohne API', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            await messageHandler.device.list(createMessage('devices'), adapter, undefined);

            expect(sent[0].list).to.deep.equal([]);
        });

        it('liefert eine leere Liste bei fehlenden Gerätedaten (null)', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const nullApi = createApi({ getDevices_V2: () => Promise.resolve({ network_devices: null }) });

            await messageHandler.device.list(createMessage('devices'), adapter, nullApi);

            expect(sent[0].list).to.deep.equal([]);
        });

        it('sendet keine Antwort ohne Callback', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            await messageHandler.device.list(createMessage('devices', false), adapter, undefined);

            expect(sent).to.have.length(0);
        });
    });

    describe('client.list', () => {
        it('nutzt Ucore-Name, display_name, name und hostname in dieser Reihenfolge', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({
                getClients: () =>
                    Promise.resolve([
                        { mac: MAC_1, name: 'Laptop', unifi_device_info_from_ucore: { name: 'Ucore' } },
                        { mac: MAC_2, display_name: 'Handy' },
                        { mac: MAC_3, hostname: 'Drucker' },
                        { mac: MAC_4, name: 'Tablet' },
                    ]),
            });

            await messageHandler.client.list(createMessage('clients'), adapter, ufn);

            expect(sent[0].list.map(entry => entry.label)).to.deep.equal([
                `Drucker (${MAC_3})`,
                `Handy (${MAC_2})`,
                `Tablet (${MAC_4})`,
                `Ucore (${MAC_1})`,
            ]);
        });

        it('liefert eine leere Liste ohne API', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            await messageHandler.client.list(createMessage('clients'), adapter, undefined);

            expect(sent[0].list).to.deep.equal([]);
        });
    });

    describe('wlan.list', () => {
        it('liefert WLANs mit ID als Wert, sortiert nach Name', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({
                getWlanConfig_V2: () =>
                    Promise.resolve([
                        { configuration: { _id: 'w2', name: 'Zuhause' } },
                        { configuration: { _id: 'w1', name: 'Gast' } },
                    ]),
            });

            await messageHandler.wlan.list(createMessage('wlan'), adapter, ufn);

            expect(sent[0].list).to.deep.equal([
                { label: 'Gast', value: 'w1' },
                { label: 'Zuhause', value: 'w2' },
            ]);
        });

        it('liefert eine leere Liste ohne API', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            await messageHandler.wlan.list(createMessage('wlan'), adapter, undefined);

            expect(sent[0].list).to.deep.equal([]);
        });
    });

    describe('lan.list', () => {
        it('hängt die VLAN-ID an, wenn vorhanden, und sortiert nach Label', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({
                getLanConfig_V2: () =>
                    Promise.resolve([
                        { configuration: { _id: 'l1', name: 'LAN', vlan: 10 } },
                        { configuration: { _id: 'l2', name: 'Default' } },
                    ]),
            });

            await messageHandler.lan.list(createMessage('lan'), adapter, ufn);

            expect(sent[0].list).to.deep.equal([
                { label: 'Default', value: 'l2' },
                { label: 'LAN (VLAN: 10)', value: 'l1' },
            ]);
        });

        it('liefert eine leere Liste ohne API', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            await messageHandler.lan.list(createMessage('lan'), adapter, undefined);

            expect(sent[0].list).to.deep.equal([]);
        });
    });

    describe('firewall.group.list', () => {
        it('liefert Firewall-Gruppen, sortiert nach Name', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({
                getFirewallGroup: () =>
                    Promise.resolve([
                        { _id: 'f2', name: 'Web' },
                        { _id: 'f1', name: 'Admin' },
                    ]),
            });

            await messageHandler.firewall.group.list(createMessage('firewall'), adapter, ufn);

            expect(sent[0].list).to.deep.equal([
                { label: 'Admin', value: 'f1' },
                { label: 'Web', value: 'f2' },
            ]);
        });

        it('liefert eine leere Liste bei null-Antwort', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            const ufn = createApi({ getFirewallGroup: () => Promise.resolve(null) });

            await messageHandler.firewall.group.list(createMessage('firewall'), adapter, ufn);

            expect(sent[0].list).to.deep.equal([]);
        });
    });

    describe('stateList', () => {
        it('kennzeichnet Kanäle und Zustände und sortiert nach Wert', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            messageHandler.device.stateList(createMessage('states'), adapter, undefined);

            const list = sent[0].list;
            expect(list.some(entry => entry.label.startsWith('[Channel]'))).to.equal(true);
            expect(list.some(entry => entry.label.startsWith('[State]'))).to.equal(true);
            const values = list.map(entry => entry.value);
            expect(values).to.deep.equal([...values].sort());
        });

        it('liefert für alle Listen Einträge, deren Label auf den Wert endet', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            messageHandler.device.stateList(createMessage('states'), adapter, undefined);
            messageHandler.client.stateList(createMessage('states'), adapter, undefined);
            messageHandler.wlan.stateList(createMessage('states'), adapter, undefined);
            messageHandler.lan.stateList(createMessage('states'), adapter, undefined);
            messageHandler.firewall.group.stateList(createMessage('states'), adapter, undefined);

            expect(sent).to.have.length(5);
            for (const entry of sent.flatMap(message => message.list)) {
                expect(entry.label.endsWith(entry.value)).to.equal(true);
            }
        });

        it('kennzeichnet alle Einträge als Zustand, wenn myIob fehlt', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();
            Reflect.deleteProperty(adapter, 'myIob');

            messageHandler.wlan.stateList(createMessage('states'), adapter, undefined);

            expect(sent[0].list.length).to.be.greaterThan(0);
            for (const entry of sent[0].list) {
                expect(entry.label.startsWith('[State]')).to.equal(true);
            }
        });

        it('sendet keine Antwort ohne Callback', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            messageHandler.lan.stateList(createMessage('states', false), adapter, undefined);

            expect(sent).to.have.length(0);
        });

        it('liefert die gleiche Liste bei einem zweiten Aufruf aus dem Cache', async () => {
            const messageHandler = await loadMessageHandler();
            const { adapter, sent } = createAdapterSpy();

            messageHandler.firewall.group.stateList(createMessage('states'), adapter, undefined);
            messageHandler.firewall.group.stateList(createMessage('states'), adapter, undefined);

            expect(sent).to.have.length(2);
            expect(sent[1].list).to.deep.equal(sent[0].list);
        });
    });
});
