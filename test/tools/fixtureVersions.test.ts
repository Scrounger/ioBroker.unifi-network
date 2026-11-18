import { expect } from 'chai';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareVersions, fixtureDir, latestFixtureVersion, listFixtureVersions, versionFromSysInfo } from '../../tools/fixtureVersions.js';

describe('fixtureVersions (offline)', function () {
    let root: string;

    beforeEach(function () {
        root = mkdtempSync(path.join(tmpdir(), 'fixture-versions-'));
    });

    afterEach(function () {
        rmSync(root, { recursive: true, force: true });
    });

    it('compares versions numerically, not as text', function () {
        expect(compareVersions('10.6.109', '10.6.9')).to.be.greaterThan(0);
        expect(compareVersions('9.5.1', '10.0.0')).to.be.lessThan(0);
        expect(compareVersions('10.6', '10.6.0')).to.equal(0);
    });

    it('reads the version from the sysinfo response', function () {
        expect(versionFromSysInfo({ meta: { rc: 'ok' }, data: [{ version: '10.6.109' }] })).to.equal('10.6.109');
    });

    it('returns no version if it is missing or not a version string', function () {
        expect(versionFromSysInfo(undefined)).to.equal(undefined);
        expect(versionFromSysInfo({ data: [] })).to.equal(undefined);
        expect(versionFromSysInfo({ data: [{ version: '<redacted>' }] })).to.equal(undefined);
        expect(versionFromSysInfo({ data: [{ version: '../10.6' }] })).to.equal(undefined);
    });

    it('lists only version directories and returns the newest last', function () {
        for (const name of ['10.6.9', '10.6.109', '9.5.1', 'notes']) {
            mkdirSync(path.join(root, name));
        }
        writeFileSync(path.join(root, '99.0.0'), 'not a directory');

        expect(listFixtureVersions(root)).to.deep.equal(['9.5.1', '10.6.9', '10.6.109']);
        expect(latestFixtureVersion(root)).to.equal('10.6.109');
    });

    it('returns undefined if no fixtures exist yet', function () {
        expect(listFixtureVersions(path.join(root, 'missing'))).to.deep.equal([]);
        expect(latestFixtureVersion(path.join(root, 'missing'))).to.equal(undefined);
    });

    it('builds the path per version and kind', function () {
        expect(fixtureDir('10.6.109', 'api', root)).to.equal(path.join(root, '10.6.109', 'api'));
    });
});
