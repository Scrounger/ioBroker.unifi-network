import { expect } from 'chai';
import { API_BASE, createTreeContext, getDefinition } from '../../../tools/treeTestHelpers.js';
import { lan } from './lan.js';

const LAN_CONFIG = `${API_BASE}/lanConfig`;

/** Corporate LAN network. */
const CORPORATE = { _id: ' lan-1 ', name: 'Office', purpose: 'corporate' };

/** Guest LAN network. */
const GUEST = { _id: 'lan-2', name: 'Gast', purpose: 'guest' };

/**
 * Returns one definition of the LAN tree.
 *
 * @param path dot separated path of the definition
 */
function def(path: string): any {
    return getDefinition(lan, path);
}

describe('lan tree', () => {
    it('zeigt verbundene Clients nur für Nicht-Gastnetze', () => {
        const ctx = createTreeContext();
        expect(def('connected_clients').conditionToCreateState(CORPORATE, CORPORATE, ctx.stub.adapter)).to.equal(true);
        expect(def('connected_clients').conditionToCreateState(GUEST, GUEST, ctx.stub.adapter)).to.equal(false);
    });

    it('zeigt verbundene Gäste nur für Gastnetze', () => {
        const ctx = createTreeContext();
        expect(def('connected_guests').conditionToCreateState(GUEST, GUEST, ctx.stub.adapter)).to.equal(true);
        expect(def('connected_guests').conditionToCreateState(CORPORATE, CORPORATE, ctx.stub.adapter)).to.equal(false);
    });

    it('schaltet das Netzwerk per PUT auf lanConfig ein und aus', async () => {
        const ctx = createTreeContext();
        await def('enabled').writeVal(false, 'lan.enabled', CORPORATE, ctx.stub.adapter);

        expect(ctx.sent).to.deep.equal([{ cmd: `${LAN_CONFIG}/lan-1`, payload: { enabled: false }, method: 'PUT' }]);
    });

    it('setzt den Internetzugang per PUT auf lanConfig', async () => {
        const ctx = createTreeContext();
        await def('internet_access_enabled').writeVal(true, 'lan.internet_enabled', GUEST, ctx.stub.adapter);

        expect(ctx.sent).to.deep.equal([{ cmd: `${LAN_CONFIG}/lan-2`, payload: { internet_access_enabled: true }, method: 'PUT' }]);
    });

    it('wandelt die VLAN-ID in eine Zahl um', () => {
        const ctx = createTreeContext();
        expect(def('vlan').readVal('20', ctx.stub.adapter, CORPORATE, CORPORATE, 'lan.vlan')).to.equal(20);
    });

    it('liefert die globalen States', () => {
        expect(lan.getGlobal()).to.have.all.keys('connected_clients', 'connected_guests');
    });

    it('liefert Keys und State-IDs', () => {
        expect(lan.getKeys()).to.include('connected_clients');
        expect(lan.getStateIDs()).to.include.members(['connected_clients', 'connected_guests', 'enabled']);
    });
});
