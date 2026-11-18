import { expect } from 'chai';
import { base64 } from '../../../src/lib/base64.js';

const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('base64 icons', () => {
    it('enthält die Icons für VPN-Clients und -Server', () => {
        expect(Object.keys(base64)).to.include.members(['wireguard-client', 'wireguard-server', 'openvpn-server', 'openvpn-client']);
    });

    for (const [name, dataUri] of Object.entries(base64)) {
        describe(name, () => {
            it('ist ein PNG-Data-URI', () => {
                expect(dataUri.startsWith(PNG_PREFIX)).to.equal(true);
            });

            it('dekodiert zu einem Bild mit PNG-Signatur', () => {
                const bytes = Buffer.from(dataUri.slice(PNG_PREFIX.length), 'base64');

                expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).to.deep.equal(PNG_SIGNATURE);
            });
        });
    }
});
