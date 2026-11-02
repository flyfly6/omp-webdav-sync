import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { FileEntry } from "../types.js";
import { resolveSyncEntry } from "../config/manager.js";

export async function atomicWriteFile(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}_${randomSuffix}`);
  try {
    await fs.writeFile(tempPath, content);
    try {
      await fs.rename(tempPath, filePath);
    } catch (renameErr: unknown) {
      if (renameErr && typeof renameErr === "object" && "code" in renameErr) {
        const code = renameErr.code;
        if (code === "EXDEV" || code === "EPERM" || code === "EBUSY") {
          await fs.copyFile(tempPath, filePath);
          await fs.unlink(tempPath);
          return;
        }
      }
      throw renameErr;
    }
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore temp cleanup error
    }
    throw err;
  }
}

export function computeHash(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function computeFileHash(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return computeHash(data);
  } catch {
    return null;
  }
}

export function matchSimplePattern(fileName: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const regexPattern = "^" + pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/\\\\]*") + "$";
    return new RegExp(regexPattern, "i").test(fileName);
  }
  return fileName.toLowerCase() === pattern.toLowerCase();
}

async function scanDirectory(
  dirPath: string,
  relBase: string,
  ignorePatterns: string[],
  results: FileEntry[],
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const isIgnored = ignorePatterns.some(pattern => matchSimplePattern(entryRel, pattern));
      if (isIgnored) {
        continue;
      }
      const fullFilePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(fullFilePath, entryRel, ignorePatterns, results);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullFilePath);
        const content = await fs.readFile(fullFilePath);
        results.push({
          relativePath: entryRel,
          hash: computeHash(content),
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
        });
      }
    }
  } catch {
    // Directory might not exist or be inaccessible
  }
}

export async function scanLocalFiles(
  agentDir: string,
  syncFiles: string[],
  ignorePatterns: string[] = [],
): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  for (const entry of syncFiles) {
    const { relPath, localPath } = resolveSyncEntry(agentDir, entry);
    if (!relPath) {
      continue;
    }
    const isIgnored = ignorePatterns.some(pattern => matchSimplePattern(relPath, pattern));
    if (isIgnored) {
      continue;
    }
    try {
      const stat = await fs.stat(localPath);
      if (stat.isDirectory()) {
        await scanDirectory(localPath, relPath, ignorePatterns, results);
      } else if (stat.isFile()) {
        const content = await fs.readFile(localPath);
        results.push({
          relativePath: relPath,
          hash: computeHash(content),
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
        });
      }
    } catch {
      // File or directory does not exist locally; continue
    }
  }
  return results;
}
