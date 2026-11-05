<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Revive base-template as the Source of Truth

Status: Accepted

Supersedes the toolchain choices in
[`2026-09-07-template-repo-design.md`](2026-09-07-template-repo-design.md).
That spec's copier mechanics, file layout, and two-hats design still stand.
This doc changes what the template hands out and adds the consumer-adoption
phase that spec deferred.

## Intent

base-template is the single source of truth for shared tooling. Every consumer
gets its shared files from here, by PR, not by hand.

Today it is stalled and behind its consumers. java-commons, agent-skills, and
github run pnpm 12.16.1 on node 26 with self-healing hooks. base-template runs
yarn 4.18 on node 24, keeps the old hook layout, and its half-finished copier
conversion generates yarn projects. Finishing it as-is would mint new yarn
repos into a pnpm ecosystem.

## Why

Files copied by hand drift. Each consumer now holds its own divergent copies of
hooks, lintstagedrc, and CI. Changes land in one repo and not the others. The
operator is the sync mechanism, and that is the problem.

## Goals

1. base-template runs the toolchain it hands out: pnpm 12.16.1, node 26.13.0,
   python 3.15.2, hooks in `.config/git/hooks/` with `heal.sh`.
2. The copier conversion finishes (Tasks 4–9 of the 9/7 plan) and generates
   pnpm consumers with self-healing hooks.
3. The `github` repo and java-commons adopt `.copier-answers.yml`. First
   update diffs stay small and clean.
4. `update-downstream.yml` opens PRs to adopted consumers on every push to
   develop.

## Non-goals

- A gradle variant, for now. spring-app-commons moves to Maven and adopts the
  java variant. The version catalog may stay on Gradle; if it does, a gradle
  variant returns when that repo asks for one.
- Migrating spring-app-commons. It is the stress test, after java-commons.
  It swaps Gradle for Maven and adopts the template in one pass.
- Changing consumer build logic: poms, source code, dependencies.

## Anti-goals

- Generated projects born on yarn.
- Two consumption models. The subtree/submodule story in the current README
  and AGENTS.md goes away; copier replaces it. The `github` repo already
  removed its `.share` subtree.

## Constraints

- **Two hats.** The repo is authoring checkout and template source at once.
  Every shared file serves both roles; a migration edits it once and both
  roles change together.
- **Copier mechanics** (verified empirically, see 9/7 plan): `_exclude`
  matches rendered destination paths; names with a `.jinja` sibling are not
  excluded; conditional path parts gate variants; `StrictUndefined` forces
  question order; dirty worktrees drop gitignored template files
  (`!.envrc.jinja` in the authoring `.gitignore`).
- **Reusable workflows.** `xenoterracide/github` ships `pnpm.yml`; `yarn.yml`
  is deleted. Any reference to `yarn.yml` is dead.
- **Node 26 ships no corepack.** corepack installs via npm; `heal.sh` and
  `contribute` handle it.
- **Workflow scope.** The agent token cannot push `.github/workflows/**`.
  This repo's CI is human-pushed; consumer workflows render into `staged/`.
- **Renovate runs continuously on develop.** Pins move weekly. The plan pins
  versions at execution time, not before.

## Approaches considered

1. **Copier, adopted by existing repos** — chosen. Parameterized output,
   update PRs, conflicts surface as `.rej` files. Cost: an answers file per
   consumer and a one-time manual adoption pass.
2. **git subtree** — rejected. No parameterization, merge pain, history
   noise. This is the model being escaped.
3. **Stay manual** — rejected. It is the status quo and the problem.

## Decisions

- **Toolchain matches java-commons and agent-skills.** `pnpm@12.16.1` via
  `packageManager`, nodejs 26.13.0, python 3.15.2 in `.tool-versions`.
- **Hooks follow agent-skills.** `.config/git/hooks/heal.sh` heals the
  toolchain: asdf, corepack, pnpm, uv, `core.hooksPath`. It serializes with
  `flock`, never fails a checkout, and exits 0. `.envrc` and `contribute`
  call it. post-checkout and post-merge diff lockfiles and heal on change.
  `sync-tooling` and `check-yarn-env` are deleted.
- **Lockfiles stay out of the template.** Consumers generate their own
  `pnpm-lock.yaml` on first `contribute`. The authoring lockfiles are
  `_exclude`d from output.
- **TypeScript variant uses `pnpm-workspace.yaml`.** No `workspaces` field in
  `package.json`.
- **A third variant covers config-only repos.** `template_type: config`
  renders the shared files and no build system. The `github` repo is its
  first consumer; it currently lacks `heal.sh` and its `.envrc` is the oldest
  form in the org. The same variant later serves any repo whose build files
  stay local, including a gradle version catalog.
- **`package.json` scripts follow java-commons.** `contribute` runs heal;
  `precontribute` sets up corepack and pnpm; `lint:reuse` runs through `uv`.
- **Pilot: the `github` repo, on the config variant.** Every shared file
  exists there and nothing else renders — the purest test of the update
  machinery: answers, `.rej`, heal delivery. Its reusable workflows stay
  hand-written; the template owns only the shared files. java-commons
  follows as the first variant-gated consumer, exercising skeleton
  suppression and pom ownership.
- **spring-app-commons is the stress test, deferred.** Eight modules, spring
  deps, the oldest toolchain (yarn 4.12). It migrates Gradle to Maven, then
  adopts the java variant.
- **The java variant generates one module.** Consumers add modules
  themselves; the template owns shared plumbing, not project shape.
- **The skeleton is optional.** An `include_skeleton` answer, default true.
  Adopted consumers seed it false so `copier update` never sprays `Example.java`
  into a live source tree or resurrects deleted scaffold.
- **The template owns the parent pom's quality gates.** Checkstyle, SpotBugs,
  JaCoCo, ErrorProne, javadoc, and the test toolchain BOM: junit, assertj,
  jspecify, error-prone annotations. The skeleton must pass `./mvnw verify` on
  first render. Product dependencies stay local.
- **The template's dependency set cannot rot silently.** `package.json.jinja`
  is not JSON; Renovate skips it. A pytest check asserts its ranges match the
  authoring `package.json`, so Renovate's authoring bumps drag the template
  along.
- **CI reuses the `github` repo's workflows.** `shfmt.yml`, `shellcheck.yml`,
  `prettier.yml`, `license.yml`, and `regression-devtool-*.yml` are reusable.
  base-template's inline shfmt and shellcheck jobs become `uses:` references.
  Staged consumer workflows do the same. No `github` repo change is needed:
  its `**/git/hooks/*` glob already covers `.config/git/hooks/`.
- **`renovate.json5` syncs with the consumers.** It gains the daily
  `before 4am` maintenance window and the `lock-file-maintenance` branchTopic
  rule that java-commons and agent-skills already carry. The npm manager
  reads `pnpm-lock.yaml` unaided; no pnpm-specific config exists to write.
- **prettier-plugin-toml jumps to v4.** v4 reformats `REUSE.toml`; agent-skills
  and `github` already carry the bump and the reformat. Migrate on v4 and
  reformat `REUSE.toml` and `REUSE.toml.jinja` together. Landing on v2 means
  Renovate bumps it later and prettier CI fails on a diff nobody wrote.
  java-commons lags on v2; its first update drags it along.
- **Three phases, each PR-sized.**
  1. Migrate the authoring repo: pnpm, heal.sh hooks, own CI, docs, commit
     the untracked `docs/`.
  2. Finish the template, pnpm-flavored: land staged Task 4, rework Tasks
     5–9.
  3. Adopt the `github` repo on the config variant: seed answers, run
     `copier update`, resolve `.rej`, wire `update-downstream.yml`. Then
     java-commons on the java variant.

**Full decision records.** The hooks choices summarized here live in
`2026-11-04-hooks-healing-design.md`; the pnpm migration in
`2026-11-04-pnpm-migration-design.md`. Both were moved from the consumer
repos this template now supplies. Read them there; this file keeps the
summary.

## What's left to the builder

- The exact file list for phase 1 (package.json, `.envrc`, `.gitignore`,
  `.lintstagedrc.cjs`, `.tool-versions`, hooks dir, own workflows, docs).
- Own CI rework: `pre-commit.yml` gains shfmt and shellcheck as `uses:`
  references; `test.yml`'s inline job dies; `devtools-regression.yml` keeps
  only the version-check job, which has no reusable form.
- Staged consumer workflows reference the reusable workflows instead of
  inlining shfmt and shellcheck.
- The pnpm rework of plan Tasks 4–9, file by file. Every yarn reference
  swaps; the 9/7 plan text is the map.
- The config variant: a third `template_type` choice, variant-conditioned
  scripts in `package.json.jinja`, and staged workflows for a repo with no
  build system.
- `.tool-versions.jinja` refresh: nodejs 26.13.0, temurin 25.0.5+8.0.LTS,
  ktlint 1.8.0, python 3.15.2.
- Test harness details: pytest assertions, `verify.sh`, smoke tests.
- Which consumer files the template owns and which stay local: the `github`
  repo's reusable workflows, java-commons' pom body and docs.
- Answers seeding and the first `copier update` runs — the `github` repo,
  then java-commons.
- The docs rewrites follow java-commons' sources-of-truth table (#649), not
  prose duplication.
- Completed plans are deleted before the final PR — the 9/7 plan and the plan
  this design produces both die when executed (agent-skills convention; the
  git-workflow skill requires it).

## Update propagation

`update-downstream.yml` pushes template changes into consumer repos. That is
its whole job. It shares nothing with `github`'s `update-java.yml`, which
exists because Renovate cannot update Gradle builds.

It follows the 9/7 plan's Task 8 design: checkout the consumer, point
`_src_path` at the local template checkout, run `copier update`, push a
branch, open a PR.

It needs a PAT that can push branches and open PRs in consumer repos. A human
creates that secret during phase 3; the plan marks it as a human task. Update
PRs merge by hand — they can carry `.rej` files. Auto-merge stays off until
clean updates are the norm.
