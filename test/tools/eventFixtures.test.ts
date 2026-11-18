import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findLeaks } from '../../tools/anonymizeFixtures.js';
import { ENTITY_LIMIT, entityId, HANDLED_EVENT_KEYS, isRecord, type WsItem } from '../../tools/eventScenarios.js';
import { fixtureDir, latestFixtureVersion } from '../../tools/fixtureVersions.js';
import { getLiveConfig } from './liveHelper.test.js';

/**
 * Offline checks for the event fixtures written by `npm run record:events`.
 * The tests run against the newest controller version and skip if its events directory is missing or empty.
 */
/** Newest controller version with event fixtures. The tests always run against it. */
const FIXTURE_VERSION = latestFixtureVersion() ?? 'no-version';
const FIXTURE_DIR = fixtureDir(FIXTURE_VERSION, 'events');

interface EventSample {
    meta: { message: string; rc?: string };
    data: unknown;
}

interface EventFixture {
    message: string;
    key?: string;
    recordedAt: string;
    /** False if the fixture was recorded with `--no-anonymize`. Missing in fixtures recorded before the flag existed. */
    anonymized?: boolean;
    seenMessages: number;
    entityLimit?: number;
    samples: EventSample[];
}

interface LoadedFixture {
    file: string;
    content: string;
    fixture: EventFixture;
}

function loadFixtures(): LoadedFixture[] {
    return readdirSync(FIXTURE_DIR)
        .filter((file: string): boolean => file.endsWith('.json'))
        .map((file: string): LoadedFixture => {
            const content = readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
            return { file, content, fixture: JSON.parse(content) as EventFixture };
        });
}

/**
 * Returns the object items of a sample's data.
 *
 * @param sample recorded sample
 */
function itemsOf(sample: EventSample): WsItem[] {
    return Array.isArray(sample.data) ? sample.data.filter(isRecord) : [];
}

describe(`Recorded event fixtures ${FIXTURE_VERSION} (offline)`, function () {
    let fixtures: LoadedFixture[] = [];

    before(function () {
        if (!existsSync(FIXTURE_DIR)) {
            this.skip();
        }
        fixtures = loadFixtures();
        if (fixtures.length === 0) {
            this.skip();
        }
    });

    it('every file has message, recordedAt, seenMessages and samples', function () {
        for (const { file, fixture } of fixtures) {
            expect(fixture.message, file).to.be.a('string');
            expect(Number.isNaN(Date.parse(fixture.recordedAt)), file).to.equal(false);
            expect(fixture.seenMessages, file).to.be.a('number');
            expect(fixture.samples, file).to.be.an('array').that.is.not.empty;
        }
    });

    it('event fixtures contain only handled keys and their items', function () {
        for (const { file, fixture } of fixtures.filter(({ fixture: f }: LoadedFixture): boolean => f.message === 'events')) {
            expect(fixture.key, file).to.be.a('string');
            expect(HANDLED_EVENT_KEYS, file).to.include(fixture.key);

            for (const sample of fixture.samples) {
                for (const item of itemsOf(sample)) {
                    expect(item.key, file).to.equal(fixture.key);
                }
            }
        }
    });

    it('cyclic fixtures contain at most ENTITY_LIMIT distinct entities', function () {
        for (const { file, fixture } of fixtures.filter(({ fixture: f }: LoadedFixture): boolean => f.entityLimit !== undefined)) {
            expect(fixture.entityLimit, file).to.equal(ENTITY_LIMIT);

            const ids = new Set(fixture.samples.flatMap((sample: EventSample): string[] => itemsOf(sample).map(entityId)));
            expect(ids.size, file).to.be.at.most(ENTITY_LIMIT);
        }
    });

    it('contains no anonymization leaks', function () {
        const anonymized = fixtures.filter((item: LoadedFixture): boolean => item.fixture.anonymized !== false);
        if (anonymized.length === 0) {
            this.skip();
        }
        const config = getLiveConfig();
        const secrets = config ? [config.host, config.user, config.password] : [];

        for (const { file, content } of anonymized) {
            expect(findLeaks(content, secrets), file).to.deep.equal([]);
        }
    });
});
