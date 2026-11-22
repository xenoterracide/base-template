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
when the executions disappear.

## Approaches

- **Parent `build/plugins`, named execution.** Add one execution to the parent
  POM. Every module inherits it. Skeleton-less renders get it too. Chosen.
- **`pluginManagement` executions only.** Smaller diff. Dead when no module
  declares Failsafe.
- **`integration-tests` profile.** Matches `semver/pom.xml:482-537`. Reverses
  the 2026-11-20 decision to wire source sets without profiles.

## Decisions

- Keep version and `useModulePath=true` in `pluginManagement`.
- Add Failsafe to parent `<build><plugins>` with execution id `integration-tests`,
  goals `integration-test` then `verify`.
- Leave the skeleton module's Failsafe declaration. Parent configuration merges
  into it. Add no Copier answers.
- Add a render test in `tests/test_render.py`. Parse the rendered `pom.xml`.
  Assert the `integration-tests` execution and its two goals. Assert
  `useModulePath=true` survives in `pluginManagement`.
- Add no sample IT. `tests/verify.sh` already runs `./mvnw verify`.
- Leave JaCoCo aggregation to XTC-26. Leave semver's cheap ITs to XTC-44.

## Test suite taxonomy

Four Gradle suite names do not map to four Maven runners. Split them by axis.

- **Visibility — whitebox versus blackbox.** JPMS decides this at compile time.
  Whitebox tests patch the main module. Blackbox tests require it from outside.
  One source root cannot hold both descriptors. Keep `useModulePath=true`. Keep
  `src/testIntegration/java` and `src/testFixtures/java` as separate
  build-helper roots. A future split needs those boundaries.
- **Lifecycle — unit versus integration.** Surefire runs at `test`. Failsafe
  runs after `package`, at `integration-test` and `verify`. Use Failsafe for
  tests that need the packaged jar, an external process, or state that must be
  torn down after a failure. Speed is not the test.
- **Scope — end-to-end.** A scope claim, not a lifecycle. It usually lands on
  Failsafe. Distinguish it with JUnit tags or name patterns, not another runner.

Maven can add suites as executions with includes or JUnit `<groups>`. Keep the
`integration-tests` execution named so a second Failsafe execution has a home.
Do not pin Failsafe includes beyond the defaults; `*IT` stays the selector.

This change does not decide whitebox/blackbox module layout. That needs its own
design. Take no shortcut here that closes the door: no classpath fallback, no
merged source roots, no anonymous executions.

## Non-goals

- Whitebox and blackbox source sets.
- A new Copier question or profile.
- Changing Checkstyle, SpotBugs, or JaCoCo wiring.
- Migrating semver's ITs.

## Consumer impact

A Copier update adds one Failsafe execution. Consumers with `*IT` tests start
running them at `verify`. Consumers without them see no new failures. Render
tests catch drift.
