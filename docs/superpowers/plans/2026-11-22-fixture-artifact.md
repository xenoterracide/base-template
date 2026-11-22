<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Fixture Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish test fixtures as a classified Maven jar and stop putting fixture sources or unit-test classes on the integration-test classpath.

**Architecture:** `src/testFixtures/java` compiles to its own output and is attached as a `test-fixtures` classified jar. Compiled fixture classes are staged into `target/test-classes` before unit and IT compilation, without adding the source root to javac. Failsafe reads its own output plus the fixture output, never all of `target/test-classes`.

**Tech Stack:** Maven 3, maven-compiler-plugin 3.16.0, maven-jar-plugin 3.5.1, build-helper-maven-plugin 3.8.0, maven-failsafe-plugin 3.6.0, Copier render tests.

**Spec:** `docs/superpowers/specs/2026-11-22-failsafe-binding-design.md`

## Global Constraints

- Keep `useModulePath=true` on Surefire and Failsafe.
- Failsafe `testClassesDirectory` is `${project.build.directory}/integration-test-classes`.
- Failsafe `additionalClasspathElements` is `${project.build.directory}/test-fixtures-classes`.
- Fixture output is `${project.build.directory}/test-fixtures-classes`.
- IT output is `${project.build.directory}/integration-test-classes`.
- Classifier is `test-fixtures`.
- Execution ids are `test-fixtures-compile`, `stage-test-fixtures`, `test-fixtures-jar`, `test-integration`, and `test-integration-compile`.
- Generated source dirs are `${project.build.directory}/generated-test-sources/test-fixtures-annotations` and `${project.build.directory}/generated-test-sources/test-integration-annotations`.
- build-helper has no `add-test-source` execution.
- Error Prone plugin-level args keep `NullAway:OFF`; `default-compile` keeps `JSpecifyMode=true`.
- Do not add a Copier question or a Maven profile.

## Review Focus

- Fixture `module-info.java` must not collide with the test module descriptor. Task 2 asserts `**/module-info.class` is excluded from staging; Task 3 builds a fixture descriptor.
- A consumer declaring the `test-fixtures` classifier must resolve jar and classes. Task 1 asserts the attached jar; Task 3 consumes it from a second module.
- Failsafe must not see unit-test classes. Task 2 asserts the fixture-only classpath; Task 3 checks failsafe reports contain only the IT.
- Error Prone args must stay split across main and test compiles. Task 1 asserts both lists.
- Legacy `*IT.java` files must keep running. Task 1 asserts the include; Task 3 runs one.

---

### Task 1: Compile and attach the fixture jar

**Files:**

- Modify: `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`
- Test: `tests/test_render.py`

**Interfaces:**

- Consumes: existing `maven-jar-plugin` pluginManagement entry; existing compiler plugin-level test `compilerArgs`.
- Produces: attached artifact classifier `test-fixtures`; compiler execution `test-fixtures-compile`.

- [ ] **Step 1: Write the failing test**

Add `test_java_publishes_test_fixtures(generated)` to `tests/test_render.py`. Use the same `ns`, `plugins(path)`, and `executions(plugin)` helpers as `test_java_failsafe_runs_integration_tests`. For a java render, assert:

```python
jar = executions(plugins("build/pluginManagement/plugins")["maven-jar-plugin"])["test-fixtures-jar"]
assert jar.findtext(f"{ns}phase") == "package"
assert [g.text for g in jar.findall(f"{ns}goals/{ns}goal")] == ["jar"]
assert jar.findtext(f"{ns}configuration/{ns}classifier") == "test-fixtures"
assert jar.findtext(f"{ns}configuration/{ns}classesDirectory") == (
    "${project.build.directory}/test-fixtures-classes"
)

fixture = executions(plugins("build/plugins")["maven-compiler-plugin"])["test-fixtures-compile"]
assert fixture.findtext(f"{ns}phase") == "generate-test-sources"
assert fixture.findtext(f"{ns}goals/{ns}goal") == "testCompile"
assert fixture.findtext(f"{ns}configuration/{ns}outputDirectory") == (
    "${project.build.directory}/test-fixtures-classes"
)
assert fixture.findtext(f"{ns}configuration/{ns}generatedTestSourcesDirectory") == (
    "${project.build.directory}/generated-test-sources/test-fixtures-annotations"
)
roots = fixture.findall(f"{ns}configuration/{ns}compileSourceRoots/{ns}compileSourceRoot")
assert [r.text for r in roots] == ["${project.basedir}/src/testFixtures/java"]

compiler_plugin = plugins("build/pluginManagement/plugins")["maven-compiler-plugin"]
args = [a.text for a in compiler_plugin.findall(f"{ns}configuration/{ns}compilerArgs/{ns}arg")]
assert any("NullAway:OFF" in a for a in args)
main = [e for e in compiler_plugin.findall(f"{ns}executions/{ns}execution") if e.findtext(f"{ns}id") == "default-compile"][0]
main_args = [a.text for a in main.findall(f"{ns}configuration/{ns}compilerArgs/{ns}arg")]
assert any("JSpecifyMode=true" in a for a in main_args)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run --group dev pytest tests/test_render.py -q -k "fixture"`

Expected: FAIL with `KeyError: 'test-fixtures-jar'`.

- [ ] **Step 3: Add the POM executions**

In `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`:

- Add a `test-fixtures-jar` execution to the `maven-jar-plugin` entry in `<build><pluginManagement>`. Bind it to `package`, goal `jar`, classifier `test-fixtures`, `classesDirectory` `${project.build.directory}/test-fixtures-classes`.
- Add a `test-fixtures-compile` execution to the `maven-compiler-plugin` entry in `<build><plugins>`. Bind it to `generate-test-sources`, goal `testCompile`, with the fixture root, output, and generated source dir from Step 1. Do not restate `compilerArgs`; the execution inherits the plugin-level test list.

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run --group dev pytest tests/test_render.py -q -k "fixture or failsafe or extra_source_roots"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/test_render.py "{% if template_type == 'java' %}pom.xml{% endif %}.jinja"
git commit -m "feat(template): attach test fixtures jar"
```

### Task 2: Stop bundling fixtures into test output

**Files:**

- Modify: `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`
- Modify: `tests/test_render.py`
- Modify: `README.md.jinja`

**Interfaces:**

- Consumes: `test-fixtures-compile` from Task 1.
- Produces: build-helper execution `stage-test-fixtures`; Failsafe classpath limited to fixture output.

- [ ] **Step 1: Change the render tests to fail**

In `test_java_extra_source_roots_are_wired`, replace the `expected_helpers` block with assertions for one execution named `stage-test-fixtures`:

```python
helpers = executions(build["build-helper-maven-plugin"])
assert set(helpers) == {"stage-test-fixtures"}
staged = helpers["stage-test-fixtures"]
assert staged.findtext(f"{ns}phase") == "generate-test-resources"
assert staged.findtext(f"{ns}goals/{ns}goal") == "add-test-resource"
resource = staged.find(f"{ns}configuration/{ns}resources/{ns}resource")
assert resource.findtext(f"{ns}directory") == "${project.build.directory}/test-fixtures-classes"
assert [e.text for e in resource.findall(f"{ns}excludes/{ns}exclude")] == ["**/module-info.class"]
```

In `test_java_failsafe_runs_integration_tests`, change the classpath assertion to:

```python
assert classpath == ["${project.build.directory}/test-fixtures-classes"]
```

Add to `test_java_publishes_test_fixtures`:

```python
assert "<classifier>test-fixtures</classifier>" in (dst / "README.md").read_text()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --group dev pytest tests/test_render.py -q -k "fixture or failsafe or extra_source_roots"`

Expected: FAIL on the build-helper execution set and the Failsafe classpath.

- [ ] **Step 3: Replace source-root wiring with staged output**

In `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`:

- Replace the `add-test-fixtures` build-helper execution with `stage-test-fixtures` at `generate-test-resources`, goal `add-test-resource`, resource directory `${project.build.directory}/test-fixtures-classes`, exclude `**/module-info.class`.
- Replace the Failsafe `additionalClasspathElement` value with `${project.build.directory}/test-fixtures-classes`.

In `README.md.jinja`, add to the java section:

```text
Fixture classes are published with the `test-fixtures` classifier. A module
that uses another module's fixtures declares that classifier with `test` scope.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --group dev pytest tests/test_render.py -q -k "fixture or failsafe or extra_source_roots"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/test_render.py "{% if template_type == 'java' %}pom.xml{% endif %}.jinja" README.md.jinja
git commit -m "fix(template): publish fixtures instead of merging them"
```

### Task 3: Prove the artifact boundary in a render

**Files:** none in the repository. Use a temporary render.

**Interfaces:**

- Consumes: Task 1 classifier and Task 2 classpath.
- Produces: verification evidence for PR #354.

- [ ] **Step 1: Build a fixture with a module descriptor and an IT that uses it**

Render into `$(mktemp -d /tmp/opencode/fixture-boundary.XXXXXX)` using `PYTHONPATH=tests uv run --group dev python -c` with `copy_template(Path(sys.argv[1]), JAVA_ANSWERS)`, as used in earlier verification. Add:

- `module/sample/src/testFixtures/java/com/example/fixture/Fixture.java` with `public static String value()`.
- `module/sample/src/testFixtures/java/module-info.java` declaring `module com.example.fixture { exports com.example.fixture; }`.
- `module/sample/src/testIntegration/java/com/example/integration/LegacyIT.java` whose `@Test` method asserts `Fixture.value()`.
- `module/sample/src/test/java/com/example/sample/blackbox/ExampleTest.java` stays as rendered.

Run: `./mvnw -B -q --no-transfer-progress verify`

Expected: PASS. If javac cannot resolve `com.example.fixture`, add the fixture
output to `--module-path` in the compiler configuration and rerun. Do not set
`useModulePath=false`. Then assert:

```bash
jar tf module/sample/target/sample-0.0.0-test-fixtures.jar | rg 'module-info.class|Fixture.class'
ls module/sample/target/failsafe-reports/TEST-com.example.integration.LegacyIT.xml
ls module/sample/target/surefire-reports/TEST-com.example.sample.blackbox.ExampleTest.xml
```

- [ ] **Step 2: Consume the fixture classifier from a second module**

Copy `module/sample` to `module/consumer`. Change the consumer artifactId to `consumer`; add `module/consumer` to the parent `<modules>`. Add a test-scoped dependency on `com.example:sample:0.0.0` with `<classifier>test-fixtures</classifier>`. Replace the consumer's test with one that calls `Fixture.value()`.

Run: `./mvnw -B -q --no-transfer-progress verify`

Expected: PASS. The consumer test finds the fixture class. It never sees `sample`'s unit tests.

- [ ] **Step 3: Record the evidence**

Run: `git diff --stat origin/develop...HEAD`

Expected: only the two POM/render/doc files changed in Tasks 1 and 2, plus the already committed spec. No temporary smoke files enter the repository.

- [ ] **Step 4: Push and settle checks**

```bash
git p && ghb pr verify
```

Expected: pre-push hooks print a clean lint/reuse summary and `ghb pr verify` prints `pass`.

- [ ] **Step 5: Update the PR and Jira**

Update the PR body with the fixture classifier. Add a PR comment and an XTC-21 comment naming the verified boundary. Mark the PR ready if it is not already ready.
