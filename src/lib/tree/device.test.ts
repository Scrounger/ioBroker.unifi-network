import { expect } from 'chai';
import { API_BASE, createTreeContext, getDefinition, type TreeTestContext } from '../../../tools/treeTestHelpers.js';
import { ApiEndpoints } from '../api/network-api.js';
import * as myHelper from '../helper.js';
import { device } from './device.js';

const DEVICE_REST = `${API_BASE}/${ApiEndpoints.deviceRest}`;
const DEVICE_COMMAND = `${API_BASE}/${ApiEndpoints.deviceCommand}`;

/** Access point with two radios and one WAN interface. */
const AP = {
    _id: ' ap-1 ',
    name: 'Flur',
    mac: 'AA:BB:CC:DD:EE:01',
    is_access_point: true,
    state: 1,
    upgradable: true,
    radio_table: [
        { name: 'wifi0', tx_power_mode: 'auto' },
        { name: 'wifi1', tx_power_mode: 'low' },
    ],
    wan1: { ifname: 'eth8' },
};

/** Switch with two ports, one of them with PoE. */
const SWITCH = {
    _id: ' sw-1 ',
    name: 'Keller',
    mac: 'AA:BB:CC:DD:EE:02',
    state: 1,
    port_overrides: [
        { port_idx: 1, port_security_enabled: false, poe_mode: 'off' },
        { port_idx: 2, port_security_enabled: false, poe_mode: 'off' },
    ],
    port_table: [
        { port_idx: 1, poe_enable: true },
        { port_idx: 2, poe_enable: false },
    ],
};

let ctx: TreeTestContext;

beforeEach(() => {
    ctx = createTreeContext({ deviceImageDownload: true });
});

/**
 * Returns one definition of the device tree.
 *
 * @param path dot separated path of the definition
 */
function def(path: string): any {
    return getDefinition(device, path);
}

/**
 * Checks whether the state of a definition is created for a device.
 *
 * @param path dot separated path of the definition
 * @param objDevice device object
 */
function isShown(path: string, objDevice: Record<string, unknown>): boolean {
    return def(path).conditionToCreateState(objDevice, objDevice, ctx.stub.adapter);
}

describe('device tree', () => {
    describe('Schreibzugriffe auf das Gerät', () => {
        it('deaktiviert einen Access Point per PUT auf deviceRest', async () => {
            await def('disabled').writeVal(true, 'devices.ap.disabled', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([{ cmd: `${DEVICE_REST}/ap-1`, payload: { disabled: true }, method: 'PUT' }]);
        });

        it('setzt die LED-Einstellung per PUT auf deviceRest', async () => {
            await def('led_override').writeVal('off', 'devices.ap.led_override', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([{ cmd: `${DEVICE_REST}/ap-1`, payload: { led_override: 'off' }, method: 'PUT' }]);
        });

        it('startet das Gerät neu mit kleingeschriebener MAC-Adresse', async () => {
            await def('restart').writeVal(true, 'devices.ap.restart', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([{ cmd: DEVICE_COMMAND, payload: { cmd: 'restart', mac: 'aa:bb:cc:dd:ee:01' }, method: 'POST' }]);
        });

        it('startet das Firmware-Update, wenn eines verfügbar ist', async () => {
            await def('upgrade').writeVal(true, 'devices.ap.upgrade', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([{ cmd: `${DEVICE_COMMAND}/upgrade`, payload: { mac: 'aa:bb:cc:dd:ee:01' }, method: 'POST' }]);
        });

        it('startet kein Firmware-Update ohne verfügbares Update', async () => {
            await def('upgrade').writeVal(true, 'devices.ap.upgrade', { ...AP, upgradable: false }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.warnings).to.have.length(1);
        });

        it('startet einen Speedtest über das WAN-Interface mit dessen Interface-Namen', async () => {
            await def('wan1.object.speedtest_run').writeVal(true, 'devices.ap.wan1.speedtest_run', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([{ cmd: DEVICE_COMMAND, payload: { cmd: 'speedtest', interface_name: 'eth8' }, method: 'POST' }]);
        });

        it('startet den Speedtest ohne Interface-Namen, wenn keiner bekannt ist', async () => {
            await def('wan1.object.speedtest_run').writeVal(true, 'devices.ap.wan1.speedtest_run', { ...AP, wan1: {} }, ctx.stub.adapter);

            expect(ctx.sent[0].payload).to.deep.equal({ cmd: 'speedtest' });
        });

        it('startet keinen Speedtest, wenn das WAN-Interface nicht im Gerät vorhanden ist', async () => {
            await def('wan1.object.speedtest_run').writeVal(true, 'devices.ap.wan1.speedtest_run', { ...AP, wan1: undefined }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
        });

        it('fängt Fehler beim Speedtest ab und protokolliert sie', async () => {
            const failing = createTreeContext({}, { sendFails: true });
            await def('wan1.object.speedtest_run').writeVal(true, 'devices.ap.wan1.speedtest_run', AP, failing.stub.adapter);

            expect(failing.stub.errors).to.have.length(1);
        });
    });

    describe('Bedingungen und Werte', () => {
        it('zeigt den Access-Point-Status nur für Access Points', () => {
            expect(isShown('disabled', { is_access_point: true })).to.equal(true);
            expect(isShown('disabled', { is_access_point: false })).to.equal(false);
        });

        it('zeigt den Fehlerstatus abhängig vom Gerätestatus', () => {
            expect(def('hasError').readVal(6, ctx.stub.adapter, AP, AP, 'devices.ap.hasError')).to.equal(true);
            expect(def('hasError').readVal(9, ctx.stub.adapter, AP, AP, 'devices.ap.hasError')).to.equal(true);
            expect(def('hasError').readVal(1, ctx.stub.adapter, AP, AP, 'devices.ap.hasError')).to.equal(false);
        });

        it('ist ein Gerät offline bei den Status 0, 6 und 9', () => {
            expect(def('isOnline').readVal(0, ctx.stub.adapter, AP, AP, 'devices.ap.isOnline')).to.equal(false);
            expect(def('isOnline').readVal(6, ctx.stub.adapter, AP, AP, 'devices.ap.isOnline')).to.equal(false);
            expect(def('isOnline').readVal(9, ctx.stub.adapter, AP, AP, 'devices.ap.isOnline')).to.equal(false);
            expect(def('isOnline').readVal(1, ctx.stub.adapter, AP, AP, 'devices.ap.isOnline')).to.equal(true);
        });

        it('rundet die Zufriedenheit und setzt ungültige Werte auf null', () => {
            expect(def('satisfaction').readVal(-1, ctx.stub.adapter, AP, AP, 'devices.ap.satisfaction')).to.equal(null);
            expect(def('satisfaction').readVal(90, ctx.stub.adapter, AP, AP, 'devices.ap.satisfaction')).to.equal(90);
        });

        it('serialisiert IPv6-Adressen als JSON und erstellt sie nur bei Vorhandensein', () => {
            expect(def('ipv6').readVal(['fe80::1'], ctx.stub.adapter, AP, AP, 'devices.ap.ipv6')).to.equal('["fe80::1"]');
            expect(isShown('ipv6', { ipv6: ['fe80::1'] })).to.equal(true);
            expect(isShown('ipv6', { ipv6: [] })).to.equal(false);
        });

        it('zeigt die Bild-States nur bei aktiviertem Gerätebild-Download', () => {
            expect(isShown('imageUrl', AP)).to.equal(true);
            expect(isShown('image', AP)).to.equal(true);
            ctx = createTreeContext({ deviceImageDownload: false });
            expect(isShown('imageUrl', AP)).to.equal(false);
            expect(isShown('image', AP)).to.equal(false);
        });

        it('ermittelt die Bild-URL über das Modell und lädt das Bild herunter', async () => {
            ctx = createTreeContext({ deviceImageDownload: true }, { deviceModels: [{ model_name: 'U6-LR', id: 'abc', default_image_id: 'xyz' }] });
            const url = await def('imageUrl').readVal('U6', ctx.stub.adapter, AP, AP, 'devices.ap.imageUrl');

            expect(url).to.equal('https://images.svc.ui.com/?u=https://static.ui.com/fingerprint/ui/images/abc/default/xyz.png&w=256?q=100');
            expect(ctx.downloads).to.deep.equal([{ id: 'devices.ap.imageUrl', url }]);
        });

        it('liefert keine Bild-URL für ein unbekanntes Modell', async () => {
            ctx = createTreeContext({ deviceImageDownload: true }, { deviceModels: [{ model_name: 'U6-LR', id: 'abc', default_image_id: 'xyz' }] });

            expect(await def('imageUrl').readVal('XYZ', ctx.stub.adapter, AP, AP, 'devices.ap.imageUrl')).to.equal(null);
            expect(await def('imageUrl').readVal('', ctx.stub.adapter, AP, AP, 'devices.ap.imageUrl')).to.equal(null);
            expect(ctx.downloads).to.deep.equal([]);
        });

        it('liefert keine Bild-URL, wenn der Gerätebild-Download deaktiviert ist', async () => {
            ctx = createTreeContext({ deviceImageDownload: false }, { deviceModels: [{ model_name: 'U6-LR', id: 'abc', default_image_id: 'xyz' }] });

            expect(await def('imageUrl').readVal('U6', ctx.stub.adapter, AP, AP, 'devices.ap.imageUrl')).to.equal(null);
        });

        it('rechnet Bytes des WAN-Interfaces in GB und Raten in Mbps um', () => {
            expect(def('rx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.rx_bytes')).to.equal(2.5);
            expect(def('tx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.tx_bytes')).to.equal(2.5);
            expect(def('wan1.object.current_download').readVal(25_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.wan1.current_download')).to.equal(25);
            expect(def('wan1.object.current_upload').readVal(5_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.wan1.current_upload')).to.equal(5);
            expect(def('wan1.object.rx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.wan1.rx_bytes')).to.equal(2.5);
            expect(def('wan1.object.tx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.wan1.tx_bytes')).to.equal(2.5);
        });

        it('rundet die Verfügbarkeit auf ganze Prozent', () => {
            expect(def('uptime_stats.object.WAN.object.availability').readVal(99.6, ctx.stub.adapter, AP, AP, 'devices.ap.availability')).to.equal(100);
        });

        it('rundet Temperaturen auf eine Nachkommastelle', () => {
            expect(def('temperature').readVal(41.26, ctx.stub.adapter, AP, AP, 'devices.ap.temperature')).to.equal(41.3);
            expect(def('temperatures.array.value').readVal(42.36, ctx.stub.adapter, AP, AP, 'devices.ap.temperatures.cpu.value')).to.equal(42.4);
        });

        it('wandelt CPU- und Speicherauslastung in Zahlen um', () => {
            expect(def('system-stats.object.cpu').readVal('12.5', ctx.stub.adapter, AP, AP, 'devices.ap.system.cpu')).to.equal(12.5);
            expect(def('system-stats.object.mem').readVal('40.1', ctx.stub.adapter, AP, AP, 'devices.ap.system.mem')).to.equal(40.1);
        });

        it('wandelt Speicherdaten in GB um', () => {
            const storage = def('storage.array.size');
            expect(storage.readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.storage.size')).to.equal(2.5);
            expect(def('storage.array.used').readVal(2_500_000_000, ctx.stub.adapter, AP, AP, 'devices.ap.storage.used')).to.equal(2.5);
            expect(def('storage').arrayChannelNameFromProperty(AP, { name: '/data' }, 0, ctx.stub.adapter)).to.equal('/data');
        });

        it('liefert Namen von Internet-Providern aus den Geo-Informationen', () => {
            const withProvider = { ...AP, active_geo_info: { WAN: { isp_name: 'Telekom' }, WAN2: { isp_name: 'Vodafone' } } };

            expect(def('active_geo_info.object.WAN.name')(withProvider, { isp_name: 'Telekom' }, ctx.stub.adapter)).to.equal('Telekom');
            expect(def('active_geo_info.object.WAN2.name')(withProvider, { isp_name: 'Vodafone' }, ctx.stub.adapter)).to.equal('Vodafone');
        });

        it('liefert Namen der Uptime-Statistik aus den Geo-Informationen oder einen leeren Namen', () => {
            const withProvider = { ...AP, active_geo_info: { WAN: { isp_name: 'Telekom' }, WAN2: { isp_name: 'Vodafone' } } };

            expect(def('uptime_stats.object.WAN.name')(withProvider, {}, ctx.stub.adapter)).to.equal('Telekom');
            expect(def('uptime_stats.object.WAN2.name')(withProvider, {}, ctx.stub.adapter)).to.equal('Vodafone');
            expect(def('uptime_stats.object.WAN.name')(AP, {}, ctx.stub.adapter)).to.equal('');
        });

        it('setzt den Online-Status des Internetanschlusses bei steigender Laufzeit auf true', async () => {
            const isOnlineId = 'devices.ap.uptime_stats.WAN.isOnline';
            ctx.stub.objects.add(isOnlineId);

            const value = await def('uptime_stats.object.WAN.object.uptime').readVal(120, ctx.stub.adapter, AP, AP, 'devices.ap.uptime_stats.WAN.uptime');

            expect(value).to.equal(120);
            expect(ctx.stub.states.get(isOnlineId)).to.equal(true);
        });

        it('setzt den Online-Status des Internetanschlusses bei steigender Downtime auf false', async () => {
            const isOnlineId = 'devices.ap.uptime_stats.WAN.isOnline';
            ctx.stub.objects.add(isOnlineId);

            const value = await def('uptime_stats.object.WAN.object.downtime').readVal(60, ctx.stub.adapter, AP, AP, 'devices.ap.uptime_stats.WAN.downtime');

            expect(value).to.equal(60);
            expect(ctx.stub.states.get(isOnlineId)).to.equal(false);
        });

        it('setzt keinen Online-Status, wenn der Zustand nicht existiert', async () => {
            await def('uptime_stats.object.WAN.object.uptime').readVal(120, ctx.stub.adapter, AP, AP, 'devices.ap.uptime_stats.WAN.uptime');

            expect(ctx.stub.states.size).to.equal(0);
        });
    });

    describe('Ports', () => {
        const portChannel = { port_idx: 1, name: 'Port 1', port_poe: true };

        it('liefert die ID und den Namen eines Ports', () => {
            expect(def('port_table').arrayChannelIdFromProperty(SWITCH, { port_idx: 3 }, 0, ctx.stub.adapter)).to.equal('port_03');
            expect(def('port_table').arrayChannelNameFromProperty(SWITCH, portChannel, 0, ctx.stub.adapter)).to.equal('Port 1');
        });

        it('schaltet einen Port über das Überschreiben der Port-Sicherheit ein und aus', async () => {
            await def('port_table.array.enable').writeVal(false, 'devices.sw.ports.port_01.enable', SWITCH, ctx.stub.adapter);

            expect(ctx.sent).to.have.length(1);
            expect(ctx.sent[0].cmd).to.equal(`${DEVICE_REST}/sw-1`);
            expect(ctx.sent[0].method).to.equal('PUT');
            expect(ctx.sent[0].payload.port_overrides[0].port_security_enabled).to.equal(true);
            expect(ctx.sent[0].payload.port_overrides[1].port_security_enabled).to.equal(false);
            expect(SWITCH.port_overrides[0].port_security_enabled).to.equal(false);
        });

        it('schaltet keinen Port ohne bestehenden port_overrides-Eintrag', async () => {
            await def('port_table.array.enable').writeVal(true, 'devices.sw.ports.port_05.enable', SWITCH, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.errors).to.have.length(1);
        });

        it('schaltet keinen Port mit konfiguriertem Ethernet-Profil', async () => {
            const sw = { ...SWITCH, port_overrides: [{ port_idx: 1, portconf_id: 'profile' }] };
            await def('port_table.array.enable').writeVal(true, 'devices.sw.ports.port_01.enable', sw, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.errors).to.have.length(1);
        });

        it('schaltet keinen Port mit MAC-Adressfilterung', async () => {
            const sw = { ...SWITCH, port_overrides: [{ port_idx: 1, port_security_mac_address: ['aa:bb'] }] };
            await def('port_table.array.enable').writeVal(true, 'devices.sw.ports.port_01.enable', sw, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.errors).to.have.length(1);
        });

        it('schaltet PoE über den Modus auto ein und aus', async () => {
            await def('port_table.array.poe_enable').writeVal(true, 'devices.sw.ports.port_01.poe_enable', SWITCH, ctx.stub.adapter);

            expect(ctx.sent[0].payload.port_overrides[0].poe_mode).to.equal('auto');
            expect(ctx.sent[0].method).to.equal('PUT');
        });

        it('schaltet PoE aus, wenn der Wert false ist', async () => {
            const sw = { ...SWITCH, port_overrides: [{ port_idx: 1, poe_mode: 'auto' }] };
            await def('port_table.array.poe_enable').writeVal(false, 'devices.sw.ports.port_01.poe_enable', sw, ctx.stub.adapter);

            expect(ctx.sent[0].payload.port_overrides[0].poe_mode).to.equal('off');
        });

        it('schaltet PoE nicht ohne port_overrides-Eintrag oder mit Ethernet-Profil', async () => {
            await def('port_table.array.poe_enable').writeVal(true, 'devices.sw.ports.port_05.poe_enable', SWITCH, ctx.stub.adapter);
            const sw = { ...SWITCH, port_overrides: [{ port_idx: 1, portconf_id: 'profile' }] };
            await def('port_table.array.poe_enable').writeVal(true, 'devices.sw.ports.port_01.poe_enable', sw, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.errors).to.have.length(2);
        });

        it('fängt Fehler beim Schalten von PoE ab', async () => {
            const failing = createTreeContext({}, { sendFails: true });
            await def('port_table.array.poe_enable').writeVal(true, 'devices.sw.ports.port_01.poe_enable', SWITCH, failing.stub.adapter);

            expect(failing.stub.errors).to.have.length(1);
        });

        it('liefert PoE-Status, Leistung und Spannung', () => {
            expect(def('port_table.array.poe_enable').readVal('auto', ctx.stub.adapter, SWITCH, portChannel, 'devices.sw.ports.port_01.poe_enable')).to.equal(true);
            expect(def('port_table.array.poe_enable').readVal('off', ctx.stub.adapter, SWITCH, portChannel, 'devices.sw.ports.port_01.poe_enable')).to.equal(false);
            expect(def('port_table.array.poe_power').readVal('12.5', ctx.stub.adapter, SWITCH, portChannel, 'devices.sw.ports.port_01.poe_power')).to.equal(12.5);
            expect(def('port_table.array.poe_voltage').readVal('53.9', ctx.stub.adapter, SWITCH, portChannel, 'devices.sw.ports.port_01.poe_voltage')).to.equal(53.9);
        });

        it('zeigt PoE-States nur für PoE-Ports', () => {
            for (const path of ['port_table.array.poe_enable', 'port_table.array.poe_cycle', 'port_table.array.poe_power', 'port_table.array.poe_voltage']) {
                expect(def(path).conditionToCreateState(SWITCH, portChannel, ctx.stub.adapter), path).to.equal(true);
                expect(def(path).conditionToCreateState(SWITCH, { port_idx: 2, port_poe: false }, ctx.stub.adapter), path).to.equal(false);
            }
        });

        it('startet einen PoE-Zyklus bei aktiviertem PoE des Ports', async () => {
            await def('port_table.array.poe_cycle').writeVal(true, 'devices.sw.ports.port_01.poe_cycle', SWITCH, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([
                { cmd: DEVICE_COMMAND, payload: { cmd: 'power-cycle', port_idx: 1, mac: 'aa:bb:cc:dd:ee:02' }, method: 'POST' },
            ]);
        });

        it('startet keinen PoE-Zyklus, wenn PoE am Port deaktiviert ist', async () => {
            await def('port_table.array.poe_cycle').writeVal(true, 'devices.sw.ports.port_02.poe_cycle', SWITCH, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.errors).to.have.length(1);
        });

        it('startet einen PoE-Zyklus für einen Port, der nicht in der Port-Tabelle steht', async () => {
            await def('port_table.array.poe_cycle').writeVal(true, 'devices.sw.ports.port_07.poe_cycle', SWITCH, ctx.stub.adapter);

            expect(ctx.sent[0].payload.port_idx).to.equal(7);
        });

        it('startet einen PoE-Zyklus ohne Port-Tabelle', async () => {
            await def('port_table.array.poe_cycle').writeVal(true, 'devices.sw.ports.port_01.poe_cycle', { ...SWITCH, port_table: [] }, ctx.stub.adapter);

            expect(ctx.sent).to.have.length(1);
        });

        it('fängt Fehler beim PoE-Zyklus ab', async () => {
            const failing = createTreeContext({}, { sendFails: true });
            await def('port_table.array.poe_cycle').writeVal(true, 'devices.sw.ports.port_01.poe_cycle', SWITCH, failing.stub.adapter);

            expect(failing.stub.errors).to.have.length(1);
        });

        it('rechnet Port-Bytes in GB und liefert die Zufriedenheit', () => {
            expect(def('port_table.array.rx_bytes').readVal(2_500_000_000, ctx.stub.adapter, SWITCH, portChannel, 'x')).to.equal(2.5);
            expect(def('port_table.array.tx_bytes').readVal(2_500_000_000, ctx.stub.adapter, SWITCH, portChannel, 'x')).to.equal(2.5);
            expect(def('port_table.array.satisfaction').readVal(-1, ctx.stub.adapter, SWITCH, portChannel, 'x')).to.equal(null);
            expect(def('port_table.array.satisfaction').readVal(80, ctx.stub.adapter, SWITCH, portChannel, 'x')).to.equal(80);
        });
    });

    describe('Funkmodule (radio_table)', () => {
        const radioChannel = { name: 'ng', ht: '80', tx_power_mode: 'auto' };

        it('liefert Kanal, Frequenz und Kanalbreite der Funkmodule', () => {
            expect(def('radio_table.array.channel').readVal(6, ctx.stub.adapter, AP, radioChannel, 'x')).to.equal('6');
            expect(def('radio_table.array.channel_name').readVal('ng', ctx.stub.adapter, AP, radioChannel, 'x')).to.equal(
                myHelper.radio_nameToFrequency('ng', ctx.stub.adapter),
            );
            expect(def('radio_table.array.channel_width').readVal('80', ctx.stub.adapter, AP, radioChannel, 'x')).to.equal(80);
            expect(def('radio_table').arrayChannelNameFromProperty(AP, radioChannel, 0, ctx.stub.adapter)).to.equal(
                myHelper.radio_nameToFrequency('ng', ctx.stub.adapter),
            );
        });

        it('setzt die Sendeleistung des angegebenen Funkmoduls', async () => {
            await def('radio_table.array.tx_power_mode').writeVal('high', 'devices.ap.radio.1.tx_power_mode', AP, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([
                {
                    cmd: `${DEVICE_REST}/ap-1`,
                    payload: {
                        radio_table: [
                            { name: 'wifi0', tx_power_mode: 'auto' },
                            { name: 'wifi1', tx_power_mode: 'high' },
                        ],
                    },
                    method: 'PUT',
                },
            ]);
        });

        it('setzt die Sendeleistung nicht, wenn das Gerät nicht verbunden ist', async () => {
            await def('radio_table.array.tx_power_mode').writeVal('high', 'devices.ap.radio.1.tx_power_mode', { ...AP, state: 0 }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
            expect(ctx.stub.warnings).to.have.length(1);
        });

        it('setzt die Sendeleistung nicht ohne Funkmodul-Tabelle', async () => {
            await def('radio_table.array.tx_power_mode').writeVal('high', 'devices.ap.radio.1.tx_power_mode', { ...AP, radio_table: undefined }, ctx.stub.adapter);

            expect(ctx.sent).to.deep.equal([]);
        });

        it('fängt Fehler beim Setzen der Sendeleistung ab', async () => {
            const failing = createTreeContext({}, { sendFails: true });
            await def('radio_table.array.tx_power_mode').writeVal('high', 'devices.ap.radio.1.tx_power_mode', AP, failing.stub.adapter);

            expect(failing.stub.errors).to.have.length(1);
        });

        it('liefert Statistiken der Funkmodule', () => {
            const statChannel = { name: 'ng' };
            expect(def('radio_table_stats').arrayChannelNameFromProperty(AP, statChannel, 0, ctx.stub.adapter)).to.equal(
                myHelper.radio_nameToFrequency('ng', ctx.stub.adapter),
            );
            expect(def('radio_table_stats.array.satisfaction').readVal(-1, ctx.stub.adapter, AP, statChannel, 'x')).to.equal(null);
            expect(def('radio_table_stats.array.satisfaction').readVal(55, ctx.stub.adapter, AP, statChannel, 'x')).to.equal(55);
        });
    });

    describe('WLAN-Netzwerke (vap_table)', () => {
        it('bildet die Kanal-ID aus der Netzwerk-ID und dem Funkmodul', () => {
            expect(def('vap_table').arrayChannelIdFromProperty(AP, { id: 'vap1', radio_name: 'wifi1' }, 0, ctx.stub.adapter)).to.equal('vap1_1');
            expect(def('vap_table').arrayChannelIdFromProperty(AP, { id: 'vap2', radio_name: 'ra0' }, 0, ctx.stub.adapter)).to.equal('vap2_0');
            expect(def('vap_table').arrayChannelIdFromProperty(AP, { id: 'vap3', radio_name: 'rai0' }, 0, ctx.stub.adapter)).to.equal('vap3_1');
        });

        it('liefert keine Kanal-ID ohne Netzwerk-ID', () => {
            expect(def('vap_table').arrayChannelIdFromProperty(AP, { radio_name: 'wifi0' }, 0, ctx.stub.adapter)).to.equal(undefined);
        });

        it('bildet den Kanalnamen aus SSID und Frequenz', () => {
            expect(def('vap_table').arrayChannelNameFromProperty(AP, { essid: 'Haus', radio_name: 'na' }, 0, ctx.stub.adapter)).to.equal(
                `Haus - ${myHelper.radio_nameToFrequency('na', ctx.stub.adapter)}`,
            );
        });

        it('liefert die Frequenz des Netzwerks', () => {
            expect(def('vap_table.array.channel_name').readVal('ng', ctx.stub.adapter, AP, {}, 'x')).to.equal(myHelper.radio_nameToFrequency('ng', ctx.stub.adapter));
        });

        it('zeigt verbundene Clients nur für Nicht-Gast-Netzwerke und Gäste nur für Gast-Netzwerke', () => {
            expect(isShown('vap_table.array.connected_clients', { is_guest: false })).to.equal(true);
            expect(isShown('vap_table.array.connected_clients', { is_guest: true })).to.equal(false);
            expect(isShown('vap_table.array.connected_guests', { is_guest: true })).to.equal(true);
            expect(isShown('vap_table.array.connected_guests', { is_guest: false })).to.equal(false);
        });

        it('liefert Bytes in GB und die Zufriedenheit des Netzwerks', () => {
            expect(def('vap_table.array.rx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, {}, 'x')).to.equal(2.5);
            expect(def('vap_table.array.tx_bytes').readVal(2_500_000_000, ctx.stub.adapter, AP, {}, 'x')).to.equal(2.5);
            expect(def('vap_table.array.satisfaction').readVal(-1, ctx.stub.adapter, AP, {}, 'x')).to.equal(null);
            expect(def('vap_table.array.satisfaction').readVal(70, ctx.stub.adapter, AP, {}, 'x')).to.equal(70);
        });
    });

    describe('PoE-Bedingungen und Temperatur-Kanäle', () => {
        const POE_PATHS = [
            'port_table.array.poe_enable',
            'port_table.array.poe_cycle',
            'port_table.array.poe_power',
            'port_table.array.poe_voltage',
        ];

        for (const path of POE_PATHS) {
            it(`erstellt '${path}' nur für PoE-Ports`, () => {
                expect(def(path).conditionToCreateState(SWITCH, { port_poe: true }, ctx.stub.adapter)).to.equal(true);
                expect(def(path).conditionToCreateState(SWITCH, { port_poe: false }, ctx.stub.adapter)).to.equal(false);
                expect(def(path).conditionToCreateState(SWITCH, {}, ctx.stub.adapter)).to.equal(false);
            });
        }

        it('bildet Kanal-ID und Kanalnamen der Temperatursensoren aus dem Sensornamen', () => {
            expect(def('temperatures').arrayChannelIdFromProperty(AP, { name: 'cpu' }, 0, ctx.stub.adapter)).to.equal('cpu');
            expect(def('temperatures').arrayChannelNameFromProperty(AP, { name: 'CPU' }, 0, ctx.stub.adapter)).to.equal('CPU');
        });
    });

    describe('Keys und State-IDs', () => {
        it('enthält die Keys aus valFromProperty', () => {
            const keys = device.getKeys();
            expect(keys).to.include.members(['user-num_sta', 'guest-num_sta', 'state']);
        });

        it('liefert die Keys bei wiederholtem Aufruf unverändert', () => {
            expect(device.getKeys()).to.deep.equal(device.getKeys());
        });

        it('liefert die State-IDs der Geräte', () => {
            expect(device.getStateIDs()).to.include.members(['disabled', 'led_override', 'restart', 'upgrade']);
        });
    });
});
