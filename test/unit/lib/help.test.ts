import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { COMMANDS, HELP } from '../../../src/lib/help.js';

/**
 * The commands that `onMessage` of src/main.ts answers.
 */
function commandsOfMain(): string[] {
    const source = readFileSync(new URL('../../../src/main.ts', import.meta.url), 'utf8');
    const start = source.indexOf('private async onMessage(');
    const end = source.indexOf('async establishConnection(');
    expect(start).to.be.greaterThan(0);
    expect(end).to.be.greaterThan(start);
    return [...source.slice(start, end).matchAll(/obj\.command === '([^']+)'/g)].map(m => m[1]);
}

describe('help', () => {
    it('listet genau die Befehle, die onMessage beantwortet, jeden einmal', () => {
        const names = COMMANDS.map(c => c.command);
        expect(new Set(names).size).to.equal(names.length);
        expect([...names].sort()).to.deep.equal(commandsOfMain().sort());
    });

    it('kein Befehl ändert etwas', () => {
        for (const { command, write } of COMMANDS) {
            expect(write, command).to.equal(false);
        }
    });

    it('nennt jeden Befehl', () => {
        for (const { command } of COMMANDS.filter(c => c.command !== 'help')) {
            expect(HELP, command).to.include(command);
        }
        expect(HELP).to.include('sendTo unifi-network.0');
    });

    it('hält die Zeilen kurz', () => {
        for (const line of HELP.split('\n')) {
            expect(line.length, line).to.be.at.most(120);
        }
    });
});
