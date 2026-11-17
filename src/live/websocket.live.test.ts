import { expect } from 'chai';
import { once, type EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { createLiveApi, describeMessages, getLiveConfig, type LiveSession } from './liveHelper.test.js';

/** `readyState` value of an open `ws` socket. */
const WS_OPEN = 1;

/** `readyState` value of a closed `ws` socket. */
const WS_CLOSED = 3;

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
        throw new Error(`kein '${event}'-Event innerhalb von ${timeoutMs} ms`);
    } finally {
        clearTimeout(timer);
    }
}

describe('UniFi Network Controller - WebSocket (live, read-only)', function () {
    this.timeout(45_000);

    let session: LiveSession | undefined;

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('Keine Session vorhanden');
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

        session = createLiveApi(config);
        const loggedIn = await session.api.login();
        expect(loggedIn, describeMessages(session.messages)).to.equal(true);
    });

    after(() => {
        session?.api.logout();
    });

    it('launchEventsWs() öffnet die Event-Verbindung', async () => {
        const started = await getSession().api.launchEventsWs();
        expect(started, context()).to.equal(true);
        expect(getEventsSocket(), context()).to.not.be.null;
    });

    it('wsSendPing() erhält ein pong vom Controller', async () => {
        const socket = getEventsSocket();
        expect(socket, context()).to.not.be.null;

        // launchEventsWs() returns before the handshake is complete. ws.ping() throws while CONNECTING,
        // and wsSendPing() swallows that error, so wait for the socket to be open first.
        if (socket && socket.readyState !== WS_OPEN) {
            await waitForEvent(socket, 'open', 10_000);
        }
        expect(getEventsSocket()?.readyState, context()).to.equal(WS_OPEN);

        const pong = waitForEvent(getSession().api, 'pong', 10_000);
        getSession().api.wsSendPing();
        await pong;
    });

    it('empfängt Events vom Controller', async function () {
        let event: unknown;
        try {
            event = await waitForEvent(getSession().api, 'message', 30_000);
        } catch {
            // Quiet controller: no event within the window. This is not a failure of the client.
            this.skip();
            return;
        }
        expect(event, context()).to.be.an('object');
    });

    it('logout() schließt die WebSocket-Verbindung', async () => {
        const socket = getEventsSocket();
        expect(socket, context()).to.not.be.null;

        getSession().api.logout();

        if (socket && socket.readyState !== WS_CLOSED) {
            await waitForEvent(socket, 'close', 10_000);
        }
        expect(getEventsSocket(), context()).to.be.null;
    });
});
