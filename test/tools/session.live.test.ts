import { expect } from 'chai';
import { once, type EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { createLiveApi, describeMessages, getLiveConfig, loginWithRetry, type LiveSession } from './liveHelper.test.js';

/** `readyState` value of an open `ws` socket. */
const WS_OPEN = 1;

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Resolves with the next occurrence of `event`, or rejects after `timeoutMs`.
 *
 * @param emitter object to listen on
 * @param event event name
 * @param timeoutMs maximum wait time in milliseconds
 */
async function waitForEvent<T = unknown>(emitter: EventEmitter, event: string, timeoutMs: number): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
        const [data] = await once(emitter, event, { signal: abort.signal });
        return data as T;
    } catch {
        throw new Error(`no '${event}' event within ${timeoutMs} ms`);
    } finally {
        clearTimeout(timer);
    }
}

describe('UniFi Network Controller - Session-Erneuerung (live)', function () {
    this.timeout(90_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
        }
        return session;
    };

    const context = (): string => describeMessages(getSession().messages);

    /** The events socket is kept in the private field `_eventsWs` of `NetworkApi`. */
    const getEventsSocket = (): WebSocket | null => (getSession().api as unknown as { _eventsWs: WebSocket | null })._eventsWs;

    before(async function () {
        const config = getLiveConfig();
        if (!config) {
            this.skip();
            return;
        }

        // Own client, so renewing the session does not change the login that the other live files share.
        session = createLiveApi(config);
        expect(await loginWithRetry(getSession()), context()).to.equal(true);
    });

    after(() => {
        session?.api.logout();
    });

    it('login() liefert den Ablauf der Session aus dem TOKEN-Cookie', function () {
        const expiry = getSession().api.getSessionExpiry();
        if (expiry === null) {
            // Controller without a TOKEN cookie, e.g. self hosted. The expiry based renewal does not apply there.
            this.skip();
            return;
        }

        expect(expiry, context()).to.be.greaterThan(Date.now() + ONE_HOUR_MS);
    });

    it('checkSession() bestätigt die frische Session', async () => {
        expect(await getSession().api.checkSession(), context()).to.equal('ok');
    });

    // One renewal only: the controller answers with 429 when the logins follow each other too fast.
    it('renewSession() verlängert die Session und lässt die Events-WebSocket-Verbindung offen', async function () {
        const before = getSession().api.getSessionExpiry();
        if (before === null) {
            this.skip();
            return;
        }

        const started = await getSession().api.launchEventsWs();
        expect(started, context()).to.equal(true);

        const socket = getEventsSocket();
        expect(socket, context()).to.not.be.null;
        if (socket && socket.readyState !== WS_OPEN) {
            await waitForEvent(socket, 'open', 10_000);
        }

        expect(await getSession().api.renewSession(), context()).to.equal(true);

        // Neuer Ablauf, mindestens so spät wie vorher.
        const after = getSession().api.getSessionExpiry();
        expect(after, context()).to.be.a('number');
        expect(after, context()).to.be.at.least(before);
        expect(after, context()).to.be.greaterThan(Date.now() + ONE_HOUR_MS);

        // Same socket object and still open: the renewal must not reset the session.
        expect(getEventsSocket(), context()).to.equal(socket);
        expect(getEventsSocket()?.readyState, context()).to.equal(WS_OPEN);

        expect(await getSession().api.checkSession(), context()).to.equal('ok');

        const pong = waitForEvent(getSession().api, 'pong', 10_000);
        getSession().api.wsSendPing();
        await pong;
    });
});
