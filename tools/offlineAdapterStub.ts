import type { myCache } from '../src/lib/myTypes.js';

/** Config values the handlers read. Tests override single values. */
const DEFAULT_CONFIG: Record<string, unknown> = {
    devicesEnabled: true,
    clientsEnabled: true,
    guestsEnabled: true,
    vpnEnabled: true,
    wlanConfigEnabled: true,
    lanConfigEnabled: true,
    firewallGroupConfigEnabled: true,
    keepIobSynchron: true,
    clientRealtimeDisconnectDebounceTime: 0,
    clientDebouncingList: [],
    clientDebugLevel: '',
    clientIsWhiteList: false,
    clientBlackList: [],
    clientStatesBlackList: [],
    clientStatesIsWhiteList: false,
};

export interface AdapterStub {
    /** Adapter for the handlers. Only the members the handlers use exist. */
    adapter: ioBroker.myAdapter;
    cache: myCache;
    /** Existing object ids, e.g. `clients.guests.<mac>.isOnline`. Add the ids a handler should update. */
    objects: Set<string>;
    /** Last value written per state id (the `val` of a `{ val, lc }` write). */
    states: Map<string, unknown>;
    /** Messages passed to `log.warn`. */
    warnings: string[];
    /** Messages passed to `log.error`. */
    errors: string[];
}

/**
 * Escapes one literal part of a state id pattern for use in a regular expression.
 *
 * @param part literal part of the pattern, without `*`
 */
function escapeRegExp(part: string): string {
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isStateObject(state: unknown): state is { val: unknown } {
    return typeof state === 'object' && state !== null && 'val' in state;
}

/**
 * In-memory stand-in for the ioBroker adapter for the offline event tests.
 * No connection to ioBroker is opened.
 *
 * @param config config values that override the defaults
 */
export function createAdapterStub(config: Record<string, unknown> = {}): AdapterStub {
    const objects = new Set<string>();
    const states = new Map<string, unknown>();
    const warnings: string[] = [];
    const errors: string[] = [];

    const write = (id: string, state: unknown): void => {
        states.set(id, isStateObject(state) ? state.val : state);
    };

    const log = {
        level: 'debug',
        silly: (): void => undefined,
        debug: (): void => undefined,
        info: (): void => undefined,
        warn: (message: string): void => {
            warnings.push(message);
        },
        error: (message: string): void => {
            errors.push(message);
        },
    };

    const adapter = {
        config: { ...DEFAULT_CONFIG, ...config },
        namespace: 'unifi-network.0',
        name: 'unifi-network',
        log,
        objectExists: (id: string): Promise<boolean> => Promise.resolve(objects.has(id)),
        setState: (id: string, state: unknown): Promise<void> => {
            write(id, state);
            return Promise.resolve();
        },
        setStateChangedAsync: (id: string, state: unknown): Promise<boolean> => {
            write(id, state);
            return Promise.resolve(true);
        },
        delObjectAsync: (id: string): Promise<void> => {
            for (const existing of [...objects]) {
                if (existing === id || existing.startsWith(`${id}.`)) {
                    objects.delete(existing);
                }
            }
            return Promise.resolve();
        },
        setStateChanged: (id: string, state: unknown): Promise<boolean> => {
            write(id, state);
            return Promise.resolve(true);
        },
        getStateAsync: (id: string): Promise<{ val: unknown } | null> =>
            Promise.resolve(states.has(id) ? { val: states.get(id) } : null),
        /**
         * Returns all states whose id matches the pattern. Supports `*` as wildcard, e.g. `clients.*.last_seen`.
         *
         * @param pattern state id pattern
         */
        getStatesAsync: (pattern: string): Promise<Record<string, { val: unknown }>> => {
            const matcher = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
            const result: Record<string, { val: unknown }> = {};
            for (const [id, val] of states) {
                if (matcher.test(id)) {
                    result[id] = { val };
                }
            }
            return Promise.resolve(result);
        },
        setTimeout: (): undefined => undefined,
        clearTimeout: (): void => undefined,
    };

    return {
        adapter: adapter as unknown as ioBroker.myAdapter,
        cache: {
            devices: {},
            clients: {},
            vpn: {},
            wlan: {},
            lan: {},
            isOnline: {},
            firewall: { groups: {} },
        },
        objects,
        states,
        warnings,
        errors,
    };
}

/**
 * Adds a client to the cache, as `updateClients` does on `client:sync`.
 *
 * @param cache cache of the stub
 * @param mac MAC address of the client
 * @param values cached fields, e.g. `name` and `is_guest`
 */
export function setCachedClient(cache: myCache, mac: string, values: Record<string, unknown>): void {
    cache.clients[mac] = values as unknown as myCache['clients'][string];
}

/**
 * Adds a device to the cache, as `updateDevices` does on `device:sync`.
 *
 * @param cache cache of the stub
 * @param mac MAC address of the device
 * @param values cached fields, e.g. `name` and WAN interfaces
 */
export function setCachedDevice(cache: myCache, mac: string, values: Record<string, unknown>): void {
    cache.devices[mac] = values as unknown as myCache['devices'][string];
}
