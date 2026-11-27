import { expect } from 'chai';
import { disconnectDebounceList } from '../../src/lib/eventHandler.js';
import { type MainContext, createFakeUfn, createMainContext, spyOn } from '../../tools/mainTestHelpers.js';

const BASE_CONFIG = { expertAliveInterval: 30, expertConnectionMaxRetries: 2 };

/**
 * Creates a test context with the connection settings used in these tests.
 *
 * @param fields instance fields, e.g. a fake `ufn`
 * @param config config values that override the defaults
 */
function createContext(fields: Record<string, unknown> = {}, config: Record<string, unknown> = {}): MainContext {
    return createMainContext({ ...BASE_CONFIG, ...config }, fields);
}

describe('main connection and lifecycle', () => {
    afterEach(() => {
        for (const key of Object.keys(disconnectDebounceList)) {
            delete disconnectDebounceList[key];
        }
    });

    describe('onPongMessage', () => {
        it('setzt den Zeitstempel und schreibt info.lastRealTimeData', async () => {
            const ctx = createContext();
            const before = Date.now();

            await ctx.instance.onPongMessage();

            expect(ctx.instance.aliveTimestamp).to.be.at.least(before);
            expect(ctx.stub.states.get('info.lastRealTimeData')).to.equal(ctx.instance.aliveTimestamp);
        });
    });

    describe('setConnectionStatus', () => {
        it('setzt die Verbindungsflags und info.connection auf true', async () => {
            const ctx = createContext({ isConnected: false, connected: false });

            await ctx.instance.setConnectionStatus(true);

            expect(ctx.instance.isConnected).to.equal(true);
            expect(ctx.instance.connected).to.equal(true);
            expect(ctx.stub.states.get('info.connection')).to.equal(true);
        });

        it('setzt die Verbindungsflags und info.connection auf false', async () => {
            const ctx = createContext();

            await ctx.instance.setConnectionStatus(false);

            expect(ctx.instance.isConnected).to.equal(false);
            expect(ctx.instance.connected).to.equal(false);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });
    });

    describe('sendPing', () => {
        it('sendet einen Ping und plant den nächsten nach der halben Intervallzeit', () => {
            const ufn = createFakeUfn();
            const wsPing = spyOn(ufn, 'wsSendPing');
            const ctx = createContext({ ufn });
            const timers = spyOn(ctx.instance, 'setTimeout');

            ctx.instance.sendPing();

            expect(wsPing.calls).to.have.length(1);
            expect(timers.calls).to.have.length(1);
            expect(timers.calls[0][1]).to.equal(15000);
        });

        it('sendet beim Timer-Ablauf den nächsten Ping', () => {
            const ufn = createFakeUfn();
            const wsPing = spyOn(ufn, 'wsSendPing');
            const ctx = createContext({ ufn });
            const timers = spyOn(ctx.instance, 'setTimeout');

            ctx.instance.sendPing();
            (timers.calls[0][0] as () => void)();

            expect(wsPing.calls).to.have.length(2);
        });

        it('sendet beim Adapterstart keinen Ping, plant aber den Timer', () => {
            const ufn = createFakeUfn();
            const wsPing = spyOn(ufn, 'wsSendPing');
            const ctx = createContext({ ufn });
            const timers = spyOn(ctx.instance, 'setTimeout');

            ctx.instance.sendPing(true);

            expect(wsPing.calls).to.have.length(0);
            expect(timers.calls).to.have.length(1);
        });

        it('löscht den vorherigen Ping-Timer', () => {
            const ctx = createContext({ ufn: createFakeUfn(), pingTimeout: 'old-ping' });
            const clear = spyOn(ctx.instance, 'clearTimeout');

            ctx.instance.sendPing();

            expect(clear.calls[0][0]).to.equal('old-ping');
        });

        it('wirft ohne ufn keinen Fehler und plant den Timer', () => {
            const ctx = createContext();
            const timers = spyOn(ctx.instance, 'setTimeout');

            ctx.instance.sendPing();

            expect(timers.calls).to.have.length(1);
        });
    });

    describe('login', () => {
        it('gibt true zurück, setzt die Controller-Version und den Status auf verbunden', async () => {
            const ufn = createFakeUfn({ getControllerVersion: (): Promise<string> => Promise.resolve('10.7.1') });
            const ctx = createContext({ ufn });

            const result = await ctx.instance.login();

            expect(result).to.equal(true);
            expect(ctx.instance.controllerVersion).to.equal('10.7.1');
            expect(ctx.stub.states.get('info.connection')).to.equal(true);
        });

        it('gibt false zurück und loggt einen Fehler, wenn der Login fehlschlägt', async () => {
            const ctx = createContext({ ufn: createFakeUfn({ login: (): Promise<boolean> => Promise.resolve(false) }) });

            const result = await ctx.instance.login();

            expect(result).to.equal(false);
            expect(ctx.stub.errors.some(message => message.includes('Login to the Unifi-Network controller API failed'))).to.equal(true);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });

        it('gibt false zurück und loggt einen Fehler, wenn der WebSocket nicht startet', async () => {
            const ctx = createContext({ ufn: createFakeUfn({ launchEventsWs: (): Promise<boolean> => Promise.resolve(false) }) });

            const result = await ctx.instance.login();

            expect(result).to.equal(false);
            expect(ctx.stub.errors.some(message => message.includes('WebSocket'))).to.equal(true);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });

        it('gibt false zurück ohne ufn', async () => {
            const ctx = createContext();

            const result = await ctx.instance.login();

            expect(result).to.equal(false);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });

        it('fängt Fehler beim Login ab und gibt false zurück', async () => {
            const ctx = createContext({ ufn: createFakeUfn({ login: (): Promise<boolean> => Promise.reject(new Error('boom')) }) });

            const result = await ctx.instance.login();

            expect(result).to.equal(false);
            expect(ctx.stub.errors.some(message => message.includes('Error: boom'))).to.equal(true);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });
    });

    describe('establishConnection', () => {
        it('lädt die Daten, startet den Ping und den Alive-Checker bei erfolgreichem Login', async () => {
            const ctx = createContext({ ufn: createFakeUfn() });
            const realTime = spyOn(ctx.instance, 'updateRealTimeApiData');
            const api = spyOn(ctx.instance, 'updateApiData');
            const ping = spyOn(ctx.instance, 'sendPing');
            const timers = spyOn(ctx.instance, 'setTimeout');

            await ctx.instance.establishConnection(true);

            expect(realTime.calls).to.have.length(1);
            expect(realTime.calls[0][0]).to.equal(true);
            expect(api.calls).to.have.length(1);
            expect(ping.calls[0][0]).to.equal(true);
            expect(timers.calls[0][1]).to.equal(30000);
        });

        it('setzt den Status auf nicht verbunden und lädt keine Daten bei fehlgeschlagenem Login, plant aber den Alive-Checker', async () => {
            const ufn = createFakeUfn({ login: (): Promise<boolean> => Promise.resolve(false) });
            const ctx = createContext({ ufn });
            const realTime = spyOn(ctx.instance, 'updateRealTimeApiData');
            const ping = spyOn(ctx.instance, 'sendPing');
            const timers = spyOn(ctx.instance, 'setTimeout');

            await ctx.instance.establishConnection();

            expect(realTime.calls).to.have.length(0);
            expect(ping.calls).to.have.length(0);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
            expect(timers.calls).to.have.length(1);
        });

        it('löscht den vorherigen Alive-Timer', async () => {
            const ctx = createContext({ ufn: createFakeUfn(), aliveTimeout: 'old-alive' });
            spyOn(ctx.instance, 'updateRealTimeApiData');
            spyOn(ctx.instance, 'updateApiData');
            spyOn(ctx.instance, 'sendPing');
            spyOn(ctx.instance, 'setTimeout');
            const clear = spyOn(ctx.instance, 'clearTimeout');

            await ctx.instance.establishConnection();

            expect(clear.calls.some(call => call[0] === 'old-alive')).to.equal(true);
        });

        it('loggt einen Fehler, wenn das Laden der Daten fehlschlägt', async () => {
            const ctx = createContext({ ufn: createFakeUfn() });
            spyOn(ctx.instance, 'updateRealTimeApiData');
            ctx.instance.updateApiData = (): Promise<void> => Promise.reject(new Error('boom'));

            await ctx.instance.establishConnection();

            expect(ctx.stub.errors.some(message => message.includes('[establishConnection]'))).to.equal(true);
        });
    });

    describe('aliveChecker', () => {
        it('tut nichts ohne ufn', async () => {
            const ctx = createContext();
            const timers = spyOn(ctx.instance, 'setTimeout');

            await ctx.instance.aliveChecker();

            expect(timers.calls).to.have.length(0);
            expect(ctx.stub.states.has('info.connection')).to.equal(false);
        });

        it('aktualisiert den Online-Status und plant die nächste Prüfung, wenn die Verbindung aktiv ist', async () => {
            const ctx = createContext({ ufn: createFakeUfn(), aliveTimestamp: Date.now(), connectionRetries: 3 });
            const online = spyOn(ctx.instance, 'updateIsOnlineState');
            const timers = spyOn(ctx.instance, 'setTimeout');

            await ctx.instance.aliveChecker();

            expect(online.calls).to.have.length(1);
            expect(ctx.stub.states.get('info.connection')).to.equal(true);
            expect(ctx.instance.connectionRetries).to.equal(0);
            expect(timers.calls[0][1]).to.equal(30000);
        });

        it('startet die Verbindung neu, wenn keine Daten mehr ankommen', async () => {
            const ufn = createFakeUfn();
            const logout = spyOn(ufn, 'logout');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() - 120000, connectionRetries: 0 });
            const reconnect = spyOn(ctx.instance, 'establishConnection');

            await ctx.instance.aliveChecker();

            expect(logout.calls).to.have.length(1);
            expect(ctx.instance.connectionRetries).to.equal(1);
            expect(reconnect.calls).to.have.length(1);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
            expect(ctx.stub.warnings.some(message => message.includes('restart connection'))).to.equal(true);
        });

        it('prüft die Session, wenn das Prüfintervall abgelaufen ist, und aktualisiert danach den Online-Status', async () => {
            const ufn = createFakeUfn();
            const checkSession = spyOn(ufn, 'checkSession');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            const online = spyOn(ctx.instance, 'updateIsOnlineState');

            await ctx.instance.aliveChecker();

            expect(checkSession.calls).to.have.length(1);
            expect(ctx.instance.lastSessionCheck).to.be.greaterThan(0);
            expect(online.calls).to.have.length(1);
        });

        it('prüft die Session nicht erneut, solange das Prüfintervall nicht abgelaufen ist', async () => {
            const ufn = createFakeUfn();
            const checkSession = spyOn(ufn, 'checkSession');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            ctx.instance.lastSessionCheck = Date.now();

            await ctx.instance.aliveChecker();

            expect(checkSession.calls).to.have.length(0);
        });

        it('loggt bei abgelaufener Session neu ein, ohne den Online-Status zu setzen', async () => {
            const ufn = createFakeUfn({ checkSession: (): Promise<'expired'> => Promise.resolve('expired') });
            const logout = spyOn(ufn, 'logout');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            const reconnect = spyOn(ctx.instance, 'establishConnection');
            const online = spyOn(ctx.instance, 'updateIsOnlineState');

            await ctx.instance.aliveChecker();

            expect(logout.calls).to.have.length(1);
            expect(reconnect.calls).to.have.length(1);
            expect(online.calls).to.have.length(0);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });

        it('loggt bei einem Fehler der Session-Prüfung nicht neu ein', async () => {
            const ufn = createFakeUfn({ checkSession: (): Promise<'error'> => Promise.resolve('error') });
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            const reconnect = spyOn(ctx.instance, 'establishConnection');
            const online = spyOn(ctx.instance, 'updateIsOnlineState');

            await ctx.instance.aliveChecker();

            expect(reconnect.calls).to.have.length(0);
            expect(online.calls).to.have.length(1);
        });

        it('stoppt den Adapter, wenn die maximale Anzahl an Wiederholungen erreicht ist', async () => {
            const ufn = createFakeUfn();
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() - 120000, connectionRetries: 2 });
            const reconnect = spyOn(ctx.instance, 'establishConnection');
            const stop = spyOn(ctx.instance, 'stop');

            await ctx.instance.aliveChecker();

            expect(reconnect.calls).to.have.length(0);
            expect(stop.calls).to.have.length(1);
            expect(stop.calls[0][0]).to.deep.equal({ reason: 'too many connection retries' });
            expect(ctx.stub.errors.some(message => message.includes('stopping the adapter'))).to.equal(true);
        });

        it('verlängert die Session 5 bis 10 Minuten vor Ablauf, ohne die Verbindung neu aufzubauen', async () => {
            let renewals = 0;
            const ufn = createFakeUfn({
                getSessionExpiry: (): number => Date.now() + 8 * 60 * 1000,
                renewSession: (): Promise<boolean> => {
                    renewals++;
                    return Promise.resolve(true);
                },
            });
            const checkSession = spyOn(ufn, 'checkSession');
            const logout = spyOn(ufn, 'logout');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            const reconnect = spyOn(ctx.instance, 'establishConnection');
            const online = spyOn(ctx.instance, 'updateIsOnlineState');

            await ctx.instance.aliveChecker();

            expect(renewals).to.equal(1);
            expect(checkSession.calls).to.have.length(0);
            expect(logout.calls).to.have.length(0);
            expect(reconnect.calls).to.have.length(0);
            expect(online.calls).to.have.length(1);
        });

        it('startet die Verbindung neu, wenn die Session nicht verlängert werden kann', async () => {
            const ufn = createFakeUfn({
                getSessionExpiry: (): number => Date.now() + 8 * 60 * 1000,
                renewSession: (): Promise<boolean> => Promise.resolve(false),
            });
            const logout = spyOn(ufn, 'logout');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });
            const reconnect = spyOn(ctx.instance, 'establishConnection');
            const online = spyOn(ctx.instance, 'updateIsOnlineState');

            await ctx.instance.aliveChecker();

            expect(logout.calls).to.have.length(1);
            expect(reconnect.calls).to.have.length(1);
            expect(online.calls).to.have.length(0);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
        });

        it('prüft nur die Session, wenn der Ablauf noch weit entfernt ist', async () => {
            let renewals = 0;
            const ufn = createFakeUfn({
                getSessionExpiry: (): number => Date.now() + 30 * 60 * 1000,
                renewSession: (): Promise<boolean> => {
                    renewals++;
                    return Promise.resolve(true);
                },
            });
            const checkSession = spyOn(ufn, 'checkSession');
            const ctx = createContext({ ufn, aliveTimestamp: Date.now() });

            await ctx.instance.aliveChecker();

            expect(renewals).to.equal(0);
            expect(checkSession.calls).to.have.length(1);
        });
    });

    describe('onUnload', () => {
        it('beendet Timer, entfernt Listener, meldet ab und ruft callback einmal auf', async () => {
            const ufn = createFakeUfn();
            const logout = spyOn(ufn, 'logout');
            const clearConnectionTimeouts = spyOn(ufn, 'clearConnectionTimeouts');
            const ctx = createContext({ ufn, aliveTimeout: 'alive', pingTimeout: 'ping', apiPollingTimeout: 'api' });
            const clear = spyOn(ctx.instance, 'clearTimeout');
            const removeListener = spyOn(ctx.instance, 'removeListener');
            let callbacks = 0;

            await ctx.instance.onUnload(() => {
                callbacks++;
            });

            expect(clear.calls.map(call => call[0])).to.include.members(['alive', 'ping', 'api']);
            expect(clearConnectionTimeouts.calls).to.have.length(1);
            expect(removeListener.calls).to.have.length(2);
            expect(logout.calls).to.have.length(1);
            expect(ctx.stub.states.get('info.connection')).to.equal(false);
            expect(callbacks).to.equal(1);
        });

        it('beendet die laufenden Debounce-Timer', async () => {
            disconnectDebounceList['aa:bb:cc:dd:ee:ff'] = { lc: 0, timeout: 'debounce-timer' as unknown as ioBroker.Timeout };
            const ctx = createContext({ ufn: createFakeUfn() });
            const clear = spyOn(ctx.instance, 'clearTimeout');

            await ctx.instance.onUnload(() => undefined);

            expect(clear.calls.map(call => call[0])).to.include('debounce-timer');
        });

        it('ruft callback auch ohne ufn auf, ohne Status zu setzen', async () => {
            const ctx = createContext();
            let callbacks = 0;

            await ctx.instance.onUnload(() => {
                callbacks++;
            });

            expect(callbacks).to.equal(1);
            expect(ctx.stub.states.has('info.connection')).to.equal(false);
        });

        it('ruft callback auch dann auf, wenn logout einen Fehler wirft', async () => {
            const ufn = createFakeUfn({
                logout: (): void => {
                    throw new Error('boom');
                },
            });
            const ctx = createContext({ ufn });
            let callbacks = 0;

            await ctx.instance.onUnload(() => {
                callbacks++;
            });

            expect(callbacks).to.equal(1);
        });
    });
});
