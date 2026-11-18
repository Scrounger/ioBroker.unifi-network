import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UnifiNetwork } from '../../../src/main.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DTS_PATH = resolve(ROOT, 'src/lib/adapter-config.d.ts');
const MAIN_PATH = resolve(ROOT, 'src/main.ts');

/**
 * Compile-time equality of two types. Resolves to `true` only when `A` and `B` are identical.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/**
 * Reads the declaration file as text. It contains only types and cannot be imported at runtime.
 *
 * @returns content of adapter-config.d.ts
 */
const readDeclarationFile = (): string => readFileSync(DTS_PATH, 'utf8');

/**
 * Returns the body of an interface declared in the given source. The body ends at the closing brace
 * of the interface, which is indented by two tabs.
 *
 * @param source declaration file content
 * @param name interface name, e.g. `AdapterConfig`
 * @returns text between the braces, or undefined when the interface does not exist
 */
function getInterfaceBody(source: string, name: string): string | undefined {
    const match = new RegExp(`interface ${name}(?: extends [^{]+)? \\{([\\s\\S]*?)\\n\\t\\t\\}`).exec(source);
    return match?.[1];
}

describe('adapter-config.d.ts', () => {
    const source = readDeclarationFile();

    describe('Deklaration', () => {
        it('erweitert den globalen Namespace ioBroker', () => {
            expect(source).to.match(/declare global \{\s*namespace ioBroker \{/);
        });

        it('deklariert AdapterConfig und myAdapter', () => {
            expect(getInterfaceBody(source, 'AdapterConfig'), 'AdapterConfig').to.be.a('string');
            expect(getInterfaceBody(source, 'myAdapter'), 'myAdapter').to.be.a('string');
        });

        it('bleibt ein Modul, damit die Augmentierung greift', () => {
            expect(source).to.match(/^export \{ \};/m);
        });

        it('importiert die Typen aus den Quelldateien ohne Laufzeit-Abhängigkeit', () => {
            expect(source).to.match(/import \{ myIob \} from '\.\/myIob\.js'/);
            expect(source).to.match(/import \{ NetworkApi \} from '\.\/api\/network-api\.js'/);
            expect(source).to.match(/import \{ WriteValFunction, myCache \} from '\.\/myTypes\.js'/);
        });
    });

    describe('myAdapter', () => {
        const body = getInterfaceBody(source, 'myAdapter') ?? '';

        it('erbt von ioBroker.Adapter', () => {
            expect(source).to.match(/interface myAdapter extends ioBroker\.Adapter \{/);
        });

        it('deklariert ufn, myIob, cache und checkImageDownload', () => {
            for (const member of ['ufn', 'myIob', 'cache', 'checkImageDownload']) {
                expect(body, member).to.match(new RegExp(`\\b${member}\\b`));
            }
        });

        it('ist in main.ts als öffentliche async-Methode deklariert', () => {
            const main = readFileSync(MAIN_PATH, 'utf8');
            expect(main).to.match(/public async checkImageDownload\(idImageUrl: string, url: string\): Promise<void>/);
        });

        it('hat dieselbe Signatur wie die Implementierung in UnifiNetwork (main.ts)', () => {
            // Schlägt zur Kompilierzeit fehl, wenn Parameter- oder Rückgabetypen auseinanderlaufen.
            const signatureMatches: Equals<UnifiNetwork['checkImageDownload'], ioBroker.myAdapter['checkImageDownload']> = true;
            expect(signatureMatches).to.equal(true);
        });
    });

    // Die folgenden Tests prüfen die Typen zur Kompilierzeit (`npm run check`).
    // Fehlt ein Pflichtfeld, hat ein Feld den falschen Typ oder ist ein Schlüssel unbekannt,
    // meldet tsc einen Fehler. Die `@ts-expect-error`-Zeilen schlagen fehl, wenn kein Fehler auftritt.
    describe('AdapterConfig (Typprüfung)', () => {
        it('akzeptiert eine vollständige Konfiguration mit allen Schlüsseln', () => {
            const config: ioBroker.AdapterConfig = {
                host: '192.168.1.1',
                port: 443,
                site: 'default',
                user: 'admin',
                password: 'secret',
                expertAliveInterval: 60,
                expertConnectionMaxRetries: 3,
                realTimeApiDebounceTime: 2,
                apiUpdateInterval: 60,
                deviceImageDownload: false,
                clientRealtimeDisconnectDebounceTime: 5,
                clientDebouncingList: [],
                clientOfflineTimeout: 300,
                vpnOfflineTimeout: 300,
                clientImageDownload: false,
                clientDebugLevel: 'info',
                keepIobSynchron: false,
                deleteClientsOlderThan: 30,
                deleteGuestsOlderThan: 30,
                devicesEnabled: true,
                clientsEnabled: true,
                guestsEnabled: true,
                vpnEnabled: true,
                wlanConfigEnabled: true,
                lanConfigEnabled: true,
                deviceIsWhiteList: false,
                deviceBlackList: [],
                deviceStatesIsWhiteList: false,
                deviceStatesBlackList: [],
                clientIsWhiteList: false,
                clientBlackList: [],
                clientStatesIsWhiteList: false,
                clientStatesBlackList: [],
                lanIsWhiteList: false,
                lanBlackList: [],
                lanStatesIsWhiteList: false,
                lanStatesBlackList: [],
                wlanIsWhiteList: false,
                wlanBlackList: [],
                wlanStatesIsWhiteList: false,
                wlanStatesBlackList: [],
                firewallRuleConfigEnabled: true,
                firewallRuleWhiteList: false,
                firewallRuleBlackList: [],
                firewallRuleStatesIsWhiteList: false,
                firewallRuleStatesBlackList: [],
                firewallGroupConfigEnabled: true,
                firewallGroupIsWhiteList: false,
                firewallGroupBlackList: [],
                firewallGroupStatesIsWhiteList: false,
                firewallGroupStatesBlackList: [],
                systemInformationEnabled: true,
            };
            expect(config.host).to.equal('192.168.1.1');
        });

        it('lehnt falsche Datentypen und unbekannte Schlüssel ab', () => {
            const valid: ioBroker.AdapterConfig = {
                host: '192.168.1.1',
                port: 443,
                site: 'default',
                user: 'admin',
                password: 'secret',
                expertAliveInterval: 60,
                expertConnectionMaxRetries: 3,
                realTimeApiDebounceTime: 2,
                apiUpdateInterval: 60,
                deviceImageDownload: false,
                clientRealtimeDisconnectDebounceTime: 5,
                clientDebouncingList: [],
                clientOfflineTimeout: 300,
                vpnOfflineTimeout: 300,
                clientImageDownload: false,
                clientDebugLevel: 'info',
                keepIobSynchron: false,
                deleteClientsOlderThan: 30,
                deleteGuestsOlderThan: 30,
                devicesEnabled: true,
                clientsEnabled: true,
                guestsEnabled: true,
                vpnEnabled: true,
                wlanConfigEnabled: true,
                lanConfigEnabled: true,
                deviceIsWhiteList: false,
                deviceBlackList: [],
                deviceStatesIsWhiteList: false,
                deviceStatesBlackList: [],
                clientIsWhiteList: false,
                clientBlackList: [],
                clientStatesIsWhiteList: false,
                clientStatesBlackList: [],
                lanIsWhiteList: false,
                lanBlackList: [],
                lanStatesIsWhiteList: false,
                lanStatesBlackList: [],
                wlanIsWhiteList: false,
                wlanBlackList: [],
                wlanStatesIsWhiteList: false,
                wlanStatesBlackList: [],
                firewallRuleConfigEnabled: true,
                firewallRuleWhiteList: false,
                firewallRuleBlackList: [],
                firewallRuleStatesIsWhiteList: false,
                firewallRuleStatesBlackList: [],
                firewallGroupConfigEnabled: true,
                firewallGroupIsWhiteList: false,
                firewallGroupBlackList: [],
                firewallGroupStatesIsWhiteList: false,
                firewallGroupStatesBlackList: [],
                systemInformationEnabled: true,
            };

            // @ts-expect-error port ist als number deklariert
            const wrongPort: ioBroker.AdapterConfig = { ...valid, port: '443' };
            // @ts-expect-error unbekannter Schlüssel
            const unknownKey: ioBroker.AdapterConfig = { ...valid, notAKey: true };

            expect(wrongPort.port).to.equal('443');
            expect(unknownKey).to.have.property('notAKey');
        });
    });
});
