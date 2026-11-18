import { expect } from 'chai';
import { base64 } from '../src/lib/base64.js';
import type { myTreeState } from '../src/lib/myIob.js';
import * as tree from '../src/lib/tree/index.js';
import { type IobCall, type MainContext, createFakeUfn, createMainContext } from '../tools/mainTestHelpers.js';

/** Ids of all sysInfo states as `updateSysInfo` writes them. */
const SYSINFO_IDS: string[] = Object.entries(tree.sysInfo.get()).map(([key, state]) => `${tree.sysInfo.idChannel}.${(state as myTreeState).id || key}`);

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
 * Returns the ids of the recorded calls of one method.
 *
 * @param ctx test context
 * @param method method name to filter for
 */
function idsOf(ctx: MainContext, method: IobCall['method']): string[] {
    return callsOf(ctx, method).map(call => call.id);
}

/**
 * WLAN as the V1 API returns it.
 *
 * @param overrides properties to replace
 */
function wlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { _id: 'w1', name: 'Main', is_guest: false, enabled: true, ...overrides };
}

/**
 * LAN as the V1 API returns it.
 *
 * @param overrides properties to replace
 */
function lan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { _id: 'l1', name: 'LAN', purpose: 'corporate', ...overrides };
}

/**
 * Firewall group as the API returns it.
 *
 * @param overrides properties to replace
 */
function firewallGroup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { _id: 'g1', name: 'Blocked', group_type: 'address-group', group_members: [], ...overrides };
}

describe('updateWlanConfig', () => {
    it('löscht den WLAN-Channel, wenn WLAN deaktiviert ist', async () => {
        const ctx = createMainContext({ wlanConfigEnabled: false });
        ctx.stub.objects.add('wlan');
        ctx.stub.objects.add('wlan.w1');

        await ctx.instance.updateWlanConfig([wlan()], false);

        expect(ctx.stub.objects.has('wlan')).to.equal(false);
        expect(ctx.stub.objects.has('wlan.w1')).to.equal(false);
    });

    it('legt bei Adapterstart den Channel an und lädt die WLANs über die API', async () => {
        const ufn = createFakeUfn({ getWlanConfig_V2: () => Promise.resolve([wlan()]) });
        const ctx = createMainContext({}, { ufn });

        await ctx.instance.updateWlanConfig(null, true);

        expect(idsOf(ctx, 'createOrUpdateChannel')).to.deep.equal(['wlan']);
        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['wlan.w1']);
        expect(callsOf(ctx, 'createOrUpdateDevice')[0].args[0]).to.equal('Main');
    });

    it('wandelt API-V2-Daten in das V1-Format um', async () => {
        const ctx = createMainContext();
        const v2 = { configuration: { _id: 'w1', name: 'Gast' }, details: { is_guest: true }, statistics: {} };

        await ctx.instance.updateWlanConfig([v2], false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['wlan.w1']);
        expect(callsOf(ctx, 'createOrUpdateDevice')[0].args[0]).to.equal('Gast');
    });

    it('überspringt WLANs ohne _id', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateWlanConfig([wlan({ _id: undefined })], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt ein unverändertes WLAN nicht erneut', async () => {
        const ctx = createMainContext();
        const known = wlan();
        ctx.instance.cache.wlan = { w1: known };

        await ctx.instance.updateWlanConfig([known], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('schreibt geänderte Eigenschaften eines bekannten WLANs', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.wlan = { w1: wlan() };

        await ctx.instance.updateWlanConfig([wlan({ enabled: false })], false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['wlan.w1']);
    });

    it('löscht geblacklistete WLANs bei Adapterstart', async () => {
        const ufn = createFakeUfn({ getWlanConfig_V2: () => Promise.resolve([wlan(), wlan({ _id: 'w2', name: 'Other' })]) });
        const ctx = createMainContext({ wlanBlackList: [{ id: 'w2' }] }, { ufn });
        ctx.stub.objects.add('wlan.w2');
        ctx.stub.objects.add('wlan.w2.enabled');

        await ctx.instance.updateWlanConfig(null, true);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['wlan.w1']);
        expect(ctx.stub.objects.has('wlan.w2')).to.equal(false);
        expect(ctx.stub.objects.has('wlan.w2.enabled')).to.equal(false);
    });

    it('verarbeitet bei Whitelist nur die WLANs auf der Liste', async () => {
        const ctx = createMainContext({ wlanIsWhiteList: true, wlanBlackList: [{ id: 'w1' }] });

        await ctx.instance.updateWlanConfig([wlan(), wlan({ _id: 'w2' })], false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['wlan.w1']);
    });

    it('tut nichts ohne Daten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateWlanConfig(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateWlanConnectedClients', () => {
    it('zählt verbundene Clients und Gäste je WLAN und summiert sie', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.wlan = { w1: { is_guest: false }, w2: { is_guest: true } };
        ctx.instance.cache.isOnline = {
            a: { val: true, wlan_id: 'w1' },
            b: { val: true, wlan_id: 'w1' },
            c: { val: false, wlan_id: 'w1' },
            d: { val: true, wlan_id: 'w2' },
        };
        ctx.stub.objects.add('wlan.w1.connected_clients');
        ctx.stub.objects.add('wlan.w2.connected_guests');
        ctx.stub.objects.add('wlan.connected_clients');
        ctx.stub.objects.add('wlan.connected_guests');

        await ctx.instance.updateWlanConnectedClients(false);

        expect(ctx.stub.states.get('wlan.w1.connected_clients')).to.equal(2);
        expect(ctx.stub.states.get('wlan.w2.connected_guests')).to.equal(1);
        expect(ctx.stub.states.get('wlan.connected_clients')).to.equal(2);
        expect(ctx.stub.states.get('wlan.connected_guests')).to.equal(1);
    });

    it('schreibt keine Zähler für Objekte, die nicht existieren', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.wlan = { w1: { is_guest: false } };
        ctx.instance.cache.isOnline = { a: { val: true, wlan_id: 'w1' } };

        await ctx.instance.updateWlanConnectedClients(false);

        expect(ctx.stub.states.has('wlan.w1.connected_clients')).to.equal(false);
        expect(ctx.stub.states.has('wlan.connected_clients')).to.equal(false);
    });

    it('legt bei Adapterstart die globalen Zähler an', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateWlanConnectedClients(true);

        expect(idsOf(ctx, 'createOrUpdateStates')).to.deep.equal(['wlan']);
    });

    it('tut nichts, wenn WLAN deaktiviert ist', async () => {
        const ctx = createMainContext({ wlanConfigEnabled: false });
        ctx.instance.cache.wlan = { w1: { is_guest: false } };
        ctx.instance.cache.isOnline = { a: { val: true, wlan_id: 'w1' } };
        ctx.stub.objects.add('wlan.connected_clients');

        await ctx.instance.updateWlanConnectedClients(true);

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.states.has('wlan.connected_clients')).to.equal(false);
    });
});

describe('updateLanConfig', () => {
    it('löscht den LAN-Channel, wenn LAN deaktiviert ist', async () => {
        const ctx = createMainContext({ lanConfigEnabled: false });
        ctx.stub.objects.add('lan');
        ctx.stub.objects.add('lan.l1');

        await ctx.instance.updateLanConfig([lan()], false);

        expect(ctx.stub.objects.has('lan')).to.equal(false);
        expect(ctx.stub.objects.has('lan.l1')).to.equal(false);
    });

    it('legt bei Adapterstart den Channel an und lädt die LANs über die API', async () => {
        const ufn = createFakeUfn({ getLanConfig_V2: () => Promise.resolve([lan()]) });
        const ctx = createMainContext({}, { ufn });

        await ctx.instance.updateLanConfig(null, true);

        expect(idsOf(ctx, 'createOrUpdateChannel')).to.deep.equal(['lan']);
        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['lan.l1']);
    });

    it('hängt die VLAN-ID an den Namen an', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateLanConfig([lan({ vlan: 20 })], false);

        expect(callsOf(ctx, 'createOrUpdateDevice')[0].args[0]).to.equal('LAN (20)');
    });

    it('verwendet ohne VLAN nur den Namen', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateLanConfig([lan()], false);

        expect(callsOf(ctx, 'createOrUpdateDevice')[0].args[0]).to.equal('LAN');
    });

    it('setzt das Icon für VPN-LANs aus base64', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateLanConfig([lan({ vpn_type: 'wireguard-client' })], false);

        const icon = callsOf(ctx, 'createOrUpdateDevice')[0].args[3];
        expect(base64['wireguard-client']).to.be.a('string');
        expect(icon).to.equal(base64['wireguard-client']);
    });

    it('löscht geblacklistete LANs bei Adapterstart', async () => {
        const ufn = createFakeUfn({ getLanConfig_V2: () => Promise.resolve([lan(), lan({ _id: 'l2', name: 'Other' })]) });
        const ctx = createMainContext({ lanBlackList: [{ id: 'l2' }] }, { ufn });
        ctx.stub.objects.add('lan.l2');

        await ctx.instance.updateLanConfig(null, true);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['lan.l1']);
        expect(ctx.stub.objects.has('lan.l2')).to.equal(false);
    });

    it('tut nichts ohne Daten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateLanConfig(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateLanConnectedClients', () => {
    it('zählt verbundene Clients und Gäste je LAN und summiert sie', async () => {
        const ctx = createMainContext();
        ctx.instance.cache.lan = { l1: { purpose: 'corporate' }, l2: { purpose: 'guest' } };
        ctx.instance.cache.isOnline = {
            a: { val: true, network_id: 'l1' },
            b: { val: false, network_id: 'l1' },
            c: { val: true, network_id: 'l2' },
        };
        ctx.stub.objects.add('lan.l1.connected_clients');
        ctx.stub.objects.add('lan.l2.connected_guests');
        ctx.stub.objects.add('lan.connected_clients');
        ctx.stub.objects.add('lan.connected_guests');

        await ctx.instance.updateLanConnectedClients(false);

        expect(ctx.stub.states.get('lan.l1.connected_clients')).to.equal(1);
        expect(ctx.stub.states.get('lan.l2.connected_guests')).to.equal(1);
        expect(ctx.stub.states.get('lan.connected_clients')).to.equal(1);
        expect(ctx.stub.states.get('lan.connected_guests')).to.equal(1);
    });

    it('legt bei Adapterstart die globalen Zähler an', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateLanConnectedClients(true);

        expect(idsOf(ctx, 'createOrUpdateStates')).to.deep.equal(['lan']);
    });

    it('tut nichts, wenn LAN deaktiviert ist', async () => {
        const ctx = createMainContext({ lanConfigEnabled: false });
        ctx.instance.cache.lan = { l1: { purpose: 'corporate' } };
        ctx.instance.cache.isOnline = { a: { val: true, network_id: 'l1' } };
        ctx.stub.objects.add('lan.connected_clients');

        await ctx.instance.updateLanConnectedClients(true);

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.states.has('lan.connected_clients')).to.equal(false);
    });
});

describe('updateFirewallGroup', () => {
    it('löscht die Firewall-Gruppen, wenn Firewall-Gruppen deaktiviert sind', async () => {
        const ctx = createMainContext({ firewallGroupConfigEnabled: false });
        ctx.stub.objects.add('firewall.groups');
        ctx.stub.objects.add('firewall.groups.g1');

        await ctx.instance.updateFirewallGroup([firewallGroup()], false);

        expect(ctx.stub.objects.has('firewall.groups')).to.equal(false);
        expect(ctx.stub.objects.has('firewall.groups.g1')).to.equal(false);
    });

    it('legt bei Adapterstart den Channel an und lädt die Gruppen über die API', async () => {
        const ufn = createFakeUfn({ getFirewallGroup: () => Promise.resolve([firewallGroup()]) });
        const ctx = createMainContext({}, { ufn });

        await ctx.instance.updateFirewallGroup(null, true);

        expect(idsOf(ctx, 'createOrUpdateChannel')).to.deep.equal(['firewall.groups']);
        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['firewall.groups.g1']);
        expect(callsOf(ctx, 'createOrUpdateDevice')[0].args[0]).to.equal('Blocked');
    });

    it('schreibt eine unveränderte Gruppe nicht erneut', async () => {
        const ctx = createMainContext();
        const known = firewallGroup();
        ctx.instance.cache.firewall = { groups: { g1: known } };

        await ctx.instance.updateFirewallGroup([known], false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('löscht geblacklistete Gruppen bei Adapterstart', async () => {
        const ufn = createFakeUfn({ getFirewallGroup: () => Promise.resolve([firewallGroup(), firewallGroup({ _id: 'g2', name: 'Other' })]) });
        const ctx = createMainContext({ firewallGroupBlackList: [{ id: 'g2' }] }, { ufn });
        ctx.stub.objects.add('firewall.groups.g2');

        await ctx.instance.updateFirewallGroup(null, true);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal(['firewall.groups.g1']);
        expect(ctx.stub.objects.has('firewall.groups.g2')).to.equal(false);
    });

    it('tut nichts ohne Daten', async () => {
        const ctx = createMainContext();

        await ctx.instance.updateFirewallGroup(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('updateSysInfo', () => {
    it('schreibt die Systeminformationen unter info', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true });
        const data = { version: '8.0.0' };

        await ctx.instance.updateSysInfo(data, false);

        expect(idsOf(ctx, 'createOrUpdateStates')).to.deep.equal([tree.sysInfo.idChannel]);
        expect(callsOf(ctx, 'createOrUpdateStates')[0].args[1]).to.deep.equal(data);
    });

    it('legt bei Adapterstart den info-Channel an', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true });

        await ctx.instance.updateSysInfo(null, true);

        expect(idsOf(ctx, 'createOrUpdateChannel')).to.deep.equal([tree.sysInfo.idChannel]);
        expect(ctx.iobCalls.some(call => call.method === 'createOrUpdateStates')).to.equal(false);
    });

    it('schreibt bei normaler Abfrage ohne Daten nichts', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true });

        await ctx.instance.updateSysInfo(null, false);

        expect(ctx.iobCalls).to.have.length(0);
    });

    it('löscht die Systeminformationen, wenn sie deaktiviert sind', async () => {
        const ctx = createMainContext({ systemInformationEnabled: false });
        ctx.stub.objects.add(tree.sysInfo.idChannel);
        SYSINFO_IDS.forEach(id => ctx.stub.objects.add(id));

        await ctx.instance.updateSysInfo({ version: '8.0.0' }, false);

        expect(SYSINFO_IDS.some(id => ctx.stub.objects.has(id))).to.equal(false);
        expect(ctx.iobCalls).to.have.length(0);
    });
});
