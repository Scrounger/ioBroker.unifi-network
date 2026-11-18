import { expect } from 'chai';
import dayjs from 'dayjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureDir, latestFixtureVersion } from '../tools/fixtureVersions.js';
import { type IobCall, type MainContext, createFakeUfn, createMainContext, spyOn } from '../tools/mainTestHelpers.js';
import { setCachedClient, setCachedDevice } from '../tools/offlineAdapterStub.js';

const MAC_A = 'aa:bb:cc:dd:ee:01';
const MAC_B = 'aa:bb:cc:dd:ee:02';
const DEVICE_MAC = 'aa:bb:cc:dd:ee:10';
const VPN_IP = '10.0.0.5';

/**
 * Current time in seconds, as the controller sends `last_seen`.
 */
function nowSec(): number {
    return dayjs().unix();
}

/**
 * Time in seconds that lies the given number of days in the past.
 *
 * @param days number of days
 */
function daysAgo(days: number): number {
    return dayjs().subtract(days, 'day').unix();
}

/**
 * Time in seconds that lies the given number of seconds in the past.
 *
 * @param seconds number of seconds
 */
function secondsAgo(seconds: number): number {
    return dayjs().subtract(seconds, 'second').unix();
}

/**
 * Client as the API returns it.
 *
 * @param overrides properties to replace
 */
function client(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        mac: MAC_A,
        name: 'Laptop',
        hostname: 'laptop',
        ip: '192.168.1.10',
        is_guest: false,
        last_seen: nowSec(),
        network_id: 'net1',
        wlanconf_id: 'wlan1',
        ...overrides,
    };
}

/**
 * Network device as the API returns it.
 *
 * @param overrides properties to replace
 */
function device(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        mac: DEVICE_MAC,
        name: 'AP Wohnzimmer',
        ip: '192.168.1.2',
        state: 1,
        model: 'U7PG2',
        version: '6.6.1',
        last_seen: nowSec(),
        ...overrides,
    };
}

/**
 * VPN client as the API returns it.
 *
 * @param overrides properties to replace
 */
function vpnClient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        type: 'VPN',
        ip: VPN_IP,
        name: 'Remote',
        network_id: 'net1',
        network_name: 'VPN Netz',
        vpn_type: 'wireguard-client',
        status: 'online',
        last_seen: nowSec(),
        ...overrides,
    };
}

/**
 * Returns the recorded `myIob` calls of one method.
 *
 * @param ctx test context
 * @param method method name to filter for
 */
function callsOf(ctx: MainContext, method: IobCall['method']): IobCall[] {
    return ctx.iobCalls.filter(call => call.method === method);
}

/**
 * Returns the ids of all recorded device writes.
 *
 * @param ctx test context
 */
function deviceIds(ctx: MainContext): string[] {
    return callsOf(ctx, 'createOrUpdateDevice').map(call => call.id);
}

describe('updateDevices', () => {
    it('legt bei Adapterstart den Channel an und schreibt jedes Gerät', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateDevices([device()], true);

        expect(callsOf(ctx, 'createOrUpdateChannel').map(call => call.id)).to.deep.equal(['devices']);
        expect(deviceIds(ctx)).to.deep.equal([`devices.${DEVICE_MAC}`]);
        expect(callsOf(ctx, 'createOrUpdateStates').map(call => call.id)).to.deep.equal([`devices.${DEVICE_MAC}`]);
    });

    it('schreibt ein Gerät nicht erneut, wenn sich keine Eigenschaft geändert hat', async () => {
        const ctx = createMainContext();
        const dev = device();
        setCachedDevice(ctx.stub.cache, DEVICE_MAC, dev);

        await ctx.instance.updateDevices([dev], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt geänderte Eigenschaften eines bekannten Geräts', async () => {
        const ctx = createMainContext();
        setCachedDevice(ctx.stub.cache, DEVICE_MAC, device());

        await ctx.instance.updateDevices([device({ state: 0 })], false);

        expect(deviceIds(ctx)).to.deep.equal([`devices.${DEVICE_MAC}`]);
    });

    it('überspringt Geräte innerhalb der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        setCachedDevice(ctx.stub.cache, DEVICE_MAC, device({ last_seen: nowSec() }));

        await ctx.instance.updateDevices([device({ state: 0 })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('verarbeitet Geräte nach Ablauf der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        setCachedDevice(ctx.stub.cache, DEVICE_MAC, device({ last_seen: secondsAgo(120) }));

        await ctx.instance.updateDevices([device({ state: 0 })], false);

        expect(deviceIds(ctx)).to.deep.equal([`devices.${DEVICE_MAC}`]);
    });

    it('löscht geblacklistete Geräte bei Adapterstart', async () => {
        const ctx = createMainContext({ deviceBlackList: [{ mac: DEVICE_MAC }] });
        ctx.stub.objects.add(`devices.${DEVICE_MAC}`);
        ctx.stub.objects.add(`devices.${DEVICE_MAC}.name`);

        await ctx.instance.updateDevices([device()], true);

        expect(ctx.stub.objects.has(`devices.${DEVICE_MAC}`)).to.equal(false);
        expect(ctx.stub.objects.has(`devices.${DEVICE_MAC}.name`)).to.equal(false);
        expect(deviceIds(ctx)).to.deep.equal([]);
    });

    it('schreibt bei Whitelist nur die Geräte auf der Liste', async () => {
        const ctx = createMainContext({ deviceIsWhiteList: true, deviceBlackList: [{ mac: DEVICE_MAC }] });

        await ctx.instance.updateDevices([device(), device({ mac: 'aa:bb:cc:dd:ee:11' })], false);

        expect(deviceIds(ctx)).to.deep.equal([`devices.${DEVICE_MAC}`]);
    });

    it('löscht den Channel, wenn Geräte deaktiviert sind', async () => {
        const ctx = createMainContext({ devicesEnabled: false });
        ctx.stub.objects.add('devices');
        ctx.stub.objects.add(`devices.${DEVICE_MAC}`);

        await ctx.instance.updateDevices([device()], false);

        expect(ctx.stub.objects.has('devices')).to.equal(false);
        expect(ctx.stub.objects.has(`devices.${DEVICE_MAC}`)).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('tut nichts ohne Gerätedaten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateDevices(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('tut nichts, wenn der Adapter nicht verbunden ist', async () => {
        const ctx = createMainContext({}, { isConnected: false });

        await ctx.instance.updateDevices([device()], true);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateClients', () => {
    it('legt bei Adapterstart die Channels an und liest die aktiven Clients über die API', async () => {
        const ufn = createFakeUfn({ getClientsActive_V2: () => Promise.resolve([client()]) });
        const ctx = createMainContext({}, { ufn });

        await ctx.instance.updateClients(null, true);

        expect(callsOf(ctx, 'createOrUpdateChannel').map(call => call.id)).to.deep.equal(['clients.users', 'clients.guests', 'clients']);
        expect(deviceIds(ctx)).to.deep.equal([`clients.users.${MAC_A}`]);
    });

    it('schreibt Gäste unter clients.guests', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateClients([client({ is_guest: true })], false);

        expect(deviceIds(ctx)).to.deep.equal([`clients.guests.${MAC_A}`]);
    });

    it('ignoriert Clients ohne MAC-Adresse mit Warnung', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateClients([client({ mac: undefined })], false);

        expect(ctx.stub.warnings.some(message => message.includes('has no mac address'))).to.equal(true);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('überspringt Clients innerhalb der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        setCachedClient(ctx.stub.cache, MAC_A, client({ last_seen: nowSec() }));
        ctx.stub.cache.isOnline[MAC_A] = { val: true };

        await ctx.instance.updateClients([client({ wlanconf_id: 'wlan2' })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt einen unveränderten Client nicht erneut', async () => {
        const ctx = createMainContext();
        const known = client();
        setCachedClient(ctx.stub.cache, MAC_A, known);
        ctx.stub.cache.isOnline[MAC_A] = { val: true };

        await ctx.instance.updateClients([known], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt geänderte Eigenschaften eines bekannten Clients', async () => {
        const ctx = createMainContext();
        setCachedClient(ctx.stub.cache, MAC_A, client());
        ctx.stub.cache.isOnline[MAC_A] = { val: true };

        await ctx.instance.updateClients([client({ ip: '192.168.1.99' })], false);

        expect(deviceIds(ctx)).to.deep.equal([`clients.users.${MAC_A}`]);
    });

    it('setzt isOnline auf true für neue aktive Clients', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateClients([client()], false);

        expect(ctx.stub.cache.isOnline[MAC_A].val).to.equal(true);
        expect(ctx.stub.cache.isOnline[MAC_A].network_id).to.equal('net1');
        expect(ctx.stub.cache.isOnline[MAC_A].wlan_id).to.equal('wlan1');
    });

    it('setzt isOnline auf false für Clients aus der Historie', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateClients([client({ last_seen: secondsAgo(600) })], false, true);

        expect(ctx.stub.cache.isOnline[MAC_A].val).to.equal(false);
    });

    it('löscht Clients, die länger als deleteClientsOlderThan offline sind', async () => {
        const ctx = createMainContext({ deleteClientsOlderThan: 7 });
        ctx.stub.objects.add(`clients.users.${MAC_A}`);

        await ctx.instance.updateClients([client({ last_seen: daysAgo(10) })], false);

        expect(ctx.stub.objects.has(`clients.users.${MAC_A}`)).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt Clients innerhalb von deleteClientsOlderThan', async () => {
        const ctx = createMainContext({ deleteClientsOlderThan: 7 });

        await ctx.instance.updateClients([client({ last_seen: daysAgo(3) })], false);

        expect(deviceIds(ctx)).to.deep.equal([`clients.users.${MAC_A}`]);
    });

    it('ignoriert Gäste, wenn Gäste deaktiviert sind', async () => {
        const ctx = createMainContext({ guestsEnabled: false });

        await ctx.instance.updateClients([client({ is_guest: true })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('ignoriert Clients und löscht den Channel, wenn Clients deaktiviert sind', async () => {
        const ctx = createMainContext({ clientsEnabled: false });
        ctx.stub.objects.add('clients.users');
        ctx.stub.objects.add(`clients.users.${MAC_A}`);

        await ctx.instance.updateClients([client()], false);

        expect(ctx.stub.objects.has('clients.users')).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('löscht bei Adapterstart geblacklistete Clients', async () => {
        const ufn = createFakeUfn({ getClientsActive_V2: () => Promise.resolve([client(), client({ mac: MAC_B })]) });
        const ctx = createMainContext({ clientBlackList: [{ mac: MAC_B }] }, { ufn });
        ctx.stub.objects.add(`clients.users.${MAC_B}`);

        await ctx.instance.updateClients(null, true);

        expect(deviceIds(ctx)).to.deep.equal([`clients.users.${MAC_A}`]);
        expect(ctx.stub.objects.has(`clients.users.${MAC_B}`)).to.equal(false);
    });

    it('verarbeitet bei Whitelist nur die Clients auf der Liste', async () => {
        const ctx = createMainContext({ clientIsWhiteList: true, clientBlackList: [{ mac: MAC_A }] });

        await ctx.instance.updateClients([client(), client({ mac: MAC_B })], false);

        expect(deviceIds(ctx)).to.deep.equal([`clients.users.${MAC_A}`]);
    });

    it('tut nichts ohne Clientdaten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateClients(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateVpnClients', () => {
    it('schreibt VPN-Clients unter clients.vpn.<network_id>.<ip mit Unterstrichen>', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateVpnClients([vpnClient()], false);

        expect(callsOf(ctx, 'createOrUpdateChannel').map(call => call.id)).to.deep.equal(['clients.vpn.net1']);
        expect(deviceIds(ctx)).to.deep.equal(['clients.vpn.net1.10_0_0_5']);
    });

    it('übergibt den Netzwerknamen als Channelnamen', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateVpnClients([vpnClient()], false);

        expect(callsOf(ctx, 'createOrUpdateChannel')[0].args[0]).to.equal('VPN Netz');
    });

    it('ignoriert Einträge, die kein VPN-Client sind', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateVpnClients([vpnClient({ type: 'CLIENT' })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('setzt isOnline auf false, wenn ein VPN-Client offline gemeldet wird', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add('clients.vpn.net1.10_0_0_5.isOnline');

        await ctx.instance.updateVpnClients([vpnClient({ status: 'offline' })], false);

        expect(ctx.stub.states.get('clients.vpn.net1.10_0_0_5.isOnline')).to.equal(false);
    });

    it('legt bei Adapterstart die Channels an und lädt VPN-Clients über die API', async () => {
        const ufn = createFakeUfn({ getVpnUser: () => Promise.resolve([vpnClient()]) });
        const ctx = createMainContext({}, { ufn });

        await ctx.instance.updateVpnClients(null, true);

        expect(callsOf(ctx, 'createOrUpdateChannel').map(call => call.id)).to.deep.equal(['clients', 'clients.vpn', 'clients.vpn.net1']);
        expect(deviceIds(ctx)).to.deep.equal(['clients.vpn.net1.10_0_0_5']);
    });

    it('löscht den VPN-Channel, wenn VPN deaktiviert ist', async () => {
        const ctx = createMainContext({ vpnEnabled: false });
        ctx.stub.objects.add('clients.vpn');
        ctx.stub.objects.add('clients.vpn.net1');

        await ctx.instance.updateVpnClients([vpnClient()], false);

        expect(ctx.stub.objects.has('clients.vpn')).to.equal(false);
        expect(ctx.stub.objects.has('clients.vpn.net1')).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('tut nichts ohne VPN-Daten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateVpnClients(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('überspringt VPN-Clients innerhalb der Debounce-Zeit (Zeitstempel aus cache.vpn)', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.vpn[VPN_IP] = { ip: VPN_IP, timestamp: nowSec() };
        ctx.instance.cache.isOnline[VPN_IP] = { val: true };

        await ctx.instance.updateVpnClients([vpnClient({ last_seen: daysAgo(1) })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('verarbeitet VPN-Clients nach Ablauf der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.vpn[VPN_IP] = { ip: VPN_IP, timestamp: secondsAgo(600), last_seen: daysAgo(1) };
        ctx.instance.cache.isOnline[VPN_IP] = { val: true };

        await ctx.instance.updateVpnClients([vpnClient({ last_seen: daysAgo(1), name: 'Neu' })], false);

        expect(deviceIds(ctx)).to.deep.equal(['clients.vpn.net1.10_0_0_5']);
    });
});

const API_DIR = fixtureDir(latestFixtureVersion() ?? 'none', 'api');
const describeWithFixtures = existsSync(API_DIR) ? describe : describe.skip;

/**
 * Returns the `response` of a recorded API fixture.
 *
 * @param name Name of the fixture file without `.json`.
 */
function responseOf<T>(name: string): T {
    const fixture = JSON.parse(readFileSync(path.join(API_DIR, `${name}.json`), 'utf8')) as { response: T };
    return fixture.response;
}

describeWithFixtures('updateVpnClients mit aufgezeichneten API-Antworten (offline)', () => {
    // Second entry of vpnUsersV2.json: an offline VPN client with an old last_seen.
    const FIXTURE_INDEX = 1;

    it('überspringt einen aufgezeichneten VPN-Client innerhalb der Debounce-Zeit', async () => {
        const target = responseOf<Record<string, unknown>[]>('vpnUsersV2')[FIXTURE_INDEX];
        const ip = String(target.ip);
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.vpn[ip] = { ip, timestamp: nowSec() };
        ctx.instance.cache.isOnline[ip] = { val: false };

        await ctx.instance.updateVpnClients([target], false);

        expect(ctx.iobCalls.filter(call => call.id.includes(ip.replaceAll('.', '_')))).to.have.length(0);
    });

    it('verarbeitet einen aufgezeichneten VPN-Client ohne Cache-Eintrag', async () => {
        const target = responseOf<Record<string, unknown>[]>('vpnUsersV2')[FIXTURE_INDEX];
        const ip = String(target.ip);
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.isOnline[ip] = { val: false };

        await ctx.instance.updateVpnClients([target], false);

        expect(ctx.iobCalls.filter(call => call.id.includes(ip.replaceAll('.', '_')))).to.not.have.length(0);
    });
});

describe('updateIsOnlineState', () => {
    /**
     * Writes the states that `updateIsOnlineState` reads for one client.
     *
     * @param ctx test context
     * @param channel channel of the client, e.g. `clients.users`
     * @param id id of the client, its mac or ip with underscores
     * @param values states of the client
     * @param values.lastSeen value of `last_seen` in seconds
     * @param values.isOnline value of `isOnline`
     * @param values.mac optional value of `mac`
     * @param values.ip optional value of `ip`
     */
    function writeClientStates(ctx: MainContext, channel: string, id: string, values: { lastSeen: number; isOnline: boolean; mac?: string; ip?: string }): void {
        const base = `${channel}.${id}`;
        ctx.stub.states.set(`${base}.last_seen`, values.lastSeen);
        ctx.stub.states.set(`${base}.isOnline`, values.isOnline);
        if (values.mac) {
            ctx.stub.states.set(`${base}.mac`, values.mac);
        }
        if (values.ip) {
            ctx.stub.states.set(`${base}.ip`, values.ip);
        }
    }

    it('setzt isOnline auf false, wenn ein Client länger als clientOfflineTimeout nicht gesehen wurde', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 60 });
        writeClientStates(ctx, 'clients.users', MAC_A, { lastSeen: secondsAgo(120), isOnline: true, mac: MAC_A });

        await ctx.instance.updateIsOnlineState(false);

        expect(ctx.stub.states.get(`clients.users.${MAC_A}.isOnline`)).to.equal(false);
    });

    it('lässt isOnline unverändert, wenn der letzte Kontakt aktuell ist', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 60 });
        writeClientStates(ctx, 'clients.users', MAC_A, { lastSeen: nowSec(), isOnline: true, mac: MAC_A });

        await ctx.instance.updateIsOnlineState(false);

        expect(ctx.stub.states.get(`clients.users.${MAC_A}.isOnline`)).to.equal(true);
    });

    it('setzt isOnline auf false für Gäste nach clientOfflineTimeout', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 60 });
        writeClientStates(ctx, 'clients.guests', MAC_A, { lastSeen: secondsAgo(120), isOnline: true, mac: MAC_A });

        await ctx.instance.updateIsOnlineState(false);

        expect(ctx.stub.states.get(`clients.guests.${MAC_A}.isOnline`)).to.equal(false);
    });

    it('verwendet für VPN-Clients vpnOfflineTimeout, nicht clientOfflineTimeout', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 60, vpnOfflineTimeout: 300 });
        writeClientStates(ctx, 'clients.vpn.net1', '10_0_0_5', { lastSeen: secondsAgo(120), isOnline: true, ip: VPN_IP });

        await ctx.instance.updateIsOnlineState(false);

        expect(ctx.stub.states.get('clients.vpn.net1.10_0_0_5.isOnline')).to.equal(true);
    });

    it('setzt isOnline für VPN-Clients auf false, wenn vpnOfflineTimeout überschritten ist', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 600, vpnOfflineTimeout: 60 });
        writeClientStates(ctx, 'clients.vpn.net1', '10_0_0_5', { lastSeen: secondsAgo(120), isOnline: true, ip: VPN_IP });

        await ctx.instance.updateIsOnlineState(false);

        expect(ctx.stub.states.get('clients.vpn.net1.10_0_0_5.isOnline')).to.equal(false);
    });

    it('schreibt nicht erneut, wenn der Client bereits offline ist', async () => {
        const ctx = createMainContext({ clientOfflineTimeout: 60 });
        writeClientStates(ctx, 'clients.users', MAC_A, { lastSeen: secondsAgo(120), isOnline: false, mac: MAC_A });
        const setState = spyOn(ctx.instance, 'setState');

        await ctx.instance.updateIsOnlineState(false);

        expect(setState.calls).to.have.length(0);
        setState.restore();
    });
});
