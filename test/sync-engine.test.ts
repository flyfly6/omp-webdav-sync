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
  const tmp = path.join(os.tmpdir(), `omp-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmp, { recursive: true });
  return tmp;
}

test("SyncEngine: End-to-end pull, push and bidirectional 3-way sync", async () => {
  // In-memory remote storage for mock WebDAV server
  const remoteStorage = new Map<string, string>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "PROPFIND") {
      let responsesXml = "";
      for (const [filePath, content] of remoteStorage.entries()) {
        responsesXml += `
  <D:response>
    <D:href>${filePath}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontentlength>${Buffer.byteLength(content)}</D:getcontentlength>
        <D:getlastmodified>${new Date().toUTCString()}</D:getlastmodified>
        <D:getetag>"mock-etag"</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/omp-sync/configs/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>${responsesXml}
</D:multistatus>`;

      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end(xml);
      return;
    }

    if (req.method === "MKCOL") {
      res.writeHead(201);
      res.end();
      return;
    }

    if (req.method === "GET") {
      if (remoteStorage.has(pathname)) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(remoteStorage.get(pathname));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
      return;
    }

    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        remoteStorage.set(pathname, body);
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

  try {
    const config: WebDavConfig = {
      url: webdavUrl,
      remotePath: "/omp-sync",
      syncFiles: ["settings.json", "config.yml"],
      conflictStrategy: "local-wins",
    };

    const engine = new SyncEngine(config, tempAgentDir);

    // 1. Initial push from local
    const localSettings = { theme: "dracula", fontSize: 14 };
    await fs.writeFile(path.join(tempAgentDir, "settings.json"), JSON.stringify(localSettings, null, 2), "utf-8");

    const pushReport = await engine.push();
    assert.equal(pushReport.pushed.length, 1);
    assert.equal(pushReport.pushed[0], "settings.json");

    assert.ok(remoteStorage.has("/omp-sync/configs/settings.json"));
    const stored = JSON.parse(remoteStorage.get("/omp-sync/configs/settings.json")!) as typeof localSettings;
    assert.equal(stored.theme, "dracula");

    // 2. Remote makes an update (e.g. from another device)
    const remoteSettings = { theme: "dracula", fontSize: 14, wordWrap: true };
    remoteStorage.set("/omp-sync/configs/settings.json", JSON.stringify(remoteSettings, null, 2));

    // Local also makes a non-conflicting change
    const updatedLocal = { theme: "dracula", fontSize: 16 };
    await fs.writeFile(path.join(tempAgentDir, "settings.json"), JSON.stringify(updatedLocal, null, 2), "utf-8");

    // 3. Run sync (3-way merge should combine fontSize: 16 and wordWrap: true)
    const syncReport = await engine.sync();
    assert.equal(syncReport.merged.length, 1);

    const mergedContent = await fs.readFile(path.join(tempAgentDir, "settings.json"), "utf-8");
    const merged = JSON.parse(mergedContent) as { theme: string; fontSize: number; wordWrap: boolean };
    assert.equal(merged.theme, "dracula");
    assert.equal(merged.fontSize, 16);
    assert.equal(merged.wordWrap, true);

    // Verify remote also updated to the merged result
    const remoteFinal = JSON.parse(remoteStorage.get("/omp-sync/configs/settings.json")!) as typeof merged;
    assert.equal(remoteFinal.fontSize, 16);
    assert.equal(remoteFinal.wordWrap, true);
  } finally {
    server.close();
    await fs.rm(tempAgentDir, { recursive: true, force: true });
  }
});
