# @nyar/odin-vm

OdinVM invocation surface and host CLI. Bytecode execution goes through `odin-vm` →
`interpreter-vm-ovm`; the Node-API binding is built from this repository's `odin-vm-napi` crate.

## CLI

```bash
odin-vm version
odin-vm host-info
odin-vm ovm exports --module ./app.odin
odin-vm ovm invoke --module ./app.odin --entry main --args '[1, 2]'
```

`.odin` invocations require the ABI sidecar next to the artifact. When the sidecar is missing,
unparsable, or does not match the artifact hash, the native binding refuses to materialize
structured arguments or results.

## Programmatic surface

```typescript
import {bindingInfo, invoke, listExports} from '@nyar/odin-vm';

const info = bindingInfo();
const symbols = listExports('/path/to/app.odin');
const value = invoke('/path/to/app.odin', symbols[0], [1, 2]);
```

Platform collects (`odin-vm-win32-x64`, `odin-vm-linux-x64`, `odin-vm-darwin-*`) are optional
dependencies: the host picks the collect matching the current OS/arch and reports a clear error
when none is installed.

## License

MIT
