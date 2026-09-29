# Error Handling Guidelines

> How errors and exceptional conditions are handled across `omp-webdav-sync`.

---

## 1. Domain Error Hierarchy

We define domain-specific error classes extending `Error` for precise error categorization:

1. **`WebDavError` (`src/webdav/client.ts`)**:
   - Represents HTTP-level WebDAV communication failures.
   - Carries `statusCode` (e.g. 401, 403, 409) and the target `url`.
   ```typescript
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
   ```

2. **`VaultError` (`src/crypto/vault.ts`)**:
   - Represents cryptographic errors (tampered ciphertext, invalid magic header `OMPV`, incorrect password, missing keys).
   - Thrown when AES-256-GCM authentication tag verification fails.

---

## 2. Cross-Platform Filesystem Resilience

### 2.1 Atomic Writes with `EXDEV` / `EPERM` Fallback (`src/storage/file-utils.ts`)
On Windows or mounted filesystems, `fs.rename` across temp partitions or under antivirus scanning can throw `EXDEV` or `EPERM`. We handle this with an explicit fallback pattern:

```typescript
try {
  await fs.rename(tempPath, filePath);
} catch (renameErr: unknown) {
  if (renameErr && typeof renameErr === "object" && "code" in renameErr) {
    const code = renameErr.code;
    if (code === "EXDEV" || code === "EPERM" || code === "EBUSY") {
      await fs.copyFile(tempPath, filePath);
      await fs.unlink(tempPath);
      return;
    }
  }
  throw renameErr;
}
```

### 2.2 Pre-Overwrite Safety Backups (`src/storage/backup.ts`)
Before writing remote or merged content to an existing local file, `backupLocalFile` archives the existing version to `.webdav-sync/backups/<timestamp>/<relativePath>`. If a crash occurs mid-sync, the user's data remains safe.

---

## 3. Batch Sync Error Isolation (`src/sync/engine.ts`)

In batch synchronization (`pull`, `push`, `sync`):
- A single file failure (e.g. permission denied or network glitch on one file) **must not crash the entire sync process**.
- Failures are caught per file and recorded into `report.errors`:
  ```typescript
  catch (err) {
    report.errors.push({
      path: relPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  ```
- The overall command continues processing remaining files and presents a structured summary to the user.

---

## 4. Anti-Patterns to Avoid

- **No swallowed exceptions**: Never use empty `catch {}` blocks unless explicitly ignoring benign cleanup errors (e.g. unlinking a temporary file that was already removed).
- **No uninformative error strings**: When rethrowing or reporting errors, preserve the underlying cause or message (`err instanceof Error ? err.message : String(err)`).
- **No plain inline casts for error narrowing**: Always use property checking (`"code" in err`) rather than unchecked `as` assertions.
