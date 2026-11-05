# Revive base-template Implementation Plan

<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make base-template the source of truth again: pnpm + self-healing hooks in the authoring repo, a finished copier template that generates pnpm consumers, and adoption by the `github` repo and java-commons.

**Architecture:** Three phases, each a PR. Phase 1 migrates the authoring repo's toolchain (branch clean off `origin/develop`; the WIP template commits stay parked on local `develop`). Phase 2 lands the WIP and finishes the template, pnpm-flavored, on top of merged phase 1. Phase 3 adopts consumers in their own repos and wires `update-downstream.yml`. The 9/7 plan carries file contents for Tasks 3–9 of that plan; this plan carries the deltas — every yarn reference swaps, plus the new decisions.

**Tech Stack:** copier 9.19.1 / Jinja2 / pytest 9.2.0 / pnpm 12.16.1 / node 26.13.0 / uv + Python 3.15.2 / Maven wrapper / heal.sh (POSIX sh)

**Spec:** `docs/superpowers/specs/2026-11-04-revive-source-of-truth-design.md`

## Global Constraints

- pnpm `12.16.1` via `packageManager`; nodejs `26.13.0`, python `3.15.2`; java consumers: temurin `25.0.5+8.0.LTS`, ktlint `1.8.0`.
- `prettier-plugin-toml` `^4.0.0`; `REUSE.toml` in v4 format (blank line between `[[annotations]]` blocks).
- copier `>= 9.0.0`, `_envops: undefined: jinja2.StrictUndefined`, conditional path parts gate variants, `_exclude` matches rendered destination paths.
- Every file carries an SPDX header. `.jinja` sources carry baked whole-line moustache headers; literal `SPDX-*` templates in `copier.yml` stay wrapped in `REUSE-Ignore` markers.
- The agent token cannot push `.github/workflows/**`. Tasks touching that path end with a human-required push step.
- Never merge a PR. Show the PR URL, head SHA, and green checks; wait for the human's explicit yes.
- Commit only named files. Never `git add -A` or `git add .`: fifteen staged java-variant files and a regenerated `uv.lock` ride the working tree through phase 1 and belong to phase 2 (Tasks 5 and 8).
- Commit types from `git-conventional-commits.yaml`. Quiet flags: `git --quiet`, `pnpm --reporter=silent`, `uv --quiet`.
- Two hats: shared files serve the authoring repo and the template at once. One edit changes both roles.
- Pins move (Renovate runs continuously). If a pinned version is newer at execution, use the newer and say so in the commit body.

## Review Focus

1. **Dirty-worktree copies drop gitignored template files** — copier re-stages via `git add -A`, so `.envrc.jinja` (matched by `.env*`) vanishes and the stale static `.envrc` wins. Test: `test_envrc_is_heal_form` renders from the live checkout (dirty during execution) and asserts `heal.sh` in the content. (Task 11)
2. **Skeleton leaks into adopted consumers** — `copier update` must never spray `Example.java` into a live tree. Test: `test_skeleton_suppressed` renders java with `include_skeleton: false`, asserts no `module/` and no `Example.java`. (Task 11)
3. **config variant renders build files** — it must render shared files only. Test: `test_config_layout` asserts no `pom.xml`, `mvnw`, `packages/`, `pnpm-workspace.yaml`, and that `heal.sh` is present. (Task 11)
4. **Lockfiles leak into consumer output** — consumers generate their own on first `contribute`. Test: `test_no_lockfiles_in_output` asserts neither `pnpm-lock.yaml` nor `uv.lock` exists in a render. (Task 11)
5. **Template ranges drift from the authoring set** — Renovate only touches the authoring `package.json`. Test: `test_package_json_ranges_match_authoring` parses both files and compares every shared `devDependencies` range. (Task 11)

---

## Phase 1 — Authoring repo migration (PR 1)

### Task 1: Self-healing hooks and .envrc

**Files:**

- Create: `.config/git/hooks/heal.sh` (copy)
- Modify: `.config/git/hooks/{pre-commit,post-checkout,post-merge}` (from `git/hooks/`, reworked)
- Modify: `.config/git/hooks/commit-msg` (moved unchanged)
- Delete: `git/hooks/{sync-tooling,check-yarn-env}` and the emptied `git/hooks/`
- Modify: `.envrc`

**Interfaces:**

- Produces: `.config/git/hooks/heal.sh`, executable; `.envrc` calling it. Consumed by Task 2 (`contribute` script) and Task 7 (`.envrc.jinja` mirrors it).

- [ ] **Step 1: Branch clean off origin/develop and move the hooks**

```bash
git checkout -b chore/pnpm-heal origin/develop
mkdir -p .config/git/hooks
git mv git/hooks/pre-commit git/hooks/commit-msg git/hooks/post-checkout git/hooks/post-merge .config/git/hooks/
git rm git/hooks/sync-tooling git/hooks/check-yarn-env
```

The staged java-variant files and the regenerated `uv.lock` ride the working tree; leave them staged.

- [ ] **Step 2: Copy heal.sh and the agent-skills hook forms**

Copy verbatim from `/home/ai/agent-skills/.config/git/hooks/`: `heal.sh` (chmod +x), `post-checkout`, `post-merge`, `pre-commit`. All carry MIT 2026 headers — copy headers too. `commit-msg` stays as moved; it validates through `git-conventional-commits` and is identical in shape.

- [ ] **Step 3: Rewrite .envrc to the heal entry**

```sh
#!/bin/sh
# direnv entry: everything heals through one script.
./.config/git/hooks/heal.sh
```

With the MIT SPDX header from agent-skills' `.envrc`. No `.share`, no `PATH`, no hooksPath warning — heal does it all.

- [ ] **Step 4: Verify the hooks**

Run: `shfmt -d .config/git/hooks/ && shellcheck .config/git/hooks/* && sh .config/git/hooks/heal.sh`
Expected: no diff, no shellcheck findings, heal exits 0 (asdf installs, corepack enables, pnpm skips — no `pnpm-lock.yaml` yet — uv syncs, hooksPath sets to `.config/git/hooks`).

- [ ] **Step 5: Commit**

```bash
git add .config/git/hooks .envrc
git commit -m "feat(hooks): centralize toolchain healing in heal.sh"
```

### Task 2: pnpm migration of the authoring repo

**Files:**

- Modify: `package.json`, `.tool-versions`, `.gitignore`, `.lintstagedrc.cjs`, `REUSE.toml`, `.github/renovate.json5`
- Delete: `yarn.lock`
- Create: `pnpm-lock.yaml` (generated)

**Interfaces:**

- Consumes: `heal.sh` from Task 1.
- Produces: `packageManager: "pnpm@12.16.1"`; scripts named `contribute`, `precontribute`, `setup:corepack`, `setup:pnpm`, `reuse`, `lint`, `lint:prettier`, `lint:reuse`, `check`. Task 7's `package.json.jinja` mirrors these names; Task 11's sync-check compares the shared ranges.

- [ ] **Step 1: package.json**

`packageManager: "pnpm@12.16.1"`. `prettier-plugin-toml` `^2.0.6` → `^4.0.0`. Scripts, copied from agent-skills' forms:

```json
"contribute": "sh .config/git/hooks/heal.sh",
"precontribute": "pnpm setup:corepack && pnpm setup:pnpm",
"setup:corepack": "npm install --global corepack && corepack enable --install-directory ~/.local/bin",
"setup:pnpm": "pnpm install --frozen-lockfile",
"reuse": "uv run --frozen --group dev reuse",
"lint:prettier": "prettier --ignore-unknown --cache --check '**'",
"lint:reuse": "pnpm reuse lint",
"lint": "pnpm lint:prettier && pnpm lint:reuse",
"check": "pnpm lint"
```

- [ ] **Step 2: Swap the lockfiles and tools**

```bash
rm yarn.lock
rm -rf .yarn .pnp.* node_modules
sed -i 's/^nodejs .*/nodejs 26.13.0/' .tool-versions
asdf install
pnpm install
```

`pnpm install` generates `pnpm-lock.yaml` (fresh resolve; do not `pnpm import`).

- [ ] **Step 3: .gitignore**

Delete the yarn block: `.yarn/*` and its five `!.yarn/…` negations, the PnP comment lines, `.pnp.*`. `node_modules` stays.

- [ ] **Step 4: .lintstagedrc.cjs**

Replace `withoutYarn` with java-commons' `withoutGenerated` (filters `/(^|\/)pnpm-lock\.yaml$/`), keep the `.config/git/hooks/**` glob as is.

- [ ] **Step 5: REUSE.toml in v4 format**

Rename the `yarn.lock` annotation path to `pnpm-lock.yaml`, then run `pnpm exec prettier --write REUSE.toml` — v4 inserts the blank lines between blocks. Match agent-skills' `REUSE.toml` shape.

- [ ] **Step 6: renovate.json5 sync**

Add inside `lockFileMaintenance`: `schedule: ["before 4am"]` with java-commons' comment. Append java-commons' third package rule verbatim (`matchUpdateTypes: ["lockFileMaintenance"]`, `branchTopic: "lock-file-maintenance"`, `prPriority: -1`, with its comment).

- [ ] **Step 7: Verify**

Run: `pnpm contribute && pnpm lint`
Expected: heal exits 0 (node 26, pnpm install frozen, uv sync, hooksPath); prettier + reuse pass. Then `git status --porcelain` shows only the named files plus the parked phase-2 files.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .tool-versions .gitignore .lintstagedrc.cjs REUSE.toml .github/renovate.json5
git rm --quiet yarn.lock 2>/dev/null || true
git commit -m "chore: migrate to pnpm"
```

### Task 3: Own CI rework

**Files:**

- Modify: `.github/workflows/pre-commit.yml`, `.github/workflows/devtools-regression.yml`
- Delete: `.github/workflows/test.yml`

**Interfaces:**

- Produces: the workflow shape consumers get in Task 10's `staged/` — same job set, same digest pin style.

- [ ] **Step 1: Digest pin**

Run: `git -C /home/ai/github rev-parse origin/develop`
Use that SHA for every `xenoterracide/github/.github/workflows/*@…` ref in this task, with `# develop` comments.

- [ ] **Step 2: pre-commit.yml**

Add `shfmt` and `shellcheck` jobs as `uses:` references. Drop the inline `shfmt` job. Final job set: `license`, `prettier`, `shfmt`, `shellcheck` — agent-skills' `pre-commit.yml` is the model.

- [ ] **Step 3: Kill test.yml; trim devtools-regression.yml**

`git rm .github/workflows/test.yml` (its only job was inline shellcheck). In `devtools-regression.yml`, update the four regression refs to the new digest; keep the inline `shell` version-check job (no reusable form exists).

- [ ] **Step 4: Verify and commit**

Run: `pnpm lint:prettier` (yaml formatting). Commit `ci: reuse shfmt and shellcheck workflows` with the named files. **Human-required:** `.github/workflows/**` cannot be pushed by the agent token — flag the push step at PR time.

### Task 4: Docs rewrite and commit the specs

**Files:**

- Modify: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`
- Create: `docs/superpowers/**` (untracked specs and plans, committed)

**Interfaces:**

- Produces: the prose that Task 12 updates with test commands and deletes plans from.

- [ ] **Step 1: Rewrite the three docs**

Follow java-commons #649: a sources-of-truth table, not duplicated prose. Cover: copier purpose (`copier copy` / `copier update --trust`), `pnpm contribute`, heal-based hooks at `.config/git/hooks/`, `pnpm lint`, pytest suite (commands land in Task 12), license tiers, renovate expectations. Hemingway style — short sentences, no semicolon joins. Delete every subtree/submodule mention and every `yarn` reference.

- [ ] **Step 2: Verify**

Run: `pnpm lint && grep -riE 'yarn|subtree|submodule' README.md AGENTS.md CONTRIBUTING.md`
Expected: lint passes; grep finds nothing.

- [ ] **Step 3: Commit docs and specs**

```bash
git add README.md AGENTS.md CONTRIBUTING.md docs/
git commit -m "docs: rewrite docs for copier template purpose"
```

- [ ] **Step 4: Open PR 1**

Push the branch, open the PR with a heredoc body (git-workflow skill), show URL + head SHA + green checks. **Wait for the human.** Expected checks: license, prettier, shfmt, shellcheck, devtools-regression.

---

## Phase 2 — Finish the template (PR 2)

Branch off merged `develop` (origin/develop + PR 1 + the four parked WIP commits; expect a trivial `.gitignore` conflict when syncing the WIP — keep both sides: no yarn block, `!.envrc.jinja` kept).

### Task 5: Repair uv.lock

**Files:**

- Modify: `uv.lock` (regeneration diff already sits in the working tree from planning; if absent, `rm uv.lock && uv lock`)

**Interfaces:**

- Produces: a parseable lock carrying the WIP dev group (`copier`, `pyyaml`, `pytest`, `reuse`). Every `uv run --group dev` in Tasks 6–11 depends on it.

- [ ] **Step 1: Verify the dev tools resolve**

Run: `uv run --frozen --group dev copier --version && uv run --frozen --group dev pytest --version`
Expected: `copier 9.19.1`-era and `pytest 9.2.0`-era output (newer is fine).

- [ ] **Step 2: Commit**

```bash
git add uv.lock
git commit -m "fix: regenerate uv.lock for template dev deps"
```

### Task 6: copier.yml — pnpm, skeleton toggle, config variant

**Files:**

- Modify: `copier.yml`

**Interfaces:**

- Produces: answer `include_skeleton` (bool, default `true`) and `template_type` choice `config`. Tasks 8 and 9 consume them in conditional path parts: `{% if template_type == 'java' and include_skeleton %}module{% endif %}`, `{% if template_type == 'typescript' and include_skeleton %}packages{% endif %}`.

- [ ] **Step 1: Apply the deltas**

`_exclude`: `yarn.lock` → `pnpm-lock.yaml`; delete `.yarn/` and `.pnp.*` entries; keep the rest. `_message_after_copy`: `pnpm contribute`. `template_type` choices gain `Config: config`. `license` choices gain `CC0-1.0: CC0-1.0` (config-only repos seed it; scripts stay MIT regardless — that is baked into `.lintstagedrc.cjs.jinja`, not driven by the answer). New answer after `use_opencode`: `include_skeleton`, `type: bool`, `default: true`, help text explaining adopted consumers seed it false.

- [ ] **Step 2: Smoke all three variants**

Run: `uv run --group dev copier copy --trust --defaults --data template_type=java --data project_name=smoke /tmp/smoke-java` (and `typescript`, `config` into their own dirs)
Expected: three copies succeed; java renders `module/smoke/`, typescript renders `packages/smoke/` (still yarn-flavored inside — Tasks 7–9 fix content), config renders neither.

- [ ] **Step 3: Commit** — `feat: add config variant and skeleton toggle`

### Task 7: Shared jinja files, pnpm-flavored

**Files:**

- Modify: `package.json.jinja`, `.envrc.jinja`, `.gitignore.jinja`, `.prettierignore.jinja`, `REUSE.toml.jinja`, `.tool-versions.jinja`, `.lintstagedrc.cjs.jinja`, `README.md.jinja`, `AGENTS.md.jinja`, `CONTRIBUTING.md.jinja`

**Interfaces:**

- Consumes: Task 2's script names; Task 1's `.envrc` and hooks (the verbatim `git/hooks/*` copy list from the 9/7 plan becomes `.config/git/hooks/{heal.sh,pre-commit,commit-msg,post-checkout,post-merge}` — those files already live there, two hats).
- Produces: renders whose `packageManager` is `pnpm@12.16.1`.

- [ ] **Step 1: Apply the swap list**

9/7 plan Task 3 contents with these changes: `packageManager: "pnpm@12.16.1"`; scripts per Task 2, conditioned `{% if template_type == 'typescript' %}` for `lint:eslint`/`typecheck`/`test`; drop the `workspaces` field; `contribute` runs heal. `.envrc.jinja` = Task 1's `.envrc` with the moustache header. `.gitignore.jinja`: delete the yarn block (`.yarn/*`, negations, `.pnp.*`). `.prettierignore.jinja`: drop `.yarn/`. `REUSE.toml.jinja`: `yarn.lock` → `pnpm-lock.yaml`, v4 blank lines. `.tool-versions.jinja`: `nodejs 26.13.0`, `python 3.15.2`, java block `java temurin-25.0.5+8.0.LTS`, `ktlint 1.8.0`. `.lintstagedrc.cjs.jinja`: `withoutYarn` → `withoutGenerated`. Docs jinjas: `yarn` → `pnpm`, hooks path `.config/git/hooks`, heal wording.

- [ ] **Step 2: Verify a java render carries no yarn**

```bash
uv run --group dev copier copy --trust --defaults --data template_type=java --data project_name=smoke /tmp/smoke-java
! grep -r yarn /tmp/smoke-java --exclude-dir=.git
test -x /tmp/smoke-java/.config/git/hooks/heal.sh
```

Expected: all three succeed.

- [ ] **Step 3: Commit** — `feat: generate pnpm consumers`

### Task 8: Land the staged java variant files

**Files:**

- Commit the fifteen staged files (9/7 plan Task 4 list), with path parts updated for the skeleton gate

**Interfaces:**

- Consumes: `include_skeleton` from Task 6. `{% if template_type == 'java' %}module{% endif %}` becomes `{% if template_type == 'java' and include_skeleton %}module{% endif %}` in all six staged module paths (plain `mv` + `git add` the new names).

- [ ] **Step 1: Rename the module paths, verify exec bits**

`mv` the six staged `module/…` paths to the `and include_skeleton` form. Check `mvnw`… `.jinja` keeps its exec bit; the raw-wrapped bodies stay untouched.

- [ ] **Step 2: Smoke test java with and without skeleton**

Both renders from Task 6's command pattern: `include_skeleton` true renders `module/smoke/src/.../Example.java`; false renders no `module/`. `mvnw` is `+x` and byte-identical to `/home/ai/java-commons/mvnw`.

- [ ] **Step 3: Commit** — `feat: add java variant files with module skeleton`

### Task 9: TypeScript variant on pnpm workspaces

**Files:**

- Create: `{% if template_type == 'typescript' %}pnpm-workspace.yaml{% endif %}.jinja`
- Create: the 9/7 plan Task 5 file set (eslint, tsconfigs, vitest, packages skeleton), pnpm-flavored

**Interfaces:**

- Consumes: `include_skeleton` (packages path part), Task 7's root scripts.
- Produces: `pnpm-workspace.yaml` listing `packages/*` — the only workspace declaration in a ts render.

- [ ] **Step 1: Create the files**

9/7 plan Task 5 contents with: packages path part gains `and include_skeleton`; `packages/{{ first_package }}/package.json.jinja` drops `packageManager` and `prepack` becomes `pnpm build`; `pnpm-workspace.yaml.jinja` body is `packages:\n  - "packages/*"` with a CC0 moustache header.

- [ ] **Step 2: Smoke test typescript**

Render with defaults; `pnpm-workspace.yaml` present, `packages/smoke/` present, `grep -r yarn` finds nothing. Render with `include_skeleton: false`; no `packages/`, `pnpm-workspace.yaml` still present (workspace declaration is not skeleton).

- [ ] **Step 3: Commit** — `feat: add typescript variant on pnpm workspaces`

### Task 10: Staged consumer workflows

**Files:**

- Create: `staged/.github/workflows/{pre-commit,test,devtools-regression,{% if use_opencode %}opencode{% endif %}}.yml.jinja`, `staged/README.jinja`

**Interfaces:**

- Consumes: Task 3's digest SHA and job shape.

- [ ] **Step 1: Write them**

9/7 plan Task 6 contents with: every job that has a reusable form becomes a `uses:` reference at the digest — `shfmt`, `shellcheck` included, no inline shell jobs; `test.yml` uses `pnpm.yml` for typescript (never `yarn.yml` — deleted upstream) and `maven.yml` for java; `test.yml` itself gets the filename gate `{% if template_type != 'config' %}test.yml{% endif %}.jinja` (config has no build to test); `devtools-regression.yml.jinja` carries the four regression refs only.

- [ ] **Step 2: Smoke all three variants**

Each render has `staged/.github/workflows/pre-commit.yml`, `devtools-regression.yml`, `opencode.yml` (default `use_opencode: true`); `test.yml` only for java and typescript; `use_opencode: false` drops `opencode.yml`.

- [ ] **Step 3: Commit** — `feat: add staged consumer workflows`

### Task 11: Test harness

**Files:**

- Create: `tests/conftest.py`, `tests/test_render.py`, `tests/verify.sh` (+x)

**Interfaces:**

- Consumes: everything above; `copy_template` fixture answers `COMMON`, `JAVA_ANSWERS`, `TS_ANSWERS`, `CONFIG_ANSWERS` (add `template_type: "config"` to COMMON's clones).

- [ ] **Step 1: Write the pytest suite**

Port the 9/7 plan Task 7 tests, pnpm-flavored: `packageManager == "pnpm@12.16.1"`; shared-file list uses `.config/git/hooks/{heal.sh,pre-commit,commit-msg,post-checkout,post-merge}` and asserts `sync-tooling`/`check-yarn-env` absent. Add the five Review Focus tests: `test_envrc_is_heal_form`, `test_skeleton_suppressed` (java, `include_skeleton: false`), `test_config_layout`, `test_no_lockfiles_in_output`, `test_package_json_ranges_match_authoring` (parse `package.json.jinja` by stripping `{% … %}`/`{{ … }}` before `json.loads`, then compare shared ranges to the authoring `package.json`). Keep `test_reuse_lint`.

- [ ] **Step 2: Run it**

Run: `uv run --group dev pytest tests/ -v`
Expected: all PASS, both variant fixtures plus config.

- [ ] **Step 3: Write verify.sh**

9/7 plan Task 7 with `pnpm install` / `pnpm lint:prettier` / `pnpm lint:reuse`; java runs `./mvnw -q verify`, typescript runs `pnpm typecheck && pnpm test`, config runs `pnpm check`. Accepts `java|typescript|config`.

- [ ] **Step 4: Verify and commit**

Run one full `./tests/verify.sh config` locally (cheapest). Commit `feat: add template self-test harness` with `tests/`.

### Task 12: Own CI, spec statuses, plan cleanup

**Files:**

- Create: `.github/workflows/test-template.yml`
- Modify: `AGENTS.md` (test commands), both specs' status lines
- Delete: `docs/superpowers/plans/*.md` (the 9/7 plan and this plan)

- [ ] **Step 1: test-template.yml**

9/7 plan Task 8 shape with node `26.13.0`, `uv sync --group dev`, jobs: `pytest`, `verify-java`, `verify-typescript`, `verify-config`. **Human-required push** (workflow scope).

- [ ] **Step 2: Docs and specs**

Add the test commands to `AGENTS.md`'s Build and Test section. Set both specs `Status: Accepted`; append the pnpm/heal/config deviations to the 9/7 spec's deviations list.

- [ ] **Step 3: Delete completed plans, final lint, commit**

`git rm docs/superpowers/plans/2026-09-07-template-repo.md docs/superpowers/plans/2026-11-04-revive-source-of-truth.md`; run `pnpm lint`; commit `docs: accept specs and remove completed plans`.

- [ ] **Step 4: Open PR 2**

Push, PR, heredoc body, URL + SHA + checks. **Wait for the human.** Expected checks include `test-template` (after the human pushes the workflow) plus the PR 1 set.

---

## Phase 3 — Adoption (PRs in consumer repos)

### Task 13: The github repo adopts the config variant

**Worktree:** `/home/ai/github`, branch `chore/copier-adopt` off `origin/develop`.

- [ ] **Step 1: Seed the answers**

Write `.copier-answers.yml` by hand: `_src_path: https://github.com/xenoterracide/base-template`, `_commit:` <base-template develop SHA after PR 2>, `template_type: config`, `project_name: github`, `license: CC0-1.0` (configs; scripts stay MIT — baked into the rendered `.lintstagedrc.cjs`), `use_opencode: true`, `copyright_holder: Caleb Cushing`, `copyright_year: "2026"`.

- [ ] **Step 2: Run the update against the local template**

```bash
sed -i "s|^_src_path:.*|_src_path: /home/ai/base-template|" .copier-answers.yml
uvx copier update --trust --defaults --conflict rej .
sed -i "s|^_src_path:.*|_src_path: https://github.com/xenoterracide/base-template|" .copier-answers.yml
```

Expected diff: `.envrc` becomes the heal entry; `heal.sh` arrives; hooks refresh; `.lintstagedrc.cjs` and `REUSE.toml` update (v4); `renovate.json5` gains the schedule and rule if absent; `package.json` scripts switch to heal-based; `staged/` appears.

- [ ] **Step 3: Resolve and verify**

Resolve any `.rej`. Run `pnpm contribute && pnpm lint && shfmt -d .config/git/hooks/ && shellcheck .config/git/hooks/*` in that repo. Note which `staged/` workflows to copy into `.github/workflows/` — **human-required** (workflow scope, and that repo's workflows are the org's reusable set).

- [ ] **Step 4: PR in xenoterracide/github** — heredoc body, URL + SHA + checks, **wait for the human.**

### Task 14: java-commons adopts the java variant

**Worktree:** `/home/ai/java-commons`, branch `chore/copier-adopt` off `origin/develop`.

- [ ] **Step 1: Seed answers**

As Task 13 with: `template_type: java`, `project_name: java-commons`, `java_group_id: com.xenoterracide`, `java_module: tools`, `java_version:` read from its root `pom.xml` at execution, `license: Apache-2.0`, `include_skeleton: false`.

- [ ] **Step 2: Update, resolve, verify**

Same update flow. Expected: `pom.xml` `.rej` only around java-commons' local dependencies (template owns quality gates and the test BOM); `module/tools` untouched; `staged/` brings the shfmt and shellcheck workflows its `pre-commit.yml` lacks; `.envrc` becomes the heal entry. Verify with `pnpm contribute && pnpm lint && ./mvnw -q verify`.

- [ ] **Step 3: PR in xenoterracide/java-commons** — **wait for the human.**

### Task 15: update-downstream wiring

**Files:**

- Create: `.github/workflows/update-downstream.yml` (base-template)

- [ ] **Step 1: Human task — the PAT**

The human creates a PAT with push + pull-request scope for consumer repos and adds it as `DOWNSTREAM_UPDATE_PAT` in base-template's settings. Nothing else in this task works without it.

- [ ] **Step 2: Write the workflow**

9/7 plan Task 8 design: checkout template + consumer (matrix: `xenoterracide/github`, `xenoterracide/java-commons`), rewrite `_src_path` to the local checkout, `uvx copier update --trust --defaults --conflict rej .`, restore the canonical `_src_path`, branch, push, `gh pr create`. Update PRs hand-merge — no auto-merge step. **Human-required push.**

- [ ] **Step 3: First run**

After the human pushes and the next push to develop lands (or `workflow_dispatch`), verify the run completes and opens no PR when consumers are current, or one clean PR each. Show the run URL.

- [ ] **Step 4: PR for the workflow** — **wait for the human.**
