<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Renovate config validity and pattern semantics

Authoring date: 2026-11-11.

## Decision

Both Renovate strands — the authoring `.github/renovate.json5` and the
`renovate.json5.jinja` source that renders into consumers — must pass
`renovate-config-validator --strict`, and every `managerFilePatterns`
entry must be a `/.../`-wrapped regex. The pytest suite enforces both
against the authoring copy and every rendered variant.

## Defects

Four shipped on 2026-11-07, before the halt ([#308]):

- The pnpm-seed manager used `datasource` and `depName`. Custom managers
  take only the `*Template` forms, so Renovate rejected the authoring
  config and stopped every PR.
- The same manager used `fileMatch`, renamed to `managerFilePatterns` in
  Renovate 40.2.0. The automatic migration keeps it working but warns.
- The copyright-year managers carry unwrapped regex in
  `managerFilePatterns`, which takes glob and regex: an unwrapped value
  reads as a glob and matches nothing, so the year-bump mechanism of the
  copyright-lineage design has never extracted a dependency — in the
  authoring repo or any consumer.
- The authoring automerge rule named the manager `regex`; the manager
  reports as `custom.regex` since customManagers replaced regexManagers.
  The migration renamed it silently until `--strict` made the warning
  fatal.

## Mechanism

- `datasourceTemplate` and `depNameTemplate` replace the plain fields;
  `managerFilePatterns` with a `/^package\.json\.jinja$/` wrapper
  replaces `fileMatch`, and the automerge rules name `custom.regex` in
  both strands.
- The two copyright-year patterns gain `/.../` wrappers in both strands.
- The validator test runs `pnpm --package=renovate dlx
renovate-config-validator --strict` on the authoring copy and each
  render; the existing pytest CI job carries it, so no workflow edit is
  needed. The dlx floats latest on purpose: deprecations fail the suite
  before the hosted app migrates them away.
- The wrapper test asserts the `/.../` wrapper on every
  `managerFilePatterns` entry in both strands — the class of silent
  death the schema validator cannot see.

## Alternatives rejected

- A dedicated validator job in `.github/workflows/`: duplicates the
  rendering setup the suite already owns, and workflow edits need a
  workflow-scoped token a contributor bot lacks.
- A pre-commit hook: renovate is a ~100 MB download, too heavy per
  commit.
- Pinning the validator version: pinned, it stops catching new
  deprecations; unpinned, it drifts weekly, as the hosted app itself
  does.

[#308]: https://github.com/xenoterracide/base-template/issues/308
