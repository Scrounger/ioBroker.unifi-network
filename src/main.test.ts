import { expect } from 'chai';
import startAdapter, { UnifiNetwork } from './main.js';

/**
 * Reads the internals the test stub of `@iobroker/adapter-core` stores.
 *
 * @param instance adapter instance created in the test
 */
function stubInternals(instance: UnifiNetwork): { options: Record<string, unknown>; handlers: Record<string, unknown> } {
	return instance as unknown as { options: Record<string, unknown>; handlers: Record<string, unknown> };
}

describe('startAdapter', () => {
	it('gibt eine UnifiNetwork-Instanz zurück', () => {
		const instance = startAdapter({});

		expect(instance).to.be.instanceOf(UnifiNetwork);
	});

	it('übergibt den Adapternamen und die Optionen an den Adapter', () => {
		const instance = startAdapter({ instance: 7 });

		expect(stubInternals(instance).options).to.include({
			name: 'unifi-network',
			useFormatDate: true,
			instance: 7,
		});
	});

	it('startet auch ohne Optionen', () => {
		const instance = startAdapter(undefined);

		expect(stubInternals(instance).options).to.include({ name: 'unifi-network' });
	});

	it('registriert die Handler für ready, stateChange, message und unload', () => {
		const instance = startAdapter({});
		const { handlers } = stubInternals(instance);

		for (const event of ['ready', 'stateChange', 'message', 'unload']) {
			expect(handlers[event], `handler for '${event}'`).to.be.a('function');
		}
	});
});
