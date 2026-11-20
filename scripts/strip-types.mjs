#!/usr/bin/env node
/**
 * Generate publishable JS entrypoints for npm packages.
 *
 * Node refuses type stripping for `.ts` inside `node_modules`
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so `main` / `exports` / `bin`
 * cannot point at TypeScript sources. This mirrors `src/` into `dist/` with
 * Node's built-in `stripTypeScriptTypes` (keeping directory depth so relative
 * paths such as `../../package.json` stay valid) and rewrites relative `.ts`
 * specifiers to `.js`.
 *
 * Usage:
 *   node scripts/strip-types.mjs
 *   node scripts/strip-types.mjs projects/ts/emulators/odin-vm
 */

import {mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Packages that need generated JS entrypoints (repo-relative). */
const PACKAGE_DIRS = ['projects/ts/emulators/odin-vm'];

/** Only rewrite relative specifiers: `'./x.ts'`, `"../x.ts"` → `.js`. */
const TS_SPECIFIER = /(['"])(\.{1,2}\/[^'"]*?)\.ts\1/g;

/** @param {string} dir */
function listFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFiles(full));
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

/**
 * Compile a single package's `src/` into `dist/`.
 *
 * @param {string} packageDir repo-relative package directory
 */
export function buildNpmPackageJs(packageDir) {
    if (typeof stripTypeScriptTypes !== 'function') {
        throw new Error(`Node >= 22.13 stripTypeScriptTypes is required (current ${process.version})`);
    }
    const srcDir = path.join(ROOT, packageDir, 'src');
    const outDir = path.join(ROOT, packageDir, 'dist');
    if (!statSync(srcDir).isDirectory()) {
        throw new Error(`missing ${path.relative(ROOT, srcDir)}`);
    }

    rmSync(outDir, {recursive: true, force: true});
    const written = [];
    for (const file of listFiles(srcDir)) {
        if (!file.endsWith('.ts')) continue;
        const relative = path.relative(srcDir, file).replace(/\\/g, '/');
        const target = path.join(outDir, relative.replace(/\.ts$/, '.js'));
        const source = readFileSync(file, 'utf8');
        const stripped = stripTypeScriptTypes(source, {mode: 'strip'}).replace(TS_SPECIFIER, '$1$2.js$1');
        mkdirSync(path.dirname(target), {recursive: true});
        writeFileSync(target, stripped);
        written.push(path.relative(ROOT, target).replace(/\\/g, '/'));
    }
    return written;
}

/** Generate JS entrypoints for every package, returning written files. */
export function buildAllNpmPackageJs() {
    const written = [];
    for (const dir of PACKAGE_DIRS) written.push(...buildNpmPackageJs(dir));
    return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const requested = process.argv.slice(2);
    const targets = requested.length > 0 ? requested : PACKAGE_DIRS;
    for (const dir of targets) {
        for (const file of buildNpmPackageJs(dir)) console.log(`built ${file}`);
    }
}
