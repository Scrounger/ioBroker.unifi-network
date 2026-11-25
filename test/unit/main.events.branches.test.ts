import { expect } from 'chai';
import startAdapter from '../../src/main.js';
import { type MainInstance, createMainContext, spyOn } from '../../tools/mainTestHelpers.js';

const MAC_A = 'aa:bb:cc:dd:ee:01';
const NAMESPACE = 'unifi-network.0';

describe('onNetworkMessage (Client-Events ohne :sync)', () => {
    it('leitet Client-Events ohne :sync an onNetworkClientEvent weiter', async () => {
        const ctx = createMainContext();
        const clientEvent = spyOn(ctx.instance, 'onNetworkClientEvent');
        const sync = spyOn(ctx.instance, 'updateClients');
        const event = { meta: { message: 'client:connected' }, data: [] };

        await ctx.instance.onNetworkMessage(event);

        expect(clientEvent.calls).to.deep.equal([[event]]);
        expect(sync.calls).to.have.length(0);
    });
});

describe('onNetworkEvent (Zweige)', () => {
    it('meldet Client-Events ohne Implementierung als Debug-Eintrag', async () => {
        const ctx = createMainContext();
        const debug = spyOn(ctx.instance.log, 'debug');

        try {
            await ctx.instance.onNetworkEvent({ meta: { message: 'events' }, data: [{ key: 'EVT_WG_AuthorizationEnded' }] });
        } finally {
            debug.restore();
        }

        expect(debug.calls.some(args => String(args[0]).includes("client event 'Authorization' not implemented"))).to.equal(true);
        expect(ctx.stub.warnings).to.deep.equal([]);
    });

    it('meldet unbekannte Events als Warnung', async () => {
        const ctx = createMainContext();

        await ctx.instance.onNetworkEvent({ meta: { message: 'events' }, data: [{ key: 'EVT_UNBEKANNT' }] });

        expect(ctx.stub.warnings.some(msg => msg.includes('not implemented event'))).to.equal(true);
    });

    it('ignoriert Events ohne data', async () => {
        const ctx = createMainContext();

        await ctx.instance.onNetworkEvent({ meta: { message: 'events' } });

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.errors).to.deep.equal([]);
        expect(ctx.stub.warnings).to.deep.equal([]);
    });
});

describe('onStateChange (Änderungen von außen ohne Schreibfunktion)', () => {
    const cases: { name: string; id: string; prefix: string }[] = [
        { name: 'Client', id: `${NAMESPACE}.clients.users.${MAC_A}.foo`, prefix: 'client state' },
        { name: 'WLAN', id: `${NAMESPACE}.wlan.wlan1.foo`, prefix: 'wlan state' },
        { name: 'LAN', id: `${NAMESPACE}.lan.lan1.foo`, prefix: 'lan state' },
        { name: 'Firewall-Gruppe', id: `${NAMESPACE}.firewall.groups.group1.foo`, prefix: 'firewall group state' },
    ];

    for (const testCase of cases) {
        it(`protokolliert eine Änderung an einem ${testCase.name}-State ohne Schreibfunktion`, async () => {
            const ctx = createMainContext();
            const debug = spyOn(ctx.instance.log, 'debug');

            try {
                await ctx.instance.onStateChange(testCase.id, { val: 1, ack: false, from: 'system.adapter.admin.0', ts: 0, lc: 0 });
            } finally {
                debug.restore();
            }

            expect(debug.calls.some(args => String(args[0]).includes(`${testCase.prefix} ${testCase.id} changed: 1 (ack = false) -> not implemented`))).to.equal(true);
            expect(ctx.iobCalls).to.have.length(0);
        });
    }
});

describe('onStateChange (isOnline ohne Eintrag im Cache)', () => {
    it('legt den isOnline-Eintrag an, statt zu werfen', async () => {
        const ctx = createMainContext();

        await ctx.instance.onStateChange(`${NAMESPACE}.clients.users.${MAC_A}.isOnline`, { val: true, ack: true, from: `system.adapter.${NAMESPACE}`, ts: 0, lc: 0 });

        expect(ctx.stub.errors).to.deep.equal([]);
        expect(ctx.instance.cache.isOnline[MAC_A]).to.deep.include({ val: true });
    });
});

describe('Listener des Adapters', () => {
    it('leitet Netzwerk-Nachrichten und Pong-Antworten an die Handler weiter', async () => {
        const instance = startAdapter({}) as unknown as MainInstance;
        const message = spyOn(instance, 'onNetworkMessage');
        const pong = spyOn(instance, 'onPongMessage');
        const event = { meta: { message: 'device:sync' }, data: [] };

        await instance.eventListener(event);
        await instance.pongListener();

        expect(message.calls).to.deep.equal([[event]]);
        expect(pong.calls).to.have.length(1);
    });
});
