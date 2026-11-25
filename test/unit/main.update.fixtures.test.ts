import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureDir, latestFixtureVersion, requireFixtures } from '../../tools/fixtureVersions.js';
import { type IobCall, type MainContext, createMainContext } from '../../tools/mainTestHelpers.js';

const API_DIR = fixtureDir(latestFixtureVersion() ?? 'none', 'api');

/**
 * Returns the `response` of a recorded API fixture. A fresh copy is parsed on each call, because the update methods modify their input.
 *
 * @param name Name of the fixture file without `.json`.
 */
function responseOf<T>(name: string): T {
    const fixture = JSON.parse(readFileSync(path.join(API_DIR, `${name}.json`), 'utf8')) as { response: T };
    return fixture.response;
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

/**
 * Removes the recorded calls so that the next assertion only sees new writes.
 *
 * @param ctx test context
 */
function clearCalls(ctx: MainContext): void {
    ctx.iobCalls.splice(0);
}

interface FixtureClient {
    mac?: string;
    is_guest?: boolean;
}

describe('Fixture-Tests mit aufgezeichneten API-Antworten', () => {
    before(() => {
        requireFixtures(API_DIR);
    });

    it('updateDevices schreibt jedes Gerät der devicesV2-Antwort und entfernt vap_table', async () => {
        const ctx = createMainContext();
        const devices = structuredClone(responseOf<{ network_devices: { mac: string; vap_table?: unknown }[] }>('devicesV2').network_devices);
        expect(devices.some(dev => dev.vap_table !== undefined), 'Fixture enthält vap_table').to.equal(true);

        await ctx.instance.updateDevices(devices, true);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.have.members(devices.map(dev => `devices.${dev.mac}`));
        expect(devices.every(dev => dev.vap_table === undefined)).to.equal(true);
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('updateClients schreibt jeden aktiven Client der clientsActiveV2-Antwort unter users oder guests', async () => {
        const ctx = createMainContext();
        const clients = structuredClone(responseOf<(FixtureClient & Record<string, unknown>)[]>('clientsActiveV2'));
        const expected = [...new Set(clients.filter(c => c.mac).map(c => `${c.is_guest ? 'clients.guests' : 'clients.users'}.${c.mac}`))];

        await ctx.instance.updateClients(clients, false);

        expect([...new Set(idsOf(ctx, 'createOrUpdateDevice'))]).to.have.members(expected);
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('updateClients schreibt bei unveränderter Antwort keinen Client erneut', async () => {
        // deepDiff compares against the display name the cache stores, so no client differs on the second run.
        const ctx = createMainContext();
        const clients = responseOf<(FixtureClient & Record<string, unknown>)[]>('clientsActiveV2');
        await ctx.instance.updateClients(structuredClone(clients), false);
        clearCalls(ctx);

        await ctx.instance.updateClients(structuredClone(clients), false);

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('updateClients markiert die clientsHistoryV2-Einträge als offline', async () => {
        const ctx = createMainContext();
        const history = structuredClone(responseOf<(FixtureClient & Record<string, unknown>)[]>('clientsHistoryV2'));
        const macs = [...new Set(history.filter(c => c.mac).map(c => c.mac as string))];

        await ctx.instance.updateClients(history, false, true);

        expect(macs.length).to.be.greaterThan(0);
        for (const mac of macs) {
            const isOnline = ctx.instance.cache.isOnline[mac];
            expect(isOnline, `isOnline für ${mac}`).to.not.equal(undefined);
            expect(isOnline.val).to.equal(false);
        }
    });

    it('updateWlanConfig schreibt jede WLAN-Konfiguration der wlanConfigV2-Antwort', async () => {
        const ctx = createMainContext();
        const wlans = structuredClone(responseOf<{ configuration: { _id: string } }[]>('wlanConfigV2'));

        await ctx.instance.updateWlanConfig(wlans, false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.have.members(wlans.map(wlan => `wlan.${wlan.configuration._id}`));
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('updateLanConfig wandelt die V2-Antwort um und schreibt nur geänderte LANs erneut', async () => {
        const ctx = createMainContext();
        const lans = structuredClone(responseOf<{ configuration: { _id: string; name: string } }[]>('lanConfigV2'));
        const ids = lans.map(lan => `lan.${lan.configuration._id}`);

        await ctx.instance.updateLanConfig(lans, false);
        expect(idsOf(ctx, 'createOrUpdateDevice')).to.have.members(ids);
        clearCalls(ctx);

        // unchanged data: nothing is written again
        await ctx.instance.updateLanConfig(structuredClone(lans), false);
        expect(ctx.iobCalls).to.have.length(0);

        // one changed name: exactly this LAN is written again
        const changed = structuredClone(lans);
        changed[0].configuration.name = 'Geändertes LAN';
        await ctx.instance.updateLanConfig(changed, false);

        expect(idsOf(ctx, 'createOrUpdateDevice')).to.deep.equal([ids[0]]);
    });

    it('updateFirewallGroup schreibt jede Firewall-Gruppe der firewallGroup-Antwort', async () => {
        const ctx = createMainContext();
        const groups = structuredClone(responseOf<{ data: { _id: string; name: string }[] }>('firewallGroup').data);

        await ctx.instance.updateFirewallGroup(groups, false);

        const written = [...idsOf(ctx, 'createOrUpdateDevice'), ...idsOf(ctx, 'createOrUpdateStates')];
        for (const group of groups) {
            expect(written).to.include(`firewall.groups.${group._id}`);
        }
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('updateSysInfo schreibt die Systeminformationen aus der sysinfo-Antwort', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true });
        const info = structuredClone(responseOf<{ data: Record<string, unknown>[] }>('sysinfo').data[0]);

        await ctx.instance.updateSysInfo(info, false);

        const stateCall = ctx.iobCalls.find(call => call.method === 'createOrUpdateStates');
        expect(stateCall?.id).to.equal('info');
        expect((stateCall?.args[1] as { version?: string }).version).to.equal(info.version);
    });
});
