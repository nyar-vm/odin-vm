# AGENTS

本文件面向在该仓库工作的 AI Agents。人类请先读 [readme.md](./readme.md)。

## 仓库定位

`odin-vm` 是 `.odin` 目标运行时与其宿主分发的独立仓：

- `projects/runtime/odin-vm`：Rust 消费门面，`pub use interpreter_vm_ovm::*;`，不持有引擎实现。
- `projects/napi/odin-vm-napi`：Node-API 绑定，只做模块加载、导出列举与 ABI sidecar 校验后的调用。
- `projects/ts/emulators/odin-vm`：`@nyar/odin-vm` CLI 与 TypeScript 入口。
- `projects/ts/platforms/odin-vm-<platform>`：按平台打包的 `odin-vm.<triple>.node`。

## 依赖边界

- 引擎、托管堆与 JIT 底座在 Boost `interpreter-vm-ovm` / `interpreter-gc`，以 git `rev` 固定；本仓不得复制引擎实现。
- `.odin` 磁盘格式与 ABI sidecar 合同归 `data-binary-odin`；本仓只消费。
- 本仓不得导入任何语言的 AST、解析器或编译流水线；`.nyar` 程序集与高层语义不属于本仓。

## 硬性约束

1. 主分支固定为 `master`；`dev` 仅作开发跟踪分支。
2. 所有跨仓 Cargo 依赖固定完整 40 位 `rev`；本机路径只写在 `.cargo/config.toml`（gitignored），示例在 `.cargo/config.example.toml`。
3. 集成测试放在 crate 的 `tests/` 目录，不在 `Cargo.toml` 声明 `[[test]]`。
4. `odin-vm-napi` 不得绕过 ABI sidecar：sidecar 缺失、解析失败或哈希不符必须直接报错。
5. 提交 subject 以恰好一个 gitmoji 开头、英文祈使句、标识符用反引号，不带 semver；提交前运行 `git diff --check` 与对应测试。
6. npm 发布只允许 GitHub Actions Trusted Publisher/OIDC（工作流 `publish-npm.yml`，environment `NPM_PUBLISH`）；禁止本地 `npm publish`、token/OTP 旁路。
7. 不使用 `git clean`、`rmdir /s /q` 等宽泛清理；删除必须精确指定目标。

## 常用命令

```bash
cargo test --workspace                 # Rust
node scripts/build.mjs napi            # 构建宿主原生插件到平台包
pnpm install && pnpm test              # TypeScript 与 CLI 测试
node scripts/prepare-npm-publish.mjs   # 同步发布用 README.md
```
