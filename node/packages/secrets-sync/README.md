<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
SPDX-License-Identifier: GPL-3.0-or-later
-->

# secrets-sync

A CLI tool for synchronizing GitHub secrets between repositories and bulk-setting secrets across repositories with specific labels.

## Installation

```bash
yarn install
```

## Usage

### Sync Command

Synchronize secrets from one repository to another:

```bash
# Sync all secrets (values from environment variables)
yarn secrets-sync sync --from org/source-repo --to org/target-repo

# Sync to multiple repos
yarn secrets-sync sync --from org/source-repo --to org/target-1,org/target-2

# Sync with interactive prompting for values
yarn secrets-sync sync --from org/source-repo --to org/target-repo --interactive

# Sync using env file with file references for GPG keys
yarn secrets-sync sync --from org/source-repo --to org/target-repo --from-env-file ./secrets.env

# Sync only specific secrets
yarn secrets-sync sync --from org/source-repo --to org/target-repo --include API_KEY,DATABASE_URL

# Exclude specific secrets
yarn secrets-sync sync --from org/source-repo --to org/target-repo --exclude DEBUG_MODE

# Dry run to preview changes
yarn secrets-sync sync --from org/source-repo --to org/target-repo --dry-run
```

### Bulk-Set Command

Set secrets on all non-archived repositories with a specific label/topic:

```bash
# Set secrets from env file on all repos with "production" label
yarn secrets-sync bulk-set --owner org --label production --from-env-file ./secrets.env

# Set a single secret
yarn secrets-sync bulk-set --owner org --label production --secret-name API_KEY --secret-value "$API_KEY"

# Use current user as owner (defaults to authenticated user)
yarn secrets-sync bulk-set --label production --from-env-file ./secrets.env

# Dry run to preview changes
yarn secrets-sync bulk-set --owner org --label production --from-env-file ./secrets.env --dry-run
```

## Env File Format

The `--from-env-file` option supports a special syntax for handling multi-line secrets like GPG keys:

```bash
# Read from environment variable
API_KEY=env://API_KEY
DATABASE_URL=env://DATABASE_URL

# Read from file (for multi-line values like GPG keys)
GPG_SIGNING_KEY=file://./keys/signing-key.asc
GPG_PUBLIC_KEY=file://./keys/public.asc

# Direct value (not recommended for sensitive data)
DEBUG_MODE=true
```

### Why file:// for GPG keys?

Armored GPG keys are multi-line PEM-like blocks that don't fit well in `.env` files:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
...
-----END PGP PUBLIC KEY BLOCK-----
```

Using `file://` references keeps the env file clean and makes it easier to manage keys.

## How It Works

### Important: GitHub Doesn't Allow Reading Secret Values

GitHub's API (and `gh` CLI) only allows listing secret **names** - you cannot read the values back. This means:

1. The `sync` command lists secret names from the source repo
2. Values must be provided via:
   - Environment variables (matching the secret name)
   - `--from-env-file` with `env://` or `file://` references
   - `--interactive` mode (prompts for each value)

### Value Resolution Priority

For each secret, values are resolved in this order:

1. **Explicit `--secret-value`** (for bulk-set single secret)
2. **From env file entry:**
   - `env://VAR_NAME` - Read from environment variable
   - `file://./path` - Read from file
   - Plain value - Use as-is
3. **Environment variable matching secret name**
4. **Interactive prompt** (if `--interactive` flag is set)

## Requirements

- GitHub CLI (`gh`) authenticated
- Node.js 24+
- Yarn 4+

## License

GPL-3.0-or-later
