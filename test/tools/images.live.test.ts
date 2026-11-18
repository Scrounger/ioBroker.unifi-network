import { expect } from 'chai';
import { request } from 'undici';
import type { NetworkDeviceModels } from '../../src/lib/api/network-types-device-models.js';
import { createMainContext } from '../../tools/mainTestHelpers.js';
import { describeMessages, getSharedLogin, type LiveSession } from './liveHelper.test.js';

/**
 * Live checks for the external image sources. If these endpoints change or go offline,
 * the adapter no longer receives device images.
 *
 * The `public.json` tests need no credentials. The model tests need UNIFI_HOST, UNIFI_USER
 * and UNIFI_PASSWORD (see `liveHelper.test.ts`) and are skipped without them.
 */

const PUBLIC_JSON_URL = 'https://static.ui.com/fingerprint/ui/public.json';

/** PNG file signature. `downloadImage()` always labels the image as PNG, so the bytes must be PNG. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Builds the device image URL exactly like `readVal` of `imageUrl` in `src/lib/tree/device.ts`.
 *
 * @param model device model entry from the controller
 */
function deviceImageUrl(model: NetworkDeviceModels): string {
    return `https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/${model.id}/default/${model.default_image_id}.png&w=256?q=100`;
}

describe('Bild-Quellen (live, ohne Zugangsdaten)', function () {
    this.timeout(60_000);

    it('public.json ist erreichbar und enthält devices', async () => {
        const response = await request(PUBLIC_JSON_URL);
        expect(response.statusCode, PUBLIC_JSON_URL).to.equal(200);

        const data = (await response.body.json()) as Record<string, unknown>;
        expect(data, PUBLIC_JSON_URL).to.have.property('devices');
    });

    it('updateDevicesImages() schreibt publicData mit echten Daten', async () => {
        const ctx = createMainContext(
            { deviceImageDownload: true },
            { setObjectNotExistsAsync: (): Promise<void> => Promise.resolve() },
        );

        await ctx.instance.updateDevicesImages();

        expect(ctx.stub.errors, 'errors').to.be.empty;

        const publicData = [...ctx.stub.states.entries()].find(([id]) => id.endsWith('.publicData'))?.[1];
        expect(publicData, 'publicData state').to.be.a('string');
        expect(JSON.parse(String(publicData)), 'publicData').to.have.property('devices');
    });
});

describe('Geräte-Bilder über den Controller (live, read-only)', function () {
    this.timeout(60_000);

    let session: LiveSession | undefined;
    let models: NetworkDeviceModels[] = [];

    const getSession = (): LiveSession => {
        if (!session) {
            throw new Error('No session available');
        }
        return session;
    };

    before(async function () {
        this.timeout(90_000);
        const shared = await getSharedLogin();
        if (!shared) {
            this.skip();
            return;
        }

        session = shared.session;
        expect(shared.loggedIn, describeMessages(session.messages)).to.equal(true);

        models = (await getSession().api.getDeviceModels_V2()) ?? [];
    });

    it('getDeviceModels_V2() liefert Modelle mit Bild-IDs', () => {
        expect(models, describeMessages(getSession().messages)).to.not.be.empty;
        expect(models.some((model) => model.id && model.default_image_id), 'image ids').to.equal(true);
    });

    it('Geräte-Bild-URL liefert ein Bild und downloadImage() speichert es', async () => {
        const model = models.find((entry) => entry.id && entry.default_image_id);
        if (!model) {
            throw new Error('no model with image ids');
        }

        const url = deviceImageUrl(model);

        const response = await request(url);
        expect(response.statusCode, url).to.equal(200);
        expect(String(response.headers['content-type']), url).to.match(/^image\/png\b/);
        await response.body.dump();

        const ctx = createMainContext({ deviceImageDownload: true });
        ctx.stub.objects.add('devices.live_test.image');

        await ctx.instance.downloadImage(url, ['devices.live_test']);

        expect(ctx.stub.errors, 'errors').to.be.empty;

        const image = String(ctx.stub.states.get('devices.live_test.image'));
        expect(image, 'image state').to.match(/^data:image\/png;base64,.+/);

        const bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
        expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), 'PNG signature of decoded image').to.equal(true);
    });
});
