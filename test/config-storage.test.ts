import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadConfig, saveConfig, hasConfig, sanitizeConfig } from "../src/config/manager.js";
import { atomicWriteFile, computeHash } from "../src/storage/file-utils.js";
import { updateBaseSnapshot, readBaseFile, backupLocalFile } from "../src/storage/backup.js";

async function createTempDir(): Promise<string> {
  const tmp = path.join(os.tmpdir(), `omp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmp, { recursive: true });
  return tmp;
}

test("Config: Save and load configuration with defaults", async () => {
  const tempDir = await createTempDir();
  try {
    const existsBefore = await hasConfig(tempDir);
    assert.equal(existsBefore, false);

    await saveConfig(
      {
        url: "https://dav.example.com/files",
        username: "testuser",
        password: "secretpassword",
        encryptionPassword: "vaultpassword",
      },
      tempDir,
    );

    const existsAfter = await hasConfig(tempDir);
    assert.equal(existsAfter, true);

    const loaded = await loadConfig(tempDir);
    assert.ok(loaded);
    assert.equal(loaded.url, "https://dav.example.com/files");
    assert.equal(loaded.remotePath, "/omp-sync");
    assert.equal(loaded.conflictStrategy, "local-wins");

    const sanitized = sanitizeConfig(loaded);
    assert.equal(sanitized.passwordConfigured, true);
    assert.equal(sanitized.encryptionEnabled, true);
    assert.equal(sanitized.password, undefined);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("Storage: Atomic write and hash calculation", async () => {
  const tempDir = await createTempDir();
  try {
    const targetFile = path.join(tempDir, "sub", "test.txt");
    const content = "Hello atomic world!";
    await atomicWriteFile(targetFile, content);

    const readBack = await fs.readFile(targetFile, "utf-8");
    assert.equal(readBack, content);

    const hash = computeHash(content);
    assert.equal(hash.length, 64);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("Backup & Base: Manage base snapshots and local backups", async () => {
  const tempDir = await createTempDir();
  try {
    const relFile = "settings.json";
    const initialContent = JSON.stringify({ theme: "dark" });
    const localPath = path.join(tempDir, relFile);
    await fs.writeFile(localPath, initialContent, "utf-8");

    // Write base snapshot
    await updateBaseSnapshot(relFile, initialContent, tempDir);
    const readBase = await readBaseFile(relFile, tempDir);
    assert.equal(readBase, initialContent);

    // Make local backup
    const backupPath = await backupLocalFile(relFile, tempDir, 123456);
    assert.ok(backupPath);
    const backupContent = await fs.readFile(backupPath, "utf-8");
    assert.equal(backupContent, initialContent);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
