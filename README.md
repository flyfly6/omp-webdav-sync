# omp-webdav-sync

Securely sync your `~/.omp/agent` configuration to your private NAS via WebDAV with 3-way semantic merging and encrypted credentials vault.

## Features

- **Private NAS Storage**: Sync your configuration directly to self-hosted WebDAV storage (Synology, QNAP, Nextcloud, Alist, etc.).
- **3-Way Semantic Merge**: Intelligent field-level merging for JSON and YAML configurations, avoiding conflict markers and unpushed divergences.
- **End-to-End Encryption**: Optional encrypted credentials vault (`vault.enc`) protecting sensitive tokens and auth files.
- **Zero Local Git Friction**: Pure Node.js HTTP/WebDAV operations without local git locks, branch diverging, or unexpected background commits.
- **Sidecar Isolation**: Automatically isolates machine-local fields (launcher paths, OS-specific args).

## License

MIT
