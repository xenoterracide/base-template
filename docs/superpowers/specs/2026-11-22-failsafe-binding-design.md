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

Test fixtures are a published variant. `gradle-semver/module/semver` consumes
`git`'s fixtures. Maven needs the same boundary. One module's tests must never
depend on another module's test classes.

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

Fixtures:

- **Classified fixture jar.** Compile fixtures to their own output. Attach a
  `test-fixtures` jar. Consumers declare a dependency. Chosen.
- **Full tests jar.** One goal, but publishes unit tests. Rejected.
- **Source root only.** Current wiring. No cross-module boundary. Rejected.

## Decisions

- Keep Failsafe's version and `useModulePath=true` in `pluginManagement`.
- Add Failsafe to parent `<build><plugins>` with execution id `test-integration`,
  goals `integration-test` then `verify`. The `test` prefix survives.
- Leave the skeleton module's Failsafe declaration. Parent configuration merges
  into it. Add no Copier answers.
- Drop both build-helper executions. No extra source root joins
  `target/test-classes`.
- Add a `maven-compiler-plugin` execution `test-fixtures-compile` at
  `generate-test-sources`. Set `compileSourceRoots` to
  `${project.basedir}/src/testFixtures/java` and `outputDirectory` to
  `${project.build.directory}/test-fixtures-classes`. Give it its own
  `generatedTestSourcesDirectory`.
- Stage compiled fixture classes into `target/test-classes` at
  `generate-test-resources` with `build-helper:add-test-resource`. Exclude
  `module-info.class`. Unit and IT compilers see fixtures without fixture
  source roots.
- Attach `test-fixtures-classes` as a `test-fixtures` classified jar with
  `maven-jar-plugin` at `package`. `install` and `deploy` carry it. Consumers
  declare the classifier with `test` scope.
- Add a `maven-compiler-plugin` execution `test-integration-compile` at
  `test-compile`. Set `compileSourceRoots` to
  `${project.basedir}/src/testIntegration/java` and `outputDirectory` to
  `${project.build.directory}/integration-test-classes`. Give it its own
  `generatedTestSourcesDirectory`.
- Share one Error Prone argument list. Move the test `compilerArgs` from
  `default-testCompile` to plugin-level configuration. Give `default-compile`
  its own main arguments. Every test compilation then inherits the same list.
- In Failsafe's pluginManagement configuration set `testClassesDirectory` to
  `${project.build.directory}/integration-test-classes`, includes to
  `**/*Test.java`, and `additionalClasspathElements` to
  `${project.build.directory}/test-fixtures-classes`. Keep a `**/*IT.java`
  include until consumers rename their old classes. Keep `useModulePath=true`.
- Surefire needs no excludes. It reads `target/test-classes` only.
- Update render tests. Assert the Failsafe execution and its goals. Assert
  `useModulePath`, `testClassesDirectory`, includes, and the fixture classpath.
  Assert both compiler executions and the classified jar. Assert build-helper
  has no executions.
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
- **Support — fixtures.** A published variant with its own dependencies and
  module descriptor. Tests consume the classified jar. They never consume
  another module's test output.

Maven can add suites as executions with includes or JUnit `<groups>`. Keep the
`test-integration` execution named so a second Failsafe execution has a home.
Selection comes from the compiled directory, not from a suffix. Maven cannot
reproduce Gradle's top-level task tree. Execution ids, source directories, and
wrapper scripts are the closest it gets.

This change does not decide whitebox/blackbox module layout. That needs its own
design. Take no shortcut here that closes the door: no `useModulePath=false`,
no merged test output, no anonymous executions.

## Builder verification

- Build a rendered module with a fixture class and a fixture `module-info.java`.
  Confirm the fixture jar carries its own descriptor.
- Build a second rendered module that declares the classified fixture
  dependency. Confirm its tests compile and run.
- Confirm Failsafe sees fixture classes and not `target/test-classes`.
- Add `--module-path` wiring only if the fixture descriptor requires it. Do not
  disable `useModulePath`.

## Non-goals

- Whitebox and blackbox source sets.
- New Copier questions for this binding. The README redesign adds two prose
  answers on 2026-11-23. No Maven profile.
- Changing Checkstyle, SpotBugs, or JaCoCo wiring.
- Migrating or renaming semver's ITs.

## Consumer impact

A Copier update adds three compiler executions, one jar execution, and one
Failsafe execution. It removes both build-helper source-root executions. IT
classes move out of `target/test-classes`. Fixtures move to a classified jar.
A module that consumes another module's fixtures declares the
`test-fixtures` classifier. Old `*IT` classes keep running through the legacy
include until they are renamed. Render tests catch drift.
