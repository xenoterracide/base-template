<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Copier exempt from the release-age cooldown

Authoring date: 2026-11-11.

## Decision

The rendered renovate config exempts the copier manager from
`minimumReleaseAge`. Copier's only dependency is this family's own
template, tagged behind the authoring suite — render tests, the
typescript e2e, review — with consumer automerge still gated on each
consumer's own checks. The supply-chain window the cooldown buys,
registry takedowns of hijacked third-party packages, does not exist for
a first-party repo the holder tags deliberately.

The exemption gives up a canary window: a broken tag automerges to the
fleet in hours where the cooldown once aged it out behind a fix. The
authoring gates are the protection against that, not the three days.

## Mechanism

- `.github/renovate.json5.jinja` adds a package rule beside the
  un-ageable update types: `matchManagers: ["copier"]` with
  `minimumReleaseAge: null`.
- The authoring copy stays untouched — the authoring repo is not a
  copier consumer, and the twin pattern keeps render-only rulings out
  of authoring.
- Deployed consumers adopt the exemption at their next copier update;
  an in-flight held update keeps the schedule it was born under unless
  the holder refreshes by hand. New tags clear immediately in repos
  already carrying the exemption.
- The render test asserting copier automerge gains the exemption
  assertion, so a render cannot silently regress it.

## Non-goals

- `copyright-year` keeps its wait: it rides the same first-party tags,
  but fires once a year, and three days of January delay is invisible.
- The three days, the strictness, and the timestamp-optional behavior
  stand for every other datasource; this is one manager's exemption,
  not a cooldown rollback.

## Alternatives rejected

- Local `copier update` per repo: the documented escape hatch, but it
  drifts the fleet behind the template by hand and leaves the noisy PR
  cadence in place for everyone after.
- A broader exemption for first-party tag datasources: the only other
  rule reading this repo's tags is `copyright-year`, held in scope
  above.
