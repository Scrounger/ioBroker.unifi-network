/**
 * Records real-time events of the UniFi controller as local, anonymized fixtures.
 *
 * - Events the adapter evaluates are recorded interactively. The recorder names the action to trigger
 *   and waits until the matching event arrives. Enter or `s` skips a scenario, `q` ends the session.
 * - Cyclic messages (device, client, user) are recorded automatically, with at most `ENTITY_LIMIT` entities each.
 * - Writes one JSON file per event key or message type to `test/fixtures/local/<version>/events/`.
 *   `<version>` is the network application version from `sysinfo`, read before the recording starts.
 * - All documents are anonymized in one call, so placeholders match across files.
 * - Nothing is written if a leak of the controller host, user or password is detected.
 *
 * Usage: npm run record:events [-- --destructive] [-- --only=client-connected,device-restarted] [-- --missing] [-- --dry-run] [-- --no-anonymize]
 *   --destructive    also asks for scenarios that delete data on the controller
 *   --only=ids       asks only for the listed scenario ids
 *   --missing        asks only for scenarios without a recorded message and does not overwrite existing files
 *   --dry-run        lists the files that would be written, writes nothing
 *   --no-anonymize   writes the data unchanged: no anonymization, no removal of secret entries, no leak check
 * Required: UNIFI_HOST, UNIFI_USER, UNIFI_PASSWORD (see liveHelper.test.ts)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { ApiEndpoints } from '../src/lib/api/network-api.js';
import { createLiveApi, describeMessages, getLiveConfig, type LiveSession } from '../test/tools/liveHelper.test.js';
import { anonymize, findLeaks, removeSecretEntries } from './anonymizeFixtures.js';
import {
    CYCLIC_MESSAGES,
    ENTITY_LIMIT,
    entityId,
    handledEventItems,
    isCyclicMessage,
    isManualMessage,
    REQUIRED_CYCLIC_MESSAGES,
    SCENARIOS,
    toFileName,
    type Scenario,
    type WsMessage,
} from './eventScenarios.js';
import { fixtureDir, versionFromSysInfo } from './fixtureVersions.js';

/** Maximum time the recorder waits for the cyclic messages at the end. */
const CYCLIC_WAIT_MS = 60_000;

/** Number of samples kept per event key and per manual message type. */
const SAMPLES_PER_TRIGGER = 1;

/** One JSON file of the events directory. */
interface FixtureFile {
    name: string;
    document: Record<string, unknown>;
}

/** Collected data for one fixture file. */
interface CollectedRecord {
    /** `events`, the message name for manual messages or cyclic messages. */
    message: string;
    /** Event key, only for event fixtures. */
    key?: string;
    /** Cyclic messages keep a fixed number of entities, the others are single samples. */
    cyclic: boolean;
    /** Number of messages of this type that arrived, including those not kept. */
    seenMessages: number;
    /** Identifiers of the entities already kept, cyclic messages only. */
    entities: Set<string>;
    /** Recorded messages (`meta` and the kept `data`). */
    samples: { meta: WsMessage['meta']; data: unknown }[];
}

type Outcome = { kind: 'done' } | { kind: 'skipped' } | { kind: 'quit' } | { kind: 'timeout' };

interface Options {
    destructive: boolean;
    only: string[] | undefined;
    missing: boolean;
    dryRun: boolean;
    noAnonymize: boolean;
}

/**
 * Reads the command line options.
 *
 * @param args arguments without the node and script path
 * @throws {Error} if an unknown scenario id is passed to `--only`
 */
function parseOptions(args: string[]): Options {
    const onlyArg = args.find((arg: string): boolean => arg.startsWith('--only='));
    const only = onlyArg
        ? onlyArg.slice('--only='.length).split(',').map((id: string): string => id.trim()).filter((id: string): boolean => id !== '')
        : undefined;

    const unknown = (only ?? []).filter((id: string): boolean => !SCENARIOS.some((scenario: Scenario): boolean => scenario.id === id));
    if (unknown.length > 0) {
        throw new Error(`Unknown scenarios in --only: ${unknown.join(', ')}`);
    }

    return {
        destructive: args.includes('--destructive'),
        only,
        missing: args.includes('--missing'),
        dryRun: args.includes('--dry-run'),
        noAnonymize: args.includes('--no-anonymize'),
    };
}

/**
 * Selects the scenarios to ask for, depending on the options.
 *
 * @param options command line options
 * @param covered ids of scenarios that already have a recorded message, skipped with `--missing`
 */
function selectScenarios(options: Options, covered: ReadonlySet<string>): Scenario[] {
    return SCENARIOS.filter((scenario: Scenario): boolean => {
        if (options.missing && covered.has(scenario.id)) {
            return false;
        }
        if (options.only) {
            return options.only.includes(scenario.id);
        }
        return options.destructive || !scenario.destructive;
    });
}

/** Shape of a fixture file as written by `main()`. */
interface StoredDocument {
    message?: string;
    samples?: { meta: WsMessage['meta']; data: unknown }[];
}

/**
 * Returns the ids of the scenarios that already have a message in the events directory.
 * The stored samples are checked with the same matchers that are used during a recording.
 *
 * @param dir events directory of the controller version
 */
function coveredScenarioIds(dir: string): Set<string> {
    const covered = new Set<string>();
    if (!existsSync(dir)) {
        return covered;
    }

    for (const file of readdirSync(dir).filter((name: string): boolean => name.endsWith('.json'))) {
        const document = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as StoredDocument;
        for (const sample of document.samples ?? []) {
            // event samples store one item, the matchers expect the data of the whole message
            const message: WsMessage = { meta: sample.meta, data: document.message === 'events' ? [sample.data] : sample.data };
            for (const scenario of SCENARIOS) {
                if (scenario.matches(message)) {
                    covered.add(scenario.id);
                }
            }
        }
    }
    return covered;
}

/**
 * Collects the messages of one session and decides what is kept.
 */
class EventRecorder {
    private readonly records = new Map<string, CollectedRecord>();
    private readonly matched = new Set<string>();
    private waiting: ((outcome: Outcome) => void) | undefined;
    private waitingDone: (() => boolean) | undefined;

    constructor(
        private readonly scenarios: readonly Scenario[],
        private readonly rl: Interface,
    ) { }

    /**
     * Processes one message from the events WebSocket.
     *
     * @param message WebSocket message
     */
    handle(message: WsMessage): void {
        for (const scenario of this.scenarios) {
            if (scenario.matches(message)) {
                this.matched.add(scenario.id);
            }
        }

        const name = message.meta.message;
        if (name === 'events') {
            for (const item of handledEventItems(message)) {
                const key = String(item.key);
                this.keepSample(this.recordFor(key, { message: 'events', key, cyclic: false }), { meta: message.meta, data: item }, SAMPLES_PER_TRIGGER);
            }
        } else if (isCyclicMessage(name)) {
            this.keepCyclic(message);
        } else if (isManualMessage(message)) {
            this.keepSample(this.recordFor(toFileName(name), { message: name, cyclic: false }), { meta: message.meta, data: message.data }, SAMPLES_PER_TRIGGER);
        }

        if (this.waitingDone?.()) {
            this.waiting?.({ kind: 'done' });
        }
    }

    /**
     * Asks for each scenario in turn. Returns `true` if the user quit.
     */
    async askScenarios(): Promise<boolean> {
        const total = this.scenarios.length;

        for (const [index, scenario] of this.scenarios.entries()) {
            const step = `[${index + 1}/${total}]`;

            if (this.matched.has(scenario.id)) {
                console.log(`${step} ${scenario.prompt}: already recorded`);
                continue;
            }

            console.log(`\n${step} ${scenario.prompt}`);
            console.log('    Waiting for the event. Enter or s = skip, q = quit and save.');

            const outcome = await this.waitFor((): boolean => this.matched.has(scenario.id));
            if (outcome.kind === 'quit') {
                return true;
            }
            console.log(outcome.kind === 'done' ? '    recorded' : '    skipped');
        }

        return false;
    }

    /**
     * Waits until the cyclic messages delivered their entity quota or the time is up.
     */
    async waitForCyclic(): Promise<void> {
        if (this.cyclicComplete()) {
            return;
        }

        console.log(`\nWaiting for cyclic data (max. ${CYCLIC_WAIT_MS / 1000} s). Enter = quit.`);
        const outcome = await this.waitFor((): boolean => this.cyclicComplete(), CYCLIC_WAIT_MS);
        if (outcome.kind === 'timeout') {
            console.log('  Time is up, saving the existing data.');
        }
    }

    /**
     * Returns the fixture files of all kept samples, sorted by name.
     *
     * @param recordedAt ISO timestamp written into every fixture
     */
    fixtures(recordedAt: string): FixtureFile[] {
        return [...this.records.entries()]
            .filter(([, record]: [string, CollectedRecord]): boolean => record.samples.length > 0)
            .sort(([a]: [string, CollectedRecord], [b]: [string, CollectedRecord]): number => a.localeCompare(b))
            .map(([name, record]: [string, CollectedRecord]): FixtureFile => ({
                name,
                document: {
                    message: record.message,
                    ...(record.key ? { key: record.key } : {}),
                    recordedAt,
                    ...(record.cyclic ? { entityLimit: ENTITY_LIMIT } : {}),
                    seenMessages: record.seenMessages,
                    samples: record.samples,
                },
            }));
    }

    /** Returns the scenarios that have not matched a message. */
    missingScenarios(): Scenario[] {
        return this.scenarios.filter((scenario: Scenario): boolean => !this.matched.has(scenario.id));
    }

    /** Returns true if every required cyclic message delivered its full entity quota. */
    private cyclicComplete(): boolean {
        return REQUIRED_CYCLIC_MESSAGES.every((name: string): boolean => (this.records.get(toFileName(name))?.entities.size ?? 0) >= ENTITY_LIMIT);
    }

    /**
     * Keeps new entities of a cyclic message until the quota is reached.
     *
     * @param message cyclic WebSocket message
     */
    private keepCyclic(message: WsMessage): void {
        const record = this.recordFor(toFileName(message.meta.message), { message: message.meta.message, cyclic: true });
        if (!Array.isArray(message.data)) {
            this.keepSample(record, { meta: message.meta, data: message.data }, 1);
            return;
        }

        const fresh: unknown[] = [];
        for (const item of message.data) {
            if (record.entities.size >= ENTITY_LIMIT) {
                break;
            }
            const id = entityId(item);
            if (!record.entities.has(id)) {
                record.entities.add(id);
                fresh.push(item);
            }
        }

        if (fresh.length > 0) {
            record.samples.push({ meta: message.meta, data: fresh });
        }
    }

    /**
     * Adds a sample if the record has less than `limit` samples.
     *
     * @param record target record
     * @param sample sample to keep
     * @param limit maximum number of samples
     */
    private keepSample(record: CollectedRecord, sample: CollectedRecord['samples'][number], limit: number): void {
        if (record.samples.length < limit) {
            record.samples.push(sample);
        }
    }

    /**
     * Returns the record for a fixture file and counts the message.
     *
     * @param name file name without extension
     * @param init initial values, used when the record is created
     */
    private recordFor(name: string, init: Omit<CollectedRecord, 'seenMessages' | 'entities' | 'samples'>): CollectedRecord {
        let record = this.records.get(name);
        if (!record) {
            record = { ...init, seenMessages: 0, entities: new Set<string>(), samples: [] };
            this.records.set(name, record);
        }
        record.seenMessages += 1;
        return record;
    }

    /**
     * Waits for a message from the user or until `done` returns true.
     *
     * @param done condition that ends the wait, checked on every message
     * @param timeoutMs optional timeout
     */
    private async waitFor(done: () => boolean, timeoutMs?: number): Promise<Outcome> {
        if (done()) {
            return { kind: 'done' };
        }

        const controller = new AbortController();
        let resolveWait: (outcome: Outcome) => void = (): void => undefined;
        const arrived = new Promise<Outcome>((resolve: (outcome: Outcome) => void): void => {
            resolveWait = resolve;
        });

        this.waiting = resolveWait;
        this.waitingDone = done;
        const timer = timeoutMs ? setTimeout((): void => resolveWait({ kind: 'timeout' }), timeoutMs) : undefined;

        try {
            for (; ;) {
                const input = this.rl
                    .question('> ', { signal: controller.signal })
                    .then((answer: string): Outcome | undefined => this.interpret(answer), (): Outcome => ({ kind: 'quit' }));

                const outcome = await Promise.race([arrived, input]);
                if (outcome) {
                    return outcome;
                }
                console.log('    Please enter Enter, s or q.');
            }
        } finally {
            controller.abort();
            clearTimeout(timer);
            this.waiting = undefined;
            this.waitingDone = undefined;
        }
    }

    /**
     * Maps a typed answer to an outcome. Returns `undefined` for unknown input.
     *
     * @param answer text typed by the user
     */
    private interpret(answer: string): Outcome | undefined {
        const normalized = answer.trim().toLowerCase();
        if (normalized === '' || normalized === 's') {
            return { kind: 'skipped' };
        }
        if (normalized === 'q') {
            return { kind: 'quit' };
        }
        return undefined;
    }
}

async function main(): Promise<number> {
    const options = parseOptions(process.argv.slice(2));

    const config = getLiveConfig();
    if (!config) {
        console.error('Missing credentials: UNIFI_HOST, UNIFI_USER and UNIFI_PASSWORD must be set.');
        return 1;
    }

    const secrets = [config.host, config.user, config.password];
    const session: LiveSession = createLiveApi(config);
    const { api } = session;

    if (!(await api.login())) {
        console.error(`Login failed. ${describeMessages(session.messages)}`);
        return 1;
    }

    const version = versionFromSysInfo(await api.retrievData(api.getApiEndpoint(ApiEndpoints.sysinfo)));
    if (!version) {
        api.logout();
        console.error('No version found in the sysinfo response, nothing was written.');
        return 1;
    }
    console.log(`Controller-Version ${version}`);

    const eventsDir = fixtureDir(version, 'events');
    const scenarios = selectScenarios(options, coveredScenarioIds(eventsDir));
    if (options.missing && scenarios.length === 0) {
        api.logout();
        console.log('All scenarios are already recorded, nothing to do.');
        return 0;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', (): void => {
        rl.close();
        process.exit(130);
    });

    const recorder = new EventRecorder(scenarios, rl);
    api.on('message', (message: WsMessage): void => {
        try {
            recorder.handle(message);
        } catch (error) {
            console.error(`Message could not be processed: ${String(error)}`);
        }
    });

    const skippedDestructive = SCENARIOS.filter((scenario: Scenario): boolean => scenario.destructive && !scenarios.includes(scenario));
    console.log(`Cyclic (automatic): ${CYCLIC_MESSAGES.join(', ')}`);
    console.log(`Scenarios: ${scenarios.length}${skippedDestructive.length > 0 ? ` (excluding destructive, start with --destructive: ${skippedDestructive.length})` : ''}`);

    try {
        if (!(await api.launchEventsWs())) {
            console.error(`Event WebSocket could not be opened. ${describeMessages(session.messages)}`);
            return 1;
        }

        const quit = await recorder.askScenarios();
        if (!quit) {
            await recorder.waitForCyclic();
        }
    } finally {
        rl.close();
        api.logout();
    }

    const recordedAt = new Date().toISOString();
    const files = recorder.fixtures(recordedAt);
    if (files.length === 0) {
        console.error('No events recorded, nothing was written.');
        return 1;
    }

    const prepared = options.noAnonymize
        ? files.map((file: FixtureFile): Record<string, unknown> => file.document)
        : removeSecretEntries(files.map((file: FixtureFile): Record<string, unknown> => file.document));
    if (options.noAnonymize) {
        console.warn('Warning: without anonymization, the data is stored unchanged.');
    }
    const anonymized = options.noAnonymize ? prepared : anonymize(prepared, secrets);
    const contents = files.map((file: FixtureFile, index: number) => ({
        name: file.name,
        content: `${JSON.stringify({ ...anonymized[index], anonymized: !options.noAnonymize }, null, 2)}\n`,
    }));

    const leaks = options.noAnonymize ? [] : [...new Set(contents.flatMap((file) => findLeaks(file.content, secrets)))];
    if (leaks.length > 0) {
        console.error(`Aborted, non-anonymized data found (${leaks.length} matches). Nothing was written.`);
        return 1;
    }

    const existing = new Set(existsSync(eventsDir) ? readdirSync(eventsDir) : []);
    const written = contents.filter((file: { name: string }): boolean => !(options.missing && existing.has(`${file.name}.json`)));
    const target = path.relative(process.cwd(), eventsDir);

    if (options.dryRun) {
        console.log(`\nDry run, nothing written. ${written.length} fixtures would be written to ${target}:`);
    } else {
        mkdirSync(eventsDir, { recursive: true });
        for (const file of written) {
            writeFileSync(path.join(eventsDir, `${file.name}.json`), file.content, 'utf8');
        }
        console.log(`\n${written.length} fixtures written to ${target}:`);
    }
    for (const file of written) {
        console.log(`  ${file.name}.json`);
    }
    if (written.length < contents.length) {
        console.log(`${contents.length - written.length} existing fixtures left unchanged (--missing).`);
    }

    const missing = recorder.missingScenarios();
    if (missing.length > 0) {
        console.log(`Not recorded: ${missing.map((scenario: Scenario): string => scenario.id).join(', ')}`);
    }

    return 0;
}

main()
    .then((code: number): void => {
        process.exitCode = code;
    })
    .catch((error: unknown): void => {
        console.error(`Recording failed: ${String(error)}`);
        process.exitCode = 1;
    });
