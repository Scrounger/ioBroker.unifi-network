import { expect } from 'chai';
import { type IobCall, type MainContext, createFakeUfn, createMainContext, spyOn } from '../../tools/mainTestHelpers.js';

const MAC_A = 'aa:bb:cc:dd:ee:01';
const MAC_B = 'aa:bb:cc:dd:ee:02';
const VPN_IP = '10.0.0.5';

/**
 * Current time in seconds, as the controller sends `last_seen`.
 */
function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Time in seconds that lies the given number of days in the past.
 *
 * @param days number of days
 */
function daysAgo(days: number): number {
    return nowSec() - days * 86400;
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
        ip: '192.168.1.20',
        is_guest: false,
        last_seen: nowSec(),
        network_id: 'net1',
        wlanconf_id: 'wlan1',
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
        mac: MAC_A,
        name: 'Phone',
        network_id: 'net1',
        network_name: 'VPN Netz',
        status: 'online',
        last_seen: nowSec(),
        ...overrides,
    };
}

/**
 * Returns the ids of the recorded calls of one method.
 *
 * @param ctx test context
 * @param method method name to filter for
 */
function idsOf(ctx: MainContext, method: IobCall['method']): string[] {
    return ctx.iobCalls.filter(call => call.method === method).map(call => call.id);
}

describe('updateClients (Zweige)', () => {
    it('löscht den Channel clients, wenn Clients, Gäste und VPN deaktiviert sind', async () => {
        const ctx = createMainContext({ clientsEnabled: false, guestsEnabled: false, vpnEnabled: false });
        ctx.stub.objects.add('clients');
        ctx.stub.objects.add(`clients.users.${MAC_A}`);

        await ctx.instance.updateClients(null, true);

        expect(ctx.stub.objects.has('clients')).to.equal(false);
        expect(ctx.stub.objects.has(`clients.users.${MAC_A}`)).to.equal(false);
    });

    it('löscht den Gäste-Channel, wenn Gäste deaktiviert sind', async () => {
        const ctx = createMainContext({ guestsEnabled: false });
        ctx.stub.objects.add('clients.guests');
        ctx.stub.objects.add(`clients.guests.${MAC_B}`);

        await ctx.instance.updateClients(null, false);

        expect(ctx.stub.objects.has('clients.guests')).to.equal(false);
        expect(ctx.stub.objects.has(`clients.guests.${MAC_B}`)).to.equal(false);
    });

    it('schreibt Gäste bei Adapterstart unter clients.guests und zählt sie', async () => {
        const guest = client({ is_guest: true, mac: MAC_B });
        const ctx = createMainContext({}, { ufn: createFakeUfn({ getClientsActive_V2: (): Promise<unknown[]> => Promise.resolve([guest]) }) });

        await ctx.instance.updateClients(null, true);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal([`clients.guests.${MAC_B}`]);
        expect(idsOf(ctx, 'createOrUpdateStates')).to.deep.equal([`clients.guests.${MAC_B}`]);
    });

    it('schreibt einen unveränderten Gast beim zweiten Durchlauf nicht erneut', async () => {
        const guest = client({ is_guest: true, mac: MAC_B });
        const ctx = createMainContext();

        await ctx.instance.updateClients([guest], false);
        await ctx.instance.updateClients([guest], false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal([`clients.guests.${MAC_B}`]);
    });

    it('überspringt Clients innerhalb der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.clients[MAC_A] = { mac: MAC_A, last_seen: nowSec(), timestamp: nowSec() };

        await ctx.instance.updateClients([client({ last_seen: nowSec() })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('entfernt einen Gast, der länger offline ist als deleteGuestsOlderThan', async () => {
        const ctx = createMainContext({ deleteGuestsOlderThan: 1 });
        ctx.stub.objects.add(`clients.guests.${MAC_B}`);

        await ctx.instance.updateClients([client({ is_guest: true, mac: MAC_B, last_seen: daysAgo(5) })], false);

        expect(ctx.stub.objects.has(`clients.guests.${MAC_B}`)).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('ignoriert einen Gast, der länger offline ist und kein Objekt hat', async () => {
        const ctx = createMainContext({ deleteGuestsOlderThan: 1 });

        await ctx.instance.updateClients([client({ is_guest: true, mac: MAC_B, last_seen: daysAgo(5) })], false);

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('entfernt einen Client, der länger offline ist als deleteClientsOlderThan', async () => {
        const ctx = createMainContext({ deleteClientsOlderThan: 1 });
        ctx.stub.objects.add(`clients.users.${MAC_A}`);

        await ctx.instance.updateClients([client({ last_seen: daysAgo(5) })], false);

        expect(ctx.stub.objects.has(`clients.users.${MAC_A}`)).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('ignoriert einen Client, der länger offline ist und kein Objekt hat', async () => {
        const ctx = createMainContext({ deleteClientsOlderThan: 1 });

        await ctx.instance.updateClients([client({ last_seen: daysAgo(5) })], false);

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.errors).to.deep.equal([]);
    });
});

describe('updateVpnClients (Zweige)', () => {
    it('löscht den Channel clients, wenn Clients, Gäste und VPN deaktiviert sind', async () => {
        const ctx = createMainContext({ clientsEnabled: false, guestsEnabled: false, vpnEnabled: false });
        ctx.stub.objects.add('clients');

        await ctx.instance.updateVpnClients(null, true);

        expect(ctx.stub.objects.has('clients')).to.equal(false);
    });

    it('löscht einen geblacklisteten VPN-Client bei Adapterstart', async () => {
        const ctx = createMainContext(
            { clientBlackList: [{ mac: MAC_A }] },
            { ufn: createFakeUfn({ getVpnUser: (): Promise<unknown[]> => Promise.resolve([vpnClient()]) }) },
        );
        ctx.stub.objects.add(`clients.users.${MAC_A}`);

        await ctx.instance.updateVpnClients(null, true);

        expect(ctx.stub.objects.has(`clients.users.${MAC_A}`)).to.equal(false);
        expect(ctx.iobCalls.filter(call => call.method === 'createOrUpdateDevice')).to.have.length(0);
    });

    it('überspringt einen VPN-Client innerhalb der Debounce-Zeit', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.vpn[VPN_IP] = { ip: VPN_IP, last_seen: nowSec(), timestamp: nowSec() };

        await ctx.instance.updateVpnClients([vpnClient({ last_seen: nowSec() })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateClients (Schutz vor fehlenden Cache-Einträgen)', () => {
    it('wirft nicht, wenn der Debounce-Eintrag nur per IP im Cache liegt, und überspringt den Client', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.clients['192.168.1.20'] = { ip: '192.168.1.20', last_seen: nowSec(), timestamp: nowSec() };

        await ctx.instance.updateClients([client({ mac: MAC_A, ip: '192.168.1.20', last_seen: nowSec() })], false);

        expect(ctx.stub.errors).to.deep.equal([]);
        expect(ctx.iobCalls).to.have.length(0);
    });

    it('verarbeitet die übrigen Clients, wenn ein Debounce-Eintrag nur per IP existiert', async () => {
        const ctx = createMainContext({ realTimeApiDebounceTime: 60 });
        ctx.instance.cache.clients['192.168.1.20'] = { ip: '192.168.1.20', last_seen: daysAgo(1), timestamp: daysAgo(1) };

        await ctx.instance.updateClients([
            client({ mac: MAC_A, ip: '192.168.1.20' }),
            client({ mac: MAC_B, ip: '192.168.1.30' }),
        ], false);

        expect(ctx.stub.errors).to.deep.equal([]);
        expect(idsOf(ctx, 'createOrUpdateDevice')).to.have.members([`clients.users.${MAC_A}`, `clients.users.${MAC_B}`]);
    });

    it('legt den isOnline-Eintrag an, wenn der Client im Cache, aber nicht in isOnline steht', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.clients[MAC_A] = { mac: MAC_A, name: 'Alt', last_seen: nowSec() };

        await ctx.instance.updateClients([client({ name: 'Neu' })], false);

        expect(ctx.stub.errors).to.deep.equal([]);
        expect(ctx.instance.cache.isOnline[MAC_A]).to.deep.include({ val: true, wlan_id: 'wlan1', network_id: 'net1' });
    });

    it('schreibt einen unveränderten Client nicht erneut, auch wenn sein Anzeigename vom Rohnamen abweicht', async () => {
        const ctx = createMainContext();
        const withDisplayName = client({ name: 'Rohname', display_name: 'Anzeige' });

        await ctx.instance.updateClients([withDisplayName], false);
        ctx.iobCalls.splice(0);
        await ctx.instance.updateClients([withDisplayName], false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateVpnClients (Schutz vor fehlenden Cache-Einträgen)', () => {
    it('legt den isOnline-Eintrag eines VPN-Clients an, wenn er im Cache, aber nicht in isOnline steht', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.vpn[VPN_IP] = { ip: VPN_IP, name: 'Alt' };

        await ctx.instance.updateVpnClients([vpnClient({ name: 'Neu' })], false);

        expect(ctx.stub.errors).to.deep.equal([]);
        expect(ctx.instance.cache.isOnline[VPN_IP]).to.deep.include({ val: true, network_id: 'net1' });
    });
});

describe('updateSysInfo (Zweige)', () => {
    it('protokolliert die Aktualisierung bei Adapterstart als Info', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true });
        const info = spyOn(ctx.instance.log, 'info');

        try {
            await ctx.instance.updateSysInfo({ version: '10.6.109' }, true);
        } finally {
            info.restore();
        }

        expect(info.calls.some(args => String(args[0]).includes('System Information updated'))).to.equal(true);
        expect(idsOf(ctx, 'createOrUpdateChannel')).to.deep.equal(['info']);
    });
});
