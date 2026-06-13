<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-4.0
SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Project Overview

This is **share** (also referenced as `template-main`), a shared configuration and tooling repository that provides:

1. **Git hooks** - Automated dependency syncing and commit validation
2. **License compliance** - REUSE specification compliance for copyright and licensing

The project uses Python for scripting and Node.js-based developer tools (Prettier, lint-staged, git-conventional-commits) managed via Yarn Plug'n'Play.

## Technology Stack

- **Python**: 3.14+ (managed via `uv`)
- **Node.js**: 24.16.0 (managed via `yarn` 4.16.0 with Plug'n'Play)
- **Git**: With custom hooks for workflow automation

## Project Structure

```text
.
├── git/hooks/                  # Custom git hooks
│   ├── commit-msg              # Conventional commits validation
│   ├── post-checkout           # Auto-install deps on branch switch
│   ├── post-merge              # Auto-install deps after merge
│   └── pre-commit              # Lint-staged runner
├── .github/workflows/          # GitHub Actions
├── pyproject.toml              # Python project configuration (PEP 621)
├── package.json                # Node.js developer tools configuration
└── git-conventional-commits.yaml  # Conventional commits config
```

## Build and Test Commands

```bash
# Linting (all)
yarn lint

# Prettier formatting check
yarn lint:prettier

# REUSE license compliance check
yarn lint:reuse

# Setup development environment (run once after clone)
yarn contribute
```

### Python (uv)

```bash
# Sync dependencies
uv sync --frozen

# Install with dev dependencies
uv sync --frozen --group dev
```

### Node.js (yarn)

```bash
# Install dependencies (immutable)
yarn install --immutable

# Update all dependencies
yarn up
```

## Code Style Guidelines

### EditorConfig (`.editorconfig`)

- **Charset**: UTF-8
- **Line endings**: LF
- **Indent**: 2 spaces
- **Final newline**: Required

### Prettier (`.prettierrc.cjs`)

- **Print width**: 120 characters
- **XML whitespace sensitivity**: ignore
- **Plugins**: XML, Properties, Java, TOML

### File Type Conventions

| File Type                              | License         | Formatter            |
| -------------------------------------- | --------------- | -------------------- |
| `*.js`, `*.cjs`, `*.yml`               | MIT             | Prettier             |
| `package.json`                         | MIT             | Prettier             |
| `*.json` (non-package)                 | CC0-1.0         | Prettier             |
| `*.md`, `*.adoc`                       | CC-BY-NC-SA-4.0 | Prettier             |
| `*.xml`, `*.yaml`, `*.toml`, `*.json5` | CC0-1.0         | Prettier             |
| Shell scripts                          | MIT             | shfmt (python style) |

### Licensing

All files MUST have SPDX license headers. The project uses:

- **REUSE specification** for license compliance
- **lint-staged** automatically adds headers via `reuse annotate`

## Verification

1. **License compliance**: `yarn lint:reuse`
2. **Formatting**: `yarn lint:prettier`

## Git Workflow

### Git Hooks

The project uses custom git hooks (configured via `git config core.hooksPath git/hooks`):

1. **pre-commit**: Runs `lint-staged` to format and add license headers
2. **commit-msg**: Validates conventional commit format via `git-conventional-commits`
3. **post-checkout**: Auto-runs `yarn install` or `uv sync` if lockfiles changed
4. **post-merge**: Same as post-checkout

### Conventional Commits

Allowed types (from `git-conventional-commits.yaml`):

- `ci`, `feat`, `fix`, `perf`, `refactor`, `style`, `test`
- `build`, `ops`, `docs`, `chore`, `merge`, `revert`

## Security Considerations

1. **CI Detection**: All git hooks check `[ -n "$CI" ]` and exit early in CI environments
2. **Lockfile Integrity**: `--immutable` flag ensures lockfiles are not modified unexpectedly

## Development Setup

1. Install prerequisites: `asdf install` (reads `.tool-versions`)
2. Setup environment: `yarn contribute`
   - Installs Node.js dependencies
   - Syncs Python virtual environment
   - Configures git hooks path

## Dependency Management

### Renovate Configuration

Automatic dependency updates via Renovate (`.github/renovate.json5`):

- **npm/asdf**: Weekly on Wednesday (minor/patch auto-merge)
- **pip-compile**: Daily at 03:00 UTC
- **Gradle**: Major updates at 04:00 UTC, settings plugins at 05:00 UTC Wednesday
- **GitHub Actions**: Auto-merge enabled

### Key Files

- `uv.lock` - Python dependency lock
- `yarn.lock` - Node.js dependency lock
- Changes to these trigger automatic sync via git hooks
