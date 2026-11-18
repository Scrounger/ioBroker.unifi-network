import { existsSync } from 'node:fs';
import path from 'node:path';
import { NetworkApi } from '../../src/lib/api/network-api.js';
import type { NetworkLogging } from '../../src/lib/api/network-logging.js';

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
 * The file lives outside `src/`, so `tsconfig.build.json` (rootDir `src`) never compiles it into the build.
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

/** Message fragment logged by the API client when the controller cannot be reached. */
const TRANSIENT_CONNECTION_ERROR = 'Unable to connect to the Network controller';

/**
 * Logs in and retries after transient connection errors. A controller that is busy or rebooting
 * refuses connections for a short time. Other failures, such as wrong credentials, are not retried.
 *
 * @param session live session to log in with
 * @param attempts maximum number of login attempts
 * @param delayMs wait time between attempts in milliseconds
 */
export async function loginWithRetry(session: LiveSession, attempts = 3, delayMs = 5_000): Promise<boolean> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const messagesBefore = session.messages.length;
        if (await session.api.login()) {
            return true;
        }

        const transient = session.messages
            .slice(messagesBefore)
            .some((message: string): boolean => message.includes(TRANSIENT_CONNECTION_ERROR));
        if (!transient || attempt === attempts) {
            return false;
        }

        await new Promise<void>((resolve: () => void): void => {
            globalThis.setTimeout(resolve, delayMs);
        });
    }
    return false;
}

/** Result of the login that all live test files of a test run share. */
export interface SharedLogin {
    session: LiveSession;
    loggedIn: boolean;
}

let sharedLogin: Promise<SharedLogin | undefined> | undefined;

/**
 * Returns the login that all live test files share. The first caller logs in, every later caller gets the
 * same result. This keeps a test run to a single login instead of one per file. A failed login is cached as
 * well, so the remaining files fail with the same controller messages instead of logging in again.
 *
 * @returns the shared session or `undefined` if no credentials are configured
 */
export function getSharedLogin(): Promise<SharedLogin | undefined> {
    sharedLogin ??= (async (): Promise<SharedLogin | undefined> => {
        const config = getLiveConfig();
        if (!config) {
            return undefined;
        }

        const session = createLiveApi(config);
        const loggedIn = await loginWithRetry(session);
        return { session, loggedIn };
    })();
    return sharedLogin;
}

// Root hook: logs the shared session out once after all live tests of the run.
after(async (): Promise<void> => {
    const shared = await sharedLogin;
    shared?.session.api.logout();
});

/**
 * Formats the collected log messages for assertion output.
 *
 * @param messages messages collected by `createLiveApi`
 */
export function describeMessages(messages: string[]): string {
    return messages.length > 0 ? `Controller messages:\n${messages.join('\n')}` : 'no controller messages';
}

/**
 * The API returns `undefined` for empty result sets, so both an array and `undefined` are valid.
 *
 * @param value result of an API call
 */
export function isListOrEmpty(value: unknown): boolean {
    return value === undefined || Array.isArray(value);
}
