# PRD: Sync Skills, SSH Hosts, and Plugin Ecosystem

## 1. Goal

扩展 `omp-webdav-sync` 插件的能力，增加对用户自定义技能库（`skills/` 目录递归同步）、SSH 主机配置文件（`ssh.json` 3-Way 语义合并）以及已安装插件生态清单（`~/.omp/plugins/package.json` 与 `omp-plugins.lock.json`）的跨设备同步支持，实现 OMP 生产力环境与扩展生态的全面无缝迁移。

---

## 2. Requirements

### R1. Skills 目录递归扫描与同步 (`skills/**`)
- **递归文件发现**：支持在待同步规则中指定目录（如 `skills/`），自动递归扫描所有子目录下的文件（如 `skills/<name>/SKILL.md`、辅助脚本与模板）。
- **3-Way 语义合并**：
  - Markdown/脚本文件基于内容行差异进行 3-Way 合并。
  - 结构化 JSON 辅助文件执行 JSON 递归合并。
- **单侧增删处理**：某台设备新编写的 Skill 自动推送到 WebDAV 并同步至其他设备；支持双端不同 Skill 的自动汇总合并。

### R2. SSH 主机配置 3-Way 语义合并 (`ssh.json`)
- **配置文件纳入**：默认包含 `~/.omp/agent/ssh.json` 的同步。
- **主机标识对齐合并**：针对 SSH 映射表（包含 `host`, `hostname`, `user`, `port`, `identityFile` 等字段），按主键 `host` 进行深层字段级 3-Way 语义合并。
- **路径模板化**：`identityFile` 等私钥路径自动执行 `${HOME}` 路径模板折叠与展开，适配 Mac/Windows/Linux 不同的主目录与私钥位置。

### R3. 插件生态清单同步 (`~/.omp/plugins/`)
- **生态清单感知**：定位并同步 `~/.omp/plugins/package.json` 与 `omp-plugins.lock.json`。
- **插件依赖并集求取**：对 `package.json` 中的 `dependencies` 执行 3-Way 语义合并，保证 A 设备安装的插件与 B 设备安装的插件在同步后自动汇总为完整列表。
- **变更感知与提示**：当拉取到新的插件依赖时，在同步完成报告与通知中明确提示用户运行插件恢复或刷新命令。

---

## 3. Constraints

- **向前兼容**：保持现有 `WebDavConfig` 契约兼容，不破坏现有用户的同步规则与配置结构。
- **安全性与防损坏**：新增文件与目录同样享受本地时间戳备份机制（`backups/`）与原子写入保障。
- **依赖控制**：全面采用原生 Node.js API，不引入外部第三方大依赖。

---

## 4. Acceptance Criteria

- [x] **AC1 (Skills 递归同步)**：`skills/` 目录下多层嵌套的技能文件能被正确扫描、上传、下载，并在冲突时调用 3-Way 合并。
- [x] **AC2 (SSH 主机合并)**：`ssh.json` 中的主机条目在两端独立增改时能够以 `host` 为粒度正确合并，且路径参数自动折叠/展开 `${HOME}`。
- [x] **AC3 (插件生态清单合并)**：`plugins/package.json` 中的插件依赖能正确做 3-Way 语义合并，并在合并或更新后给出用户提示。
- [x] **AC4 (测试验证)**：新增针对 Skills 目录递归、SSH 主机合并、插件清单同步的完整单元测试与集成测试，`npm run check` 100% 通过。
