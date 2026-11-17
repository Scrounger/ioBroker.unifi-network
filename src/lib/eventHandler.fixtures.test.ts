import { expect } from 'chai';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureDir, latestFixtureVersion } from '../live/fixtureVersions.js';
import { type AdapterStub, createAdapterStub, setCachedClient, setCachedDevice } from '../live/offlineAdapterStub.js';
import type { NetworkEventData, NetworkEventMeta } from './api/network-types.js';
import { disconnectDebounceList, eventHandler } from './eventHandler.js';
import * as tree from './tree/index.js';

/**
 * Runs the event handlers against the recorded fixtures of the newest controller version.
 * The suite is skipped if the events directory does not exist.
 */
const FIXTURE_DIR = fixtureDir(latestFixtureVersion() ?? 'keine-version', 'events');
const describeWithFixtures = existsSync(FIXTURE_DIR) ? describe : describe.skip;

/**
 * First recorded sample of a fixture, e.g. `EVT_WG_Connected`.
 *
 * @param file fixture name without extension
 */
function sampleOf<T = NetworkEventData>(file: string): { meta: NetworkEventMeta; data: T } {
    const fixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${file}.json`), 'utf8')) as {
        samples: { meta: NetworkEventMeta; data: T }[];
    };
    return { meta: fixture.samples[0].meta, data: fixture.samples[0].data };
}

describeWithFixtures('eventHandler mit aufgezeichneten Fixtures (offline)', () => {
    let stub: AdapterStub;

    beforeEach(() => {
        stub = createAdapterStub();
        for (const mac of Object.keys(disconnectDebounceList)) {
            delete disconnectDebounceList[mac];
        }
    });

    describe('client', () => {
        it('setzt isOnline eines Gasts bei EVT_WG_Connected auf true', async () => {
            const { meta, data } = sampleOf('EVT_WG_Connected');
            const id = `${tree.client.idChannelGuests}.${data.guest}.isOnline`;
            stub.objects.add(id);

            await eventHandler.client.connected(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
            expect(stub.errors).to.deep.equal([]);
        });

        it('setzt isOnline eines Gasts bei EVT_WG_Disconnected auf false', async () => {
            const { meta, data } = sampleOf('EVT_WG_Disconnected');
            const id = `${tree.client.idChannelGuests}.${data.guest}.isOnline`;
            stub.objects.add(id);

            await eventHandler.client.connected(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(false);
            expect(stub.errors).to.deep.equal([]);
        });

        it('ignoriert Gäste, wenn guestsEnabled aus ist', async () => {
            stub = createAdapterStub({ guestsEnabled: false });
            const { meta, data } = sampleOf('EVT_WG_Connected');
            const id = `${tree.client.idChannelGuests}.${data.guest}.isOnline`;
            stub.objects.add(id);

            await eventHandler.client.connected(meta, data, stub.adapter, stub.cache);

            expect(stub.states.has(id)).to.equal(false);
        });

        it('übernimmt uplink_name und uplink_mac bei einem Gast-Roam (EVT_WG_Roam)', async () => {
            const { meta, data } = sampleOf('EVT_WG_Roam');
            const mac = data.guest as string;
            const apTo = data.ap_to as string;
            setCachedClient(stub.cache, mac, { name: 'Gast', is_guest: true });
            setCachedDevice(stub.cache, apTo, { name: 'AP Ziel', mac: apTo });
            const idName = `${tree.client.idChannelGuests}.${mac}.uplink_name`;
            const idMac = `${tree.client.idChannelGuests}.${mac}.uplink_mac`;
            stub.objects.add(idName);
            stub.objects.add(idMac);

            await eventHandler.client.roamed(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(idName)).to.equal('AP Ziel');
            expect(stub.states.get(idMac)).to.equal(apTo);
        });

        it('setzt blocked bei EVT_WC_Blocked auf true und bei EVT_WC_Unblocked auf false', async () => {
            const blocked = sampleOf('EVT_WC_Blocked');
            const mac = blocked.data.client as string;
            setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
            const id = `${tree.client.idChannelUsers}.${mac}.blocked`;
            stub.objects.add(id);

            await eventHandler.client.block(blocked.meta, blocked.data, stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(true);

            const unblocked = sampleOf('EVT_WC_Unblocked');
            await eventHandler.client.block(unblocked.meta, unblocked.data, stub.adapter, stub.cache);
            expect(stub.states.get(id)).to.equal(false);
        });

        it('setzt isOnline eines Users bei EVT_WU_Connected auf true', async () => {
            const { meta, data } = sampleOf('EVT_WU_Connected');
            const mac = data.user as string;
            const id = `${tree.client.idChannelUsers}.${mac}.isOnline`;
            stub.objects.add(id);

            await eventHandler.client.connected(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
        });

        it('übernimmt uplink_name bei einem User-Roam (EVT_WU_Roam)', async () => {
            const { meta, data } = sampleOf('EVT_WU_Roam');
            const mac = data.user as string;
            const apTo = data.ap_to as string;
            setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
            setCachedDevice(stub.cache, apTo, { name: 'AP Ziel', mac: apTo });
            const id = `${tree.client.idChannelUsers}.${mac}.uplink_name`;
            stub.objects.add(id);

            await eventHandler.client.roamed(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal('AP Ziel');
        });

        it('übernimmt den Zielkanal bei einem User-Radiowechsel (EVT_WU_RoamRadio)', async () => {
            const { meta, data } = sampleOf('EVT_WU_RoamRadio');
            const mac = data.user as string;
            setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
            const id = `${tree.client.idChannelUsers}.${mac}.channel`;
            stub.objects.add(id);

            await eventHandler.client.roamedRadio(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(parseInt(data.channel_to as string));
        });
    });

    describe('device', () => {
        it('setzt isOnline eines Geräts bei EVT_AP_Restarted auf false', async () => {
            const { meta, data } = sampleOf('EVT_AP_Restarted');
            const mac = data.ap as string;
            setCachedDevice(stub.cache, mac, { name: 'AP', mac });
            const id = `${tree.device.idChannel}.${mac}.isOnline`;
            stub.objects.add(id);

            await eventHandler.device.restarted(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(false);
            expect(stub.errors).to.deep.equal([]);
        });

        it('setzt isOnline eines Geräts bei EVT_AP_Connected auf true', async () => {
            const { meta, data } = sampleOf('EVT_AP_Connected');
            const mac = data.ap as string;
            setCachedDevice(stub.cache, mac, { name: 'AP', mac });
            const id = `${tree.device.idChannel}.${mac}.isOnline`;
            stub.objects.add(id);

            await eventHandler.device.connected(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(true);
        });

        it('setzt isOnline auf false und state auf 0 bei EVT_AP_Lost_Contact', async () => {
            const { meta, data } = sampleOf('EVT_AP_Lost_Contact');
            const mac = data.ap as string;
            setCachedDevice(stub.cache, mac, { name: 'AP', mac });
            const idOnline = `${tree.device.idChannel}.${mac}.isOnline`;
            const idState = `${tree.device.idChannel}.${mac}.state`;
            stub.objects.add(idOnline);
            stub.objects.add(idState);

            await eventHandler.device.lostContact(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(idOnline)).to.equal(false);
            expect(stub.states.get(idState)).to.equal(0);
            expect(stub.errors).to.deep.equal([]);
        });

        it('übernimmt den WAN-Status aus EVT_GW_WANTransition am passenden Interface', async () => {
            const { meta, data } = sampleOf('EVT_GW_WANTransition');
            const gw = (data.gw || data.dm) as string;
            setCachedDevice(stub.cache, gw, { name: 'Gateway', mac: gw, wan1: { ifname: data.iface } });
            const id = `${tree.device.idChannel}.${gw}.isp.wan1.isOnline`;
            stub.objects.add(id);

            await eventHandler.device.wanTransition(meta, data, stub.adapter, stub.cache);

            expect(stub.states.get(id)).to.equal(data.state === 'active');
        });

        it('ändert nichts bei WAN-Transition ohne passendes Interface im Cache', async () => {
            const { meta, data } = sampleOf('EVT_GW_WANTransition');
            const gw = (data.gw || data.dm) as string;
            setCachedDevice(stub.cache, gw, { name: 'Gateway', mac: gw });
            const id = `${tree.device.idChannel}.${gw}.isp.wan1.isOnline`;
            stub.objects.add(id);

            await eventHandler.device.wanTransition(meta, data, stub.adapter, stub.cache);

            expect(stub.states.has(id)).to.equal(false);
        });
    });

    describe('Löschen von Objekten', () => {
        it('entfernt Objekte und Cache eines Clients bei user:delete', async () => {
            const [data] = sampleOf<{ mac: string }[]>('user-delete').data;
            const mac = data.mac;
            setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
            stub.objects.add(`${tree.client.idChannelUsers}.${mac}`);
            stub.objects.add(`${tree.client.idChannelUsers}.${mac}.isOnline`);
            stub.objects.add(`${tree.client.idChannelUsers}.${mac}.blocked`);

            await eventHandler.user.clientRemoved(sampleOf('user-delete').meta, data, stub.adapter, stub.cache);

            expect([...stub.objects].filter(id => id.startsWith(`${tree.client.idChannelUsers}.${mac}`))).to.deep.equal(
                [],
            );
            expect(stub.cache.clients[mac]).to.equal(undefined);
        });

        it('lässt Objekte bei user:delete stehen, wenn keepIobSynchron aus ist', async () => {
            stub = createAdapterStub({ keepIobSynchron: false });
            const [data] = sampleOf<{ mac: string }[]>('user-delete').data;
            const mac = data.mac;
            setCachedClient(stub.cache, mac, { name: 'Client', is_guest: false });
            const id = `${tree.client.idChannelUsers}.${mac}.isOnline`;
            stub.objects.add(id);

            await eventHandler.user.clientRemoved(sampleOf('user-delete').meta, data, stub.adapter, stub.cache);

            expect(stub.objects.has(id)).to.equal(true);
        });

        it('entfernt die WLAN-Konfiguration bei wlanconf:delete', async () => {
            const { meta, data } = sampleOf<{ _id: string; name?: string }[]>('wlanconf-delete');
            const id = `${tree.wlan.idChannel}.${data[0]._id}`;
            const other = `${tree.wlan.idChannel}.andere-wlan`;
            stub.objects.add(id);
            stub.objects.add(`${id}.name`);
            stub.objects.add(other);

            await eventHandler.wlanConf.deleted(meta, data, stub.adapter, stub.cache);

            expect(stub.objects.has(id)).to.equal(false);
            expect(stub.objects.has(`${id}.name`)).to.equal(false);
            expect(stub.objects.has(other)).to.equal(true);
        });

        it('entfernt das LAN bei networkconf:delete', async () => {
            const { meta, data } = sampleOf<{ _id: string }[]>('networkconf-delete');
            const id = `${tree.lan.idChannel}.${data[0]._id}`;
            stub.objects.add(id);
            stub.objects.add(`${id}.name`);

            await eventHandler.lanConf.deleted(meta, data, stub.adapter, stub.cache);

            expect([...stub.objects].filter(existing => existing.startsWith(id))).to.deep.equal([]);
        });

        it('entfernt die Firewall-Gruppe bei firewallgroup:delete', async () => {
            const { meta, data } = sampleOf<{ _id: string }[]>('firewallgroup-delete');
            const id = `${tree.firewall.group.idChannel}.${data[0]._id}`;
            stub.objects.add(id);
            stub.objects.add(`${id}.name`);

            await eventHandler.firewall.group.deleted(meta, data, stub.adapter, stub.cache);

            expect([...stub.objects].filter(existing => existing.startsWith(id))).to.deep.equal([]);
        });
    });
});
