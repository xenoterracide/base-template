<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Java Source Set Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Java template wire Checkstyle and Error Prone for `testFixtures` and `testIntegration`, so `java-commons` gets that wiring on a Copier update.

**Architecture:** The Java parent POM gains `build-helper` executions that add both extra roots before `testCompile`, plus two Checkstyle executions bound to `verify`. The rendered `lint:maven` script names all four executions. No new Copier questions.

**Tech Stack:** Jinja templates, Maven 4 POMs, pytest render tests.

**Spec:** `docs/superpowers/specs/2026-11-20-java-source-set-parity-design.md`

## Global Constraints

- `main` and `test` stay unconditional.
- Extra roots are `src/testFixtures/java` and `src/testIntegration/java`.
- Config paths are `${maven.multiModuleProjectDirectory}/.config/checkstyle/<sourceSet>.xml`.
- Checkstyle execution IDs: `checkstyle-main`, `checkstyle-test`, `checkstyle-testFixtures`, `checkstyle-testIntegration`.
- `build-helper-maven-plugin` version: `3.8.0`.
- `build-helper` execution IDs: `add-test-fixtures`, `add-integration-test-sources`.
- Rare roots such as `testWhitebox` and `demoServer` stay consumer-side.
- No new Copier questions.
- Every text file ends with a newline.

## Review Focus

- A project without the extra directories must still build; test with the skeleton render.
- Each Checkstyle execution must point at its own config file; assert all four ID/config pairs.
- `build-helper` must bind to `generate-test-sources`, before `testCompile`; assert the phase.
- `lint:maven` must name all four executions; assert the exact script string.
- TypeScript and config renders must not gain Java POM wiring or `lint:maven`; existing variant tests cover this.

---

### Task 1: Wire extra source roots in the rendered POM

**Files:**

- Modify: `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`
- Test: `tests/test_render.py`

**Interfaces:**

- Produces: four Checkstyle execution IDs and two `build-helper` execution IDs consumed by Task 2's lint script.

- [ ] **Step 1: Add the failing render assertions**

In `tests/test_render.py`, extend `test_java_layout` with `.config/checkstyle/testFixtures.xml` and `.config/checkstyle/testIntegration.xml`. Add `test_java_extra_source_roots_are_wired(generated)` that skips non-java renders, parses `pom.xml` with `xml.etree.ElementTree`, and asserts:

- a `build-helper-maven-plugin` plugin under `build/plugins` with executions `add-test-fixtures` and `add-integration-test-sources`, each bound to `generate-test-sources` with goal `add-test-source`, and sources `src/testFixtures/java` and `src/testIntegration/java` respectively;
- the existing `maven-checkstyle-plugin` under `build/plugins` has executions `checkstyle-main`, `checkstyle-test`, `checkstyle-testFixtures`, `checkstyle-testIntegration`;
- each execution's `configLocation` ends in the matching `<sourceSet>.xml`;
- `checkstyle-testFixtures` points at `${project.basedir}/src/testFixtures/java` and `checkstyle-testIntegration` at `${project.basedir}/src/testIntegration/java`.

Use the Maven namespace `{http://maven.apache.org/POM/4.0.0}` for element lookup.

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run --group dev pytest tests/test_render.py::test_java_extra_source_roots_are_wired -q`
Expected: FAIL on the missing executions.

- [ ] **Step 3: Implement the POM wiring**

In `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`:

- add `<build-helper-maven-plugin.version>3.8.0</build-helper-maven-plugin.version>` to `<properties>`;
- add a `pluginManagement` entry for `org.codehaus.mojo:build-helper-maven-plugin` using that version property;
- add that plugin under `<build><plugins>` with the two source-adding executions from Step 1;
- add the two Checkstyle executions to the existing `maven-checkstyle-plugin` under `<build><plugins>`, each at `verify` with goal `check`, using the config paths and source directories asserted in Step 1.

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run --group dev pytest tests/test_render.py::test_java_extra_source_roots_are_wired tests/test_render.py::test_java_layout -q`
Expected: PASS.

- [ ] **Step 5: Commit and open the draft PR**

Commit with `feat(template): wire all java source sets`. Push. Open the PR as a draft once this step is pushed.

### Task 2: Name all four executions in lint:maven

**Files:**

- Modify: `package.json.jinja`
- Test: `tests/test_render.py`

**Interfaces:**

- Consumes: the four Checkstyle execution IDs from Task 1.

- [ ] **Step 1: Update the failing lint assertion**

In `test_lint_is_the_pre_push_set`, change the Java `scripts["lint:maven"]` expectation to include `checkstyle:check@checkstyle-testFixtures` and `checkstyle:check@checkstyle-testIntegration` after `checkstyle-test`, before `spotbugs:check@spotbugs-check`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run --group dev pytest tests/test_render.py::test_lint_is_the_pre_push_set -q`
Expected: FAIL on the shorter script.

- [ ] **Step 3: Update the rendered script**

Extend the Java `lint:maven` value in `package.json.jinja` with the two new Checkstyle goals, in the order from Step 1.

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run --group dev pytest tests/test_render.py::test_lint_is_the_pre_push_set -q`
Expected: PASS.

- [ ] **Step 5: Commit and push**

Commit with `feat(template): lint every java source set`. Push.

### Task 3: Verify the rendered project

**Files:** no source changes.

- [ ] **Step 1: Run the full render suite**

Run: `uv run --group dev pytest tests/ -q`
Expected: PASS.

- [ ] **Step 2: Verify a rendered Java project**

Run: `./tests/verify.sh java`
Expected: the generated project builds and all four Checkstyle executions pass, including with missing extra source directories.

- [ ] **Step 3: Settle fast checks**

Run `ghb pr verify`. Fix failures at any step. Then mark the PR ready and run `ghb pr verify` again.

- [ ] **Step 4: Notify**

Report the PR as `[base-template#NNN](url)`. Do not merge.
