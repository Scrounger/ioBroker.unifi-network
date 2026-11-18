import { expect } from 'chai';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareVersions, fixtureDir, latestFixtureVersion, listFixtureVersions, versionFromSysInfo } from './fixtureVersions.js';

describe('fixtureVersions (offline)', function () {
    let root: string;

    beforeEach(function () {
        root = mkdtempSync(path.join(tmpdir(), 'fixture-versions-'));
    });

    afterEach(function () {
        rmSync(root, { recursive: true, force: true });
    });

    it('vergleicht Versionen numerisch, nicht als Text', function () {
        expect(compareVersions('10.6.109', '10.6.9')).to.be.greaterThan(0);
        expect(compareVersions('9.5.1', '10.0.0')).to.be.lessThan(0);
        expect(compareVersions('10.6', '10.6.0')).to.equal(0);
    });

    it('liest die Version aus der sysinfo-Antwort', function () {
        expect(versionFromSysInfo({ meta: { rc: 'ok' }, data: [{ version: '10.6.109' }] })).to.equal('10.6.109');
    });

    it('liefert keine Version, wenn sie fehlt oder kein Versionsstring ist', function () {
        expect(versionFromSysInfo(undefined)).to.equal(undefined);
        expect(versionFromSysInfo({ data: [] })).to.equal(undefined);
        expect(versionFromSysInfo({ data: [{ version: '<redacted>' }] })).to.equal(undefined);
        expect(versionFromSysInfo({ data: [{ version: '../10.6' }] })).to.equal(undefined);
    });

    it('listet nur Versionsverzeichnisse und liefert die neueste zuletzt', function () {
        for (const name of ['10.6.9', '10.6.109', '9.5.1', 'notes']) {
            mkdirSync(path.join(root, name));
        }
        writeFileSync(path.join(root, '99.0.0'), 'keine Datei');

        expect(listFixtureVersions(root)).to.deep.equal(['9.5.1', '10.6.9', '10.6.109']);
        expect(latestFixtureVersion(root)).to.equal('10.6.109');
    });

    it('liefert undefined, wenn noch keine Fixtures existieren', function () {
        expect(listFixtureVersions(path.join(root, 'fehlt'))).to.deep.equal([]);
        expect(latestFixtureVersion(path.join(root, 'fehlt'))).to.equal(undefined);
    });

    it('baut den Pfad je Version und Art', function () {
        expect(fixtureDir('10.6.109', 'api', root)).to.equal(path.join(root, '10.6.109', 'api'));
    });
});
