import { expect } from 'chai';
import { type Spy, createFakeUfn, createMainContext, spyOn } from '../../tools/mainTestHelpers.js';

const SUB_UPDATES = [
    'updateDevices',
    'updateClients',
    'updateVpnClients',
    'updateLanConfig',
    'updateLanConnectedClients',
    'updateWlanConfig',
    'updateWlanConnectedClients',
    'updateFirewallGroup',
    'updateSysInfo',
] as const;

/**
 * Replaces all sub-updates of `updateRealTimeApiData` and `updateApiData` with recorders.
 *
 * @param instance adapter instance under test
 */
function spyOnSubUpdates(instance: Record<string, any>): Record<string, Spy> {
    const spies: Record<string, Spy> = {};
    for (const name of SUB_UPDATES) {
        spies[name] = spyOn(instance, name);
    }
    return spies;
}

describe('updateRealTimeApiData', () => {
    it('ruft alle Teil-Updates mit den Daten der API und dem Adapterstart-Flag auf', async () => {
        const ufn = createFakeUfn({
            getDevices_V2: () => Promise.resolve({ network_devices: [{ mac: 'aa:bb' }] }),
            getClientsHistory_V2: () => Promise.resolve([{ mac: 'cc' }]),
        });
        const ctx = createMainContext({}, { ufn });
        const spies = spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateRealTimeApiData(true);

        expect(spies.updateDevices.calls[0][0]).to.deep.equal([{ mac: 'aa:bb' }]);
        expect(spies.updateDevices.calls[0][1]).to.equal(true);
        expect(spies.updateClients.calls).to.have.length(2);
        expect(spies.updateClients.calls[0][0]).to.equal(null);
        expect(spies.updateClients.calls[1][0]).to.deep.equal([{ mac: 'cc' }]);
        expect(spies.updateClients.calls[1][2]).to.equal(true);
        expect(spies.updateVpnClients.calls[0][0]).to.equal(null);
        expect(spies.updateLanConfig.calls[0][0]).to.equal(null);
        expect(spies.updateWlanConfig.calls[0][0]).to.equal(null);
        expect(spies.updateLanConnectedClients.calls[0][0]).to.equal(true);
        expect(spies.updateWlanConnectedClients.calls[0][0]).to.equal(true);
    });

    it('aktualisiert Firewall-Gruppen, wenn Firewall-Gruppen aktiv sind', async () => {
        const ctx = createMainContext({ firewallGroupConfigEnabled: true, firewallRuleConfigEnabled: false });
        const spies = spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateRealTimeApiData(false);

        expect(spies.updateFirewallGroup.calls).to.have.length(1);
        expect(spies.updateFirewallGroup.calls[0][1]).to.equal(false);
    });

    it('aktualisiert Firewall-Gruppen auch, wenn nur Firewall-Regeln aktiv sind', async () => {
        const ctx = createMainContext({ firewallGroupConfigEnabled: false, firewallRuleConfigEnabled: true });
        const spies = spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateRealTimeApiData(true);

        expect(spies.updateFirewallGroup.calls).to.have.length(1);
        expect(ctx.iobCalls.some(call => call.method === 'createOrUpdateChannel' && call.id === 'firewall')).to.equal(true);
    });

    it('legt bei Adapterstart den firewall-Channel an', async () => {
        const ctx = createMainContext({ firewallGroupConfigEnabled: true });
        spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateRealTimeApiData(true);

        expect(ctx.iobCalls.some(call => call.method === 'createOrUpdateChannel' && call.id === 'firewall')).to.equal(true);
    });

    it('löscht den firewall-Channel, wenn Firewall-Regeln und -Gruppen deaktiviert sind', async () => {
        const ctx = createMainContext({ firewallGroupConfigEnabled: false, firewallRuleConfigEnabled: false });
        const spies = spyOnSubUpdates(ctx.instance);
        ctx.stub.objects.add('firewall');
        ctx.stub.objects.add('firewall.groups');
        ctx.stub.objects.add('firewall.groups.g1');

        await ctx.instance.updateRealTimeApiData(false);

        expect(spies.updateFirewallGroup.calls).to.have.length(0);
        expect(ctx.stub.objects.has('firewall')).to.equal(false);
        expect(ctx.stub.objects.has('firewall.groups.g1')).to.equal(false);
    });
});

describe('updateApiData', () => {
    it('setzt info.lastApiPoll auf null, wenn die Systeminformationen deaktiviert sind', async () => {
        const ctx = createMainContext({ systemInformationEnabled: false });
        spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateApiData(false);

        expect(ctx.stub.states.has('info.lastApiPoll')).to.equal(true);
        expect(ctx.stub.states.get('info.lastApiPoll')).to.equal(null);
    });

    it('plant den nächsten Abruf mit dem konfigurierten Intervall und setzt info.lastApiPoll', async () => {
        const ctx = createMainContext({ systemInformationEnabled: true, apiUpdateInterval: 45 });
        spyOnSubUpdates(ctx.instance);
        const timeout = spyOn(ctx.instance, 'setTimeout');

        await ctx.instance.updateApiData(false);

        expect(timeout.calls).to.have.length(1);
        expect(timeout.calls[0][1]).to.equal(45_000);
        expect(ctx.stub.states.get('info.lastApiPoll')).to.be.a('number');
    });

    it('übergibt die Systeminformationen der API an updateSysInfo', async () => {
        const ufn = createFakeUfn({ getSysInfo: () => Promise.resolve({ version: '8.0.0' }) });
        const ctx = createMainContext({ systemInformationEnabled: false }, { ufn });
        const spies = spyOnSubUpdates(ctx.instance);

        await ctx.instance.updateApiData(true);

        expect(spies.updateSysInfo.calls[0][0]).to.deep.equal({ version: '8.0.0' });
        expect(spies.updateSysInfo.calls[0][1]).to.equal(true);
    });
});

describe('checkImageDownload', () => {
    it('setzt das Bild auf null und aktualisiert das Gerät, wenn keine URL mehr vorhanden ist', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add('devices.dev1.image');

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', '');

        expect(ctx.stub.states.get('devices.dev1.image')).to.equal(null);
        expect(ctx.iobCalls.some(call => call.method === 'createOrUpdateDevice' && call.id === 'devices.dev1')).to.equal(true);
    });

    it('tut nichts, wenn keine URL vorhanden ist und kein Bild-Objekt existiert', async () => {
        const ctx = createMainContext();

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', '');

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.states.has('devices.dev1.image')).to.equal(false);
    });

    it('lädt das Bild nicht erneut, wenn URL und Bild unverändert sind', async () => {
        const ctx = createMainContext();
        const download = spyOn(ctx.instance, 'downloadImage');
        ctx.stub.objects.add('devices.dev1.imageUrl');
        ctx.stub.states.set('devices.dev1.imageUrl', 'https://example.com/a.png');
        ctx.stub.states.set('devices.dev1.image', 'data:image/png;base64,AAA');

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', 'https://example.com/a.png');

        expect(download.calls).to.have.length(0);
    });

    it('lädt das Bild neu, wenn sich die URL geändert hat', async () => {
        const ctx = createMainContext();
        const download = spyOn(ctx.instance, 'downloadImage');
        ctx.stub.objects.add('devices.dev1.imageUrl');
        ctx.stub.states.set('devices.dev1.imageUrl', 'https://example.com/old.png');
        ctx.stub.states.set('devices.dev1.image', 'data:image/png;base64,AAA');

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', 'https://example.com/new.png');

        expect(download.calls).to.have.length(1);
        expect(download.calls[0][0]).to.equal('https://example.com/new.png');
    });

    it('lädt das Bild neu, wenn kein Bild-State vorhanden ist', async () => {
        const ctx = createMainContext();
        const download = spyOn(ctx.instance, 'downloadImage');
        ctx.stub.objects.add('devices.dev1.imageUrl');
        ctx.stub.states.set('devices.dev1.imageUrl', 'https://example.com/a.png');

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', 'https://example.com/a.png');

        expect(download.calls).to.have.length(1);
    });

    it('lädt das Bild nicht, wenn weder URL-Objekt noch Bild-Objekt existieren', async () => {
        const ctx = createMainContext();
        const download = spyOn(ctx.instance, 'downloadImage');

        await ctx.instance.checkImageDownload('devices.dev1.imageUrl', 'https://example.com/a.png');

        expect(download.calls).to.have.length(0);
    });
});

describe('updateDevicesImages', () => {
    it('tut nichts, wenn der Gerätebild-Download deaktiviert ist', async () => {
        const ctx = createMainContext({ deviceImageDownload: false });

        await ctx.instance.updateDevicesImages();

        expect(ctx.iobCalls).to.have.length(0);
        expect(ctx.stub.objects.size).to.equal(0);
        expect(ctx.stub.states.size).to.equal(0);
    });
});
