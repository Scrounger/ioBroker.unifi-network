import { expect } from 'chai';
import { API_BASE, createTreeContext, getDefinition } from '../../../tools/treeTestHelpers.js';
import { wlan } from './wlan.js';

const WLAN_CONFIG = `${API_BASE}/wlanConfig`;

/** Regular WLAN. */
const WLAN = { _id: ' wlan-1 ', name: 'Haus', is_guest: false };

/** Guest WLAN. */
const GUEST_WLAN = { _id: 'wlan-2', name: 'Gast', is_guest: true };

/**
 * Returns one definition of the WLAN tree.
 *
 * @param path dot separated path of the definition
 */
function def(path: string): any {
    return getDefinition(wlan, path);
}

describe('wlan tree', () => {
    it('schaltet das WLAN per PUT auf wlanConfig ein und aus', async () => {
        const ctx = createTreeContext();
        await def('enabled').writeVal(true, 'wlan.enabled', WLAN, ctx.stub.adapter);

        expect(ctx.sent).to.deep.equal([{ cmd: `${WLAN_CONFIG}/wlan-1`, payload: { enabled: true }, method: 'PUT' }]);
    });

    it('zeigt verbundene Clients nur für Nicht-Gast-WLANs', () => {
        const ctx = createTreeContext();
        expect(def('connected_clients').conditionToCreateState(WLAN, WLAN, ctx.stub.adapter)).to.equal(true);
        expect(def('connected_clients').conditionToCreateState(GUEST_WLAN, GUEST_WLAN, ctx.stub.adapter)).to.equal(false);
    });

    it('zeigt den Client-Höchststand nur für Nicht-Gast-WLANs', () => {
        const ctx = createTreeContext();
        expect(def('peak_client_count').conditionToCreateState(WLAN, WLAN, ctx.stub.adapter)).to.equal(true);
        expect(def('peak_client_count').conditionToCreateState(GUEST_WLAN, GUEST_WLAN, ctx.stub.adapter)).to.equal(false);
    });

    it('zeigt verbundene Gäste nur für Gast-WLANs', () => {
        const ctx = createTreeContext();
        expect(def('connected_guests').conditionToCreateState(GUEST_WLAN, GUEST_WLAN, ctx.stub.adapter)).to.equal(true);
        expect(def('connected_guests').conditionToCreateState(WLAN, WLAN, ctx.stub.adapter)).to.equal(false);
    });

    it('setzt eine fehlende Zufriedenheit auf 0', () => {
        const ctx = createTreeContext();
        expect(def('current_satisfaction').readVal(-1, ctx.stub.adapter, WLAN, WLAN, 'wlan.satisfaction')).to.equal(0);
        expect(def('current_satisfaction').readVal(75, ctx.stub.adapter, WLAN, WLAN, 'wlan.satisfaction')).to.equal(75);
    });

    it('liefert die globalen States', () => {
        expect(wlan.getGlobal()).to.have.all.keys('connected_clients', 'connected_guests');
    });

    it('liefert Keys und State-IDs', () => {
        expect(wlan.getKeys()).to.include('current_client_count');
        expect(wlan.getStateIDs()).to.include.members(['connected_clients', 'connected_guests', 'enabled']);
    });
});
