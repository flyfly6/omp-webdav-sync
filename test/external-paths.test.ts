import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { resolveSyncEntry } from "../src/config/manager.js";
import { scanLocalFiles } from "../src/storage/file-utils.js";

async function createTempDir(): Promise<string> {
  const tmp = path.join(os.tmpdir(), `omp-external-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmp, { recursive: true });
  return tmp;
}

test("External paths: absolute and ~/ entries resolve outside agentDir", async () => {
  const agentDir = await createTempDir();
  const externalDir = await createTempDir();
  try {
    assert.deepEqual(resolveSyncEntry(agentDir, "settings.json"), {
      relPath: "settings.json",
      localPath: path.join(agentDir, "settings.json"),
    });

    const externalFile = path.join(externalDir, "AGENTS.md");
    await fs.writeFile(externalFile, "# global\n", "utf-8");
    assert.deepEqual(resolveSyncEntry(agentDir, externalFile), {
      relPath: "AGENTS.md",
      localPath: externalFile,
    });

    assert.deepEqual(resolveSyncEntry(agentDir, "~/.agents/AGENTS.md"), {
      relPath: "AGENTS.md",
      localPath: path.join(os.homedir(), ".agents", "AGENTS.md"),
    });

    // Escaping agentDir with ".." must not leak into the remote key
    assert.equal(resolveSyncEntry(agentDir, "../elsewhere/AGENTS.md").relPath, "AGENTS.md");

    const scanned = await scanLocalFiles(agentDir, [externalFile], ["*.tmp"]);
    assert.deepEqual(scanned.map(f => f.relativePath), ["AGENTS.md"]);
    assert.equal(scanned[0].size, "# global\n".length);

    const externalSkills = path.join(externalDir, "skills", "demo");
    await fs.mkdir(externalSkills, { recursive: true });
    await fs.writeFile(path.join(externalSkills, "SKILL.md"), "# demo", "utf-8");
    const dirScan = await scanLocalFiles(agentDir, [path.join(externalDir, "skills")], []);
    assert.deepEqual(dirScan.map(f => f.relativePath), ["skills/demo/SKILL.md"]);
  } finally {
    await fs.rm(agentDir, { recursive: true, force: true });
    await fs.rm(externalDir, { recursive: true, force: true });
  }
});
