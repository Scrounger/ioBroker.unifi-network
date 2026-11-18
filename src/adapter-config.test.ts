import { expect } from 'chai';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

interface IoPackage {
    common: {
        version: string;
        news: Record<string, unknown>;
    };
    native: Record<string, unknown>;
    encryptedNative: string[];
    protectedNative: string[];
}

interface JsonConfigNode {
    type?: string;
    min?: number;
    max?: number;
    '#include'?: string;
    items?: Record<string, JsonConfigNode>;
}

interface UiControl {
    key: string;
    node: JsonConfigNode;
}

const LAYOUT_TYPES = new Set(['panel', 'tabs', 'header', 'staticLink', 'staticText', 'divider', 'staticImage', 'button']);

const readText = (relativePath: string): string => readFileSync(resolve(ROOT, relativePath), 'utf8');

const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

/**
 * Collects all input controls of a jsonConfig tree. Table columns are not controls and are skipped.
 *
 * @param node jsonConfig node to walk
 * @param controls accumulator for the collected controls
 */
function collectControls(node: JsonConfigNode, controls: UiControl[]): void {
    if (node['#include']) {
        collectControls(readJson<JsonConfigNode>(`admin/${node['#include']}`), controls);
        return;
    }
    for (const [key, child] of Object.entries(node.items ?? {})) {
        if (child.type && !LAYOUT_TYPES.has(child.type)) {
            controls.push({ key, node: child });
        }
        if (child.type !== 'table') {
            collectControls(child, controls);
        }
    }
}

/**
 * Reads the members of the `AdapterConfig` interface in `adapter-config.d.ts`.
 *
 * @returns map of property name to declared TypeScript type
 */
function readAdapterConfigMembers(): Map<string, string> {
    const dts = readText('src/lib/adapter-config.d.ts');
    const start = dts.indexOf('interface AdapterConfig {');
    expect(start, 'interface AdapterConfig in adapter-config.d.ts').to.be.greaterThan(-1);
    const end = dts.indexOf('\n\t\t}', start);
    const body = dts.slice(start, end);

    const members = new Map<string, string>();
    for (const match of body.matchAll(/^\t\t\t(\w+)\??:\s*(.+);$/gm)) {
        members.set(match[1], match[2].trim());
    }
    return members;
}

/**
 * Checks a runtime value against a simple TypeScript type from the declaration file.
 *
 * @param value default value from io-package.json
 * @param type declared type, e.g. `number`, `boolean` or `{ mac: string }[]`
 * @returns true when the value matches the declared type
 */
function matchesType(value: unknown, type: string): boolean {
    if (type.endsWith('[]')) {
        return Array.isArray(value);
    }
    return typeof value === type;
}

describe('adapter config', () => {
    const ioPackage = readJson<IoPackage>('io-package.json');
    const pkg = readJson<{ version: string }>('package.json');
    const nativeKeys = Object.keys(ioPackage.native);

    describe('io-package.json', () => {
        it('hat dieselbe Version wie package.json', () => {
            expect(ioPackage.common.version).to.equal(pkg.version);
        });

        it('enth\u00e4lt einen News-Eintrag f\u00fcr die aktuelle Version', () => {
            expect(ioPackage.common.news).to.have.property(pkg.version);
        });

        it('listet nur Schl\u00fcssel aus native als verschl\u00fcsselt oder gesch\u00fctzt', () => {
            for (const key of [...ioPackage.encryptedNative, ...ioPackage.protectedNative]) {
                expect(nativeKeys, `"${key}" in native`).to.include(key);
            }
        });

        it('markiert das Passwort als verschl\u00fcsselt und gesch\u00fctzt', () => {
            expect(ioPackage.encryptedNative).to.include('password');
            expect(ioPackage.protectedNative).to.include('password');
        });
    });

    describe('AdapterConfig typing', () => {
        const members = readAdapterConfigMembers();

        it('deckt alle native-Schl\u00fcssel typisiert ab und umgekehrt', () => {
            expect(nativeKeys).to.have.members([...members.keys()]);
        });

        it('hat f\u00fcr jeden Default den im Typ deklarierten Datentyp', () => {
            const mismatches = nativeKeys.filter(key => {
                const type = members.get(key);
                return type === undefined || !matchesType(ioPackage.native[key], type);
            });
            expect(mismatches).to.deep.equal([]);
        });
    });

    describe('admin jsonConfig', () => {
        const controls: UiControl[] = [];
        collectControls(readJson<JsonConfigNode>('admin/jsonConfig.json'), controls);
        const controlKeys = controls.map(control => control.key);

        it('findet Eingabefelder in allen Tabs', () => {
            expect(controls.length).to.be.greaterThan(40);
        });

        it('verwendet jeden Schl\u00fcssel nur einmal', () => {
            const duplicates = controlKeys.filter((key, index) => controlKeys.indexOf(key) !== index);
            expect(duplicates).to.deep.equal([]);
        });

        it('referenziert nur Schl\u00fcssel, die in native existieren', () => {
            const unknown = controlKeys.filter(key => !nativeKeys.includes(key));
            expect(unknown).to.deep.equal([]);
        });

        it('bietet jeden native-Schl\u00fcssel in der UI an', () => {
            const missing = nativeKeys.filter(key => !controlKeys.includes(key));
            expect(missing).to.deep.equal([]);
        });

        it('liegt jeder Default innerhalb von min/max des Eingabefeldes', () => {
            const outOfRange = controls
                .filter(({ node }) => node.type === 'number')
                .filter(({ key, node }) => {
                    const value = ioPackage.native[key];
                    if (typeof value !== 'number') {
                        return true;
                    }
                    const belowMin = node.min !== undefined && value < node.min;
                    const aboveMax = node.max !== undefined && value > node.max;
                    return belowMin || aboveMax;
                })
                .map(({ key }) => key);
            expect(outOfRange).to.deep.equal([]);
        });

        it('verweist in Validatoren und Anzeige-Templates nur auf existierende native-Schl\u00fcssel', () => {
            const files = readdirSync(resolve(ROOT, 'admin')).filter(file => file.endsWith('.jsonConfig.json'));
            const referenced = new Set<string>();
            for (const file of files) {
                for (const match of readText(`admin/${file}`).matchAll(/data\.(\w+)/g)) {
                    referenced.add(match[1]);
                }
            }
            const unknown = [...referenced].filter(key => !nativeKeys.includes(key));
            expect(unknown).to.deep.equal([]);
        });

        it('h\u00e4lt den Default des Debounce-Timers unter der H\u00e4lfte des Client-Offline-Timeouts', () => {
            // Validator in general.jsonConfig.json: realTimeApiDebounceTime < clientOfflineTimeout / 2
            const debounce = ioPackage.native.realTimeApiDebounceTime as number;
            const offline = ioPackage.native.clientOfflineTimeout as number;
            expect(debounce).to.be.lessThan(offline / 2);
        });
    });

    describe('i18n', () => {
        const i18nDir = resolve(ROOT, 'admin/i18n');
        const languages = readdirSync(i18nDir).filter(file => file.endsWith('.json'));
        const en = readJson<Record<string, string>>('admin/i18n/en.json');

        it('hat f\u00fcr jede Sprache dieselben Schl\u00fcssel wie en.json', () => {
            for (const file of languages) {
                const translation = readJson<Record<string, string>>(`admin/i18n/${file}`);
                expect(Object.keys(translation), file).to.have.members(Object.keys(en));
            }
        });

        it('hat f\u00fcr jeden Schl\u00fcssel einen nicht leeren Text', () => {
            for (const file of languages) {
                const translation = readJson<Record<string, string>>(`admin/i18n/${file}`);
                const empty = Object.keys(translation).filter(key => translation[key].trim() === '');
                expect(empty, file).to.deep.equal([]);
            }
        });
    });
});
