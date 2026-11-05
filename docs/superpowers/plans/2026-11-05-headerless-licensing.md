<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Headerless Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all license-header rendering from the template so `reuse annotate` (via lint-staged) is the sole producer of in-file SPDX headers.

**Architecture:** Three changes: strip the header moustaches and their machinery from every `.jinja` source and `copier.yml`; drop the speculative `.gitmodules` annotation; rework the template's render verification to run lint-staged before reuse lint, mirroring the consumer flow. The license scheme stays in `.lintstagedrc.cjs`; REUSE.toml of consumers keeps only exemptions.

**Tech Stack:** Copier 9.19.1 templates (Jinja, StrictUndefined, keep_trailing_newline), Python/pytest, pnpm, REUSE 6.x.

**Spec:** [docs/superpowers/specs/2026-11-05-headerless-licensing-design.md](../specs/2026-11-05-headerless-licensing-design.md)

## Global Constraints

- Copier default jinja env: `undefined: jinja2.StrictUndefined`; `keep_trailing_newline=True` — file-ending newlines come from the `.jinja` source's own final newline.
- Jinja must render byte-perfect structure; do not rely on post-copy prettier to fix a render. No stray blank lines from false conditional blocks.
- Every tracked file ends with a newline (`.editorconfig`); `pnpm lint` (prettier + REUSE) must pass.
- Conventional commits, `Assisted-by: GLM:glm-5.3` trailer.
- Update contract stands: `.tool-versions`, `mvnw*`, `.mvn/wrapper/maven-wrapper.properties` stay `_skip_if_exists`; versions are seeds.
- The license scheme lives in `.lintstagedrc.cjs` only; do not add per-file-type annotations to the consumer `REUSE.toml`.

## Review Focus

1. **Unannotated file type** — a file outside every lint-staged row renders headerless and then fails `reuse lint` after commit. The consumer `lint:reuse` gate and verify.sh's annotate-then-lint must catch it.
2. **Headerless-incapable files** — `package.json`, `tsconfig*.json`, `.mvn/jvm.config` can only be licensed by an annotate-created `.license` sidecar; after stripping the `.license.jinja` templates, nothing provides them until the first commit.
3. **Dual declaration on re-staging** — the original failure: annotate re-run over an existing header must add nothing. verifies only via the annotate-then-lint flow, not by a render assertion.
4. **Adopted repos with existing headers** — on `copier update`, the template no longer touches header lines, so a consumer's in-file headers survive the 3-way merge; the github adoption is the real proof.
5. **Speculative annotations** — `.gitmodules` (and any future nonexistent file) must not ship in the consumer `REUSE.toml`.

---

### Task 1: Stop rendering license headers

**Files:**

- Modify: every file named by `grep -rln "spdx_copyright_line\|spdx_license_line\|project_license_line" --include="*.jinja" .` — remove the header block. Root/shared: `README.md.jinja`, `AGENTS.md.jinja`, `CONTRIBUTING.md.jinja`, `.envrc.jinja`, `.gitignore.jinja`, `.prettierignore.jinja`, `.lintstagedrc.cjs.jinja`, `pyproject.toml.jinja`, `REUSE.toml.jinja`, `.copier-answers.yml.jinja`, `staged/README.jinja`, `staged/.github/workflows/*.jinja`, `{% if template_type == 'typescript' %}pnpm-workspace.yaml{% endif %}.jinja`, `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja`, `{% if template_type == 'typescript' %}vitest.config.ts{% endif %}.jinja`. Variant sources: the java `module/*/pom.xml.jinja`, `*.java.jinja`, `.config/checkstyle/*.xml.jinja`, `.config/spotbugs/exclude.xml.jinja`; the ts `packages/*/src/index.ts.jinja`, `packages/*/test/index.test.ts.jinja`.
- Delete: `package.json.license.jinja`, `{% if template_type == 'typescript' %}tsconfig.eslint.json.license{% endif %}.jinja`, `{% if template_type == 'typescript' and include_skeleton %}packages{% endif %}/{{ first_package }}/package.json.license.jinja`, `{% if template_type == 'typescript' and include_skeleton %}packages{% endif %}/{{ first_package }}/tsconfig.json.license.jinja`, `{% if template_type == 'java' %}.mvn{% endif %}/jvm.config.license.jinja`.
- Modify: `copier.yml` — delete the `spdx_copyright_line`, `project_license_line`, `spdx_license_line` answers and the `copyright_year` question; keep `copyright_holder`, `license`, `license_url`, `npm_scope`.
- Test: `tests/test_render.py`

**Interfaces:**

- Produces: headerless renders; `.copier-answers.yml` without `copyright_year`; the template still resolves under StrictUndefined.

- [ ] **Step 1: Write the failing test**

  ```python
  def test_renders_carry_no_baked_headers(generated):
      """reuse annotate, not the template, writes SPDX headers."""
      dst, _ = generated
      for path in dst.rglob("*"):
          if not path.is_file() or path.name == "REUSE.toml":
              continue
          text = path.read_text()
          assert "SPDX-FileCopyrightText" not in text, path.name
          assert "SPDX-License-Identifier" not in text, path.name
      assert "# SPDX-License-Identifier" not in (dst / "REUSE.toml").read_text()

  def test_no_license_sidecars_rendered(generated):
      """Annotate, not the template, creates .license sidecars."""
      dst, _ = generated
      assert not [p for p in dst.rglob("*.license")]

  def test_answers_record_no_header_machinery(generated):
      """copyright_year and spdx_* answers no longer exist."""
      dst, _ = generated
      answers = (dst / ".copier-answers.yml").read_text()
      assert "copyright_year" not in answers
      assert "spdx_" not in answers
  ```

- [ ] **Step 2: Run it to confirm failure**

  Run: `uv run --group dev pytest tests/test_render.py::test_renders_carry_no_baked_headers tests/test_render.py::test_no_license_sidecars_rendered tests/test_render.py::test_answers_record_no_header_machinery -q`
  Expected: FAIL — renders currently contain baked `SPDX-*` lines, `.license` files, and `copyright_year` in the answers.

- [ ] **Step 3: Strip headers, delete sidecar templates, prune copier.yml**

  For each modified `.jinja`, delete the header block but not the first content line; leave the leading `{`/first line intact so rendered structure is unchanged apart from the removed header. In `copier.yml`, remove the four hidden/computed `SPDX-*` answers and the `copyright_year` question (the comment above it explains they were added for adopted-repo ranges — no longer needed).

- [ ] **Step 4: Run to confirm pass**

  Run: same three tests, then `uv run --group dev pytest tests/ -q`
  Expected: PASS; full suite green apart from `test_reuse_lint`, which still expects compliant bare renders (fixed in Task 3).

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "feat: stop rendering license headers; reuse owns them"
  ```

### Task 2: Drop the speculative .gitmodules annotation

**Files:**

- Modify: `REUSE.toml` (authoring), `REUSE.toml.jinja` (rendered).

**Test:** `tests/test_render.py`

- [ ] **Step 1: Write the failing test**

  ```python
  def test_reuse_toml_carries_no_gitmodules(generated):
      dst, _ = generated
      assert ".gitmodules" not in (dst / "REUSE.toml").read_text()
  ```

- [ ] **Step 2: Run to confirm failure**

  Run: `uv run --group dev pytest tests/test_render.py::test_reuse_toml_carries_no_gitmodules -q`
  Expected: FAIL — the rendered REUSE.toml annotates `.gitmodules`.

- [ ] **Step 3: Remove the `[[annotations]]` block for `.gitmodules` from both REUSE.toml files**

  In `REUSE.toml.jinja` delete the `[[annotations]]` / `path = ".gitmodules"` / both SPDX lines block (keep the following `**/*.lockfile` block). Mirror in the authoring `REUSE.toml`.

- [ ] **Step 4: Run to confirm pass**

  Run: the test above, then `uv run --group dev pytest tests/ -q`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "fix: drop the speculative .gitmodules annotation"
  ```

### Task 3: Annotate before linting in render verification

**Files:**

- Modify: `tests/verify.sh` (the "Committing the render" section), `tests/test_render.py` (`test_reuse_lint`).

- [ ] **Step 1: Rewrite `test_reuse_lint` to annotate first**

  Change it to run `pnpm exec lint-staged` after staging the render, then `reuse lint`, asserting returncode 0. Use the same sequence as verify.sh (see Step 3). With Task 1 in place, the un-modified test now fails — that is the RED for this step.

- [ ] **Step 2: Run to confirm the un-modified flow fails**

  Run: `uv run --group dev pytest tests/test_render.py::test_reuse_lint -q`
  Expected: FAIL — the bare render has no headers.

- [ ] **Step 3: In `tests/verify.sh`, run lint-staged between `git add` and `git commit`**

  ```sh
  git add -A
  pnpm exec lint-staged        # annotates + prettifies per .lintstagedrc.cjs
  git -c user.name=verify -c user.email=verify@localhost commit -qm "verify render"
  ```

  This mirrors the consumer's first-commit flow: annotate writes headers and `.license` sidecars, then the later `pnpm lint:reuse` sees a compliant tree.

- [ ] **Step 4: Run the full bar**

  Run: `uv run --group dev pytest tests/ -q`, then `./tests/verify.sh java`, `./tests/verify.sh typescript`, `./tests/verify.sh config`, then `pnpm lint`
  Expected: all pass; REUSE reports compliant.

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "test: annotate before linting rendered projects"
  ```
