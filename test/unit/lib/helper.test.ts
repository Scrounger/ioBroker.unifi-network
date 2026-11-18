import { expect } from 'chai';
import {
    getAllIdsOfTreeDefinition,
    getAllowedCommonStates,
    getObjectByString,
    radio_nameToFrequency,
    radioToFrequency,
    zeroPad,
} from '../../../src/lib/helper.js';
import * as tree from '../../../src/lib/tree/index.js';
import { type AdapterStub, createAdapterStub } from '../../../tools/offlineAdapterStub.js';

describe('helper', () => {
    describe('zeroPad', () => {
        it('f\u00fcllt mit f\u00fchrenden Nullen bis zur Anzahl Stellen auf', () => {
            expect(zeroPad(5, 3)).to.equal('005');
            expect(zeroPad('7', 2)).to.equal('07');
        });

        it('l\u00e4sst Werte mit gen\u00fcgend Stellen unver\u00e4ndert', () => {
            expect(zeroPad(12, 2)).to.equal('12');
            expect(zeroPad(1234, 2)).to.equal('1234');
        });
    });

    describe('getObjectByString', () => {
        const obj = { a: { b: { c: 42 } }, list: ['x', 'y'] };

        it('liest verschachtelte Werte \u00fcber einen Punkt-Pfad', () => {
            expect(getObjectByString('a.b.c', obj)).to.equal(42);
        });

        it('akzeptiert einen eigenen Trenner', () => {
            expect(getObjectByString('a/b/c', obj, '/')).to.equal(42);
        });

        it('akzeptiert einen Pfad als Array', () => {
            expect(getObjectByString(['a', 'b'] as unknown as string, obj)).to.deep.equal({ c: 42 });
        });

        it('liefert undefined bei nicht vorhandenem Pfad', () => {
            expect(getObjectByString('a.x.c', obj)).to.equal(undefined);
        });
    });

    describe('getAllowedCommonStates', () => {
        it('erzeugt ein Mapping aus Werten einer Liste', () => {
            expect(getAllowedCommonStates('list', { list: ['x', 'y'] })).to.deep.equal({ x: 'x', y: 'y' });
        });

        it('liefert undefined, wenn der Pfad nicht existiert', () => {
            expect(getAllowedCommonStates('missing', {})).to.equal(undefined);
        });
    });

    describe('getAllIdsOfTreeDefinition', () => {
        it('verwendet idChannel bzw. id als Bestandteil der ID und ignoriert den states-Block', () => {
            const ids = getAllIdsOfTreeDefinition({
                a: { idChannel: 'chan', states: { s: {} } },
                b: { id: 'bid', states: {} },
            } as any);

            expect(ids).to.deep.equal(['chan', 'bid']);
        });
    });

    describe('Tree-Definitionen', () => {
        const modules = { client: tree.client, device: tree.device, wlan: tree.wlan, lan: tree.lan, sysInfo: tree.sysInfo, firewall: tree.firewall.group };

        for (const [name, mod] of Object.entries(modules)) {
            it(`${name}: enth\u00e4lt keine doppelten oder undefinierten State-IDs`, () => {
                const ids = getAllIdsOfTreeDefinition(mod.get());

                expect(new Set(ids).size).to.equal(ids.length);
                expect(ids.some(id => id.includes('undefined'))).to.equal(false);
            });
        }
    });

    describe('Frequenz-Zuordnung', () => {
        let stub: AdapterStub;

        beforeEach(() => {
            stub = createAdapterStub();
        });

        it('radioToFrequency ordnet ng und na den Frequenzb\u00e4ndern zu', () => {
            expect(radioToFrequency('ng', stub.adapter)).to.equal('2.4 GHz');
            expect(radioToFrequency('na', stub.adapter)).to.equal('5 GHz');
            expect(stub.warnings).to.have.length(0);
        });

        it('radioToFrequency gibt unbekannte Werte zur\u00fcck und warnt', () => {
            expect(radioToFrequency('6e', stub.adapter)).to.equal('6e');
            expect(radioToFrequency(undefined, stub.adapter)).to.equal(null);
            expect(stub.warnings).to.have.length(2);
        });

        it('radio_nameToFrequency ordnet die Interface-Namen den Frequenzb\u00e4ndern zu', () => {
            expect(radio_nameToFrequency('wifi0', stub.adapter)).to.equal('2.4 GHz');
            expect(radio_nameToFrequency('ra0', stub.adapter)).to.equal('2.4 GHz');
            expect(radio_nameToFrequency('wifi1', stub.adapter)).to.equal('5 GHz');
            expect(radio_nameToFrequency('rai0', stub.adapter)).to.equal('5 GHz');
            expect(radio_nameToFrequency('wifi2', stub.adapter)).to.equal('6 GHz');
            expect(stub.warnings).to.have.length(0);
        });

        it('radio_nameToFrequency liefert n/a und warnt bei unbekanntem Namen', () => {
            expect(radio_nameToFrequency('foo', stub.adapter)).to.equal('n/a');
            expect(stub.warnings).to.have.length(1);
        });
    });
});
