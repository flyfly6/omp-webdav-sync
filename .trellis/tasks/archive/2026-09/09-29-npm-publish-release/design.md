# Design — npm 自动发布

## Boundaries

本任务只改发布链路，不碰运行时代码。涉及四个产物：

| 文件 | 性质 | 作用 |
| :--- | :--- | :--- |
| `.github/workflows/publish.yml` | 新增 | tag → 构建 → 校验 → 发布 |
| `package.json` | 修改 | 补 `repository` / `homepage` / `bugs` |
| `LICENSE` | 新增 | MIT 全文 |
| `package-lock.json` | 新增 | 供 `npm ci` 使用 |
| `README.md` | 修改 | Installation / Releasing / Trusted Publisher 配置说明 |

## 发布链路数据流

```
git push origin v0.1.0
        │
        ▼
GitHub Actions: push event (tags: v*)
        │  permissions: id-token: write
        ▼
OIDC token（aud = npm:registry.npmjs.org，短时效）
        │
        ▼
npm publish ──► npm registry
                 └─► 自动生成 provenance 证明（public repo + public 包 + trusted publishing）
```

## 关键契约

### 1. OIDC 身份绑定契约
npm 侧保存一份 trusted publisher 配置，字段必须与仓库实际值逐字匹配：

| npm 字段 | 值 | 匹配对象 |
| :--- | :--- | :--- |
| Organization or user | `flyfly6` | GitHub owner |
| Repository | `omp-webdav-sync` | 仓库名 |
| Workflow filename | `publish.yml` | `.github/workflows/publish.yml` 的**文件名** |
| Allowed actions | `npm publish` | 发布动作 |

**不对称点**：package 侧（`repository.url`）与 workflow 侧（`id-token: write`）都可以事后改；只有 npm 侧的 workflow 绑定是硬契约。npm 不在保存时校验，改名/改路径后只有等发布失败才发现。

### 2. 版本一致性契约
tag 名与 `package.json` 的 `version` 是两个独立输入，唯一的连接点是这个等式：

$$v_{\text{tag}} = v_{\text{package.json}} + \texttt{v}$$

不成立时，npm 上会出现一个与 git tag 标称版本永久错位的不可变版本号（npm 不允许覆盖已发布版本）。所以在 `npm publish` **之前**用一步 shell 校验，失败即中断：

```sh
[ "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME" ]
```

用 `node -p` 而不是 `jq`/`yq`：Node 已在 runner 上、零额外依赖，与项目 spec 的 stdlib-first 原则一致。

### 3. 构建产物契约
`npm publish` 依据 `package.json` 的 `files` 字段打包，不看 `.gitignore`。`files` 为 `["dist/**/*.js", "dist/**/*.d.ts", "README.md", "LICENSE"]`。

- `dist/` 与 `dist-test/` 都被 `.gitignore` 忽略，但 `files` 白名单是独立机制 —— `dist/` 会被打进 tarball（这是必须的，`main` 指向它），`dist-test/` 不会（不在 `files` 里）。
- `test/`、`.trellis/`、`.omp/` 不在 `files` 中，因此不会泄漏。
- `files` 用显式 glob 白名单而非 `!dist/**/*.map` 反向排除：两者实测都得到 29 个文件，glob 形式把"发布什么"一次写全，不必先枚举再逐个排除。
- **`.map` 与 `src/` 同进同退**：所有 `.js.map` / `.d.ts.map` 的 `sources` 都是 `["../src/index.ts"]` 且无 `sourcesContent`，map 本身不含源码，单独发布就是死引用。因此 `files` 同时排除二者（体积从 68 文件 213626 B 降到 29 文件 78935 B）。编译产物无任何运行时路径引用 `src/`，排除不影响运行。`tsconfig.json` 保留 `sourceMap` / `declarationMap`，本地开发照常产出 map。
- `prepare` 脚本在 `npm publish` 时自动执行 `npm run build`，重复构建无害；workflow 里仍显式跑 `npm run check` 以便在发布**之前**看到失败（否则构建失败会表现为发布中途失败，语义混乱）。

### 4. 认证契约
- 发布认证：纯 OIDC，仓库不存任何 secret。
- 依赖安装认证：项目只有公开依赖（`@oh-my-pi/pi-coding-agent`、`typescript`、`@types/node`），`npm ci` 不需要 `NODE_AUTH_TOKEN`。
- 若日后引入私有依赖，需另加一个 read-only token 装依赖，发布仍走 OIDC（两者独立）。

## Tradeoffs

| 决策 | 选择 | 理由 |
| :--- | :--- | :--- |
| 触发方式 | tag `v*` push | 一条命令，无需额外工具；changesets/semantic-release 是为多包 monorepo 设计的，单包场景纯属负担 |
| 认证 | OIDC | 免长期 token 泄露面，自动 provenance；代价是首版必须人工发布一次 |
| 构建质量门禁 | 发布 job 内 `npm run check` | 不额外开 CI workflow；发布前必然已跑过测试 |
| 版本管理工具 | 无 | tag 即版本；`npm version` 已够用 |
| 缓存 | 关闭（`package-manager-cache: false`） | npm 官方对发布构建的明确要求；缓存命中失败会污染 tarball |
| runner | 仅 `ubuntu-latest` | trusted publishing 不支持 self-hosted runner |
| actions 版本 | `checkout@v7` / `setup-node@v7` | 当前最新主版本（已通过 GitHub API 确认 latest tag 为 v7.0.1 / v7.0.0） |

## 首版发布的不可回避性

OIDC 要求包在 npm 上已存在才能配置 trusted publisher（npm/cli#8544，2025-09 提出，至今未修复）。因此首版路径必然是：

```
npm login  →  npm publish（本地，token + 2FA）  →  npmjs.com 配置 trusted publisher  →  之后全部走 OIDC
```

这不是设计缺陷，是 npm 侧的 UI 约束。必须在 README 中显式写明，否则第一次 `npm publish` 会以 ENEEDAUTH 失败。

## Rollout / Rollback

**发布**：`package.json` 改版本号 → 提交 → 打 tag → push tag。workflow 失败时 tag 已存在但版本未上线；修正后重打 tag 即可（尚未发布成功时 tag 可重推，发布成功后不可）。

**回滚**：npm 版本不可删除或覆盖。出问题只能 `npm deprecate <old> "<new>"` 指向修复版本，再发一个新的 patch。已推的 tag 不可撤销。因此版本一致性校验是最后一道防线。

**workflow 回滚**：`.github/workflows/publish.yml` 改坏时，npm 侧已配置的 workflow filename 绑定会失效（改文件名 = 换绑定）。改内容可以，改名不行。
