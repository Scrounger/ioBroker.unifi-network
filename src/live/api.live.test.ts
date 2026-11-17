import { expect } from 'chai';
import type { NetworkApi } from '../lib/api/network-api.js';
import { NetworkReportInterval, NetworkReportType } from '../lib/api/network-types-report-stats.js';
import { createLiveApi, describeMessages, getLiveConfig, isListOrEmpty, type LiveSession } from './liveHelper.test.js';

const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

describe('UniFi Network Controller - API (live, read-only)', function () {
    this.timeout(30_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('Keine Session vorhanden');
        }
        return session;
    };

    const getApi = (): NetworkApi => getSession().api;
    const context = (): string => describeMessages(getSession().messages);

    before(async function () {
        const config = getLiveConfig();
        if (!config) {
            this.skip();
            return;
        }

        session = createLiveApi(config);
        const loggedIn = await session.api.login();
        expect(loggedIn, describeMessages(session.messages)).to.equal(true);
    });

    after(() => {
        session?.api.logout();
    });

    it('getSysInfo() liefert ein Objekt mit Version', async () => {
        const info = await getApi().getSysInfo();
        expect(info, context()).to.be.an('object');
        expect(info?.version, context()).to.be.a('string').and.not.be.empty;
    });

    it('getControllerVersion() liefert eine Versionsnummer', async () => {
        const version = await getApi().getControllerVersion();
        expect(version, context()).to.be.a('string').and.match(/^\d+\.\d+/);
    });

    it('getSites() enthält die konfigurierte Site', async () => {
        const sites = await getApi().getSites();
        expect(sites, context()).to.be.an('array').that.is.not.empty;
        expect(sites?.map((site) => site.name), context()).to.include(getSession().config.site);
    });

    it('getDevices() liefert Geräte mit gültiger MAC-Adresse', async () => {
        const devices = await getApi().getDevices();
        expect(devices, context()).to.satisfy(isListOrEmpty);
        for (const device of devices ?? []) {
            expect(device.mac, context()).to.match(MAC_PATTERN);
        }
    });

    it('getClients() liefert Clients mit gültiger MAC-Adresse', async () => {
        const clients = await getApi().getClients();
        expect(clients, context()).to.satisfy(isListOrEmpty);
        for (const client of clients ?? []) {
            expect(client.mac, context()).to.match(MAC_PATTERN);
        }
    });

    it('getClientsActive() liefert eine Liste oder undefined', async () => {
        const clients = await getApi().getClientsActive();
        expect(clients, context()).to.satisfy(isListOrEmpty);
    });

    it('getWlanConfig() liefert eine Liste oder undefined', async () => {
        const wlans = await getApi().getWlanConfig();
        expect(wlans, context()).to.satisfy(isListOrEmpty);
    });

    it('getLanConfig_V2() liefert eine Liste oder undefined', async () => {
        const networks = await getApi().getLanConfig_V2();
        expect(networks, context()).to.satisfy(isListOrEmpty);
    });

    it('getFirewallGroup() liefert eine Liste oder undefined', async () => {
        const groups = await getApi().getFirewallGroup();
        expect(groups, context()).to.satisfy(isListOrEmpty);
    });

    it('getNetworkMemberGroups() liefert eine Liste oder undefined', async () => {
        const groups = await getApi().getNetworkMemberGroups();
        expect(groups, context()).to.satisfy(isListOrEmpty);
    });

    it('getVpnUser() liefert eine Liste oder undefined', async () => {
        const users = await getApi().getVpnUser();
        expect(users, context()).to.satisfy(isListOrEmpty);
    });

    it('getReportStats() liefert einen Stundenreport der Site', async () => {
        const stats = await getApi().getReportStats(NetworkReportType.site, NetworkReportInterval.hourly);
        expect(stats, context()).to.satisfy(isListOrEmpty);
    });
});
