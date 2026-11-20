import {createRequire} from 'node:module';
import path from 'node:path';

import type {Cli, ParsedOptions} from '@vmz/commander';
import {createCli} from '@vmz/commander';

import {OVM_CLI_CATALOG} from './catalog.ts';
import {bindingInfo, invoke, listExports} from '../native.ts';
import {hostPlatformKey, resolveCollect} from '../platform.ts';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as {version: string};

function requireString(options: ParsedOptions, key: string): string {
    const value = options[key];
    if (typeof value !== 'string' || !value) {
        throw new Error(`missing required --${key}`);
    }
    return value;
}

function buildCli(): Cli {
    const cli = createCli('odin-vm').catalog(() => OVM_CLI_CATALOG).intro('cli.intro');

    cli.command('version', 'cli.cmd.version').action(() => {
        const info = bindingInfo();
        console.log(`@nyar/odin-vm ${pkg.version}`);
        console.log(`${info.protocol} (${info.binding})`);
        return 0;
    });

    cli.command('host-info', 'cli.cmd.host-info').action(() => {
        console.log(
            JSON.stringify(
                {
                    version: pkg.version,
                    host: hostPlatformKey(),
                    collect: resolveCollect(),
                    binding: bindingInfo(),
                },
                null,
                2,
            ),
        );
        return 0;
    });

    const ovm = cli.command('ovm', 'cli.cmd.ovm');

    ovm.command('exports', 'cli.cmd.ovm.exports')
        .option('--module <path>', 'cli.opt.module')
        .action((options: ParsedOptions) => {
            const modulePath = path.resolve(requireString(options, 'module'));
            for (const symbol of listExports(modulePath)) {
                console.log(symbol);
            }
            return 0;
        });

    ovm.command('invoke', 'cli.cmd.ovm.invoke')
        .option('--module <path>', 'cli.opt.module')
        .option('--entry <name>', 'cli.opt.entry')
        .option('--args <json>', 'cli.opt.args')
        .action((options: ParsedOptions) => {
            const modulePath = path.resolve(requireString(options, 'module'));
            const entry = requireString(options, 'entry');
            const raw = typeof options.args === 'string' ? JSON.parse(options.args) : [];
            if (!Array.isArray(raw)) {
                throw new Error('--args must be a JSON array');
            }
            console.log(JSON.stringify(invoke(modulePath, entry, raw), null, 2));
            return 0;
        });

    return cli;
}

/** Parse argv and run the OdinVM CLI (orchestration via `@vmz/commander`, calls via `odin-vm-napi`). */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
    return buildCli().parse(argv);
}
