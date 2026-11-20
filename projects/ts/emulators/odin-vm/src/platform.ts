import {createRequire} from 'node:module';
import {arch, platform} from 'node:os';

import {platformShort} from './platform-triple.ts';

/** Current host OS/arch key (`win32-x64`, …). */
export function hostPlatformKey(): string {
    return `${platform()}-${arch()}`;
}

/** Optional platform package that ships the host native addon, when one exists. */
export function resolveNativePackage(): string | undefined {
    const short = platformShort();
    return ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'].includes(short) ? `@nyar/odin-vm-${short}` : undefined;
}

/** Native addon package for the current host; throws when the host has no collect. */
export function resolveCollect(): {kind: 'native'; packageName: string} {
    const packageName = resolveNativePackage();
    if (!packageName) {
        throw new Error(`no OdinVM native collect for host ${hostPlatformKey()} (supported: win32-x64, linux-x64, darwin-x64, darwin-arm64)`);
    }
    return {kind: 'native', packageName};
}

/** Resolve `<package>/package.json` through the consumer's module graph, if installed. */
export function requireOptionalPackage(packageName: string): string | undefined {
    const require = createRequire(import.meta.url);
    try {
        return require.resolve(`${packageName}/package.json`);
    } catch {
        return undefined;
    }
}
