/**
 * Node resolve hook for the offline unit tests.
 *
 * `@iobroker/adapter-core` calls `process.exit(10)` at import time when no ioBroker js-controller
 * is installed next to the adapter. That would abort the whole mocha run as soon as a test imports
 * `src/main.ts`. The hook points the import to a small stub, so the adapter class can be loaded
 * without a controller. The real package is still used by the built adapter.
 */

const ADAPTER_CORE = '@iobroker/adapter-core';
const STUB_URL = new URL('./stubs/adapter-core.cjs', import.meta.url).href;

/**
 * @param {string} specifier module specifier of the import
 * @param {object} context resolve context of Node
 * @param {Function} nextResolve next resolve step
 */
export async function resolve(specifier, context, nextResolve) {
    if (specifier === ADAPTER_CORE) {
        return { url: STUB_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
