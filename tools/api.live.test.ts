import { expect } from 'chai';
import type { NetworkApi } from '../src/lib/api/network-api.js';
import { NetworkReportInterval, NetworkReportType } from '../src/lib/api/network-types-report-stats.js';
import { createLiveApi, describeMessages, getLiveConfig, isListOrEmpty, loginWithRetry, type LiveSession } from './liveHelper.test.js';

const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

describe('UniFi Network Controller - API (live, read-only)', function () {
    this.timeout(30_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
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

        this.timeout(90_000);
        session = createLiveApi(config);
        const loggedIn = await loginWithRetry(session);
        expect(loggedIn, describeMessages(session.messages)).to.equal(true);
    });

    after(() => {
        session?.api.logout();
    });

    it('getSysInfo() returns an object with version', async () => {
        const info = await getApi().getSysInfo();
        expect(info, context()).to.be.an('object');
        expect(info?.version, context()).to.be.a('string').and.not.be.empty;
    });

    it('getControllerVersion() returns a version number', async () => {
        const version = await getApi().getControllerVersion();
        expect(version, context()).to.be.a('string').and.match(/^\d+\.\d+/);
    });

    it('getSites() contains the configured site', async () => {
        const sites = await getApi().getSites();
        expect(sites, context()).to.be.an('array').that.is.not.empty;
        expect(sites?.map((site) => site.name), context()).to.include(getSession().config.site);
    });

    it('getDevices() returns devices with a valid MAC address', async () => {
        const devices = await getApi().getDevices();
        expect(devices, context()).to.satisfy(isListOrEmpty);
        for (const device of devices ?? []) {
            expect(device.mac, context()).to.match(MAC_PATTERN);
        }
    });

    it('getClients() returns clients with a valid MAC address', async () => {
        const clients = await getApi().getClients();
        expect(clients, context()).to.satisfy(isListOrEmpty);
        for (const client of clients ?? []) {
            expect(client.mac, context()).to.match(MAC_PATTERN);
        }
    });

    it('getClientsActive() returns a list or undefined', async () => {
        const clients = await getApi().getClientsActive();
        expect(clients, context()).to.satisfy(isListOrEmpty);
    });

    it('getWlanConfig() returns a list or undefined', async () => {
        const wlans = await getApi().getWlanConfig();
        expect(wlans, context()).to.satisfy(isListOrEmpty);
    });

    it('getLanConfig_V2() returns a list or undefined', async () => {
        const networks = await getApi().getLanConfig_V2();
        expect(networks, context()).to.satisfy(isListOrEmpty);
    });

    it('getFirewallGroup() returns a list or undefined', async () => {
        const groups = await getApi().getFirewallGroup();
        expect(groups, context()).to.satisfy(isListOrEmpty);
    });

    it('getNetworkMemberGroups() returns a list or undefined', async () => {
        const groups = await getApi().getNetworkMemberGroups();
        expect(groups, context()).to.satisfy(isListOrEmpty);
    });

    it('getVpnUser() returns a list or undefined', async () => {
        const users = await getApi().getVpnUser();
        expect(users, context()).to.satisfy(isListOrEmpty);
    });

    it('getReportStats() returns an hourly report of the site', async () => {
        const stats = await getApi().getReportStats(NetworkReportType.site, NetworkReportInterval.hourly);
        expect(stats, context()).to.satisfy(isListOrEmpty);
    });
});
