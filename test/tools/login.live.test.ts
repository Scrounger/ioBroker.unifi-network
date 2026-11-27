import { expect } from 'chai';
import { createLiveApi, describeMessages, getSharedLogin, type LiveSession } from './liveHelper.test.js';

describe('UniFi Network Controller - Login (live, read-only)', function () {
    this.timeout(30_000);

    let session: LiveSession | undefined;
    let sharedLoggedIn = false;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
        }
        return session;
    };

    // Uses the login that all live files share. A separate login here would add to the HTTP 429 rate limit.
    // No logout in this file: the other live files need the session. The root hook in liveHelper logs it out.
    before(async function () {
        this.timeout(90_000);
        const shared = await getSharedLogin();
        if (!shared) {
            this.skip();
            return;
        }
        session = shared.session;
        sharedLoggedIn = shared.loggedIn;
    });

    it('login() returns true', () => {
        expect(sharedLoggedIn, describeMessages(getSession().messages)).to.equal(true);
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
        expect(
            sites?.map(site => site.name),
            describeMessages(messages),
        ).to.include(config.site);
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
