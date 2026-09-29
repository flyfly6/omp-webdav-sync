import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePathToTemplate,
  expandTemplateToPath,
  isPlatformMismatchedPath,
  extractMachineSidecar,
  applyMachineSidecar,
} from "../src/sidecar/sidecar.js";

test("Sidecar: Normalize path to ${HOME} template", () => {
  const fakeHome = "/Users/alice";
  const input = "/Users/alice/.local/bin/my-tool";
  const normalized = normalizePathToTemplate(input, fakeHome);
  assert.equal(normalized, "${HOME}/.local/bin/my-tool");

  // Non-home path remains untouched
  const globalPath = "/usr/local/bin/node";
  assert.equal(normalizePathToTemplate(globalPath, fakeHome), globalPath);
});

test("Sidecar: Expand ${HOME} template to local path", () => {
  const fakeHome = "/home/bob";
  const template = "${HOME}/.omp/bin/agent";
  const expanded = expandTemplateToPath(template, fakeHome);
  assert.ok(expanded.includes("/home/bob/.omp/bin/agent") || expanded.includes("\\home\\bob\\.omp\\bin\\agent"));
});

test("Sidecar: Detect platform mismatched paths", () => {
  const isWindows = process.platform === "win32";
  if (isWindows) {
    assert.equal(isPlatformMismatchedPath("/usr/local/bin/tool"), true);
    assert.equal(isPlatformMismatchedPath("C:\\Users\\alice\\bin\\tool.exe"), false);
  } else {
    assert.equal(isPlatformMismatchedPath("C:\\Program Files\\tool"), true);
    assert.equal(isPlatformMismatchedPath("/usr/local/bin/tool"), false);
  }
});

test("Sidecar: Extract and apply machine-specific overrides", () => {
  const original = {
    theme: "dark",
    fontSize: 14,
    "launcherPath.machine": "/custom/path/on/this/host",
  };

  const { shared, sidecar } = extractMachineSidecar(original, "test-box");
  assert.equal(shared.theme, "dark");
  assert.equal(shared["launcherPath.machine"], undefined);
  assert.equal(sidecar["launcherPath.machine"], "/custom/path/on/this/host");

  const reapplied = applyMachineSidecar(shared, sidecar);
  assert.deepEqual(reapplied, original);
});
