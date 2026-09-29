import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { scanLocalFiles } from "../src/storage/file-utils.js";

async function createTempDir(): Promise<string> {
  const tmp = path.join(os.tmpdir(), `omp-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmp, { recursive: true });
  return tmp;
}

test("Skills Recursive: Scans multi-level nested skill files", async () => {
  const tempDir = await createTempDir();
  try {
    const skillA = path.join(tempDir, "skills", "web-search");
    const skillB = path.join(tempDir, "skills", "code-review", "templates");
    await fs.mkdir(skillA, { recursive: true });
    await fs.mkdir(skillB, { recursive: true });

    await fs.writeFile(path.join(skillA, "SKILL.md"), "# Web Search Skill", "utf-8");
    await fs.writeFile(path.join(skillA, "tool.py"), "print('search')", "utf-8");
    await fs.writeFile(path.join(skillB, "review.md"), "# Review Template", "utf-8");

    // Also a top-level file
    await fs.writeFile(path.join(tempDir, "settings.json"), "{}", "utf-8");

    const files = await scanLocalFiles(tempDir, ["settings.json", "skills/"], ["*.tmp"]);
    const relPaths = files.map(f => f.relativePath).sort();

    assert.ok(relPaths.includes("settings.json"));
    assert.ok(relPaths.includes("skills/web-search/SKILL.md"));
    assert.ok(relPaths.includes("skills/web-search/tool.py"));
    assert.ok(relPaths.includes("skills/code-review/templates/review.md"));
    assert.equal(relPaths.length, 4);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
