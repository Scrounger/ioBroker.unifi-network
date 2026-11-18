import { expect } from 'chai';
import { sysInfo } from '../../../../src/lib/tree/sysInfo.js';

describe('sysInfo tree', () => {
    it('liefert Keys inklusive manueller Fingerprint-Keys', () => {
        const keys = sysInfo.getKeys();
        expect(keys).to.include('update_available');
        expect(keys).to.include('fingerprint.computed_engine');
    });

    it('liefert die State-IDs der Systeminformationen', () => {
        expect(sysInfo.getStateIDs()).to.include.members(['version', 'uptime', 'upgradable']);
    });

    it('liefert die Keys bei wiederholtem Aufruf unverändert', () => {
        expect(sysInfo.getKeys()).to.deep.equal(sysInfo.getKeys());
    });
});
