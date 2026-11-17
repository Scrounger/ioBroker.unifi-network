import { existsSync } from 'node:fs';
import path from 'node:path';
import { NetworkApi } from '../lib/api/network-api.js';
import type { NetworkLogging } from '../lib/api/network-logging.js';

/**
 * Shared helpers for the live tests against a real UniFi Network controller.
 *
 * Credentials are read from the git-ignored `.env` file in the project root.
 * Variables that are already set in the process environment take precedence.
 *
 * Required: UNIFI_HOST, UNIFI_USER, UNIFI_PASSWORD
 * Optional: UNIFI_PORT (default 443), UNIFI_SITE (default 'default')
 *
 * The live tests only perform read operations. Write operations (`sendData`) and
 * backup/system log downloads are intentionally not covered.
 *
 * The file uses the `*.test.ts` suffix, so `tsconfig.build.json` keeps it out of the build.
 */

export interface LiveConfig {
    host: string;
    port: number;
    site: string;
    user: string;
    password: string;
}

export interface LiveSession {
    api: NetworkApi;
    config: LiveConfig;
    /** Warning and error messages logged by the API client during the session. */
    messages: string[];
}

/**
 * Loads the live configuration from `.env` (project root) and the process environment.
 *
 * @returns the configuration or `undefined` if the required values are missing
 */
export function getLiveConfig(): LiveConfig | undefined {
    const envFile = path.resolve(process.cwd(), '.env');
    if (existsSync(envFile)) {
        process.loadEnvFile(envFile);
    }

    const { UNIFI_HOST, UNIFI_PORT, UNIFI_SITE, UNIFI_USER, UNIFI_PASSWORD } = process.env;
    if (!UNIFI_HOST || !UNIFI_USER || !UNIFI_PASSWORD) {
        return undefined;
    }

    return {
        host: UNIFI_HOST,
        port: Number(UNIFI_PORT || 443),
        site: UNIFI_SITE || 'default',
        user: UNIFI_USER,
        password: UNIFI_PASSWORD,
    };
}

/**
 * Creates a `NetworkApi` client for the given configuration.
 * The adapter is replaced by a minimal stub that provides logging and timers only.
 *
 * @param config connection settings
 */
export function createLiveApi(config: LiveConfig): LiveSession {
    const messages: string[] = [];
    const verbose = process.env.LIVE_DEBUG === '1';

    const record = (level: 'debug' | 'warn' | 'error', message: string): void => {
        if (level !== 'debug') {
            messages.push(`${level}: ${message}`);
        }
        if (verbose) {
            console.log(`[${level}] ${message}`);
        }
    };

    const log: NetworkLogging = {
        level: 'debug',
        silly: (message: string): void => record('debug', message),
        debug: (message: string): void => record('debug', message),
        info: (message: string): void => record('debug', message),
        warn: (message: string): void => record('warn', message),
        error: (message: string): void => record('error', message),
    };

    const adapter = {
        log,
        setTimeout: (callback: () => void, ms: number): NodeJS.Timeout => {
            const timer = globalThis.setTimeout(callback, ms);
            // Timeouts must not keep the test process alive.
            timer.unref();
            return timer;
        },
        clearTimeout: (timer: NodeJS.Timeout): void => globalThis.clearTimeout(timer),
        setState: (): Promise<void> => Promise.resolve(),
    } as unknown as ioBroker.myAdapter;

    const api = new NetworkApi(config.host, config.port, config.site, config.user, config.password, adapter);

    return { api, config, messages };
}

/**
 * Formats the collected log messages for assertion output.
 *
 * @param messages messages collected by `createLiveApi`
 */
export function describeMessages(messages: string[]): string {
    return messages.length > 0 ? `Controller-Meldungen:\n${messages.join('\n')}` : 'keine Controller-Meldungen';
}

/**
 * The API returns `undefined` for empty result sets, so both an array and `undefined` are valid.
 *
 * @param value result of an API call
 */
export function isListOrEmpty(value: unknown): boolean {
    return value === undefined || Array.isArray(value);
}
