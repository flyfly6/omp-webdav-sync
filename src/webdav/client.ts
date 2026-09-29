import type { WebDavConfig } from "../types.js";
import { parseMultiStatusXml, type WebDavResource } from "./xml-parser.js";

export class WebDavError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(`WebDAV error (${statusCode}): ${message}`);
    this.name = "WebDavError";
  }
}

export class WebDavClient {
  private readonly baseUrl: string;
  private readonly rootPath: string;

  constructor(private readonly config: WebDavConfig) {
    this.baseUrl = config.url.replace(/\/+$/, "");
    this.rootPath = config.remotePath ? "/" + config.remotePath.replace(/^\/+|\/+$/g, "") : "/omp-sync";
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": "omp-webdav-sync/0.1.0",
    };
    if (this.config.bearerToken) {
      headers.Authorization = `Bearer ${this.config.bearerToken}`;
    } else if (this.config.username && this.config.password) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
      headers.Authorization = `Basic ${credentials}`;
    }
    return headers;
  }

  resolveUrl(subPath = ""): string {
    const cleanSubPath = subPath ? "/" + subPath.replace(/^\/+/, "") : "";
    return `${this.baseUrl}${this.rootPath}${cleanSubPath}`;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = this.resolveUrl();
      const res = await fetch(targetUrl, {
        method: "PROPFIND",
        headers: {
          ...this.getAuthHeaders(),
          Depth: "0",
        },
      });

      if (res.status === 401 || res.status === 403) {
        return { success: false, message: `认证失败: HTTP ${res.status} 未授权或禁止访问` };
      }
      if (res.status === 200 || res.status === 207) {
        return { success: true, message: `连接成功 (HTTP ${res.status})` };
      }
      if (res.status === 404) {
        // Remote sync path doesn't exist yet, but server is reachable
        return { success: true, message: `连接成功 (远端根目录尚未创建，将在同步时自动建立)` };
      }
      return { success: true, message: `服务器可达 (HTTP ${res.status})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `无法连接到 WebDAV 服务器: ${msg}` };
    }
  }

  async ensureDirectory(subPath = ""): Promise<void> {
    const cleanSub = subPath.replace(/^\/+|\/+$/g, "");
    const parts = (this.rootPath.replace(/^\/+|\/+$/g, "") + (cleanSub ? "/" + cleanSub : "")).split("/").filter(Boolean);

    let current = "";
    for (const part of parts) {
      current += "/" + part;
      const url = `${this.baseUrl}${current}`;
      try {
        const res = await fetch(url, {
          method: "MKCOL",
          headers: this.getAuthHeaders(),
        });
        // 201 = Created, 405 = Already exists, 301/302 = Redirect, 409 = Conflict
        if (![200, 201, 204, 301, 302, 405].includes(res.status)) {
          // If status is 409, might be parent folder issue, but we loop progressively
        }
      } catch {
        // Ignore single MKCOL network glitch if directory already exists
      }
    }
  }

  async listFiles(subPath = ""): Promise<WebDavResource[]> {
    const url = this.resolveUrl(subPath);
    const res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        ...this.getAuthHeaders(),
        Depth: "1",
      },
    });

    if (res.status === 404) {
      return [];
    }

    if (![200, 207].includes(res.status)) {
      throw new WebDavError(`PROPFIND 失败`, res.status, url);
    }

    const xml = await res.text();
    const resources = parseMultiStatusXml(xml);

    // Normalize paths relative to the requested directory
    const parsedTarget = new URL(url);
    const targetPath = parsedTarget.pathname.replace(/\/+$/, "");

    return resources.filter(r => {
      let rPath = r.href;
      if (rPath.startsWith("http://") || rPath.startsWith("https://")) {
        try {
          rPath = new URL(rPath).pathname;
        } catch {
          // Keep raw
        }
      }
      rPath = rPath.replace(/\/+$/, "");
      return rPath !== targetPath;
    });
  }

  async readFile(remoteFilePath: string): Promise<string | null> {
    const url = this.resolveUrl(remoteFilePath);
    const res = await fetch(url, {
      method: "GET",
      headers: this.getAuthHeaders(),
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new WebDavError(`读取文件失败`, res.status, url);
    }
    return await res.text();
  }

  async readBinaryFile(remoteFilePath: string): Promise<Buffer | null> {
    const url = this.resolveUrl(remoteFilePath);
    const res = await fetch(url, {
      method: "GET",
      headers: this.getAuthHeaders(),
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new WebDavError(`读取文件失败`, res.status, url);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async writeFile(remoteFilePath: string, content: string | Buffer): Promise<void> {
    const cleanRel = remoteFilePath.replace(/^\/+/, "");
    const lastSlash = cleanRel.lastIndexOf("/");
    if (lastSlash > 0) {
      const parentDir = cleanRel.slice(0, lastSlash);
      await this.ensureDirectory(parentDir);
    } else {
      await this.ensureDirectory();
    }

    const url = this.resolveUrl(remoteFilePath);
    const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        ...this.getAuthHeaders(),
        "Content-Type": "application/octet-stream",
      },
      body,
    });

    if (![200, 201, 204].includes(res.status)) {
      throw new WebDavError(`写入文件失败`, res.status, url);
    }
  }

  async deleteFile(remoteFilePath: string): Promise<void> {
    const url = this.resolveUrl(remoteFilePath);
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });

    if (![200, 204, 404].includes(res.status)) {
      throw new WebDavError(`删除文件失败`, res.status, url);
    }
  }
}
