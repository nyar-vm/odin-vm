/**
 * GitHub Actions: publish the `@nyar/odin-vm*` npm packages.
 *
 * - tag vX.Y.Z → version X.Y.Z
 * - idempotent: a version already on the registry is skipped
 * - no NPM_TOKEN: OIDC Trusted Publisher only (`permissions.id-token: write`)
 * - workflow contract: file=publish-npm.yml env=NPM_PUBLISH repo=nyar-vm/odin-vm
 *
 * Prerequisite: native artifacts at OVM_NATIVE_ARTIFACTS/<short>/odin-vm.<triple>.node
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildAllNpmPackageJs} from '../strip-types.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {{ short: string, packageDir: string, artifact: string }[]} */
const NATIVE_PLATFORMS = [
    {short: 'win32-x64', packageDir: 'platforms/odin-vm-win32-x64', artifact: 'odin-vm.win32-x64-msvc.node'},
    {short: 'linux-x64', packageDir: 'platforms/odin-vm-linux-x64', artifact: 'odin-vm.linux-x64-gnu.node'},
    {short: 'darwin-x64', packageDir: 'platforms/odin-vm-darwin-x64', artifact: 'odin-vm.darwin-x64.node'},
    {short: 'darwin-arm64', packageDir: 'platforms/odin-vm-darwin-arm64', artifact: 'odin-vm.darwin-arm64.node'},
];

const MAIN_PACKAGE_DIR = 'emulators/odin-vm';

function fail(msg) {
    console.error(`ci-publish-npm: ${msg}`);
    process.exit(1);
}

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: opts.cwd ?? ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: opts.env ?? process.env,
        stdio: opts.stdio ?? 'pipe',
    });
    return {status: r.status ?? 1, stdout: String(r.stdout ?? '').trim(), stderr: String(r.stderr ?? '').trim()};
}

function resolveVersion() {
    const fromArg = process.argv.find((a) => a.startsWith('--version='))?.slice('--version='.length);
    if (fromArg) return fromArg.replace(/^v/, '');
    const ref = process.env.GITHUB_REF ?? '';
    const m = ref.match(/^refs\/tags\/v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
    if (m) return m[1];
    fail('need --version=X.Y.Z or GITHUB_REF=refs/tags/vX.Y.Z');
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, obj) => fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);

function copyIfExists(from, to) {
    if (!fs.existsSync(from)) return false;
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(from, to);
    return true;
}

function copyTree(src, dest) {
    fs.mkdirSync(dest, {recursive: true});
    for (const name of fs.readdirSync(src)) {
        if (name === 'node_modules' || name === '.git') continue;
        const from = path.join(src, name);
        const to = path.join(dest, name);
        const st = fs.statSync(from);
        if (st.isDirectory()) copyTree(from, to);
        else fs.copyFileSync(from, to);
    }
}

function rewriteWorkspaceDeps(deps, version) {
    if (!deps) return deps;
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(deps)) {
        out[k] = typeof v === 'string' && (v.startsWith('workspace:') || v === '*') ? version : v;
    }
    return out;
}

function rewriteDepsFields(pkg, version) {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        if (pkg[field]) pkg[field] = rewriteWorkspaceDeps(pkg[field], version);
    }
    return pkg;
}

function isAlreadyPublished(blob) {
    return /cannot publish over existing|EPUBLISHCONFLICT|previously published versions|version already exists|cannot publish.*same version|you cannot publish over/i.test(
        blob,
    );
}

function isAuthFailure(blob) {
    return /ENEEDAUTH|Unable to authenticate|not authorized|OIDC|trusted publisher|two-factor|need to be logged|login|identity token|do not have permission to access it|Access token expired or revoked/i.test(
        blob,
    );
}

function isMissingPackage(blob) {
    if (isAuthFailure(blob)) return false;
    return /Package not found|does not exist on the registry|cannot publish.*before creating|This package has not been created|is not in this registry/i.test(
        blob,
    );
}

function versionExists(name, version) {
    const r = run('npm', ['view', `${name}@${version}`, 'version']);
    return r.status === 0 && r.stdout === version;
}

function npmPublish(stage, name) {
    console.log(`\n=== ${name} npm publish --access public ===`);
    const r = run('npm', ['publish', '--access', 'public'], {cwd: stage});
    if (r.stdout) process.stdout.write(`${r.stdout}\n`);
    if (r.stderr) process.stderr.write(`${r.stderr}\n`);
    const blob = `${r.stdout}\n${r.stderr}`;
    if (r.status === 0) return 'published';
    if (isAlreadyPublished(blob)) return 'exists';
    if (isAuthFailure(blob)) return 'auth';
    if (isMissingPackage(blob)) return 'missing';
    console.error(blob.slice(0, 1200));
    return 'other';
}

function finish(stage, name, version) {
    if (versionExists(name, version)) {
        console.log(` ✓ ${name}@${version} already on registry — skip`);
        return 'exists';
    }
    const outcome = npmPublish(stage, name);
    if (outcome === 'published') return 'published';
    if (outcome === 'exists') {
        console.log(` ✓ ${name}@${version} already on registry — skip`);
        return 'exists';
    }
    if (outcome === 'auth') {
        fail(`OIDC/auth failed for ${name}. Add Trusted Publisher: file=publish-npm.yml env=NPM_PUBLISH repo=nyar-vm/odin-vm`);
    }
    if (outcome === 'missing') {
        fail(`${name} missing on registry — create the package placeholder first, then register the Trusted Publisher`);
    }
    fail(`publish failed for ${name}`);
}

function stagePackage(absDir, version, stageName) {
    const raw = readJson(path.join(absDir, 'package.json'));
    if (!raw.name) fail(`no name in ${absDir}/package.json`);

    const stage = path.join(os.tmpdir(), `ovm-pub-${stageName}-${version}`);
    fs.rmSync(stage, {recursive: true, force: true});
    fs.mkdirSync(stage, {recursive: true});

    for (const rel of raw.files ?? ['bin', 'src', 'readme.md', 'README.md']) {
        const from = path.join(absDir, rel);
        if (!fs.existsSync(from)) continue;
        const to = path.join(stage, rel);
        if (fs.statSync(from).isDirectory()) copyTree(from, to);
        else copyIfExists(from, to);
    }
    for (const doc of ['readme.md', 'README.md']) copyIfExists(path.join(absDir, doc), path.join(stage, doc));
    if (!fs.existsSync(path.join(stage, 'README.md')) && fs.existsSync(path.join(stage, 'readme.md'))) {
        fs.copyFileSync(path.join(stage, 'readme.md'), path.join(stage, 'README.md'));
    }

    const pkg = rewriteDepsFields({...raw}, version);
    pkg.version = version;
    delete pkg.private;
    delete pkg.devDependencies;
    pkg.publishConfig = {...(pkg.publishConfig ?? {}), access: 'public'};
    if (pkg.scripts) {
        delete pkg.scripts.prepack;
        delete pkg.scripts.prepare;
        if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
    }
    writeJson(path.join(stage, 'package.json'), pkg);
    return {stage, pkg, name: pkg.name};
}

function publishPlatform(platform, version, artifactsRoot) {
    const absDir = path.join(ROOT, 'projects', 'ts', platform.packageDir);
    const {stage, name} = stagePackage(absDir, version, platform.short);

    const stageArtifact = path.join(stage, 'lib', platform.artifact);
    const candidates = [
        path.join(artifactsRoot, platform.short, 'lib', platform.artifact),
        path.join(artifactsRoot, platform.short, platform.artifact),
        path.join(absDir, 'lib', platform.artifact),
        path.join(absDir, platform.artifact),
    ];
    if (!candidates.some((from) => copyIfExists(from, stageArtifact))) {
        console.log(` · ${name}: no ${platform.artifact} in artifacts or package tree — publish metadata-only`);
    }

    if (!fs.existsSync(path.join(stage, 'index.mjs'))) fail(`${name}: missing index.mjs`);
    return finish(stage, name, version);
}

function publishMain(version, artifactsRoot) {
    const absDir = path.join(ROOT, 'projects', 'ts', MAIN_PACKAGE_DIR);
    const {stage, pkg, name} = stagePackage(absDir, version, 'main');

    const optionalNatives = {};
    for (const platform of NATIVE_PLATFORMS) {
        const collectName = `@nyar/odin-vm-${platform.short}`;
        const packageDir = path.join(ROOT, 'projects', 'ts', platform.packageDir);
        const hasArtifact =
            fs.existsSync(path.join(artifactsRoot, platform.short, 'lib', platform.artifact)) ||
            fs.existsSync(path.join(artifactsRoot, platform.short, platform.artifact)) ||
            fs.existsSync(path.join(packageDir, 'lib', platform.artifact));
        if (hasArtifact || versionExists(collectName, version)) {
            optionalNatives[collectName] = version;
        } else {
            console.log(` · ${collectName}@${version} not built this release — omit from optionalDependencies`);
        }
    }

    pkg.dependencies = rewriteWorkspaceDeps(pkg.dependencies ?? {}, version);
    pkg.optionalDependencies = {...rewriteWorkspaceDeps(pkg.optionalDependencies ?? {}, version), ...optionalNatives};
    writeJson(path.join(stage, 'package.json'), pkg);

    for (const rel of [pkg.main, ...(pkg.bin ? [pkg.bin['odin-vm'] ?? pkg.bin] : [])]) {
        if (typeof rel === 'string' && !fs.existsSync(path.join(stage, rel))) {
            fail(`${name}: missing publish entry ${rel} (run node scripts/strip-types.mjs)`);
        }
    }

    return finish(stage, name, version);
}

const version = resolveVersion();
console.log(`ci-publish-npm: version=${version}`);
console.log(` GITHUB_REF=${process.env.GITHUB_REF ?? '(none)'}`);
console.log(' Trusted Publisher contract: publish-npm.yml + env NPM_PUBLISH\n');

delete process.env.NODE_AUTH_TOKEN;
delete process.env.NPM_TOKEN;

buildAllNpmPackageJs();

const artifactsRoot = process.env.OVM_NATIVE_ARTIFACTS || path.join(ROOT, 'dist', 'native-flat');

let published = 0;
let skipped = 0;
for (const platform of NATIVE_PLATFORMS) {
    if (publishPlatform(platform, version, artifactsRoot) === 'published') published += 1;
    else skipped += 1;
}
if (publishMain(version, artifactsRoot) === 'published') published += 1;
else skipped += 1;

console.log(`\nci-publish-npm: done (published=${published} skipped=${skipped})`);
