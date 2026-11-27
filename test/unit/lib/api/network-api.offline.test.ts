import { expect } from 'chai';
import { errors, MockAgent, type Dispatcher } from 'undici';
import { ApiEndpoints, ApiEndpoints_V2, NetworkApi, type RequestOptions } from '../../../../src/lib/api/network-api.js';
import { NetworkReportInterval, NetworkReportType } from '../../../../src/lib/api/network-types-report-stats.js';
import { SystemLogType } from '../../../../src/lib/api/network-types-system-log.js';
import { createAdapterStub, type AdapterStub } from '../../../../tools/offlineAdapterStub.js';

const BASE = 'https://192.0.2.1:443';
/** Origin as undici normalizes it (default port omitted); MockAgent matches on this. */
const MOCK_ORIGIN = 'https://192.0.2.1';
const DAY_MS = 24 * 3600 * 1000;

/** Response of a faked controller request. */
interface FakeResponse {
    statusCode: number;
    headers?: Record<string, string | string[]>;
    body?: unknown;
    /** Set-Cookie values, stored in the cookie jar like a real response would do. */
    cookies?: string[];
}

interface RecordedRequest {
    method: string;
    url: string;
    body?: string;
}

type Handler = (url: string, method: string) => FakeResponse | Error;

const sitesDefault = { data: [{ name: 'default' }] };

/**
 * Creates an API instance without a connection.
 *
 * @param port
 */
function createApi(port = 443): { api: NetworkApi; stub: AdapterStub } {
    const stub = createAdapterStub();
    const api = new NetworkApi('192.0.2.1', port, 'default', 'user', 'password', stub.adapter);

    return { api, stub };
}

/**
 * Creates an API instance whose `reset()` is disabled, so that no connection pool is created during login flows.
 *
 * @param port
 */
function createLoginApi(port = 443): { api: NetworkApi; stub: AdapterStub } {
    const created = createApi(port);
    created.api.reset = (): void => undefined;

    return created;
}

/**
 * Gives access to private members for setup and white-box assertions.
 *
 * @param api
 */
function internals(api: NetworkApi): Record<string, any> {
    return api;
}

function ok(body: unknown, extra: Partial<FakeResponse> = {}): FakeResponse {
    return { statusCode: 200, body, ...extra };
}

function withCode(error: Error, code: string): Error {
    return Object.assign(error, { code });
}

/**
 * Replaces `retrieve` so that every request is answered by `handler`. Returns the list of recorded requests.
 *
 * @param api API instance whose `retrieve` is replaced.
 * @param handler answers each request by URL and method
 */
function answerWith(api: NetworkApi, handler: Handler): RecordedRequest[] {
    const requests: RecordedRequest[] = [];

    api.retrieve = async (url: string, options: RequestOptions = { method: 'GET' }): Promise<any> => {
        const method = options.method ?? 'GET';
        requests.push({ method, url, body: typeof options.body === 'string' ? options.body : undefined });

        const result = handler(url, method);

        if (result instanceof Error) {
            throw result;
        }

        for (const cookie of result.cookies ?? []) {
            await internals(api).cookieJar.setCookie(cookie, url);
        }

        return { statusCode: result.statusCode, headers: result.headers ?? {}, body: { json: () => Promise.resolve(result.body) } };
    };

    return requests;
}

/**
 * Controller on a self hosted installation.
 *
 * @param url
 * @param method
 */
function classicController(url: string, method: string): FakeResponse {
    if (url === BASE && method === 'GET') {
        return { statusCode: 302, headers: { location: '/manage' } };
    }
    if (url === `${BASE}/api/login` && method === 'POST') {
        return { statusCode: 200, cookies: ['unifises=abc; Path=/'] };
    }
    if (url === `${BASE}/api/self/sites`) {
        return ok(sitesDefault);
    }

    return { statusCode: 404 };
}

/**
 * UniFi OS controller, reachable on port 443.
 *
 * @param url
 * @param method
 */
function unifiOsController(url: string, method: string): FakeResponse {
    if (url === BASE && method === 'GET') {
        return { statusCode: 404 };
    }
    if (url === 'https://192.0.2.1' && method === 'GET') {
        return { statusCode: 200, headers: { 'x-csrf-token': 'csrf-1' } };
    }
    if (url === 'https://192.0.2.1/api/auth/login' && method === 'POST') {
        return { statusCode: 200, headers: { 'x-updated-csrf-token': 'csrf-2' }, cookies: ['TOKEN=abc; Path=/'] };
    }
    if (url === 'https://192.0.2.1/proxy/network/api/self/sites') {
        return ok(sitesDefault);
    }

    return { statusCode: 404 };
}

describe('NetworkApi: Verbindung, Login und Abmeldung (offline)', () => {
    describe('reset und logout', () => {
        it('reset erstellt bei gesetztem Host einen Dispatcher und schließt eine offene WebSocket-Verbindung', async () => {
            const { api } = createApi();
            let closed = false;
            internals(api)._eventsWs = {
                close: (): void => {
                    closed = true;
                },
            };

            api.reset();

            expect(closed).to.equal(true);
            expect(internals(api)._eventsWs).to.equal(null);
            expect(internals(api).dispatcher).to.exist;

            await internals(api).dispatcher.destroy();
        });

        it('reset erstellt ohne Host keinen Dispatcher', () => {
            const stub = createAdapterStub();
            const api = new NetworkApi('', 443, 'default', 'user', 'password', stub.adapter);

            api.reset();

            expect(internals(api).dispatcher).to.equal(undefined);
        });

        it('logout behält den CSRF-Token und setzt den Content-Type', () => {
            const { api } = createLoginApi();
            internals(api).headers = { cookie: 'unifises=abc', 'x-csrf-token': 'csrf-1' };

            api.logout();

            expect(internals(api).headers).to.deep.equal({ 'content-type': 'application/json', 'x-csrf-token': 'csrf-1' });
        });

        it('logout ohne CSRF-Token setzt nur den Content-Type', () => {
            const { api } = createLoginApi();
            internals(api).headers = { cookie: 'unifises=abc' };

            api.logout();

            expect(internals(api).headers).to.deep.equal({ 'content-type': 'application/json' });
        });
    });

    describe('login', () => {
        it('erkennt einen klassischen Controller und liefert true bei Erfolg', async () => {
            const { api, stub } = createLoginApi();
            const requests = answerWith(api, classicController);
            const events: boolean[] = [];
            api.on('login', (success: boolean) => events.push(success));

            expect(await api.login()).to.equal(true);
            expect(api.isUnifiOs).to.equal(false);
            expect(api.controllerUrl).to.equal(BASE);
            expect(events).to.deep.equal([true]);
            expect(requests.map(r => r.url)).to.include(`${BASE}/api/self/sites`);
            expect(stub.errors).to.deep.equal([]);
        });

        it('erkennt UniFi OS auf Port 443 und übernimmt den CSRF-Token der Login-Antwort', async () => {
            const { api } = createLoginApi();
            answerWith(api, unifiOsController);

            expect(await api.login()).to.equal(true);
            expect(api.isUnifiOs).to.equal(true);
            expect(api.controllerUrl).to.equal('https://192.0.2.1');
            expect(internals(api).headers['x-csrf-token']).to.equal('csrf-2');
        });

        it('erkennt UniFi OS auf einem eigenen Port', async () => {
            const { api } = createLoginApi(8443);
            answerWith(api, (url, method) => {
                if (url === 'https://192.0.2.1:8443' && method === 'GET') {
                    return ok(undefined);
                }
                if (url === 'https://192.0.2.1:8443/api/auth/login' && method === 'POST') {
                    return { statusCode: 200, headers: { 'x-csrf-token': 'csrf-port' }, cookies: ['TOKEN=abc; Path=/'] };
                }
                if (url === 'https://192.0.2.1:8443/proxy/network/api/self/sites') {
                    return ok(sitesDefault);
                }

                return { statusCode: 404 };
            });

            expect(await api.login()).to.equal(true);
            expect(api.isUnifiOs).to.equal(true);
            expect(api.controllerUrl).to.equal('https://192.0.2.1:8443');
        });

        it('liefert false und meldet einen Fehler, wenn kein Controller erkannt wird', async () => {
            const { api, stub } = createLoginApi();
            answerWith(api, () => ({ statusCode: 404 }));

            expect(await api.login()).to.equal(false);
            expect(stub.errors.some(message => message.includes('Unable to detect UniFi OS or self hosted controller'))).to.equal(true);
        });

        it('fängt Fehler bei der Erkennung ab und liefert false', async () => {
            const { api, stub } = createLoginApi();
            answerWith(api, () => new Error('boom'));

            expect(await api.login()).to.equal(false);
            expect(stub.errors.some(message => message.includes('boom'))).to.equal(true);
        });

        it('überspringt die Erkennung, wenn der Controller bereits bekannt ist', async () => {
            const { api } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            const requests = answerWith(api, classicController);

            expect(await api.login()).to.equal(true);
            expect(requests[0]).to.include({ method: 'POST', url: `${BASE}/api/login` });
        });

        it('führt bei einem erneuten Login einen echten Login-Request aus, auch wenn eine alte Session existiert', async () => {
            const { api } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            internals(api).headers = { cookie: 'unifises=old', 'x-csrf-token': 'csrf-old' };
            await internals(api).cookieJar.setCookie('unifises=old; Path=/', BASE);
            const requests = answerWith(api, classicController);

            expect(await api.login()).to.equal(true);
            expect(requests[0]).to.include({ method: 'POST', url: `${BASE}/api/login` });
            expect(internals(api).headers['x-csrf-token']).to.equal(undefined);
        });

        it('liefert false und sendet ein login-Event mit false bei ungültigen Zugangsdaten', async () => {
            const { api, stub } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            answerWith(api, (url, method) => (method === 'POST' ? { statusCode: 401 } : classicController(url, method)));
            const events: boolean[] = [];
            api.on('login', (success: boolean) => events.push(success));

            expect(await api.login()).to.equal(false);
            expect(events).to.deep.equal([false]);
            expect(stub.errors).to.deep.equal([]);
        });

        it('liefert false ohne Sitzungscookie und fragt keine Sites ab', async () => {
            const { api } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            const requests = answerWith(api, (url, method) => (method === 'POST' ? ok({}) : classicController(url, method)));

            expect(await api.login()).to.equal(false);
            expect(requests.some(r => r.url.endsWith('/api/self/sites'))).to.equal(false);
        });

        it('liefert false, wenn das Cookie weder unifises noch csrf_token enthält', async () => {
            const { api, stub } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            answerWith(api, (url, method) => (method === 'POST' ? ok({}, { cookies: ['other=1; Path=/'] }) : classicController(url, method)));

            expect(await api.login()).to.equal(false);
            expect(stub.errors.some(message => message.includes('no cookies found'))).to.equal(true);
        });

        it('fängt Fehler beim Login-Request ab und liefert false', async () => {
            const { api, stub } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            answerWith(api, (url, method) => (method === 'POST' ? new Error('login failed') : classicController(url, method)));

            expect(await api.login()).to.equal(false);
            expect(stub.errors.some(message => message.includes('login failed'))).to.equal(true);
        });
    });

    describe('checkSites', () => {
        it('liefert true, wenn die konfigurierte Site vorhanden ist', async () => {
            const { api } = createLoginApi();
            answerWith(api, () => ok({ data: [{ name: 'other' }, { name: 'default' }] }));

            expect(await internals(api).checkSites()).to.equal(true);
        });

        it('liefert false und meldet einen Fehler, wenn die Site fehlt', async () => {
            const { api, stub } = createLoginApi();
            answerWith(api, () => ok({ data: [{ name: 'other' }] }));

            expect(await internals(api).checkSites()).to.equal(false);
            expect(stub.errors.some(message => message.includes('not found on controller'))).to.equal(true);
        });

        it('liefert false, wenn keine Sites abgerufen werden konnten', async () => {
            const { api, stub } = createLoginApi();
            answerWith(api, () => ok({ data: [] }));

            expect(await internals(api).checkSites()).to.equal(false);
            expect(stub.errors.some(message => message.includes('unable to retrieve sites'))).to.equal(true);
        });

        it('fängt Fehler beim Abruf der Sites ab und liefert false', async () => {
            const { api, stub } = createLoginApi();
            api.getSites = (): Promise<undefined> => Promise.reject(new Error('sites failed'));

            expect(await internals(api).checkSites()).to.equal(false);
            expect(stub.errors.some(message => message.includes('sites failed'))).to.equal(true);
        });
    });

    describe('WebSocket-Hilfsfunktionen', () => {
        it('launchEventsWs liefert true, wenn bereits eine Verbindung besteht', async () => {
            const { api } = createLoginApi();
            internals(api).headers.cookie = 'unifises=abc';
            internals(api)._eventsWs = {};
            const requests = answerWith(api, () => ok({}));

            expect(await api.launchEventsWs()).to.equal(true);
            expect(requests).to.deep.equal([]);
        });

        it('launchEventsWs liefert false, wenn die Anmeldung fehlschlägt', async () => {
            const { api } = createLoginApi();
            Object.assign(api, { isControllerDetected: true, controllerUrl: BASE });
            answerWith(api, () => ({ statusCode: 401 }));

            expect(await api.launchEventsWs()).to.equal(false);
            expect(internals(api)._eventsWs).to.not.exist;
        });

        it('launchEventsWs fängt Fehler ab und liefert false', async () => {
            const { api, stub } = createLoginApi();
            Object.assign(api, { loginController: (): Promise<boolean> => Promise.reject(new Error('ws failed')) });

            expect(await api.launchEventsWs()).to.equal(false);
            expect(stub.errors.some(message => message.includes('ws failed'))).to.equal(true);
        });

        it('wsSendPing sendet einen Ping über eine vorhandene Verbindung', () => {
            const { api } = createLoginApi();
            let pings = 0;
            internals(api)._eventsWs = {
                ping: (): void => {
                    pings++;
                },
            };

            api.wsSendPing();

            expect(pings).to.equal(1);
        });

        it('wsSendPing tut nichts ohne Verbindung', () => {
            const { api, stub } = createLoginApi();

            api.wsSendPing();

            expect(stub.errors).to.deep.equal([]);
        });

        it('wsSendPing fängt Fehler beim Ping ab', () => {
            const { api, stub } = createLoginApi();
            internals(api)._eventsWs = {
                ping: (): void => {
                    throw new Error('ping failed');
                },
            };

            api.wsSendPing();

            expect(stub.errors.some(message => message.includes('ping failed'))).to.equal(true);
        });
    });
});

describe('NetworkApi: HTTP-Anfragen über retrieve (MockAgent)', () => {
    const sysinfoPath = '/api/s/default/stat/sysinfo';
    let agent: MockAgent;
    let api: NetworkApi;
    let stub: AdapterStub;

    beforeEach(() => {
        ({ api, stub } = createLoginApi());
        agent = new MockAgent();
        agent.disableNetConnect();
        internals(api).dispatcher = agent;
    });

    afterEach(async () => {
        await agent.close();
    });

    const sysinfoUrl = `${BASE}${sysinfoPath}`;

    it('liefert die Antwort bei Status 200 und speichert alle Set-Cookie-Werte', async () => {
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .reply(
                200,
                { data: [] },
                {
                    headers: { 'set-cookie': ['unifises=abc; Path=/', 'csrf_token=xyz; Path=/'] },
                },
            );

        const response = await api.retrieve(sysinfoUrl);

        expect(response?.statusCode).to.equal(200);
        const cookies = await internals(api).cookieJar.getCookieString(BASE);
        expect(cookies).to.include('unifises=abc');
        expect(cookies).to.include('csrf_token=xyz');
    });

    it('speichert ein einzelnes Set-Cookie als Zeichenkette', async () => {
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .reply(
                200,
                { data: [] },
                {
                    headers: { 'set-cookie': 'unifises=single; Path=/' },
                },
            );

        await api.retrieve(sysinfoUrl);

        expect(await internals(api).cookieJar.getCookieString(BASE)).to.include('unifises=single');
    });

    it('meldet ein 401 bei bestehender Session nicht als falsche Zugangsdaten, sondern als Sitzungsablauf', async () => {
        internals(api).headers = { cookie: 'unifises=abc', 'x-csrf-token': 'csrf-1' };
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).reply(401, {});

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors).to.deep.equal([]);
        expect(internals(api).headers).to.deep.equal({ 'content-type': 'application/json', 'x-csrf-token': 'csrf-1' });
    });

    it('meldet ein 401 auf den Login-Request weiterhin als falsche Zugangsdaten', async () => {
        internals(api).headers = { cookie: 'unifises=abc', 'x-csrf-token': 'csrf-1' };
        agent.get(MOCK_ORIGIN).intercept({ path: '/api/login', method: 'POST' }).reply(401, {});

        expect(await api.retrieve(`${BASE}/api/login`, { method: 'POST' }, { isLogin: true })).to.equal(null);
        expect(stub.errors.some(message => message.includes('Invalid login credentials'))).to.equal(true);
    });

    it('liefert null, meldet den Fehler und loggt bei 401 aus', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).reply(401, {});

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('Invalid login credentials'))).to.equal(true);
        expect(internals(api).headers).to.deep.equal({ 'content-type': 'application/json' });
    });

    it('liefert null und meldet fehlende Berechtigungen bei 403', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).reply(403, {});

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('Insufficient privileges'))).to.equal(true);
    });

    it('liefert bei 302 ohne erkannten Controller die Antwort zurück', async () => {
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .reply(302, '', { headers: { location: '/manage' } });

        const response = await api.retrieve(sysinfoUrl);

        expect(response?.statusCode).to.equal(302);
        expect(stub.errors).to.deep.equal([]);
    });

    it('liefert bei 302 mit erkanntem Controller null und meldet den Statuscode', async () => {
        Object.assign(api, { isControllerDetected: true });
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .reply(302, '', { headers: { location: '/manage' } });

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('302 - Found'))).to.equal(true);
    });

    it('meldet bei 503 eine temporäre Verbindungsstörung', async () => {
        Object.assign(api, { isControllerDetected: true });
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).reply(503, {});

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('temporary'))).to.equal(true);
    });

    it('meldet unbekannte Statuscodes', async () => {
        Object.assign(api, { isControllerDetected: true });
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).reply(418, {});

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('418'))).to.equal(true);
    });

    it('liefert null ohne Fehlerlog bei Verbindungsfehlern während der Erkennung', async () => {
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .replyWithError(withCode(new Error('connect ECONNREFUSED'), 'ECONNREFUSED'));

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors).to.deep.equal([]);
    });

    it('liefert null, wenn der Client bereits zerstört wurde', async () => {
        Object.assign(api, { isControllerDetected: true });
        agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).replyWithError(new errors.ClientDestroyedError());

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors).to.deep.equal([]);
    });

    const failures: Array<[string, () => Error, string, string?]> = [
        ['ECONNREFUSED', () => withCode(new Error('connect ECONNREFUSED'), 'ECONNREFUSED'), 'Connection refused'],
        [
            'EHOSTDOWN als Ursache eines TypeError',
            () => {
                const error = new TypeError('fetch failed');
                return Object.assign(error, { cause: withCode(new Error('connect EHOSTDOWN'), 'EHOSTDOWN') });
            },
            'Connection refused',
        ],
        ['ECONNRESET', () => withCode(new Error('read ECONNRESET'), 'ECONNRESET'), 'connection to Network controller has been reset'],
        ['ENOTFOUND mit Host', () => withCode(new Error('getaddrinfo ENOTFOUND'), 'ENOTFOUND'), 'Hostname or IP address not found: 192.0.2.1'],
        ['unbekannter Fehlercode', () => withCode(new Error('protocol error'), 'EPROTO'), 'Error: EPROTO'],
        ['Fehler ohne Code', () => new Error('plain failure'), '(url:'],
        ['RequestRetryError', () => new errors.RequestRetryError('retry', 500, { headers: null, data: null } as never), 'Unable to connect to the Network controller'],
        ['ConnectTimeoutError', () => new errors.ConnectTimeoutError('timeout'), 'Connection timed out'],
        ['AbortError', () => new DOMException('aborted', 'AbortError'), 'taking too long to respond'],
    ];

    for (const [name, createError, expected] of failures) {
        it(`meldet den Fehler "${name}" und liefert null`, async () => {
            Object.assign(api, { isControllerDetected: true });
            agent.get(MOCK_ORIGIN).intercept({ path: sysinfoPath, method: 'GET' }).replyWithError(createError());

            expect(await api.retrieve(sysinfoUrl)).to.equal(null);
            expect(stub.errors.some(message => message.includes(expected))).to.equal(true);
        });
    }

    it('meldet bei fehlendem Host, dass keine Adresse konfiguriert ist', async () => {
        Object.assign(api, { isControllerDetected: true, host: '' });
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: sysinfoPath, method: 'GET' })
            .replyWithError(withCode(new Error('getaddrinfo ENOTFOUND'), 'ENOTFOUND'));

        expect(await api.retrieve(sysinfoUrl)).to.equal(null);
        expect(stub.errors.some(message => message.includes('No hostname or IP address provided'))).to.equal(true);
    });
});

describe('NetworkApi: checkSession (MockAgent)', () => {
    const selfPath = '/api/self';
    let agent: MockAgent;
    let api: NetworkApi;
    let stub: AdapterStub;

    beforeEach(() => {
        ({ api, stub } = createLoginApi());
        internals(api).headers = { cookie: 'unifises=abc', 'x-csrf-token': 'csrf-1' };
        agent = new MockAgent();
        agent.disableNetConnect();
        internals(api).dispatcher = agent;
    });

    afterEach(async () => {
        await agent.close();
    });

    it('liefert ok, wenn der Controller die Session akzeptiert', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: selfPath, method: 'GET' }).reply(200, {});

        expect(await api.checkSession()).to.equal('ok');
        expect(stub.errors).to.deep.equal([]);
    });

    it('liefert expired bei 401 und meldet keinen Fehler', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: selfPath, method: 'GET' }).reply(401, {});

        expect(await api.checkSession()).to.equal('expired');
        expect(stub.errors).to.deep.equal([]);
    });

    it('liefert error bei einem Serverfehler und verwirft die Session nicht', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: selfPath, method: 'GET' }).reply(503, {});

        expect(await api.checkSession()).to.equal('error');
        expect(internals(api).headers['x-csrf-token']).to.equal('csrf-1');
    });

    it('liefert error bei einem Netzwerkfehler', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: selfPath, method: 'GET' }).replyWithError(new Error('connection reset'));

        expect(await api.checkSession()).to.equal('error');
    });
});

describe('NetworkApi: Ablauf der Session (offline)', () => {
    it('liest den Ablauf aus dem TOKEN-Cookie nach dem Login', async () => {
        const { api } = createLoginApi();
        const expires = new Date(Date.now() + DAY_MS).toUTCString();
        answerWith(api, (url, method) =>
            url === 'https://192.0.2.1/api/auth/login' && method === 'POST'
                ? { statusCode: 200, headers: { 'x-updated-csrf-token': 'csrf-2' }, cookies: [`TOKEN=abc; Path=/; Expires=${expires}`] }
                : unifiOsController(url, method),
        );

        expect(await api.login()).to.equal(true);
        expect(api.getSessionExpiry()).to.equal(Date.parse(expires));
    });

    it('liefert null, wenn das TOKEN-Cookie keinen Ablauf hat', async () => {
        const { api } = createLoginApi();
        answerWith(api, unifiOsController);

        expect(await api.login()).to.equal(true);
        expect(api.getSessionExpiry()).to.equal(null);
    });

    it('setzt den Ablauf beim logout zurück', async () => {
        const { api } = createLoginApi();
        const expires = new Date(Date.now() + DAY_MS).toUTCString();
        answerWith(api, (url, method) =>
            url === 'https://192.0.2.1/api/auth/login' && method === 'POST'
                ? { statusCode: 200, headers: { 'x-updated-csrf-token': 'csrf-2' }, cookies: [`TOKEN=abc; Path=/; Expires=${expires}`] }
                : unifiOsController(url, method),
        );
        await api.login();

        api.logout();

        expect(api.getSessionExpiry()).to.equal(null);
    });
});

describe('NetworkApi: renewSession (MockAgent)', () => {
    const loginPath = '/api/login';
    let agent: MockAgent;
    let api: NetworkApi;
    let stub: AdapterStub;

    beforeEach(() => {
        ({ api, stub } = createLoginApi());
        Object.assign(api, { isControllerDetected: true });
        internals(api).headers = { cookie: 'TOKEN=old', 'x-csrf-token': 'csrf-1' };
        agent = new MockAgent();
        agent.disableNetConnect();
        internals(api).dispatcher = agent;
    });

    afterEach(async () => {
        await agent.close();
    });

    it('verlängert die Session, ohne die WebSocket-Verbindung zu schließen', async () => {
        const expires = new Date(Date.now() + DAY_MS).toUTCString();
        let socketClosed = false;
        const socket = {
            close: (): void => {
                socketClosed = true;
            },
        };
        internals(api)._eventsWs = socket;
        agent
            .get(MOCK_ORIGIN)
            .intercept({ path: loginPath, method: 'POST', body: (body: string) => body.includes('"rememberMe":true') })
            .reply(200, {}, { headers: { 'set-cookie': `TOKEN=new; Path=/; Expires=${expires}`, 'x-updated-csrf-token': 'csrf-2' } });

        expect(await api.renewSession()).to.equal(true);
        expect(socketClosed).to.equal(false);
        expect(internals(api)._eventsWs).to.equal(socket);
        expect(api.getSessionExpiry()).to.equal(Date.parse(expires));
        expect(internals(api).headers['x-csrf-token']).to.equal('csrf-2');
        expect(stub.errors).to.deep.equal([]);
    });

    it('liefert false, wenn der Controller den Login ablehnt', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: loginPath, method: 'POST' }).reply(401, {});

        expect(await api.renewSession()).to.equal(false);
        expect(api.getSessionExpiry()).to.equal(null);
    });

    it('liefert false bei einem Netzwerkfehler', async () => {
        agent.get(MOCK_ORIGIN).intercept({ path: loginPath, method: 'POST' }).replyWithError(new Error('connection reset'));

        expect(await api.renewSession()).to.equal(false);
    });
});

describe('NetworkApi: Anfragen-Helfer (offline)', () => {
    describe('retrievData', () => {
        it('wiederholt die Anfrage, wenn keine Antwort vorliegt', async () => {
            const { api } = createApi();
            let calls = 0;
            api.retrieve = (): Promise<any> => {
                calls++;
                return Promise.resolve(null);
            };

            expect(await api.retrievData(`${BASE}${'/api/s/default/stat/sysinfo'}`)).to.equal(undefined);
            expect(calls).to.equal(2);
        });

        it('wiederholt die Anfrage, wenn der Body kein gültiges JSON ist', async () => {
            const { api, stub } = createApi();
            let calls = 0;
            api.retrieve = (): Promise<any> => {
                calls++;
                return Promise.resolve({ statusCode: 200, body: { json: () => Promise.reject(new Error('bad json')) } });
            };

            expect(await api.retrievData(`${BASE}/api/s/default/stat/sysinfo`)).to.equal(undefined);
            expect(calls).to.equal(2);
            expect(stub.errors.some(message => message.includes('bad json'))).to.equal(true);
        });

        it('wiederholt die Anfrage, wenn der Body leer ist', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok(null));

            expect(await api.retrievData(`${BASE}/api/s/default/stat/sysinfo`)).to.equal(undefined);
            expect(requests).to.have.length(2);
        });
    });

    describe('sendData', () => {
        it('sendet standardmäßig POST mit JSON-Body an den Controller-Pfad', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({}));
            const payload = { mac: '02:00:00:00:00:01' };

            await api.sendData('/api/s/default/cmd/devmgr', payload);

            expect(requests).to.deep.equal([{ method: 'POST', url: `${BASE}/api/s/default/cmd/devmgr`, body: JSON.stringify(payload) }]);
        });

        it('stellt bei UniFi OS den Proxy-Pfad voran', async () => {
            const { api } = createApi();
            api.isUnifiOs = true;
            const requests = answerWith(api, () => ok({}));

            await api.sendData('/api/s/default/cmd/stamgr', {}, 'PUT');

            expect(requests[0]).to.include({ method: 'PUT', url: `${BASE}/proxy/network/api/s/default/cmd/stamgr` });
        });

        it('verwendet vollständige https-URLs unverändert', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({}));

            await api.sendData('https://example.test/api/x', {}, 'GET');

            expect(requests[0]).to.include({ method: 'GET', url: 'https://example.test/api/x' });
        });
    });

    describe('Endpunkt-URLs', () => {
        it('baut die URLs der Legacy-Endpunkte für einen klassischen Controller', () => {
            const { api } = createApi();

            expect(api.getApiEndpoint(ApiEndpoints.self)).to.equal(`${BASE}/api/self`);
            expect(api.getApiEndpoint(ApiEndpoints.backup)).to.equal(`${BASE}/api/backup/download`);
            expect(api.getApiEndpoint(ApiEndpoints.devices)).to.equal(`${BASE}/api/s/default/stat/device`);
            expect(api.getApiEndpoint(ApiEndpoints.deviceRest)).to.equal(`${BASE}/api/s/default/rest/device`);
            expect(api.getApiEndpoint(ApiEndpoints.deviceCommand)).to.equal(`${BASE}/api/s/default/cmd/devmgr`);
            expect(api.getApiEndpoint(ApiEndpoints.clientsActive)).to.equal(`${BASE}/api/s/default/stat/sta`);
            expect(api.getApiEndpoint(ApiEndpoints.clientCommand)).to.equal(`${BASE}/api/s/default/cmd/stamgr`);
            expect(api.getApiEndpoint(ApiEndpoints.wlanConfig)).to.equal(`${BASE}/api/s/default/rest/wlanconf`);
            expect(api.getApiEndpoint(ApiEndpoints.lanConfig)).to.equal(`${BASE}/api/s/default/rest/networkconf`);
            expect(api.getApiEndpoint(ApiEndpoints.firewallGroup)).to.equal(`${BASE}/api/s/default/rest/firewallgroup`);
            expect(api.getApiEndpoint(ApiEndpoints.sysinfo)).to.equal(`${BASE}/api/s/default/stat/sysinfo`);
            expect(api.getApiEndpoint(ApiEndpoints.sites)).to.equal(`${BASE}/api/self/sites`);
        });

        it('verwendet für UniFi OS den Proxy-Pfad und den users/self-Endpunkt', () => {
            const { api } = createApi();
            api.isUnifiOs = true;

            expect(api.getApiEndpoint(ApiEndpoints.self)).to.equal(`${BASE}/api/users/self`);
            expect(api.getApiEndpoint(ApiEndpoints.devices)).to.equal(`${BASE}/proxy/network/api/s/default/stat/device`);
            expect(api.getApiEndpoint(ApiEndpoints.sites)).to.equal(`${BASE}/proxy/network/api/self/sites`);
        });

        it('liefert für alle bekannten Legacy-Endpunkte eine URL', () => {
            const { api } = createApi();

            for (const endpoint of Object.values(ApiEndpoints)) {
                expect(api.getApiEndpoint(endpoint), endpoint).to.match(/^https:\/\/192\.0\.2\.1:443\//);
            }
        });

        it('liefert für unbekannte Legacy-Endpunkte einen leeren String', () => {
            expect(createApi().api.getApiEndpoint('unknown' as ApiEndpoints)).to.equal('');
        });

        it('baut die URLs der V2-Endpunkte', () => {
            const { api } = createApi();

            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.devices)).to.equal(`${BASE}/v2/api/site/default/device`);
            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.clientsHistory)).to.equal(`${BASE}/v2/api/site/default/clients/history`);
            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.networkMembersGroup)).to.equal(`${BASE}/v2/api/site/default/network-members-group`);
            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.info)).to.equal(`${BASE}/v2/api/site/default/info`);
            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.vpnConnections)).to.equal(`${BASE}/v2/api/site/default/vpn/connections`);
        });

        it('liefert für UniFi OS den Proxy-Pfad bei V2-Endpunkten', () => {
            const { api } = createApi();
            api.isUnifiOs = true;

            expect(api.getApiEndpoint_V2(ApiEndpoints_V2.wlanConfig)).to.equal(`${BASE}/proxy/network/v2/api/site/default/wlan/enriched-configuration`);
        });

        it('liefert für nicht unterstützte V2-Endpunkte einen leeren String', () => {
            expect(createApi().api.getApiEndpoint_V2(ApiEndpoints_V2.wanConfig)).to.equal('');
        });
    });

    describe('checkCommandSuccessful', () => {
        it('setzt bei Erfolg den Ack-Status des States', async () => {
            const { api, stub } = createApi();
            const id = 'unifi-network.0.devices.reboot';

            await api.checkCommandSuccessful({ statusCode: 200 } as unknown as Dispatcher.ResponseData<unknown>, '[test]', 'reboot', id);

            expect(stub.states.get(id)).to.deep.equal({ ack: true });
        });

        it('setzt bei Erfolg ohne State-ID keinen State', async () => {
            const { api, stub } = createApi();

            await api.checkCommandSuccessful({ statusCode: 201 } as unknown as Dispatcher.ResponseData<unknown>, '[test]', 'reboot');

            expect(stub.states.size).to.equal(0);
            expect(stub.errors).to.deep.equal([]);
        });

        it('meldet den Statuscode bei einem Fehler', async () => {
            const { api, stub } = createApi();

            await api.checkCommandSuccessful({ statusCode: 500 } as unknown as Dispatcher.ResponseData<unknown>, '[test]', 'reboot', 'id');

            expect(stub.errors.some(message => message.includes('status code: 500'))).to.equal(true);
            expect(stub.states.size).to.equal(0);
        });

        it('meldet "no response", wenn keine Antwort vorliegt', async () => {
            const { api, stub } = createApi();

            await api.checkCommandSuccessful(null, '[test]', 'reboot');

            expect(stub.errors.some(message => message.includes('no response'))).to.equal(true);
        });
    });
});

describe('NetworkApi: Getter mit Parametern und Antwort-Auswertung (offline)', () => {
    describe('URLs mit Parametern', () => {
        it('hängt die MAC-Adresse getrimmt an die Geräteliste an', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ mac: 'a' }] }));

            expect(await api.getDevices(' 02:00:00:00:00:01 ')).to.deep.equal([{ mac: 'a' }]);
            expect(requests[0].url).to.equal(`${BASE}/api/s/default/stat/device/02:00:00:00:00:01`);
        });

        it('fragt die Geräteliste ohne MAC-Adresse ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ mac: 'a' }] }));

            await api.getDevices();

            expect(requests[0].url).to.equal(`${BASE}/api/s/default/stat/device`);
        });

        it('fragt aktive Clients im Legacy-Endpunkt ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ mac: 'c' }] }));

            expect(await api.getClientsActive()).to.deep.equal([{ mac: 'c' }]);
            expect(requests[0].url).to.equal(`${BASE}/api/s/default/stat/sta`);
        });

        it('fragt WLAN-, LAN- und Firewall-Konfigurationen mit ID ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ _id: '1' }] }));

            await api.getWlanConfig(' w1 ');
            await api.getLanConfig('n1');
            await api.getFirewallGroup('g1');

            expect(requests.map(r => r.url)).to.deep.equal([`${BASE}/api/s/default/rest/wlanconf/w1`, `${BASE}/api/s/default/rest/networkconf/n1`, `${BASE}/api/s/default/rest/firewallgroup/g1`]);
        });

        it('fragt die WLAN- und LAN-Konfigurationen der V2-API ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok([{ _id: '1' }]));

            expect(await api.getWlanConfig_V2()).to.deep.equal([{ _id: '1' }]);
            expect(await api.getLanConfig_V2()).to.deep.equal([{ _id: '1' }]);
            expect(requests.map(r => r.url)).to.deep.equal([`${BASE}/v2/api/site/default/wlan/enriched-configuration`, `${BASE}/v2/api/site/default/lan/enriched-configuration`]);
        });

        it('fragt Gerätemodelle mit und ohne Modell ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ model_list: [{ model: 'U7PG2' }] }));

            expect(await api.getDeviceModels_V2('U7PG2')).to.deep.equal([{ model: 'U7PG2' }]);
            await api.getDeviceModels_V2();

            expect(requests.map(r => r.url)).to.deep.equal([`${BASE}/v2/api/site/default/models/U7PG2`, `${BASE}/v2/api/site/default/models`]);
        });

        it('fragt Netzwerk-Mitgliedergruppen und VPN-Benutzer ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok([{ id: 'x' }]));

            expect(await api.getNetworkMemberGroups()).to.deep.equal([{ id: 'x' }]);
            expect(await api.getVpnUser()).to.deep.equal([{ id: 'x' }]);
            expect(requests.map(r => r.url)).to.deep.equal([`${BASE}/v2/api/site/default/network-members-groups`, `${BASE}/v2/api/site/default/vpn/users`]);
        });

        it('fragt Sysinfo, Sites und Clients im Legacy-Endpunkt ab', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ name: 'default', version: '9.0.1' }] }));

            expect(await api.getSysInfo()).to.deep.equal({ name: 'default', version: '9.0.1' });
            expect(await api.getSites()).to.deep.equal([{ name: 'default', version: '9.0.1' }]);
            expect(requests.map(r => r.url)).to.deep.equal([`${BASE}/api/s/default/stat/sysinfo`, `${BASE}/api/self/sites`]);
        });
    });

    describe('leere Antworten', () => {
        it('liefert für alle Getter undefined, wenn keine Daten vorliegen', async () => {
            const { api } = createApi();
            answerWith(api, () => ok({ data: [], model_list: [] }));

            expect(await api.getDevices()).to.equal(undefined);
            expect(await api.getClientsActive()).to.equal(undefined);
            expect(await api.getClientsActive_V2()).to.equal(undefined);
            expect(await api.getClientsHistory_V2()).to.equal(undefined);
            expect(await api.getWlanConfig()).to.equal(undefined);
            expect(await api.getWlanConfig_V2()).to.equal(undefined);
            expect(await api.getLanConfig()).to.equal(undefined);
            expect(await api.getLanConfig_V2()).to.equal(undefined);
            expect(await api.getDeviceModels_V2()).to.equal(undefined);
            expect(await api.getNetworkMemberGroups()).to.equal(undefined);
            expect(await api.getVpnUser()).to.equal(undefined);
            expect(await api.getSysInfo()).to.equal(undefined);
        });
    });

    describe('Fehlerbehandlung der Getter', () => {
        it('alle Getter fangen Fehler ab und liefern undefined', async () => {
            const { api, stub } = createApi();
            api.retrievData = (): Promise<any> => Promise.reject(new Error('boom'));

            const getters: Array<() => Promise<unknown>> = [
                () => api.getDevices(),
                () => api.getDevices_V2(),
                () => api.getClientsActive(),
                () => api.getClientsActive_V2(),
                () => api.getClients(),
                () => api.getClientsHistory_V2(),
                () => api.getWlanConfig(),
                () => api.getWlanConfig_V2(),
                () => api.getLanConfig(),
                () => api.getLanConfig_V2(),
                () => api.getDeviceModels_V2(),
                () => api.getFirewallGroup(),
                () => api.getNetworkMemberGroups(),
                () => api.getVpnUser(),
                () => api.getReportStats(NetworkReportType.site, NetworkReportInterval.daily),
                () => api.getSystemLog(SystemLogType.vpn),
                () => api.getSysInfo(),
                () => api.getControllerVersion(),
                () => api.getSites(),
            ];

            for (const getter of getters) {
                expect(await getter()).to.equal(undefined);
            }
            expect(stub.errors).to.have.length(getters.length);
        });

        it('getBackup liefert null und fängt Fehler ab', async () => {
            const { api, stub } = createApi();
            api.retrievData = (): Promise<any> => Promise.reject(new Error('backup failed'));

            expect(await api.getBackup('full')).to.equal(null);
            expect(stub.errors.some(message => message.includes('backup failed'))).to.equal(true);
        });
    });

    describe('getControllerVersion', () => {
        it('liefert die Version aus den Sysinfo-Daten', async () => {
            const { api } = createApi();
            answerWith(api, () => ok({ data: [{ version: '9.0.114' }] }));

            expect(await api.getControllerVersion()).to.equal('9.0.114');
        });

        it('meldet eine Warnung, wenn keine Version vorliegt', async () => {
            const { api, stub } = createApi();
            answerWith(api, () => ok({ data: [{}] }));

            expect(await api.getControllerVersion()).to.equal(undefined);
            expect(stub.warnings.some(message => message.includes('unable to retrieve controller version'))).to.equal(true);
        });
    });

    describe('getBackup', () => {
        it('ruft das vollständige Backup ohne Zielparameter ab und liefert null', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ backup: true }));

            expect(await api.getBackup('full')).to.equal(null);
            expect(requests[0].url).to.equal(`${BASE}/api/backup/download`);
        });

        it('übergibt den Zieltyp als Parameter', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ backup: true }));

            expect(await api.getBackup('network')).to.equal(null);
            expect(requests[0].url).to.equal(`${BASE}/api/backup/download?target=network`);
        });
    });

    describe('getReportStats', () => {
        it('nutzt für 5 Minuten eine Standardspanne von einer Stunde und den Attribut-Standard', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ time: 1 }] }));
            const end = 1_700_000_000_000;

            const result = await api.getReportStats(NetworkReportType.accessPoint, NetworkReportInterval['5minutes'], undefined, undefined, undefined, end);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(result).to.deep.equal([{ time: 1 }]);
            expect(requests[0]).to.include({ method: 'POST', url: `${BASE}/api/s/default/stat/report/5minutes.ap` });
            expect(payload.attrs).to.deep.equal(['time']);
            expect(payload.end).to.equal(end);
            expect(payload.start).to.equal(end - 3600 * 1000);
        });

        it('nutzt für stündliche Berichte eine Spanne von sieben Tagen und ergänzt die Attribute', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ time: 1 }] }));
            const end = 1_700_000_000_000;

            await api.getReportStats(NetworkReportType.gateway, NetworkReportInterval.hourly, ['cpu', 'mem'], undefined, undefined, end);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(requests[0].url).to.equal(`${BASE}/api/s/default/stat/report/hourly.gw`);
            expect(payload.attrs).to.deep.equal(['time', 'cpu', 'mem']);
            expect(payload.start).to.equal(end - 7 * DAY_MS);
        });

        it('liefert für ALL alle Standardattribute und nutzt bei Tagesberichten eine Woche', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [{ time: 1 }] }));
            const end = 1_700_000_000_000;

            await api.getReportStats(NetworkReportType.site, NetworkReportInterval.daily, 'ALL', undefined, undefined, end);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(payload.attrs).to.include.members(['bytes', 'cpu', 'time', 'wlan-num_sta', 'wlan_bytes']);
            expect(payload.attrs).to.have.length(12);
            expect(payload.start).to.equal(end - 7 * DAY_MS);
        });

        it('nutzt bei Monatsberichten 26 Wochen, übernimmt MAC und liefert undefined ohne Daten', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [] }));
            const end = 1_700_000_000_000;

            const result = await api.getReportStats(NetworkReportType.client, NetworkReportInterval.monthly, undefined, '02:00:00:00:00:01', undefined, end);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(result).to.equal(undefined);
            expect(payload.start).to.equal(end - 26 * 7 * DAY_MS);
            expect(payload.mac).to.equal('02:00:00:00:00:01');
        });

        it('übernimmt eine vorgegebene Startzeit und nutzt bei UniFi OS den Proxy-Pfad', async () => {
            const { api } = createApi();
            api.isUnifiOs = true;
            const requests = answerWith(api, () => ok({ data: [{ time: 1 }] }));

            await api.getReportStats(NetworkReportType.switch, NetworkReportInterval.daily, undefined, undefined, 1000, 2000);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(requests[0].url).to.equal(`${BASE}/proxy/network/api/s/default/stat/report/daily.sw`);
            expect(payload.start).to.equal(1000);
            expect(payload.end).to.equal(2000);
        });
    });

    describe('getSystemLog', () => {
        const cases: Array<[SystemLogType, string]> = [
            [SystemLogType.critical, 'nextAiCategory'],
            [SystemLogType.admin, 'activity_keys'],
            [SystemLogType.updates, 'systemLogDeviceTypes'],
            [SystemLogType.clients, 'clientType'],
            [SystemLogType.threats, 'threatTypes'],
            [SystemLogType.triggers, 'triggerTypes'],
        ];

        for (const [type, key] of cases) {
            it(`ergänzt den Filter "${key}" für den Typ ${type}`, async () => {
                const { api } = createApi();
                const requests = answerWith(api, () => ok({ data: [] }));

                await api.getSystemLog(type);
                const payload = JSON.parse(requests[0].body ?? '{}');

                expect(requests[0].url).to.equal(`${BASE}/v2/api/site/default/system-log/${type}`);
                expect(payload).to.have.property(key);
            });
        }

        it('liefert ohne zusätzlichen Filter nur die Grundparameter', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [] }));

            await api.getSystemLog(SystemLogType.vpn, 2, 5, 1000, 2000);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(Object.keys(payload).sort()).to.deep.equal(['pageNumber', 'pageSize', 'timestampFrom', 'timestampTo']);
            expect(payload).to.include({ timestampFrom: 1000, timestampTo: 2000, pageNumber: 2, pageSize: 5 });
        });

        it('übergibt MAC-Adressen nur beim Gerätelog', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [] }));

            await api.getSystemLog(SystemLogType.devices, 0, 10, 1000, 2000, ['02:00:00:00:00:01']);
            expect(JSON.parse(requests[0].body ?? '{}').macs).to.deep.equal(['02:00:00:00:00:01']);

            await api.getSystemLog(SystemLogType.devices);
            expect(JSON.parse(requests[1].body ?? '{}')).to.not.have.property('macs');
        });

        it('berechnet ohne Zeitraum einen Tag bis jetzt', async () => {
            const { api } = createApi();
            const requests = answerWith(api, () => ok({ data: [] }));

            const before = Date.now();
            await api.getSystemLog(SystemLogType.vpn);
            const payload = JSON.parse(requests[0].body ?? '{}');

            expect(payload.timestampTo).to.be.at.least(before);
            expect(payload.timestampTo - payload.timestampFrom).to.equal(DAY_MS);
            expect(payload.pageNumber).to.equal(0);
            expect(payload.pageSize).to.equal(10);
        });
    });
});
