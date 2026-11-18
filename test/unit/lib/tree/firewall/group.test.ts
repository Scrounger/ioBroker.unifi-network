import { expect } from 'chai';
import type { NetworkApi } from '../../../../../src/lib/api/network-api.js';
import type { FirewallGroup } from '../../../../../src/lib/api/network-types-firewall.js';
import type { myTreeState } from '../../../../../src/lib/myIob.js';
import { group } from '../../../../../src/lib/tree/firewall/group.js';
import { createAdapterStub } from '../../../../../tools/offlineAdapterStub.js';

type GroupState = myTreeState<any, FirewallGroup, ioBroker.myAdapter>;

/** One request that the fake API received through `sendData`. */
interface SentRequest {
    cmd: string;
    payload: Record<string, unknown>;
    method: string;
}

const ENDPOINT = 'https://192.0.2.1:443/api/s/default/rest/firewallgroup';

const DEVICE: FirewallGroup = {
    _id: 'group-1',
    name: 'Alt',
    site_id: 'site-1',
    group_members: ['10.0.0.1'],
    group_type: 'address-group',
};

/**
 * Returns a value or throws, so that an optional tree function cannot silently be skipped.
 *
 * @param value value that must be set
 * @param what name shown in the error message
 */
function required<T>(value: T | undefined, what: string): T {
    if (value === undefined) {
        throw new Error(`${what} is not defined`);
    }
    return value;
}

/**
 * Returns one state definition of the group tree.
 *
 * @param key name of the state in the tree
 */
function stateOf(key: string): GroupState {
    const definition = group.get()[key];

    if (!definition || !('iobType' in definition)) {
        throw new Error(`${key} is not a state`);
    }

    return definition;
}

/**
 * Creates a fake API that records `sendData` calls and reports success.
 *
 * @param sent list that receives each request
 */
function createFakeApi(sent: SentRequest[]): NetworkApi {
    const api = {
        getApiEndpoint: (): string => ENDPOINT,
        sendData: (cmd: string, payload: Record<string, unknown>, method: string): Promise<unknown> => {
            sent.push({ cmd, payload, method });
            return Promise.resolve({ statusCode: 200 });
        },
        checkCommandSuccessful: (): Promise<boolean> => Promise.resolve(true),
    };

    return api as unknown as NetworkApi;
}

describe('firewall group tree', () => {
    describe('name', () => {
        it('sendet den neuen Namen per PUT an die Gruppen-ID', async () => {
            const sent: SentRequest[] = [];
            const stub = createAdapterStub();
            stub.adapter.ufn = createFakeApi(sent);
            const writeVal = required(stateOf('name').writeVal, 'name.writeVal');

            await writeVal('Neu', 'group-1', DEVICE, stub.adapter);

            expect(sent).to.deep.equal([{ cmd: `${ENDPOINT}/group-1`, payload: { name: 'Neu' }, method: 'PUT' }]);
        });
    });

    describe('group_members', () => {
        it('sendet die Mitglieder als Array per PUT', async () => {
            const sent: SentRequest[] = [];
            const stub = createAdapterStub();
            stub.adapter.ufn = createFakeApi(sent);
            const writeVal = required(stateOf('group_members').writeVal, 'group_members.writeVal');

            await writeVal('["10.0.0.1","10.0.0.2"]', 'group-1', DEVICE, stub.adapter);

            expect(sent).to.deep.equal([
                { cmd: `${ENDPOINT}/group-1`, payload: { group_members: ['10.0.0.1', '10.0.0.2'] }, method: 'PUT' },
            ]);
        });

        it('sendet nichts und meldet einen Fehler bei ungültigem JSON', async () => {
            const sent: SentRequest[] = [];
            const stub = createAdapterStub();
            stub.adapter.ufn = createFakeApi(sent);
            const writeVal = required(stateOf('group_members').writeVal, 'group_members.writeVal');

            await writeVal('kein json', 'group-1', DEVICE, stub.adapter);

            expect(sent).to.deep.equal([]);
            expect(stub.errors).to.have.length(1);
        });

        it('liest die Mitglieder als JSON-String', () => {
            const stub = createAdapterStub();
            const readVal = required(stateOf('group_members').readVal, 'group_members.readVal');

            expect(readVal(['a', 'b'], stub.adapter, DEVICE, DEVICE, 'group-1')).to.equal('["a","b"]');
        });
    });

    describe('group_type', () => {
        it('bildet die Gruppentypen auf lesbare Bezeichnungen ab', () => {
            expect(stateOf('group_type').states).to.deep.equal({
                'port-group': 'Port',
                'address-group': 'IPv4',
                'ipv6-address-group': 'IPv6',
            });
        });
    });
});
