import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { loadConfig, saveConfig, sanitizeConfig } from "./config/manager.js";
import { SyncEngine } from "./sync/engine.js";
import { WebDavClient } from "./webdav/client.js";
import type { WebDavConfig } from "./types.js";

const SUBCOMMANDS = [
  { label: "status", description: "查看本地与 WebDAV 远端同步状态" },
  { label: "sync", description: "执行双向 3-Way 语义同步 (拉取 -> 合并 -> 推送)" },
  { label: "pull", description: "从 WebDAV 拉取远端变更并与本地合并" },
  { label: "push", description: "将本地配置与合并结果推送到 WebDAV" },
  { label: "test", description: "测试 WebDAV 服务器连接与读写权限" },
  { label: "config", description: "查看或设置 WebDAV 服务器配置" },
  { label: "help", description: "显示 ompsync 帮助说明" },
];

export default function webdavSyncExtension(pi: ExtensionAPI): void {
  pi.setLabel("OMP WebDAV Sync");

  // Optional background sync on session start
  pi.on("session_start", async () => {
    try {
      const config = await loadConfig();
      if (config?.autoSyncOnStart) {
        const engine = new SyncEngine(config);
        const report = await engine.sync();
        const changes = report.pulled.length + report.pushed.length + report.merged.length;
        if (changes > 0) {
          pi.logger.info(`[ompsync] 启动自同步完成: 拉取 ${report.pulled.length}, 推送 ${report.pushed.length}, 合并 ${report.merged.length}`);
        }
      }
    } catch (err) {
      pi.logger.warn(`[ompsync] 启动自同步失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const handler = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    const subcmd = tokens[0]?.toLowerCase() || "status";

    if (subcmd === "help") {
      const helpLines = [
        "OMP WebDAV Sync 命令帮助:",
        "  /ompsync status                 - 查看同步状态与文件差异",
        "  /ompsync sync                   - 执行双向 3-Way 语义合并同步",
        "  /ompsync pull                   - 仅拉取远端变更并合并至本地",
        "  /ompsync push                   - 仅推送本地改动至远端",
        "  /ompsync test                   - 测试 WebDAV 服务端连接",
        "  /ompsync config <url> [user] [pass] [path] - 配置 WebDAV 服务端",
      ];
      ctx.ui.notify(helpLines.join("\n"));
      return;
    }

    if (subcmd === "config") {
      const url = tokens[1];
      if (!url) {
        const current = await loadConfig();
        if (!current) {
          ctx.ui.notify("未配置 WebDAV。用法:\n/ompsync config <url> [username] [password] [remotePath]");
        } else {
          ctx.ui.notify(`当前 WebDAV 配置:\n${JSON.stringify(sanitizeConfig(current), null, 2)}`);
        }
        return;
      }

      const existing = (await loadConfig()) || { url };
      const newConfig: WebDavConfig = {
        ...existing,
        url,
        username: tokens[2] || existing.username,
        password: tokens[3] || existing.password,
        remotePath: tokens[4] || existing.remotePath || "/omp-sync",
      };

      await saveConfig(newConfig);
      ctx.ui.notify(`WebDAV 配置已保存！\n服务器: ${newConfig.url}\n路径: ${newConfig.remotePath}`);
      return;
    }

    const config = await loadConfig();
    if (!config) {
      ctx.ui.notify("尚未配置 WebDAV 远程信息，请先运行:\n/ompsync config <webdav-url> [username] [password]");
      return;
    }

    const engine = new SyncEngine(config);

    if (subcmd === "test") {
      ctx.ui.notify("正在测试 WebDAV 连接...");
      const client = new WebDavClient(config);
      const res = await client.testConnection();
      ctx.ui.notify(res.success ? `✅ ${res.message}` : `❌ ${res.message}`);
      return;
    }

    if (subcmd === "status") {
      ctx.ui.notify("正在获取 WebDAV 同步状态...");
      try {
        const status = await engine.getStatus();
        const lines = [
          `WebDAV 服务器: ${status.remoteUrl}`,
          `远端目录: ${status.remotePath}`,
          `上次同步: ${status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : "从未同步"}`,
          `本地受控文件: ${status.localFiles.length} 个`,
          `远端文件: ${status.remoteFiles.length} 个`,
          `本地有未推送改动: ${status.hasPendingLocalChanges ? "是" : "否"}`,
          `远端有未拉取改动: ${status.hasPendingRemoteChanges ? "是" : "否"}`,
        ];
        ctx.ui.notify(lines.join("\n"));
      } catch (err) {
        ctx.ui.notify(`获取状态失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (subcmd === "pull") {
      ctx.ui.notify("正在从 WebDAV 拉取配置并执行 3-Way 语义合并...");
      try {
        const report = await engine.pull();
        const msgLines = [
          `拉取完成:`,
          `  - 更新/拉取: ${report.pulled.length} 个文件 (${report.pulled.join(", ") || "无"})`,
          `  - 3-Way 合并: ${report.merged.length} 个文件 (${report.merged.join(", ") || "无"})`,
          `  - 冲突记录: ${report.conflicts.length} 处`,
          `  - 错误数: ${report.errors.length}`,
        ];
        if (report.newPluginsDetected && report.newPluginsDetected.length > 0) {
          msgLines.push(`  💡 检测到远端新增插件: ${report.newPluginsDetected.join(", ")} (建议运行 omp plugins install)`);
        }
        ctx.ui.notify(msgLines.join("\n"));
      } catch (err) {
        ctx.ui.notify(`拉取失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (subcmd === "push") {
      ctx.ui.notify("正在推送本地配置至 WebDAV...");
      try {
        const report = await engine.push();
        const msg = [
          `推送完成:`,
          `  - 上传文件: ${report.pushed.length} 个 (${report.pushed.join(", ") || "无"})`,
          `  - 远程合并: ${report.merged.length} 个 (${report.merged.join(", ") || "无"})`,
          `  - 错误数: ${report.errors.length}`,
        ].join("\n");
        ctx.ui.notify(msg);
      } catch (err) {
        ctx.ui.notify(`推送失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (subcmd === "sync") {
      ctx.ui.notify("正在执行双向 3-Way 语义同步...");
      try {
        const report = await engine.sync();
        const msgLines = [
          `双向同步完成:`,
          `  - 拉取: ${report.pulled.length} 个`,
          `  - 推送: ${report.pushed.length} 个`,
          `  - 语义合并: ${report.merged.length} 个`,
          `  - 冲突: ${report.conflicts.length} 处`,
          `  - 错误: ${report.errors.length}`,
        ];
        if (report.newPluginsDetected && report.newPluginsDetected.length > 0) {
          msgLines.push(`  💡 检测到远端新增插件: ${report.newPluginsDetected.join(", ")} (建议运行 omp plugins install)`);
        }
        ctx.ui.notify(msgLines.join("\n"));
      } catch (err) {
        ctx.ui.notify(`同步失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    ctx.ui.notify(`未知子命令: ${subcmd}。运行 /ompsync help 查看帮助。`);
  };

  pi.registerCommand("ompsync", {
    description: "Sync OMP config via private WebDAV with 3-way semantic merge",
    getArgumentCompletions: (prefix: string) => {
      const trimmed = prefix.trim();
      const matched = SUBCOMMANDS.filter(s => s.label.startsWith(trimmed));
      return matched.map(s => ({
        value: s.label,
        label: s.label,
        description: s.description,
      }));
    },
    handler,
  });
}
