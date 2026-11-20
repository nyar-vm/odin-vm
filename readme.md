# odin-vm

OVM bytecode runtime, Node-API binding and npm packages for verified `.odin` modules.

`odin-vm` loads encoded OVM modules, executes stack-based bytecode, coordinates optional JIT
compilation and exposes host import dispatch. Guest languages lower through an emitter into
`.odin` bytes before this repository sees the program.

## Layout

| Path                              | Role                                                              |
|:----------------------------------|:------------------------------------------------------------------|
| `projects/runtime/odin-vm`        | Rust consumer facade over the `interpreter-vm-ovm` engine         |
| `projects/napi/odin-vm-napi`      | Node-API binding: export listing and ABI-checked invocation       |
| `projects/ts/emulators/odin-vm`   | npm package `@nyar/odin-vm` with the `odin-vm` CLI                |
| `projects/ts/platforms/*`         | Per-platform native collect packages (`@nyar/odin-vm-<platform>`) |

The bytecode engine, managed heap and JIT substrate live in the Boost `interpreter-vm-ovm` /
`interpreter-gc` crates and are consumed at a pinned git revision. This repository holds the
runtime facade, the host boundary and the packaging only.

## Build

```bash
# Rust workspace (engine deps resolve from git; use .cargo/config.example.toml for local paths)
cargo test --workspace

# Native addon for the host platform, copied into its platform package
node scripts/build.mjs napi

# TypeScript strip-types build and tests
pnpm install
pnpm test
```

## CLI

```bash
pnpm --filter @nyar/odin-vm build
node projects/ts/emulators/odin-vm/bin/odin-vm.js ovm exports --module ./app.odin
```

`.odin` invocations require the ABI sidecar written next to the artifact. A missing, unparsable
or hash-mismatched sidecar is rejected instead of guessing an argument layout.

## Boundaries

- Does **not** parse source code or lower HIR/MIR.
- Does **not** own the on-disk bytecode format contract.
- Does **not** import concrete language ASTs, parsers or compiler pipelines.

## License

MIT
