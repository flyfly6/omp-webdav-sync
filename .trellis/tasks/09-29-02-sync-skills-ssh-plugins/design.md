# Technical Design: Sync Skills, SSH Hosts, and Plugin Ecosystem

## 1. Architecture Enhancements

本次扩展在现有同步内核的基础上进行三项核心增强：

```
                      SyncEngine
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
1. 递归目录扫描      2. 键对齐 3-Way 合并    3. 跨目录插件生态
 (skills/**)          (ssh.json: host)       (~/.omp/plugins/)
```

---

## 2. Detailed Technical Design

### 2.1 递归目录扫描与文件发现 (`src/storage/file-utils.ts`)
- **现状**：当前 `scanLocalFiles` 仅针对单一文件路径进行 `fs.stat`。
- **增强**：
  - 当 `syncFiles` 中包含以 `/` 结尾的目录名（如 `skills/`）或实际检测到该路径为目录时，启动递归扫描流程 `scanDirectoryRecursive(fullPath, relBase)`；
  - 过滤 `ignorePatterns`（如 `.git`, `node_modules`, `*.tmp` 等）；
  - 将所有子孙文件（如 `skills/my-skill/SKILL.md`）展平为相对路径条目纳入待同步集合。
  - 远端同样支持针对 `configs/skills/` 的多级 PROPFIND 列举。

### 2.2 实体对齐的数组 3-Way 语义合并 (`src/merge/json-merge.ts`)
- **问题**：`ssh.json` 通常由主机对象数组组成：
  ```json
  [
    { "host": "prod-server", "hostname": "10.0.0.1", "user": "root" },
    { "host": "dev-box", "hostname": "192.168.1.100", "identityFile": "~/.ssh/id_ed25519" }
  ]
  ```
  如果简单使用数组求并或覆盖，会导致修改同名主机的不同字段时产生重复项或覆盖丢失。
- **方案**：
  - 在 `json-merge.ts` 中引入**实体标识识别器**（Key Identifier Recognition）。
  - 若数组项均为对象且均包含主键属性（优先级：`host` > `id` > `name` > `key`）：
    1. 将数组映射为以主键为 Index 的实体 Map；
    2. 基于 Base、Local、Remote 对具有相同主键的实体递归执行 3-Way 对象合并；
    3. 保留各自新增的独立主机实体，剔除已明确删除的主机；
    4. 序列化回数组结构。

### 2.3 插件生态清单跨目录同步 (`src/sync/engine.ts`)
- **路径解析**：
  - 核心配置位于 `agentDir`（`~/.omp/agent/`）。
  - 插件生态位于 `pluginsDir = path.resolve(agentDir, "..", "plugins")`。
- **同步范围**：
  - `package.json`（已安装插件声明）；
  - `omp-plugins.lock.json`（插件版本锁定）；
- **通知机制**：
  - 同步引擎在拉取插件清单后，对比本地拉取前后的 `dependencies` 差集；
  - 若发现远端有新增插件，在 `SyncReport` 中返回并在 UI 通知中高亮提示用户执行插件更新。

---

## 3. Compatibility & Tradeoffs

- **向前兼容性**：不改变 `WebDavConfig` 结构，默认配置扩展为包括 `skills/`、`ssh.json` 以及启用插件同步开关。
- **文件体积与安全**：Skills 与 Plugins 清单均为轻量文本/JSON 文件，单次同步增量在几十 KB 范围内，性能影响微乎其微。
