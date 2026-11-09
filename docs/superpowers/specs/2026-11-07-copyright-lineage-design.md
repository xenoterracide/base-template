<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Copyright lineage ranges

Authoring date: 2026-11-07. Supersedes the headerless-licensing design of
2026-11-05.

## Decision

The template bakes SPDX headers carrying lineage year ranges. Each file's
copyright starts when its expression first appeared in the holder's own
history — not when a particular repo received it: printing a new edition of
a book does not reset the year on a page that came from an older one. The
holder ruled the oldest own-authored instance wins, however different
today's form, and that per-file licenses stay exactly as the family scheme
assigns them.

The headerless design failed its first contact with adoption: a render
dropped over files that carried ranges, and the first-commit annotate
re-stamped them 2026-only. Copier's merge preserves headers on updates, but
adoption-over-history and any wholesale replacement lose them. Baked
headers make the render itself carry the truth.

## Archaeology

195 repositories scanned: 35 public Bitbucket clones, 150 GitHub clones
including the archived graveyard, 10 local checkouts with full history.
Every template file and its historical name variants (`​.husky/pre-commit`,
`.prettierrc.json`, `.lintstagedrc.yml`, `checkstyle.xml`, …) were dated by
their earliest `--diff-filter=A` commit, filtered to the holder's own
authorship identities so upstream-fork contamination fell away, and the
birth commits inspected to separate authorship from import.

Hosting eras: Bitbucket 2010 → 2019 (five gradle repos migrated in one
day), GitHub parallel from 2013, the tooling bundle assembling in
iw-pm-backend July 2021 (husky running `spotlessApply && pretty-quick
--staged`), GitLab 2024 → 2026-02 (java-commons, spring-app-commons), and
the 2026-02-04 GitHub re-rooting from one orphan seed commit. Nothing
before git exists to find; the holder confirmed this is as accurate as it
gets.

### Lineage starts

| File                                                       | Start | Cradle                                                             |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| .gitignore                                                 | 2008  | school (two lines; the `*.class` motif survives into today's file) |
| .editorconfig                                              | 2013  | pastey-frontend                                                    |
| .gitattributes                                             | 2013  | Business-OnlinePayment-PaperlessTrans                              |
| package.json (annotation)                                  | 2013  | pastey-frontend                                                    |
| README.md                                                  | 2015  | wercker-step-maven                                                 |
| checkstyle configs                                         | 2015  | platform (checkstyle.xml)                                          |
| .prettierrc.yml                                            | 2020  | aurelia-propertysource (.prettierrc.json)                          |
| hooks pre-commit                                           | 2021  | iw-pm-backend (.husky, pretty-quick era)                           |
| .config/spotbugs/exclude.xml                               | 2021  | iw-pm-backend                                                      |
| .prettierignore                                            | 2021  | iw-pm-backend                                                      |
| pom.xml                                                    | 2014  | DATAJPA-622                                                        |
| .lintstagedrc.cjs                                          | 2023  | bygger (.lintstagedrc.yml)                                         |
| hooks commit-msg                                           | 2024  | ai-wh40k                                                           |
| git-conventional-commits.yaml                              | 2024  | ai-wh40k                                                           |
| .tool-versions                                             | 2024  | ai-wh40k                                                           |
| .envrc                                                     | 2024  | java-commons                                                       |
| .github/renovate.json5                                     | 2024  | spring-app-commons                                                 |
| REUSE.toml                                                 | 2024  | gradle-semver                                                      |
| workflows pre-commit.yml                                   | 2024  | gradle-semver                                                      |
| staged test.yml                                            | 2023  | ai-wh40k build.yml                                                 |
| pyproject.toml                                             | 2025  | java-commons                                                       |
| AGENTS.md                                                  | 2026  | spring-app-commons                                                 |
| CONTRIBUTING.md                                            | 2026  | gradle-semver                                                      |
| heal.sh, post- hooks, opencode, answers, skeletons, copier | 2026  | the 2026 family                                                    |

## Mechanism

- Jinja sources carry the header with `{{ copyright_holder }}`; renders
  inherit the holder's name with the lineage range. Plain authoring copies
  carry the same range with the literal holder.
- In consumers, `reuse annotate --merge-copyrights` extends the range on
  any human commit that touches the file; it never resets the start.
- Renovate bumps the end year: a `custom.regex` manager reads this repo's
  calver tags (`github-tags`, extracting the two-digit year from `v27.x`),
  so tagging the first release of a year bumps every range. The
  single-year headers convert to ranges through a `combination` match;
  that conversion and the first real bump exercise in January 2027 — if
  the hosted app handles either awkwardly, a one-line sed in January is
  the fallback.
- JSON files cannot carry comments: `package.json` and `tsconfig*.json`
  stay annotation-covered, with the lineage range in the `REUSE.toml`
  annotation strings.
- The `**/*.jinja` annotation stays as the backstop for the headerless
  JSON-jinja sources; reuse accepts the overlap on headered sources.
