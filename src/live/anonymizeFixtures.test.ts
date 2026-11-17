import { expect } from 'chai';
import { anonymize, findLeaks, removeSecretEntries } from './anonymizeFixtures.js';

describe('anonymizeFixtures (offline)', () => {
    it('ersetzt MAC-, IPv4- und IPv6-Adressen durch Platzhalter', () => {
        const text = JSON.stringify(
            anonymize({ mac: 'f4:92:bf:12:34:56', ip: '192.168.1.10', ipv6: '2001:4860:4860::8888' }, []),
        );

        expect(text).not.to.include('f4:92:bf:12:34:56');
        expect(text).not.to.include('192.168.1.10');
        expect(text).not.to.include('2001:4860:4860::8888');
        expect(findLeaks(text, [])).to.deep.equal([]);
    });

    it('behält Schlüssel bei und ersetzt nur Werte unter Namensschlüsseln', () => {
        const result = anonymize<Record<string, string>>({ device_name: 'Wohnzimmer' }, []);

        expect(Object.keys(result)).to.deep.equal(['device_name']);
        expect(result.device_name).to.not.equal('Wohnzimmer');
    });

    it('behält MAC-Adressen unter dem Namensschlüssel user als MAC-Platzhalter', () => {
        const result = anonymize<{ user: string; name: string }>({ user: 'f4:92:bf:12:34:56', name: 'Wohnzimmer' }, []);

        expect(result.user).to.match(/^02:00:00:00:[0-9a-f]{2}:[0-9a-f]{2}$/);
        expect(result.name).to.not.match(/^02:00:00:00:/);
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('ersetzt Werte unter Geheimnisschlüsseln durch <redacted>', () => {
        const result = anonymize<Record<string, string>>({ x_passphrase: 'abc123' }, []);

        expect(result.x_passphrase).to.equal('<redacted>');
    });

    it('behält Event-Keys unter dem Feld key, schwärzt andere key-Werte', () => {
        const result = anonymize<{ key: string; api_key: string }>({ key: 'EVT_WU_Connected', api_key: 'abc123' }, []);

        expect(result.key).to.equal('EVT_WU_Connected');
        expect(result.api_key).to.equal('<redacted>');
    });

    it('behält Versionsstrings, die wie IPv4-Adressen aussehen', () => {
        const result = anonymize<Record<string, string>>({ version: '198.18.0.183' }, []);

        expect(result.version).to.equal('198.18.0.183');
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('ersetzt URL-Hosts und behält den Pfad', () => {
        const result = anonymize<Record<string, string>>({ inform_url: 'https://unifi.example.de:8443/inform' }, []);

        expect(result.inform_url).to.equal('https://host.invalid/inform');
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('entfernt literale Geheimnisse aus Freitext', () => {
        const text = JSON.stringify(anonymize({ message: 'Login am mycontroller.local' }, ['mycontroller.local']));

        expect(text).not.to.include('mycontroller.local');
    });

    it('ersetzt Namen auch im Freitext', () => {
        const result = anonymize<Record<string, string>>({ name: 'Wohnzimmer', message: 'Gerät Wohnzimmer offline' }, []);

        expect(result.message).not.to.include('Wohnzimmer');
    });

    it('meldet IPv4-Adressen, Objekt-IDs und URL-Hosts als Lecks', () => {
        expect(findLeaks('{"ip":"10.0.0.1"}', [])).to.include('IPv4-Adresse');
        expect(findLeaks('{"id":"5f1a2b3c4d5e6f7a8b9c0d1e"}', [])).to.include('Objekt-ID');
        expect(findLeaks('{"url":"https://real.example.de/x"}', [])).to.include('URL-Host');
    });

    it('meldet Versionsfelder nicht als IPv4-Leck', () => {
        expect(findLeaks('{"version":"6.7.57.15670"}', [])).to.deep.equal([]);
    });

    it('entfernt WireGuard-Client-Einträge komplett und lässt Server-Einträge', () => {
        const input = {
            data: [
                { name: 'client', vpn_type: 'wireguard-client', private_key: 'secret' },
                { name: 'server', vpn_type: 'wireguard-server' },
                { name: 'other', x_private_key: 'secret' },
            ],
        };

        const result = removeSecretEntries(input);

        expect(result.data.map((entry: { name: string }) => entry.name)).to.deep.equal(['server']);
    });
});
