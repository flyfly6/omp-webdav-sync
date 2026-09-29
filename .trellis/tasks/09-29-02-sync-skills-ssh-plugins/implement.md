# Implementation Plan: Sync Skills, SSH Hosts, and Plugin Ecosystem

## 1. Ordered Checklist

### Task 1: Update Configuration Defaults (`src/config/manager.ts`, `src/types.ts`)
- [x] 1.1 更新默认同步清单 `DEFAULT_SYNC_FILES`，加入 `ssh.json` 与 `skills/`。
- [x] 1.2 在 `WebDavConfig` 与 `SyncReport` 中增加插件生态相关的可选字段（`syncPlugins?: boolean` 与 `newPluginsDetected?: string[]`）。
- [x] 1.3 验证：编译无类型报错 `npm run typecheck`。

### Task 2: Recursive Directory Discovery (`src/storage/file-utils.ts`)
- [x] 2.1 重构 `scanLocalFiles` 支持目录递归扫描：当目标路径为目录或以 `/` 结尾时，深度遍历其下所有常规文件。
- [x] 2.2 确保 `ignorePatterns` 正确过滤目录与子路径下的临时文件。
- [x] 2.3 验证：编写测试验证单文件与多层子目录文件混合扫描。

### Task 3: Entity-Aligned Array 3-Way Merge (`src/merge/json-merge.ts`)
- [x] 3.1 在 `json-merge.ts` 中实现识别实体主键（`host` / `id` / `name`）的数组 3-Way 合并算法。
- [x] 3.2 针对具有相同主键的对象条目进行深层属性 3-Way 合并，非冲突条目保留各自新增。
- [x] 3.3 验证：编写针对 `ssh.json` 结构的多主机增删改合并单元测试。

### Task 4: Plugin Ecosystem Synchronization (`src/sync/engine.ts`)
- [x] 4.1 在 `SyncEngine` 中引入 `pluginsDir`（`~/.omp/plugins/`）的安全定位与读写。
- [x] 4.2 实现 `package.json`（尤其是 `dependencies`）的 3-Way 语义合并与 `omp-plugins.lock.json` 的安全同步。
- [x] 4.3 检测新增插件并在同步报告与 UI 提示中输出运行指令建议。
- [x] 4.4 验证：编写针对插件清单 3-Way 合并与差集检测的测试。

### Task 5: Quality Gates & Full Verification
- [x] 5.1 运行全量单元测试与集成测试：`npm test`。
- [x] 5.2 执行类型检查：`npm run typecheck`。
- [x] 5.3 运行全量质检脚本：`npm run check`。

---

## 2. Validation Commands

```bash
# 类型检查
npm run typecheck

# 运行全量测试
npm test

# 全量质检流程
npm run check
```

---

## 3. Review Gates & Rollback Points

- **Review Gate (Phase 1.4 PRD Review)**：在调用 `task.py start` 与开始编码前，向用户汇报 PRD 与技术设计，等待显式确认。
- **Pre-Commit Review**：验证通过后向用户展示变更并请求提交确认。
