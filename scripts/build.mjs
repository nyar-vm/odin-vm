#!/usr/bin/env node
/**
 * `odin-vm-napi` native binding build entry.
 *
 * Builds `projects/napi/odin-vm-napi` and copies the artifact to
 * `projects/ts/platforms/odin-vm-<short>/lib/odin-vm.<triple>.node`.
 *
 * Usage:
 *   node scripts/build.mjs napi
 *   node scripts/build.mjs napi --debug
 *   node scripts/build.mjs napi --all
 */

import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {{ triple: string, packageDir: string, npmTriple: string, short: string }} NativeTarget */

const NATIVE_TARGETS = [
    {triple: 'x86_64-pc-windows-msvc', packageDir: 'odin-vm-win32-x64', npmTriple: 'win32-x64-msvc', short: 'win32-x64'},
    {triple: 'x86_64-unknown-linux-gnu', packageDir: 'odin-vm-linux-x64', npmTriple: 'linux-x64-gnu', short: 'linux-x64'},
    {triple: 'x86_64-apple-darwin', packageDir: 'odin-vm-darwin-x64', npmTriple: 'darwin-x64', short: 'darwin-x64'},
    {triple: 'aarch64-apple-darwin', packageDir: 'odin-vm-darwin-arm64', npmTriple: 'darwin-arm64', short: 'darwin-arm64'},
];

const LIB_NAME = 'odin_vm_napi';

function parseArgs(argv) {
    const flags = argv.filter((arg) => arg.startsWith('-'));
    const positionals = argv.filter((arg) => !arg.startsWith('-'));
    return {
        mode: positionals.find((arg) => arg === 'napi') ?? 'napi',
        all: flags.includes('--all'),
        debug: flags.includes('--debug'),
    };
}

function run(command, args) {
    const result = spawnSync(command, args, {cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', env: process.env});
    if ((result.status ?? 1) !== 0) {
        process.exit(result.status ?? 1);
    }
}

function hostTriple() {
    if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
    if (process.platform === 'darwin') return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

function selectTargets(targets, all) {
    if (all) return targets;
    const forced = process.env.OVM_NATIVE_TARGET;
    if (forced) {
        const hit = targets.find((target) => target.short === forced || target.triple === forced);
        if (hit) return [hit];
        console.warn(`OVM_NATIVE_TARGET=${forced} did not match any native target; falling back to host selection`);
    }
    const host = hostTriple();
    const exact = targets.find((target) => target.triple === host);
    return exact ? [exact] : [targets[0]];
}

function nativeLibCandidates(triple, release) {
    const profile = release ? 'release' : 'debug';
    const dir = join(ROOT, 'target', triple, profile);
    if (triple.includes('windows')) return [join(dir, `${LIB_NAME}.dll`)];
    if (triple.includes('apple')) return [join(dir, `lib${LIB_NAME}.dylib`)];
    return [join(dir, `lib${LIB_NAME}.so`), join(dir, `${LIB_NAME}.so`)];
}

function findNativeArtifact(triple, release) {
    const candidates = nativeLibCandidates(triple, release);
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    const profile = release ? 'release' : 'debug';
    const depsDir = join(ROOT, 'target', triple, profile, 'deps');
    if (existsSync(depsDir)) {
        for (const name of readdirSync(depsDir)) {
            if (
                (name === LIB_NAME || name.startsWith(`${LIB_NAME}.`) || name.startsWith(`lib${LIB_NAME}.`)) &&
                (name.endsWith('.dll') || name.endsWith('.so') || name.endsWith('.dylib') || name.endsWith('.node'))
            ) {
                return join(depsDir, name);
            }
        }
    }
    throw new Error(`missing build artifact (tried: ${candidates.join(', ')})`);
}

function buildNapi(opts) {
    const release = !opts.debug;
    const targets = selectTargets(NATIVE_TARGETS, opts.all);
    console.log(`build:napi → odin-vm-napi cdylib (${release ? 'release' : 'debug'}, ${targets.length} target(s))`);

    for (const target of targets) {
        const triple = process.env.OVM_NATIVE_TARGET_TRIPLE ?? target.triple;
        const profile = release ? ['--release'] : [];
        console.log(`\n→ ${triple} → projects/ts/platforms/${target.packageDir}`);
        run('cargo', ['build', ...profile, '--target', triple, '-p', 'odin-vm-napi']);

        const source = findNativeArtifact(triple, release);
        const destination = join(ROOT, 'projects', 'ts', 'platforms', target.packageDir, 'lib', `odin-vm.${target.npmTriple}.node`);
        mkdirSync(dirname(destination), {recursive: true});
        copyFileSync(source, destination);
        console.log(`  copied lib/odin-vm.${target.npmTriple}.node`);
    }
}

const opts = parseArgs(process.argv.slice(2));
if (opts.mode === 'napi') {
    buildNapi(opts);
} else {
    console.error(`unsupported mode '${opts.mode}' (only 'napi' is published from this repository)`);
    process.exit(1);
}

console.log('\nbuild complete');
