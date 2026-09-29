# Logging & UI Notification Guidelines

> Standards for logging, command output, and sensitive credential protection in `omp-webdav-sync`.

---

## 1. Channels & Separation of Concerns

`omp-webdav-sync` uses two distinct channels for communication:

1. **System & Diagnostic Logging (`pi.logger`)**:
   - Used for background operations (e.g. `session_start` auto-sync) or low-level diagnostic logs.
   - Levels:
     - `pi.logger.info`: Normal milestones (e.g. background sync finished with changes).
     - `pi.logger.warn`: Non-fatal issues (e.g. background sync failed due to network unreachable).
     - `pi.logger.error`: Fatal errors or unrecoverable exceptions.

2. **Interactive UI Notifications (`ctx.ui.notify`)**:
   - Used inside command handlers (`/ompsync`) to communicate directly with the user.
   - Must be concise, structured, and easy to read.

---

## 2. Sensitive Credential Redaction

**Mandatory Rule**: Plaintext passwords, bearer tokens, or encryption passphrases must **NEVER** be displayed in UI messages, logged, or printed.

When displaying configuration in `/ompsync config` or `/ompsync status`, always pass the configuration through `sanitizeConfig` (`src/config/manager.ts`):

```typescript
export function sanitizeConfig(config: WebDavConfig): Record<string, unknown> {
  return {
    url: config.url,
    username: config.username ? (config.username.length > 2 ? config.username[0] + "***" + config.username.slice(-1) : "***") : undefined,
    passwordConfigured: Boolean(config.password),
    bearerTokenConfigured: Boolean(config.bearerToken),
    remotePath: config.remotePath,
    encryptionEnabled: Boolean(config.encryptionPassword),
    conflictStrategy: config.conflictStrategy,
    syncFiles: config.syncFiles,
    autoSyncOnStart: config.autoSyncOnStart,
    syncPlugins: config.syncPlugins,
  };
}
```

---

## 3. Formatting Standards

- When reporting sync results, summarize file counts and explicitly list file paths:
  ```text
  双向同步完成:
    - 拉取: 3 个
    - 推送: 1 个
    - 语义合并: 1 个
    - 冲突: 0 处
    - 错误: 0
  ```
- If remote added new plugins, provide an actionable recommendation:
  ```text
  💡 检测到远端新增插件: omp-plugin-xyz (建议运行 omp plugins install)
  ```
