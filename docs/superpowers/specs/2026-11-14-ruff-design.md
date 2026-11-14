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

Extends the pre-push model (`2026-11-14-pre-push-design.md`):
`lint:ruff` joins `lint` in every variant, and the hook stays dumb.

## Decisions

- `lint:ruff`, all variants:
  `uv run --frozen --group dev ruff check . && uv run --frozen --group dev ruff format --check .`
  Renders ship no python; ruff exits 0 on an empty tree (measured,
  0.17.5), so the set stays uniform and a render pays milliseconds.
- The dev group gains `ruff` in both pyproject strands, so
  `uv run --frozen --group dev` resolves it wherever lint:ruff runs.
- `[tool.ruff]` `line-length = 120`: prettier parity. Ruff defaults to
  black's 88.
- Ruff's cache stays on, unlike eslint's ruling. Ruff's analysis is
  single-file AST — no cross-file type graph — so a cached file cannot
  miss a cross-file finding. `.ruff_cache` is gitignored in the shared
  strand.
- Pre-commit gains a `*.py` fixer row: reuse annotate, `ruff check
--fix`, `ruff format`, on staged files. In renders the row never
  fires — no python to stage.
- CI: the pytest job runs `pnpm lint:ruff` before pytest.

## Consumer migration

The rendered dev group gains ruff. `uv.lock` is consumer-owned and
never rides copier updates, and heal runs `uv sync --frozen`, so a
consumer whose lock predates ruff fails lint:ruff with
command-not-found until it relocks. Each consumer adds ruff to its
pyproject dev group and runs `uv lock` ahead of the tagged update —
the same shape as the shellcheck pin migration
([java-commons#702](https://github.com/xenoterracide/java-commons/pull/702)).
