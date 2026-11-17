/**
 * Versioned layout of the local fixtures: `test/fixtures/local/<version>/{api,events}/`.
 *
 * `<version>` is the network application version from `sysinfo` (e.g. `10.6.109`). Fixtures of different
 * versions stay apart, so a changed API response can be traced to the version that changed it.
 * The tests always run against the newest version directory.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of all local fixtures (git-ignored). */
export const FIXTURE_ROOT = fileURLToPath(new URL('../../test/fixtures/local/', import.meta.url));

/** Kinds of fixture directories below a version directory. */
export type FixtureKind = 'api' | 'events';

/** Directory names that are controller versions, e.g. `10.6.109`. */
const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/**
 * Compares two version strings numerically, part by part (so `10.6.109` is newer than `10.6.9`).
 *
 * @param a first version
 * @param b second version
 * @returns negative if `a` is older, positive if `a` is newer, 0 if both are equal
 */
export function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/**
 * Returns the version of a `sysinfo` response.
 *
 * @param response raw controller response with the version in `data[0].version`
 * @returns the version, or `undefined` if it is missing or not a version string
 */
export function versionFromSysInfo(response: unknown): string | undefined {
    if (typeof response !== 'object' || response === null) {
        return undefined;
    }
    const data = (response as { data?: unknown }).data;
    const version = Array.isArray(data) ? (data[0] as { version?: unknown } | undefined)?.version : undefined;
    return typeof version === 'string' && VERSION_PATTERN.test(version) ? version : undefined;
}

/**
 * Lists the versions that have a fixture directory, oldest first.
 *
 * @param root directory that contains the version directories
 */
export function listFixtureVersions(root: string = FIXTURE_ROOT): string[] {
    if (!existsSync(root)) {
        return [];
    }
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort(compareVersions);
}

/**
 * Returns the newest version that has a fixture directory.
 *
 * @param root directory that contains the version directories
 * @returns the version, or `undefined` if there are no fixtures yet
 */
export function latestFixtureVersion(root: string = FIXTURE_ROOT): string | undefined {
    return listFixtureVersions(root).at(-1);
}

/**
 * Returns the directory of one kind of fixtures for a version.
 *
 * @param version controller version, e.g. `10.6.109`
 * @param kind `api` or `events`
 * @param root directory that contains the version directories
 */
export function fixtureDir(version: string, kind: FixtureKind, root: string = FIXTURE_ROOT): string {
    return path.join(root, version, kind);
}
