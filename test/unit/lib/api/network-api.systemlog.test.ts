import { expect } from 'chai';
import { NetworkApi } from '../../../../src/lib/api/network-api.js';
import { SystemLogType } from '../../../../src/lib/api/network-types-system-log.js';
import { createAdapterStub } from '../../../../tools/offlineAdapterStub.js';

/** One request recorded by `retrievData`, with the JSON body parsed. */
interface RecordedRequest {
    url: string;
    body: Record<string, any>;
}

/**
 * Creates an API instance without a connection and replaces `retrievData`.
 * Every request is recorded, the response is an empty system log.
 *
 * @returns the API instance, the recorded requests and the adapter stub with its warnings
 */
function createRecordingApi(): { api: NetworkApi; requests: RecordedRequest[]; warnings: string[] } {
    const stub = createAdapterStub();
    const api = new NetworkApi('192.0.2.1', 443, 'default', 'user', 'password', stub.adapter);
    const requests: RecordedRequest[] = [];

    api.retrievData = (url: string, options: { body?: unknown } = {}): Promise<any> => {
        requests.push({ url, body: JSON.parse(String(options.body)) });
        return Promise.resolve({ data: [] });
    };

    return { api, requests, warnings: stub.warnings };
}

describe('NetworkApi.getSystemLog (offline)', () => {
    const START = 1_700_000_000_000;
    const END = 1_700_000_600_000;
    const MAC = 'aa:bb:cc:dd:ee:ff';

    it('uebergibt die MAC-Filter im Payload, wenn sie gesetzt sind', async () => {
        const { api, requests } = createRecordingApi();

        await api.getSystemLog(SystemLogType.devices, 0, 10, START, END, [MAC]);

        expect(requests).to.have.length(1);
        expect(requests[0].body.macs).to.deep.equal([MAC]);
    });

    it('setzt kein macs-Feld, wenn keine MAC-Filter uebergeben werden', async () => {
        const { api, requests } = createRecordingApi();

        await api.getSystemLog(SystemLogType.devices, 0, 10, START, END);

        expect(requests).to.have.length(1);
        expect(requests[0].body).to.not.have.property('macs');
    });

    it('setzt macs nicht bei anderen Log-Typen', async () => {
        const { api, requests } = createRecordingApi();

        await api.getSystemLog(SystemLogType.admin, 0, 10, START, END, [MAC]);

        expect(requests).to.have.length(1);
        expect(requests[0].body).to.not.have.property('macs');
    });

    it('uebernimmt Start, Ende, Seite und Seitengroesse in den Payload', async () => {
        const { api, requests } = createRecordingApi();

        await api.getSystemLog(SystemLogType.devices, 2, 25, START, END);

        expect(requests[0].body).to.include({
            timestampFrom: START,
            timestampTo: END,
            pageNumber: 2,
            pageSize: 25,
        });
    });

    it('schreibt die angefragte URL nicht als Warnung ins Log', async () => {
        const { api, requests, warnings } = createRecordingApi();

        await api.getSystemLog(SystemLogType.devices, 0, 10, START, END, [MAC]);

        expect(requests).to.have.length(1);
        expect(warnings).to.not.include(requests[0].url);
        expect(warnings).to.deep.equal([]);
    });
});
