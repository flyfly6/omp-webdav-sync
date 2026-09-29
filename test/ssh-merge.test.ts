import test from "node:test";
import assert from "node:assert/strict";
import { merge3Way } from "../src/merge/semantic-merge.js";

test("SSH Merge: Entity-aligned 3-way merge for ssh.json host array", () => {
  const base = JSON.stringify([
    { host: "prod", hostname: "10.0.0.1", user: "admin", port: 22 },
    { host: "dev", hostname: "192.168.1.5", user: "dev" },
  ], null, 2);

  // Local changes prod's user to 'deploy' and adds 'staging'
  const local = JSON.stringify([
    { host: "prod", hostname: "10.0.0.1", user: "deploy", port: 22 },
    { host: "dev", hostname: "192.168.1.5", user: "dev" },
    { host: "staging", hostname: "10.0.0.2", user: "qa" },
  ], null, 2);

  // Remote changes prod's port to 2222 and adds 'backup-box'
  const remote = JSON.stringify([
    { host: "prod", hostname: "10.0.0.1", user: "admin", port: 2222 },
    { host: "dev", hostname: "192.168.1.5", user: "dev" },
    { host: "backup-box", hostname: "10.0.0.99", user: "backup" },
  ], null, 2);

  const res = merge3Way("ssh.json", base, local, remote, "local-wins");
  assert.equal(res.hasConflicts, false);

  const merged = JSON.parse(res.mergedContent) as Array<{ host: string; user?: string; port?: number }>;
  assert.equal(merged.length, 4);

  const prod = merged.find(h => h.host === "prod");
  assert.ok(prod);
  assert.equal(prod.user, "deploy"); // Local change preserved
  assert.equal(prod.port, 2222); // Remote change merged

  const staging = merged.find(h => h.host === "staging");
  assert.ok(staging);

  const backup = merged.find(h => h.host === "backup-box");
  assert.ok(backup);
});

test("SSH Merge: Host deletion on one side is honored", () => {
  const base = JSON.stringify([
    { host: "keep", hostname: "1.1.1.1" },
    { host: "delete-me", hostname: "2.2.2.2" },
  ], null, 2);

  // Local deletes 'delete-me'
  const local = JSON.stringify([
    { host: "keep", hostname: "1.1.1.1" },
  ], null, 2);

  const remote = base;

  const res = merge3Way("ssh.json", base, local, remote, "local-wins");
  const merged = JSON.parse(res.mergedContent) as Array<{ host: string }>;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].host, "keep");
});
