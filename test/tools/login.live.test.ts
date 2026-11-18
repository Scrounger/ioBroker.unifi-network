import { expect } from 'chai';
import { createLiveApi, describeMessages, getLiveConfig, loginWithRetry, type LiveSession } from './liveHelper.test.js';

describe('UniFi Network Controller - Login (live, read-only)', function () {
    this.timeout(30_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
        }
        return session;
    };

    before(function () {
        const config = getLiveConfig();
        if (!config) {
            this.skip();
            return;
        }
        session = createLiveApi(config);
    });

    after(() => {
        session?.api.logout();
    });

    it('login() returns true', async () => {
        const loggedIn = await loginWithRetry(getSession());
        expect(loggedIn, describeMessages(getSession().messages)).to.equal(true);
    });

    it('detects the controller URL', () => {
        const { api, config, messages } = getSession();
        expect(api.controllerUrl, describeMessages(messages)).to.be.a('string').and.include(config.host);
        expect(api.isUnifiOs, describeMessages(messages)).to.be.a('boolean');
    });

    it('the configured site exists', async () => {
        const { api, config, messages } = getSession();
        const sites = await api.getSites();
        expect(sites, describeMessages(messages)).to.be.an('array');
        expect(sites?.map((site) => site.name), describeMessages(messages)).to.include(config.site);
    });

    it('login() works again after logout()', async () => {
        const current = getSession();
        current.api.logout();
        const loggedIn = await loginWithRetry(current);
        expect(loggedIn, describeMessages(current.messages)).to.equal(true);
    });

    it('wrong password is rejected (only with LIVE_NEGATIVE_TESTS=1)', async function () {
        // Opt-in: repeated wrong logins can lock the account on the controller.
        if (process.env.LIVE_NEGATIVE_TESTS !== '1') {
            this.skip();
            return;
        }

        const { config } = getSession();
        const wrong = createLiveApi({ ...config, password: `${config.password}-wrong` });
        try {
            const loggedIn = await wrong.api.login();
            expect(loggedIn, describeMessages(wrong.messages)).to.equal(false);
        } finally {
            wrong.api.logout();
        }
    });
});
