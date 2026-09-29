import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { WebDavConfig } from "../types.js";

const DEFAULT_SYNC_FILES = [
  "config.yml",
  "settings.json",
  "models.yml",
  "mcp.json",
  "AGENTS.md",
];

const DEFAULT_IGNORE_PATTERNS = [
  "*.db*",
  "*.bak",
  "*.tmp",
  "*.log",
  ".webdav-sync/**",
];

export function getDefaultAgentDir(): string {
  return path.join(os.homedir(), ".omp", "agent");
}

export function getConfigDir(agentDir?: string): string {
  const base = agentDir || getDefaultAgentDir();
  return path.join(base, ".webdav-sync");
}

export function getConfigPath(agentDir?: string): string {
  return path.join(getConfigDir(agentDir), "config.json");
}

export async function hasConfig(agentDir?: string): Promise<boolean> {
  try {
    await fs.access(getConfigPath(agentDir));
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(agentDir?: string): Promise<WebDavConfig | null> {
  const filePath = getConfigPath(agentDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<WebDavConfig>;
    if (!parsed.url) {
      return null;
    }
    return {
      url: parsed.url,
      username: parsed.username,
      password: parsed.password,
      bearerToken: parsed.bearerToken,
      remotePath: parsed.remotePath || "/omp-sync",
      encryptionPassword: parsed.encryptionPassword,
      conflictStrategy: parsed.conflictStrategy || "local-wins",
      syncFiles: parsed.syncFiles && parsed.syncFiles.length > 0 ? parsed.syncFiles : DEFAULT_SYNC_FILES,
      ignorePatterns: parsed.ignorePatterns || DEFAULT_IGNORE_PATTERNS,
      autoSyncOnStart: parsed.autoSyncOnStart ?? false,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: WebDavConfig, agentDir?: string): Promise<void> {
  const configDir = getConfigDir(agentDir);
  await fs.mkdir(configDir, { recursive: true });
  const filePath = getConfigPath(agentDir);
  const normalized: WebDavConfig = {
    url: config.url.replace(/\/+$/, ""),
    username: config.username,
    password: config.password,
    bearerToken: config.bearerToken,
    remotePath: config.remotePath ? "/" + config.remotePath.replace(/^\/+|\/+$/g, "") : "/omp-sync",
    encryptionPassword: config.encryptionPassword,
    conflictStrategy: config.conflictStrategy || "local-wins",
    syncFiles: config.syncFiles && config.syncFiles.length > 0 ? config.syncFiles : DEFAULT_SYNC_FILES,
    ignorePatterns: config.ignorePatterns || DEFAULT_IGNORE_PATTERNS,
    autoSyncOnStart: config.autoSyncOnStart ?? false,
  };
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf-8");
}

export function sanitizeConfig(config: WebDavConfig): Record<string, unknown> {
  return {
    url: config.url,
    username: config.username ? (config.username.length > 2 ? config.username[0] + "***" + config.username.slice(-1) : "***") : undefined,
    passwordConfigured: Boolean(config.password),
    bearerTokenConfigured: Boolean(config.bearerToken),
    remotePath: config.remotePath,
    encryptionEnabled: Boolean(config.encryptionPassword),
    conflictStrategy: config.conflictStrategy,
    syncFiles: config.syncFiles,
    autoSyncOnStart: config.autoSyncOnStart,
  };
}
