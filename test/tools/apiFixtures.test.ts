import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findLeaks } from '../../tools/anonymizeFixtures.js';
import { fixtureDir, latestFixtureVersion, versionFromSysInfo } from '../../tools/fixtureVersions.js';
import { getLiveConfig } from './liveHelper.test.js';

/** Newest controller version with API fixtures. The tests always run against it. */
const FIXTURE_VERSION = latestFixtureVersion() ?? 'no-version';
const FIXTURE_DIR = fixtureDir(FIXTURE_VERSION, 'api');

interface RecordedFixture {
    endpoint: string;
    recordedAt: string;
    /** False if the fixture was recorded with `--no-anonymize`. Missing in fixtures recorded before the flag existed. */
    anonymized?: boolean;
    response: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readFixtures(): { file: string; content: string; fixture: RecordedFixture }[] {
    return readdirSync(FIXTURE_DIR)
        .filter((file: string): boolean => file.endsWith('.json'))
        .map((file: string): { file: string; content: string; fixture: RecordedFixture } => {
            const content = readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
            return { file, content, fixture: JSON.parse(content) as RecordedFixture };
        });
}

describe(`Recorded API fixtures ${FIXTURE_VERSION} (offline)`, function () {
    before(function () {
        if (!existsSync(FIXTURE_DIR) || readdirSync(FIXTURE_DIR).length === 0) {
            this.skip();
        }
    });

    it('every file has endpoint, recordedAt and response', () => {
        for (const { file, fixture } of readFixtures()) {
            expect(fixture.endpoint, file).to.equal(path.basename(file, '.json'));
            expect(Number.isNaN(Date.parse(fixture.recordedAt)), file).to.equal(false);
            expect(fixture.response, file).to.not.equal(undefined);
        }
    });

    it('the version directory matches the version from sysinfo', () => {
        const sysinfo = readFixtures().find(({ fixture }) => fixture.endpoint === 'sysinfo');
        expect(sysinfo, 'sysinfo fixture is missing').to.not.equal(undefined);
        expect(versionFromSysInfo(sysinfo?.fixture.response), 'sysinfo').to.equal(FIXTURE_VERSION);
    });

    it('V1 responses have meta.rc "ok" and data', () => {
        for (const { file, fixture } of readFixtures()) {
            if (fixture.endpoint.endsWith('V2')) {
                continue;
            }
            expect(isRecord(fixture.response), file).to.equal(true);
            const response = fixture.response as Record<string, unknown>;
            expect(response.meta, file).to.deep.equal({ rc: 'ok' });
            expect(response, file).to.have.property('data');
        }
    });

    it('contains no anonymization leaks', function () {
        const anonymized = readFixtures().filter((item: { fixture: RecordedFixture }): boolean => item.fixture.anonymized !== false);
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
