# Implementation Plan

## Step 1 — LICENSE（MIT）

新建 `LICENSE`，标准 MIT 全文，版权行 `Copyright (c) 2026 flyfly6`。

验证：文件存在，内容含 "MIT License" 与 "flyfly6"。

## Step 2 — package.json 元数据

在 `package.json` 中新增三个字段（位置放在 `license` 之后、`author` 附近，保持可读）：

```json
"repository": { "type": "git", "url": "git+https://github.com/flyfly6/omp-webdav-sync.git" },
"homepage": "https://github.com/flyfly6/omp-webdav-sync#readme",
"bugs": { "url": "https://github.com/flyfly6/omp-webdav-sync/issues" }
```

注意 `repository.url` 用 `git+https://` 前缀（npm 标准写法，npm 会剥离 `git+` 前缀），但**在 README 中写给用户的 URL 用纯 `https://`**。npm 要求该字段指向 GitHub 仓库，格式前缀不影响匹配。

不改 `version`（保持 `0.1.0`，首版发布用），不改 `files` / `main` / `types` / `omp` / `pi` / `scripts` / 依赖。

验证：`node -p "require('./package.json').repository.url"` 输出预期 URL。

## Step 3 — 锁文件

运行 `npm install --package-lock-only` 生成 `package-lock.json`（不重装 node_modules，最快）。

确认 `.gitignore` 未忽略 `package-lock.json`（当前忽略列表为 `node_modules/`、`dist/`、`dist-test/`、`*.tsbuildinfo`、`.DS_Store`、`*.log` 等，不含锁文件）。

验证：文件存在且 `node -p "require('./package-lock.json').lockfileVersion"` 为 3。

## Step 4 — .github/workflows/publish.yml

新建文件，内容：

```yaml
name: Publish Package

on:
  push:
    tags:
      - 'v*'

permissions:
  id-token: write
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false
      - run: npm ci
      - run: npm run check
      - name: Verify tag matches package version
        run: '[ "v$(node -p "require(\"./package.json\").version")" = "$GITHUB_REF_NAME" ]'
      - run: npm publish
```

设计要点：
- `npm run check` = `npm run typecheck && npm test`，后者已含 `build` + `build:test` + 全量测试，一步覆盖质量门禁。
- 版本校验用 `node -p` 而非 `jq`（stdlib-first，无额外依赖）。
- 校验放在 `npm publish` **之前**：版本错位不可修复，必须在发布前拦截。
- 不加 `--provenance`：trusted publishing + public repo + public 包时 npm 自动生成。
- 不加 `workflow_dispatch`：触发方式已定为 tag push。

验证：用 Node 解析 YAML 结构（本地无 yaml 依赖，用 `python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/publish.yml'))"` 或等价方式），确认能解析为合法 YAML 且含 `id-token: write`。

## Step 5 — README

在现有 `## Features` 之后、`## License` 之前插入两节：

**Installation**

```bash
npm install omp-webdav-sync
```

并说明作为 Oh My Pi 插件加载（`omp.extensions` 指向 `./dist/index.js`），以及 peer 依赖 `@oh-my-pi/pi-coding-agent`。

**Releasing**

写清完整流程与一次性前置步骤：
1. 首次发布（OIDC 无法创建新包，必须本地发）：
   ```bash
   npm login
   npm publish
   ```
2. 在 npmjs.com → 包页面 → Settings → Trusted Publisher → GitHub Actions 配置：
   - Organization or user: `flyfly6`
   - Repository: `omp-webdav-sync`
   - Workflow filename: `publish.yml`（只填文件名，含 `.yml`，不要填完整路径）
   - Environment name: 留空
   - Allowed actions: **必须勾选 `npm publish`**（2026-09-03 后新建配置默认只允许 `npm stage publish`）
3. 后续发布：
   ```bash
   npm version patch   # 或 minor / major
   git push origin main --follow-tags
   ```
4. （可选加固）Publishing access → "Require two-factor authentication and disallow tokens"

## Step 6 — 验证

按顺序执行，全部必须通过：

1. `npm run check` — typecheck 0 错误 + 全量测试通过。
2. `npm pack --dry-run` — 检查 tarball 文件清单：`dist/index.js`、`dist/index.d.ts`、`package.json`、`README.md`、`LICENSE` 在内；`test/`、`dist-test/`、`.trellis/`、`.omp/` 不在内。
3. YAML 解析验证 workflow 合法。
4. 版本一致性校验的本地等价验证（模拟 tag）：手动跑一次 Step 4 中的校验命令，确认与当前 `0.1.0` + `v0.1.0` 匹配，且在故意改成 `v9.9.9` 时失败。
5. `git status` 确认未意外改动 `src/`。

## Step 7 — 提交

按全局规则，**提交前必须向用户汇报变更范围与验证结果并获得明确确认**。用户未确认前不执行 `git add` / `git commit`。

## 不做的事

- 不新建 PR 检查用的 CI workflow。
- 不引入 changesets / semantic-release。
- 不改 `src/` 任何代码。
- 不执行 `git push`（推 tag 与提交由用户决定）。
