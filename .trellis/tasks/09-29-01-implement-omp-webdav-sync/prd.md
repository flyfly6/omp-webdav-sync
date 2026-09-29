# PRD: OMP WebDAV Sync Plugin (`omp-webdav-sync`)

## 1. Goal

为 OMP / Pi Coding Agent 提供一个安全、可靠的私有 WebDAV 配置同步插件，支持多设备间同步 `~/.omp/agent` 配置。通过 3-Way 语义合并（3-Way Semantic Merge）避免多端覆盖冲突，提供端到端加密保险库（`vault.enc`）保护敏感凭据，提供机器特定配置隔离（Sidecar Isolation），并以零本地 Git 锁和纯 Node.js 原生能力运行。

---

## 2. Requirements

### R1. WebDAV 客户端与连接管理
- **协议兼容**：基于 Node.js 22 内置 `fetch` 实现标准 WebDAV 协议动作（`PROPFIND`、`GET`、`PUT`、`MKCOL`、`DELETE`）。
- **认证机制**：支持 Basic Auth（用户名/密码）和可选 Bearer Token 认证。
- **路径与目录初始化**：远程支持指定根同步路径（默认 `/omp-sync`），初次连接时自动探测并递归创建远端所需目录结构。
- **连通性校验**：提供 `test` 动作，快速验证服务端连通性、凭据有效性与读写权限。

### R2. 3-Way 语义合并引擎（3-Way Semantic Merge）
- **基线快照管理**：每次同步成功后持久化记录基线快照（`base`），作为后续 3-Way 比较的基础。
- **状态差异检测**：精确识别 `Base vs Local`、`Base vs Remote` 的增删改状态。
- **结构化合并**：
  - JSON 文件（`settings.json`、`mcp.json` 等）：支持深层递归字段合并；不同字段的非冲突变更自动合并；数组支持并集/保留策略。
  - 键值与配置文本（`config.yml`、`models.yml` 等）：解析键值树进行语义级字段合并，避免纯文本行冲突。
  - 纯文本/规则文件（`AGENTS.md`）：基于内容块和行差异智能三方合并。
- **冲突策略**：同字段标量冲突时采用确定性策略（可配置 Remote 优先 / Local 优先 / 保留双副本标记），并向用户发出告警通知。

### R3. 机器特定配置隔离（Machine Sidecar Isolation）
- **设备差异隔离**：识别与具体机器强绑定的配置（如各操作系统的绝对路径、可执行文件命令、特定机器代理与端口）。
- **Sidecar 存储模式**：将机器特有字段抽离至 `machines/<hostname>.sidecar.json` 或独立字段空间，不覆盖其他异构设备配置。

### R4. 端到端加密保险库（Encrypted Credentials Vault）
- **加密算法**：采用行业标准 AES-256-GCM 认证加密。
- **密钥派生**：使用 PBKDF2（100,000 次迭代，HMAC-SHA256）配合随机生成 Salt。
- **密文格式**：封装 `salt (16B) + iv (12B) + authTag (16B) + ciphertext`，具备防篡改与完整性校验。
- **敏感数据保护**：支持将 API 密钥、身份令牌或敏感配置文件加密后同步至远程 `vault.enc`。

### R5. 插件命令与交互界面
- **注册指令**：注册 OMP 扩展命令 `/ompsync`，支持子命令：
  - `/ompsync status`：展示本地与远端同步状态、上次同步时间、修改文件列表。
  - `/ompsync sync`：执行拉取、语义合并与推送信令的双向同步闭环。
  - `/ompsync pull`：拉取远端变更并与本地合并。
  - `/ompsync push`：将本地变更推送到远端 WebDAV。
  - `/ompsync config`：配置 WebDAV 地址、认证凭据与加密密码。
  - `/ompsync test`：测试 WebDAV 服务器连接与权限。
- **通知与日志**：通过 `ctx.ui.notify` 呈现清晰的同步进度与合并结果提示。

### R6. 安全与防护机制
- **本地自动备份**：在覆盖或修改本地配置前，自动在本地备份目录保留时间戳快照。
- **原子性写入**：本地写文件采用临时文件写入后再重命名机制，避免中断导致文件损坏。
- **零 Git 干扰**：完全独立于本地 Git 仓库，杜绝 Git 锁、分支混乱和后台意外提交。

---

## 3. Constraints

- **运行环境**：Node.js >= 22，TypeScript 5.7+，ESM 模块规范。
- **依赖控制**：遵循最小依赖（Ponytail 准则），网络与加密全面利用 Node 22 内置 `fetch` 与 `node:crypto`，避免庞大且脆弱的外部 WebDAV 库。
- **类型安全**：严格遵循 TypeScript 严格模式，编译无错误。
- **零破坏性**：绝不静默覆盖未备份的本地修改。

---

## 4. Acceptance Criteria

- [x] **AC1 (WebDAV 客户端)**：可成功通过 HTTP WebDAV 执行 PROPFIND、GET、PUT、MKCOL，正确处理认证及异常状态码（401, 404, 409 等）。
- [x] **AC2 (3-Way 语义合并)**：
  - Base vs Local vs Remote 3-Way 比较逻辑准确。
  - JSON 对象的独立字段变更自动合并且无数据丢失。
  - 冲突修改能够按照预设策略安全处理并记录通知。
- [x] **AC3 (Sidecar 隔离)**：机器专属配置正确存取，不同主机标识（hostname）配置独立不互相覆盖。
- [x] **AC4 (加密保险库)**：
  - 正确完成明文到 `vault.enc` 的 AES-256-GCM 加密与解密回环。
  - 密码错误或密文被篡改时能明确报错拒绝解密。
- [x] **AC5 (OMP 插件命令)**：`ompsync` 命令及 `status/sync/pull/push/config/test` 完整注册并正常执行，交互提示清晰。
- [x] **AC6 (备份与原子写入)**：合并变更前本地生成备份，写入失败不损坏原文件。
- [x] **AC7 (测试套件)**：所有单元测试与集成测试（涵盖 WebDAV、合并、加密、Sidecar、命令）在 `npm test` 中全部通过。
