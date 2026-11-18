import { expect } from 'chai';
import { messageHandler } from '../src/lib/messageHandler.js';
import { type MainContext, type Spy, createMainContext, spyOn } from '../tools/mainTestHelpers.js';

const NS = 'unifi-network.0';
const EXTERNAL_FROM = 'system.adapter.admin.0';
const INTERNAL_FROM = `system.adapter.${NS}`;

/** Restore functions of spies on shared objects, executed after each test. */
const restores: Array<() => void> = [];

afterEach(() => {
    restores.splice(0).forEach(restore => restore());
});

/**
 * Spies on a shared object and registers the restore for `afterEach`.
 *
 * @param target object that owns the method
 * @param method name of the method
 */
function spyShared(target: object, method: string): Spy {
    const spy = spyOn(target, method);
    restores.push(spy.restore);
    return spy;
}

/**
 * Creates an ioBroker state object.
 *
 * @param val state value
 * @param ack acknowledged flag
 * @param from source of the change
 */
function state(val: unknown, ack: boolean, from: string = INTERNAL_FROM): Record<string, unknown> {
    return { val, ack, from, ts: 0, lc: 0 };
}

/**
 * Registers a recording write function for an external state change.
 *
 * @param ctx test context
 * @param writeValKey key in `statesWithWriteFunction`, e.g. `devices.led`
 */
function recordWriteFunction(ctx: MainContext, writeValKey: string): unknown[][] {
    const calls: unknown[][] = [];
    ctx.instance.myIob.statesWithWriteFunction[writeValKey] = (...args: unknown[]): Promise<void> => {
        calls.push(args);
        return Promise.resolve();
    };
    return calls;
}

describe('onStateChange', () => {
    describe('interne Änderungen', () => {
        it('aktualisiert den Online-Status eines VPN-Clients und die Zähler', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.isOnline = { '10.0.0.5': { val: false } };
            ctx.instance.cache.vpn = { '10.0.0.5': { wlanconf_id: 'w1', network_id: 'l1' } };
            const wlanCount = spyOn(ctx.instance, 'updateWlanConnectedClients');
            const lanCount = spyOn(ctx.instance, 'updateLanConnectedClients');

            await ctx.instance.onStateChange(`${NS}.clients.vpn.10_0_0_5.isOnline`, state(true, true));

            expect(ctx.instance.cache.isOnline['10.0.0.5']).to.deep.equal({ val: true, wlan_id: 'w1', network_id: 'l1' });
            expect(wlanCount.calls).to.have.length(1);
            expect(lanCount.calls).to.have.length(1);
        });

        it('ändert nichts, wenn der Online-Status unverändert ist', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.isOnline = { '10.0.0.5': { val: true } };
            const wlanCount = spyOn(ctx.instance, 'updateWlanConnectedClients');
            const lanCount = spyOn(ctx.instance, 'updateLanConnectedClients');

            await ctx.instance.onStateChange(`${NS}.clients.vpn.10_0_0_5.isOnline`, state(true, true));

            expect(wlanCount.calls).to.have.length(0);
            expect(lanCount.calls).to.have.length(0);
        });

        it('startet den Download des Client-Bildes bei geänderter imageUrl', async () => {
            const ctx = createMainContext({ clientImageDownload: true });
            const download = spyOn(ctx.instance, 'downloadImage');
            const url = 'https://example.com/client.png';

            await ctx.instance.onStateChange(`${NS}.clients.users.aa_bb_cc.imageUrl`, state(url, true));

            expect(download.calls).to.have.length(1);
            expect(download.calls[0][0]).to.equal(url);
            expect(download.calls[0][1]).to.deep.equal([`${NS}.clients.users.aa_bb_cc`]);
        });

        it('startet den Download des Geräte-Bildes bei geänderter imageUrl', async () => {
            const ctx = createMainContext({ deviceImageDownload: true });
            const download = spyOn(ctx.instance, 'downloadImage');

            await ctx.instance.onStateChange(`${NS}.devices.aa_bb.imageUrl`, state('https://example.com/device.png', true));

            expect(download.calls).to.have.length(1);
            expect(download.calls[0][1]).to.deep.equal([`${NS}.devices.aa_bb`]);
        });

        it('startet keinen Download, wenn der Client-Bild-Download deaktiviert ist', async () => {
            const ctx = createMainContext({ clientImageDownload: false });
            const download = spyOn(ctx.instance, 'downloadImage');

            await ctx.instance.onStateChange(`${NS}.clients.users.aa_bb_cc.imageUrl`, state('https://example.com/client.png', true));

            expect(download.calls).to.have.length(0);
        });

        it('ignoriert andere interne Änderungen', async () => {
            const ctx = createMainContext();
            const download = spyOn(ctx.instance, 'downloadImage');

            await ctx.instance.onStateChange(`${NS}.info.lastApiPoll`, state(123, true));

            expect(download.calls).to.have.length(0);
            expect(ctx.iobCalls).to.have.length(0);
        });
    });

    describe('externe Änderungen', () => {
        it('ruft die Schreibfunktion für einen Client-State auf', async () => {
            const ctx = createMainContext();
            const client = { name: 'Phone' };
            ctx.instance.cache.clients = { aa_bb_cc: client };
            const calls = recordWriteFunction(ctx, 'clients.users.blocked');
            const id = `${NS}.clients.users.aa_bb_cc.blocked`;

            await ctx.instance.onStateChange(id, state(true, false, EXTERNAL_FROM));

            expect(calls).to.have.length(1);
            expect(calls[0][0]).to.equal(true);
            expect(calls[0][1]).to.equal(id);
            expect(calls[0][2]).to.deep.equal(client);
        });

        it('ruft die Schreibfunktion für einen Geräte-State auf', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.devices = { dev1: { name: 'AP' } };
            const calls = recordWriteFunction(ctx, 'devices.led');

            await ctx.instance.onStateChange(`${NS}.devices.dev1.led`, state(false, false, EXTERNAL_FROM));

            expect(calls).to.have.length(1);
            expect(calls[0][2]).to.deep.equal({ name: 'AP' });
        });

        it('ruft die Schreibfunktion für einen WLAN-State auf', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.wlan = { w1: { name: 'Main' } };
            const calls = recordWriteFunction(ctx, 'wlan.enabled');

            await ctx.instance.onStateChange(`${NS}.wlan.w1.enabled`, state(false, false, EXTERNAL_FROM));

            expect(calls).to.have.length(1);
            expect(calls[0][2]).to.deep.equal({ name: 'Main' });
        });

        it('ruft die Schreibfunktion für einen LAN-State auf', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.lan = { l1: { name: 'LAN' } };
            const calls = recordWriteFunction(ctx, 'lan.enabled');

            await ctx.instance.onStateChange(`${NS}.lan.l1.enabled`, state(false, false, EXTERNAL_FROM));

            expect(calls).to.have.length(1);
            expect(calls[0][2]).to.deep.equal({ name: 'LAN' });
        });

        it('ruft die Schreibfunktion für einen Firewall-Gruppen-State auf', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.firewall = { groups: { g1: { name: 'Blocked' } } };
            const calls = recordWriteFunction(ctx, 'firewall.groups.enabled');

            await ctx.instance.onStateChange(`${NS}.firewall.groups.g1.enabled`, state(false, false, EXTERNAL_FROM));

            expect(calls).to.have.length(1);
            expect(calls[0][2]).to.deep.equal({ name: 'Blocked' });
        });

        it('ignoriert externe Änderungen mit ack = true', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.devices = { dev1: { name: 'AP' } };
            const calls = recordWriteFunction(ctx, 'devices.led');

            await ctx.instance.onStateChange(`${NS}.devices.dev1.led`, state(false, true, EXTERNAL_FROM));

            expect(calls).to.have.length(0);
        });

        it('übergeht States ohne Schreibfunktion ohne Fehler', async () => {
            const ctx = createMainContext();
            ctx.instance.cache.devices = { dev1: { name: 'AP' } };

            await ctx.instance.onStateChange(`${NS}.devices.dev1.unknown`, state(1, false, EXTERNAL_FROM));

            expect(ctx.iobCalls).to.have.length(0);
        });
    });

    it('verarbeitet gelöschte States ohne Änderungen', async () => {
        const ctx = createMainContext();
        const wlanCount = spyOn(ctx.instance, 'updateWlanConnectedClients');

        await ctx.instance.onStateChange(`${NS}.wlan.w1.enabled`, null);

        expect(wlanCount.calls).to.have.length(0);
        expect(ctx.iobCalls).to.have.length(0);
    });
});

describe('onMessage', () => {
    const cases: Array<{ command: string; target: object; method: string }> = [
        { command: 'deviceList', target: messageHandler.device, method: 'list' },
        { command: 'deviceStateList', target: messageHandler.device, method: 'stateList' },
        { command: 'clientList', target: messageHandler.client, method: 'list' },
        { command: 'clientStateList', target: messageHandler.client, method: 'stateList' },
        { command: 'wlanList', target: messageHandler.wlan, method: 'list' },
        { command: 'wlanStateList', target: messageHandler.wlan, method: 'stateList' },
        { command: 'lanList', target: messageHandler.lan, method: 'list' },
        { command: 'lanStateList', target: messageHandler.lan, method: 'stateList' },
        { command: 'firewallGroupList', target: messageHandler.firewall.group, method: 'list' },
        { command: 'firewallGroupStateList', target: messageHandler.firewall.group, method: 'stateList' },
    ];

    for (const { command, target, method } of cases) {
        it(`leitet '${command}' an ${method}() weiter`, async () => {
            const ctx = createMainContext();
            const handler = spyShared(target, method);
            const message = { command, message: {} };

            await ctx.instance.onMessage(message);

            expect(handler.calls).to.have.length(1);
            expect(handler.calls[0][0]).to.equal(message);
            expect(handler.calls[0][1]).to.equal(ctx.instance);
        });
    }

    it('ignoriert unbekannte Befehle', async () => {
        const ctx = createMainContext();
        const handler = spyShared(messageHandler.device, 'list');

        await ctx.instance.onMessage({ command: 'unknownCommand', message: {} });

        expect(handler.calls).to.have.length(0);
    });

    it('ignoriert Nachrichten, die kein Objekt sind', async () => {
        const ctx = createMainContext();
        const handler = spyShared(messageHandler.device, 'list');

        await ctx.instance.onMessage('deviceList');

        expect(handler.calls).to.have.length(0);
    });
});
