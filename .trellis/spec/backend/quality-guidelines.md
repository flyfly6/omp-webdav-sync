# Quality Guidelines

> Code standards, architecture principles, and verification rules for `omp-webdav-sync`.

---

## 1. Core Principles

### 1.1 Ponytail Minimal-Dependency Philosophy
- **Stdlib First**: Use Node.js built-in APIs (`node:crypto`, `fetch`, `node:fs/promises`, `node:path`, `node:os`) over external dependencies.
- **Zero Unneeded Packages**: Avoid pulling in large WebDAV client libraries or bloated crypto helpers.
- **Short, Boring Implementations**: Write direct, readable logic rather than multi-layered speculative abstractions.

### 1.2 TypeScript ESM Rigor
- Target: `ES2022`, Module: `NodeNext`.
- **Mandatory `.js` extension on relative imports**: In ESM NodeNext, all local imports must specify `.js`:
  ```typescript
  // Correct
  import { WebDavClient } from "../webdav/client.js";
  import type { WebDavConfig } from "../types.js";

  // Forbidden
  import { WebDavClient } from "../webdav/client";
  ```
- **Strict type safety**: `strict: true`, `noImplicitAny: true`. Avoid `any`; use `unknown` with runtime type narrowing guards.

---

## 2. Testing Conventions

We rely exclusively on the Node.js 22 built-in test runner (`node:test` and `node:assert/strict`):

- **Isolated temp directories**: Tests touching filesystem operations must create and clean up temporary directories using `os.tmpdir()` and unique prefixes.
- **Lightweight in-memory servers**: WebDAV network tests use Node's `node:http.createServer` listening on port `0` (`127.0.0.1`) rather than external mock frameworks.
- **Assertion style**: Prefer `assert.equal`, `assert.deepEqual`, and `assert.throws` with error predicate validation.

---

## 3. Verification Commands

Before concluding any work or committing changes, run the full verification gate:

```bash
# 1. Typecheck production and test files
npm run typecheck

# 2. Compile and run all tests with concurrency
npm test

# 3. Full quality gate
npm run check
```
