import { expect } from 'chai';
import { myIob } from '../../src/lib/myIob.js';
import { UnifiNetwork } from '../../src/main.js';

/** Config values that pass all range checks in `onReady`. Tests override single values. */
const VALID_CONFIG: Record<string, unknown> = {
    host: '',
    port: 443,
    site: 'default',
    user: '',
    password: '',
    expertAliveInterval: 30,
    realTimeApiDebounceTime: 0,
    apiUpdateInterval: 30,
    clientRealtimeDisconnectDebounceTime: 0,
};

const onReady = (UnifiNetwork.prototype as unknown as { onReady: (this: unknown) => Promise<void> }).onReady;

/** Recorded messages and stop reasons of a fake adapter. */
interface FakeAdapterRecord {
    warnings: string[];
    errors: string[];
    stopReasons: string[];
}

/**
 * Runs `onReady` against a fake adapter with the given config.
 * No connection is opened: the credentials branch would need a controller.
 *
 * @param configOverrides config values that replace the valid defaults
 * @returns the fake adapter after `onReady` has finished
 */
async function runOnReady(configOverrides: Record<string, unknown>): Promise<{ adapter: Record<string, any>; record: FakeAdapterRecord }> {
    const record: FakeAdapterRecord = { warnings: [], errors: [], stopReasons: [] };
    const adapter: Record<string, any> = {
        name: 'unifi-network',
        config: { ...VALID_CONFIG, ...configOverrides },
        log: {
            silly: (): void => undefined,
            debug: (): void => undefined,
            info: (): void => undefined,
            warn: (message: string): void => {
                record.warnings.push(message);
            },
            error: (message: string): void => {
                record.errors.push(message);
            },
        },
        stop: (options: { reason: string }): Promise<void> => {
            record.stopReasons.push(options.reason);
            return Promise.resolve();
        },
    };

    await onReady.call(adapter);

    return { adapter, record };
}

describe('UnifiNetwork.onReady (offline)', () => {
    // findMissingTranslation walks the real tree and needs the full adapter-core I18n API, which the test stub lacks.
    const originalFindMissingTranslation = myIob.prototype.findMissingTranslation;

    before(() => {
        myIob.prototype.findMissingTranslation = (): void => undefined;
    });

    after(() => {
        myIob.prototype.findMissingTranslation = originalFindMissingTranslation;
    });

    describe('Zugangsdaten', () => {
        it('erstellt keine API-Instanz und warnt, wenn alle Zugangsdaten fehlen', async () => {
            const { adapter, record } = await runOnReady({ host: '', user: '', password: '' });

            expect(adapter.ufn).to.equal(undefined);
            expect(record.warnings.some(message => message.includes('no login credentials'))).to.equal(true);
            expect(record.errors).to.deep.equal([]);
            expect(record.stopReasons).to.deep.equal([]);
        });

        it('erstellt keine API-Instanz, wenn nur das Passwort gesetzt ist', async () => {
            // Regression: with a comma expression the password alone made the check pass.
            const { adapter, record } = await runOnReady({ host: '', user: '', password: 'secret' });

            expect(adapter.ufn).to.equal(undefined);
            expect(record.warnings.some(message => message.includes('no login credentials'))).to.equal(true);
        });

        it('erstellt keine API-Instanz, wenn der Host fehlt', async () => {
            const { adapter, record } = await runOnReady({ host: '', user: 'user', password: 'secret' });

            expect(adapter.ufn).to.equal(undefined);
            expect(record.warnings.some(message => message.includes('no login credentials'))).to.equal(true);
        });

        it('erstellt keine API-Instanz, wenn der Benutzer fehlt', async () => {
            const { adapter, record } = await runOnReady({ host: '192.0.2.1', user: '', password: 'secret' });

            expect(adapter.ufn).to.equal(undefined);
            expect(record.warnings.some(message => message.includes('no login credentials'))).to.equal(true);
        });

        it('erstellt keine API-Instanz, wenn das Passwort fehlt', async () => {
            const { adapter, record } = await runOnReady({ host: '192.0.2.1', user: 'user', password: '' });

            expect(adapter.ufn).to.equal(undefined);
            expect(record.warnings.some(message => message.includes('no login credentials'))).to.equal(true);
        });
    });

    describe('Bereichsprüfung der Config', () => {
        const outOfRange: [string, number][] = [
            ['expertAliveInterval', 29],
            ['expertAliveInterval', 10001],
            ['realTimeApiDebounceTime', -1],
            ['realTimeApiDebounceTime', 10001],
            ['apiUpdateInterval', 29],
            ['apiUpdateInterval', 10001],
            ['clientRealtimeDisconnectDebounceTime', -1],
            ['clientRealtimeDisconnectDebounceTime', 10001],
        ];

        for (const [key, value] of outOfRange) {
            it(`stoppt den Adapter, wenn ${key} = ${value} außerhalb des Bereichs liegt`, async () => {
                const { record } = await runOnReady({ [key]: value });

                expect(record.errors.some(message => message.includes('adapter config settings wrong'))).to.equal(true);
                expect(record.stopReasons).to.deep.equal(['adapter config settings wrong']);
            });
        }

        it('akzeptiert die Grenzwerte des Bereichs ohne Stop', async () => {
            const { record } = await runOnReady({
                expertAliveInterval: 10000,
                realTimeApiDebounceTime: 10000,
                apiUpdateInterval: 10000,
                clientRealtimeDisconnectDebounceTime: 10000,
            });

            expect(record.stopReasons).to.deep.equal([]);
            expect(record.errors).to.deep.equal([]);
        });
    });
});
