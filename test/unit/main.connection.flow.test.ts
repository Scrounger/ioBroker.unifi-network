import { expect } from 'chai';
import dayjs from 'dayjs';
import { createFakeUfn, createMainContext, spyOn } from '../../tools/mainTestHelpers.js';

/**
 * Creates a `setTimeout` replacement that stores the callback and returns a fixed timer id.
 *
 * @param timerId id returned for the timer
 * @param store container for the stored callback
 * @param store.callback
 */
function timerRecorder(timerId: number, store: { callback?: () => Promise<void> }): (cb: () => Promise<void>) => number {
    return (cb: () => Promise<void>): number => {
        store.callback = cb;
        return timerId;
    };
}

describe('establishConnection (Timer)', () => {
    it('löscht einen bestehenden Ping-Timeout', async () => {
        const cleared: unknown[] = [];
        const ctx = createMainContext({}, {
            pingTimeout: 1,
            clearTimeout: (id: unknown): void => {
                cleared.push(id);
            },
            setTimeout: (): number => 2,
            ufn: createFakeUfn({ login: (): Promise<boolean> => Promise.resolve(false) }),
        });

        await ctx.instance.establishConnection();

        expect(cleared).to.include(1);
        expect(ctx.instance.pingTimeout).to.equal(null);
    });

    it('ruft im Alive-Timer aliveChecker auf', async () => {
        const timer: { callback?: () => Promise<void> } = {};
        const ctx = createMainContext({}, {
            setTimeout: timerRecorder(2, timer),
            ufn: createFakeUfn({ login: (): Promise<boolean> => Promise.resolve(false) }),
        });
        const aliveChecker = spyOn(ctx.instance, 'aliveChecker');

        await ctx.instance.establishConnection();
        await timer.callback?.();

        expect(aliveChecker.calls).to.have.length(1);
    });
});

describe('aliveChecker (Alive-Zweig)', () => {
    it('löscht den bestehenden Alive-Timeout und plant den nächsten Check', async () => {
        const cleared: unknown[] = [];
        const timer: { callback?: () => Promise<void> } = {};
        const ctx = createMainContext({}, {
            aliveTimeout: 1,
            aliveTimestamp: dayjs().valueOf(),
            clearTimeout: (id: unknown): void => {
                cleared.push(id);
            },
            setTimeout: timerRecorder(2, timer),
            ufn: createFakeUfn(),
        });

        await ctx.instance.aliveChecker();

        expect(cleared).to.include(1);
        expect(ctx.instance.aliveTimeout).to.equal(2);
        expect(ctx.instance.connectionRetries).to.equal(0);
    });

    it('führt den geplanten Alive-Check aus', async () => {
        const timer: { callback?: () => Promise<void> } = {};
        const ctx = createMainContext({}, {
            aliveTimeout: 1,
            aliveTimestamp: dayjs().valueOf(),
            clearTimeout: (): void => undefined,
            setTimeout: timerRecorder(2, timer),
            ufn: createFakeUfn(),
        });
        await ctx.instance.aliveChecker();
        const isOnline = spyOn(ctx.instance, 'updateIsOnlineState');

        await timer.callback?.();

        expect(isOnline.calls).to.have.length(1);
    });
});

describe('updateApiData (Polling-Timer)', () => {
    it('löscht den bestehenden Polling-Timeout und plant das nächste Polling', async () => {
        const cleared: unknown[] = [];
        const timer: { callback?: () => Promise<void> } = {};
        const ctx = createMainContext({ systemInformationEnabled: true }, {
            apiPollingTimeout: 1,
            clearTimeout: (id: unknown): void => {
                cleared.push(id);
            },
            setTimeout: timerRecorder(2, timer),
            ufn: createFakeUfn(),
        });

        await ctx.instance.updateApiData();

        expect(cleared).to.include(1);
        expect(ctx.instance.apiPollingTimeout).to.equal(2);
    });

    it('führt das geplante Polling aus', async () => {
        const timer: { callback?: () => Promise<void> } = {};
        const ctx = createMainContext({ systemInformationEnabled: true }, {
            setTimeout: timerRecorder(2, timer),
            ufn: createFakeUfn(),
        });
        await ctx.instance.updateApiData();
        const apiData = spyOn(ctx.instance, 'updateApiData');

        await timer.callback?.();

        expect(apiData.calls).to.have.length(1);
    });
});

describe('onMessage (help)', () => {
    it('antwortet auf help nur, wenn ein Callback übergeben wurde', async () => {
        const sent: unknown[][] = [];
        const ctx = createMainContext({}, {
            sendTo: (...args: unknown[]): void => {
                sent.push(args);
            },
        });

        await ctx.instance.onMessage({ command: 'help', from: 'system.adapter.test.0', message: {}, callback: { id: 1 } });
        await ctx.instance.onMessage({ command: 'help', from: 'system.adapter.test.0', message: {} });

        expect(sent).to.have.length(1);
        expect(sent[0][1]).to.equal('help');
    });
});
