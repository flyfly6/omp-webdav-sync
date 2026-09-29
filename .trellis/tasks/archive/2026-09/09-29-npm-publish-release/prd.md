# Publish plugin to npm with automated release workflow

## Goal

把 `omp-webdav-sync` 发布到公共 npm registry，并配置一个 GitHub Actions workflow：推送 `v*` git tag 时自动通过 OIDC trusted publishing 发布到 npm，同时自动生成 provenance 证明。

## Background / Constraints

- 仓库 `flyfly6/omp-webdav-sync` 为 **public**，满足 trusted publishing 与 provenance 的前提条件。
- 包名 `omp-webdav-sync` 在 npm 上 404（未被占用），可直接使用，无需 scope。
- 本地环境：Node v24.12.0、npm 11.6.2，满足 trusted publishing 的 Node ≥ 22.14.0 / npm CLI ≥ 11.5.1 要求。
- **硬限制：OIDC 无法发布某个包的首个版本。** npmjs.com 的 Trusted Publisher 配置入口要求包已存在（npm/cli#8544，尚未修复）。因此首版必须由本地 `npm publish`（人工 token）发布，之后才能启用 OIDC。
- **硬限制：package.json 缺少 `repository` 字段。** npm 官方明确要求 GitHub 发布的包 `repository.url` 必须与 GitHub 仓库一致，否则 npm 页面与 provenance 关联会出问题。
- 仓库当前没有 `package-lock.json`，而 release workflow 打算使用 `npm ci`（需要锁文件保证可复现构建）。
- `package.json` 的 `files` 已声明包含 `LICENSE`，但仓库根目录没有 `LICENSE` 文件，而 `license` 字段为 MIT。
- `package.json` 的 `prepare` 脚本会执行 `npm run build`，`npm publish` 时会自动触发构建；显式构建仍保留以便在发布前看到失败。

## Requirements

### R1 包元数据完善
- `package.json` 增加 `repository`（type=git，url 指向 `https://github.com/flyfly6/omp-webdav-sync.git`）、`homepage`、`bugs.url`，使 npm 包页面正确关联 GitHub 仓库。
- 收紧 `files` 为 `["dist/**/*.js", "dist/**/*.d.ts", "README.md", "LICENSE"]`：发布包只含运行所需的 JS、类型声明与文档，排除 `src/` 与 `*.map`（map 的 `sources` 指向 `../src/index.ts` 且无 `sourcesContent`，缺 `src/` 即失效）。`main` / `types` / `omp.extensions` / `pi.extensions` 保持不变（已正确指向 `./dist/index.js`）。

### R2 LICENSE 文件
- 根目录新增 MIT `LICENSE` 文件，与 `package.json` 的 `"license": "MIT"` 和 `files` 中的 `LICENSE` 条目一致。

### R3 锁文件
- 生成并提交 `package-lock.json`，使 CI 的 `npm ci` 可用。不把锁文件加入 `.gitignore`。

### R4 发布 workflow
- 新增 `.github/workflows/publish.yml`：
  - 触发条件：push 到 `v*` tag（`v` 前缀，例如 `v0.1.0`）。
  - `permissions`: `id-token: write` + `contents: read`。
  - 仅使用 GitHub 托管 runner（`ubuntu-latest`）；trusted publishing 不支持 self-hosted runner。
  - 使用 `actions/checkout@v7` 与 `actions/setup-node@v7`（当前最新主版本）。
  - Node 24，`registry-url: https://registry.npmjs.org`，`package-manager-cache: false`（npm 官方明确要求发布构建不使用缓存）。
  - 步骤：`npm ci` → `npm run check`（已包含 typecheck + build + 全量测试）→ 版本一致性校验 → `npm publish`。
  - **版本一致性校验**：比对 tag 名 `vX.Y.Z` 与 `package.json` 的 `version`，不一致直接失败。不一致会导致发布出去的版本号与 tag 标称版本永久错位，且 npm 版本不可覆盖、无法修复。
  - 不传 `--provenance` 标志：trusted publishing 从 public repo 发布 public 包时 npm 自动生成 provenance。

### R5 文档
- `README.md` 增加 **Installation** 段落，说明通过 npm 安装插件的方式。
- `README.md` 增加 **Releasing** 段落，写清：改 `package.json` 版本号 → 提交 → `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`。

### R6 一次性人工步骤（无法自动化，需在文档中写明）
以下步骤必须由用户在 npmjs.com / 本地完成，代码无法代替：
1. `npm login` 后，本地 `npm publish` 发布首版（OIDC 无法创建新包）。
2. 在 npmjs.com 包设置 → Trusted Publisher → GitHub Actions，填写：
   - Organization or user: `flyfly6`
   - Repository: `omp-webdav-sync`
   - Workflow filename: `publish.yml`（**只填文件名，不含 `.github/workflows/` 路径，含 `.yml` 扩展名**）
   - Environment name: 留空
   - **Allowed actions: 必须显式勾选 `npm publish`。** 2026-09-03 之后新建的 trusted publisher 配置默认只允许 `npm stage publish`，不勾选会导致 OIDC 发布报 404/拒绝。
3. （可选加固）npmjs.com 包设置 → Publishing access 选择 "Require two-factor authentication and disallow tokens"。

## Acceptance Criteria

- [ ] `package.json` 包含 `repository` / `homepage` / `bugs`，`repository.url` 指向 `https://github.com/flyfly6/omp-webdav-sync.git`。
- [ ] 根目录存在 MIT `LICENSE` 文件。
- [ ] 仓库根目录存在 `package-lock.json` 且未被 `.gitignore` 忽略。
- [ ] `.github/workflows/publish.yml` 存在，语法为合法 YAML，触发条件为 `push.tags: ['v*']`，含 `id-token: write` 权限。
- [ ] workflow 包含 tag 版本与 `package.json` 版本一致性校验步骤。
- [ ] `npm pack --dry-run` 产出的 tarball 包含 `dist/index.js`、`dist/index.d.ts`、`package.json`、`README.md`、`LICENSE`，且**不包含** `test/`、`dist-test/`、`.trellis/`、`.omp/`、`src/`、`*.map`。
- [ ] `npm run check` 在本地通过（typecheck 0 错误 + 全量测试通过）。
- [ ] workflow YAML 可被解析（用 Node 内置能力或等价方式验证结构合法）。
- [ ] `README.md` 含 Installation 与 Releasing 两节，且 Releasing 节写明 npmjs.com Trusted Publisher 的必填字段与 Allowed actions 陷阱。
- [ ] 用户在 README / 本次交付说明中明确知道：首版必须本地 `npm publish`，之后才能启用 OIDC。

## Out of Scope

- 不配置 PR / push 触发的独立 CI 检查 workflow（发布 workflow 内的 `npm run check` 已覆盖发布前的质量门禁）。
- 不引入 changesets / semantic-release / release-it 等版本管理工具（tag 即版本，最简）。
- 不配置 staged publishing（`npm stage publish`）流程（会让每次发布都需要人工 CLI 审批，与"自动发布"诉求冲突）。
- 不改动 `src/` 下任何业务代码。

## Notes

- OIDC 是推荐路径：免长期 token、可撤销、每次发布使用短时效凭证，且自动带 provenance。
- 陷阱记录：trusted publisher 配置中的 workflow 文件名必须与仓库内实际文件名完全一致（含 `.yml`），npm **不会**在保存配置时校验，错误只在真正发布时才暴露。
