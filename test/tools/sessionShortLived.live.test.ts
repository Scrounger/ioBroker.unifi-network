import { expect } from 'chai';
import { ApiEndpoints, type NetworkApi, type Nullable } from '../../src/lib/api/network-api.js';
import { createLiveApi, describeMessages, getLiveConfig, loginWithRetry, type LiveSession } from './liveHelper.test.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Internal state of `NetworkApi`, needed to log in with `rememberMe` disabled. The adapter always uses `rememberMe: true`. */
interface ApiInternals {
    headers: Record<string, string>;
    readSessionExpiry(): Nullable<number>;
}

type ApiResponse = Awaited<ReturnType<NetworkApi['retrieve']>>;

/**
 * Live check of a short-lived session. With `rememberMe: false` the controller issues a TOKEN cookie that expires after about
 * two hours, so the expiry based renewal can be tested without waiting a day. The adapter itself is not changed: the login
 * with `rememberMe: false` is sent by this test, the renewal uses the adapter's `renewSession()`.
 */
describe('UniFi Network Controller - kurzlebige Session (live)', function () {
    this.timeout(90_000);

    let session: LiveSession | undefined;
    let shortLivedExpiry: number | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
        }
        return session;
    };

    const context = (): string => describeMessages(getSession().messages);

    const internals = (): ApiInternals => getSession().api as unknown as ApiInternals;

    before(async function () {
        const config = getLiveConfig();
        if (!config) {
            this.skip();
            return;
        }

        // Own client, so the other live files keep their login.
        session = createLiveApi(config);
        expect(await loginWithRetry(getSession()), context()).to.equal(true);
    });

    after(() => {
        session?.api.logout();
    });

    it('Login mit rememberMe false liefert eine Session von etwa 2 Stunden', async () => {
        const { api, config } = getSession();

        const response: ApiResponse = await api.retrieve(
            api.getApiEndpoint(ApiEndpoints.login),
            {
                body: JSON.stringify({ username: config.user, password: config.password, rememberMe: false }),
                method: 'POST',
            },
            { isLogin: true },
        );
        if (!response) {
            throw new Error(`short-lived login failed. ${context()}`);
        }
        await response.body.dump();

        // The controller sends the CSRF token with the login, the following requests need it.
        const rawCsrfToken = response.headers['x-updated-csrf-token'] ?? response.headers['x-csrf-token'];
        const csrfToken = Array.isArray(rawCsrfToken) ? rawCsrfToken[0] : rawCsrfToken;
        if (csrfToken) {
            internals().headers['x-csrf-token'] = csrfToken;
        }

        const expiry = internals().readSessionExpiry();
        if (expiry === null) {
            throw new Error(`TOKEN cookie without expiry after rememberMe=false login. ${context()}`);
        }
        shortLivedExpiry = expiry;

        const now = Date.now();
        expect(expiry - now, context()).to.be.within(30 * 60 * 1000, 3 * ONE_HOUR_MS);
        expect(await getSession().api.checkSession(), context()).to.equal('ok');
    });

    it('renewSession() aus der kurzlebigen Session verlängert auf die Standard-Laufzeit', async () => {
        if (shortLivedExpiry === undefined) {
            throw new Error(`no short-lived session from the previous test. ${context()}`);
        }

        expect(await getSession().api.renewSession(), context()).to.equal(true);

        // renewSession() logs in with rememberMe true, so the new expiry is much later than the short one.
        const renewed = getSession().api.getSessionExpiry();
        expect(renewed, context()).to.be.a('number');
        expect(renewed, context()).to.be.greaterThan(shortLivedExpiry + 6 * ONE_HOUR_MS);
        expect(await getSession().api.checkSession(), context()).to.equal('ok');
    });
});
