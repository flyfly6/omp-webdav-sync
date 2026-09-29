# omp-webdav-sync

Securely sync your `~/.omp/agent` configuration to your private NAS via WebDAV with 3-way semantic merging and encrypted credentials vault.

## Features

- **Private NAS Storage**: Sync your configuration directly to self-hosted WebDAV storage (Synology, QNAP, Nextcloud, Alist, etc.).
- **3-Way Semantic Merge**: Intelligent field-level merging for JSON and YAML configurations, avoiding conflict markers and unpushed divergences.
- **End-to-End Encryption**: Optional encrypted credentials vault (`vault.enc`) protecting sensitive tokens and auth files.
- **Zero Local Git Friction**: Pure Node.js HTTP/WebDAV operations without local git locks, branch diverging, or unexpected background commits.
- **Sidecar Isolation**: Automatically isolates machine-local fields (launcher paths, OS-specific args).

## Installation

```bash
npm install omp-webdav-sync
```

The package registers itself as an Oh My Pi / Pi extension through the `omp.extensions` field, which points at the compiled entry `./dist/index.js`. It declares `@oh-my-pi/pi-coding-agent` as a peer dependency, so the host agent is provided by your existing installation.

## Releasing

### One-time setup

OIDC trusted publishing cannot create a brand new package — npmjs.com only exposes the Trusted Publisher settings once the package exists. So the first release must be published manually:

```bash
npm login
npm publish
```

Then enable trusted publishing at **npmjs.com → package page → Settings → Trusted Publisher → GitHub Actions**:

| Field | Value |
| :--- | :--- |
| Organization or user | `flyfly6` |
| Repository | `omp-webdav-sync` |
| Workflow filename | `publish.yml` |
| Environment name | *(leave empty)* |

Two traps worth knowing:

- **Workflow filename is a hard contract.** Enter only the filename, not the full path, and keep the `.yml` extension. npm does not validate this on save — a mismatch only surfaces as a failed publish.
- **You must explicitly allow `npm publish`.** Trusted publisher configurations created after 2026-09-03 default to allowing only `npm stage publish`. Without ticking `npm publish` as well, the OIDC publish is rejected.

Optional hardening: under **Settings → Publishing access**, select "Require two-factor authentication and disallow tokens". Trusted publishers keep working; long-lived tokens stop working.

### Subsequent releases

```bash
npm version patch    # or minor / major
git push origin main --follow-tags
```

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which installs, runs the full quality gate, verifies that the tag matches `package.json`, and publishes. npm automatically attaches a provenance attestation because the repository and package are both public.

The tag must match `package.json` exactly (`v` + version). npm versions cannot be overwritten or deleted, so a mismatch would leave a permanently mislabelled release — the workflow fails before publishing to prevent that.


## License

MIT
