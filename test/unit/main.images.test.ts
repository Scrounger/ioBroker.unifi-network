import { expect } from 'chai';
import { type Dispatcher, MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { createMainContext } from '../../tools/mainTestHelpers.js';

const HOST = 'https://images.example.test';
const DEVICE_CHANNEL = 'devices.aa:bb:cc:dd:ee:10';
const PUBLIC_JSON_PATH = '/fingerprint/ui/public.json';
const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const IMAGE_DATA_URL = `data:image/png;base64,${IMAGE_BYTES.toString('base64')}`;

let agent: MockAgent;
let originalDispatcher: Dispatcher;

beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
});

afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await agent.close();
});

describe('downloadImage (HTTP gemockt)', () => {
    it('schreibt das Bild als Data-URL in den Bild-State und aktualisiert das Gerät', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);
        ctx.stub.objects.add(DEVICE_CHANNEL);
        agent.get(HOST).intercept({ path: '/a.png', method: 'GET' }).reply(200, IMAGE_BYTES, { headers: { 'content-type': 'image/png' } });

        await ctx.instance.downloadImage(`${HOST}/a.png`, [DEVICE_CHANNEL]);

        expect(ctx.stub.states.get(`${DEVICE_CHANNEL}.image`)).to.equal(IMAGE_DATA_URL);
        expect(ctx.iobCalls.filter(call => call.method === 'createOrUpdateDevice').map(call => call.id)).to.deep.equal([DEVICE_CHANNEL]);
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('übernimmt einen SVG-Content-Type mit Zusatz wie image/svg+xml; charset=utf-8', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);
        agent.get(HOST).intercept({ path: '/a.svg', method: 'GET' }).reply(200, IMAGE_BYTES, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });

        await ctx.instance.downloadImage(`${HOST}/a.svg`, [DEVICE_CHANNEL]);

        expect(ctx.stub.states.get(`${DEVICE_CHANNEL}.image`)).to.equal(`data:image/svg+xml;base64,${IMAGE_BYTES.toString('base64')}`);
    });

    it('protokolliert einen Fehler und schreibt nichts bei einem fremden Content-Type', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);
        agent.get(HOST).intercept({ path: '/a.html', method: 'GET' }).reply(200, '<html></html>', { headers: { 'content-type': 'text/html' } });

        await ctx.instance.downloadImage(`${HOST}/a.html`, [DEVICE_CHANNEL]);

        expect(ctx.stub.errors.some(message => message.includes('unexpected content-type "text/html"'))).to.equal(true);
        expect(ctx.stub.states.has(`${DEVICE_CHANNEL}.image`)).to.equal(false);
    });

    it('protokolliert einen Fehler bei HTTP 404 und schreibt nichts', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);
        agent.get(HOST).intercept({ path: '/missing.png', method: 'GET' }).reply(404, 'not found');

        await ctx.instance.downloadImage(`${HOST}/missing.png`, [DEVICE_CHANNEL]);

        expect(ctx.stub.errors.some(message => message.includes('API endpoint access error: 404 - Not Found'))).to.equal(true);
        expect(ctx.stub.states.has(`${DEVICE_CHANNEL}.image`)).to.equal(false);
    });

    it('fängt einen Netzwerkfehler ab und protokolliert ihn mit MAC und URL', async () => {
        const ctx = createMainContext();
        agent.get(HOST).intercept({ path: '/broken.png', method: 'GET' }).replyWithError(new Error('connection reset'));

        await ctx.instance.downloadImage(`${HOST}/broken.png`, [DEVICE_CHANNEL]);

        expect(ctx.stub.errors.some(message => message.includes('[downloadImage]') && message.includes('connection reset') && message.includes(`${HOST}/broken.png`))).to.equal(true);
    });

    it('lädt nichts, wenn keine URL übergeben wird', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);

        await ctx.instance.downloadImage(null, [DEVICE_CHANNEL]);

        expect(ctx.stub.states.size).to.equal(0);
        expect(ctx.stub.errors).to.deep.equal([]);
    });
});

describe('checkImageDownload (HTTP gemockt)', () => {
    it('lädt das Bild, wenn es noch kein Bild-URL-Objekt gibt, aber ein Bild-State existiert', async () => {
        const ctx = createMainContext();
        ctx.stub.objects.add(`${DEVICE_CHANNEL}.image`);
        agent.get(HOST).intercept({ path: '/new.png', method: 'GET' }).reply(200, IMAGE_BYTES, { headers: { 'content-type': 'image/png' } });

        await ctx.instance.checkImageDownload(`${DEVICE_CHANNEL}.imageUrl`, `${HOST}/new.png`);

        expect(ctx.stub.states.get(`${DEVICE_CHANNEL}.image`)).to.equal(IMAGE_DATA_URL);
    });

    it('protokolliert einen Fehler, wenn die Objektprüfung fehlschlägt', async () => {
        const ctx = createMainContext();
        ctx.instance.objectExists = (): Promise<never> => Promise.reject(new Error('objects broken'));

        await ctx.instance.checkImageDownload(`${DEVICE_CHANNEL}.imageUrl`, `${HOST}/a.png`);

        expect(ctx.stub.errors.some(message => message.includes('[checkImageDownload]:'))).to.equal(true);
    });
});

describe('updateDevicesImages (HTTP gemockt)', () => {
    /**
     * Context with deviceImageDownload enabled and the object creation that the handler calls before the request.
     */
    function imageContext(): ReturnType<typeof createMainContext> {
        return createMainContext({ deviceImageDownload: true }, { setObjectNotExistsAsync: (): Promise<void> => Promise.resolve() });
    }

    it('schreibt die öffentlichen Gerätedaten in devices.publicData', async () => {
        const ctx = imageContext();
        const body = { devices: { U7PG2: { name: 'U7 Pro Wall' } } };
        agent.get('https://static.ui.com').intercept({ path: PUBLIC_JSON_PATH, method: 'GET' }).reply(200, JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

        await ctx.instance.updateDevicesImages();

        expect(ctx.stub.states.get('devices.publicData')).to.equal(JSON.stringify(body));
        expect(ctx.stub.errors).to.deep.equal([]);
    });

    it('schreibt keine Daten, wenn die Antwort kein devices-Feld enthält', async () => {
        const ctx = imageContext();
        agent.get('https://static.ui.com').intercept({ path: PUBLIC_JSON_PATH, method: 'GET' }).reply(200, JSON.stringify({ other: true }), { headers: { 'content-type': 'application/json' } });

        await ctx.instance.updateDevicesImages();

        expect(ctx.stub.states.has('devices.publicData')).to.equal(false);
    });

    it('protokolliert einen Fehler bei HTTP 500', async () => {
        const ctx = imageContext();
        agent.get('https://static.ui.com').intercept({ path: PUBLIC_JSON_PATH, method: 'GET' }).reply(500, 'error');

        await ctx.instance.updateDevicesImages();

        expect(ctx.stub.errors.some(message => message.includes('API endpoint access error: 500 - Internal Server Error'))).to.equal(true);
        expect(ctx.stub.states.has('devices.publicData')).to.equal(false);
    });

    it('fängt einen Netzwerkfehler ab und protokolliert ihn', async () => {
        const ctx = imageContext();
        agent.get('https://static.ui.com').intercept({ path: PUBLIC_JSON_PATH, method: 'GET' }).replyWithError(new Error('dns failed'));

        await ctx.instance.updateDevicesImages();

        expect(ctx.stub.errors.some(message => message.includes('[updateDevicesImages]:') && message.includes('dns failed'))).to.equal(true);
    });
});
