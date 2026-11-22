<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Failsafe Binding Design

## Intent

The Java template adds `src/testIntegration/java` through build-helper. It pins
`maven-failsafe-plugin` in `pluginManagement` with `useModulePath=true`.
Nothing binds `integration-test` or `verify`. Integration sources compile.
Their tests never run.

XTC-21: bind those goals. Keep the module path. Add a render test that fails
when the wiring disappears.

Integration tests keep the same `*Test` name as unit tests. The source
directory is the only marker. No `*IT` suffix.

## Approaches

Binding:

- **Parent `build/plugins`, named execution.** Every module inherits it.
  Skeleton-less renders get it too. Chosen.
- **`pluginManagement` executions only.** Dead when no module declares
  Failsafe.
- **`integration-tests` profile.** Reverses the 2026-11-20 decision to wire
  source sets without profiles.

Selection:

- **JUnit tags.** Uniform names, small POM diff. The tag decides, not the
  directory.
- **Separate compiled output.** ITs compile to their own directory. Failsafe
  reads that directory. The directory decides. Chosen.
- **Package convention.** Works, but the package decides, not the directory.

## Decisions

- Keep Failsafe's version and `useModulePath=true` in `pluginManagement`.
- Add Failsafe to parent `<build><plugins>` with execution id `test-integration`,
  goals `integration-test` then `verify`. The `test` prefix survives.
- Leave the skeleton module's Failsafe declaration. Parent configuration merges
  into it. Add no Copier answers.
- Drop build-helper's `add-integration-test-sources` execution. Keep
  `add-test-fixtures`.
- Add a `maven-compiler-plugin` execution `test-integration-compile` at
  `test-compile`. Set `compileSourceRoots` to
  `${project.basedir}/src/testIntegration/java` and `outputDirectory` to
  `${project.build.directory}/integration-test-classes`. Give it its own
  `generatedTestSourcesDirectory`.
- Share one Error Prone argument list. Move the test `compilerArgs` from
  `default-testCompile` to plugin-level configuration. Give `default-compile`
  its own main arguments. Both test compilations then inherit the same list.
- In Failsafe's pluginManagement configuration set `testClassesDirectory` to
  `${project.build.directory}/integration-test-classes` and includes to
  `**/*Test.java`. Keep a `**/*IT.java` include until consumers rename their
  old classes. Keep `useModulePath=true`.
- Surefire needs no excludes. It reads `target/test-classes` only.
- Update render tests. Assert the Failsafe execution and its goals. Assert
  `useModulePath`, `testClassesDirectory`, and includes. Assert the new compiler
  execution's roots and output. Assert build-helper now has one execution.
- Add no sample IT. `tests/verify.sh` already runs `./mvnw verify`.
- Leave JaCoCo aggregation to XTC-26. Leave semver's IT migration to XTC-44.

## Test suite taxonomy

Four Gradle suite names do not map to four Maven runners. Split them by axis.

- **Visibility — whitebox versus blackbox.** JPMS decides this at compile time.
  Whitebox tests patch the main module. Blackbox tests require it from outside.
  One source root cannot hold both descriptors. Keeping integration sources out
  of `target/test-classes` leaves room for another compiled test output. That is
  the seam for a future split.
- **Lifecycle — unit versus integration.** Surefire reads the unit output at
  `test`. Failsafe reads the integration output after `package`, at
  `integration-test` and `verify`. Use it for tests that need the packaged jar,
  an external process, or state torn down after a failure. Speed is not the
  test.
- **Scope — end-to-end.** A scope claim, not a lifecycle. It usually lands on
  Failsafe. Distinguish it with JUnit tags or a name pattern, not another
  runner.

Maven can add suites as executions with includes or JUnit `<groups>`. Keep the
`test-integration` execution named so a second Failsafe execution has a home.
Selection comes from the compiled directory, not from a suffix. Maven cannot
reproduce Gradle's top-level task tree. Execution ids, source directories, and
wrapper scripts are the closest it gets.

This change does not decide whitebox/blackbox module layout. That needs its own
design. Take no shortcut here that closes the door: no classpath fallback, no
merged test output, no anonymous executions.

## Non-goals

- Whitebox and blackbox source sets.
- A new Copier question or profile.
- Changing Checkstyle, SpotBugs, or JaCoCo wiring.
- Migrating or renaming semver's ITs.

## Consumer impact

A Copier update adds one compiler execution and one Failsafe execution. IT
classes move out of `target/test-classes`. Old `*IT` classes keep running
through the legacy include until they are renamed. Render tests catch drift.
