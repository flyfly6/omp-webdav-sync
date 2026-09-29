import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { FileEntry } from "../types.js";

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

export async function scanLocalFiles(
  agentDir: string,
  syncFiles: string[],
  ignorePatterns: string[] = [],
): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  for (const relPath of syncFiles) {
    const normalizedRel = relPath.replace(/[/\\]+/g, "/").replace(/^\/+/, "");
    const isIgnored = ignorePatterns.some(pattern => matchSimplePattern(normalizedRel, pattern));
    if (isIgnored) {
      continue;
    }
    const fullPath = path.join(agentDir, normalizedRel);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        const content = await fs.readFile(fullPath);
        results.push({
          relativePath: normalizedRel,
          hash: computeHash(content),
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
        });
      }
    } catch {
      // File does not exist locally; continue
    }
  }
  return results;
}
