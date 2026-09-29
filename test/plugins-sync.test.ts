import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { SyncEngine } from "../src/sync/engine.js";
import type { WebDavConfig } from "../src/types.js";

async function createTempDir(): Promise<string> {
  const tmp = path.join(os.tmpdir(), `omp-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmp, { recursive: true });
  return tmp;
}

test("Plugins Sync: 3-way merge of package.json dependencies and detection of new plugins", async () => {
  const remoteStorage = new Map<string, string>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "PROPFIND") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"></D:multistatus>`);
      return;
    }
    if (req.method === "MKCOL") {
      res.writeHead(201);
      res.end();
      return;
    }
    if (req.method === "GET") {
      if (remoteStorage.has(pathname)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(remoteStorage.get(pathname));
      } else {
        res.writeHead(404);
        res.end();
      }
      return;
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        remoteStorage.set(pathname, Buffer.concat(chunks).toString("utf-8"));
        res.writeHead(201);
        res.end();
      });
      return;
    }
    res.writeHead(405);
    res.end();
  });

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const webdavUrl = `http://127.0.0.1:${port}`;

  const tempAgentDir = await createTempDir();
  const tempPluginsDir = path.join(tempAgentDir, "..", "plugins");
  await fs.mkdir(tempPluginsDir, { recursive: true });

  try {
    const config: WebDavConfig = {
      url: webdavUrl,
      syncFiles: ["settings.json"],
      syncPlugins: true,
    };

    const engine = new SyncEngine(config, tempAgentDir, tempPluginsDir);

    // Initial local package.json
    const initialPkg = {
      name: "omp-plugins",
      dependencies: {
        "omp-plugin-a": "^1.0.0",
      },
    };
    await fs.writeFile(path.join(tempPluginsDir, "package.json"), JSON.stringify(initialPkg, null, 2), "utf-8");

    // Push plugins to WebDAV
    await engine.push();
    assert.ok(remoteStorage.has("/omp-sync/plugins/package.json"));

    // Remote adds a new plugin "omp-plugin-b"
    const remotePkg = {
      name: "omp-plugins",
      dependencies: {
        "omp-plugin-a": "^1.0.0",
        "omp-plugin-b": "^2.0.0",
      },
    };
    remoteStorage.set("/omp-sync/plugins/package.json", JSON.stringify(remotePkg, null, 2));

    // Pull from WebDAV
    const pullReport = await engine.pull();
    assert.ok(pullReport.newPluginsDetected);
    assert.ok(pullReport.newPluginsDetected.includes("omp-plugin-b"));

    // Verify local package.json now has both plugins
    const mergedPkgContent = await fs.readFile(path.join(tempPluginsDir, "package.json"), "utf-8");
    const mergedPkg = JSON.parse(mergedPkgContent) as typeof remotePkg;
    assert.ok(mergedPkg.dependencies["omp-plugin-a"]);
    assert.ok(mergedPkg.dependencies["omp-plugin-b"]);
  } finally {
    server.close();
    await fs.rm(tempAgentDir, { recursive: true, force: true });
    await fs.rm(tempPluginsDir, { recursive: true, force: true });
  }
});
