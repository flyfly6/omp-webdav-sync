import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SyncManifest, FileEntry } from "../types.js";
import { atomicWriteFile, computeHash } from "./file-utils.js";
import { getConfigDir } from "../config/manager.js";

export function getBaseDir(agentDir?: string): string {
  return path.join(getConfigDir(agentDir), "base");
}

export function getBackupDir(agentDir?: string): string {
  return path.join(getConfigDir(agentDir), "backups");
}

export function getBaseManifestPath(agentDir?: string): string {
  return path.join(getConfigDir(agentDir), "base-manifest.json");
}

export async function readBaseManifest(agentDir?: string): Promise<SyncManifest | null> {
  try {
    const raw = await fs.readFile(getBaseManifestPath(agentDir), "utf-8");
    return JSON.parse(raw) as SyncManifest;
  } catch {
    return null;
  }
}

export async function writeBaseManifest(manifest: SyncManifest, agentDir?: string): Promise<void> {
  const filePath = getBaseManifestPath(agentDir);
  await atomicWriteFile(filePath, JSON.stringify(manifest, null, 2));
}

export async function readBaseFile(relPath: string, agentDir?: string): Promise<string | null> {
  const filePath = path.join(getBaseDir(agentDir), relPath);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeBaseFile(relPath: string, content: string | Buffer, agentDir?: string): Promise<void> {
  const filePath = path.join(getBaseDir(agentDir), relPath);
  await atomicWriteFile(filePath, content);
}

export async function backupLocalFile(relPath: string, agentDir?: string, timestamp?: number): Promise<string | null> {
  const targetDir = agentDir || path.dirname(getConfigDir(agentDir));
  const srcPath = path.join(targetDir, relPath);
  try {
    const content = await fs.readFile(srcPath);
    const ts = timestamp || Date.now();
    const backupTarget = path.join(getBackupDir(agentDir), String(ts), relPath);
    await atomicWriteFile(backupTarget, content);
    return backupTarget;
  } catch {
    return null;
  }
}

export async function pruneOldBackups(agentDir?: string, maxKeep = 10): Promise<void> {
  const backupRoot = getBackupDir(agentDir);
  try {
    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    const dirNames = entries
      .filter(e => e.isDirectory() && /^\d+$/.test(e.name))
      .map(e => Number.parseInt(e.name, 10))
      .sort((a, b) => b - a);

    if (dirNames.length > maxKeep) {
      const toRemove = dirNames.slice(maxKeep);
      for (const dirNum of toRemove) {
        await fs.rm(path.join(backupRoot, String(dirNum)), { recursive: true, force: true });
      }
    }
  } catch {
    // Backup directory might not exist yet; safe to ignore
  }
}

export async function updateBaseSnapshot(
  relPath: string,
  content: string | Buffer,
  agentDir?: string,
): Promise<FileEntry> {
  await writeBaseFile(relPath, content, agentDir);
  const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const hash = computeHash(buf);
  const entry: FileEntry = {
    relativePath: relPath,
    hash,
    size: buf.length,
    mtime: Date.now(),
  };

  const manifest = (await readBaseManifest(agentDir)) || {
    version: 1,
    lastSyncTime: Date.now(),
    files: {},
  };
  manifest.lastSyncTime = Date.now();
  manifest.files[relPath] = entry;
  await writeBaseManifest(manifest, agentDir);

  return entry;
}
