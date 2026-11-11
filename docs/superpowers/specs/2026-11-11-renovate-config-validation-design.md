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

- A dedicated validator job that renders variants itself: duplicates the
  rendering setup the suite already owns. The shipped `validate-renovate`
  job takes the scoped form instead — the authoring copy only, a fast
  named check that pinpoints the config that halts the repo; render-side
  validation stays in the pytest job.
- Renovate as a devDependency: the authoring package.json names the
  shared tool set, and the subset test would push its ~200 MB into every
  consumer install; the weekly major-bump churn and the pinned version's
  blindness to new deprecations follow from it. dlx shares one copy per
  machine through the pnpm store.
- A pre-commit hook: renovate is a ~100 MB download, too heavy per
  commit.
- Pinning the validator version: pinned, it stops catching new
  deprecations; unpinned, it drifts weekly, as the hosted app itself
  does.
- Validating the `.jinja` source directly: jinja is not json5, and
  stripping tags re-implements rendering, which lies the moment the
  config grows conditionals. The renders are the only faithful form,
  and the suite validates every one.

[#308]: https://github.com/xenoterracide/base-template/issues/308
