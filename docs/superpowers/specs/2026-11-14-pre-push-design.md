<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Pre-push Design

## Intent

Lint failures surface in CI, minutes after the push. A pre-push hook
runs the project's `lint` locally, before the branch leaves the
machine.

The hook is dumb on purpose: `pnpm lint`, nothing else. `package.json`
already varies `lint` per variant, and it is the per-project extension
point — a project adds a linter by editing a script, never by editing a
hook. Hooks are hands-off files: lint-staged skips them, and they run
under their own executing shell.

## Goals

1. Every push runs `lint`: prettier everywhere, eslint on TypeScript,
   checkstyle + spotbugs on java, shellcheck on shell files.
2. One hook, identical in every variant. No jinja conditionals.
3. Pre-commit stays fixers-only — its current state.

## Non-goals

- No typecheck in pre-push. CI's `check` owns it; `typecheck` stays a
  script.
- No reuse lint in pre-push. Pre-commit annotates and downloads; the
  CI license job lints.
- No CI changes. The scripts stay, so the github repo's `pnpm.yml`
  (`pnpm run check`) keeps working untouched.

## Anti-goals

- No tool-direct hook with binary detection. Copier owns variant
  differences at render time; asdf + heal own tool presence
  (`.tool-versions` pins shellcheck). The hook is policy; the script
  is mechanism.
- No agent gating. The hook runs for everyone; humans have
  `git push --no-verify`.

## Approaches

| Approach                  | Shape                                                   | Trade                                                                     |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| A: dumb hook, `pnpm lint` | one invariant file; variant logic stays in package.json | the script is agent bait — running-commands governs that behaviorally     |
| B: tool-direct hook       | checkers inline per variant; lint/check scripts deleted | every new linter is hook surgery on a hands-off file; variant truth twice |

Picked A. The extension point beats the purity: the bait concern is
behavioral, and the running-commands skill exists to own it. This
supersedes that spec's "no lint scripts" constraint, which was still
under discussion; its model table maps `pnpm lint` to the pre-push
owner instead.

Gradle, when a variant lands, extends the same row: `lint:gradle`
wrapping the convention plugin's check goals. One conditional in
package.json.jinja; the hook never changes.

## The hook

`.config/git/hooks/pre-push` and its `.jinja` source. Executable, MIT
header, 2026 lineage, its siblings' shape:

```sh
#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT
[ -n "$CI" ] && exit 0

set -e
pnpm lint
```

## The scripts

`lint` becomes the pre-push set; `check` inherits it.

| Variant    | `lint`                                            | `check`                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------ |
| typescript | `lint:eslint && lint:prettier && lint:shellcheck` | `pnpm lint && pnpm typecheck && pnpm test` |
| java       | `lint:prettier && lint:shellcheck && lint:maven`  | `pnpm lint`                                |
| config     | `lint:prettier && lint:shellcheck`                | `pnpm lint`                                |

New scripts:

- `lint:shellcheck`, all variants:
  `shellcheck $(git ls-files '*.sh' '.envrc' ':(glob)**/git/hooks/*')` —
  the CI shellcheck job's pathspec. Sub-second, and the binary is
  pinned and healed.
- `lint:maven`, java:
  `./mvnw -B -q --no-transfer-progress test-compile checkstyle:check@checkstyle-main checkstyle:check@checkstyle-test spotbugs:check@spotbugs-check`.
  The `@execution-id` forms pick up the per-execution `configLocation`s;
  a bare `checkstyle:check` reads the default sun config. `test-compile`
  runs first because spotbugs reads classes, not sources.

`lint:reuse` stays a script but leaves `lint`. Java consumers' CI runs
the maven workflow only, so `lint:maven` never doubles a CI job;
TypeScript consumers run `check`, which absorbs the new lint wholesale.

## Decisions

- Dumb hook over tool-direct: single source of variant truth, no
  runtime detection to write or test, per-project extension point.
- tsc stays CI's, per the running-commands model: pre-push keeps the
  fast checks; the round trip buys type safety.
- Reuse out of lint: pre-commit just annotated and downloaded, and the
  license job lints — a pre-push re-check adds uv and network cost for
  near-zero catch.
- Shellcheck into lint: the running-commands model names it a pre-push
  checker; it is pinned, healed, and sub-second.

## Left to the builder

- Write the hook pair; `chmod +x` both; SPDX headers (2026 lineage).
- `package.json.jinja` and the authoring `package.json` per the table.
- Tests: `SHARED_FILES` and the hook lineage map gain `pre-push`;
  assert the hook renders byte-identical in every variant and contains
  `pnpm lint`; assert each variant's `lint` composition, including
  that `lint:reuse` is absent from it.
- `verify.sh`: run `CI='' sh .config/git/hooks/pre-push` in the render,
  so the hook is proven green on a fresh project.
- AGENTS.md.jinja Build-and-Test lines for the new scripts; the
  authoring AGENTS.md rows.
