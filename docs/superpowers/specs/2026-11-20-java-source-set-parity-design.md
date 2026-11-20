<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Java Source Set Parity Design

## Intent

The Java template wires Checkstyle and Error Prone for `main` and `test`
only. It ships four Checkstyle configs. The extra two reach consumers as
unused files, so `java-commons` received `testFixtures.xml` and
`testIntegration.xml` in PR #700 without any executions to read them.
`semver` hand-wired all four roots.

Put the wiring in the template. A plain Copier update should then bring
`java-commons` in line.

## Rule

Every source root with code has a Checkstyle config and an execution that
reads it. A missing root is a no-op. A root without a config is a defect.

`main` and `test` always exist. `testFixtures` and `testIntegration` are
wired unconditionally. Rare roots such as `testWhitebox` and `demoServer`
stay consumer-side; a consumer creates their config and execution on
demand.

## Approaches

- **Fixed four roots, always wired.** No new answers. Missing directories
  are ignored. Matches `semver`. Chosen.
- **Copier booleans.** Two new questions gate the extra executions. Cleaner
  POMs, but `java-commons` must change answers before the update lands.
- **Maven file-existence profiles.** The POM detects each directory. No new
  answers, but activation in multi-module builds is easy to get wrong, and
  custom roots still need manual work.

## Decisions

- Add `build-helper-maven-plugin.version` pinned to `3.8.0` in the Java
  parent POM. Bind `add-test-source` for `src/testFixtures/java` and
  `src/testIntegration/java` at `generate-test-sources`. Error Prone runs
  during `testCompile`, so it sees a root only after `build-helper` adds
  it.
- Add `checkstyle-testFixtures` and `checkstyle-testIntegration` executions
  at `verify`. Each points at its own `.config/checkstyle/<name>.xml` and
  `${project.basedir}/src/<name>/java`.
- Name all four Checkstyle executions in `lint:maven`.
- Assert the four executions, both extra source roots, and the lint string
  in the render tests. Keep the existing layout assertions.
- Add no Copier questions. Keep the four Checkstyle config files.

## Non-goals

- Generating configs for arbitrary source roots. Consumers add those on
  demand.
- Changing NullAway scope. It runs with main compilation; all added test
  roots compile with the existing `default-testCompile` arguments.
- Migrating `java-commons` itself. This change only makes its next update
  carry the wiring.

## Consumer impact

A Copier update brings two new Checkstyle executions, two `build-helper`
roots, and a longer `lint:maven` script. Consumers with local edits to
those POM sections may see a merge conflict. Consumers without the extra
directories see no new failures; Checkstyle skips missing roots.
