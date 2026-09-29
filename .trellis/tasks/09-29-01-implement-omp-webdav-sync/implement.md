# Implementation Plan: OMP WebDAV Sync Plugin (`omp-webdav-sync`)

## 1. Ordered Checklist

### Task 1: Contracts & Configuration (`src/types.ts`, `src/config/manager.ts`)
- [x] 1.1 定义完整的 TypeScript 接口与类型契约（`WebDavConfig`, `SyncOptions`, `SyncStatus`, `MergeResult`, `FileEntry`, `VaultData`）。
- [x] 1.2 实现本地配置持久化管理器（读取/保存 `~/.omp/agent/.webdav-sync/config.json`，支持安全脱敏）。
- [x] 1.3 验证：编写配置管理单元测试并运行 `npm run typecheck`。

### Task 2: Storage Utilities & Backup (`src/storage/`)
- [x] 2.1 实现安全文件原子化写入工具 `file-utils.ts`（临时文件写入、安全替换、哈希与路径计算）。
- [x] 2.2 实现基线与快照备份管理器 `backup.ts`（记录上一次成功同步基线 `base/`，覆写前自动留存带有时间戳的 `backups/`）。
- [x] 2.3 验证：针对原子写入与备份轮转编写测试用例。

### Task 3: Native WebDAV Client (`src/webdav/`)
- [x] 3.1 实现轻量零依赖 PROPFIND XML 解析器 `xml-parser.ts`（提取 href、getcontentlength、getlastmodified、resourcetype）。
- [x] 3.2 实现原生 WebDAV 客户端 `client.ts`（基于 Node 22 原生 `fetch`，实现 PROPFIND、GET、PUT、MKCOL、DELETE，支持 Basic/Bearer 认证与递归目录初始化）。
- [x] 3.3 验证：针对 Mock WebDAV HTTP 交互编写单元测试，验证成功与 401/404/409 状态处理。

### Task 4: Encrypted Credentials Vault (`src/crypto/vault.ts`)
- [x] 4.1 实现基于 `node:crypto` 的 AES-256-GCM 加密与解密模块。
- [x] 4.2 实现 PBKDF2 强密钥派生（100,000 次哈希，随机盐），组装 `[salt][iv][tag][ciphertext]` 数据封包。
- [x] 4.3 验证：编写测试验证明文/密文转换、篡改检测及错误密码拒绝。

### Task 5: 3-Way Semantic Merge & Sidecar (`src/merge/`, `src/sidecar/`)
- [x] 5.1 实现结构化 JSON 3-Way 递归合并算法 `json-merge.ts`（字段级独立合并、同键冲突检测）。
- [x] 5.2 实现基于行差异的文本 3-Way 合并算法 `text-merge.ts`。
- [x] 5.3 实现合并调度入口 `semantic-merge.ts`，自动匹配文件类型与策略。
- [x] 5.4 实现机器特定配置隔离 `sidecar.ts`（根据主机名分流机器专属参数）。
- [x] 5.5 验证：编写 3-Way 合并测试（单方新增、双方互斥修改、同值修改、冲突场景）。

### Task 6: Sync Orchestration Engine (`src/sync/engine.ts`)
- [x] 6.1 实现同步协调引擎，组织完整同步流水线：
  - 检查服务端连通性；
  - 扫描本地待同步文件与远端文件清单；
  - 对比三方哈希与基线快照；
  - 执行拉取、3-Way 语义合并、本地备份与覆写；
  - 执行本地新增/修改文件的远端上传；
  - 更新基线快照。
- [x] 6.2 验证：编写模拟双端变更的集成测试验证完整同步流程。

### Task 7: OMP Plugin Surface & Commands (`src/index.ts`)
- [x] 7.1 注册 OMP 扩展指令 `/ompsync`，支持子命令分发：`status`, `sync`, `pull`, `push`, `config`, `test`。
- [x] 7.2 完善交互反馈与格式化输出，接入 `ctx.ui.notify`。
- [x] 7.3 验证：编译生成目标代码 `npm run build` 并验证扩展入口导出规范。

### Task 8: Quality Gates & Verification
- [x] 8.1 运行全套单元与集成测试：`npm test`。
- [x] 8.2 执行类型检查：`npm run typecheck`。
- [x] 8.3 执行代码清理与 Prettier 格式化（若配置）。

---

## 2. Validation Commands

```bash
# 类型检查
npm run typecheck

# 编译测试代码与运行 Node 22 原生测试套件
npm test

# 全量质检流程
npm run check
```

---

## 3. Review Gates & Rollback Points

- **Review Gate 1 (Phase 1.4 PRD Review)**：在进入 Phase 2 执行编码前，必须向用户汇报 PRD、技术设计与实施步骤，等待显式确认。
- **Review Gate 2 (Pre-Commit Review)**：在所有测试通过后、执行 git commit 前，必须向用户汇报变更范围与验证证据，获得显式确认后方可提交。
- **Rollback Points**：
  - 若同步过程中发生异常，本地由于预先在 `~/.omp/agent/.webdav-sync/backups/` 留存了快照，可通过还原备份快速回滚；
  - 代码变更采用 Git 工作区管控，如有不可恢复问题可快速重置。
