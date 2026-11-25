import type { NetworkApi } from '../src/lib/api/network-api.js';
import { createAdapterStub, type AdapterStub } from './offlineAdapterStub.js';

/** Base URL that the fake API builds its endpoints from. */
export const API_BASE = 'https://192.0.2.1:443/api/s/default/rest';

/** One request that the fake API received through `sendData`. */
export interface SentRequest {
    cmd: string;
    payload: Record<string, any>;
    method: string;
}

/** One image download that a tree function asked the adapter to perform. */
export interface ImageDownload {
    id: string;
    url: string;
}

/** Adapter stub with recorders for API requests and image downloads. */
export interface TreeTestContext {
    stub: AdapterStub;
    sent: SentRequest[];
    downloads: ImageDownload[];
}

export interface TreeTestOptions {
    /** Lets every `sendData` call reject, to test the error handling. */
    sendFails?: boolean;
    /** Models that `getDeviceModels_V2` returns. */
    deviceModels?: unknown[];
}

/**
 * Creates an adapter stub with a fake API, a fake `myIob` helper and an image download recorder.
 * The tree functions use these members when they are called directly.
 *
 * @param config config values that override the defaults of the adapter stub
 * @param options behaviour of the fake API
 */
export function createTreeContext(config: Record<string, unknown> = {}, options: TreeTestOptions = {}): TreeTestContext {
    const stub = createAdapterStub(config);
    const sent: SentRequest[] = [];
    const downloads: ImageDownload[] = [];

    const api = {
        getApiEndpoint: (endpoint: string): string => `${API_BASE}/${endpoint}`,
        sendData: (cmd: string, payload: Record<string, any>, method = 'POST'): Promise<unknown> => {
            sent.push({ cmd, payload, method });
            return options.sendFails ? Promise.reject(new Error('sendData failed')) : Promise.resolve({ statusCode: 200 });
        },
        checkCommandSuccessful: (): Promise<void> => Promise.resolve(),
        getDeviceModels_V2: (): Promise<unknown[]> => Promise.resolve(options.deviceModels ?? []),
    };

    const myIob = {
        getIdLastPart: (id: string): string => id.substring(id.lastIndexOf('.') + 1),
        getIdWithoutLastPart: (id: string): string => id.substring(0, id.lastIndexOf('.')),
        hasKey: (obj: object, key: string): boolean => key in obj,
    };

    stub.adapter.ufn = api as unknown as NetworkApi;
    stub.adapter.myIob = myIob as unknown as typeof stub.adapter.myIob;
    stub.adapter.checkImageDownload = (id: string, url: string): Promise<void> => {
        downloads.push({ id, url });
        return Promise.resolve();
    };

    return { stub, sent, downloads };
}

/**
 * Returns one definition of a tree by its dot path, e.g. `port_table.array.enable`.
 * Every path segment has to be given explicitly. A missing path throws, so that a test cannot pass silently.
 *
 * @param tree tree module, e.g. `device`
 * @param tree.get returns the tree definitions as a plain object
 * @param path dot separated path of the definition
 */
export function getDefinition(tree: { get(): Record<string, unknown> }, path: string): any {
    let current: any = tree.get();

    for (const segment of path.split('.')) {
        current = current?.[segment];
    }

    if (current === undefined) {
        throw new Error(`tree definition '${path}' not found`);
    }

    return current;
}
