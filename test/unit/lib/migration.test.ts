import { expect } from 'chai';
import { isVersionGreaterThan, migration } from '../../../src/lib/migration.js';
import { createAdapterStub } from '../../../tools/offlineAdapterStub.js';

describe('migration (offline)', () => {
    it('läuft ohne Fehler und ohne Log-Ausgabe durch', () => {
        const stub = createAdapterStub();

        migration(stub.adapter);

        expect(stub.errors).to.deep.equal([]);
        expect(stub.warnings).to.deep.equal([]);
    });

    describe('isVersionGreaterThan', () => {
        it('vergleicht Versionsteile als Zahlen, nicht als Text', () => {
            expect(isVersionGreaterThan('1.10.0', '1.9.9')).to.equal(true);
            expect(isVersionGreaterThan('1.3.1', '1.10.0')).to.equal(false);
            expect(isVersionGreaterThan('2.0', '1.9.9')).to.equal(true);
        });

        it('liefert false bei gleichen Versionen', () => {
            expect(isVersionGreaterThan('1.3.1', '1.3.1')).to.equal(false);
            expect(isVersionGreaterThan('1.3', '1.3.0')).to.equal(false);
        });

        it('behandelt fehlende Versionsteile als 0', () => {
            expect(isVersionGreaterThan('1.3.1.1', '1.3.1')).to.equal(true);
            expect(isVersionGreaterThan('1.3.1', '1.3.1.1')).to.equal(false);
            expect(isVersionGreaterThan('1.3', '1.3.1')).to.equal(false);
            expect(isVersionGreaterThan('1.4', '1.3.9')).to.equal(true);
        });
    });
});
