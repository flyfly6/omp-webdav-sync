# Backend & Plugin Guidelines

> Architectural standards and coding conventions for `omp-webdav-sync`.

---

## Overview

`omp-webdav-sync` is a TypeScript Node.js extension for Oh My Pi (`omp`) providing secure, multi-machine configuration synchronization over private WebDAV NAS storage with 3-way semantic merging and encrypted credential vaulting.

---

## Guidelines Index

| Guide | Description | Reference Scope |
| :--- | :--- | :--- |
| **[Directory Structure](./directory-structure.md)** | Module boundaries, file layout, and architecture | `src/` modules & `test/` layout |
| **[3-Way Semantic Merge & Sync](./sync-merge-guidelines.md)** | 3-way merge rules, array entity alignment, sidecars, and `${HOME}` templates | `src/merge/`, `src/sidecar/`, `src/sync/` |
| **[Error Handling](./error-handling.md)** | Custom error types, `EXDEV` atomic fallbacks, and sync error isolation | `src/webdav/client.ts`, `src/storage/` |
| **[Quality Guidelines](./quality-guidelines.md)** | Ponytail stdlib-first rules, TypeScript ESM strictness, and native test conventions | Repository-wide |
| **[Logging & UI Notifications](./logging-guidelines.md)** | `pi.logger`, `ctx.ui.notify`, and credential redaction | `src/index.ts`, `src/config/manager.ts` |

---

## Pre-Development Checklist

Before writing new code in this layer:
- [ ] Confirm the new logic relies on Node.js built-ins (`node:crypto`, `fetch`, `node:fs/promises`) rather than new external dependencies.
- [ ] Ensure local relative imports in TypeScript include the `.js` extension (e.g. `from "./utils.js"`).
- [ ] Verify that all filesystem mutations pass through `atomicWriteFile` and preserve pre-overwrite backups.

---

## Quality Gate

Before completing tasks:
- [ ] Run `npm run typecheck` to verify 0 type errors under strict NodeNext settings.
- [ ] Run `npm test` to verify all unit and integration tests pass.
- [ ] Verify that no unredacted credentials or sensitive tokens are exposed in logs or UI messages.
