/**
 * Records read-only API responses of the UniFi controller as local, anonymized fixtures.
 *
 * Writes one JSON file per endpoint to `test/fixtures/local/<version>/api/<endpoint>.json`.
 * `<version>` is the network application version from the `sysinfo` response, e.g. `10.6.109`.
 * Each file contains the complete controller response (envelope included) under `response`.
 *
 * - Only GET requests are sent, via the same URLs the `NetworkApi` getters use.
 * - The endpoints are taken from the project source (see `findReadEndpoints`), so added or removed
 *   endpoints are picked up automatically. Fixtures of endpoints no longer used are deleted.
 * - All responses are anonymized in one call, so placeholders match across files.
 * - Nothing is written if a leak of the controller host, user or password is detected.
 *
 * Usage: npm run record:api [-- --dry-run] [-- --no-anonymize]
 *   --dry-run        lists the files that would be written or deleted, writes and deletes nothing
 *   --no-anonymize   writes the data unchanged: no anonymization, no removal of secret entries, no leak check
 * Required: UNIFI_HOST, UNIFI_USER, UNIFI_PASSWORD (see liveHelper.test.ts)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ApiEndpoints, ApiEndpoints_V2, type NetworkApi } from '../src/lib/api/network-api.js';
import { createLiveApi, describeMessages, getLiveConfig } from '../test/tools/liveHelper.test.js';
import { anonymize, findLeaks, removeSecretEntries } from './anonymizeFixtures.js';
import { fixtureDir, versionFromSysInfo } from './fixtureVersions.js';

/** Lists the files that would be written or deleted without changing anything. Enabled with `--dry-run`. */
const DRY_RUN = process.argv.includes('--dry-run');

/** Writes the data unchanged: no anonymization, no removal of secret entries, no leak check. Enabled with `--no-anonymize`. */
const NO_ANONYMIZE = process.argv.includes('--no-anonymize');

interface EndpointDefinition {
    /** Name of the fixture file without extension. */
    name: string;
    /** Builds the full request URL. Returns an empty string if the endpoint is unknown. */
    url: (api: NetworkApi) => string;
}

/** Endpoints the project reads but which are not recorded as JSON fixtures, with the reason. */
const NOT_RECORDED: Record<string, string> = {
    backup: 'Download of a binary file, not JSON',
};

/** Query parameters of the requests that need them, keyed by fixture name. */
const QUERY: Record<string, string> = {
    devicesV2: '?separateUnmanaged=false&includeTrafficUsage=false',
    clientsActiveV2: '?includeTrafficUsage=true&includeUnifiDevices=true',
    clientsHistoryV2: '?includeUnifiDevices=true&withinHours=0',
};

/** What a method of `NetworkApi` reads from the controller and which functions it calls. */
interface MethodUsage {
    /** Endpoint keys read by the method, e.g. `ApiEndpoints.devices`. */
    reads: Set<string>;
    /** Names of the functions and methods the body calls. */
    calls: Set<string>;
}

/**
 * Returns the name of a called function or method, e.g. `getDevices` for `this.getDevices()`.
 *
 * @param expression Callee expression of a call
 * @returns The name, or `undefined` for other expressions
 */
function calleeName(expression: ts.Expression): string | undefined {
    if (ts.isIdentifier(expression)) {
        return expression.text;
    }
    if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text;
    }
    return undefined;
}

/**
 * Collects the names of all functions and methods called in a syntax tree.
 *
 * @param root Syntax tree to scan
 * @returns Set of called names
 */
function collectCalls(root: ts.Node): Set<string> {
    const calls = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node.expression);
            if (name) {
                calls.add(name);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return calls;
}

/**
 * Collects the endpoints a method reads: the arguments of `retrievData(` and the initializer of `const url`.
 *
 * @param body Body of the method
 * @returns Set of endpoint keys
 */
function collectReads(body: ts.Node): Set<string> {
    const reads = new Set<string>();
    const addEndpoints = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && /^ApiEndpoints(_V2)?$/.test(node.expression.text)) {
            reads.add(`${node.expression.text}.${node.name.text}`);
        }
        ts.forEachChild(node, addEndpoints);
    };
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && calleeName(node.expression) === 'retrievData') {
            for (const argument of node.arguments) {
                addEndpoints(argument);
            }
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'url' && node.initializer) {
            addEndpoints(node.initializer);
        }
        ts.forEachChild(node, visit);
    };
    visit(body);
    return reads;
}

/**
 * Collects the usage of every method declared in the `NetworkApi` class.
 *
 * @param source Source file of the class
 * @returns Map from method name to its usage
 */
function collectMethods(source: ts.SourceFile): Map<string, MethodUsage> {
    const methods = new Map<string, MethodUsage>();
    const visit = (node: ts.Node): void => {
        if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body) {
            const usage = methods.get(node.name.text) ?? { reads: new Set<string>(), calls: new Set<string>() };
            for (const key of collectReads(node.body)) {
                usage.reads.add(key);
            }
            for (const name of collectCalls(node.body)) {
                usage.calls.add(name);
            }
            methods.set(node.name.text, usage);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return methods;
}

/**
 * Finds the endpoints that the project reads from the controller.
 *
 * Starts at every call outside `lib/api/network-api.ts` (adapter, message handler, tree) and follows the calls
 * inside `NetworkApi` transitively. Endpoints read only by unreached methods are not recorded, e.g. a getter
 * that only a live test calls. `tools/` and test files are not scanned.
 *
 * @returns Keys like `ApiEndpoints.devices` or `ApiEndpoints_V2.devices`
 */
function findReadEndpoints(): Set<string> {
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    const apiFile = path.join(srcDir, 'lib', 'api', 'network-api.ts');
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
        .filter((entry: string): boolean => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
        .filter((entry: string): boolean => !entry.startsWith(`live${path.sep}`))
        .map((entry: string): string => path.join(srcDir, entry));

    const methods = new Map<string, MethodUsage>();
    const pending: string[] = [];
    for (const file of files) {
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        if (file === apiFile) {
            for (const [name, usage] of collectMethods(source)) {
                methods.set(name, usage);
            }
        } else {
            pending.push(...collectCalls(source));
        }
    }

    const reached = new Set<string>();
    const reads = new Set<string>();
    for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
        if (reached.has(name)) {
            continue;
        }
        reached.add(name);

        const usage = methods.get(name);
        if (!usage) {
            continue;
        }
        for (const key of usage.reads) {
            reads.add(key);
        }
        pending.push(...usage.calls);
    }

    return reads;
}

/**
 * Builds the endpoint definitions from the endpoints the project reads.
 * Only the query parameters are configured here, the endpoints themselves are discovered.
 *
 * @returns Endpoint definitions, V1 first, then V2
 */
function buildEndpointDefinitions(): EndpointDefinition[] {
    const readEndpoints = findReadEndpoints();
    const definitions: EndpointDefinition[] = [];

    for (const member of Object.keys(ApiEndpoints)) {
        const endpoint = ApiEndpoints[member as keyof typeof ApiEndpoints];
        if (readEndpoints.has(`ApiEndpoints.${member}`) && !NOT_RECORDED[member]) {
            definitions.push({
                name: member,
                url: (api: NetworkApi): string => `${api.getApiEndpoint(endpoint)}${QUERY[member] ?? ''}`,
            });
        }
    }

    for (const member of Object.keys(ApiEndpoints_V2)) {
        const name = `${member}V2`;
        const endpoint = ApiEndpoints_V2[member as keyof typeof ApiEndpoints_V2];
        if (readEndpoints.has(`ApiEndpoints_V2.${member}`) && !NOT_RECORDED[name]) {
            definitions.push({
                name,
                url: (api: NetworkApi): string => `${api.getApiEndpoint_V2(endpoint)}${QUERY[name] ?? ''}`,
            });
        }
    }

    return definitions;
}

async function main(): Promise<number> {
    const endpoints = buildEndpointDefinitions();
    console.log(`Endpoints from the project: ${endpoints.map((endpoint) => endpoint.name).join(', ')}`);

    const config = getLiveConfig();
    if (!config) {
        console.error('Missing credentials: UNIFI_HOST, UNIFI_USER and UNIFI_PASSWORD must be set.');
        return 1;
    }

    const secrets = [config.host, config.user, config.password];
    const session = createLiveApi(config);
    const { api } = session;

    if (!(await api.login())) {
        console.error(`Login failed. ${describeMessages(session.messages)}`);
        return 1;
    }

    const responses: Record<string, unknown> = {};
    const failed: string[] = [];

    try {
        for (const endpoint of endpoints) {
            const url = endpoint.url(api);
            const data = url ? await api.retrievData(url) : undefined;

            if (data) {
                responses[endpoint.name] = data;
            } else {
                failed.push(endpoint.name);
            }
        }
    } finally {
        api.logout();
    }

    if (failed.length > 0) {
        console.log(`No response for: ${failed.join(', ')}`);
    }

    if (Object.keys(responses).length === 0) {
        console.error('No responses received from the controller, nothing was written.');
        return 1;
    }

    const version = versionFromSysInfo(responses.sysinfo);
    if (!version) {
        console.error('No version found in the sysinfo response, nothing was written.');
        return 1;
    }

    const recordedAt = new Date().toISOString();
    const prepared = NO_ANONYMIZE ? responses : removeSecretEntries(responses);
    if (NO_ANONYMIZE) {
        console.warn('Warning: without anonymization, the data is stored unchanged.');
    }
    const anonymized = NO_ANONYMIZE ? prepared : anonymize(prepared, secrets);
    const files = Object.entries(anonymized).map(([name, response]) => ({
        name,
        content: `${JSON.stringify({ endpoint: name, recordedAt, anonymized: !NO_ANONYMIZE, response }, null, 2)}\n`,
    }));

    const leaks = NO_ANONYMIZE ? [] : [...new Set(files.flatMap((file) => findLeaks(file.content, secrets)))];
    if (leaks.length > 0) {
        console.error(`Aborted, non-anonymized data found (${leaks.length} matches). Nothing was written.`);
        return 1;
    }

    const outputDir = fixtureDir(version, 'api');
    const target = path.relative(process.cwd(), outputDir);
    const planned = new Set(endpoints.map((endpoint: EndpointDefinition): string => endpoint.name));
    const obsolete = existsSync(outputDir)
        ? readdirSync(outputDir).filter((existing: string): boolean => existing.endsWith('.json') && !planned.has(existing.slice(0, -'.json'.length)))
        : [];

    if (DRY_RUN) {
        console.log(`Dry run, nothing written. Version ${version}: ${files.length} fixtures would be written to ${target}:`);
    } else {
        mkdirSync(outputDir, { recursive: true });
        for (const file of files) {
            writeFileSync(path.join(outputDir, `${file.name}.json`), file.content, 'utf8');
        }
        for (const existing of obsolete) {
            rmSync(path.join(outputDir, existing));
        }
        console.log(`Version ${version}: ${files.length} fixtures written to ${target}:`);
    }
    for (const existing of obsolete) {
        console.log(`  ${DRY_RUN ? 'would remove' : 'removed'} (no longer used by the project): ${existing}`);
    }
    for (const file of files) {
        console.log(`  ${file.name}.json`);
    }

    return 0;
}

main()
    .then((code: number): void => {
        process.exitCode = code;
    })
    .catch((error: unknown): void => {
        console.error(`Recording failed: ${String(error)}`);
        process.exitCode = 1;
    });
