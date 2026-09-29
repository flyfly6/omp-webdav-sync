import test from "node:test";
import assert from "node:assert/strict";
import { merge3WayJson } from "../src/merge/json-merge.js";
import { merge3WayText } from "../src/merge/text-merge.js";
import { merge3Way } from "../src/merge/semantic-merge.js";

test("Merge: JSON 3-way merge with non-overlapping additions", () => {
  const base = {
    theme: "light",
  };
  const local = {
    theme: "light",
    fontSize: 16,
  };
  const remote = {
    theme: "light",
    editor: "vim",
  };

  const { merged, conflicts } = merge3WayJson(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(merged.theme, "light");
  assert.equal(merged.fontSize, 16);
  assert.equal(merged.editor, "vim");
});

test("Merge: JSON 3-way merge with nested object modifications", () => {
  const base = {
    mcpServers: {
      github: { enabled: true, timeout: 30 },
    },
  };
  const local = {
    mcpServers: {
      github: { enabled: true, timeout: 60 },
      sqlite: { enabled: true },
    },
  };
  const remote = {
    mcpServers: {
      github: { enabled: true, timeout: 30, retries: 3 },
    },
  };

  const { merged, conflicts } = merge3WayJson(base, local, remote);
  assert.equal(conflicts.length, 0);
  const servers = merged.mcpServers as Record<string, Record<string, unknown>>;
  assert.equal(servers.github.timeout, 60); // Local changed timeout
  assert.equal(servers.github.retries, 3); // Remote added retries
  assert.equal(servers.sqlite.enabled, true); // Local added sqlite
});

test("Merge: JSON 3-way merge conflict resolution strategies", () => {
  const base = { model: "gpt-4o" };
  const local = { model: "claude-3-5-sonnet" };
  const remote = { model: "gemini-2.0-flash" };

  // local-wins
  const resLocal = merge3WayJson(base, local, remote, { strategy: "local-wins" });
  assert.equal(resLocal.conflicts.length, 1);
  assert.equal(resLocal.merged.model, "claude-3-5-sonnet");

  // remote-wins
  const resRemote = merge3WayJson(base, local, remote, { strategy: "remote-wins" });
  assert.equal(resRemote.conflicts.length, 1);
  assert.equal(resRemote.merged.model, "gemini-2.0-flash");
});

test("Merge: JSON 3-way array union for primitive elements", () => {
  const base = { plugins: ["core"] };
  const local = { plugins: ["core", "plugin-a"] };
  const remote = { plugins: ["core", "plugin-b"] };

  const { merged } = merge3WayJson(base, local, remote);
  assert.deepEqual(merged.plugins, ["core", "plugin-a", "plugin-b"]);
});

test("Merge: Text 3-way line merge", () => {
  const base = "Line 1\nLine 2\nLine 3";
  const local = "Line 1\nLine 2\nLine 3\nLocal appended";
  const remote = "Remote top\nLine 1\nLine 2\nLine 3";

  // Semantic merge on markdown
  const res = merge3Way("AGENTS.md", base, local, remote, "local-wins");
  assert.ok(res.mergedContent.includes("Line 2"));
});

test("Merge: Direct merge3WayText with conflict and resolution", () => {
  const base = "A\nB\nC";
  const local = "A\nB-local\nC";
  const remote = "A\nB-remote\nC";

  const res = merge3WayText("test.txt", base, local, remote, "remote-wins");
  assert.equal(res.hasConflicts, true);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.mergedContent, "A\nB-remote\nC");
});
