import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ApiEndpoints, NetworkApi } from '../../../../src/lib/api/network-api.js';
import { fixtureDir, latestFixtureVersion, requireFixtures } from '../../../../tools/fixtureVersions.js';
import { createAdapterStub } from '../../../../tools/offlineAdapterStub.js';

const API_DIR = fixtureDir(latestFixtureVersion() ?? 'none', 'api');

/**
 * Returns the `response` of a recorded API fixture.
 *
 * @param name Name of the fixture file without `.json`.
 */
function responseOf<T = any>(name: string): T {
    const fixture = JSON.parse(readFileSync(path.join(API_DIR, `${name}.json`), 'utf8')) as { response: T };
    return fixture.response;
}

/** Creates an API instance without a connection. */
function createApi(): NetworkApi {
    const stub = createAdapterStub();
    return new NetworkApi('192.0.2.1', 443, 'default', 'user', 'password', stub.adapter);
}

/**
 * Replaces `retrievData` so that it records the URL and returns `value` for every call.
 *
 * @param api API instance whose `retrievData` is replaced.
 * @param value Value returned for every request.
 * @param requested List that receives each requested URL.
 */
function respondWith(api: NetworkApi, value: unknown, requested: string[]): void {
    api.retrievData = (url: string): Promise<any> => {
        requested.push(url);
        return Promise.resolve(value);
    };
}

describe('NetworkApi: URLs und Antwort-Auswertung (offline)', () => {
    describe('getApiEndpoint', () => {
        it('baut die Login-URL für einen klassischen Controller ohne UniFi-OS-Präfix', () => {
            expect(createApi().getApiEndpoint(ApiEndpoints.login)).to.equal('https://192.0.2.1:443/api/login');
        });

        it('baut die Login-URL für UniFi OS mit Auth-Pfad', () => {
            const api = createApi();
            api.isUnifiOs = true;

            expect(api.getApiEndpoint(ApiEndpoints.login)).to.equal('https://192.0.2.1:443/api/auth/login');
        });

        it('verwendet die Site aus dem Konstruktor in den Client-Endpunkten', () => {
            expect(createApi().getApiEndpoint(ApiEndpoints.clients)).to.equal('https://192.0.2.1:443/api/s/default/rest/user');
        });
    });

    describe('responseOk', () => {
        it('akzeptiert Statuscodes von 200 bis 299', () => {
            const api = createApi();

            expect(api.responseOk(200)).to.equal(true);
            expect(api.responseOk(204)).to.equal(true);
            expect(api.responseOk(299)).to.equal(true);
        });

        it('lehnt Statuscodes außerhalb von 200 bis 299 und fehlende Codes ab', () => {
            const api = createApi();

            expect(api.responseOk(199)).to.equal(false);
            expect(api.responseOk(300)).to.equal(false);
            expect(api.responseOk(404)).to.equal(false);
            expect(api.responseOk(500)).to.equal(false);
            expect(api.responseOk(undefined)).to.equal(false);
        });
    });

    describe('retrievData', () => {
        it('gibt den JSON-Body bei Status 200 zurück', async () => {
            const api = createApi();
            const body = { meta: { rc: 'ok' }, data: [{ version: '10.6.109' }] };
            let retrieveCalls = 0;
            api.retrieve = (): Promise<any> => {
                retrieveCalls++;
                return Promise.resolve({ statusCode: 200, body: { json: () => Promise.resolve(body) } });
            };

            const result = await api.retrievData('https://192.0.2.1:443/api/s/default/stat/sysinfo');

            expect(result).to.deep.equal(body);
            expect(retrieveCalls).to.equal(1);
        });

        it('wiederholt die Anfrage einmal bei einem Fehlerstatus und gibt dann undefined zurück', async () => {
            const api = createApi();
            let calls = 0;
            api.retrieve = (): Promise<any> => {
                calls++;
                return Promise.resolve({ statusCode: 500, body: { json: () => Promise.resolve({}) } });
            };

            const result = await api.retrievData('https://192.0.2.1:443/api/s/default/stat/sysinfo');

            expect(result).to.equal(undefined);
            expect(calls).to.equal(2);
        });
    });

    describe('URLs der V2- und Legacy-Endpunkte', () => {
        it('fragt die Geräteliste mit den Parametern separateUnmanaged und includeTrafficUsage ab', async () => {
            const api = createApi();
            const requested: string[] = [];
            respondWith(api, { network_devices: [] }, requested);

            await api.getDevices_V2();

            expect(requested).to.deep.equal([
                'https://192.0.2.1:443/v2/api/site/default/device?separateUnmanaged=false&includeTrafficUsage=false',
            ]);
        });

        it('hängt die MAC-Adresse an die aktiven Clients an', async () => {
            const api = createApi();
            const requested: string[] = [];
            respondWith(api, [], requested);

            await api.getClientsActive_V2('02:00:00:00:00:01');

            expect(requested[0]).to.match(/\/clients\/active\/02:00:00:00:00:01\?includeTrafficUsage=true&includeUnifiDevices=true$/);
        });

        it('übergibt withinHours an den Client-Verlauf', async () => {
            const api = createApi();
            const requested: string[] = [];
            respondWith(api, [], requested);

            await api.getClientsHistory_V2(24);

            expect(requested[0]).to.match(/\/clients\/history\?includeUnifiDevices=true&withinHours=24$/);
        });
    });

    describe('leere Antworten', () => {
        it('liefert undefined, wenn der Controller keine Daten zurückgibt', async () => {
            const api = createApi();
            respondWith(api, undefined, []);

            expect(await api.getDevices_V2()).to.equal(undefined);
            expect(await api.getClients()).to.equal(undefined);
            expect(await api.getWlanConfig_V2()).to.equal(undefined);
            expect(await api.getSysInfo()).to.equal(undefined);
            expect(await api.getControllerVersion()).to.equal(undefined);
        });

        it('liefert undefined, wenn data leer ist', async () => {
            const api = createApi();
            respondWith(api, { meta: { rc: 'ok' }, data: [] }, []);

            expect(await api.getClients()).to.equal(undefined);
            expect(await api.getFirewallGroup()).to.equal(undefined);
            expect(await api.getSites()).to.equal(undefined);
        });
    });
});

describe('NetworkApi: Getter gegen aufgezeichnete Antworten (offline)', () => {
    before(() => {
        requireFixtures(API_DIR);
    });

    it('getDevices_V2 gibt die Geräte-Antwort unverändert zurück', async () => {
        const api = createApi();
        const fixture = responseOf('devicesV2');
        respondWith(api, fixture, []);

        expect(await api.getDevices_V2()).to.deep.equal(fixture);
    });

    it('getClients gibt die Client-Liste aus data zurück', async () => {
        const api = createApi();
        const requested: string[] = [];
        const fixture = responseOf('clients');
        respondWith(api, fixture, requested);

        expect(await api.getClients()).to.deep.equal(fixture.data);
        expect(requested).to.deep.equal(['https://192.0.2.1:443/api/s/default/rest/user']);
    });

    it('getClientsActive_V2 liefert alle aktiven Clients ohne Filter', async () => {
        const api = createApi();
        const fixture = responseOf('clientsActiveV2');
        respondWith(api, fixture, []);

        expect(await api.getClientsActive_V2()).to.deep.equal(fixture);
    });

    it('getClientsActive_V2 filtert nach Schlüssel und Wert', async () => {
        const api = createApi();
        const fixture = responseOf<{ is_wired: boolean }[]>('clientsActiveV2');
        respondWith(api, fixture, []);

        const wired = await api.getClientsActive_V2(undefined, true, true, 'is_wired', true);

        expect(wired).to.have.length(fixture.filter(client => client.is_wired === true).length);
        expect(wired?.every(client => client.is_wired === true)).to.equal(true);
    });

    it('getClientsHistory_V2 liefert den Verlauf', async () => {
        const api = createApi();
        const fixture = responseOf('clientsHistoryV2');
        respondWith(api, fixture, []);

        expect(await api.getClientsHistory_V2(24)).to.deep.equal(fixture);
    });

    it('getWlanConfig_V2 liefert die WLAN-Konfigurationen', async () => {
        const api = createApi();
        const fixture = responseOf('wlanConfigV2');
        respondWith(api, fixture, []);

        expect(await api.getWlanConfig_V2()).to.deep.equal(fixture);
    });

    it('getLanConfig_V2 liefert die LAN-Konfigurationen', async () => {
        const api = createApi();
        const fixture = responseOf('lanConfigV2');
        respondWith(api, fixture, []);

        expect(await api.getLanConfig_V2()).to.deep.equal(fixture);
    });

    it('getFirewallGroup liefert die Firewall-Gruppen aus data', async () => {
        const api = createApi();
        const fixture = responseOf('firewallGroup');
        respondWith(api, fixture, []);

        expect(await api.getFirewallGroup()).to.deep.equal(fixture.data);
    });

    it('getSites liefert die Sites aus data', async () => {
        const api = createApi();
        const fixture = responseOf('sites');
        respondWith(api, fixture, []);

        expect(await api.getSites()).to.deep.equal(fixture.data);
    });

    it('getSysInfo liefert den ersten Eintrag aus data', async () => {
        const api = createApi();
        const fixture = responseOf('sysinfo');
        respondWith(api, fixture, []);

        expect(await api.getSysInfo()).to.deep.equal(fixture.data[0]);
    });

    it('getControllerVersion liefert die Version aus der sysinfo-Antwort', async () => {
        const api = createApi();
        const fixture = responseOf('sysinfo');
        respondWith(api, fixture, []);

        expect(await api.getControllerVersion()).to.equal(fixture.data[0].version);
    });

    it('getDeviceModels_V2 liefert die Modellliste', async () => {
        const api = createApi();
        const fixture = responseOf('modelsV2');
        respondWith(api, fixture, []);

        expect(await api.getDeviceModels_V2()).to.deep.equal(fixture.model_list);
    });

    it('getVpnUser liefert die VPN-Benutzer', async () => {
        const api = createApi();
        const fixture = responseOf('vpnUsersV2');
        respondWith(api, fixture, []);

        expect(await api.getVpnUser()).to.deep.equal(fixture);
    });
});
