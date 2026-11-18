/**
 * Runs a command with `src/lib/myIob.ts` temporarily replaced by a copy of the shared module.
 *
 * `src/lib/myIob.ts` is a symlink to `../shared/myIob.ts` outside of this repository. c8 can only
 * measure files inside the project, so the symlink is replaced by a copy for the duration of the
 * command and restored afterwards (also on exit, SIGINT and SIGTERM).
 *
 * Usage: node tools/withMyIobCopy.mjs <command> [...args]
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = resolve(projectRoot, 'src', 'lib', 'myIob.ts');

/** @type {string | undefined} */
let savedSymlinkTarget;

/**
 * Replaces the symlink at `modulePath` with a copy of its target. Does nothing if it is not a symlink
 * or if the target does not exist.
 */
function replaceSymlinkWithCopy() {
    const stats = lstatSync(modulePath, { throwIfNoEntry: false });
    if (!stats?.isSymbolicLink()) {
        return;
    }

    const target = readlinkSync(modulePath);
    const source = resolve(dirname(modulePath), target);
    if (!existsSync(source)) {
        console.warn(`myIob source not found: ${source}`);
        return;
    }

    // Remember the target before swapping, so the symlink is restored even if copyFileSync fails.
    savedSymlinkTarget = target;
    unlinkSync(modulePath);
    copyFileSync(source, modulePath);
}

/**
 * Removes the copy and restores the original symlink.
 */
function restoreSymlink() {
    if (savedSymlinkTarget === undefined) {
        return;
    }

    rmSync(modulePath, { force: true });
    symlinkSync(savedSymlinkTarget, modulePath);
    savedSymlinkTarget = undefined;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
    console.error('Usage: node tools/withMyIobCopy.mjs <command> [...args]');
    process.exit(1);
}

replaceSymlinkWithCopy();

const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit' });

// The child receives terminal signals as well. Keep the wrapper alive until the child has exited,
// so the symlink is restored afterwards.
process.on('SIGINT', () => { });
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('error', (error) => {
    console.error(error);
    restoreSymlink();
    process.exit(1);
});

child.on('close', (code, signal) => {
    restoreSymlink();
    if (signal) {
        process.kill(process.pid, signal);
    } else {
        process.exit(code ?? 1);
    }
});
