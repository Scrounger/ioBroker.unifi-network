import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fixtureDir, latestFixtureVersion, requireFixtures } from '../../../tools/fixtureVersions.js';
// Statische Imports: dynamische Imports laden die Module (network-api) doppelt und verfälschen die Coverage.
import { myIob, type myTreeState } from '../../../src/lib/myIob.js';
import type { myTreeData } from '../../../src/lib/myTypes.js';
import * as treeModule from '../../../src/lib/tree/index.js';

type MyIobClass = typeof import('../../../src/lib/myIob.js').myIob;
type MyIobArgs = ConstructorParameters<MyIobClass>;
type StoredObject = { type?: string; common?: Record<string, any>; native?: Record<string, any> };
type TreeDefinitions = Parameters<InstanceType<MyIobClass>['createOrUpdateStates']>[1];
type BlacklistFilter = Parameters<InstanceType<MyIobClass>['createOrUpdateStates']>[4];
type TreeData = Record<string, any>;

const NAMESPACE = 'unifi-network.0';

interface TestContext {
    adapter: Record<string, unknown>;
    iob: InstanceType<MyIobClass>;
    objects: Map<string, StoredObject>;
    states: Map<string, { val: unknown; ack: boolean }>;
    stateCalls: string[];
    extendedIds: string[];
    errors: string[];
    warnings: string[];
}

/**
 * Creates an in-memory adapter stub with the methods used by `myIob`.
 */
function createTestContext(): TestContext {
    const objects = new Map<string, StoredObject>();
    const states = new Map<string, { val: unknown; ack: boolean }>();
    const stateCalls: string[] = [];
    const extendedIds: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const log = {
        level: 'debug',
        silly: (): void => undefined,
        debug: (): void => undefined,
        info: (): void => undefined,
        warn: (message: string): void => {
            warnings.push(message);
        },
        error: (message: string): void => {
            errors.push(message);
        },
    };

    const writeState =
        (method: string) =>
            (id: string, val: unknown, ack: boolean): Promise<{ notChanged: boolean } | undefined> => {
                stateCalls.push(method);
                const previous = states.get(id);
                states.set(id, { val, ack });

                // Wie ioBroker: notChanged, wenn Wert und ack unverändert sind.
                const notChanged = previous !== undefined && previous.ack === ack && isDeepStrictEqual(previous.val, val);
                return Promise.resolve(method === 'setStateChangedAsync' ? { notChanged } : undefined);
            };

    const adapter = {
        namespace: NAMESPACE,
        log,
        connected: true,
        language: 'en',
        config: { clientImageDownload: false },
        subscribeStatesAsync: (): Promise<void> => Promise.resolve(),
        objectExists: (id: string): Promise<boolean> => Promise.resolve(objects.has(id)),
        setObjectNotExistsAsync: (id: string, obj: StoredObject): Promise<void> => {
            if (!objects.has(id)) {
                objects.set(id, obj);
            }
            return Promise.resolve();
        },
        getObjectAsync: (id: string): Promise<StoredObject | null> => Promise.resolve(objects.get(id) ?? null),
        extendObject: (id: string, obj: StoredObject): Promise<void> => {
            const existing = objects.get(id) ?? {};
            extendedIds.push(id);
            objects.set(id, { ...existing, ...obj, common: { ...existing.common, ...obj.common } });
            return Promise.resolve();
        },
        delObjectAsync: (id: string): Promise<void> => {
            objects.delete(id);
            return Promise.resolve();
        },
        setState: writeState('setState'),
        setStateChangedAsync: writeState('setStateChangedAsync'),
    };

    const utils = {
        I18n: {
            getTranslatedObject: (text: string): Record<string, string> => ({ en: text }),
        },
    };

    const iob = new myIob(adapter as unknown as MyIobArgs[0], utils as unknown as MyIobArgs[1]);

    return { adapter, iob, objects, states, stateCalls, extendedIds, errors, warnings };
}

/**
 * Testdaten für createOrUpdateStates. Die Testfälle verwenden frei gewählte State-Ids, die nicht
 * den Feldern von `myTreeData` entsprechen. Deshalb wird der Typ hier bewusst umgangen.
 *
 * @param values Werte je State-Id
 * @returns Daten im Format von createOrUpdateStates
 */
function testData(values: Record<string, unknown>): myTreeData {
    return values;
}

/**
 * Liefert den Adapter-Stub für Aufrufe, die einen `ioBroker.Adapter` erwarten.
 *
 * @param ctx Test-Kontext mit dem Adapter-Stub
 * @returns Adapter-Stub als `ioBroker.Adapter`
 */
function asAdapter(ctx: TestContext): ioBroker.Adapter {
    return ctx.adapter as unknown as ioBroker.Adapter;
}

/**
 * Erstellt eine myIob-Instanz, deren Übersetzungsabfrage durch `translate` ersetzt wird.
 *
 * @param ctx Test-Kontext mit dem Adapter-Stub
 * @param translate Ersatz für `I18n.getTranslatedObject`
 * @returns myIob-Instanz mit der übergebenen Übersetzungsfunktion
 */
function createTranslatingIob(ctx: TestContext, translate: (text: string) => Record<string, string>): myIob {
    const utils = { I18n: { getTranslatedObject: translate } };
    return new myIob(ctx.adapter as unknown as MyIobArgs[0], utils as unknown as MyIobArgs[1]);
}

/**
 * Legt einen einzelnen State über createOrUpdateStates an und liefert das gespeicherte Objekt.
 *
 * @param iob myIob-Instanz, die den State anlegt
 * @param ctx Test-Kontext mit dem Objekt-Speicher
 * @param id State-Id innerhalb des Test-Channels
 * @param def Tree-Definition des States
 * @returns das gespeicherte Objekt oder undefined
 */
async function createStateObject(iob: myIob, ctx: TestContext, id: string, def: myTreeState<any, any, any>): Promise<StoredObject | undefined> {
    const channel = `${NAMESPACE}.test`;
    const value = def.iobType === 'number' ? 1 : def.iobType === 'string' ? 'x' : true;
    const definitions: TreeDefinitions = { [id]: def };

    await iob.createOrUpdateStates(channel, definitions, { [id]: value }, { [id]: value });
    return ctx.objects.get(`${channel}.${id}`);
}


describe('myIob (offline)', function () {
    let ctx: TestContext;

    beforeEach(() => {
        ctx = createTestContext();
    });

    afterEach(() => {
        expect(ctx.errors, 'Fehler im Logger').to.be.empty;
    });

    describe('getIdWithoutLastPart() / getIdLastPart()', () => {
        it('trennen den letzten Teil einer ID ab', () => {
            const id = `${NAMESPACE}.devices.aa:bb:cc:dd:ee:ff`;
            expect(ctx.iob.getIdWithoutLastPart(id)).to.equal(`${NAMESPACE}.devices`);
            expect(ctx.iob.getIdLastPart(id)).to.equal('aa:bb:cc:dd:ee:ff');
        });

        it('liefern bei leerer ID einen leeren letzten Teil', () => {
            expect(ctx.iob.getIdLastPart('')).to.equal('');
        });
    });

    describe('createOrUpdateDevice()', () => {
        const id = `${NAMESPACE}.devices.aa`;

        it('legt ein Device mit Namen und Status-IDs an', async () => {
            await ctx.iob.createOrUpdateDevice(id, 'Switch', 'devices.aa.online', 'devices.aa.error');

            const obj = ctx.objects.get(id);
            expect(obj?.type).to.equal('device');
            expect(obj?.common?.name).to.equal('Switch');
            expect(obj?.common?.statusStates).to.deep.equal({
                onlineId: `${NAMESPACE}.devices.aa.online`,
                errorId: `${NAMESPACE}.devices.aa.error`,
            });
        });

        it('übernimmt vollständig qualifizierte Status-IDs unverändert', async () => {
            const onlineId = `${NAMESPACE}.devices.aa.online`;
            await ctx.iob.createOrUpdateDevice(id, 'Switch', onlineId);

            expect(ctx.objects.get(id)?.common?.statusStates?.onlineId).to.equal(onlineId);
        });

        it('überschreibt ein bestehendes Device ohne updateObject nicht', async () => {
            await ctx.iob.createOrUpdateDevice(id, 'Alt');
            await ctx.iob.createOrUpdateDevice(id, 'Neu', undefined, undefined, undefined, false);

            expect(ctx.objects.get(id)?.common?.name).to.equal('Alt');
            expect(ctx.extendedIds).to.be.empty;
        });

        it('aktualisiert ein bestehendes Device mit updateObject=true', async () => {
            await ctx.iob.createOrUpdateDevice(id, 'Alt');
            await ctx.iob.createOrUpdateDevice(id, 'Neu', undefined, undefined, undefined, true);

            expect(ctx.objects.get(id)?.common?.name).to.equal('Neu');
            expect(ctx.extendedIds).to.deep.equal([id]);
        });

        it('behält den gespeicherten Namen, wenn kein Name übergeben wird', async () => {
            await ctx.iob.createOrUpdateDevice(id, 'Alt');
            await ctx.iob.createOrUpdateDevice(id, undefined, undefined, undefined, undefined, true);

            expect(ctx.objects.get(id)?.common?.name).to.equal('Alt');
            expect(ctx.extendedIds).to.be.empty;
        });
    });

    describe('createOrUpdateChannel()', () => {
        it('legt einen Channel mit Namen an', async () => {
            const id = `${NAMESPACE}.devices.aa.info`;
            await ctx.iob.createOrUpdateChannel(id, 'Info');

            expect(ctx.objects.get(id)?.type).to.equal('channel');
            expect(ctx.objects.get(id)?.common?.name).to.equal('Info');
        });

        it('überschreibt einen bestehenden Channel ohne updateObject nicht', async () => {
            const id = `${NAMESPACE}.devices.aa.info`;
            await ctx.iob.createOrUpdateChannel(id, 'Alt');
            await ctx.iob.createOrUpdateChannel(id, 'Neu');

            expect(ctx.objects.get(id)?.common?.name).to.equal('Alt');
        });
    });

    describe('setStateExists()', () => {
        const id = `${NAMESPACE}.devices.aa.info.uptime`;

        it('schreibt keinen State, wenn das Objekt nicht existiert', async () => {
            await ctx.iob.setStateExists(id, 42, ctx.adapter as unknown as ioBroker.Adapter);

            expect(ctx.states.has(id)).to.equal(false);
            expect(ctx.stateCalls).to.be.empty;
        });

        it('schreibt den Wert mit ack=true, wenn das Objekt existiert', async () => {
            ctx.objects.set(id, { type: 'state', common: {} });
            await ctx.iob.setStateExists(id, 42, ctx.adapter as unknown as ioBroker.Adapter);

            expect(ctx.states.get(id)).to.deep.equal({ val: 42, ack: true });
            expect(ctx.stateCalls).to.deep.equal(['setState']);
        });

        it('nutzt setStateChangedAsync bei onlyChanges=true', async () => {
            ctx.objects.set(id, { type: 'state', common: {} });
            await ctx.iob.setStateExists(id, 7, ctx.adapter as unknown as ioBroker.Adapter, true);

            expect(ctx.states.get(id)).to.deep.equal({ val: 7, ack: true });
            expect(ctx.stateCalls).to.deep.equal(['setStateChangedAsync']);
        });
    });

    describe('deepDiffBetweenObjects()', () => {
        it('liefert nur geänderte Felder', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ a: 1, b: 2 }, { a: 1, b: 3 }, asAdapter(ctx))).to.deep.equal({ b: 2 });
        });

        it('liefert bei verschachtelten Objekten nur die geänderten Unterfelder', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ x: { y: 2, z: 1 } }, { x: { y: 1, z: 1 } }, asAdapter(ctx))).to.deep.equal({ x: { y: 2 } });
        });

        it('liefert keine Differenz bei gleichen verschachtelten Objekten', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ x: { y: 1 } }, { x: { y: 1 } }, asAdapter(ctx))).to.deep.equal({});
        });

        it('übernimmt das komplette Objekt, wenn die Basis kein Objekt ist', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ x: { y: 1 } }, { x: 5 }, asAdapter(ctx))).to.deep.equal({ x: { y: 1 } });
        });

        it('übernimmt geänderte Arrays aus Primitiven komplett', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ tags: ['a', 'c'] }, { tags: ['a', 'b'] }, asAdapter(ctx))).to.deep.equal({ tags: ['a', 'c'] });
        });

        it('liefert bei Arrays aus Objekten pro Index nur die Änderungen', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ list: [{ a: 1 }, { a: 2 }] }, { list: [{ a: 1 }, { a: 3 }] }, asAdapter(ctx))).to.deep.equal({ list: [null, { a: 2 }] });
        });

        it('liefert neue Array-Einträge vollständig', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ list: [{ a: 1 }, { b: 2 }] }, { list: [{ a: 1 }] }, asAdapter(ctx))).to.deep.equal({ list: [null, { b: 2 }] });
        });

        it('berücksichtigt nur erlaubte Schlüssel', () => {
            expect(ctx.iob.deepDiffBetweenObjects({ a: 1, b: 2 }, { a: 0, b: 0 }, asAdapter(ctx), ['a'])).to.deep.equal({ a: 1 });
        });

        it('protokolliert Fehler und liefert keine fehlerhaften Felder', () => {
            const result = ctx.iob.deepDiffBetweenObjects({ a: 1 }, null, asAdapter(ctx));

            expect(result).to.deep.equal({});
            expect(ctx.errors.length, 'Fehler im Logger').to.be.above(0);
            ctx.errors.splice(0);
        });
    });

    describe('Übersetzungsprüfung', () => {
        it('meldet fehlende Übersetzungen der Tree-Definitionen', () => {
            ctx.iob.findMissingTranslation();

            expect(ctx.warnings.some(w => w.includes('missing translations')), 'Warnung zu fehlenden Übersetzungen').to.equal(true);
        });

        it('meldet keine fehlenden Übersetzungen, wenn alle Namen übersetzt sind', () => {
            const iob = createTranslatingIob(ctx, () => ({ en: 'Name', de: 'Name' }));
            iob.findMissingTranslation();

            expect(ctx.warnings.filter(w => w.includes('missing translations'))).to.be.empty;
        });

        it('wertet verschachtelte Gruppen, Arrays und Objekte aus und überspringt "events"', () => {
            const tree = {
                events: { get: () => ({ ignored: { iobType: 'string', name: 'Ignored' } }) },
                group: {
                    plain: { name: 'Plain' },
                    device: {
                        get: () => ({
                            withName: { iobType: 'string', name: 'Named' },
                            withoutName: { iobType: 'number' },
                            fnName: { iobType: 'boolean', name: () => 'Funktion' },
                            obj: { object: { inner: { iobType: 'string', name: 'Inner' } } },
                            arr: { array: { item: { iobType: 'string', name: 'Item' } } },
                            primitive: 'text',
                        }),
                    },
                },
            };

            ctx.iob._findMissingTranslation(tree);

            const message = ctx.warnings.find(w => w.includes('device - missing translations'));
            expect(message, 'Warnung für device').to.be.a('string');
            const missing = JSON.parse((message as string).slice((message as string).indexOf('{')));
            expect(missing).to.deep.equal({ Named: 'Named', withoutName: 'withoutName', obj: 'obj', arr: 'arr', Inner: 'Inner', Item: 'Item' });
            expect(ctx.warnings.join('\n')).to.not.include('Ignored');
        });

        it('protokolliert Fehler beim Auslesen einer Tree-Definition', () => {
            ctx.iob._findMissingTranslation({
                broken: {
                    get: (): never => {
                        throw new Error('boom');
                    },
                },
            });

            expect(ctx.errors.join('\n')).to.include('boom');
            ctx.errors.splice(0);
        });
    });

    describe('Rollenzuweisung über createOrUpdateStates()', () => {
        const cases: { id: string; def: myTreeState<any, any, any>; role: string }[] = [
            { id: 'enable_x', def: { iobType: 'boolean', read: true, write: true }, role: 'switch.enable' },
            { id: 'led', def: { iobType: 'boolean', read: true, write: true }, role: 'switch.light' },
            { id: 'poe_mode', def: { iobType: 'boolean', read: true, write: true }, role: 'switch.power' },
            { id: 'relay', def: { iobType: 'boolean', read: true, write: true }, role: 'switch' },
            { id: 'isOnline', def: { iobType: 'boolean', read: true, write: false }, role: 'indicator.reachable' },
            { id: 'error_flag', def: { iobType: 'boolean', read: true, write: false }, role: 'indicator.error' },
            { id: 'alarm', def: { iobType: 'boolean', read: true, write: false }, role: 'indicator.alarm' },
            { id: 'maintenance_mode', def: { iobType: 'boolean', read: true, write: false }, role: 'indicator.maintenance' },
            { id: 'door', def: { iobType: 'boolean', read: true, write: false }, role: 'sensor' },
            { id: 'temperatur', def: { iobType: 'number', unit: '°C', read: true, write: false }, role: 'value.temperature' },
            { id: 'setpoint', def: { iobType: 'number', unit: 'K', read: true, write: true }, role: 'level.temperature' },
            { id: 'brightness', def: { iobType: 'number', unit: 'lux', read: true, write: false }, role: 'value.brightness' },
            { id: 'co2', def: { iobType: 'number', unit: 'ppm', read: true, write: false }, role: 'value.co2' },
            { id: 'pressure', def: { iobType: 'number', unit: 'mbar', read: true, write: false }, role: 'value.pressure' },
            { id: 'energy_total', def: { iobType: 'number', unit: 'kWh', read: true, write: true }, role: 'level.energy' },
            { id: 'power_now', def: { iobType: 'number', unit: 'W', read: true, write: false }, role: 'value.power' },
            { id: 'current', def: { iobType: 'number', unit: 'A', read: true, write: false }, role: 'value.current' },
            { id: 'voltage', def: { iobType: 'number', unit: 'V', read: true, write: false }, role: 'value.voltage' },
            { id: 'frequency', def: { iobType: 'number', unit: 'Hz', read: true, write: false }, role: 'value.frequency' },
            { id: 'longitude', def: { iobType: 'number', read: true, write: false }, role: 'value.gps.longitude' },
            { id: 'latitude', def: { iobType: 'number', read: true, write: false }, role: 'value.gps.latitude' },
            { id: 'humidity', def: { iobType: 'number', unit: '%', read: true, write: false }, role: 'value.humidity' },
            { id: 'battery', def: { iobType: 'number', unit: '%', read: true, write: false }, role: 'value.battery' },
            { id: 'volume', def: { iobType: 'number', unit: '%', read: true, write: true }, role: 'level.volume' },
            { id: 'count', def: { iobType: 'number', read: true, write: true }, role: 'level' },
            { id: 'countW', def: { iobType: 'number', read: false, write: true }, role: 'level' },
            { id: 'plain', def: { iobType: 'number', read: false, write: false }, role: 'state' },
            { id: 'firmware', def: { iobType: 'string', read: true, write: false }, role: 'info.firmware' },
            { id: 'status_text', def: { iobType: 'string', read: true, write: false }, role: 'info.status' },
            { id: 'model', def: { iobType: 'string', read: true, write: false }, role: 'info.model' },
            { id: 'mac_address', def: { iobType: 'string', read: true, write: false }, role: 'info.mac' },
            { id: 'hostname', def: { iobType: 'string', read: true, write: false }, role: 'info.name' },
            { id: 'hardware_rev', def: { iobType: 'string', read: true, write: false }, role: 'info.hardware' },
            { id: 'serial_no', def: { iobType: 'string', read: true, write: false }, role: 'info.serial' },
            { id: 'comment', def: { iobType: 'string', read: true, write: false }, role: 'text' },
            { id: 'note', def: { iobType: 'string', read: true, write: true }, role: 'text' },
            { id: 'payload', def: { iobType: 'json' as ioBroker.CommonType, read: true, write: false }, role: 'state' },
        ];

        for (const c of cases) {
            it(`vergibt die Rolle '${c.role}' für ${c.id}`, async () => {
                const obj = await createStateObject(ctx.iob, ctx, c.id, c.def);

                expect(obj?.common?.role).to.equal(c.role);
            });
        }
    });

    describe('getCommonForState() über createOrUpdateStates()', () => {
        const translations: Record<string, Record<string, string>> = {
            Temperatur: { en: 'Temperature', de: 'Temperatur' },
            Grad: { en: '°C', de: 'Grad Celsius' },
        };

        it('übernimmt übersetzte Namen und Einheiten', async () => {
            ctx.adapter.language = 'de';
            const iob = createTranslatingIob(ctx, text => translations[text] ?? { en: text });
            const obj = await createStateObject(iob, ctx, 'temp', { iobType: 'number', name: 'Temperatur', unit: 'Grad', read: true, write: false });

            expect(obj?.common?.name).to.deep.equal({ en: 'Temperature', de: 'Temperatur' });
            expect(obj?.common?.unit).to.equal('Grad Celsius');
        });

        it('nutzt Unit-Funktionen und behält Namen ohne Übersetzung', async () => {
            const obj = await createStateObject(ctx.iob, ctx, 'humidity', { iobType: 'number', unit: (): string => '%', read: true, write: false });

            expect(obj?.common?.unit).to.equal('%');
            expect(obj?.common?.name).to.equal('humidity');
        });

        it('übernimmt Grenzen, Schritt, Standardwert, Beschreibung und Rolle', async () => {
            const obj = await createStateObject(ctx.iob, ctx, 'level', { iobType: 'number', min: 0, max: 100, step: 5, expert: true, def: 0, desc: 'Beschreibung', role: 'custom.role', read: true, write: true });

            expect(obj?.common).to.include({ min: 0, max: 100, step: 5, expert: true, def: 0, desc: 'Beschreibung', role: 'custom.role' });
        });

        it('übernimmt den Standardwert false', async () => {
            const obj = await createStateObject(ctx.iob, ctx, 'flag', { iobType: 'boolean', def: false, read: true, write: true });

            expect(obj?.common?.def).to.equal(false);
        });

        it('übernimmt Auswahlwerte aus states und statesFromProperty', async () => {
            const withStates = await createStateObject(ctx.iob, ctx, 'mode', { iobType: 'string', read: true, write: true, states: { auto: 'Automatik', manual: 'Manuell' } });
            const fromProperty = await createStateObject(ctx.iob, ctx, 'choice', { iobType: 'string', read: true, write: false, statesFromProperty: (): string[] => ['x', 'y'] });

            expect(withStates?.common?.states).to.deep.equal({ auto: 'Automatik', manual: 'Manuell' });
            expect(fromProperty?.common?.states).to.deep.equal(['x', 'y']);
        });
    });

    describe('createOrUpdateStates() Sonderfälle', () => {
        it('legt keine States an, wenn der Adapter nicht verbunden ist', async () => {
            ctx.adapter.connected = false;
            const def: TreeDefinitions = { offline: { iobType: 'boolean', read: true, write: false } };
            const changed = await ctx.iob.createOrUpdateStates(`${NAMESPACE}.test`, def, testData({ offline: true }), testData({ offline: true }));

            expect(changed).to.equal(false);
            expect(ctx.objects.size).to.equal(0);
            expect(ctx.warnings.some(w => w.includes('adapter has no connection'))).to.equal(true);
        });

        it('überspringt States, deren valFromProperty in den Daten fehlt', async () => {
            const obj = await createStateObject(ctx.iob, ctx, 'derived', { iobType: 'number', read: true, write: false, valFromProperty: 'source' });

            expect(obj).to.equal(undefined);
        });

        it('entfernt einen State, der auf der Blacklist steht', async () => {
            const channel = `${NAMESPACE}.test`;
            const def: TreeDefinitions = { blocked: { iobType: 'boolean', read: true, write: false } };
            await ctx.iob.createOrUpdateStates(channel, def, testData({ blocked: true }), testData({ blocked: true }));
            expect(ctx.objects.has(`${channel}.blocked`)).to.equal(true);

            await ctx.iob.createOrUpdateStates(channel, def, testData({ blocked: true }), testData({ blocked: true }), [{ id: 'blocked' }]);
            expect(ctx.objects.has(`${channel}.blocked`)).to.equal(false);
        });

        it('löscht States mit false-Bedingung nur bei updateObject=true', async () => {
            const channel = `${NAMESPACE}.test`;
            const def: TreeDefinitions = { cond: { iobType: 'boolean', read: true, write: false, conditionToCreateState: (): boolean => false } };
            ctx.objects.set(`${channel}.cond`, { type: 'state', common: {} });

            await ctx.iob.createOrUpdateStates(channel, def, testData({ cond: true }), testData({ cond: true }));
            expect(ctx.objects.has(`${channel}.cond`), 'ohne updateObject unverändert').to.equal(true);

            await ctx.iob.createOrUpdateStates(channel, def, testData({ cond: true }), testData({ cond: true }), undefined, false, 'Gerät', true);
            expect(ctx.objects.has(`${channel}.cond`), 'mit updateObject gelöscht').to.equal(false);
        });

        it('aktualisiert bestehende States bei updateObject=true', async () => {
            const channel = `${NAMESPACE}.test`;
            await ctx.iob.createOrUpdateStates(channel, { level: { iobType: 'number', read: true, write: false, min: 0 } }, testData({ level: 1 }), testData({ level: 1 }));
            await ctx.iob.createOrUpdateStates(channel, { level: { iobType: 'number', read: true, write: false, min: 10 } }, testData({ level: 1 }), testData({ level: 1 }), undefined, false, 'Gerät', true);

            expect(ctx.objects.get(`${channel}.level`)?.common?.min).to.equal(10);
            expect(ctx.extendedIds).to.deep.equal([`${channel}.level`]);
        });

        it('protokolliert Fehler aus readVal im Logger', async () => {
            const channel = `${NAMESPACE}.test`;
            const def: TreeDefinitions = {
                broken: {
                    iobType: 'number',
                    read: true,
                    write: false,
                    readVal: (): number => {
                        throw new Error('readVal kaputt');
                    },
                },
            };
            await ctx.iob.createOrUpdateStates(channel, def, testData({ broken: 1 }), testData({ broken: 1 }));

            expect(ctx.errors.join('\n')).to.include('readVal kaputt');
            ctx.errors.splice(0);
        });
    });
});

/** Verzeichnis mit den anonymisierten API-Fixtures der neuesten Version (git-ignoriert, vom Recorder aufgezeichnet). */
const FIXTURE_DIR = fixtureDir(latestFixtureVersion() ?? 'keine-version', 'api');

/** Fixtures, die die Suite braucht. Fehlt eine, wird die Suite übersprungen. */
const REQUIRED_FIXTURES = ['devicesV2', 'clientsActiveV2', 'wlanConfigV2', 'lanConfigV2', 'sysinfo', 'firewallGroup'];

/** Teil einer Tree-Definition, den die Tests auswerten. */
interface StateDefinition {
    id?: string;
    iobType?: string;
    valFromProperty?: string;
    readVal?: unknown;
    required?: boolean;
    object?: unknown;
    array?: unknown;
    conditionToCreateState?: (fullData: TreeData, channelData: TreeData, adapter: unknown) => unknown;
}

/**
 * Liest die Antwort einer aufgezeichneten Fixture.
 *
 * @param endpoint Name der Fixture ohne Endung
 */
function readFixture(endpoint: string): unknown {
    const raw = JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${endpoint}.json`), 'utf8')) as { response: unknown };
    return raw.response;
}

function readNetworkDevices(): TreeData[] {
    return (readFixture('devicesV2') as { network_devices: TreeData[] }).network_devices;
}

function readActiveClients(): TreeData[] {
    return readFixture('clientsActiveV2') as TreeData[];
}

function readSysInfo(): TreeData {
    return (readFixture('sysinfo') as { data: TreeData[] }).data[0];
}

/**
 * Führt configuration, details und statistics zusammen (wie in main.ts).
 *
 * @param endpoint Name der V2-Fixture ohne Endung
 */
function readMergedV2(endpoint: string): TreeData[] {
    return (readFixture(endpoint) as TreeData[]).map(entry => ({ ...entry.configuration, ...entry.details, ...entry.statistics }));
}

function isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Liefert einen geänderten Wert desselben Typs.
 *
 * @param value Ursprünglicher Wert
 */
function mutate(value: string | number | boolean): string | number | boolean {
    if (typeof value === 'string') {
        return `${value}-geaendert`;
    }
    if (typeof value === 'number') {
        return value + 1;
    }
    return !value;
}

/**
 * Ein Eintrag der Tree-Definition ist ein State, wenn er iobType hat und kein object/array ist.
 *
 * @param def Eintrag der Tree-Definition
 */
function isStateDefinition(def: StateDefinition): boolean {
    return def.iobType !== undefined && def.object === undefined && def.array === undefined;
}

/**
 * IDs aller States unterhalb eines Channels.
 *
 * @param ctx Test-Kontext mit den angelegten Objekten
 * @param channel Channel-ID
 */
function getStateIds(ctx: TestContext, channel: string): string[] {
    return [...ctx.objects.entries()].filter(([id, obj]) => id.startsWith(`${channel}.`) && obj.type === 'state').map(([id]) => id);
}

/**
 * Prüft die Pflichtfelder jedes angelegten States.
 *
 * @param ctx Test-Kontext mit den angelegten Objekten
 * @param channel Channel-ID
 */
function expectValidStateObjects(ctx: TestContext, channel: string): void {
    for (const id of getStateIds(ctx, channel)) {
        const common = ctx.objects.get(id)?.common ?? {};
        expect(common.role, `${id}: role`).to.be.a('string');
        expect(common.read, `${id}: read`).to.be.a('boolean');
        expect(common.write, `${id}: write`).to.be.a('boolean');
    }
}

/**
 * Prüft für jeden State der Tree-Definition, dessen Quellwert vorhanden ist:
 * Der State existiert (falls conditionToCreateState erfüllt ist), sein Typ entspricht iobType
 * und bei primitiven Werten ohne readVal entspricht der Wert den Daten.
 * Gibt die Anzahl der Wertvergleiche zurück.
 *
 * @param ctx Test-Kontext mit den angelegten Objekten
 * @param channel Channel-ID
 * @param definitions Tree-Definition des Channels
 * @param data Quelldaten des Eintrags
 */
function expectStatesMatchData(ctx: TestContext, channel: string, definitions: TreeDefinitions, data: TreeData): number {
    const defs = definitions as unknown as Record<string, StateDefinition>;
    let compared = 0;

    for (const [key, def] of Object.entries(defs)) {
        if (!isStateDefinition(def)) {
            continue;
        }

        const valKey = def.valFromProperty ?? key;
        const value = data[valKey];
        if (value === undefined) {
            continue;
        }

        const objectId = `${channel}.${def.id ?? key}`;
        const conditionMet = def.conditionToCreateState ? def.conditionToCreateState(data, data, ctx.adapter) === true : true;

        if (!conditionMet) {
            expect(ctx.objects.has(objectId), `${objectId} darf bei nicht erfüllter Bedingung nicht existieren`).to.equal(false);
            continue;
        }

        expect(ctx.objects.get(objectId)?.common?.type, `${objectId} fehlt oder hat falschen Typ`).to.equal(def.iobType);

        if (def.readVal === undefined && isPrimitive(value)) {
            expect(ctx.states.get(objectId)?.val, `${objectId}: Wert`).to.deep.equal(value);
            compared++;
        }
    }

    return compared;
}

/**
 * Legt States für alle Einträge an, prüft Struktur und Werte und gibt die Anzahl der Wertvergleiche zurück.
 *
 * @param ctx Test-Kontext
 * @param definitions Tree-Definition
 * @param entries Channel-ID und Daten je Eintrag
 */
async function createAndCompareStates(ctx: TestContext, definitions: TreeDefinitions, entries: { channel: string; data: TreeData }[]): Promise<number> {
    let compared = 0;

    for (const { channel, data } of entries) {
        await createStates(ctx, channel, definitions, data);
        expectValidStateObjects(ctx, channel);
        compared += expectStatesMatchData(ctx, channel, definitions, data);
    }

    return compared;
}

function createStates(
    ctx: TestContext,
    channel: string,
    definitions: TreeDefinitions,
    data: TreeData,
    options: { blacklist?: BlacklistFilter; isWhiteList?: boolean; updateObject?: boolean } = {},
): Promise<boolean> {
    return ctx.iob.createOrUpdateStates(
        channel,
        definitions,
        data,
        data,
        options.blacklist,
        options.isWhiteList ?? false,
        String(data.name ?? channel),
        options.updateObject ?? false,
    );
}

/**
 * Liefert die ID (ohne Channel-Präfix) eines optionalen States, der im Basislauf angelegt wurde.
 *
 * @param definitions Tree-Definition
 * @param channel Channel-ID
 * @param createdIds Im Basislauf angelegte State-IDs
 */
function findOptionalStateId(definitions: TreeDefinitions, channel: string, createdIds: string[]): string {
    const defs = definitions as unknown as Record<string, StateDefinition>;
    const key = Object.keys(defs).find(k => isStateDefinition(defs[k]) && !defs[k].required && createdIds.includes(`${channel}.${defs[k].id ?? k}`));

    if (key === undefined) {
        throw new Error(`kein optionaler State unter ${channel} angelegt`);
    }
    return defs[key].id ?? key;
}

describe('myIob mit API-Fixtures (offline)', function () {
    let ctx: TestContext;

    before(() => {
        requireFixtures(FIXTURE_DIR, REQUIRED_FIXTURES);
    });

    beforeEach(() => {
        ctx = createTestContext();
    });

    afterEach(() => {
        expect(ctx.errors, 'Fehler im Logger').to.be.empty;
    });

    describe('Netzwerk-Geräte (devicesV2 / network_devices)', () => {
        it('legt Device, States und Werte für jedes Gerät an', async () => {
            const definitions = treeModule.device.get();
            const devices = readNetworkDevices();
            let compared = 0;

            for (const device of devices) {
                const channel = `${treeModule.device.idChannel}.${device.mac}`;
                await ctx.iob.createOrUpdateDevice(channel, device.name);
                await createStates(ctx, channel, definitions, device);

                expect(ctx.objects.get(channel)?.type, `${channel}: Device`).to.equal('device');
                expectValidStateObjects(ctx, channel);
                compared += expectStatesMatchData(ctx, channel, definitions, device);
            }

            expect(devices.length, 'Fixture enthält keine Geräte').to.be.greaterThan(0);
            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });

        it('ein zweiter Lauf mit unveränderten Daten meldet keine Änderung', async () => {
            const definitions = treeModule.device.get();

            for (const device of readNetworkDevices()) {
                const channel = `${treeModule.device.idChannel}.${device.mac}`;
                await createStates(ctx, channel, definitions, device);

                const changed = await createStates(ctx, channel, definitions, device);
                expect(changed, `${channel}: unveränderte Daten`).to.equal(false);
            }
        });

        it('übernimmt einen geänderten Wert beim nächsten Lauf', async () => {
            const definitions = treeModule.device.get();
            const defs = definitions as unknown as Record<string, StateDefinition>;
            const device = readNetworkDevices()[0];
            const channel = `${treeModule.device.idChannel}.${device.mac}`;
            await createStates(ctx, channel, definitions, device);

            const key = Object.keys(defs).find(
                k =>
                    isStateDefinition(defs[k]) &&
                    defs[k].readVal === undefined &&
                    defs[k].valFromProperty === undefined &&
                    isPrimitive(device[k]) &&
                    ctx.states.has(`${channel}.${defs[k].id ?? k}`),
            );
            if (key === undefined) {
                throw new Error('kein geeigneter primitiver State gefunden');
            }

            const changedValue = mutate(device[key]);
            const changed = await createStates(ctx, channel, definitions, { ...device, [key]: changedValue });

            expect(changed, 'Änderung wurde nicht erkannt').to.equal(true);
            expect(ctx.states.get(`${channel}.${defs[key].id ?? key}`)?.val).to.equal(changedValue);
        });

        it('Blacklist: blockierter State wird nicht angelegt, Pflicht-States bleiben erhalten', async () => {
            const definitions = treeModule.device.get();
            const device = readNetworkDevices()[0];
            const channel = `${treeModule.device.idChannel}.${device.mac}`;

            await createStates(ctx, channel, definitions, device);
            const baseline = getStateIds(ctx, channel);
            const blocked = findOptionalStateId(definitions, channel, baseline);

            ctx = createTestContext();
            await createStates(ctx, channel, definitions, device, { blacklist: [{ id: blocked }] });

            const created = getStateIds(ctx, channel);
            expect(created, 'blockierter State wurde angelegt').to.not.include(`${channel}.${blocked}`);
            expect(created.length, 'genau ein State fehlt').to.equal(baseline.length - 1);
        });

        it('Whitelist: nur der freigegebene State und Pflicht-States werden angelegt', async () => {
            const definitions = treeModule.device.get();
            const defs = definitions as unknown as Record<string, StateDefinition>;
            const device = readNetworkDevices()[0];
            const channel = `${treeModule.device.idChannel}.${device.mac}`;

            await createStates(ctx, channel, definitions, device);
            const baseline = getStateIds(ctx, channel);
            const allowedId = findOptionalStateId(definitions, channel, baseline);
            const allowed = `${channel}.${allowedId}`;

            ctx = createTestContext();
            await createStates(ctx, channel, definitions, device, { blacklist: [{ id: allowedId }], isWhiteList: true });

            const requiredIds = Object.entries(defs)
                .filter(([, def]) => isStateDefinition(def) && def.required === true)
                .map(([key, def]) => `${channel}.${def.id ?? key}`);
            const created = getStateIds(ctx, channel);

            expect(created, 'freigegebener State fehlt').to.include(allowed);
            for (const id of created) {
                expect(id === allowed || requiredIds.includes(id), `${id} ist nicht freigegeben`).to.equal(true);
            }
        });
    });

    describe('Clients (clientsActiveV2)', () => {
        it('übernimmt Werte aller aktiven Clients', async () => {
            const definitions = treeModule.client.get();
            const clients = readActiveClients();

            const compared = await createAndCompareStates(
                ctx,
                definitions,
                clients.map(client => ({ channel: `${treeModule.client.idChannelUsers}.${client.mac}`, data: client })),
            );

            expect(clients.length, 'Fixture enthält keine Clients').to.be.greaterThan(0);
            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });
    });

    describe('WLAN und LAN (V2, zusammengeführt wie in main.ts)', () => {
        it('WLAN: übernimmt States und Werte jeder Konfiguration', async () => {
            const wlans = readMergedV2('wlanConfigV2');

            const compared = await createAndCompareStates(
                ctx,
                treeModule.wlan.get(),
                wlans.map(wlan => ({ channel: `${treeModule.wlan.idChannel}.${wlan._id}`, data: wlan })),
            );

            expect(wlans.length, 'Fixture enthält keine WLANs').to.be.greaterThan(0);
            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });

        it('LAN: übernimmt States und Werte jedes Netzwerks', async () => {
            const lans = readMergedV2('lanConfigV2');

            const compared = await createAndCompareStates(
                ctx,
                treeModule.lan.get(),
                lans.map(lan => ({ channel: `${treeModule.lan.idChannel}.${lan._id}`, data: lan })),
            );

            expect(lans.length, 'Fixture enthält keine LANs').to.be.greaterThan(0);
            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });
    });

    describe('SysInfo (sysinfo)', () => {
        it('übernimmt die Controller-Informationen', async () => {
            const sysInfo = readSysInfo();

            const compared = await createAndCompareStates(ctx, treeModule.sysInfo.get(), [{ channel: treeModule.sysInfo.idChannel, data: sysInfo }]);

            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });
    });

    describe('Firewall-Gruppen (firewallGroup)', () => {
        it('übernimmt States und Werte jeder Gruppe', async () => {
            const groups = (readFixture('firewallGroup') as { data: TreeData[] }).data;

            const compared = await createAndCompareStates(
                ctx,
                treeModule.firewall.group.get(),
                groups.map(group => ({ channel: `${treeModule.firewall.group.idChannel}.${group._id}`, data: group })),
            );

            expect(groups.length, 'Fixture enthält keine Firewall-Gruppen').to.be.greaterThan(0);
            expect(compared, 'es wurden keine Werte verglichen').to.be.greaterThan(0);
        });

        it('speichert group_members als JSON-String', async () => {
            const groups = (readFixture('firewallGroup') as { data: TreeData[] }).data;
            const group = groups[0];
            const channel = `${treeModule.firewall.group.idChannel}.${group._id}`;

            await createStates(ctx, channel, treeModule.firewall.group.get(), group);

            expect(ctx.states.get(`${channel}.group_members`)?.val, 'group_members').to.equal(JSON.stringify(group.group_members));
        });
    });

    describe('deepDiffBetweenObjects mit Gerätedaten', () => {
        it('meldet nur Änderungen an Feldern der Tree-Definition', () => {
            const allowedKeys = treeModule.device.getKeys();
            const device = readNetworkDevices()[0];
            const adapter = ctx.adapter as unknown as ioBroker.Adapter;

            expect(ctx.iob.deepDiffBetweenObjects(structuredClone(device), device, adapter, allowedKeys), 'identische Daten').to.deep.equal({});

            const allowedKey = allowedKeys.find((k: string) => isPrimitive(device[k]));
            if (allowedKey === undefined) {
                throw new Error('kein primitives Feld in der Tree-Definition gefunden');
            }
            const diff = ctx.iob.deepDiffBetweenObjects({ ...device, [allowedKey]: mutate(device[allowedKey]) }, device, adapter, allowedKeys);
            expect(Object.keys(diff), 'Diff bei geändertem Feld').to.deep.equal([allowedKey]);
        });

        it('ignoriert Änderungen an Feldern außerhalb der Tree-Definition', () => {
            const allowedKeys = treeModule.device.getKeys();
            const device = readNetworkDevices()[0];
            const adapter = ctx.adapter as unknown as ioBroker.Adapter;

            const ignoredKey = Object.keys(device).find(k => !allowedKeys.includes(k) && isPrimitive(device[k]));
            if (ignoredKey === undefined) {
                throw new Error('kein Feld außerhalb der Tree-Definition in den Fixtures gefunden');
            }
            const diff = ctx.iob.deepDiffBetweenObjects({ ...device, [ignoredKey]: mutate(device[ignoredKey]) }, device, adapter, allowedKeys);

            expect(diff, `Änderung an ${ignoredKey}`).to.deep.equal({});
        });
    });
});

// --- Befund-Tests zu offenen Punkten -------------------------------------------------------------
// Prüfen die Vermutungen aus der Analyse von myIob (step/expert, icon, getIdWithoutLastPart).

/**
 * Entfernt step und expert aus einer Tree-Definition (rekursiv über object).
 * Simuliert einen gespeicherten Stand, der vor der Einführung dieser Eigenschaften angelegt wurde.
 *
 * @param defs Tree-Definition
 */
function stripStepAndExpert(defs: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, def] of Object.entries(defs)) {
        const copy: Record<string, any> = { ...def };
        delete copy.step;
        delete copy.expert;
        if (copy.object) {
            copy.object = stripStepAndExpert(copy.object as Record<string, any>);
        }
        result[key] = copy;
    }
    return result;
}

/**
 * Sammelt alle State-Definitionen mit step oder expert samt erwarteter Object-ID (rekursiv über object).
 * Arrays werden nicht ausgewertet.
 *
 * @param defs Tree-Definition
 * @param channel Channel-ID
 */
function collectStatesWithStepOrExpert(defs: Record<string, any>, channel: string): { id: string; def: Record<string, any> }[] {
    const found: { id: string; def: Record<string, any> }[] = [];
    for (const [key, def] of Object.entries(defs)) {
        if (def.iobType !== undefined && (def.step !== undefined || def.expert !== undefined)) {
            found.push({ id: `${channel}.${def.id ?? key}`, def });
        }
        if (def.object) {
            found.push(...collectStatesWithStepOrExpert(def.object as Record<string, any>, `${channel}.${key}`));
        }
    }
    return found;
}

describe('Befund: offene Punkte (myIob, offline)', function () {
    let ctx: TestContext;
    const channel = `${NAMESPACE}.test`;

    beforeEach(() => {
        ctx = createTestContext();
    });

    afterEach(() => {
        expect(ctx.errors, 'Fehler im Logger').to.be.empty;
    });

    it('step und expert werden bei updateObject=true in einen bestehenden State übernommen', async () => {
        await ctx.iob.createOrUpdateStates(channel, { level: { iobType: 'number' } } as unknown as TreeDefinitions, testData({ level: 1 }), testData({ level: 1 }), undefined, false, 'dev', true);

        await ctx.iob.createOrUpdateStates(
            channel,
            { level: { iobType: 'number', step: 5, expert: true } } as unknown as TreeDefinitions,
            testData({ level: 1 }),
            testData({ level: 1 }),
            undefined,
            false,
            'dev',
            true,
        );

        const common = ctx.objects.get(`${channel}.level`)?.common;
        expect(common?.step, 'step').to.equal(5);
        expect(common?.expert, 'expert').to.equal(true);
    });

    it('ein manuell gesetztes icon führt bei identischen Läufen nicht zu extendObject', async () => {
        const definition = { v: { iobType: 'number' } } as unknown as TreeDefinitions;
        const data = testData({ v: 1 });
        await ctx.iob.createOrUpdateStates(channel, definition, data, data, undefined, false, 'dev', true);
        const obj = ctx.objects.get(`${channel}.v`);
        if (obj?.common) {
            obj.common.icon = 'custom.png';
        }

        ctx.extendedIds.splice(0);
        await ctx.iob.createOrUpdateStates(channel, definition, data, data, undefined, false, 'dev', true);
        await ctx.iob.createOrUpdateStates(channel, definition, data, data, undefined, false, 'dev', true);

        expect(ctx.extendedIds, 'extendObject-Aufrufe').to.deep.equal([]);
    });

    it('getIdWithoutLastPart liefert für eine ID ohne Punkt einen leeren String (kein bekannter Aufrufer)', () => {
        expect(ctx.iob.getIdWithoutLastPart('abc')).to.equal('');
    });
});

describe('Befund: offene Punkte (myIob, mit API-Fixtures)', function () {
    let ctx: TestContext;

    before(() => {
        requireFixtures(FIXTURE_DIR, REQUIRED_FIXTURES);
    });

    beforeEach(() => {
        ctx = createTestContext();
        // imageUrl (expert) hängt an diesen Optionen; ohne sie wird der State nicht angelegt
        Object.assign(ctx.adapter.config as Record<string, unknown>, { deviceImageDownload: true, clientImageDownload: true });
        // Bild-Download ist im Mock nicht vorhanden; nur der Aufruf wird benötigt
        (ctx.adapter as unknown as { checkImageDownload: () => Promise<void> }).checkImageDownload = async (): Promise<void> => { };
    });

    afterEach(() => {
        expect(ctx.errors, 'Fehler im Logger').to.be.empty;
    });

    /**
     * Legt States mit einer Basis-Definition ohne step/expert an und aktualisiert sie danach mit der vollständigen Definition.
     * Liefert die Anzahl geprüfter States (existierend, mit step/expert) und die IDs der Abweichungen.
     *
     * @param definitions vollständige Tree-Definition
     * @param channel Channel-ID
     * @param data Quelldaten
     */
    async function checkStepOrExpert(definitions: Record<string, any>, channel: string, data: TreeData): Promise<{ checked: number; mismatches: string[] }> {
        await createStates(ctx, channel, stripStepAndExpert(definitions) as TreeDefinitions, data);
        await createStates(ctx, channel, definitions as TreeDefinitions, data, { updateObject: true });

        const existing = collectStatesWithStepOrExpert(definitions, channel).filter(({ id }) => ctx.objects.has(id));
        const mismatches = existing
            .filter(({ id, def }) => {
                const common = ctx.objects.get(id)?.common;
                return (def.step !== undefined && common?.step !== def.step) || (def.expert !== undefined && common?.expert !== def.expert);
            })
            .map(({ id }) => id);
        return { checked: existing.length, mismatches };
    }

    it('step und expert der Geräte-Tree-Definition landen nach updateObject=true in den bestehenden States', async () => {
        const device = readNetworkDevices()[0];
        const channel = `${treeModule.device.idChannel}.${device.mac}`;
        const definitions = treeModule.device.get() as unknown as Record<string, any>;

        const { checked, mismatches } = await checkStepOrExpert(definitions, channel, device);
        expect(checked, 'angelegte States mit step/expert').to.be.greaterThan(0);
        expect(mismatches, 'States ohne übernommenes step/expert').to.deep.equal([]);
    });

    it('step und expert der Client-Tree-Definition landen nach updateObject=true in den bestehenden States', async () => {
        const client = readActiveClients()[0];
        const channel = `${treeModule.client.idChannelUsers}.${client.mac}`;
        const definitions = treeModule.client.get() as unknown as Record<string, any>;

        const { checked, mismatches } = await checkStepOrExpert(definitions, channel, client);
        expect(checked, 'angelegte States mit step/expert').to.be.greaterThan(0);
        expect(mismatches, 'States ohne übernommenes step/expert').to.deep.equal([]);
    });

    it('zweiter identischer Lauf über Geräte-States schreibt nichts (ohne manuell gesetztes icon)', async () => {
        const device = readNetworkDevices()[0];
        const channel = `${treeModule.device.idChannel}.${device.mac}`;
        const definitions = treeModule.device.get();

        await createStates(ctx, channel, definitions, device, { updateObject: true });

        ctx.extendedIds.splice(0);
        await createStates(ctx, channel, definitions, device, { updateObject: true });

        expect(ctx.extendedIds, 'extendObject-Aufrufe im zweiten Lauf').to.deep.equal([]);
    });
});

