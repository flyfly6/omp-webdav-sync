# 3-Way Semantic Merge & Sync Guidelines

> Principles, data flow, and conflict resolution rules for `omp-webdav-sync`.

---

## 1. 3-Way Semantic Merge Engine

Syncing configurations across multiple machines without git locks requires a 3-way semantic merge engine comparing:
- **`Base`**: The baseline snapshot recorded during the previous successful synchronization (`.webdav-sync/base/`).
- **`Local`**: The current local configuration on this machine.
- **`Remote`**: The configuration fetched from WebDAV NAS.

### Decision Matrix

| Local vs Base | Remote vs Base | Action | Outcome |
| :--- | :--- | :--- | :--- |
| Unchanged | Unchanged | No-op | Clean, already in sync |
| Modified | Unchanged | Clean Push | Upload local changes to WebDAV; update Base |
| Unchanged | Modified | Clean Pull | Update local file with remote content; update Base |
| Modified | Modified | 3-Way Semantic Merge | Compute merged state, update local and remote, record Base |

---

## 2. Format-Aware Merging Patterns

### 2.1 JSON Recursive Merging (`src/merge/json-merge.ts`)
- **Non-overlapping fields**: Local additions and remote additions are merged cleanly into the target object.
- **Nested objects**: Plain objects are merged recursively down the property tree.
- **Scalar conflicts**: If both sides modified the same scalar property to different values, resolve using the configured `conflictStrategy`:
  - `"local-wins"`: Local value is preserved.
  - `"remote-wins"`: Remote value is applied.
  - Conflict details are recorded in `report.conflicts` (`MergeConflict[]`).

### 2.2 Entity-Aligned Array Merging (`merge3WayJsonArray`)
- Used for array-based configuration files such as `ssh.json` (`Array<{ host: string, ... }>`).
- Looks for candidate identifier keys: `host` > `id` > `name` > `key`.
- When an entity key is detected:
  - Maps arrays by ID.
  - Performs recursive 3-way merge on matching entities (e.g. machine A changed `user`, machine B changed `port` on the same `host`).
  - Preserves distinct additions and honors one-sided deletions.
- For primitive arrays (strings, numbers): computes union while preserving local order.

### 2.3 Text Line Merging (`src/merge/text-merge.ts`)
- Preserves common prefix and suffix lines.
- For diverging middle lines:
  - If one side is empty, treats the other side as clean addition.
  - If both sides edited the middle, resolves via strategy and flags a conflict.

---

## 3. Machine Sidecar & Path Template Normalization

### 3.1 Path Normalization (`src/sidecar/sidecar.ts`)
- Configuration containing user home directory paths (e.g. `/Users/alice` or `C:\Users\alice`) is automatically collapsed into `${HOME}` templates before pushing to WebDAV.
- Upon downloading, `${HOME}` is automatically expanded into the current machine's home directory.

### 3.2 Machine Sidecars (`machines/<hostname>.json`)
- Files containing host-bound overrides (`.machine`, `_<hostname>`) or platform-mismatched paths (e.g. Windows drive letters on Unix or Unix root paths on Windows) are isolated into `machines/<hostname>.json`.
- Each machine only pushes and pulls its own sidecar file, ensuring cross-platform configurations never corrupt each other.

---

## 4. Verification

Run the dedicated test suites to verify merge behavior:

```bash
node --test dist-test/test/merge.test.js
node --test dist-test/test/ssh-merge.test.js
node --test dist-test/test/sidecar.test.js
```
