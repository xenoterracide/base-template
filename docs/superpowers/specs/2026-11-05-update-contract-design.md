<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Update Contract: Template Owns Behavior, Consumers Own Versions

Status: Accepted

Extends
[`2026-11-04-revive-source-of-truth-design.md`](2026-11-04-revive-source-of-truth-design.md).
That spec says consumers adopt through `copier update`. This one defines what
an update is allowed to change.

## Intent

`copier update` should carry the shared behavior — scripts, hooks, configs,
lint rules, REUSE path rules, workflow shape, the parent pom's quality-gate
structure. It should not carry version bumps. Versions are seeds: the template
writes them when a project is created, and the consumer's Renovate owns them
after that.

## Why

Renovate bumps the authoring copies of `.tool-versions`, `package.json`,
`pom.xml`, and `pyproject.toml` continuously. The template's `.jinja` sources
cannot be managed by Renovate, so keeping them in sync is manual. Every sync
turns a weekly dependency bump into a template commit, and every template
commit becomes update noise in every consumer — often a conflict with the
bump Renovate already made there.

## What Renovate and REUSE do for a consumer

Renovate owns the rendered files:

- `.tool-versions` (asdf)
- `package.json` devDependencies and `packageManager` (npm)
- `pom.xml` plugins and BOMs (maven)
- `pyproject.toml` dependencies (pep621)
- `.github/workflows/*.yml`: action SHAs, reusable-workflow refs, and `with:`
  versions for the supported actions, including `setup-node`, `setup-java`,
  and `setup-uv`

REUSE is lint-only: `reuse lint` enforces headers and lint-staged's
`reuse annotate` adds them. It does not manage versions or template updates.

## What Renovate cannot do for the template

- See `.jinja` sources. The npm, asdf, maven, and pep621 managers match the
  literal filenames, not their `.jinja` siblings.
- Parse variant conditionals or moustaches, or know which of the three
  variants renders.
- See `staged/.github/workflows/*.yml.jinja`, or the conditional
  `{% if template_type == 'java' %}.mvn{% endif %}` directory.
- Drive `copier update`. Its copier manager tracks `git-tags`; this repo has
  no tags, and the hosted app will not run the template's `--trust` tasks.
  It cannot resolve `.rej` conflicts either.

## Decision

- **Behavior is managed.** Updates apply scripts, hook logic, configs, lint
  rules, `REUSE.toml` path rules, workflow shape, and pom quality-gate
  structure.
- **Versions are seeded.** `.tool-versions` and the Maven wrapper (`mvnw`,
  `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties`) are listed in
  `_skip_if_exists`. Copier drops them from the update patch; an existing file
  is never rewritten, and a deleted one is recreated. Lockfiles already stay
  out through `_exclude`. `.mvn/jvm.config` stays managed: it carries JVM
  flags, not versions.
- **Mixed files keep the merge.** `package.json`, `pom.xml`, and
  `pyproject.toml` stay managed because they carry scripts and gates. Copier's
  three-way merge preserves the consumer's Renovate bumps as long as the
  template does not edit those lines. Rule: never edit version lines in
  `.jinja` sources to track upstream; bump them only for a deliberate floor.
- **Drift test checks the dependency set, not the ranges.** The authoring
  `package.json` still defines which shared tools exist. The test asserts every
  authoring dependency is present in `package.json.jinja`; versions are seeds.
- **Fresh copies seed current pins.** `.tool-versions.jinja` includes the
  authoring `.tool-versions` for the common lines. The include only matters at
  creation, because updates skip the file.

## Approaches considered

1. **Keep syncing versions into `.jinja`.** Rejected. Every Renovate bump
   becomes a template commit, and every template commit becomes downstream
   update noise or a conflict.
2. **Generate versions at bootstrap; commit no pins.** Rejected. The toolchain
   would depend on the day and the machine, and CI could not reproduce it.
   Version churn becomes build flakiness.
3. **Seed versions, manage behavior.** Chosen. The consumer's Renovate already
   owns the rendered files; the template stops competing with it.

## Consequences

- Template pins age by design. Ranges are floors, so `pnpm install` and
  `mvnw verify` still resolve current versions in the template's CI.
- Downstream CI stays a snowflake. `staged/` is a seed; the active
  `.github/workflows/` is copied and consumer-owned, and its Renovate maintains
  the pins. `update-downstream` carries shape, not versions.
- A consumer that deletes `.tool-versions` or a wrapper file gets it back on
  the next update; that is Copier's documented `_skip_if_exists` behavior.

## Acceptance

- A rendered project's `.tool-versions` matches the authoring common lines plus
  the variant lines.
- `copier update` leaves a modified `.tool-versions` untouched.
- The `package.json` drift test asserts the dependency set, not the ranges.
- `pytest` and `tests/verify.sh` pass for java, typescript, and config.
