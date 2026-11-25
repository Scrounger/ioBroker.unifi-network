import { expect } from 'chai';
import type { NetworkEventData, NetworkEventMeta, NetworkEventSpeedTest } from '../../../src/lib/api/network-types.js';
import { disconnectDebounceList, eventHandler, resetEventHandlerStateForTests } from '../../../src/lib/eventHandler.js';
import type { myNetworkClient } from '../../../src/lib/myTypes.js';
import * as tree from '../../../src/lib/tree/index.js';
import { type AdapterStub, createAdapterStub, setCachedClient, setCachedDevice } from '../../../tools/offlineAdapterStub.js';

const MAC_GW = 'aa:bb:cc:00:00:01';
const MAC_CLIENT = 'aa:bb:cc:00:00:10';
const MAC_GUEST = 'aa:bb:cc:00:00:20';
const META = {} as unknown as NetworkEventMeta;

type EventHandlers = typeof eventHandler & {
    disconnectDebounceList: typeof disconnectDebounceList;
};

/**
 * Returns the shared event handler with its debounce list. The module-level state is cleared by `resetEventHandlerStateForTests()`.
 */
function loadEventHandler(): EventHandlers {
    resetEventHandlerStateForTests();
    return { ...eventHandler, disconnectDebounceList };
}

/**
 * Casts a plain object to an event payload type. The payloads are only partially typed in the API types.
 *
 * @param data plain event data
 */
function asType<T>(data: Record<string, unknown>): T {
    return data as unknown as T;
}

interface PendingTimer {
    callback: () => Promise<void>;
    delay: number;
    handle: ioBroker.Timeout;
}

interface TimerSpy {
    pending: PendingTimer[];
    cleared: ioBroker.Timeout[];
}

/**
 * Replaces `setTimeout` and `clearTimeout` of the stub adapter. Timers do not run by themselves, a test calls the stored callback.
 *
 * @param stub adapter stub to patch
 */
function spyTimers(stub: AdapterStub): TimerSpy {
    const spy: TimerSpy = { pending: [], cleared: [] };
    Object.assign(stub.adapter, {
        setTimeout: (callback: () => Promise<void>, delay: number): ioBroker.Timeout => {
            const handle = { id: spy.pending.length + 1 } as unknown as ioBroker.Timeout;
            spy.pending.push({ callback, delay, handle });
            return handle;
        },
        clearTimeout: (handle: ioBroker.Timeout): void => {
            spy.cleared.push(handle);
        },
    });
    return spy;
}

describe('eventHandler (offline, synthetische Events)', () => {
    let stub: AdapterStub;
    let timers: TimerSpy;
    let handlers: EventHandlers;

    /**
     * Creates a new adapter stub with the given config overrides, a `myIob` helper and spied timers.
     *
     * @param config config values that override the stub defaults
     */
    function setup(config: Record<string, unknown> = {}): void {
        stub = createAdapterStub(config);
        Object.assign(stub.adapter, {
            myIob: {
                getIdWithoutLastPart: (id: string): string => id.substring(0, id.lastIndexOf('.')),
            },
        });
        timers = spyTimers(stub);
    }

    beforeEach(() => {
        setup();
        handlers = loadEventHandler();
    });

    describe('device', () => {
        it('setzt isOnline bei restarted auf false', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway' });
            const id = `${tree.device.idChannel}.${MAC_GW}.isOnline`;
            stub.objects.add(id);

            await handlers.device.restarted(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(false);
            expect(stub.errors).to.deep.equal([]);
        });

        it('warnt bei restarted ohne MAC-Adresse', async () => {
            await handlers.device.restarted(META, asType<NetworkEventData>({}), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('ändert bei restarted nichts, wenn Geräte deaktiviert sind', async () => {
            setup({ devicesEnabled: false });
            const id = `${tree.device.idChannel}.${MAC_GW}.isOnline`;
            stub.objects.add(id);

            await handlers.device.restarted(META, asType<NetworkEventData>({ ap: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.states.has(id)).to.equal(false);
        });

        it('setzt isOnline bei connected und disconnected je nach Ereignis', async () => {
            const id = `${tree.device.idChannel}.${MAC_GW}.isOnline`;
            stub.objects.add(id);

            await handlers.device.connected(META, asType<NetworkEventData>({ gw: MAC_GW, key: 'EVT_GW_Connected' }), stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(true);

            await handlers.device.connected(META, asType<NetworkEventData>({ gw: MAC_GW, key: 'EVT_GW_Disconnected' }), stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(false);
        });

        it('warnt bei connected ohne MAC-Adresse', async () => {
            await handlers.device.connected(META, asType<NetworkEventData>({ key: 'EVT_GW_Connected' }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('löscht das Gerät mit allen States bei deleted, wenn keepIobSynchron aktiv ist', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway' });
            const channel = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(channel);
            stub.objects.add(`${channel}.isOnline`);

            await handlers.device.deleted(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
            expect(stub.objects.has(`${channel}.isOnline`)).to.equal(false);
            expect(stub.cache.devices[MAC_GW]).to.equal(undefined);
        });

        it('löscht das Gerät bei deleted nicht, wenn keepIobSynchron aus ist', async () => {
            setup({ keepIobSynchron: false });
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway' });
            const channel = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(channel);

            await handlers.device.deleted(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(true);
        });

        it('setzt isOnline und state bei lostContact auf offline', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', state: 1 });
            const base = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(`${base}.isOnline`);
            stub.objects.add(`${base}.state`);

            await handlers.device.lostContact(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.states.get(`${base}.isOnline`)).to.equal(false);
            expect(stub.states.get(`${base}.state`)).to.equal(0);
            expect(stub.cache.devices[MAC_GW].state).to.equal(0);
        });

        it('warnt bei lostContact ohne MAC-Adresse', async () => {
            await handlers.device.lostContact(META, asType<NetworkEventData>({}), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('setzt den WAN-Status je nach Transition und ignoriert unbekannte Schnittstellen', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan1: { ifname: 'eth8' }, wan2: { ifname: 'eth9' } });
            const wan1 = `devices.${MAC_GW}.isp.wan1.isOnline`;
            const wan2 = `devices.${MAC_GW}.isp.wan2.isOnline`;
            stub.objects.add(wan1);
            stub.objects.add(wan2);

            await handlers.device.wanTransition(META, asType<NetworkEventData>({ gw: MAC_GW, iface: 'eth9', state: 'inactive' }), stub.adapter, stub.cache);
            expect(stub.states.get(wan2)).to.equal(false);

            await handlers.device.wanTransition(META, asType<NetworkEventData>({ gw: MAC_GW, iface: 'eth8', state: 'active' }), stub.adapter, stub.cache);
            expect(stub.states.get(wan1)).to.equal(true);

            await handlers.device.wanTransition(META, asType<NetworkEventData>({ gw: MAC_GW, iface: 'unbekannt', state: 'active' }), stub.adapter, stub.cache);
            expect(stub.states.size).to.equal(2);
        });

        it('warnt bei wanTransition ohne MAC-Adresse', async () => {
            await handlers.device.wanTransition(META, asType<NetworkEventData>({ iface: 'eth8', state: 'active' }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('ändert bei connected nichts, wenn Geräte deaktiviert sind', async () => {
            setup({ devicesEnabled: false });
            const id = `${tree.device.idChannel}.${MAC_GW}.isOnline`;
            stub.objects.add(id);

            await handlers.device.connected(META, asType<NetworkEventData>({ gw: MAC_GW, key: 'EVT_GW_Connected' }), stub.adapter, stub.cache);

            expect(stub.states.has(id)).to.equal(false);
        });

        it('ändert bei lostContact nichts, wenn Geräte deaktiviert sind', async () => {
            setup({ devicesEnabled: false });
            const base = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(`${base}.isOnline`);
            stub.objects.add(`${base}.state`);

            await handlers.device.lostContact(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.states.has(`${base}.isOnline`)).to.equal(false);
            expect(stub.states.has(`${base}.state`)).to.equal(false);
        });

        it('ändert bei wanTransition nichts, wenn Geräte deaktiviert sind', async () => {
            setup({ devicesEnabled: false });
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan1: { ifname: 'eth8' } });
            const wan1 = `devices.${MAC_GW}.isp.wan1.isOnline`;
            stub.objects.add(wan1);

            await handlers.device.wanTransition(META, asType<NetworkEventData>({ gw: MAC_GW, iface: 'eth8', state: 'active' }), stub.adapter, stub.cache);

            expect(stub.states.has(wan1)).to.equal(false);
        });

        it('liest die MAC-Adresse bei connected auch aus dem Feld sw', async () => {
            const id = `${tree.device.idChannel}.${MAC_GW}.isOnline`;
            stub.objects.add(id);

            await handlers.device.connected(META, asType<NetworkEventData>({ sw: MAC_GW, key: 'EVT_SW_Connected' }), stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
        });

        it('liest die MAC-Adresse bei wanTransition auch aus dem Feld dm', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan1: { ifname: 'eth8' } });
            const wan1 = `devices.${MAC_GW}.isp.wan1.isOnline`;
            stub.objects.add(wan1);

            await handlers.device.wanTransition(META, asType<NetworkEventData>({ dm: MAC_GW, iface: 'eth8', state: 'active' }), stub.adapter, stub.cache);

            expect(stub.states.get(wan1)).to.equal(true);
        });

        it('schreibt bei connected keinen State, wenn das isOnline-Objekt fehlt', async () => {
            await handlers.device.connected(META, asType<NetworkEventData>({ gw: MAC_GW, key: 'EVT_GW_Connected' }), stub.adapter, stub.cache);

            expect(stub.states.size).to.equal(0);
            expect(stub.errors).to.deep.equal([]);
        });

        it('entfernt das Gerät auch ohne Cache-Eintrag, ohne Fehler zu loggen', async () => {
            const channel = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(channel);

            await handlers.device.deleted(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
            expect(stub.errors).to.deep.equal([]);
        });

        it('setzt den State bei lostContact auch ohne Cache-Eintrag, ohne Fehler zu loggen', async () => {
            const base = `${tree.device.idChannel}.${MAC_GW}`;
            stub.objects.add(`${base}.isOnline`);
            stub.objects.add(`${base}.state`);

            await handlers.device.lostContact(META, asType<NetworkEventData>({ gw: MAC_GW }), stub.adapter, stub.cache);

            expect(stub.states.get(`${base}.state`)).to.equal(0);
            expect(stub.errors).to.deep.equal([]);
        });

        describe('speedTest', () => {
            /**
             * Speedtest event of the gateway with the given interface entries.
             *
             * @param data speedtest entries of the event
             */
            function speedTestEvent(data: Record<string, unknown>[]): NetworkEventSpeedTest {
                return { meta: { mac: MAC_GW }, data } as unknown as NetworkEventSpeedTest;
            }

            it('leert die Speedtest-Werte, während der Test läuft', async () => {
                setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan2: { ifname: 'eth9' } });
                const base = `${tree.device.idChannel}.${MAC_GW}.wan2`;
                const names = ['speedtest_download', 'speedtest_upload', 'latency'];
                for (const name of names) {
                    stub.objects.add(`${base}.${name}`);
                }

                await handlers.device.speedTest(speedTestEvent([{ interface_name: 'eth9', 'upload-progress': 50 }]), stub.adapter, stub.cache);

                for (const name of names) {
                    expect(stub.states.get(`${base}.${name}`)).to.equal(null);
                }
            });

            it('schreibt Download, Upload und Latenz, wenn der Test beendet ist', async () => {
                setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan2: { ifname: 'eth9' } });
                const base = `${tree.device.idChannel}.${MAC_GW}.wan2`;
                stub.objects.add(`${base}.speedtest_download`);
                stub.objects.add(`${base}.speedtest_upload`);
                stub.objects.add(`${base}.latency`);

                await handlers.device.speedTest(speedTestEvent([{ interface_name: 'eth9', 'download-progress': 10 }]), stub.adapter, stub.cache);
                await handlers.device.speedTest(
                    speedTestEvent([
                        { interface_name: 'eth9', rundate: 1700000000, runtime: 12, xput_download: 95.5, xput_upload: 20.1, latency: 8 },
                    ]),
                    stub.adapter,
                    stub.cache,
                );

                expect(stub.states.get(`${base}.speedtest_download`)).to.equal(95.5);
                expect(stub.states.get(`${base}.speedtest_upload`)).to.equal(20.1);
                expect(stub.states.get(`${base}.latency`)).to.equal(8);
            });

            it('schreibt nichts, wenn für das WAN kein Speedtest läuft', async () => {
                setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan2: { ifname: 'eth9' } });
                const id = `${tree.device.idChannel}.${MAC_GW}.wan2.speedtest_download`;
                stub.objects.add(id);

                await handlers.device.speedTest(
                    speedTestEvent([{ interface_name: 'eth9', rundate: 1700000000, runtime: 12, xput_download: 5 }]),
                    stub.adapter,
                    stub.cache,
                );

                expect(stub.states.has(id)).to.equal(false);
            });

            it('übernimmt keine Werte, wenn der Speedtest mit Laufzeit 0 endet', async () => {
                setCachedDevice(stub.cache, MAC_GW, { name: 'Gateway', wan2: { ifname: 'eth9' } });
                const id = `${tree.device.idChannel}.${MAC_GW}.wan2.speedtest_download`;
                stub.objects.add(id);

                await handlers.device.speedTest(speedTestEvent([{ interface_name: 'eth9', 'download-progress': 10 }]), stub.adapter, stub.cache);
                await handlers.device.speedTest(
                    speedTestEvent([{ interface_name: 'eth9', rundate: 1700000000, runtime: 0, xput_download: 95.5 }]),
                    stub.adapter,
                    stub.cache,
                );

                expect(stub.states.get(id)).to.equal(null);
            });

            it('ordnet unbekannte Schnittstellen dem WAN1 zu', async () => {
                const id = `${tree.device.idChannel}.${MAC_GW}.wan1.latency`;
                stub.objects.add(id);

                await handlers.device.speedTest(speedTestEvent([{ interface_name: 'unbekannt', 'upload-progress': 1 }]), stub.adapter, stub.cache);

                expect(stub.states.get(id)).to.equal(null);
            });
        });
    });

    describe('client', () => {
        const userOnline = `${tree.client.idChannelUsers}.${MAC_CLIENT}.isOnline`;
        const guestOnline = `${tree.client.idChannelGuests}.${MAC_GUEST}.isOnline`;

        it('setzt isOnline eines Clients bei connected und disconnected', async () => {
            stub.objects.add(userOnline);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Connected' }), stub.adapter, stub.cache);
            expect(stub.states.get(userOnline)).to.equal(true);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);
            expect(stub.states.get(userOnline)).to.equal(false);
        });

        it('setzt isOnline eines Gasts bei WLAN-Verbindung', async () => {
            setup({ clientDebugLevel: 'info' });
            stub.objects.add(guestOnline);

            await handlers.client.connected(
                META,
                asType<NetworkEventData>({ guest: MAC_GUEST, key: 'EVT_WG_Connected', subsystem: 'wlan', ssid: 'Gast', ap_name: 'AP' }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(guestOnline)).to.equal(true);
        });

        it('ignoriert Clients, wenn clientsEnabled aus ist', async () => {
            setup({ clientsEnabled: false });
            stub.objects.add(userOnline);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Connected' }), stub.adapter, stub.cache);

            expect(stub.states.has(userOnline)).to.equal(false);
        });

        it('warnt bei connected ohne MAC-Adresse', async () => {
            await handlers.client.connected(META, asType<NetworkEventData>({ key: 'EVT_WU_Connected' }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('verzögert das Setzen von offline um die Debounce-Zeit und setzt den Wert beim Timer', async () => {
            setup({ clientRealtimeDisconnectDebounceTime: 10 });
            handlers = loadEventHandler();
            stub.objects.add(userOnline);
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false, ip: '10.0.0.7' });

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);

            expect(stub.states.has(userOnline)).to.equal(false);
            expect(timers.pending).to.have.length(1);
            expect(timers.pending[0].delay).to.equal(10000);

            await timers.pending[0].callback();

            expect(stub.states.get(userOnline)).to.equal(false);
            expect(handlers.disconnectDebounceList[MAC_CLIENT]).to.equal(undefined);
        });

        it('bricht die Debounce-Zeit ab, wenn der Client sich wieder verbindet', async () => {
            setup({ clientRealtimeDisconnectDebounceTime: 10 });
            handlers = loadEventHandler();
            stub.objects.add(userOnline);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);
            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Connected' }), stub.adapter, stub.cache);

            expect(timers.cleared).to.have.length(1);
            expect(timers.cleared[0]).to.equal(timers.pending[0].handle);
            expect(handlers.disconnectDebounceList[MAC_CLIENT]).to.equal(undefined);
            expect(stub.states.get(userOnline)).to.equal(true);
        });

        it('tut nichts, wenn der Debounce-Timer ohne Eintrag feuert', async () => {
            setup({ clientRealtimeDisconnectDebounceTime: 10 });
            handlers = loadEventHandler();
            stub.objects.add(userOnline);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);
            delete handlers.disconnectDebounceList[MAC_CLIENT];
            await timers.pending[0].callback();

            expect(stub.states.has(userOnline)).to.equal(false);
        });

        it('verwendet die Debounce-Zeit eines Eintrags auch, wenn die globale Zeit 0 ist', async () => {
            setup({
                clientRealtimeDisconnectDebounceTime: 0,
                clientDebouncingList: [{ mac: MAC_CLIENT, debounceTime: 5 }],
            });
            handlers = loadEventHandler();

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);

            expect(timers.pending).to.have.length(1);
            expect(timers.pending[0].delay).to.equal(5000);
        });

        it('verwendet die client-spezifische Debounce-Zeit', async () => {
            setup({
                clientRealtimeDisconnectDebounceTime: 10,
                clientDebouncingList: [{ mac: MAC_CLIENT.toUpperCase(), debounceTime: 5 }],
            });
            handlers = loadEventHandler();

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);

            expect(timers.pending[0].delay).to.equal(5000);
        });

        it('setzt offline sofort, wenn keine Debounce-Zeit konfiguriert ist', async () => {
            stub.objects.add(userOnline);

            await handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Disconnected' }), stub.adapter, stub.cache);

            expect(stub.states.get(userOnline)).to.equal(false);
            expect(timers.pending).to.have.length(0);
        });

        it('übernimmt AP-Name und AP-MAC beim Roam', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false, ip: '10.0.0.7' });
            setCachedDevice(stub.cache, MAC_GW, { name: 'Ziel-AP', mac: MAC_GW });
            const idName = `${tree.client.idChannelUsers}.${MAC_CLIENT}.uplink_name`;
            const idMac = `${tree.client.idChannelUsers}.${MAC_CLIENT}.uplink_mac`;
            stub.objects.add(idName);
            stub.objects.add(idMac);

            await handlers.client.roamed(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, ap_from: 'aa:bb:cc:00:00:02', ap_to: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idName)).to.equal('Ziel-AP');
            expect(stub.states.get(idMac)).to.equal(MAC_GW);
        });

        it('setzt uplink_name auf null, wenn der Ziel-AP unbekannt ist', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            const idName = `${tree.client.idChannelUsers}.${MAC_CLIENT}.uplink_name`;
            stub.objects.add(idName);

            await handlers.client.roamed(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, ap_from: 'aa:bb:cc:00:00:02', ap_to: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idName)).to.equal(null);
        });

        it('ignoriert Roams von Clients, wenn clientsEnabled aus ist', async () => {
            setup({ clientsEnabled: false });
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            setCachedDevice(stub.cache, MAC_GW, { name: 'Ziel-AP', mac: MAC_GW });
            const idName = `${tree.client.idChannelUsers}.${MAC_CLIENT}.uplink_name`;
            stub.objects.add(idName);

            await handlers.client.roamed(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, ap_from: 'aa:bb:cc:00:00:02', ap_to: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.has(idName)).to.equal(false);
        });

        it('setzt uplink_name auch ohne Cache-Eintrag, ohne Fehler zu loggen', async () => {
            setCachedDevice(stub.cache, MAC_GW, { name: 'Ziel-AP', mac: MAC_GW });
            const idName = `${tree.client.idChannelUsers}.${MAC_CLIENT}.uplink_name`;
            stub.objects.add(idName);

            await handlers.client.roamed(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, ap_from: 'aa:bb:cc:00:00:02', ap_to: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idName)).to.equal('Ziel-AP');
            expect(stub.errors).to.deep.equal([]);
        });

        it('warnt beim Roam ohne AP-Information', async () => {
            await handlers.client.roamed(META, asType<NetworkEventData>({ user: MAC_CLIENT }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('setzt Kanal und Frequenzband beim Wechsel des Funkkanals', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            const idChannel = `${tree.client.idChannelUsers}.${MAC_CLIENT}.channel`;
            const idFrequency = `${tree.client.idChannelUsers}.${MAC_CLIENT}.channel_frequency`;
            stub.objects.add(idChannel);
            stub.objects.add(idFrequency);

            await handlers.client.roamedRadio(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, channel_from: '36', channel_to: '44', radio_to: 'na', ap: MAC_GW, ap_name: 'AP' }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idChannel)).to.equal(44);
            expect(stub.states.get(idFrequency)).to.equal('5 GHz');
        });

        it('setzt Kanal und Frequenzband eines Gasts beim Funkkanal-Wechsel', async () => {
            setCachedClient(stub.cache, MAC_GUEST, { name: 'Gast', is_guest: true });
            const idChannel = `${tree.client.idChannelGuests}.${MAC_GUEST}.channel`;
            const idFrequency = `${tree.client.idChannelGuests}.${MAC_GUEST}.channel_frequency`;
            stub.objects.add(idChannel);
            stub.objects.add(idFrequency);

            await handlers.client.roamedRadio(
                META,
                asType<NetworkEventData>({ guest: MAC_GUEST, channel_from: '36', channel_to: '44', radio_to: 'na', ap: MAC_GW, ap_name: 'AP' }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idChannel)).to.equal(44);
            expect(stub.states.get(idFrequency)).to.equal('5 GHz');
        });

        it('ignoriert Funkkanal-Wechsel von Gästen, wenn guestsEnabled aus ist', async () => {
            setup({ guestsEnabled: false });
            setCachedClient(stub.cache, MAC_GUEST, { name: 'Gast', is_guest: true });
            const idChannel = `${tree.client.idChannelGuests}.${MAC_GUEST}.channel`;
            stub.objects.add(idChannel);

            await handlers.client.roamedRadio(
                META,
                asType<NetworkEventData>({ guest: MAC_GUEST, channel_from: '36', channel_to: '44', ap: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.has(idChannel)).to.equal(false);
        });

        it('setzt Kanal auch ohne Cache-Eintrag, ohne Fehler zu loggen', async () => {
            const idChannel = `${tree.client.idChannelUsers}.${MAC_CLIENT}.channel`;
            stub.objects.add(idChannel);

            await handlers.client.roamedRadio(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, channel_from: '36', channel_to: '44', ap: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.states.get(idChannel)).to.equal(44);
            expect(stub.errors).to.deep.equal([]);
        });

        it('warnt beim Funkkanal-Wechsel ohne Zielkanal', async () => {
            await handlers.client.roamedRadio(
                META,
                asType<NetworkEventData>({ user: MAC_CLIENT, channel_from: '36', ap: MAC_GW }),
                stub.adapter,
                stub.cache,
            );

            expect(stub.warnings).to.have.length(1);
        });

        it('setzt blocked eines Clients bei EVT_WC_Blocked und EVT_WC_Unblocked', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false, ip: '10.0.0.7' });
            const id = `${tree.client.idChannelUsers}.${MAC_CLIENT}.blocked`;
            stub.objects.add(id);

            await handlers.client.block(META, asType<NetworkEventData>({ client: MAC_CLIENT, key: 'EVT_WC_Blocked' }), stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(true);

            await handlers.client.block(META, asType<NetworkEventData>({ client: MAC_CLIENT, key: 'EVT_WC_Unblocked' }), stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(false);
        });

        it('setzt blocked eines Gasts im Gast-Kanal', async () => {
            setCachedClient(stub.cache, MAC_GUEST, { name: 'Gast', is_guest: true });
            const id = `${tree.client.idChannelGuests}.${MAC_GUEST}.blocked`;
            stub.objects.add(id);

            await handlers.client.block(META, asType<NetworkEventData>({ client: MAC_GUEST, key: 'EVT_WC_Blocked' }), stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
        });

        it('setzt blocked eines kabelgebundenen Clients bei EVT_LC_Blocked', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            const id = `${tree.client.idChannelUsers}.${MAC_CLIENT}.blocked`;
            stub.objects.add(id);

            await handlers.client.block(META, asType<NetworkEventData>({ client: MAC_CLIENT, key: 'EVT_LC_Blocked' }), stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
        });

        it('ignoriert block bei unbekannten Clients', async () => {
            await handlers.client.block(META, asType<NetworkEventData>({ client: MAC_CLIENT, key: 'EVT_WC_Blocked' }), stub.adapter, stub.cache);

            expect(stub.states.size).to.equal(0);
        });

        it('warnt beim block ohne Client-MAC', async () => {
            await handlers.client.block(META, asType<NetworkEventData>({ key: 'EVT_WC_Blocked' }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });

        it('setzt isOnline eines VPN-Clients bei vpnDisconnect auf false', async () => {
            const id = `${tree.client.idChannelVpn}.net1.10_0_0_5.isOnline`;
            stub.objects.add(id);

            await handlers.client.vpnDisconnect(META, asType<myNetworkClient>({ ip: '10.0.0.5', network_id: 'net1' }), stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(false);
        });

        it('nennt den VPN-Client mit Namen im Log bei vpnDisconnect', async () => {
            const infos: string[] = [];
            Object.assign(stub.adapter.log, {
                info: (message: string): void => {
                    infos.push(message);
                },
            });
            Object.assign(stub.cache.vpn, { '10.0.0.5': { name: 'Laptop', ip: '10.0.0.5', remote_ip: '203.0.113.9' } });

            await handlers.client.vpnDisconnect(META, asType<myNetworkClient>({ ip: '10.0.0.5', network_id: 'net1' }), stub.adapter, stub.cache);

            expect(infos.some(message => message.includes("'Laptop'"))).to.equal(true);
        });

        it('warnt bei vpnDisconnect ohne IP', async () => {
            await handlers.client.vpnDisconnect(META, asType<myNetworkClient>({ network_id: 'net1' }), stub.adapter, stub.cache);

            expect(stub.warnings).to.have.length(1);
        });
    });

    describe('user', () => {
        it('entfernt einen Client mit allen States bei clientRemoved', async () => {
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            const channel = `${tree.client.idChannelUsers}.${MAC_CLIENT}`;
            stub.objects.add(channel);
            stub.objects.add(`${channel}.isOnline`);

            await handlers.user.clientRemoved(META, { mac: MAC_CLIENT }, stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
            expect(stub.cache.clients[MAC_CLIENT]).to.equal(undefined);
        });

        it('entfernt einen Gast aus dem Gast-Kanal bei clientRemoved', async () => {
            setCachedClient(stub.cache, MAC_GUEST, { name: 'Gast', is_guest: true });
            const channel = `${tree.client.idChannelGuests}.${MAC_GUEST}`;
            stub.objects.add(channel);

            await handlers.user.clientRemoved(META, { mac: MAC_GUEST }, stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
        });

        it('lässt Objekte bei clientRemoved stehen, wenn der Client nicht im Cache ist', async () => {
            const channel = `${tree.client.idChannelUsers}.${MAC_CLIENT}`;
            stub.objects.add(channel);

            await handlers.user.clientRemoved(META, { mac: MAC_CLIENT }, stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(true);
        });

        it('lässt den Client bei clientRemoved bestehen, wenn keepIobSynchron aus ist', async () => {
            setup({ keepIobSynchron: false });
            setCachedClient(stub.cache, MAC_CLIENT, { name: 'Client', is_guest: false });
            const channel = `${tree.client.idChannelUsers}.${MAC_CLIENT}`;
            stub.objects.add(channel);

            await handlers.user.clientRemoved(META, { mac: MAC_CLIENT }, stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(true);
        });
    });

    describe('wlanConf', () => {
        it('entfernt den WLAN-Kanal und die WLAN-Kanäle der Geräte', async () => {
            const wlanChannel = `${tree.wlan.idChannel}.wlan1`;
            const deviceWlan = `${tree.device.idChannel}.${MAC_GW}.wlan.0`;
            stub.objects.add(wlanChannel);
            stub.objects.add(deviceWlan);
            stub.objects.add(`${deviceWlan}.id`);
            stub.states.set(`${deviceWlan}.id`, 'wlan1');

            await handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }], stub.adapter, stub.cache);

            expect(stub.objects.has(wlanChannel)).to.equal(false);
            expect(stub.objects.has(deviceWlan)).to.equal(false);
        });

        it('lässt die WLAN-Kanäle der Geräte stehen, wenn devicesEnabled aus ist', async () => {
            setup({ devicesEnabled: false });
            const wlanChannel = `${tree.wlan.idChannel}.wlan1`;
            const deviceWlan = `${tree.device.idChannel}.${MAC_GW}.wlan.0`;
            stub.objects.add(wlanChannel);
            stub.objects.add(deviceWlan);
            stub.objects.add(`${deviceWlan}.id`);
            stub.states.set(`${deviceWlan}.id`, 'wlan1');

            await handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }], stub.adapter, stub.cache);

            expect(stub.objects.has(wlanChannel)).to.equal(false);
            expect(stub.objects.has(deviceWlan)).to.equal(true);
        });

        it('lässt die WLAN-Kanäle der Geräte stehen, die eine andere WLAN-ID haben', async () => {
            const wlanChannel = `${tree.wlan.idChannel}.wlan1`;
            const deviceWlan = `${tree.device.idChannel}.${MAC_GW}.wlan.0`;
            stub.objects.add(wlanChannel);
            stub.objects.add(deviceWlan);
            stub.objects.add(`${deviceWlan}.id`);
            stub.states.set(`${deviceWlan}.id`, 'wlan2');

            await handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }], stub.adapter, stub.cache);

            expect(stub.objects.has(wlanChannel)).to.equal(false);
            expect(stub.objects.has(deviceWlan)).to.equal(true);
        });

        it('lässt den WLAN-Kanal bei deleted stehen, wenn keepIobSynchron aus ist', async () => {
            setup({ keepIobSynchron: false });
            const wlanChannel = `${tree.wlan.idChannel}.wlan1`;
            stub.objects.add(wlanChannel);

            await handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }], stub.adapter, stub.cache);

            expect(stub.objects.has(wlanChannel)).to.equal(true);
        });

        it('tut nichts ohne Daten', async () => {
            const wlanChannel = `${tree.wlan.idChannel}.wlan1`;
            stub.objects.add(wlanChannel);

            await handlers.wlanConf.deleted(META, null, stub.adapter, stub.cache);

            expect(stub.objects.has(wlanChannel)).to.equal(true);
        });

        it('entfernt mehrere WLANs in einem Event samt ihrer Geräte-WLAN-Kanäle und lässt fremde stehen', async () => {
            const wlan1Channel = `${tree.wlan.idChannel}.wlan1`;
            const wlan2Channel = `${tree.wlan.idChannel}.wlan2`;
            const deviceWlan1 = `${tree.device.idChannel}.${MAC_GW}.wlan.0`;
            const deviceWlan2 = `${tree.device.idChannel}.${MAC_GW}.wlan.1`;
            const deviceWlan3 = `${tree.device.idChannel}.${MAC_GW}.wlan.2`;
            stub.objects.add(wlan1Channel);
            stub.objects.add(wlan2Channel);
            stub.objects.add(deviceWlan1);
            stub.objects.add(`${deviceWlan1}.id`);
            stub.states.set(`${deviceWlan1}.id`, 'wlan1');
            stub.objects.add(deviceWlan2);
            stub.objects.add(`${deviceWlan2}.id`);
            stub.states.set(`${deviceWlan2}.id`, 'wlan2');
            stub.objects.add(deviceWlan3);
            stub.objects.add(`${deviceWlan3}.id`);
            stub.states.set(`${deviceWlan3}.id`, 'wlan3');

            await handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }, { _id: 'wlan2', name: 'Firma' }], stub.adapter, stub.cache);

            expect(stub.objects.has(wlan1Channel)).to.equal(false);
            expect(stub.objects.has(wlan2Channel)).to.equal(false);
            expect(stub.objects.has(deviceWlan1)).to.equal(false);
            expect(stub.objects.has(deviceWlan2)).to.equal(false);
            expect(stub.objects.has(deviceWlan3)).to.equal(true);
        });
    });

    describe('lanConf und firewall.group', () => {
        it('entfernt ein LAN bei lanConf.deleted', async () => {
            const channel = `${tree.lan.idChannel}.lan1`;
            stub.objects.add(channel);

            await handlers.lanConf.deleted(META, [{ _id: 'lan1', name: 'LAN' }], stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
        });

        it('lässt das LAN bei lanConf.deleted stehen, wenn keepIobSynchron aus ist', async () => {
            setup({ keepIobSynchron: false });
            const channel = `${tree.lan.idChannel}.lan1`;
            stub.objects.add(channel);

            await handlers.lanConf.deleted(META, [{ _id: 'lan1', name: 'LAN' }], stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(true);
        });

        it('lässt die Firewall-Gruppe stehen, wenn keepIobSynchron aus ist', async () => {
            setup({ keepIobSynchron: false });
            const channel = `${tree.firewall.group.idChannel}.fw1`;
            stub.objects.add(channel);

            await handlers.firewall.group.deleted(META, [{ _id: 'fw1', name: 'Web' }], stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(true);
        });

        it('entfernt eine Firewall-Gruppe bei firewall.group.deleted', async () => {
            const channel = `${tree.firewall.group.idChannel}.fw1`;
            stub.objects.add(channel);

            await handlers.firewall.group.deleted(META, [{ _id: 'fw1', name: 'Web' }], stub.adapter, stub.cache);

            expect(stub.objects.has(channel)).to.equal(false);
        });
    });

    it('protokolliert Fehler in den Handlern (catch-Zweig)', async () => {
        const { adapter, cache } = stub;
        Object.assign(adapter, { objectExists: (): Promise<boolean> => Promise.reject(new Error('boom')) });
        setCachedDevice(cache, MAC_GW, { name: 'Gateway', wan1: { ifname: 'eth8' } });
        setCachedClient(cache, MAC_CLIENT, { name: 'Client', is_guest: false });

        const runs: (() => Promise<void>)[] = [
            () => handlers.device.restarted(META, asType<NetworkEventData>({ gw: MAC_GW }), adapter, cache),
            () => handlers.device.connected(META, asType<NetworkEventData>({ gw: MAC_GW, key: 'EVT_GW_Connected' }), adapter, cache),
            () => handlers.device.deleted(META, asType<NetworkEventData>({ gw: MAC_GW }), adapter, cache),
            () =>
                handlers.device.speedTest(
                    { meta: { mac: MAC_GW }, data: [{ interface_name: 'eth8', 'upload-progress': 1 }] } as unknown as NetworkEventSpeedTest,
                    adapter,
                    cache,
                ),
            () => handlers.device.lostContact(META, asType<NetworkEventData>({ gw: MAC_GW }), adapter, cache),
            () => handlers.device.wanTransition(META, asType<NetworkEventData>({ gw: MAC_GW, iface: 'eth8', state: 'active' }), adapter, cache),
            () => handlers.client.connected(META, asType<NetworkEventData>({ user: MAC_CLIENT, key: 'EVT_WU_Connected' }), adapter, cache),
            () => handlers.client.roamed(META, asType<NetworkEventData>({ user: MAC_CLIENT, ap_from: MAC_GW, ap_to: MAC_GW }), adapter, cache),
            () =>
                handlers.client.roamedRadio(
                    META,
                    asType<NetworkEventData>({ user: MAC_CLIENT, channel_from: '1', channel_to: '6', ap: MAC_GW }),
                    adapter,
                    cache,
                ),
            () => handlers.client.block(META, asType<NetworkEventData>({ client: MAC_CLIENT, key: 'EVT_WC_Blocked' }), adapter, cache),
            () => handlers.client.vpnDisconnect(META, asType<myNetworkClient>({ ip: '10.0.0.5', network_id: 'net1' }), adapter, cache),
            () => handlers.user.clientRemoved(META, { mac: MAC_CLIENT }, adapter, cache),
            () => handlers.wlanConf.deleted(META, [{ _id: 'wlan1', name: 'Gast' }], adapter, cache),
            () => handlers.lanConf.deleted(META, [{ _id: 'lan1', name: 'LAN' }], adapter, cache),
            () => handlers.firewall.group.deleted(META, [{ _id: 'fw1', name: 'Web' }], adapter, cache),
        ];

        for (const run of runs) {
            await run();
        }

        expect(stub.errors).to.have.length(runs.length);
    });
});
