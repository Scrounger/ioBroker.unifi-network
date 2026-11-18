import { expect } from 'chai';
import { anonymize, findLeaks, removeSecretEntries } from '../../tools/anonymizeFixtures.js';

describe('anonymizeFixtures (offline)', () => {
    it('replaces MAC, IPv4 and IPv6 addresses with placeholders', () => {
        const text = JSON.stringify(
            anonymize({ mac: 'f4:92:bf:12:34:56', ip: '192.168.1.10', ipv6: '2001:4860:4860::8888' }, []),
        );

        expect(text).not.to.include('f4:92:bf:12:34:56');
        expect(text).not.to.include('192.168.1.10');
        expect(text).not.to.include('2001:4860:4860::8888');
        expect(findLeaks(text, [])).to.deep.equal([]);
    });

    it('keeps keys and only replaces values under name-like keys', () => {
        const result = anonymize<Record<string, string>>({ device_name: 'Living room' }, []);

        expect(Object.keys(result)).to.deep.equal(['device_name']);
        expect(result.device_name).to.not.equal('Living room');
    });

    it('keeps MAC addresses under the name key user as MAC placeholders', () => {
        const result = anonymize<{ user: string; name: string }>({ user: 'f4:92:bf:12:34:56', name: 'Living room' }, []);

        expect(result.user).to.match(/^02:00:00:00:[0-9a-f]{2}:[0-9a-f]{2}$/);
        expect(result.name).to.not.match(/^02:00:00:00:/);
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('replaces values under secret keys with <redacted>', () => {
        const result = anonymize<Record<string, string>>({ x_passphrase: 'abc123' }, []);

        expect(result.x_passphrase).to.equal('<redacted>');
    });

    it('keeps event keys under the field key, redacts other key values', () => {
        const result = anonymize<{ key: string; api_key: string }>({ key: 'EVT_WU_Connected', api_key: 'abc123' }, []);

        expect(result.key).to.equal('EVT_WU_Connected');
        expect(result.api_key).to.equal('<redacted>');
    });

    it('keeps version strings that look like IPv4 addresses', () => {
        const result = anonymize<Record<string, string>>({ version: '198.18.0.183' }, []);

        expect(result.version).to.equal('198.18.0.183');
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('replaces URL hosts and keeps the path', () => {
        const result = anonymize<Record<string, string>>({ inform_url: 'https://unifi.example.de:8443/inform' }, []);

        expect(result.inform_url).to.equal('https://host.invalid/inform');
        expect(findLeaks(JSON.stringify(result), [])).to.deep.equal([]);
    });

    it('removes literal secrets from free text', () => {
        const text = JSON.stringify(anonymize({ message: 'Login at mycontroller.local' }, ['mycontroller.local']));

        expect(text).not.to.include('mycontroller.local');
    });

    it('also replaces names in free text', () => {
        const result = anonymize<Record<string, string>>({ name: 'Living room', message: 'Device Living room offline' }, []);

        expect(result.message).not.to.include('Living room');
    });

    it('reports IPv4 addresses, object IDs and URL hosts as leaks', () => {
        expect(findLeaks('{"ip":"10.0.0.1"}', [])).to.include('IPv4 address');
        expect(findLeaks('{"id":"5f1a2b3c4d5e6f7a8b9c0d1e"}', [])).to.include('Object ID');
        expect(findLeaks('{"url":"https://real.example.de/x"}', [])).to.include('URL-Host');
    });

    it('does not report version fields as IPv4 leaks', () => {
        expect(findLeaks('{"version":"6.7.57.15670"}', [])).to.deep.equal([]);
    });

    it('removes WireGuard client entries completely and keeps server entries', () => {
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
