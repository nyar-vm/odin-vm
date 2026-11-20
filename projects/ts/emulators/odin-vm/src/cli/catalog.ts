import type {LocaleCatalog} from '@vmz/commander';

/** OdinVM CLI English catalog (`commander.*` entries fall back to the framework). */
export const OVM_CLI_CATALOG: LocaleCatalog = {
    'cli.intro': 'OdinVM CLI — bytecode invocation for `.odin` modules',
    'cli.cmd.version': 'Print package version and binding protocol',
    'cli.cmd.host-info': 'Print the resolved platform collect and binding metadata',
    'cli.cmd.ovm': 'OdinVM module helpers',
    'cli.cmd.ovm.exports': 'List exported symbols of an `.odin` module',
    'cli.cmd.ovm.invoke': 'Invoke an exported `.odin` entry with JSON args',
    'cli.opt.module': 'Path to the `.odin` module artifact',
    'cli.opt.entry': 'Logical entry symbol',
    'cli.opt.args': 'JSON array of call arguments',
};
