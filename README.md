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
omp plugin install omp-webdav-sync
```

Use `omp install` as a shorthand for the same thing. Plain `npm install` does not work: omp only scans `~/.omp/plugins/node_modules/`, which is where the plugin manager installs.

The package registers itself as an Oh My Pi / Pi extension through the `omp.extensions` field, which points at the compiled entry `./dist/index.js`. It has no runtime dependencies of its own — the host provides the extension API.

After installing, restart omp: `/reload-plugins` does not rebuild extension modules. Run `omp plugin list` to confirm the plugin is enabled, and `/extensions` to check the discovered entry.

## Usage

The extension registers one slash command, `/ompsync`. Called with no argument it reports sync status.

| Command | What it does |
| :--- | :--- |
| `/ompsync status` | Show server, remote path, last sync time, and whether either side has pending changes. This is the default. |
| `/ompsync sync` | Two-way sync: pull, merge, then push. |
| `/ompsync pull` | Pull remote changes and merge them into the local files. |
| `/ompsync push` | Push local files and the merge result to the remote. |
| `/ompsync test` | Check connectivity and read/write permission against the server. |
| `/ompsync config <url> [username] [password] [remotePath]` | Save the WebDAV server settings. Without `<url>`, print the current settings. |
| `/ompsync help` | List the commands. |

### First-time setup

```
/ompsync config https://nas.example.com/dav alice s3cret /omp-sync
/ompsync test
/ompsync sync
```

`remotePath` defaults to `/omp-sync`. The command only writes `url`, `username`, `password`, and `remotePath`; the remaining options are edited in the config file directly.

### Configuration

Settings live in `~/.omp/agent/.webdav-sync/config.json`.

| Field | Default | Purpose |
| :--- | :--- | :--- |
| `url` | *(required)* | WebDAV base URL. |
| `username` / `password` | — | Basic auth credentials. |
| `bearerToken` | — | Bearer token, used instead of basic auth. |
| `remotePath` | `/omp-sync` | Remote directory. |
| `conflictStrategy` | `local-wins` | One of `local-wins`, `remote-wins`, `newer-wins`. |
| `syncFiles` | `config.yml`, `settings.json`, `models.yml`, `mcp.json`, `AGENTS.md`, `ssh.json`, `skills/` | What gets synced, relative to `~/.omp/agent`. |
| `ignorePatterns` | `*.db*`, `*.bak`, `*.tmp`, `*.log`, `.webdav-sync/**` | Glob patterns excluded from sync. |
| `autoSyncOnStart` | `false` | Run a full sync when a session starts. |
| `syncPlugins` | `true` | Also sync installed plugins. |
| `encryptionPassword` | — | Enables the encrypted vault, see below. |

`/ompsync config` prints settings through a sanitizer: the username is masked, and the password and token only report whether they are set.

### Encrypted vault

Set `encryptionPassword` to keep sensitive tokens in an encrypted vault. The local `~/.omp/agent/.webdav-sync/vault.json` is encrypted into `vault.enc` on the remote, and decrypted back on pull.

- AES-256-GCM, with the key derived by PBKDF2-SHA256 over 100,000 rounds and a fresh random salt per write.
- A wrong password or tampered ciphertext fails the GCM tag check and is reported as an error, never written through silently.
- The password is never stored remotely. Losing it means losing the vault.

### Per-machine isolation

Fields that only make sense on a single machine (launcher paths, OS-specific args) are split out of the shared files into a per-host sidecar keyed by a sanitized hostname: `machines/<hostname>.json` on the remote. Home directory prefixes are templated as `${HOME}`, so a shared config stays valid on another machine.

### Plugins

With `syncPlugins` enabled, installed plugins sync alongside the config. When a pull finds plugins you do not have locally yet, the result suggests running `omp plugin install`.

## License

MIT
