<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Failsafe Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind Failsafe in the Java parent POM and compile integration tests into their own output so `*Test` classes in `src/testIntegration/java` run at `verify`.

**Architecture:** Failsafe configuration stays in `pluginManagement`; a named execution in `build/plugins` binds `integration-test` and `verify`. A second `testCompile` execution compiles `src/testIntegration/java` into `target/integration-test-classes`. Failsafe reads that directory; Surefire keeps `target/test-classes`. Render tests parse the rendered POM.

**Tech Stack:** Maven, maven-compiler-plugin 3.16.0, maven-failsafe-plugin 3.6.0, Copier/Jinja, pytest, `xml.etree.ElementTree`.

**Spec:** `docs/superpowers/specs/2026-11-22-failsafe-binding-design.md`

## Global Constraints

- Keep `useModulePath=true` on Failsafe.
- Keep pins: compiler `3.16.0`, Failsafe `3.6.0`, build-helper `3.8.0`.
- Source directory stays `src/testIntegration/java`.
- Execution IDs: `test-integration` and `test-integration-compile`.
- Failsafe includes, in order: `**/*Test.java`, `**/*IT.java`.
- Integration output: `${project.build.directory}/integration-test-classes`.
- IT generated sources: `${project.build.directory}/generated-test-sources/test-integration-annotations`.
- No new Copier answers, no new files, no sample IT.

## Review Focus

- Existing `*IT` classes in `src/testIntegration/java` must keep running. Test: render test asserts the legacy include.
- `useModulePath=true` must survive the config move. Test: render test reads managed Failsafe configuration.
- Skeleton render has no integration sources. Test: `./tests/verify.sh java` runs full `verify` on that render.
- Error Prone test args must reach both test compilations; main args stay on `default-compile`. Test: render test asserts `NullAway:OFF` at plugin level and `JSpecifyMode=true` on `default-compile`.
- JPMS must stay on for the IT compile. Test: render test asserts the IT execution sets no `useModulePath=false`.

---

### Task 1: Bind Failsafe and split integration test output

**Files:**

- Modify: `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`
- Modify: `tests/test_render.py`

**Interfaces:**

- Consumes: `generated` fixture from `tests/conftest.py`; XML namespace `http://maven.apache.org/POM/4.0.0`.
- Produces: parent POM executions `test-integration` and `test-integration-compile`; render test `test_java_failsafe_runs_integration_tests`.

- [ ] **Step 1: Add the failing render test**

In `tests/test_render.py`, change `expected_helpers` in `test_java_extra_source_roots_are_wired` to only `add-test-fixtures`, then add:

```python
def test_java_failsafe_runs_integration_tests(generated):
    """Integration tests share the *Test name and get their own output."""
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    ns = "{http://maven.apache.org/POM/4.0.0}"
    root = ET.parse(dst / "pom.xml").getroot()

    def plugins(path):
        qualified = "/".join(f"{ns}{part}" for part in path.split("/"))
        node = root.find(qualified)
        return {p.findtext(f"{ns}artifactId"): p for p in node.findall(f"{ns}plugin")}

    def executions(plugin):
        return {e.findtext(f"{ns}id"): e for e in plugin.findall(f"{ns}executions/{ns}execution")}

    managed = plugins("build/pluginManagement/plugins")["maven-failsafe-plugin"].find(f"{ns}configuration")
    assert managed.findtext(f"{ns}useModulePath") == "true"
    assert managed.findtext(f"{ns}testClassesDirectory") == "${project.build.directory}/integration-test-classes"
    assert [i.text for i in managed.findall(f"{ns}includes/{ns}include")] == ["**/*Test.java", "**/*IT.java"]

    failsafe = executions(plugins("build/plugins")["maven-failsafe-plugin"])
    assert set(failsafe) == {"test-integration"}
    assert [g.text for g in failsafe["test-integration"].findall(f"{ns}goals/{ns}goal")] == [
        "integration-test",
        "verify",
    ]

    compiler = executions(plugins("build/plugins")["maven-compiler-plugin"])
    it = compiler["test-integration-compile"]
    assert it.findtext(f"{ns}phase") == "test-compile"
    assert it.findtext(f"{ns}goals/{ns}goal") == "testCompile"
    assert it.findtext(f"{ns}configuration/{ns}outputDirectory") == (
        "${project.build.directory}/integration-test-classes"
    )
    assert it.findtext(f"{ns}configuration/{ns}generatedTestSourcesDirectory") == (
        "${project.build.directory}/generated-test-sources/test-integration-annotations"
    )
    roots = it.findall(f"{ns}configuration/{ns}compileSourceRoots/{ns}compileSourceRoot")
    assert [r.text for r in roots] == ["${project.basedir}/src/testIntegration/java"]
    assert it.findtext(f"{ns}configuration/{ns}useModulePath") is None

    compiler_plugin = plugins("build/pluginManagement/plugins")["maven-compiler-plugin"]
    args = [a.text for a in compiler_plugin.findall(f"{ns}configuration/{ns}compilerArgs/{ns}arg")]
    assert any("NullAway:OFF" in a for a in args)
    main_args = []
    for execution in compiler_plugin.findall(f"{ns}executions/{ns}execution"):
        if execution.findtext(f"{ns}id") == "default-compile":
            main_args = [a.text for a in execution.findall(f"{ns}configuration/{ns}compilerArgs/{ns}arg")]
    assert any("JSpecifyMode=true" in a for a in main_args)

    helpers = executions(plugins("build/plugins")["build-helper-maven-plugin"])
    assert set(helpers) == {"add-test-fixtures"}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `uv run --group dev pytest tests/test_render.py -q -k "failsafe or extra_source_roots"`
Expected: FAIL on the missing Failsafe execution and on the old two-entry helper set.

- [ ] **Step 3: Edit the parent POM**

In `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`:

- In `pluginManagement/maven-compiler-plugin/configuration`, replace the main `compilerArgs` list with the test list currently under the `default-testCompile` execution. Keep `annotationProcessorPaths` and `release` unchanged.
- Add a `default-compile` execution with `compile` goal and the main `compilerArgs` moved out of plugin level.
- Remove `compilerArgs` from `default-testCompile` so it inherits the plugin-level test list.
- Add `test-integration-compile` at `test-compile` with goal `testCompile` and the exact configuration from the render test.
- Add `maven-compiler-plugin` to `build/plugins` so the custom execution runs in parent and modules.
- Remove the `add-integration-test-sources` execution from `build-helper-maven-plugin`.
- In `pluginManagement/maven-failsafe-plugin/configuration`, keep `useModulePath=true` and add `testClassesDirectory` and the two includes from Global Constraints.
- Add `maven-failsafe-plugin` to `build/plugins` with execution `test-integration`, goals `integration-test` then `verify`.

- [ ] **Step 4: Run the targeted tests**

Run: `uv run --group dev pytest tests/test_render.py -q -k "failsafe or extra_source_roots"`
Expected: PASS.

- [ ] **Step 5: Run the full suite and a Java render verify**

Run: `uv run --group dev pytest tests/ -q`
Expected: PASS.

Run: `./tests/verify.sh java`
Expected: PASS, including `./mvnw -q verify` on a rendered project with no integration sources.

- [ ] **Step 6: Commit**

```bash
git add '{% if template_type == "java" %}pom.xml{% endif %}.jinja' tests/test_render.py
git commit -m "feat(template): bind Failsafe and split integration output"
```
