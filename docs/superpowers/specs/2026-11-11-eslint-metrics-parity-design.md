<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ESLint metrics parity

Authoring date: 2026-11-11.

## Decision

The typescript variant's eslint config gains the complexity-metric rules
of the java variant's Checkstyle Metrics section, at the family's
values. Six rules come from ESLint core. Two — NPathComplexity and
BooleanExpressionComplexity — exist only in `eslint-plugin-sonarjs`,
which joins the typescript devDependencies. A render test pins every
threshold, the eslint twin of `test_checkstyle_carries_the_family_maxima`.

## Mapping

Where the family files a number, the config writes it. Where the family
takes the tool default, so does the config — Checkstyle's bare module is
the precedent.

| Checkstyle (family value)                         | ESLint rule                     | Setting                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CyclomaticComplexity (10, each case counts)       | `complexity`                    | `["error", 10]` — classic counts each case, like the family's `switchBlockAsSingleDecisionPoint: false`. Classic also counts surfaces Java lacks — default parameters, optional chaining, nullish assignment — so 10 runs tighter here than there |
| ExecutableStatementCount (20)                     | `max-statements`                | `["error", 20, { ignoreTopLevelFunctions: false }]` — module-scope functions are the JS analog of methods; the option's default `true` would exempt exactly those                                                                                 |
| MethodLength (25, counts blank and comment lines) | `max-lines-per-function`        | `["error", { max: 25 }]` — the rule's defaults count the same lines                                                                                                                                                                               |
| NestedIfDepth (3)                                 | `max-depth`                     | `["error", 3]` — one budget; 3 matches if, looser for loops and try, which the family holds at 1                                                                                                                                                  |
| OuterTypeNumber (1)                               | `max-classes-per-file`          | `"error"` — default `1` is the family value                                                                                                                                                                                                       |
| FileLength (bare; backstop only)                  | `max-lines`                     | `"error"` — default `300`; a backstop, five turns tighter than Checkstyle's 2000, fires long after the method budgets already failed                                                                                                              |
| NPathComplexity (200)                             | `sonarjs/cognitive-complexity`  | `"error"` — nothing implements NPath for JS; cognitive complexity is Sonar's replacement, `15` its documented default. The 200 has no translation                                                                                                 |
| BooleanExpressionComplexity (3)                   | `sonarjs/expression-complexity` | `["error", 3]` — the family's number, written out because the plugin's default is undocumented                                                                                                                                                    |

ParameterNumber is covered already: `@typescript-eslint/max-params` (3)
runs tighter than the family's 7.

## Non-goals

- ClassDataAbstractionCoupling, ClassFanOutComplexity, ReturnCount,
  MethodCount: no ESLint rule implements them, anywhere. Out of scope
  until one appears.
- One budget per construct — lambda statement counts, per-construct
  depths — needs options ESLint does not take. Lambdas get the method
  budget of 20; the family gives them 10. Loops and try get 3; the
  family gives them 1.
- `max-nested-callbacks` has no Checkstyle anchor. Skipped.
- The sonarjs recommended bundle ships 100-plus rules. The config
  enables the two parity rules and nothing else. Discovery happens
  through this design, not through a preset.
- Test files share one profile. Java's test.xml relaxes statement counts
  to 100; the eslint config holds 20 everywhere. A test carve-out is a
  rules-off block in waiting.

## Mechanism

- The rules land in the typescript block (`**/*.{ts,mts,cts}`), where
  every custom rule lives. The base js block stays recommended-only.
- The plugin import mirrors `@eslint/json`'s default-unwrap guard;
  sonarjs 4 resolves CJS (`cjs/plugin.js`).
- `package.json.jinja` adds `eslint-plugin-sonarjs: ^4.2.2` to the
  typescript devDependencies, alphabetical after `eslint`.
- Supply chain: LGPL-3.0-only, dev-time only, never rendered into
  consumer distributions. Signed npm provenance. Peer range
  `eslint ^8 || ^9 || ^10` covers the template's ESLint 10. Renovate
  bumps it under the 3-day cooldown.
- `tests/test_render.py` gains `test_eslint_carries_the_family_metrics`:
  it reads the rendered config and asserts each rule and its threshold.
  A render flattened the checkstyle maxima once; this test keeps the
  eslint side pinned the same way. `verify.sh` already runs
  `pnpm lint:eslint` on a full render, so a missing dependency or broken
  import fails CI unaided.

## Alternatives rejected

- Core rules only — cheaper, no new dependency, but parity is the goal
  and it leaves NPath and Boolean unmirrored.
- The sonarjs recommended config — one import, all its rules. Wholesale
  adoption re-imports the ritual this template shed with its rules-off
  block.
- Mirroring each Checkstyle nit — per-profile lambda budgets, per-
  construct depths, a test relaxation — takes a carve-out block per
  difference; the shed block's exact shape.
