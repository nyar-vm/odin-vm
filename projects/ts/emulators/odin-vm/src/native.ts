import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {hostPlatformKey, requireOptionalPackage, resolveCollect} from './platform.ts';
import {nativeBinaryName, platformShort, platformTriple} from './platform-triple.ts';

/** Host protocol id (mirrors `OVM_HOST_PROTOCOL` in `odin-vm-napi`). */
export const BINDING_PROTOCOL = 'odin-vm/0';

export type BindingInfo = {
    binding: string;
    protocol: string;
};

type OdinVmNativeAddon = {
    ovmBindingInfo(): BindingInfo;
    ovmListExports(modulePath: string): string[];
    ovmInvoke(modulePath: string, entry: string, argsJson: string): string;
};

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Resolve the native `.node` through the platform optionalDependency
 * (`@nyar/odin-vm-<short>`), falling back to the sibling workspace tree.
 *
 * `ODIN_VM_NATIVE` overrides the resolved path so a locally built addon can be
 * exercised without reinstalling the platform package.
 */
export function resolveNativePath(): string {
    const override = process.env.ODIN_VM_NATIVE;
    if (override && override.trim().length > 0) return override;

    const triple = platformTriple();
    const short = platformShort(triple);
    const packageName = resolveCollect().packageName;
    const binary = nativeBinaryName(triple);
    const candidates: string[] = [];

    const pkgJson = requireOptionalPackage(packageName);
    if (pkgJson) {
        const pkgDir = path.dirname(pkgJson);
        candidates.push(path.join(pkgDir, 'lib', binary));
        candidates.push(path.join(pkgDir, binary));
    }

    candidates.push(path.join(pkgRoot, '..', '..', 'platforms', `odin-vm-${short}`, 'lib', binary));
    candidates.push(path.join(pkgRoot, '..', '..', 'platforms', `odin-vm-${short}`, binary));
    candidates.push(path.join(pkgRoot, '..', 'node_modules', packageName, 'lib', binary));
    candidates.push(path.join(pkgRoot, 'node_modules', packageName, 'lib', binary));

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    throw new Error(
        `odin-vm native addon not found for ${packageName}. Run: node scripts/build.mjs napi\n` +
        `Looked in:\n${candidates.map((c) => `  - ${c}`).join('\n')}\n` +
        `(host ${hostPlatformKey()})`,
    );
}

let nativeAddon: OdinVmNativeAddon | undefined;

/** Load the host `odin-vm-napi` binding. */
export function loadNative(): OdinVmNativeAddon {
    if (nativeAddon) return nativeAddon;
    nativeAddon = require(resolveNativePath()) as OdinVmNativeAddon;
    return nativeAddon;
}

/** Binding identity and host protocol. */
export function bindingInfo(): BindingInfo {
    return loadNative().ovmBindingInfo();
}

/** List exported symbol names of an `.odin` module. */
export function listExports(modulePath: string): string[] {
    return loadNative().ovmListExports(modulePath);
}

/**
 * Invoke an `.odin` export and return the parsed JSON result.
 *
 * The binding refuses the call when the ABI sidecar beside the artifact is
 * missing or does not match the artifact hash.
 */
export function invoke(modulePath: string, entry: string, args: unknown[] = []): unknown {
    const encoded = loadNative().ovmInvoke(modulePath, entry, JSON.stringify(args));
    return JSON.parse(encoded) as unknown;
}
