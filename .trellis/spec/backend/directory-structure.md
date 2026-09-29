# Directory Structure Guidelines

> How TypeScript and plugin modules are organized in `omp-webdav-sync`.

---

## 1. Overview

`omp-webdav-sync` is a pure Node.js / TypeScript (ESM) extension for Oh My Pi (`omp`). The repository follows a feature-bounded, zero-external-dependency module layout where core concerns (WebDAV protocol, 3-way semantic merging, crypto vault, sidecars, and local storage) are cleanly separated into dedicated subdirectories under `src/`.

---

## 2. Directory Layout

```text
src/
├── index.ts               # OMP extension entry point & slash command (/ompsync)
├── types.ts               # Core contracts, configs, sync reports, and conflict types
├── config/
│   └── manager.ts         # Local config manager (~/.omp/agent/.webdav-sync/config.json)
├── crypto/
│   └── vault.ts           # AES-256-GCM + PBKDF2 credentials vault
├── merge/
│   ├── json-merge.ts      # Entity-aligned & recursive 3-way JSON merge
│   ├── text-merge.ts      # Line-diff 3-way text/markdown merge
│   └── semantic-merge.ts  # Master format router (JSON/Array/Text)
├── sidecar/
│   └── sidecar.ts         # Path template normalization & machine sidecar isolation
├── storage/
│   ├── backup.ts          # Base snapshot management & pre-overwrite backups
│   └── file-utils.ts      # Atomic file writing, hash calculation, recursive scanning
├── sync/
│   └── engine.ts          # Sync lifecycle orchestrator (pull/push/bidirectional sync)
└── webdav/
    ├── client.ts          # Native fetch WebDAV client (PROPFIND/GET/PUT/MKCOL/DELETE)
    └── xml-parser.ts      # Zero-dependency PROPFIND multistatus XML parser

test/                      # Node.js 22 native test runner test suite
├── config-storage.test.ts
├── merge.test.ts
├── plugins-sync.test.ts
├── sidecar.test.ts
├── skills-recursive.test.ts
├── ssh-merge.test.ts
├── sync-engine.test.ts
├── vault.test.ts
└── xml-parser.test.ts
```

---

## 3. Module Boundaries & Rules

1. **Extension Boundary (`src/index.ts`)**:
   - Only place importing `@oh-my-pi/pi-coding-agent`.
   - Responsible for registering `/ompsync`, providing argument completions, formatting output, and invoking `ctx.ui.notify`.
   - Never place raw HTTP or file manipulation code directly in `index.ts`; delegate to `SyncEngine`, `WebDavClient`, or `manager.ts`.

2. **Core Types Boundary (`src/types.ts`)**:
   - Central source of truth for interfaces: `WebDavConfig`, `SyncReport`, `SyncStatus`, `FileEntry`, `MergeConflict`.
   - Zero runtime dependencies. Keep types clean and serializable across IPC/disk boundaries.

3. **Storage & Atomicity Boundary (`src/storage/`)**:
   - All mutations to configuration or base files must pass through `atomicWriteFile`.
   - Pre-overwrite snapshots must be archived under `.webdav-sync/backups/<timestamp>/` via `backupLocalFile`.

4. **WebDAV Protocol Boundary (`src/webdav/`)**:
   - Encapsulates HTTP WebDAV methods using Node 22 native `fetch`.
   - XML parsing is self-contained in `xml-parser.ts`.

---

## 4. Anti-Patterns to Avoid

- **No top-level circular dependencies**: Modules under `merge/`, `crypto/`, and `webdav/` must remain independent utilities and never import `SyncEngine`.
- **No unbuffered partial writes**: Never call raw `fs.writeFile` on user config files; always use `atomicWriteFile`.
- **No direct coupling to process.cwd()**: Always resolve OMP configuration against `getDefaultAgentDir()` (`~/.omp/agent`) or an explicitly injected `agentDir` parameter to ensure testability.
