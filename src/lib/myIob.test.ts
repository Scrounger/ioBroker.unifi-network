import { expect } from 'chai';
import { copyFileSync, existsSync, lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fixtureDir, latestFixtureVersion } from '../live/fixtureVersions.js';

type MyIobClass = typeof import('./myIob.js').myIob;
type MyIobArgs = ConstructorParameters<MyIobClass>;
type TreeModule = typeof import('./tree/index.js');
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
}

/**
 * `myIob` is a symlink to `../shared/myIob.ts` outside of this repository.
 * The module is loaded lazily, so the suite can be skipped when that file or its dependencies (lodash) are not resolvable.
 */
let myIob: MyIobClass;

/** Pfad des Moduls im Projekt (normalerweise ein Symlink auf das Shared-Modul). */
const MODULE_PATH = fileURLToPath(new URL('./myIob.ts', import.meta.url));

/** Symlink-Ziel, das nach den Tests wiederhergestellt wird. */
let savedSymlinkTarget: string | undefined;

/**
 * Ersetzt den Symlink durch eine Kopie der Shared-Datei, damit das Modul im Projektkontext
 * (Projekt-`node_modules` mit lodash, ESM) aufgelöst wird. Ohne Symlink oder ohne Quelle passiert nichts.
 */
function replaceSymlinkWithCopy(): void {
    const stats = lstatSync(MODULE_PATH, { throwIfNoEntry: false });
    if (!stats?.isSymbolicLink()) {
        return;
    }

    const target = readlinkSync(MODULE_PATH);
    const source = resolve(dirname(MODULE_PATH), target);
    if (!existsSync(source)) {
        return;
    }

    // Ziel vor dem Austausch merken, damit auch ein fehlgeschlagenes copyFileSync wiederhergestellt wird.
    savedSymlinkTarget = target;
    unlinkSync(MODULE_PATH);
    copyFileSync(source, MODULE_PATH);
}

/**
 * Entfernt die Kopie und stellt den ursprünglichen Symlink wieder her.
 */
function restoreSymlink(): void {
    if (savedSymlinkTarget === undefined) {
        return;
    }

    rmSync(MODULE_PATH, { force: true });
    symlinkSync(savedSymlinkTarget, MODULE_PATH);
    savedSymlinkTarget = undefined;
}

// Absicherung: Symlink auch bei Prozessende oder Abbruch (Strg+C) wiederherstellen.
process.once('exit', restoreSymlink);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        restoreSymlink();
        process.exit(130);
    });
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

    const log = {
        level: 'debug',
        silly: (): void => undefined,
        debug: (): void => undefined,
        info: (): void => undefined,
        warn: (): void => undefined,
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
        setState: writeState('setState'),
        setStateChangedAsync: writeState('setStateChangedAsync'),
    };

    const utils = {
        I18n: {
            getTranslatedObject: (text: string): Record<string, string> => ({ en: text }),
        },
    };

    const iob = new myIob(adapter as unknown as MyIobArgs[0], utils as unknown as MyIobArgs[1]);

    return { adapter, iob, objects, states, stateCalls, extendedIds, errors };
}


describe('myIob (offline)', function () {
    let ctx: TestContext;

    before(async function () {
        replaceSymlinkWithCopy();
        try {
            ({ myIob } = await import('./myIob.js'));
        } catch {
            this.skip();
            return;
        }
    });

    after(() => {
        restoreSymlink();
    });

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
    let treeModule: TreeModule;

    before(async function () {
        if (!REQUIRED_FIXTURES.every(name => existsSync(resolve(FIXTURE_DIR, `${name}.json`)))) {
            this.skip();
            return;
        }

        replaceSymlinkWithCopy();
        try {
            ({ myIob } = await import('./myIob.js'));
        } catch {
            this.skip();
            return;
        }
        treeModule = await import('./tree/index.js');
    });

    after(() => {
        restoreSymlink();
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
