export type ConflictStrategy = "local-wins" | "remote-wins" | "newer-wins";

export interface WebDavConfig {
  url: string;
  username?: string;
  password?: string;
  bearerToken?: string;
  remotePath?: string;
  encryptionPassword?: string;
  conflictStrategy?: ConflictStrategy;
  syncFiles?: string[];
  ignorePatterns?: string[];
  autoSyncOnStart?: boolean;
}

export interface FileEntry {
  relativePath: string;
  hash: string;
  size: number;
  mtime: number;
  etag?: string;
}

export interface MergeConflict {
  path: string;
  field?: string;
  baseValue?: unknown;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  strategy: string;
}

export interface MergeResult {
  mergedContent: string;
  hasConflicts: boolean;
  conflicts: MergeConflict[];
}

export interface SyncReport {
  timestamp: number;
  pulled: string[];
  pushed: string[];
  merged: string[];
  conflicts: MergeConflict[];
  unchanged: string[];
  errors: Array<{ path: string; error: string }>;
}

export interface SyncManifest {
  version: number;
  lastSyncTime: number;
  files: Record<string, FileEntry>;
}

export interface SyncStatus {
  lastSyncTime: number | null;
  remoteUrl: string;
  remotePath: string;
  localFiles: FileEntry[];
  remoteFiles: FileEntry[];
  hasPendingLocalChanges: boolean;
  hasPendingRemoteChanges: boolean;
}
