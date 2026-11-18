import { expect } from 'chai';
import { createLiveApi, describeMessages, getLiveConfig, type LiveSession } from './liveHelper.test.js';

describe('UniFi Network Controller - Login (live, read-only)', function () {
    this.timeout(30_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('Keine Session vorhanden');
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

    it('login() liefert true', async () => {
        const loggedIn = await getSession().api.login();
        expect(loggedIn, describeMessages(getSession().messages)).to.equal(true);
    });

    it('erkennt die Controller-URL', () => {
        const { api, config, messages } = getSession();
        expect(api.controllerUrl, describeMessages(messages)).to.be.a('string').and.include(config.host);
        expect(api.isUnifiOs, describeMessages(messages)).to.be.a('boolean');
    });

    it('die konfigurierte Site existiert', async () => {
        const { api, config, messages } = getSession();
        const sites = await api.getSites();
        expect(sites, describeMessages(messages)).to.be.an('array');
        expect(sites?.map((site) => site.name), describeMessages(messages)).to.include(config.site);
    });

    it('nach logout() ist ein erneutes login() möglich', async () => {
        const { api, messages } = getSession();
        api.logout();
        const loggedIn = await api.login();
        expect(loggedIn, describeMessages(messages)).to.equal(true);
    });

    it('falsches Passwort wird abgelehnt (nur mit LIVE_NEGATIVE_TESTS=1)', async function () {
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
