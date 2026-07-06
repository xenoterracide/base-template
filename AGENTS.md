<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# share

Shared configuration, git hooks, and tooling repository. Uses Node.js-based
developer tools (Prettier, pre-commit, git-conventional-commits) managed via
Yarn PnP, with Python scripting via `uv`.

Hooks in `git/hooks/` are also exposed as pre-commit hooks for downstream
repositories. Changes to hooks must respect both native git invocation and the
pre-commit framework (for example, `post-checkout` may receive arguments via
`PRE_COMMIT_FROM_REF` and `PRE_COMMIT_CHECKOUT_TYPE` environment variables when
invoked by pre-commit).

The `post-checkout` hook runs `pre-commit autoupdate` as a best-effort step
after tooling sync; hook changes must not break this behavior or assume it is
the only way consumers receive updates. The hook requires `uv` and will fail if
`uv` is missing; errors from `pre-commit autoupdate` are explicitly swallowed
with `|| true`.

## Build and Test

- Lint/format: `yarn lint`
- Prettier check: `yarn lint:prettier`
- REUSE compliance: `yarn lint:reuse`
- Setup after clone: `yarn contribute`

## Source of Truth

- Tool versions → `.tool-versions`
- Node scripts and dev dependencies → `package.json`
- Python dependencies → `pyproject.toml`, `uv.lock`
- Conventional commit types → `git-conventional-commits.yaml`
- Renovate configuration → `.github/renovate.json5`
- Git hooks → `git/hooks/`
- pre-commit hook manifest → `.pre-commit-hooks.yaml`
- pre-commit configuration → `.pre-commit-config.yaml`

## Conventions

- All files MUST have SPDX license headers.
- pre-commit hooks enforce formatting and license annotation.
- Git hooks live in `git/hooks/` and are installed by `yarn contribute`.

  The hooks can also be consumed as a pre-commit source from another repository.
  See `README.md` for the consumer workflow.

## Maintenance

Update this file when you change workflows or conventions it describes.
