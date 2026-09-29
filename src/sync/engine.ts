import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { WebDavConfig, SyncReport, SyncStatus, FileEntry } from "../types.js";
import { getDefaultAgentDir } from "../config/manager.js";
import { WebDavClient } from "../webdav/client.js";
import { scanLocalFiles, atomicWriteFile } from "../storage/file-utils.js";
import {
  readBaseFile,
  readBaseManifest,
  updateBaseSnapshot,
  backupLocalFile,
  pruneOldBackups,
} from "../storage/backup.js";
import { merge3Way } from "../merge/semantic-merge.js";
import {
  getMachineIdentifier,
  normalizePathToTemplate,
  expandTemplateToPath,
} from "../sidecar/sidecar.js";
import { encryptVault, decryptVault } from "../crypto/vault.js";

export class SyncEngine {
  private readonly agentDir: string;
  private readonly pluginsDir: string;
  private readonly client: WebDavClient;

  constructor(
    private readonly config: WebDavConfig,
    agentDir?: string,
    pluginsDir?: string,
  ) {
    this.agentDir = agentDir || getDefaultAgentDir();
    this.pluginsDir = pluginsDir || path.resolve(this.agentDir, "..", "plugins");
    this.client = new WebDavClient(config);
  }

  private async getRemoteFileList(): Promise<FileEntry[]> {
    try {
      const resources = await this.client.listAllFilesRecursive("configs");
      const configsUrl = new URL(this.client.resolveUrl("configs"));
      const configsPath = configsUrl.pathname.replace(/\/+$/, "");

      return resources
        .filter(r => !r.isCollection)
        .map(r => {
          let href = r.href;
          if (href.startsWith("http://") || href.startsWith("https://")) {
            try {
              href = new URL(href).pathname;
            } catch {
              // keep raw
            }
          }
          href = href.replace(/\/+$/, "");
          let rel = href;
          if (rel.startsWith(configsPath)) {
            rel = rel.slice(configsPath.length).replace(/^\/+/, "");
          }
          return {
            relativePath: rel,
            hash: r.etag || "",
            size: r.contentLength,
            mtime: r.lastModified,
            etag: r.etag,
          };
        });
    } catch {
      return [];
    }
  }

  private async getEffectiveFileList(): Promise<string[]> {
    const syncPatterns = this.config.syncFiles || [];
    const localFiles = await scanLocalFiles(this.agentDir, syncPatterns, this.config.ignorePatterns);
    const remoteFiles = await this.getRemoteFileList();

    const fileSet = new Set<string>();
    for (const f of localFiles) {
      fileSet.add(f.relativePath);
    }
    for (const f of remoteFiles) {
      fileSet.add(f.relativePath);
    }
    return Array.from(fileSet);
  }

  async getStatus(): Promise<SyncStatus> {
    const syncFiles = this.config.syncFiles || [];
    const localFiles = await scanLocalFiles(this.agentDir, syncFiles, this.config.ignorePatterns);
    const baseManifest = await readBaseManifest(this.agentDir);
    const remoteFiles = await this.getRemoteFileList();

    const baseFiles = baseManifest?.files || {};

    const hasPendingLocalChanges = localFiles.some(local => {
      const base = baseFiles[local.relativePath];
      return !base || base.hash !== local.hash;
    });

    const hasPendingRemoteChanges = remoteFiles.some(remote => {
      const base = baseFiles[remote.relativePath];
      return !base || (remote.hash && base.hash !== remote.hash);
    });

    return {
      lastSyncTime: baseManifest?.lastSyncTime ?? null,
      remoteUrl: this.config.url,
      remotePath: this.config.remotePath || "/omp-sync",
      localFiles,
      remoteFiles,
      hasPendingLocalChanges,
      hasPendingRemoteChanges,
    };
  }

  async pull(): Promise<SyncReport> {
    const report: SyncReport = {
      timestamp: Date.now(),
      pulled: [],
      pushed: [],
      merged: [],
      conflicts: [],
      unchanged: [],
      errors: [],
    };

    const effectiveFiles = await this.getEffectiveFileList();
    for (const relPath of effectiveFiles) {
      try {
        const remoteContent = await this.client.readFile(`configs/${relPath}`);
        if (remoteContent === null) {
          continue; // Remote does not have this file
        }

        const expandedRemote = expandTemplateToPath(remoteContent);
        const localPath = path.join(this.agentDir, relPath);
        let localContent: string | null = null;
        try {
          localContent = await fs.readFile(localPath, "utf-8");
        } catch {
          // File does not exist locally
        }

        const baseContent = await readBaseFile(relPath, this.agentDir);

        if (localContent === null) {
          // First time download: write directly
          await atomicWriteFile(localPath, expandedRemote);
          await updateBaseSnapshot(relPath, expandedRemote, this.agentDir);
          report.pulled.push(relPath);
        } else if (localContent === expandedRemote) {
          report.unchanged.push(relPath);
        } else if (baseContent !== null && localContent === baseContent) {
          // Local unchanged, remote updated
          await backupLocalFile(relPath, this.agentDir, report.timestamp);
          await atomicWriteFile(localPath, expandedRemote);
          await updateBaseSnapshot(relPath, expandedRemote, this.agentDir);
          report.pulled.push(relPath);
        } else {
          // 3-way merge needed
          const mergeResult = merge3Way(
            relPath,
            baseContent,
            localContent,
            expandedRemote,
            this.config.conflictStrategy,
          );

          await backupLocalFile(relPath, this.agentDir, report.timestamp);
          await atomicWriteFile(localPath, mergeResult.mergedContent);
          await updateBaseSnapshot(relPath, expandedRemote, this.agentDir);

          if (mergeResult.hasConflicts) {
            report.conflicts.push(...mergeResult.conflicts);
          }
          report.merged.push(relPath);
        }
      } catch (err) {
        report.errors.push({
          path: relPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Pull vault if configured
    if (this.config.encryptionPassword) {
      try {
        const vaultEnc = await this.client.readBinaryFile("vault.enc");
        if (vaultEnc) {
          const decrypted = decryptVault(vaultEnc, this.config.encryptionPassword);
          const vaultLocalPath = path.join(this.agentDir, ".webdav-sync", "vault.json");
          await atomicWriteFile(vaultLocalPath, decrypted);
        }
      } catch (err) {
        report.errors.push({
          path: "vault.enc",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Pull machine-specific sidecar if present
    try {
      const machineId = getMachineIdentifier();
      const remoteSidecar = await this.client.readFile(`machines/${machineId}.json`);
      if (remoteSidecar !== null) {
        const sidecarLocalPath = path.join(this.agentDir, ".webdav-sync", `sidecar-${machineId}.json`);
        await atomicWriteFile(sidecarLocalPath, remoteSidecar);
      }
    } catch {
      // Sidecar not present on remote
    }

    // Pull plugins if configured
    if (this.config.syncPlugins !== false) {
      await this.pullPlugins(report);
    }

    await pruneOldBackups(this.agentDir);
    return report;
  }

  async push(): Promise<SyncReport> {
    const report: SyncReport = {
      timestamp: Date.now(),
      pulled: [],
      pushed: [],
      merged: [],
      conflicts: [],
      unchanged: [],
      errors: [],
    };

    const effectiveFiles = await this.getEffectiveFileList();
    for (const relPath of effectiveFiles) {
      try {
        const localPath = path.join(this.agentDir, relPath);
        let localContent: string;
        try {
          localContent = await fs.readFile(localPath, "utf-8");
        } catch {
          continue; // File doesn't exist locally
        }

        const normalizedLocal = normalizePathToTemplate(localContent);
        const baseContent = await readBaseFile(relPath, this.agentDir);
        const remoteContent = await this.client.readFile(`configs/${relPath}`);

        if (remoteContent !== null && baseContent !== null && remoteContent !== baseContent && remoteContent !== normalizedLocal) {
          // Remote also changed: 3-way merge before push
          const mergeResult = merge3Way(
            relPath,
            baseContent,
            normalizedLocal,
            remoteContent,
            this.config.conflictStrategy,
          );

          if (mergeResult.hasConflicts) {
            report.conflicts.push(...mergeResult.conflicts);
          }

          // Write merged back to remote and local
          await this.client.writeFile(`configs/${relPath}`, mergeResult.mergedContent);
          const expandedMerged = expandTemplateToPath(mergeResult.mergedContent);
          await backupLocalFile(relPath, this.agentDir, report.timestamp);
          await atomicWriteFile(localPath, expandedMerged);
          await updateBaseSnapshot(relPath, expandedMerged, this.agentDir);
          report.merged.push(relPath);
        } else {
          // Clean push
          await this.client.writeFile(`configs/${relPath}`, normalizedLocal);
          await updateBaseSnapshot(relPath, localContent, this.agentDir);
          report.pushed.push(relPath);
        }
      } catch (err) {
        report.errors.push({
          path: relPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Push machine-specific sidecar if present locally
    try {
      const machineId = getMachineIdentifier();
      const sidecarLocalPath = path.join(this.agentDir, ".webdav-sync", `sidecar-${machineId}.json`);
      try {
        const sidecarContent = await fs.readFile(sidecarLocalPath, "utf-8");
        await this.client.writeFile(`machines/${machineId}.json`, sidecarContent);
        report.pushed.push(`machines/${machineId}.json`);
      } catch {
        // Local sidecar doesn't exist
      }
    } catch {
      // Ignore sidecar push error
    }

    // Push vault if configured
    if (this.config.encryptionPassword) {
      try {
        const vaultLocalPath = path.join(this.agentDir, ".webdav-sync", "vault.json");
        try {
          const vaultContent = await fs.readFile(vaultLocalPath, "utf-8");
          const encrypted = encryptVault(vaultContent, this.config.encryptionPassword);
          await this.client.writeFile("vault.enc", encrypted);
          report.pushed.push("vault.enc");
        } catch {
          // No vault.json locally
        }
      } catch (err) {
        report.errors.push({
          path: "vault.enc",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Push plugins if configured
    if (this.config.syncPlugins !== false) {
      await this.pushPlugins(report);
    }

    return report;
  }

  private async pullPlugins(report: SyncReport): Promise<void> {
    try {
      const remotePkg = await this.client.readFile("plugins/package.json");
      if (!remotePkg) {
        return;
      }

      const localPkgPath = path.join(this.pluginsDir, "package.json");
      let localPkg: string | null = null;
      let beforeDeps: string[] = [];
      try {
        localPkg = await fs.readFile(localPkgPath, "utf-8");
        const parsedLocal = JSON.parse(localPkg) as { dependencies?: Record<string, string> };
        beforeDeps = Object.keys(parsedLocal.dependencies || {});
      } catch {
        // local package.json does not exist yet
      }

      const basePkg = await readBaseFile("plugins-package.json", this.agentDir);

      if (localPkg === null) {
        await atomicWriteFile(localPkgPath, remotePkg);
        await updateBaseSnapshot("plugins-package.json", remotePkg, this.agentDir);
        report.pulled.push("plugins/package.json");
      } else if (localPkg !== remotePkg) {
        const mergeResult = merge3Way("package.json", basePkg, localPkg, remotePkg, this.config.conflictStrategy);
        await backupLocalFile("plugins-package.json", this.agentDir, report.timestamp);
        await atomicWriteFile(localPkgPath, mergeResult.mergedContent);
        await updateBaseSnapshot("plugins-package.json", remotePkg, this.agentDir);
        report.merged.push("plugins/package.json");

        try {
          const parsedMerged = JSON.parse(mergeResult.mergedContent) as { dependencies?: Record<string, string> };
          const afterDeps = Object.keys(parsedMerged.dependencies || {});
          const newDeps = afterDeps.filter(d => !beforeDeps.includes(d));
          if (newDeps.length > 0) {
            report.newPluginsDetected = newDeps;
          }
        } catch {
          // ignore parse error
        }
      }

      // Also pull lockfile if remote has it
      const remoteLock = await this.client.readFile("plugins/omp-plugins.lock.json");
      if (remoteLock) {
        const localLockPath = path.join(this.pluginsDir, "omp-plugins.lock.json");
        await atomicWriteFile(localLockPath, remoteLock);
      }
    } catch (err) {
      report.errors.push({
        path: "plugins/package.json",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async pushPlugins(report: SyncReport): Promise<void> {
    try {
      const localPkgPath = path.join(this.pluginsDir, "package.json");
      try {
        const localPkg = await fs.readFile(localPkgPath, "utf-8");
        await this.client.writeFile("plugins/package.json", localPkg);
        await updateBaseSnapshot("plugins-package.json", localPkg, this.agentDir);
        report.pushed.push("plugins/package.json");
      } catch {
        // package.json doesn't exist
      }

      const localLockPath = path.join(this.pluginsDir, "omp-plugins.lock.json");
      try {
        const localLock = await fs.readFile(localLockPath, "utf-8");
        await this.client.writeFile("plugins/omp-plugins.lock.json", localLock);
        report.pushed.push("plugins/omp-plugins.lock.json");
      } catch {
        // lock doesn't exist
      }
    } catch (err) {
      report.errors.push({
        path: "plugins/package.json",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sync(): Promise<SyncReport> {
    // 1. Pull and 3-way merge remote changes
    const pullReport = await this.pull();

    // 2. Push local and merged state to WebDAV
    const pushReport = await this.push();

    // Combine reports
    const combinedReport: SyncReport = {
      timestamp: Date.now(),
      pulled: pullReport.pulled,
      pushed: pushReport.pushed,
      merged: Array.from(new Set([...pullReport.merged, ...pushReport.merged])),
      conflicts: [...pullReport.conflicts, ...pushReport.conflicts],
      unchanged: pullReport.unchanged.filter(f => !pushReport.pushed.includes(f) && !pushReport.merged.includes(f)),
      newPluginsDetected: pullReport.newPluginsDetected,
      errors: [...pullReport.errors, ...pushReport.errors],
    };

    return combinedReport;
  }
}
