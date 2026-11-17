import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findLeaks } from './anonymizeFixtures.js';
import { fixtureDir, latestFixtureVersion, versionFromSysInfo } from './fixtureVersions.js';
import { getLiveConfig } from './liveHelper.test.js';

/** Newest controller version with API fixtures. The tests always run against it. */
const FIXTURE_VERSION = latestFixtureVersion() ?? 'keine-version';
const FIXTURE_DIR = fixtureDir(FIXTURE_VERSION, 'api');

interface RecordedFixture {
    endpoint: string;
    recordedAt: string;
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

describe(`Aufgezeichnete API-Fixtures ${FIXTURE_VERSION} (offline)`, function () {
    before(function () {
        if (!existsSync(FIXTURE_DIR) || readdirSync(FIXTURE_DIR).length === 0) {
            this.skip();
        }
    });

    it('jede Datei hat endpoint, recordedAt und response', () => {
        for (const { file, fixture } of readFixtures()) {
            expect(fixture.endpoint, file).to.equal(path.basename(file, '.json'));
            expect(Number.isNaN(Date.parse(fixture.recordedAt)), file).to.equal(false);
            expect(fixture.response, file).to.not.equal(undefined);
        }
    });

    it('das Versionsverzeichnis entspricht der Version aus sysinfo', () => {
        const sysinfo = readFixtures().find(({ fixture }) => fixture.endpoint === 'sysinfo');
        expect(sysinfo, 'sysinfo-Fixture fehlt').to.not.equal(undefined);
        expect(versionFromSysInfo(sysinfo?.fixture.response), 'sysinfo').to.equal(FIXTURE_VERSION);
    });

    it('V1-Antworten haben meta.rc "ok" und data', () => {
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

    it('enthält keine Anonymisierungs-Lecks', () => {
        const config = getLiveConfig();
        const secrets = config ? [config.host, config.user, config.password] : [];

        for (const { file, content } of readFixtures()) {
            expect(findLeaks(content, secrets), file).to.deep.equal([]);
        }
    });
});
