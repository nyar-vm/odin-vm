#!/usr/bin/env node
/**
 * Verify that every npm package carries a `readme.md` beside its `package.json`.
 *
 * npm always publishes a README when one exists, regardless of the `files`
 * allowlist, so this step only guards against missing docs before packing.
 *
 * Usage:
 *   node scripts/prepare-npm-publish.mjs
 */

import {existsSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TS_ROOT = join(ROOT, 'projects', 'ts');

function packageDirs() {
    /** @type {string[]} */
    const dirs = [];
    for (const bucket of ['packages', 'platforms', 'emulators']) {
        const base = join(TS_ROOT, bucket);
        if (!existsSync(base)) continue;
        for (const entry of readdirSync(base, {withFileTypes: true})) {
            if (!entry.isDirectory()) continue;
            const dir = join(base, entry.name);
            if (existsSync(join(dir, 'package.json'))) {
                dirs.push(dir);
            }
        }
    }
    return dirs;
}

let missing = 0;

for (const dir of packageDirs()) {
    if (!existsSync(join(dir, 'readme.md'))) {
        console.error(`missing readme.md: ${dir}`);
        missing++;
    }
}

if (missing > 0) {
    process.exit(1);
}

console.log(`prepare-npm-publish: ${packageDirs().length} package readme(s) present`);
