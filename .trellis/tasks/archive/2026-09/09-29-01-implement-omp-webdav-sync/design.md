# Technical Design: OMP WebDAV Sync Plugin (`omp-webdav-sync`)

## 1. Architecture Overview

`omp-webdav-sync` 是作为 OMP / Pi Coding Agent 的扩展插件运行的纯 TypeScript / ESM 模块，旨在实现配置文件的多设备安全可靠同步。

```
┌──────────────────────────────────────────────────────────────┐
│                    OMP Extension Surface                     │
│                  Command: /ompsync <subcmd>                   │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                      Sync Orchestrator                       │
│    (Status / Pull / Push / Bidirectional 3-Way Sync)         │
└───────┬──────────────┬───────────────┬───────────────┬───────┘
        │              │               │               │
┌───────▼──────┐┌──────▼──────┐┌───────▼──────┐┌───────▼──────┐
│ WebDAV Client││3-Way Semantic││  Sidecar    ││ Encrypted    │
│  (Node fetch)││ Merge Engine ││  Isolation  ││ Credentials  │
│              ││ (JSON/Text)  ││ (Host-bound)││ (AES-256-GCM)│
└───────┬──────┘└─────────────┘└──────────────┘└───────┬──────┘
        │                                              │
┌───────▼──────────────────────────────────────────────▼──────┐
│                  Remote WebDAV Server (NAS)                  │
│   (/omp-sync/configs/..., /omp-sync/vault.enc, manifest)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Directory & Module Boundaries

```
src/
├── index.ts               # OMP 插件注册入口、命令分发与 UI 交互
├── types.ts               # 配置契约、同步状态、合并结果与清单类型
├── config/
│   └── manager.ts         # 本地配置存储 (~/.omp/agent/.webdav-sync/config.json)
├── webdav/
│   ├── client.ts          # 基于原生 fetch 的 WebDAV 客户端 (PROPFIND/GET/PUT/MKCOL/DELETE)
│   └── xml-parser.ts      # 轻量 PROPFIND XML 多状态响应解析器 (零外部依赖)
├── merge/
│   ├── semantic-merge.ts  # 3-Way 语义合并调度器
│   ├── json-merge.ts      # JSON 递归结构化 3-Way 合并
│   └── text-merge.ts      # 基于行块的内容 3-Way 合并
├── sidecar/
│   └── sidecar.ts         # 主机名探测与机器特有字段隔离
├── crypto/
│   └── vault.ts           # AES-256-GCM + PBKDF2 端到端加密与完整性认证
├── storage/
│   ├── backup.ts          # 同步前自动快照归档 (~/.webdav-sync/backups/)
│   └── file-utils.ts      # 原子写入 (tmp + rename)、哈希计算与路径规范
└── sync/
    └── engine.ts          # 同步协调引擎：拉取、合并、隔离、推送闭环
```

---

## 3. Data Flow & Sync Lifecycle

### 3.1 3-Way Semantic Merge Flow
1. **获取三方状态**：
   - `Base`: 本地存储的上次成功同步状态快照（`~/.omp/agent/.webdav-sync/base/`）。
   - `Local`: 当前本地工作目录中的实际文件（`~/.omp/agent/`）。
   - `Remote`: 从 WebDAV 远端拉取的最新文件内容。
2. **差异计算与决策矩阵**：
   | Local vs Base | Remote vs Base | 决策 | 说明 |
   | :--- | :--- | :--- | :--- |
   | 未变 | 未变 | 无需操作 | 本地与远端一致 |
   | 已变 | 未变 | 本地胜出 | 本地改动，直接推向远端并更新 Base |
   | 未变 | 已变 | 远端胜出 | 远端改动，直接拉取覆盖本地并更新 Base |
   | 已变 | 已变 (同一内容) | 收敛一致 | 两端做出了相同改动，直接更新 Base |
   | 已变 | 已变 (不同内容) | **3-Way 语义合并** | 递归解析合并各自修改的不同字段 |
3. **结构化合并策略**：
   - **JSON (`settings.json`, `mcp.json`)**：
     - 若键在 Local 新增且 Remote 未变：合并保留。
     - 若键在 Remote 新增且 Local 未变：合并保留。
     - 若键在两端同时修改为不同标量：默认触发冲突处理策略（支持 Local-first / Remote-first 配置，并输出警告）。
     - 若两端均修改为对象：向下递归 3-Way 合并。
   - **文本 (`AGENTS.md`)**：
     - 基于公共前缀/后缀与行块的差异检测，非重叠修改自动合并。

### 3.2 机器隔离 (Machine Sidecar)
- 机器特有字段（例如涉及本地路径、OS 参数等）由 `sidecar.ts` 根据当前机器 `os.hostname()` 自动提取或注入。
- 支持将主机专属配置存储在 `machines/<hostname>.json`，远端集中存放，同步时不覆盖其他机器的专属变量。

### 3.3 加密凭据库 (Vault)
- 凭据数据以 JSON 序列化，派生 AES-256-GCM 密钥：
  $$\text{Key} = \text{PBKDF2}(\text{password}, \text{salt}, 100000, 32, \text{sha256})$$
- 密文包结构：
  ```
  [ Salt: 16B ] [ IV: 12B ] [ AuthTag: 16B ] [ Ciphertext: NB ]
  ```
- 解密时验证 AuthTag，若密码错误或内容被篡改，抛出明确完整性校验异常。

---

## 4. Error Handling & Rollback Strategy

1. **写前快照备份**：在任何本地覆盖动作发生前，将目标文件以毫秒时间戳归档到 `~/.omp/agent/.webdav-sync/backups/<timestamp>/`。
2. **原子化文件写入**：使用 `fs.writeFile` 写入临时文件（`.tmp.<rand>`），完成并通过 `fs.rename` 原子替换原文件，杜绝写入中断导致的文件损坏。
3. **网络故障隔离**：WebDAV HTTP 请求遇到 4xx/5xx 或网络断开时，立即终止当前文件同步，保留本地原样，向用户汇报具体 HTTP 状态码与诊断建议。

---

## 5. Tradeoffs & Design Decisions

- **自研原生 WebDAV 客户端 vs 引入第三方重型库**：
  - *决策*：使用 Node.js 22 原生 `fetch` + 简易 XML 解析器。
  - *权衡*：避免引入包含数十个子依赖的第三方 WebDAV 库，降低包体积，杜绝依赖链漏洞，提升 Node.js ESM 兼容性与执行性能（符合 Ponytail 最小化设计准则）。
- **3-Way 合并 vs Git 分支合并**：
  - *决策*：在内存中执行语义化 3-Way 字典树合并，不调用本地 git 命令。
  - *权衡*：避免在 `~/.omp/agent` 中初始化不受控的 git 仓库引发锁定、未解决的冲突标记及潜在工作区污染。
