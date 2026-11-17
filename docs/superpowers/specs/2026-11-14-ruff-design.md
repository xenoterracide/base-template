<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Ruff Design

## Intent

The authoring repo grew a python codebase — the render tests — with no
linter and no formatter. Prettier does not format python, so nothing
rode along. Ruff closes the gap with one tool: checker and formatter,
milliseconds on this tree.

Extends the pre-push model (`2026-11-14-pre-push-design.md`): the hook
stays dumb, and `package.json` stays the extension point.

## Decisions

- lint:ruff is authoring-only. The authoring checkout is a config
  render plus its python tests, so its lint is the config set with a
  ruff segment — `pnpm lint:prettier && pnpm lint:ruff && pnpm
lint:shellcheck && pnpm lint:reuse`. It extends its own template the
  way any project adds a linter: by editing scripts.
- Renders never require ruff. A render ships no python, and its
  uv.lock is consumer-owned — copier cannot deliver a dependency into
  it and heal syncs frozen — so a rendered lint:ruff would push every
  consumer into a lock migration for a linter that never finds a
  file. A project that adds python adds lint:ruff itself.
- The rendered dev group is reuse only. Renovate's hosted app runs
  copier on its own infrastructure — every consumer's template update
  in git history is a renovate[bot] commit — so the manual refresh
  documents `uvx copier update --trust`, and `_min_copier_version`
  guards the unpinned one-shot. The authoring dev group keeps its
  python extras (copier, pyyaml, pytest, ruff): verify.sh renders
  through the dev-group copier.
- lint:ruff:
  `uv run --frozen --group dev ruff check . && uv run --frozen --group dev ruff format --check .`
- `[tool.ruff]` in the authoring pyproject: `line-length = 120`
  (prettier parity; ruff defaults to black's 88) and
  `include = ["*.py", "**/*.py"]` — 0.17 also formats markdown and
  lints pyproject.toml, both prettier's files; two formatters over one
  file type drift apart.
- `.ruff_cache` is gitignored in the authoring .gitignore. Ruff's
  cache stays on, unlike eslint's ruling — ruff's analysis is
  single-file AST, so a cached file cannot miss a cross-file finding.
- Pre-commit's `*.py` fixer row (reuse annotate, `ruff check --fix`,
  `ruff format`) is shared: it fires only when .py files are staged,
  which renders never do.
- CI: the pytest job runs `pnpm lint:ruff` before pytest.

## Consumer impact

None. The rendered lint set and dev group shrink; removing a
dependency from a manifest leaves the lock with a vestigial entry —
nothing fails under `--frozen`, and nightly lock-file maintenance
prunes it. No consumer migration.
