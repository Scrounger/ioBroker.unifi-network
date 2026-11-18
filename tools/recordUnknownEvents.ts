/**
 * Records unknown real-time events of the UniFi controller as local, anonymized fixtures.
 *
 * "Unknown" means the adapter does not know the item at all. These are the cases that log `not implemented` in `main.ts`:
 * - items of an `events` message whose key is not part of `WebSocketEvent`
 * - messages that are neither dispatched in `onNetworkMessage` nor listed in `ignoredWebSocketMessages`
 *
 * - Writes one JSON file per unknown event key or message name to `test/fixtures/local/<version>/events/unknown/`.
 *   Names: `event-<KEY>.json` for event keys, `message-<name>.json` for other messages.
 * - No spam: each unknown key or message name is written once. Further occurrences only increase `seenMessages`.
 *   Keys that already have a file in the directory from an earlier run are skipped.
 * - The capture starts after asking for a maximum runtime in minutes (default 15). It ends with `q` + Enter (saves),
 *   when the runtime is over (saves), or with Ctrl+C (aborts without saving).
 * - All documents are anonymized in one call and checked for leaks. Nothing is written if a leak is detected.
 *
 * Usage: npm run record:events:unknown
 * Required: UNIFI_HOST, UNIFI_USER, UNIFI_PASSWORD (see liveHelper.test.ts)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { ApiEndpoints } from '../src/lib/api/network-api.js';
import { WebSocketEventMessages } from '../src/lib/myTypes.js';
import { anonymize, findLeaks, removeSecretEntries } from './anonymizeFixtures.js';
import { isKnownMessage, toFileName, unknownEventItems, type WsMessage } from './eventScenarios.js';
import { fixtureDir, versionFromSysInfo } from './fixtureVersions.js';
import { createLiveApi, describeMessages, getLiveConfig, type LiveSession } from './liveHelper.test.js';

/** Default maximum runtime in minutes, used when the prompt is answered with Enter. */
const DEFAULT_MINUTES = 15;

/** Sub directory of the events fixtures that holds the unknown events. */
const UNKNOWN_DIR = 'unknown';

/** Why the capture ended. */
type Stop = 'quit' | 'timeout' | 'error';

/** One JSON file of the unknown directory. */
interface FixtureFile {
    name: string;
    document: Record<string, unknown>;
}

/** Collected data for one unknown event key or message name. */
interface UnknownRecord {
    /** Identifier used for de-duplication, see `idOf()`. */
    id: string;
    /** `events` for event keys, the message name otherwise. */
    message: string;
    /** Event key, only for unknown items of `events` messages. */
    key?: string;
    /** File name without `.json`. */
    fileName: string;
    firstSeenAt: string;
    lastSeenAt: string;
    /** Number of messages with this key or name, including the first one. */
    seenMessages: number;
    /** The first message that carried this key or name (`meta` and `data`). */
    sample: { meta: WsMessage['meta']; data: unknown };
}

/**
 * Returns the de-duplication identifier of an unknown key or message name.
 *
 * @param message `meta.message` of the message
 * @param key event key, only for items of `events` messages
 */
function idOf(message: string, key: string | undefined): string {
    return key !== undefined ? `events:${key}` : `message:${message}`;
}

/**
 * Returns the file name (without `.json`) for an unknown key or message name.
 *
 * @param message `meta.message` of the message
 * @param key event key, only for items of `events` messages
 */
function fileNameOf(message: string, key: string | undefined): string {
    return key !== undefined ? `event-${toFileName(key)}` : `message-${toFileName(message)}`;
}

/**
 * Reads the identifiers of the unknown fixtures that already exist, so they are not recorded again.
 *
 * @param dir unknown directory of the events fixtures
 */
function loadExistingIds(dir: string): Set<string> {
    const ids = new Set<string>();
    if (!existsSync(dir)) {
        return ids;
    }
    for (const file of readdirSync(dir).filter((name: string): boolean => name.endsWith('.json'))) {
        const document = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { message?: unknown; key?: unknown };
        if (typeof document.message === 'string') {
            ids.add(idOf(document.message, typeof document.key === 'string' ? document.key : undefined));
        }
    }
    return ids;
}

/**
 * Keeps one record per unknown key or message name. Known keys and ids from earlier runs are ignored.
 */
class UnknownCollector {
    private readonly records = new Map<string, UnknownRecord>();

    /**
     * @param skip identifiers that are already recorded in earlier runs
     * @param onNew called once for every new unknown key or message name
     */
    constructor(
        private readonly skip: ReadonlySet<string>,
        private readonly onNew: (record: UnknownRecord) => void,
    ) { }

    /**
     * Classifies one WebSocket message and records its unknown parts.
     *
     * @param message WebSocket message
     */
    handle(message: WsMessage): void {
        const now = new Date().toISOString();
        const name = message.meta.message;

        if (name === WebSocketEventMessages.events) {
            for (const item of unknownEventItems(message)) {
                const key = String(item.key);
                this.keep(name, key, { meta: message.meta, data: item }, now);
            }
        } else if (!isKnownMessage(name)) {
            this.keep(name, undefined, { meta: message.meta, data: message.data }, now);
        }
    }

    /**
     * Creates the record for a new key or name, or counts a repeated one.
     *
     * @param message `meta.message` of the message
     * @param key event key, only for items of `events` messages
     * @param sample first message of this key or name
     * @param now ISO timestamp of the message
     */
    private keep(message: string, key: string | undefined, sample: UnknownRecord['sample'], now: string): void {
        const id = idOf(message, key);
        if (this.skip.has(id)) {
            return;
        }

        const existing = this.records.get(id);
        if (existing) {
            existing.seenMessages += 1;
            existing.lastSeenAt = now;
            return;
        }

        const record: UnknownRecord = {
            id,
            message,
            key,
            fileName: fileNameOf(message, key),
            firstSeenAt: now,
            lastSeenAt: now,
            seenMessages: 1,
            sample,
        };
        this.records.set(id, record);
        this.onNew(record);
    }

    /**
     * Builds the fixture files, sorted by file name.
     *
     * @param recordedAt ISO timestamp of the end of the capture
     */
    fixtures(recordedAt: string): FixtureFile[] {
        return [...this.records.values()]
            .sort((a: UnknownRecord, b: UnknownRecord): number => a.fileName.localeCompare(b.fileName))
            .map((record: UnknownRecord): FixtureFile => ({
                name: record.fileName,
                document: {
                    message: record.message,
                    ...(record.key !== undefined ? { key: record.key } : {}),
                    recordedAt,
                    firstSeenAt: record.firstSeenAt,
                    lastSeenAt: record.lastSeenAt,
                    seenMessages: record.seenMessages,
                    samples: [record.sample],
                },
            }));
    }
}

/**
 * Asks for the maximum runtime in minutes. Enter selects `DEFAULT_MINUTES`.
 *
 * @param rl readline interface of the terminal
 */
async function askMinutes(rl: Interface): Promise<number> {
    for (; ;) {
        const answer = (await rl.question(`Max. Laufzeit in Minuten [${DEFAULT_MINUTES}]: `)).trim();
        if (answer === '') {
            return DEFAULT_MINUTES;
        }
        const minutes = Number(answer);
        if (Number.isInteger(minutes) && minutes > 0) {
            return minutes;
        }
        console.log('Bitte eine ganze Zahl größer 0 eingeben.');
    }
}

/**
 * Listens to the event WebSocket until `q` + Enter or the runtime is over.
 *
 * @param api logged in API of the live session
 * @param rl readline interface of the terminal
 * @param collector collector that receives all messages
 * @param minutes maximum runtime in minutes
 */
async function capture(api: LiveSession['api'], rl: Interface, collector: UnknownCollector, minutes: number): Promise<Stop> {
    let finish!: (reason: Stop) => void;
    const stopped = new Promise<Stop>((resolve: (reason: Stop) => void): void => {
        finish = resolve;
    });

    api.on('message', (message: WsMessage): void => {
        try {
            collector.handle(message);
        } catch (error) {
            console.error(`Nachricht konnte nicht verarbeitet werden: ${String(error)}`);
        }
    });

    rl.on('line', (line: string): void => {
        if (line.trim().toLowerCase() === 'q') {
            finish('quit');
        } else {
            console.log('  q + Enter = beenden und speichern, Strg+C = abbrechen ohne Speichern');
        }
    });

    const timer = setTimeout((): void => finish('timeout'), minutes * 60_000);
    try {
        if (!(await api.launchEventsWs())) {
            console.error('Event-WebSocket konnte nicht geöffnet werden.');
            return 'error';
        }
        console.log(`Aufzeichnung läuft, max. ${minutes} min. Beenden: q + Enter (speichern), Strg+C (abbrechen ohne Speichern).`);
        return await stopped;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Loads the unknown fixture identifiers, runs the capture and writes the new fixture files.
 */
async function main(): Promise<number> {
    const config = getLiveConfig();
    if (!config) {
        console.error('Fehlende Zugangsdaten: UNIFI_HOST, UNIFI_USER und UNIFI_PASSWORD müssen gesetzt sein.');
        return 1;
    }

    const secrets = [config.host, config.user, config.password];
    const session: LiveSession = createLiveApi(config);
    const { api } = session;

    if (!(await api.login())) {
        console.error(`Login fehlgeschlagen. ${describeMessages(session.messages)}`);
        return 1;
    }

    const version = versionFromSysInfo(await api.retrievData(api.getApiEndpoint(ApiEndpoints.sysinfo)));
    if (!version) {
        api.logout();
        console.error('Keine Version in der sysinfo-Antwort gefunden, es wurde nichts geschrieben.');
        return 1;
    }
    console.log(`Controller-Version ${version}`);

    const unknownDir = path.join(fixtureDir(version, 'events'), UNKNOWN_DIR);
    const existingIds = loadExistingIds(unknownDir);
    console.log(`Vorhandene unbekannte Events: ${existingIds.size} (werden nicht erneut erfasst)`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', (): void => {
        console.log('\nAbgebrochen, nichts geschrieben.');
        rl.close();
        process.exit(130);
    });

    const collector = new UnknownCollector(existingIds, (record: UnknownRecord): void => {
        console.log(`  NEU ${record.key ?? record.message} (${record.sample.meta.message})`);
    });

    let stop: Stop;
    try {
        const minutes = await askMinutes(rl);
        stop = await capture(api, rl, collector, minutes);
        if (stop === 'timeout') {
            console.log('\nMax. Laufzeit erreicht.');
        }
    } finally {
        rl.close();
        api.logout();
    }

    if (stop === 'error') {
        return 1;
    }

    const files = collector.fixtures(new Date().toISOString());
    if (files.length === 0) {
        console.log('Keine unbekannten Events erfasst, es wurde nichts geschrieben.');
        return 0;
    }

    const anonymized = anonymize(removeSecretEntries(files.map((file: FixtureFile): Record<string, unknown> => file.document)), secrets);
    const contents = files.map((file: FixtureFile, index: number) => ({
        name: file.name,
        content: `${JSON.stringify(anonymized[index], null, 2)}\n`,
    }));

    const leaks = [...new Set(contents.flatMap((file) => findLeaks(file.content, secrets)))];
    if (leaks.length > 0) {
        console.error(`Abbruch, nicht anonymisierte Daten gefunden (${leaks.length} Treffer). Es wurde nichts geschrieben.`);
        return 1;
    }

    mkdirSync(unknownDir, { recursive: true });
    for (const file of contents) {
        writeFileSync(path.join(unknownDir, `${file.name}.json`), file.content, 'utf8');
    }

    console.log(`\n${contents.length} unbekannte Events geschrieben nach ${path.relative(process.cwd(), unknownDir)}:`);
    for (const file of files) {
        console.log(`  ${file.name}.json (${String(file.document.seenMessages)}x gesehen)`);
    }

    return 0;
}

main()
    .then((code: number): void => {
        process.exitCode = code;
    })
    .catch((error: unknown): void => {
        console.error(`Aufzeichnung fehlgeschlagen: ${String(error)}`);
        process.exitCode = 1;
    });
