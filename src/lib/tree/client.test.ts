import { expect } from 'chai';
import { API_BASE, createTreeContext, getDefinition, type TreeTestContext } from '../../../tools/treeTestHelpers.js';
import { ApiEndpoints } from '../api/network-api.js';
import * as myHelper from '../helper.js';
import { client } from './client.js';

/** Kabelgebundener Client mit gesetztem Typ. */
const WIRED_CLIENT = { type: 'WIRED', is_wired: true };

/** WLAN-Client mit gesetztem Typ. */
const WIRELESS_CLIENT = { type: 'WIRELESS', is_wired: false };

/** VPN-Client. */
const VPN_CLIENT = { type: 'VPN' };

/** Kabelgebundener Client ohne Typ (ältere Daten). */
const LEGACY_WIRED = { is_wired: true };

/** WLAN-Client ohne Typ (ältere Daten). */
const LEGACY_WIRELESS = { is_wired: false };

/** Reihenfolge, in der die Verbindungsarten in den Tabellen unten geprüft werden. */
const DEVICES = [WIRED_CLIENT, WIRELESS_CLIENT, VPN_CLIENT, LEGACY_WIRED, LEGACY_WIRELESS];

let ctx: TreeTestContext;

beforeEach(() => {
    ctx = createTreeContext({ clientImageDownload: true, clientOfflineTimeout: 300, vpnOfflineTimeout: 600 });
});

/**
 * Returns one definition of the client tree.
 *
 * @param path dot separated path of the definition
 */
function def(path: string): any {
    return getDefinition(client, path);
}

/**
 * Checks whether the state of a definition is created for a device.
 *
 * @param path dot separated path of the definition
 * @param device client device
 */
function isShown(path: string, device: Record<string, unknown>): boolean {
    return def(path).conditionToCreateState(device, device, ctx.stub.adapter);
}

describe('client tree', () => {
    describe('Schreibzugriffe', () => {
        it('blockiert einen Client über den clientCommand-Endpunkt', async () => {
            await def('blocked').writeVal(true, 'clients.blocked', { mac: 'AA:BB:CC:DD:EE:01', name: 'PC' }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([
                { cmd: `${API_BASE}/${ApiEndpoints.clientCommand}`, payload: { cmd: 'block-sta', mac: 'aa:bb:cc:dd:ee:01' }, method: 'POST' },
            ]);
        });

        it('hebt die Blockierung eines Clients auf', async () => {
            await def('blocked').writeVal(false, 'clients.blocked', { mac: 'AA:BB:CC:DD:EE:01', name: 'PC' }, ctx.stub.adapter);

            expect(ctx.sent[0].payload).to.deep.equal({ cmd: 'unblock-sta', mac: 'aa:bb:cc:dd:ee:01' });
        });

        it('kickt einen Client zum Neuverbinden', async () => {
            await def('reconnect').writeVal(true, 'clients.reconnect', { mac: 'AA:BB:CC:DD:EE:01', name: 'Handy' }, ctx.stub.adapter);

            expect(ctx.sent[0].payload).to.deep.equal({ cmd: 'kick-sta', mac: 'aa:bb:cc:dd:ee:01' });
        });

        it('setzt den Namen des Clients per PUT auf den Endpunkt clients', async () => {
            await def('name').writeVal('Neuer Name', 'clients.name', { user_id: ' user-1 ', name: 'Alt', mac: 'AA:BB:CC:DD:EE:01' }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([
                { cmd: `${API_BASE}/${ApiEndpoints.clients}/user-1`, payload: { name: 'Neuer Name' }, method: 'PUT' },
            ]);
        });
    });

    describe('readVal', () => {
        it('liefert den Frequenzbereich über die Helper-Funktion', () => {
            const device = WIRELESS_CLIENT;
            expect(def('channel_name').readVal('ng', ctx.stub.adapter, device, device, 'clients.channel_name')).to.equal(
                myHelper.radio_nameToFrequency('ng', ctx.stub.adapter),
            );
        });

        const radioCases: Array<[string, string]> = [
            ['ax', 'WiFi 6'],
            ['ac', 'WiFi 5'],
            ['ng', 'WiFi 4'],
            ['n', 'WiFi 4'],
            ['g', 'WiFi 3'],
            ['b', 'WiFi 2'],
            ['a', 'WiFi 1'],
            ['xyz', 'tbd'],
            ['', 'tbd'],
        ];

        for (const [proto, expected] of radioCases) {
            it(`ordnet das Funkprotokoll '${proto}' dem Namen '${expected}' zu`, () => {
                expect(def('radio_name').readVal(proto, ctx.stub.adapter, WIRELESS_CLIENT, WIRELESS_CLIENT, 'clients.radio_name')).to.equal(expected);
            });
        }

        it('wandelt Rohbytes eines Wired-Clients in GB um', () => {
            expect(def('rx_bytes').readVal(2_500_000_000, ctx.stub.adapter, WIRED_CLIENT, WIRED_CLIENT, 'clients.rx_bytes')).to.equal(2.5);
            expect(def('tx_bytes').readVal(2_500_000_000, ctx.stub.adapter, WIRED_CLIENT, WIRED_CLIENT, 'clients.tx_bytes')).to.equal(2.5);
        });

        it('wandelt Rohbytes eines VPN-Clients in MB um', () => {
            expect(def('rx_bytes').readVal(3_000_000, ctx.stub.adapter, VPN_CLIENT, VPN_CLIENT, 'clients.rx_bytes')).to.equal(3);
            expect(def('tx_bytes').readVal(3_000_000, ctx.stub.adapter, VPN_CLIENT, VPN_CLIENT, 'clients.tx_bytes')).to.equal(3);
        });

        it('liefert die Einheit der Bytes abhängig von der Verbindungsart', () => {
            expect(def('rx_bytes').unit(VPN_CLIENT, VPN_CLIENT, ctx.stub.adapter)).to.equal('MB');
            expect(def('rx_bytes').unit(WIRED_CLIENT, WIRED_CLIENT, ctx.stub.adapter)).to.equal('GB');
            expect(def('tx_bytes').unit(VPN_CLIENT, VPN_CLIENT, ctx.stub.adapter)).to.equal('MB');
            expect(def('tx_bytes').unit(WIRED_CLIENT, WIRED_CLIENT, ctx.stub.adapter)).to.equal('GB');
        });

        it('rechnet Übertragungsraten von kbps in mbps um', () => {
            expect(def('rx_rate').readVal(4400, ctx.stub.adapter, WIRELESS_CLIENT, WIRELESS_CLIENT, 'clients.rx_rate')).to.equal(4);
            expect(def('tx_rate').readVal(5500, ctx.stub.adapter, WIRELESS_CLIENT, WIRELESS_CLIENT, 'clients.tx_rate')).to.equal(6);
        });

        it('serialisiert IPv6-Adressen als JSON', () => {
            const device = WIRED_CLIENT;
            expect(def('ipv6_address').readVal(['fe80::1'], ctx.stub.adapter, device, device, 'clients.ipv6')).to.equal('["fe80::1"]');
            expect(def('last_ipv6').readVal(['fe80::2'], ctx.stub.adapter, device, device, 'clients.last_ipv6')).to.equal('["fe80::2"]');
        });

        it('serialisiert die Netzwerk-Gruppen als JSON', () => {
            const device = WIRED_CLIENT;
            expect(def('network_members_group_ids').readVal(['g1', 'g2'], ctx.stub.adapter, device, device, 'clients.groups')).to.equal(
                '["g1","g2"]',
            );
        });
    });

    describe('isOnline', () => {
        const nowSeconds = (): number => Math.floor(Date.now() / 1000);

        it('ist ein Client online, wenn er innerhalb des Offline-Timeouts gesehen wurde', () => {
            expect(def('isOnline').readVal(nowSeconds(), ctx.stub.adapter, WIRED_CLIENT, WIRED_CLIENT, 'clients.isOnline')).to.equal(true);
        });

        it('ist ein Client offline, wenn er länger als der Offline-Timeout nicht gesehen wurde', () => {
            expect(def('isOnline').readVal(nowSeconds() - 1000, ctx.stub.adapter, WIRELESS_CLIENT, WIRELESS_CLIENT, 'clients.isOnline')).to.equal(false);
        });

        it('übernimmt bei einem VPN-Client den Status, wenn er gesetzt ist', () => {
            expect(def('isOnline').readVal(nowSeconds() - 1000, ctx.stub.adapter, { type: 'VPN', status: 'online' }, {}, 'vpn.isOnline')).to.equal(true);
            expect(def('isOnline').readVal(nowSeconds(), ctx.stub.adapter, { type: 'VPN', status: 'offline' }, {}, 'vpn.isOnline')).to.equal(false);
        });

        it('nutzt beim VPN-Client ohne Status den VPN-Timeout', () => {
            expect(def('isOnline').readVal(nowSeconds(), ctx.stub.adapter, { type: 'VPN' }, {}, 'vpn.isOnline')).to.equal(true);
            expect(def('isOnline').readVal(nowSeconds() - 1000, ctx.stub.adapter, { type: 'VPN' }, {}, 'vpn.isOnline')).to.equal(false);
        });
    });

    describe('imageUrl', () => {
        it('lädt das Icon des UniFi-Geräts, wenn ein icon_filename vorhanden ist', async () => {
            const device = { ...WIRED_CLIENT, fingerprint: { computed_engine: 1 }, unifi_device_info: { icon_filename: 'phone' } };
            const url = await def('imageUrl').readVal(device.fingerprint, ctx.stub.adapter, device, device, 'clients.imageUrl');

            expect(url).to.equal('https://static.ui.com/fingerprint/ui/icons/phone_257x257.png?q=100');
            expect(ctx.downloads).to.deep.equal([{ id: 'clients.imageUrl', url }]);
        });

        it('nutzt dev_id_override vor dev_id', async () => {
            const device = { ...WIRED_CLIENT, fingerprint: { computed_engine: 2, dev_id: 10, dev_id_override: 20 } };
            const url = await def('imageUrl').readVal(device.fingerprint, ctx.stub.adapter, device, device, 'clients.imageUrl');

            expect(url).to.equal('https://static.ui.com/fingerprint/2/20_257x257.png?q=100');
        });

        it('nutzt dev_id, wenn kein dev_id_override vorhanden ist', async () => {
            const device = { ...WIRED_CLIENT, fingerprint: { computed_engine: 2, dev_id: 10 } };
            const url = await def('imageUrl').readVal(device.fingerprint, ctx.stub.adapter, device, device, 'clients.imageUrl');

            expect(url).to.equal('https://static.ui.com/fingerprint/2/10_257x257.png?q=100');
        });

        it('liefert keine URL ohne passende Fingerprint-Daten', async () => {
            const device = { ...WIRED_CLIENT, fingerprint: { computed_engine: 2 } };
            const url = await def('imageUrl').readVal(device.fingerprint, ctx.stub.adapter, device, device, 'clients.imageUrl');

            expect(url).to.equal(null);
            expect(ctx.downloads).to.deep.equal([]);
        });

        it('liefert keine URL ohne Fingerprint', async () => {
            const url = await def('imageUrl').readVal(undefined, ctx.stub.adapter, WIRED_CLIENT, WIRED_CLIENT, 'clients.imageUrl');

            expect(url).to.equal(null);
            expect(ctx.downloads).to.deep.equal([]);
        });

        it('liefert keine URL, wenn der Bild-Download deaktiviert ist', async () => {
            const disabled = createTreeContext({ clientImageDownload: false });
            const device = { ...WIRED_CLIENT, fingerprint: { computed_engine: 1, dev_id: 10 } };
            const url = await def('imageUrl').readVal(device.fingerprint, disabled.stub.adapter, device, device, 'clients.imageUrl');

            expect(url).to.equal(null);
            expect(disabled.downloads).to.deep.equal([]);
        });

        it('erstellt den State nur, wenn der Bild-Download aktiv ist', () => {
            expect(isShown('imageUrl', WIRED_CLIENT)).to.equal(true);
            ctx = createTreeContext({ clientImageDownload: false });
            expect(isShown('imageUrl', WIRED_CLIENT)).to.equal(false);
        });
    });

    describe('ipv6', () => {
        it('erstellt den IPv6-State nur bei gesetzter Adresse', () => {
            expect(isShown('ipv6_address', { ipv6_address: ['fe80::1'] })).to.equal(true);
            expect(isShown('ipv6_address', { ipv6_address: [] })).to.equal(false);
        });

        it('erstellt den letzten IPv6-State nur bei gesetzter Adresse', () => {
            expect(isShown('last_ipv6', { last_ipv6: ['fe80::2'] })).to.equal(true);
            expect(isShown('last_ipv6', { last_ipv6: [] })).to.equal(false);
            expect(isShown('last_ipv6', {})).to.equal(false);
        });
    });

    describe('Verbindungsart', () => {
        // Reihenfolge der Werte: WIRED, WIRELESS, VPN, LEGACY_WIRED, LEGACY_WIRELESS
        const CONDITIONS: Array<[string, boolean[]]> = [
            ['image', [true, true, false, true, true]],
            ['last_uplink_mac', [true, true, false, true, true]],
            ['last_uplink_name', [true, true, false, true, true]],
            ['model_name', [true, true, false, true, true]],
            ['vlan', [true, true, false, true, true]],
            ['network_members_group_ids', [true, true, false, true, true]],
            ['sw_port', [true, false, false, true, false]],
            ['wired_rate_mbps', [true, false, false, true, false]],
            ['reconnect', [false, true, false, false, true]],
            ['wifi_experience_average', [false, true, false, false, true]],
            ['wifi_tx_retries_percentage', [false, true, false, false, true]],
            ['remote_ip', [false, false, true, false, false]],
        ];

        for (const [path, expected] of CONDITIONS) {
            it(`blendet '${path}' nur für passende Verbindungsarten ein`, () => {
                expect(DEVICES.map(device => isShown(path, device))).to.deep.equal(expected);
            });
        }
    });

    describe('Keys und State-IDs', () => {
        it('enthält die manuell ergänzten Fingerprint-Keys', () => {
            const keys = client.getKeys();
            expect(keys).to.include.members(['fingerprint.computed_engine', 'fingerprint.dev_id_override', 'fingerprint.dev_id', 'fingerprint.has_override']);
        });

        it('liefert die Keys bei wiederholtem Aufruf unverändert', () => {
            expect(client.getKeys()).to.deep.equal(client.getKeys());
        });

        it('liefert die State-IDs mit den abweichenden Namen', () => {
            expect(client.getStateIDs()).to.include.members(['channel_frequency', 'uplink_mac', 'reconnect', 'speed']);
        });
    });
});
