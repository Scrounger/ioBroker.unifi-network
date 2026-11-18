/**
 * Updates the coverage badge in README.md from the c8 json-summary report.
 *
 * Run automatically by `npm run test:coverage` after the coverage run.
 * Reads `total.lines.pct` from `coverage/coverage-summary.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const summaryFile = path.join(root, 'coverage', 'coverage-summary.json');
const readmeFile = path.join(root, 'README.md');

const badgePattern = /https:\/\/img\.shields\.io\/badge\/coverage-\d+%25-[a-z]+/;

/**
 * Maps a percentage to a shields.io named color.
 *
 * @param {number} pct coverage in percent
 * @returns {string} shields.io color name
 */
function badgeColor(pct) {
    if (pct >= 90) {
        return 'brightgreen';
    }
    if (pct >= 80) {
        return 'green';
    }
    if (pct >= 70) {
        return 'yellowgreen';
    }
    if (pct >= 60) {
        return 'yellow';
    }
    if (pct >= 50) {
        return 'orange';
    }
    return 'red';
}

const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
const percent = Math.round(summary.total.lines.pct);
const color = badgeColor(percent);
const badgeUrl = `https://img.shields.io/badge/coverage-${percent}%25-${color}`;

const readme = readFileSync(readmeFile, 'utf8');
if (!badgePattern.test(readme)) {
    throw new Error(`Coverage badge not found in ${readmeFile}`);
}

const updated = readme.replace(new RegExp(badgePattern.source, 'g'), badgeUrl);
if (updated !== readme) {
    writeFileSync(readmeFile, updated);
}

console.log(`Coverage badge: ${percent}% (${color})`);
