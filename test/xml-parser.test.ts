import test from "node:test";
import assert from "node:assert/strict";
import { parseMultiStatusXml } from "../src/webdav/xml-parser.js";

test("XML Parser: Parses standard WebDAV multistatus response", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/omp-sync/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:getlastmodified>Mon, 29 Sep 2026 08:00:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/omp-sync/settings.json</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontentlength>1234</D:getcontentlength>
        <D:getlastmodified>Mon, 29 Sep 2026 08:30:00 GMT</D:getlastmodified>
        <D:getetag>"abcdef123456"</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

  const resources = parseMultiStatusXml(xml);
  assert.equal(resources.length, 2);

  const dir = resources[0];
  assert.equal(dir.href, "/omp-sync/");
  assert.equal(dir.isCollection, true);

  const file = resources[1];
  assert.equal(file.href, "/omp-sync/settings.json");
  assert.equal(file.isCollection, false);
  assert.equal(file.contentLength, 1234);
  assert.equal(file.etag, "abcdef123456");
  assert.ok(file.lastModified > 0);
});

test("XML Parser: Handles URL encoded hrefs and empty results", () => {
  const empty = parseMultiStatusXml("<xml>invalid</xml>");
  assert.equal(empty.length, 0);

  const xmlWithEncoding = `
<multistatus>
  <response>
    <href>/omp-sync/%E6%B5%8B%E8%AF%95.json</href>
    <propstat>
      <prop>
        <getcontentlength>50</getcontentlength>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

  const res = parseMultiStatusXml(xmlWithEncoding);
  assert.equal(res.length, 1);
  assert.equal(res[0].href, "/omp-sync/测试.json");
  assert.equal(res[0].contentLength, 50);
});
