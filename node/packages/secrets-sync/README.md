<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# secrets-sync

A CLI tool for syncing GitHub secrets to repositories.

## Installation

```bash
yarn install
```

## Usage

```bash
# Sync all secrets from env file to current repo
yarn secrets sync --env-file secrets.env

# Sync to specific repo
yarn secrets sync --env-file secrets.env --repo owner/target-repo

# Sync to multiple repos
yarn secrets sync --env-file secrets.env --repo owner/target-1,owner/target-2

# Sync to all repos with a label/topic
yarn secrets sync --env-file secrets.env --label auto-updated

# Sync specific secrets only (from env or env vars)
yarn secrets sync --secrets API_KEY,SECRET --repo owner/target

# Use environment variables directly
export API_KEY="secret-value"
yarn secrets sync --secrets API_KEY
```

## Env File Format

Comments start with `#`:

```bash
# Generate with: gpg --armor --export 8042ED9A
GPG_PUBLIC_KEY=file://./keys/public.asc

# Generate with: gpg --armor --export-secret-keys 8042ED9A
GPG_PRIVATE_KEY=file://./keys/private.asc

# Read from environment variable
API_KEY=env://API_KEY
DATABASE_URL=env://DATABASE_URL

# Direct value (not recommended for sensitive data)
DEBUG_MODE=true
```

### File References

For multi-line secrets like GPG keys, use `file://`:

```bash
GPG_SIGNING_KEY=file://./keys/signing-key.asc
```

Armored GPG keys are multi-line PEM-like blocks that don't fit well in `.env` files:

```text
-----BEGIN PGP PUBLIC KEY BLOCK-----
...
-----END PGP PUBLIC KEY BLOCK-----
```

Using `file://` references keeps the env file clean and makes it easier to manage keys.

## How It Works

### Important: GitHub Doesn't Allow Reading Secret Values

GitHub's API (and `gh` CLI) only allows listing secret **names** - you cannot read the values back. This means you must provide secret values via:

- Environment variables (matching the secret name)
- `--env-file` with `env://` or `file://` references

### Value Resolution Priority

For each secret, values are resolved in this order:

1. **From env file entry:**
   - `env://VAR_NAME` - Read from environment variable
   - `file://./path` - Read from file
   - Plain value - Use as-is
2. **Environment variable matching secret name**

## Requirements

- GitHub CLI (`gh`) authenticated
- Node.js 24+
- Yarn 4+

## License

GPL-3.0-or-later
