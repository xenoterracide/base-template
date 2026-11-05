# Template Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose base-template into a copier project template with Java and TypeScript variants.

**Architecture:** Single flat template at repo root; variant-only files gated by `{% if template_type == '...' %}` conditional filenames. Two-hats design: this repo is both the template source AND an authoring repo, so static authoring copies are `_exclude`d while `.jinja` rendered copies become the canonical consumer files. SPDX headers baked into every `.jinja` source via whole-line moustaches; consumers post-copy tasks run prettier + `reuse download --all` to finalize.

**Tech Stack:** copier 9.17.1+ / Jinja2 / pytest / Node.js 24 / Python 3.14 / Maven wrapper / yarn 4.18 / PnP

**Spec:** `docs/superpowers/specs/2026-09-07-template-repo-design.md`

## Spec adjustments recorded in plan

The plan implements two deviations from the spec's current wording (both are design improvements):

1. **`contribute` script (spec line 318)** — spec says `yarn install --immutable && uv sync --frozen && git config core.hooksPath git/hooks`. Since `yarn.lock` and `uv.lock` are excluded from the template (consumers generate them on first `yarn contribute`), `--immutable` and `--frozen` would fail on the very first run. Plan uses `yarn install && uv sync && git config core.hooksPath git/hooks` (non-frozen), which generates lockfiles on first contribute; CI then uses `--immutable`/`--frozen` since lockfiles are committed to consumer repos.

2. **`update-downstream.yml` placement** — spec (line 376–377) says staged under `staged/.github/workflows/update-downstream.yml` for this repo. This plan puts it directly in `.github/workflows/update-downstream.yml`. Reason: the workflow-scope restriction only applies to automated pushes that create/modify `.github/workflows/**`. This repo's own CI files are committed and pushed by a human, so staging adds unnecessary friction.

3. **Maven wrapper retained (asdf-maven rejected)** — the spec (line 43) and the shared `maven.yml` reusable workflow (line 55 of `github/.github/workflows/maven.yml`) both invoke `./mvnw verify`, so generated Java projects must contain the wrapper. Keeping the Maven wrapper (rather than installing Maven via asdf) is the convergence baseline because `java-commons` already commits `mvnw`/`mvnw.cmd` and the reusable workflow depends on it. The `@actions/setup-java` step caches Maven, so the wrapper's own Maven download is a one-time cost. asdf-maven would require changing the shared `maven.yml` workflow AND give up the wrapper's version-pinning and offline-repeatability; rejected.

   **Implementation caveat:** `mvnw` and `mvnw.cmd` must be copied byte-for-byte, but copier renders any file whose path carries the `.jinja` suffix (needed for the conditional filename). A shell/`.cmd` script can contain `{{ }}` or `{% %}` sequences that Jinja would try to evaluate. To keep this safe, wrap the whole body of each wrapper in `{% raw %}...{% endraw %}` inside its `.jinja` file so no content is interpreted. Verify byte-identical output after rendering (see Task 4 smoke test).

## `_exclude` — empirically validated (differs from spec)

The spec's `_exclude` block (lines 146–162) must be corrected. Copier's
`_exclude` matches the **rendered destination path**, verified empirically:

1. Listing a name that has a `.jinja` sibling (e.g. `.envrc`, `.tool-versions`,
   `README.md`) **suppresses the rendered output too** — it must NOT be listed.
2. When both a static copy and a `.jinja` sibling exist and are not excluded,
   copier silently prefers the `.jinja` render (verified for `.envrc`,
   `.tool-versions`, `package.json.license`).
3. `- .github/workflows` excludes only the exact top-level directory, NOT
   `staged/.github/workflows` (verified) — so authoring CI is excluded while
   staged consumer workflows render normally.
4. `copier.yml` is inserted into the copy when any `_exclude` entry exists, so
   `copier.yml` must itself be listed in `_exclude` to keep the config out of
   consumer output (verified).

Correct `_exclude` (authoring-only files with no `.jinja` sibling and no use
for consumers, plus artifact dirs):

```
.github/workflows, docs/, tests/, yarn.lock, uv.lock, LICENSES,
.yarn/, .pnp.*, node_modules, .venv, copier.yml, .python-version
```

Files with both a static authoring copy and a `.jinja` render (`.gitignore`,
`.envrc`, `package.json`, `pyproject.toml`, `REUSE.toml`, `.tool-versions`,
`.lintstagedrc.cjs`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`,
`.prettierignore`, `package.json.license`) are NOT excluded — copier uses the
render automatically. Verbatim shared files with no sibling (`.prettierrc.cjs`,
`.gitattributes`, `.editorconfig`, `git-conventional-commits.yaml`,
`opencode.jsonc`, `.github/renovate.json5`, `git/hooks/*`) are copied as-is.

## File Structure

```
base-template/
  copier.yml                                        # template config
  .copier-answers.yml.jinja                         # rendered answers file

  # verbatim shared (identical across all consumers)
  git/hooks/pre-commit                              # verbatim, MIT inline header
  git/hooks/commit-msg                              # verbatim, MIT inline header
  git/hooks/post-checkout                           # verbatim, MIT inline header
  git/hooks/post-merge                              # verbatim, MIT inline header
  git/hooks/sync-tooling                            # verbatim, MIT inline header
  git/hooks/check-yarn-env                          # verbatim, MIT inline header
  .prettierrc.cjs                                   # verbatim, MIT inline header
  .gitattributes                                    # verbatim, CC0 inline header
  .editorconfig                                     # verbatim, CC0 inline header
  git-conventional-commits.yaml                     # verbatim, CC0 inline header
  opencode.jsonc                                    # verbatim, CC0 inline header
  .github/renovate.json5                            # verbatim, CC0 inline header

  # rendered shared (header baked, content varies by answer)
  .gitignore.jinja                                  # consumer .gitignore (maven/ts bases)
  .prettierignore.jinja
  .tool-versions.jinja                              # java adds java/ktlint
  .lintstagedrc.cjs.jinja                           # licenseCode baked
  REUSE.toml.jinja                                  # tier annotations
  pyproject.toml.jinja                              # project name/desc
  package.json.jinja                                # workspaces, devDeps, scripts
  package.json.license.jinja                        # MIT sidecar
  .envrc.jinja                                      # consumer envrc (no .share refs)
  README.md.jinja
  AGENTS.md.jinja
  CONTRIBUTING.md.jinja

  # java-only (conditional directory parts + conditional filenames).
  # IMPORTANT: copier renders each path PART separately and skips a file when any
  # part renders empty. So the variant gate must be a CONDITIONAL DIRECTORY PART
  # (`{% if template_type == 'java' %}module{% endif %}`), NOT a condition on the
  # whole path and NOT relying on `when`-gated answers (those resolve to their
  # defaults even for the wrong variant, so the other dirs would still render).
  {% if template_type == 'java' %}pom.xml{% endif %}.jinja
  {% if template_type == 'java' %}mvnw{% endif %}.jinja
  {% if template_type == 'java' %}mvnw.cmd{% endif %}.jinja
  {% if template_type == 'java' %}.mvn{% endif %}/jvm.config.license.jinja
  {% if template_type == 'java' %}.mvn{% endif %}/wrapper/maven-wrapper.properties
  {% if template_type == 'java' %}.config{% endif %}/checkstyle/main.xml.jinja
  {% if template_type == 'java' %}.config{% endif %}/checkstyle/test.xml.jinja
  {% if template_type == 'java' %}.config{% endif %}/spotbugs/exclude.xml.jinja
  {% if template_type == 'java' %}.mvn{% endif %}/jvm.config               # verbatim, java-only (static --add-exports flags; annotated in REUSE.toml)
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/pom.xml.jinja
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/module-info.java.jinja
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/{{ java_package_path }}/package-info.java.jinja
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/{{ java_package_path }}/Example.java.jinja
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/test/java/module-info.java.jinja
  {% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/test/java/{{ java_package_path }}/blackbox/ExampleTest.java.jinja

  # typescript-only (conditional directory parts + conditional filenames)
  {% if template_type == 'typescript' %}eslint.config{% endif %}.cts.jinja
  {% if template_type == 'typescript' %}tsconfig.eslint.json{% endif %}.jinja
  {% if template_type == 'typescript' %}tsconfig.eslint.json{% endif %}.license.jinja
  {% if template_type == 'typescript' %}vitest.config{% endif %}.ts.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.license.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.license.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/src/index.ts.jinja
  {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/test/index.test.ts.jinja

  # staged workflows (rendered into staged/)
  staged/.github/workflows/pre-commit.yml.jinja
  staged/.github/workflows/test.yml.jinja
  staged/.github/workflows/devtools-regression.yml.jinja
  staged/.github/workflows/{% if use_opencode %}opencode.yml{% endif %}.jinja
  staged/README.jinja

  # excluded authoring copies (listed in _exclude); names with .jinja
  # siblings are NOT excluded — copier prefers the render automatically
  .github/workflows/*                               # this repo's own CI
  docs/, tests/                                     # dev-only; render target staged/
  yarn.lock, uv.lock                                # consumer generates own
  .python-version                                   # authoring toolchain
  LICENSES/                                         # consumer gets via reuse download
  .yarn/, .pnp.*, node_modules, .venv               # artifacts
  copier.yml                                        # excluded to keep config out of output

  # static authoring copy -- NOT excluded, .jinja render wins and supersedes it
  .gitignore, .prettierignore, README.md, AGENTS.md,
  CONTRIBUTING.md, .envrc, package.json,
  package.json.license, pyproject.toml, REUSE.toml,
  .tool-versions, .lintstagedrc.cjs
```

---

### Task 1: Authoring hygiene

**Purpose:** Add dev deps for template authoring; annotate `.jinja` files for REUSE; exclude `*.jinja` from prettier in the authoring repo (since `.jinja` sources intentionally contain moustache syntax prettier would mangle).

**Files:**

- Modify: `pyproject.toml`
- Modify: `REUSE.toml`
- Modify: `.prettierignore`

- [ ] **Step 1: Add dev deps to pyproject.toml**

```toml
[dependency-groups]
dev = ["copier", "pyyaml", "pytest", "reuse>=6.2.0"]
```

- [ ] **Step 2: Add REUSE annotations for .jinja and copier.yml**

Append to `REUSE.toml`:

```toml
[[annotations]]
path = "copier.yml"
SPDX-FileCopyrightText = "Copyright © 2026 Caleb Cushing"
SPDX-License-Identifier = "CC0-1.0"

[[annotations]]
# jvm.config is a static authoring copy with no SPDX header and no .license
# sibling in the authoring tree (the consumer gets .mvn/jvm.config.license
# from the .jinja render). Annotation matches the literal conditional path.
path = "{% if template_type == 'java' %}.mvn{% endif %}/jvm.config"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"

[[annotations]]
path = "**/*.jinja"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
```

- [ ] *_Step 3: Add *.jinja to .prettierignore*_

Append to `.prettierignore`:

```
copier.yml
*.jinja
```

- [ ] **Step 4: Verify authoring lint still passes**

Run: `uv sync --group dev && yarn lint`
Expected: PASS (reuse + prettier + copier.yml annotated)

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml REUSE.toml .prettierignore
git commit -m "chore: add template authoring deps and .jinja REUSE annotations"
```

---

### Task 2: copier.yml and answers template

**Purpose:** Create the copier config and its rendered answers file; verify a smoke copy works.

**Files:**

- Create: `copier.yml`
- Create: `.copier-answers.yml.jinja`

- [ ] **Step 1: Create copier.yml**

```yaml
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: CC0-1.0

_min_copier_version: "9.0.0"

_exclude:
  - .github/workflows
  - docs/
  - tests/
  - yarn.lock
  - uv.lock
  - LICENSES
  - .yarn/
  - .pnp.*
  - node_modules
  - .venv
  - copier.yml
  - .python-version

_tasks:
  - npx --yes prettier@3.6.2 --ignore-unknown --write .
  - uvx reuse@6.2.0 download --all

_message_after_copy: |
  Your new {{ project_title }} project is ready.
  Run `yarn contribute` to install tooling and set up git hooks.
  For typescript projects, copy staged/.github/workflows/* into .github/workflows/.

_envops:
  undefined: jinja2.StrictUndefined

# Question order matters under StrictUndefined: a default can only reference
# answers declared BEFORE it. The base answers come first; computed answers
# (when: false) come last so they can see every dependency.
template_type:
  type: str
  help: Which project template?
  choices:
    Java: java
    TypeScript: typescript
  default: typescript

project_name:
  type: str
  help: Repository slug (e.g. java-commons)

project_title:
  type: str
  default: "{{ project_name }}"
  help: Human-readable name for README/AGENTS

license:
  type: str
  choices:
    GPL-3.0-or-later: GPL-3.0-or-later
    Apache-2.0: Apache-2.0
    MIT: MIT
  default: GPL-3.0-or-later

copyright_holder:
  type: str
  default: Caleb Cushing

copyright_year:
  type: str
  default: "{{ '%Y' | strftime }}"
  when: false

use_opencode:
  type: bool
  default: true

java_group_id:
  type: str
  default: com.xenoterracide
  when: "{{ template_type == 'java' }}"

java_module:
  type: str
  default: "{{ project_name }}"
  when: "{{ template_type == 'java' }}"

java_version:
  type: str
  default: 0.0.0
  when: "{{ template_type == 'java' }}"

ts_scope:
  type: str
  default: "@xenoterracide"
  when: "{{ template_type == 'typescript' }}"

first_package:
  type: str
  default: "{{ project_name }}"
  when: "{{ template_type == 'typescript' }}"

# Computed answers — not re-asked; recomputed on copier update
spdx_copyright_line:
  type: str
  default: "SPDX-FileCopyrightText: Copyright © {{ copyright_year }} {{ copyright_holder }}"
  when: false

<!-- REUSE-IgnoreStart -->
project_license_line:
  type: str
  default: "SPDX-License-Identifier: {{ license }}"
  when: false
<!-- REUSE-IgnoreEnd -->

license_url:
  type: str
  default: >-
    {% if license == 'GPL-3.0-or-later' %}https://www.gnu.org/licenses/gpl-3.0.txt{% elif license == 'Apache-2.0' %}https://www.apache.org/licenses/LICENSE-2.0.txt{% else %}https://opensource.org/licenses/MIT{% endif %}
  when: false

java_package:
  type: str
  default: "{{ java_group_id }}.{{ java_module | replace('-', '_') }}"
  when: "{{ template_type == 'java' }}"

# Derived from java_package: dots -> slashes for use in file paths. Copier splits
# relative template paths on '/' BEFORE rendering, so a `replace('.', '/')` filter
# inside a moustache path component breaks. Compute it here instead.
java_package_path:
  type: str
  default: "{{ java_package | replace('.', '/') }}"
  when: "{{ template_type == 'java' }}"
```

- [ ] **Step 2: Create .copier-answers.yml.jinja**

```
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: CC0-1.0
#
# Managed by copier; do not edit. Run `copier update` to refresh.
{{ _copier_answers|to_nice_yaml }}
```

- [ ] **Step 3: Smoke-test copier copy**

Run a real copy with computed answers and defaults to catch config-ordering
and `_exclude` regressions (requires `copier` + `pyyaml` from Task 1):

```bash
rm -rf /tmp/tmpl-smoke
uv run python - <<'PY'
import copier
copier.run_copy(
    src_path=".",
    dst_path="/tmp/tmpl-smoke",
    data={"template_type": "java", "project_name": "smoke", "license": "Apache-2.0"},
    defaults=True,
    overwrite=True,
    unsafe=True,
    quiet=True,
)
print("copy ok")
PY
test ! -e /tmp/tmpl-smoke/copier.yml            # _exclude keeps config out
test -f /tmp/tmpl-smoke/.copier-answers.yml     # answers rendered
grep -q "com.xenoterracide.smoke" /tmp/tmpl-smoke/.copier-answers.yml
```

Expected: "copy ok"; the three `test` lines pass. This validates question
ordering under `StrictUndefined` (a default may only reference earlier
answers) and that `copier.yml`/`.python-version` are excluded while the
answers file renders.

- [ ] **Step 4: Commit**

```bash
git add copier.yml .copier-answers.yml.jinja
git commit -m "feat: add copier.yml template config and answers template"
```

---

### Task 3: Shared consumer files

**Purpose:** All files both variants share: verbatim copies (hooks, editorconfig, etc.) and rendered shared configs (`.gitignore.jinja`, `package.json.jinja`, etc.).

**Files:**

- Create: `git/hooks/pre-commit` (verbatim — already exists, verify)
- Create: `git/hooks/commit-msg` (verbatim — already exists, verify)
- Create: `git/hooks/post-checkout` (verbatim — already exists, verify)
- Create: `git/hooks/post-merge` (verbatim — already exists, verify)
- Create: `git/hooks/sync-tooling` (verbatim — already exists, verify)
- Create: `git/hooks/check-yarn-env` (verbatim — already exists, verify)
- Verify: `.prettierrc.cjs`, `.gitattributes`, `.editorconfig`, `git-conventional-commits.yaml`, `opencode.jsonc`, `.github/renovate.json5` (all exist, verify)
- Create: `.gitignore.jinja`
- Create: `.prettierignore.jinja`
- Create: `.tool-versions.jinja`
- Create: `.lintstagedrc.cjs.jinja`
- Create: `REUSE.toml.jinja`
- Create: `pyproject.toml.jinja`
- Create: `package.json.jinja`
- Create: `package.json.license.jinja`
- Create: `.envrc.jinja`
- Create: `README.md.jinja`
- Create: `AGENTS.md.jinja`
- Create: `CONTRIBUTING.md.jinja`
- [ ] **Step 1: Verify verbatim files exist and fix .prettierrc.cjs plugin loading**

Run: `ls git/hooks/`
Expected: 6 hook files present

Run: `ls .prettierrc.cjs .gitattributes .editorconfig git-conventional-commits.yaml opencode.jsonc .github/renovate.json5`
Expected: all present

**Fix `.prettierrc.cjs` plugin loading (verbatim shared file):**
The generated project has no `node_modules` during the post-copy
`_tasks` prettier run, so a hard `require.resolve(...)` plugin array makes
prettier exit 2 on every copy and breaks all smoke tests and the pytest
suite. Replace the `plugins: [...]` block in `.prettierrc.cjs` so it keeps
only resolvable plugins. Authoring repo resolves all four plugins and is
unchanged.

```cjs
  plugins: [
    "@prettier/plugin-xml",
    "prettier-plugin-properties",
    "prettier-plugin-java",
    "prettier-plugin-toml",
  ].filter((p) => {
    try {
      require.resolve(p);
      return true;
    } catch {
      return false;
    }
  }),
```

- [ ] **Step 2: Create .gitignore.jinja**

```gitignore
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: CC0-1.0

# AI
*.txt
!requirements.txt

# env
.env*
!.envrc

# yarn
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions

# Whether you use PnP or not, the node_modules folder is often used to store
# build artifacts that should be gitignored
node_modules

# Swap the comments on the following lines if you wish to use zero-installs
# In that case, don't forget to run `yarn config set enableGlobalCache false`!
# Documentation here: https://yarnpkg.com/features/caching#zero-installs

#!.yarn/cache
.pnp.*

# License files
!LICENSES/*.txt

# Coverage reports
coverage/

{% if template_type == 'java' %}# Java
target/
!.mvn/wrapper/maven-wrapper.jar
!**/src/main/**/target/
!**/src/test/**/target/

### IntelliJ IDEA ###
.idea/modules.xml
.idea/jarRepositories.xml
.idea/compiler.xml
.idea/libraries/
*.iws
*.iml
*.ipr

### Eclipse ###
.apt_generated
.classpath
.factorypath
.project
.settings
.springBeans
.sts4-cache

### VS Code ###
.vscode/
{% endif %}

{% if template_type == 'typescript' %}# TypeScript
dist/
{% endif %}
```

- [ ] **Step 3: Create .prettierignore.jinja**

```gitignore
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: CC0-1.0

uv.lock
.venv/
.yarn/
.gradle/
node_modules/
build/
.idea/
gradlew*
gradle/wrapper/*
.agents/
coverage/
```

- [ ] **Step 4: Create .tool-versions.jinja**

```gitignore
{% if template_type == 'java' %}java temurin-25.0.4+101.0.LTS
ktlint 1.8.0
{% endif %}nodejs 24.20.0
python 3.14.7
shfmt 3.14.1
shellcheck 0.11.0
```

- [ ] **Step 5: Create .lintstagedrc.cjs.jinja**

```javascript
// {{ spdx_copyright_line }}
//
// SPDX-License-Identifier: MIT

const shfmt = "shfmt --write";
const prettier = "prettier --cache --ignore-unknown --write";
const reuse = "uv run --frozen --group dev reuse annotate";
const copyright = "--copyright 'Caleb Cushing' --merge-copyrights";
const symbol = "--copyright-prefix spdx-string-symbol";

const licenseConfiguration = "--license '{{ license }}' --fallback-dot-license";
const licenseDocumentation = "--license 'CC-BY-NC-SA-4.0'";
const licenseScripts = "--license 'MIT' --fallback-dot-license";

const withoutYarn = (files) => files.filter((file) => !file.includes("/.yarn/") && !file.startsWith(".yarn/"));

const withFiles = (command, files) => `${command} ${files.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(" ")}`;

const run = (commands) => (files) => {
  const filtered = withoutYarn(files);

  if (!filtered.length) {
    return [];
  }

  const cmds = Array.isArray(commands) ? commands : [commands];
  return cmds.map((command) => withFiles(command, filtered));
};

module.exports = {
  "!(package).json": run([`${reuse} ${copyright} ${symbol} ${licenseConfiguration}`, prettier]),
  // package.json can contain logic via the scripts segment
  "package.json": run([`${reuse} ${copyright} ${symbol} ${licenseScripts}`, prettier]),
  "{git/hooks/**,**/*.*sh}": run([`${reuse} ${copyright} ${symbol} ${licenseScripts} --style python`, shfmt]),
  "*.{md,adoc}": run([`${reuse} ${copyright} ${symbol} ${licenseDocumentation}`, prettier]),
  "*.{xml,yaml,properties,toml,json5}": run([`${reuse} ${copyright} ${licenseConfiguration} ${symbol}`, prettier]),
  // yml is different from yaml extension as the only known yaml required file is for git-conventional-commits, but yml
  // contains files like GitHub workflows which can have significant logic
  "*.{js,cjs,yml}": run([`${reuse} ${copyright} ${symbol} ${licenseScripts}`, prettier]),
  ".{*ignore,editorconfig,gitattributes,mailmap}": run([
    `${reuse} ${copyright} ${symbol} ${licenseConfiguration}`,
    prettier,
  ]),
  // JetBrains obnoxiously assume that properties files aren't utf8 by default, and so to avoid rendering issues we
  // avoid adding the Unicode copyright symbol
  "*.properties": run([`${reuse} ${copyright} ${licenseConfiguration}`, prettier]),
};
```

Note: the `{git/hooks/**,...}` glob in the authoring lint-stagedrc changes to `{git/hooks/**,**/*.*sh}` for consumer hooks. Verify the exact glob is correct for hook paths.

- [ ] **Step 6: Create REUSE.toml.jinja**

```toml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: CC0-1.0

version = 1
[[annotations]]
path = ".gitmodules"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
[[annotations]]
path = "**/*.lockfile"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
[[annotations]]
path = "yarn.lock"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
[[annotations]]
path = ".tool-versions"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
[[annotations]]
path = "uv.lock"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
[[annotations]]

{% if template_type == 'java' %}[[annotations]]
path = ".python-version"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
path = "mvnw"
SPDX-FileCopyrightText = "See license header in file"
SPDX-License-Identifier = "Apache-2.0"
[[annotations]]
path = "mvnw.cmd"
SPDX-FileCopyrightText = "See license header in file"
SPDX-License-Identifier = "Apache-2.0"
[[annotations]]

{% endif %}path = ".mvn/wrapper/maven-wrapper.properties"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "CC0-1.0"
```

- [ ] **Step 7: Create pyproject.toml.jinja**

```toml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: CC0-1.0

[project]
name = "{{ project_name }}"
version = "0.1.0"
description = "{{ project_title }}"
readme = "README.md"
requires-python = ">=3.12"
dependencies = []

[dependency-groups]
dev = ["reuse>=6.2.0"]
```

- [ ] **Step 8: Create package.json.jinja**

```json
{
  "name": "{{ project_name }}",
  "packageManager": "yarn@4.18.0",
  "private": true,
  "license": "{{ license }}",
  "devDependencies": {
    "@prettier/plugin-xml": "^3.4.2",
    "git-conventional-commits": "^2.8.0",
    "lint-staged": "^17.0.0",
    "prettier": "^3.6.2",
    "prettier-plugin-java": "^2.7.5",
    "prettier-plugin-properties": "^0.3.0",
    "prettier-plugin-toml": "^2.0.6"{% if template_type == 'typescript' %},
    "@eslint/js": "^10.0.0",
    "@eslint/json": "^2.0.0",
    "@eslint/markdown": "^8.0.0",
    "@vitest/coverage-v8": "^4.1.3",
    "eslint": "^10.0.0",
    "globals": "^17.0.0",
    "jiti": "^2.0.0",
    "typescript": "^6.0.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^4.1.3"{% endif %}
  },
  "scripts": {
    "contribute": "yarn install && uv sync && git config core.hooksPath git/hooks",
    "lint:prettier": "prettier --ignore-unknown --cache --check '**'",
    "lint:reuse": "uv run --frozen --group dev reuse lint"{% if template_type == 'typescript' %},
    "lint:eslint": "eslint .",
    "lint": "yarn lint:eslint && yarn lint:prettier && yarn lint:reuse",
    "typecheck": "tsc --noEmit -p tsconfig.eslint.json",
    "test": "vitest run --coverage",
    "check": "yarn lint:eslint && yarn typecheck && yarn test"{% else %},
    "lint": "yarn lint:prettier && yarn lint:reuse",
    "check": "yarn lint:prettier"{% endif %}
  }{% if template_type == 'typescript' %},
  "workspaces": [
    "packages/*"
  ]{% endif %}
}
```

- [ ] **Step 9: Create package.json.license.jinja**

```
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT
```

- [ ] **Step 10: Create .envrc.jinja**

```bash
#!/bin/sh

# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT

asdf install
if ! git config core.hooksPath 2>/dev/null | grep -q "git/hooks"; then
  echo "Git hooks not configured. Run: yarn contribute"
fi
```

- [ ] **Step 11: Create README.md.jinja**

```markdown
<!-- {{ spdx_copyright_line }} -->

<!-- {{ spdx_license_line }} -->

# {{ project_title }}

<!-- Body below: CC-BY-NC-SA-4.0 -->

## Getting started

Run these commands to bootstrap your development environment:

- `yarn contribute` installs Node and Python tools and configures git hooks.
- `direnv allow` (if you use direnv) loads the environment.

For typescript projects, copy workflows into place:

    cp -r staged/.github/workflows .github/workflows
    git add .github/workflows

For java projects:

    ./mvnw -q verify

This project is managed with [copier](https://copier.readthedocs.io). To
refresh from the template:

    copier update --trust
```

- [ ] **Step 12: Create AGENTS.md.jinja**

```markdown
<!-- {{ spdx_copyright_line }} -->

<!-- {{ spdx_license_line }} -->

# {{ project_title }}

## Build and Test

- `yarn contribute` — bootstrap tooling (run once after clone)
- `yarn check` — run all linters and, for typescript, typecheck + tests
- `yarn lint:prettier` — prettier check
- `yarn lint:reuse` — REUSE compliance check
  {% if template_type == 'java' %}
- `./mvnw -q verify` — Maven build + checkstyle + spotbugs + jacoco + tests
  {% else %}
- `yarn typecheck` — TypeScript type check
- `yarn test` — vitest with coverage
  {% endif %}

## Source of Truth

- Template: `copier.yml` in [xenoterracide/base-template](https://github.com/xenoterracide/base-template)
- Answers: `.copier-answers.yml` in this repo
- Updates: `copier update --trust` refreshes from template
```

- [ ] **Step 13: Create CONTRIBUTING.md.jinja**

```markdown
<!-- {{ spdx_copyright_line }} -->

<!-- {{ spdx_license_line }} -->

# Contributing to {{ project_title }}

## Bootstrap

    git clone <repo-url>
    cd <project>
    yarn contribute

## Linting and testing

    yarn check

## Updating from the template

    copier update --trust

Conflicts appear as `.rej` files; resolve and commit.

## License header conventions

All files carry SPDX headers. The template bakes headers into `.jinja` sources
so generated projects are REUSE-compliant from the first commit. User-authored
files are annotated by the pre-commit hook via `reuse annotate`.
```

- [ ] **Step 14: Commit**

```bash
git add git/hooks .gitignore.jinja .prettierignore.jinja .tool-versions.jinja \
  .lintstagedrc.cjs.jinja REUSE.toml.jinja pyproject.toml.jinja \
  package.json.jinja package.json.license.jinja .envrc.jinja \
  README.md.jinja AGENTS.md.jinja CONTRIBUTING.md.jinja
git commit -m "feat: add shared consumer files for all variants"
```

---

### Task 4: Java variant files

**Purpose:** Java-only conditional files: parent pom.xml, mvnw, module skeleton, checkstyle/spotbugs configs.

**Files:**

- Create: `{% if template_type == 'java' %}pom.xml{% endif %}.jinja`
- Create: `{% if template_type == 'java' %}mvnw{% endif %}.jinja`
- Create: `{% if template_type == 'java' %}mvnw.cmd{% endif %}.jinja`
- Create: `{% if template_type == 'java' %}.mvn{% endif %}/jvm.config` (verbatim — static `-Xmx2g`)
- Create: `{% if template_type == 'java' %}.mvn{% endif %}/jvm.config.license.jinja`
- Create: `{% if template_type == 'java' %}.mvn{% endif %}/wrapper/maven-wrapper.properties` (verbatim)
- Create: `{% if template_type == 'java' %}.config{% endif %}/checkstyle/main.xml.jinja`
- Create: `{% if template_type == 'java' %}.config{% endif %}/checkstyle/test.xml.jinja`
- Create: `{% if template_type == 'java' %}.config{% endif %}/spotbugs/exclude.xml.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/pom.xml.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/module-info.java.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/{{ java_package_path }}/package-info.java.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/main/java/{{ java_package_path }}/Example.java.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/test/java/module-info.java.jinja`
- Create: `{% if template_type == 'java' %}module{% endif %}/{{ java_module }}/src/test/java/{{ java_package_path }}/blackbox/ExampleTest.java.jinja`

Note on `mvnw`/`mvnw.cmd`: these are created as `mvnw.jinja`/`mvnw.cmd.jinja` with raw-wrapped bodies (see Step 2 below), so copier renders them byte-identically. They carry Apache-2.0 ASF license headers inline. `mvnw.jinja` must be committed with the exec bit set (copier preserves it); verify with `ls -l mvnw` after copy in smoke test.

- [ ] **Step 1: Create parent pom.xml.jinja**

The parent POM is parameterized from java-commons' `pom.xml`. Key substitutions:

- `groupId`: `{{ java_group_id }}`
- `artifactId`: `{{ project_name }}-parent`
- `name`: `{{ project_title }} Parent`
- `description`: `{{ project_title }}`
- `version`: `{{ java_version }}`
- `licenses`: `{{ license }}` / `{{ license_url }}`
- `developers`: `{{ copyright_holder }}`
- `<module>`: `module/{{ java_module }}`

```xml
<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
SPDX-License-Identifier: CC0-1.0
-->
<project
  xmlns="http://maven.apache.org/POM/4.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd"
>
  <modelVersion>4.0.0</modelVersion>
  <groupId>{{ java_group_id }}</groupId>
  <artifactId>{{ project_name }}-parent</artifactId>
  <version>{{ java_version }}</version>
  <packaging>pom</packaging>
  <name>{{ project_title }} Parent</name>
  <description>{{ project_title }}</description>
  <modules>
    <module>module/{{ java_module }}</module>
  </modules>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>21</maven.compiler.release>
    <jspecify.version>1.0.1</jspecify.version>
    <errorprone.annotations.version>2.50.0</errorprone.annotations.version>
    <errorprone.core.version>2.50.0</errorprone.core.version>
    <nullaway.version>0.14.1</nullaway.version>
    <maven-jar-plugin.version>3.5.1</maven-jar-plugin.version>
    <maven-resources-plugin.version>3.5.0</maven-resources-plugin.version>
    <maven-compiler-plugin.version>3.16.0</maven-compiler-plugin.version>
    <maven-surefire-plugin.version>3.6.0</maven-surefire-plugin.version>
    <maven-failsafe-plugin.version>3.6.0</maven-failsafe-plugin.version>
    <maven-checkstyle-plugin.version>3.6.0</maven-checkstyle-plugin.version>
    <checkstyle.version>13.8.0</checkstyle.version>
    <spotbugs-maven-plugin.version>4.10.4.1</spotbugs-maven-plugin.version>
    <spotbugs.version>4.10.4</spotbugs.version>
    <jacoco-maven-plugin.version>0.8.15</jacoco-maven-plugin.version>
    <maven-javadoc-plugin.version>3.12.0</maven-javadoc-plugin.version>
    <junit.version>6.1.3</junit.version>
    <assertj.version>3.27.7</assertj.version>
  </properties>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.jspecify</groupId>
        <artifactId>jspecify</artifactId>
        <version>${jspecify.version}</version>
      </dependency>
      <dependency>
        <groupId>com.google.errorprone</groupId>
        <artifactId>error_prone_annotations</artifactId>
        <version>${errorprone.annotations.version}</version>
      </dependency>
      <dependency>
        <groupId>org.junit</groupId>
        <artifactId>junit-bom</artifactId>
        <version>${junit.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
      <dependency>
        <groupId>org.assertj</groupId>
        <artifactId>assertj-core</artifactId>
        <version>${assertj.version}</version>
        <scope>test</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <build>
    <pluginManagement>
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-jar-plugin</artifactId>
          <version>${maven-jar-plugin.version}</version>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-resources-plugin</artifactId>
          <version>${maven-resources-plugin.version}</version>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-compiler-plugin</artifactId>
          <version>${maven-compiler-plugin.version}</version>
          <configuration>
            <annotationProcessorPaths>
              <path>
                <groupId>com.google.errorprone</groupId>
                <artifactId>error_prone_core</artifactId>
                <version>${errorprone.core.version}</version>
              </path>
              <path>
                <groupId>com.uber.nullaway</groupId>
                <artifactId>nullaway</artifactId>
                <version>${nullaway.version}</version>
              </path>
            </annotationProcessorPaths>
            <release>${maven.compiler.release}</release>
            <compilerArgs>
              <arg>-parameters</arg>
              <arg>--should-stop=ifError=FLOW</arg>
              <arg>-XDcompilePolicy=simple</arg>
              <arg>-XDaddTypeAnnotationsToSymbol=true</arg>
              <!-- prettier-ignore-start -->
              <arg>-Xplugin:ErrorProne -XepOpt:NullAway:JSpecifyMode=true -XepOpt:NullAway:OnlyNullMarked=true -XepOpt:NullAway:CheckOptionalEmptiness=true -XepOpt:NullAway:AcknowledgeRestrictiveAnnotations=true -XepDisableWarningsInGeneratedCode -XepExcludedPaths:.*/target/generated-sources/.* -Xep:InvalidInlineTag:OFF -Xep:MultipleNullnessAnnotations:OFF -Xep:AddNullMarkedToPackageInfo:ERROR -Xep:AmbiguousMethodReference:ERROR -Xep:ArgumentSelectionDefectChecker:ERROR -Xep:ArrayAsKeyOfSetOrMap:ERROR -Xep:AssertEqualsArgumentOrderChecker:ERROR -Xep:AssertFalse:ERROR -Xep:AssertThrowsMultipleStatements:ERROR -Xep:AssertionFailureIgnored:ERROR -Xep:BadComparable:ERROR -Xep:BadImport:ERROR -Xep:BadInstanceof:ERROR -Xep:BigDecimalEquals:ERROR -Xep:BigDecimalLiteralDouble:ERROR -Xep:ByteBufferBackingArray:ERROR -Xep:CacheLoaderNull:ERROR -Xep:CannotMockFinalClass:ERROR -Xep:CanonicalDuration:ERROR -Xep:CatchAndPrintStackTrace:ERROR -Xep:CatchFail:ERROR -Xep:CheckedExceptionNotThrown:ERROR -Xep:ClassCanBeStatic:ERROR -Xep:ClassName:ERROR -Xep:ClassNamedLikeTypeParameter:ERROR -Xep:ClassNewInstance:ERROR -Xep:CollectionUndefinedEquality:ERROR -Xep:CollectorShouldNotUseState:ERROR -Xep:ComparableAndComparator:ERROR -Xep:CompareToZero:ERROR -Xep:ComparisonContractViolated:ERROR -Xep:ComplexBooleanConstant:ERROR -Xep:ConstantField:ERROR -Xep:DateFormatConstant:ERROR -Xep:DeduplicateConstants:ERROR -Xep:DefaultCharset:ERROR -Xep:DefaultPackage:ERROR -Xep:DoubleCheckedLocking:ERROR -Xep:EmptyCatch:ERROR -Xep:EmptyIf:ERROR -Xep:EmptyTopLevelDeclaration:ERROR -Xep:EqualsBrokenForNull:ERROR -Xep:EqualsGetClass:ERROR -Xep:EqualsIncompatibleType:ERROR -Xep:EqualsUnsafeCast:ERROR -Xep:EqualsUsingHashCode:ERROR -Xep:ExpectedExceptionChecker:ERROR -Xep:ExtendingJUnitAssert:ERROR -Xep:FallThrough:ERROR -Xep:FieldCanBeLocal:ERROR -Xep:FieldCanBeStatic:ERROR -Xep:Finally:ERROR -Xep:FloatCast:ERROR -Xep:FloatingPointLiteralPrecision:ERROR -Xep:ForEachIterable:ERROR -Xep:FutureReturnValueIgnored:ERROR -Xep:FuzzyEqualsShouldNotBeUsedInEqualsMethod:ERROR -Xep:GetClassOnEnum:ERROR -Xep:HidingField:ERROR -Xep:ImmutableAnnotationChecker:ERROR -Xep:ImmutableEnumChecker:ERROR -Xep:InconsistentCapitalization:ERROR -Xep:InconsistentHashCode:ERROR -Xep:InconsistentOverloads:ERROR -Xep:IncrementInForLoopAndHeader:ERROR -Xep:InlineFormatString:ERROR -Xep:InputStreamSlowMultibyteRead:ERROR -Xep:InstanceOfAndCastMatchWrongType:ERROR -Xep:InterfaceWithOnlyStatics:ERROR -Xep:InterruptedExceptionSwallowed:ERROR -Xep:InvalidThrows:ERROR -Xep:IterableAndIterator:ERROR -Xep:IterablePathParameter:ERROR -Xep:JavaDurationGetSecondsGetNano:ERROR -Xep:JavaDurationWithNanos:ERROR -Xep:JavaDurationWithSeconds:ERROR -Xep:JavaInstantGetSecondsGetNano:ERROR -Xep:JavaLangClash:ERROR -Xep:JavaLocalDateTimeGetNano:ERROR -Xep:JavaLocalTimeGetNano:ERROR -Xep:JavaTimeDefaultTimeZone:ERROR -Xep:LockNotBeforeTry:ERROR -Xep:LockOnBoxedPrimitive:ERROR -Xep:LogicalAssignment:ERROR -Xep:LongLiteralLowerCaseSuffix:ERROR -Xep:MethodCanBeStatic:ERROR -Xep:MissingCasesInEnumSwitch:ERROR -Xep:MissingOverride:ERROR -Xep:MixedMutabilityReturnType:ERROR -Xep:ModifiedButNotUsed:ERROR -Xep:ModifyCollectionInEnhancedForLoop:ERROR -Xep:ModifySourceCollectionInStream:ERROR -Xep:MultiVariableDeclaration:ERROR -Xep:MultipleParallelOrSequentialCalls:ERROR -Xep:MultipleTopLevelClasses:ERROR -Xep:MultipleUnaryOperatorsInMethodCall:ERROR -Xep:MutableConstantField:ERROR -Xep:MutablePublicArray:ERROR -Xep:NestedInstanceOfConditions:ERROR -Xep:NonAtomicVolatileUpdate:ERROR -Xep:NonCanonicalStaticMemberImport:ERROR -Xep:NonOverridingEquals:ERROR -Xep:NullAway:ERROR -Xep:NullOptional:ERROR -Xep:NullableConstructor:ERROR -Xep:NullablePrimitive:ERROR -Xep:NullableVoid:ERROR -Xep:NumericEquality:ERROR -Xep:ObjectToString:ERROR -Xep:ObjectsHashCodePrimitive:ERROR -Xep:OperatorPrecedence:ERROR -Xep:OptionalMapToOptional:ERROR -Xep:OrphanedFormatString:ERROR -Xep:Overrides:ERROR -Xep:OverrideThrowableToString:ERROR -Xep:PackageLocation:ERROR -Xep:PreconditionsCheckNotNullRepeated:ERROR -Xep:PreferJavaTimeOverload:ERROR -Xep:PrimitiveAtomicReference:ERROR -Xep:ProtectedMembersInFinalClass:ERROR -Xep:ReferenceEquality:ERROR -Xep:RemoveUnusedImports:ERROR -Xep:ReturnFromVoid:ERROR -Xep:RxReturnValueIgnored:ERROR -Xep:SameNameButDifferent:ERROR -Xep:ShortCircuitBoolean:ERROR -Xep:StaticAssignmentInConstructor:ERROR -Xep:StaticGuardedByInstance:ERROR -Xep:StaticQualifiedUsingExpression:ERROR -Xep:StreamResourceLeak:ERROR -Xep:StringSplitter:ERROR -Xep:SynchronizeOnNonFinalField:ERROR -Xep:ThreadJoinLoop:ERROR -Xep:ThreadLocalUsage:ERROR -Xep:ThreeLetterTimeZoneID:ERROR -Xep:TimeUnitConversionChecker:ERROR -Xep:ToStringReturnsNull:ERROR -Xep:TreeToString:ERROR -Xep:TypeEquals:ERROR -Xep:TypeNameShadowing:ERROR -Xep:TypeParameterShadowing:ERROR -Xep:TypeParameterUnusedInFormals:ERROR -Xep:URLEqualsHashCode:ERROR -Xep:UndefinedEquals:ERROR -Xep:UnnecessaryAnonymousClass:ERROR -Xep:UnnecessaryLambda:ERROR -Xep:UnnecessaryMethodInvocationMatcher:ERROR -Xep:UnnecessaryParentheses:ERROR -Xep:UnsafeFinalization:ERROR -Xep:UnsafeReflectiveConstructionCast:ERROR -Xep:UnusedMethod:ERROR -Xep:UnusedNestedClass:ERROR -Xep:UnusedVariable:ERROR -Xep:UseCorrectAssertInTests:ERROR -Xep:Var:ERROR -Xep:VariableNameSameAsType:ERROR -Xep:WaitNotInLoop:ERROR -Xep:WildcardImport:ERROR</arg>
              <!-- prettier-ignore-end -->
            </compilerArgs>
          </configuration>
          <executions>
            <execution>
              <id>default-testCompile</id>
              <goals>
                <goal>testCompile</goal>
              </goals>
              <configuration>
                <compilerArgs>
                  <arg>-parameters</arg>
                  <arg>--should-stop=ifError=FLOW</arg>
                  <arg>-XDcompilePolicy=simple</arg>
                  <arg>-XDaddTypeAnnotationsToSymbol=true</arg>
                  <!-- prettier-ignore-start -->
                  <arg>-Xplugin:ErrorProne -XepDisableWarningsInGeneratedCode -XepExcludedPaths:.*/target/generated-sources/.* -Xep:NullAway:OFF -Xep:JavaTimeDefaultTimeZone:OFF -Xep:AddNullMarkedToPackageInfo:ERROR -Xep:AmbiguousMethodReference:ERROR -Xep:ArgumentSelectionDefectChecker:ERROR -Xep:ArrayAsKeyOfSetOrMap:ERROR -Xep:AssertEqualsArgumentOrderChecker:ERROR -Xep:AssertFalse:ERROR -Xep:AssertThrowsMultipleStatements:ERROR -Xep:AssertionFailureIgnored:ERROR -Xep:BadComparable:ERROR -Xep:BadImport:ERROR -Xep:BadInstanceof:ERROR -Xep:BigDecimalEquals:ERROR -Xep:BigDecimalLiteralDouble:ERROR -Xep:ByteBufferBackingArray:ERROR -Xep:CacheLoaderNull:ERROR -Xep:CannotMockFinalClass:ERROR -Xep:CanonicalDuration:ERROR -Xep:CatchAndPrintStackTrace:ERROR -Xep:CatchFail:ERROR -Xep:CheckedExceptionNotThrown:ERROR -Xep:ClassCanBeStatic:ERROR -Xep:ClassName:ERROR -Xep:ClassNamedLikeTypeParameter:ERROR -Xep:ClassNewInstance:ERROR -Xep:CollectionUndefinedEquality:ERROR -Xep:CollectorShouldNotUseState:ERROR -Xep:ComparableAndComparator:ERROR -Xep:CompareToZero:ERROR -Xep:ComparisonContractViolated:ERROR -Xep:ComplexBooleanConstant:ERROR -Xep:ConstantField:ERROR -Xep:DateFormatConstant:ERROR -Xep:DeduplicateConstants:ERROR -Xep:DefaultCharset:ERROR -Xep:DefaultPackage:ERROR -Xep:DoubleBraceInitialization:ERROR -Xep:DoubleCheckedLocking:ERROR -Xep:EmptyCatch:ERROR -Xep:EmptyIf:ERROR -Xep:EmptyTopLevelDeclaration:ERROR -Xep:EqualsBrokenForNull:ERROR -Xep:EqualsGetClass:ERROR -Xep:EqualsIncompatibleType:ERROR -Xep:EqualsUnsafeCast:ERROR -Xep:EqualsUsingHashCode:ERROR -Xep:ExpectedExceptionChecker:ERROR -Xep:ExtendingJUnitAssert:ERROR -Xep:FallThrough:ERROR -Xep:FieldCanBeLocal:ERROR -Xep:FieldCanBeStatic:ERROR -Xep:Finally:ERROR -Xep:FloatCast:ERROR -Xep:FloatingPointLiteralPrecision:ERROR -Xep:ForEachIterable:ERROR -Xep:FutureReturnValueIgnored:ERROR -Xep:FuzzyEqualsShouldNotBeUsedInEqualsMethod:ERROR -Xep:GetClassOnEnum:ERROR -Xep:HidingField:ERROR -Xep:ImmutableAnnotationChecker:ERROR -Xep:ImmutableEnumChecker:ERROR -Xep:InconsistentCapitalization:ERROR -Xep:InconsistentHashCode:ERROR -Xep:InconsistentOverloads:ERROR -Xep:IncrementInForLoopAndHeader:ERROR -Xep:InlineFormatString:ERROR -Xep:InputStreamSlowMultibyteRead:ERROR -Xep:InstanceOfAndCastMatchWrongType:ERROR -Xep:InterfaceWithOnlyStatics:ERROR -Xep:InterruptedExceptionSwallowed:ERROR -Xep:InvalidInlineTag:OFF -Xep:InvalidThrows:ERROR -Xep:IterableAndIterator:ERROR -Xep:IterablePathParameter:ERROR -Xep:JavaDurationGetSecondsGetNano:ERROR -Xep:JavaDurationWithNanos:ERROR -Xep:JavaDurationWithSeconds:ERROR -Xep:JavaInstantGetSecondsGetNano:ERROR -Xep:JavaLangClash:ERROR -Xep:JavaLocalDateTimeGetNano:ERROR -Xep:JavaLocalTimeGetNano:ERROR -Xep:LockNotBeforeTry:ERROR -Xep:LockOnBoxedPrimitive:ERROR -Xep:LogicalAssignment:ERROR -Xep:LongLiteralLowerCaseSuffix:ERROR -Xep:MethodCanBeStatic:ERROR -Xep:MissingCasesInEnumSwitch:ERROR -Xep:MissingOverride:ERROR -Xep:MixedMutabilityReturnType:ERROR -Xep:ModifiedButNotUsed:ERROR -Xep:ModifyCollectionInEnhancedForLoop:ERROR -Xep:ModifySourceCollectionInStream:ERROR -Xep:MultiVariableDeclaration:ERROR -Xep:MultipleNullnessAnnotations:OFF -Xep:MultipleParallelOrSequentialCalls:ERROR -Xep:MultipleTopLevelClasses:ERROR -Xep:MultipleUnaryOperatorsInMethodCall:ERROR -Xep:MutableConstantField:ERROR -Xep:MutablePublicArray:ERROR -Xep:NestedInstanceOfConditions:ERROR -Xep:NonAtomicVolatileUpdate:ERROR -Xep:NonCanonicalStaticMemberImport:ERROR -Xep:NonOverridingEquals:ERROR -Xep:NullOptional:ERROR -Xep:NullableConstructor:ERROR -Xep:NullablePrimitive:ERROR -Xep:NullableVoid:ERROR -Xep:NumericEquality:ERROR -Xep:ObjectToString:ERROR -Xep:ObjectsHashCodePrimitive:ERROR -Xep:OperatorPrecedence:ERROR -Xep:OptionalMapToOptional:ERROR -Xep:OrphanedFormatString:ERROR -Xep:Overrides:ERROR -Xep:OverrideThrowableToString:ERROR -Xep:PackageLocation:ERROR -Xep:PreconditionsCheckNotNullRepeated:ERROR -Xep:PreferJavaTimeOverload:ERROR -Xep:PrimitiveAtomicReference:ERROR -Xep:ProtectedMembersInFinalClass:ERROR -Xep:ReferenceEquality:ERROR -Xep:RemoveUnusedImports:ERROR -Xep:ReturnFromVoid:ERROR -Xep:RxReturnValueIgnored:ERROR -Xep:SameNameButDifferent:ERROR -Xep:ShortCircuitBoolean:ERROR -Xep:StaticAssignmentInConstructor:ERROR -Xep:StaticGuardedByInstance:ERROR -Xep:StaticQualifiedUsingExpression:ERROR -Xep:StreamResourceLeak:ERROR -Xep:StringSplitter:ERROR -Xep:SynchronizeOnNonFinalField:ERROR -Xep:ThreadJoinLoop:ERROR -Xep:ThreadLocalUsage:ERROR -Xep:ThreeLetterTimeZoneID:ERROR -Xep:TimeUnitConversionChecker:ERROR -Xep:ToStringReturnsNull:ERROR -Xep:TreeToString:ERROR -Xep:TypeEquals:ERROR -Xep:TypeNameShadowing:ERROR -Xep:TypeParameterShadowing:ERROR -Xep:TypeParameterUnusedInFormals:ERROR -Xep:URLEqualsHashCode:ERROR -Xep:UndefinedEquals:ERROR -Xep:UnnecessaryAnonymousClass:ERROR -Xep:UnnecessaryLambda:ERROR -Xep:UnnecessaryMethodInvocationMatcher:ERROR -Xep:UnnecessaryParentheses:ERROR -Xep:UnsafeFinalization:ERROR -Xep:UnsafeReflectiveConstructionCast:ERROR -Xep:UnusedMethod:ERROR -Xep:UnusedNestedClass:ERROR -Xep:UnusedVariable:ERROR -Xep:UseCorrectAssertInTests:ERROR -Xep:Var:ERROR -Xep:VariableNameSameAsType:ERROR -Xep:WaitNotInLoop:ERROR -Xep:WildcardImport:ERROR</arg>
                  <!-- prettier-ignore-end -->
                </compilerArgs>
              </configuration>
            </execution>
          </executions>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-surefire-plugin</artifactId>
          <version>${maven-surefire-plugin.version}</version>
          <configuration>
            <useModulePath>true</useModulePath>
          </configuration>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-failsafe-plugin</artifactId>
          <version>${maven-failsafe-plugin.version}</version>
          <configuration>
            <useModulePath>true</useModulePath>
          </configuration>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-checkstyle-plugin</artifactId>
          <version>${maven-checkstyle-plugin.version}</version>
          <dependencies>
            <dependency>
              <groupId>com.puppycrawl.tools</groupId>
              <artifactId>checkstyle</artifactId>
              <version>${checkstyle.version}</version>
            </dependency>
          </dependencies>
          <configuration>
            <consoleOutput>true</consoleOutput>
            <failsOnError>true</failsOnError>
            <linkXRef>false</linkXRef>
          </configuration>
        </plugin>
        <plugin>
          <groupId>com.github.spotbugs</groupId>
          <artifactId>spotbugs-maven-plugin</artifactId>
          <version>${spotbugs-maven-plugin.version}</version>
          <dependencies>
            <dependency>
              <groupId>com.github.spotbugs</groupId>
              <artifactId>spotbugs</artifactId>
              <version>${spotbugs.version}</version>
            </dependency>
          </dependencies>
          <configuration>
            <effort>Max</effort>
            <threshold>Low</threshold>
            <xmlOutput>true</xmlOutput>
            <failOnError>true</failOnError>
            <excludeFilterFile>${maven.multiModuleProjectDirectory}/.config/spotbugs/exclude.xml</excludeFilterFile>
          </configuration>
        </plugin>
        <plugin>
          <groupId>org.jacoco</groupId>
          <artifactId>jacoco-maven-plugin</artifactId>
          <version>${jacoco-maven-plugin.version}</version>
          <configuration>
            <rules>
              <rule>
                <element>BUNDLE</element>
                <limits>
                  <limit>
                    <counter>INSTRUCTION</counter>
                    <value>COVEREDRATIO</value>
                    <minimum>0.90</minimum>
                  </limit>
                </limits>
              </rule>
            </rules>
          </configuration>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-javadoc-plugin</artifactId>
          <version>${maven-javadoc-plugin.version}</version>
          <configuration>
            <doclint>all,-missing</doclint>
          </configuration>
        </plugin>
      </plugins>
    </pluginManagement>
    <plugins>
      <plugin>
        <groupId>org.jacoco</groupId>
        <artifactId>jacoco-maven-plugin</artifactId>
        <executions>
          <execution>
            <goals>
              <goal>prepare-agent</goal>
            </goals>
          </execution>
          <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
              <goal>report</goal>
            </goals>
          </execution>
          <execution>
            <id>check</id>
            <goals>
              <goal>check</goal>
            </goals>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>com.github.spotbugs</groupId>
        <artifactId>spotbugs-maven-plugin</artifactId>
        <version>${spotbugs-maven-plugin.version}</version>
        <dependencies>
          <dependency>
            <groupId>com.github.spotbugs</groupId>
            <artifactId>spotbugs</artifactId>
            <version>${spotbugs.version}</version>
          </dependency>
        </dependencies>
        <executions>
          <execution>
            <id>spotbugs-check</id>
            <phase>verify</phase>
            <goals>
              <goal>check</goal>
            </goals>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-checkstyle-plugin</artifactId>
        <executions>
          <execution>
            <id>checkstyle-main</id>
            <phase>verify</phase>
            <goals>
              <goal>check</goal>
            </goals>
            <configuration>
              <configLocation>${maven.multiModuleProjectDirectory}/.config/checkstyle/main.xml</configLocation>
              <sourceDirectories>
                <sourceDirectory>${project.basedir}/src/main/java</sourceDirectory>
              </sourceDirectories>
            </configuration>
          </execution>
          <execution>
            <id>checkstyle-test</id>
            <phase>verify</phase>
            <goals>
              <goal>check</goal>
            </goals>
            <configuration>
              <configLocation>${maven.multiModuleProjectDirectory}/.config/checkstyle/test.xml</configLocation>
              <sourceDirectories>
                <sourceDirectory>${project.basedir}/src/test/java</sourceDirectory>
              </sourceDirectories>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  <licenses>
    <license>
      <name>{{ license }}</name>
      <url>{{ license_url }}</url>
    </license>
  </licenses>
  <developers>
    <developer>
      <name>{{ copyright_holder }}</name>
    </developer>
  </developers>
</project>
```

The `license_url` computed answer is already defined in `copier.yml` (Task 2). Use it directly in the POM:

```xml
<licenses>
  <license>
    <name>{{ license }}</name>
    <url>{{ license_url }}</url>
  </license>
</licenses>
```

- [ ] **Step 2: Create mvnw.jinja and mvnw.cmd.jinja (byte-identical, raw-wrapped)**

The wrapper content must be preserved byte-for-byte. Because the conditional filename requires the `.jinja` suffix, wrap the entire body in `{% raw %}...{% endraw %}` so copier's Jinja pass leaves it untouched.

Preserve the executable bit: copier copies the source file's mode to the rendered target, so `mvnw.jinja` MUST be `chmod +x` before commit (a non-executable `mvnw.jinja` yields a non-executable consumer `mvnw`).

```bash
# Copy real wrapper content
cp /home/ai/java-commons/mvnw     /tmp/mvnw.body
cp /home/ai/java-commons/mvnw.cmd /tmp/mvnw.cmd.body

# Wrap each in raw tags
{
  printf '{%% raw %%}\n'
  cat /tmp/mvnw.body
  printf '\n{%% endraw %%}\n'
} > mvnw.jinja
chmod +x mvnw.jinja

{
  printf '{%% raw %%}\r\n'
  cat /tmp/mvnw.cmd.body
  printf '\r\n{%% endraw %%}\r\n'
} > mvnw.cmd.jinja
```

Note: `mvnw.cmd` uses CRLF line endings; the `.gitattributes` in the template declares `*.cmd text eol=crlf`, so git normalizes on checkout. Build the file with `\r\n` line endings.

Maven wrapper properties and jvm config are copied verbatim (conditional directory part but content is inert — no `{{`/`{%` sequences). The `.mvn` directory itself must be named with the conditional part so it only renders for the java variant:

```bash
mkdir -p "{% if template_type == 'java' %}.mvn{% endif %}/wrapper"
cp /home/ai/java-commons/.mvn/wrapper/maven-wrapper.properties "{% if template_type == 'java' %}.mvn{% endif %}/wrapper/maven-wrapper.properties"
cp /home/ai/java-commons/.mvn/jvm.config "{% if template_type == 'java' %}.mvn{% endif %}/jvm.config"
```

**SMOKE TEST — verify byte-identical wrapper output:**

After a java render into a tmpdir, assert:

```bash
diff <(cat /tmp/mvnw.body) /tmp/test-java/mvnw && echo "mvnw BYTE-IDENTICAL"
```

Expected: `mvnw BYTE-IDENTICAL` (the `{% raw %}` wrapper produced no alterations).

- [ ] **Step 3: Create jvm.config.license.jinja**

Create `{% if template_type == 'java' %}.mvn{% endif %}/jvm.config.license.jinja`:

```txt
{{ spdx_copyright_line }}

SPDX-License-Identifier: CC0-1.0
```

- [ ] **Step 4: Copy checkstyle/spotbugs configs (re-header)**

Read each file, replace the existing SPDX header block with baked header. The `.config` directory must be named with the conditional part:

```bash
mkdir -p "{% if template_type == 'java' %}.config{% endif %}/checkstyle" "{% if template_type == 'java' %}.config{% endif %}/spotbugs"
mv .config/checkstyle/main.xml "{% if template_type == 'java' %}.config{% endif %}/checkstyle/main.xml.jinja" 2>/dev/null || true
cp /home/ai/java-commons/.config/checkstyle/main.xml "{% if template_type == 'java' %}.config{% endif %}/checkstyle/main.xml.jinja"
cp /home/ai/java-commons/.config/checkstyle/test.xml "{% if template_type == 'java' %}.config{% endif %}/checkstyle/test.xml.jinja"
cp /home/ai/java-commons/.config/spotbugs/exclude.xml "{% if template_type == 'java' %}.config{% endif %}/spotbugs/exclude.xml.jinja"
```

Note: quote the conditional directory path with **double quotes** in bash so the inner `'java'` (Jinja string literal) survives; single quotes would strip it and copier would fail under StrictUndefined.

For example, for `{% if template_type == 'java' %}.config{% endif %}/checkstyle/main.xml.jinja`:

```xml
<!-- {{ spdx_copyright_line }}

SPDX-License-Identifier: CC0-1.0 -->
```

Then copy the rest of the content verbatim from java-commons.

- [ ] **Step 5: Create module skeleton files**

Replace `<java_module>` with `{{ java_module }}` and `<java_package>` with `{{ java_package_path }}`
in file paths. `java_package_path` is a computed answer holding
`java_package` with dots replaced by slashes (copier splits template paths on `/`
BEFORE rendering, so a `replace('.', '/')` filter inside a path part would break).
The `module` directory part is gated: `{% if template_type == 'java' %}module{% endif %}`.

**`module/<java_module>/pom.xml.jinja`:**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!-- {{ spdx_copyright_line }}

SPDX-License-Identifier: CC0-1.0 -->
<project
  xmlns="http://maven.apache.org/POM/4.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd"
>
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>{{ java_group_id }}</groupId>
    <artifactId>{{ project_name }}-parent</artifactId>
    <version>{{ java_version }}</version>
    <relativePath>../../pom.xml</relativePath>
  </parent>
  <artifactId>{{ java_module }}</artifactId>
  <name>{{ project_title }}</name>
  <description>{{ project_title }}</description>
  <dependencies>
    <dependency>
      <groupId>org.jspecify</groupId>
      <artifactId>jspecify</artifactId>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter-api</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter-params</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter-engine</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.assertj</groupId>
      <artifactId>assertj-core</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <release>${maven.compiler.release}</release>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-failsafe-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

**`module/<java_module>/src/main/java/module-info.java.jinja`:**

```java
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

import org.jspecify.annotations.NullMarked;

/**
 * {{ project_title }} module.
 */
@NullMarked module {{ java_package }} {
  requires static org.jspecify;
  requires java.base;
  exports {{ java_package }};
}
```

**`module/<java_module>/src/main/java/{{ java_package_path }}/package-info.java.jinja`:**

```java
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

@NullMarked
package {{ java_package }};

import org.jspecify.annotations.NullMarked;
```

**`module/<java_module>/src/main/java/{{ java_package_path }}/Example.java.jinja`:**

```java
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

package {{ java_package }};

/**
 * Example class for the generated project skeleton.
 */
public final class Example {

  /** Creates an example. */
  public Example() {}

  /**
   * Returns a static example value.
   *
   * @return the value
   */
  public String value() {
    return "example";
  }
}
```

**`module/<java_module>/src/test/java/module-info.java.jinja`:**

```java
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

module {{ java_package }}.blackbox {
  requires {{ java_package }};
  requires org.junit.jupiter.api;
  requires org.assertj.core;
  opens {{ java_package }}.blackbox to org.junit.platform.commons;
}
```

**`module/<java_module>/src/test/java/{{ java_package_path }}/blackbox/ExampleTest.java.jinja`:**

```java
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

package {{ java_package }}.blackbox;

import static org.assertj.core.api.Assertions.assertThat;

import {{ java_package }}.Example;
import org.junit.jupiter.api.Test;

class ExampleTest {

  @Test
  void value() {
    assertThat(new Example().value()).isEqualTo("example");
  }
}
```

Note: `{{ java_package }}` renders dotted names in `import` statements (e.g., `import com.xenoterracide.sample.Example`). File paths use `{{ java_package_path }}` (the dotted package with dots replaced by slashes) to produce directory structures.

- [ ] **Step 6: Smoke test java variant**

Run:

```bash
uv run copier copy --trust --defaults \
  --data template_type=java \
  --data project_name=sample \
  --data java_group_id=com.example \
  /tmp/test-java
ls /tmp/test-java/pom.xml /tmp/test-java/mvnw /tmp/test-java/.mvn/jvm.config
ls /tmp/test-java/module/sample/src/main/java/com/example/sample/Example.java
```

Expected: all files present, `mvnw` is +x

- [ ] **Step 7: Commit**

```bash
git add mvnw.jinja mvnw.cmd.jinja \
  "{% if template_type == 'java' %}pom.xml{% endif %}.jinja" \
  "{% if template_type == 'java' %}.mvn{% endif %}" \
  "{% if template_type == 'java' %}.config{% endif %}" \
  "{% if template_type == 'java' %}module{% endif %}"
git commit -m "feat: add java variant files with module skeleton"
```

---

### Task 5: TypeScript variant files

**Purpose:** TS-only conditional files: eslint config, tsconfig, vitest, first package skeleton.

**Files:**

- Create: `{% if template_type == 'typescript' %}eslint.config{% endif %}.cts.jinja`
- Create: `{% if template_type == 'typescript' %}tsconfig.eslint.json{% endif %}.jinja`
- Create: `{% if template_type == 'typescript' %}tsconfig.eslint.json{% endif %}.license.jinja`
- Create: `{% if template_type == 'typescript' %}vitest.config{% endif %}.ts.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.license.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.license.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/src/index.ts.jinja`
- Create: `{% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/test/index.test.ts.jinja`

- [ ] **Step 1: Create eslint.config.cts.jinja**

Bake MIT header via whole-line moustache. The config is a nearly verbatim copy of ghb's, adapted to remove project-specific names (`ghb` → `{{ first_package }}`).

```typescript
// {{ spdx_copyright_line }}
//
// SPDX-License-Identifier: MIT

import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsonPluginImport from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig, globalIgnores } from "eslint/config";

const jsonPlugin = (jsonPluginImport as { default?: typeof jsonPluginImport }).default ?? jsonPluginImport;

export default defineConfig([
  globalIgnores([".yarn/", ".pnp.*", "**/dist/", "**/build/", "node_modules/", ".agents/"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: globals.node },
    ...eslint.configs.recommended,
  },
  {
    files: ["**/*.{ts,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
    },
    rules: {
      "max-params": "off",
      "@typescript-eslint/max-params": "error",
      "default-param-last": "off",
      "@typescript-eslint/default-param-last": "error",
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": "error",
      "init-declarations": "off",
      "@typescript-eslint/init-declarations": "error",
      "prefer-destructuring": "off",
      "@typescript-eslint/prefer-destructuring": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/member-ordering": "error",
      "@typescript-eslint/method-signature-style": "error",
      "@typescript-eslint/no-dupe-class-members": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-loop-func": "error",
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unnecessary-parameter-property-assignment": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-useless-empty-export": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/init-declarations": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-empty-function": "error",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/max-params": "off",
      "@typescript-eslint/no-use-before-define": "off",
    },
  },
  {
    files: ["**/*.json"],
    ignores: ["**/tsconfig.json", "**/tsconfig.*.json"],
    plugins: { json: jsonPlugin },
    language: "json/json",
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.json5"],
    plugins: { json: jsonPlugin },
    language: "json/json5",
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.jsonc", "**/tsconfig.json", "**/tsconfig.*.json"],
    plugins: { json: jsonPlugin },
    language: "json/jsonc",
    languageOptions: { allowTrailingCommas: true },
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: [markdown.configs.recommended],
  },
]);
```

- [ ] **Step 2: Create tsconfig.eslint.json.jinja**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["eslint.config.cts", "vitest.config.ts", "packages/**/*.ts"]
}
```

- [ ] **Step 3: Create tsconfig.eslint.json.license.jinja**

```
{{ spdx_copyright_line }}

SPDX-License-Identifier: CC0-1.0
```

- [ ] **Step 4: Create vitest.config.ts.jinja**

```typescript
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.agents/**", "**/.pnp.*"],
    projects: [
      {
        test: {
          name: "{{ first_package }}",
          root: "./packages/{{ first_package }}",
          include: ["**/*.test.ts"],
        },
      },
    ],
    coverage: {
      exclude: ["**/.pnp.*", "**/node_modules/**", "**/*.test.ts", "**/coverage/**"],
      thresholds: {
        statements: 70,
        branches: 58,
        functions: 72,
        lines: 70,
      },
    },
  },
});
```

- [ ] **Step 5: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.jinja**

```json
{
  "name": "{{ ts_scope }}/{{ first_package }}",
  "version": "0.1.0",
  "license": "{{ license }}",
  "packageManager": "yarn@4.18.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "devDependencies": {
    "@types/node": "^24.12.0",
    "typescript": "^6.0.0",
    "vitest": "^4.1.3"
  },
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "tsc",
    "prepack": "yarn build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 6: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/package.json.license.jinja**

```
{{ spdx_copyright_line }}

SPDX-License-Identifier: MIT
```

- [ ] **Step 7: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.jinja**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 8: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/tsconfig.json.license.jinja**

```
{{ spdx_copyright_line }}

SPDX-License-Identifier: CC0-1.0
```

- [ ] **Step 9: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/src/index.ts.jinja**

```typescript
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

/**
 * Sample function.
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

- [ ] **Step 10: Create {% if template_type == 'typescript' %}packages{% endif %}/{{ first_package }}/test/index.test.ts.jinja**

```typescript
// {{ spdx_copyright_line }}
//
// {{ project_license_line }}

import { describe, expect, it } from "vitest";

import { greet } from "../src/index.js";

describe("greet", () => {
  it("greets", () => {
    expect(greet("world")).toBe("Hello, world!");
  });
});
```

- [ ] **Step 11: Smoke test typescript variant**

Run:

```bash
uv run copier copy --trust --defaults \
  --data template_type=typescript \
  --data project_name=sample \
  /tmp/test-ts
ls /tmp/test-ts/eslint.config.cts /tmp/test-ts/vitest.config.ts
ls /tmp/test-ts/packages/sample/src/index.ts
ls /tmp/test-ts/packages/sample/test/index.test.ts
```

Expected: all files present, no `.jinja` in output

- [ ] **Step 12: Commit**

```bash
git add eslint.config.cts.jinja tsconfig.eslint.json.jinja \
  tsconfig.eslint.json.license.jinja vitest.config.ts.jinja \
  "{% if template_type == 'typescript' %}packages{% endif %}"
git commit -m "feat: add typescript variant files with first package skeleton"
```

---

### Task 6: Staged consumer workflows

**Purpose:** Rendered CI workflow files for generated projects, staged under `staged/` so automation commits avoid `.github/workflows/` scope restriction.

**Files:**

- Create: `staged/.github/workflows/pre-commit.yml.jinja`
- Create: `staged/.github/workflows/test.yml.jinja`
- Create: `staged/.github/workflows/devtools-regression.yml.jinja`
- Create: `staged/.github/workflows/{% if use_opencode %}opencode.yml{% endif %}.jinja`
- Create: `staged/README.jinja`

- [ ] **Step 1: Create pre-commit.yml.jinja**

```yaml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT

name: pre-commit
on: push
permissions:
  contents: read
jobs:
  license:
    uses: xenoterracide/github/.github/workflows/license.yml@836e9f662ac920420ea5123930f657fadb86d9dd # develop
  prettier:
    uses: xenoterracide/github/.github/workflows/prettier.yml@836e9f662ac920420ea5123930f657fadb86d9dd # develop
  shfmt:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/cache@v6.1.0
        with:
          path: ~/.asdf
          key: asdf-${{ runner.os }}-${{ hashFiles('.tool-versions') }}
          restore-keys: asdf-${{ runner.os }}-
      - uses: asdf-vm/actions/install@v4.0.1
      - run: shfmt -d git/hooks/
```

- [ ] **Step 2: Create test.yml.jinja**

```yaml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT

name: test
on: push
permissions:
  contents: read
jobs:
{% if template_type == 'java' %}
  maven:
    uses: xenoterracide/github/.github/workflows/maven.yml@836e9f662ac920420ea5123930f657fadb86d9dd # develop
{% endif %}
{% if template_type == 'typescript' %}
  yarn:
    uses: xenoterracide/github/.github/workflows/yarn.yml@836e9f662ac920420ea5123930f657fadb86d9dd # develop
{% endif %}
  shellcheck:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/cache@v6.1.0
        with:
          path: ~/.asdf
          key: asdf-${{ runner.os }}-${{ hashFiles('.tool-versions') }}
          restore-keys: asdf-${{ runner.os }}-
      - uses: asdf-vm/actions/install@v4.0.1
      - run: shellcheck git/hooks/*
```

- [ ] **Step 3: Create devtools-regression.yml.jinja**

The shared `regression-devtool-*` workflows in `xenoterracide/github` may not exist. Consumer regression jobs call `node-cli.yml` (which exists and tests devtool version stability):

```yaml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT

name: devtools-regression
on: push
permissions:
  contents: read
jobs:
  regression:
    uses: xenoterracide/github/.github/workflows/node-cli.yml@836e9f662ac920420ea5123930f657fadb86d9dd # develop
  shell:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/cache@v6.1.0
        with:
          path: ~/.asdf
          key: asdf-${{ runner.os }}-${{ hashFiles('.tool-versions') }}
          restore-keys: asdf-${{ runner.os }}-
      - uses: asdf-vm/actions/install@v4.0.1
      - run: shfmt --version
      - run: shellcheck --version
```

- [ ] **Step 4: Create opencode.yml.jinja (conditional)**

Filename: `staged/.github/workflows/{% if use_opencode %}opencode.yml{% endif %}.jinja`

If `use_opencode: false`, the filename renders empty and copier skips the file entirely (standard copier conditional-file pattern).

```yaml
# {{ spdx_copyright_line }}
#
# SPDX-License-Identifier: MIT

name: opencode

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: |
      contains(github.event.comment.body, ' /oc') ||
      startsWith(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, ' /opencode') ||
      startsWith(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: read
      issues: read
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          persist-credentials: false

      - uses: anomalyco/opencode/github@v1.18.29
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
        with:
          model: opencode/big-pickle
```

- [ ] **Step 5: Create staged/README.jinja**

```markdown
<!-- {{ spdx_copyright_line }} -->

<!-- {{ spdx_license_line }} -->

# Staged workflows

These workflow files are generated by the template and staged here.
A human must copy them into `.github/workflows/` using credentials with
the `workflow` scope:

    cp -r staged/.github/workflows .github/workflows
    git add .github/workflows
    git commit -m "ci: add generated workflows"
    git push
```

- [ ] **Step 6: Commit**

```bash
git add staged/
git commit -m "feat: add staged consumer workflows for all variants"
```

---

### Task 7: Template self-test harness

**Purpose:** pytest suite that renders each variant, asserts structure, and verifies REUSE/prettier compliance. Includes a `verify.sh` for full CI (install + lint + build).

**Files:**

- Create: `tests/conftest.py`
- Create: `tests/test_render.py`
- Create: `tests/verify.sh`

- [ ] **Step 1: Create tests/conftest.py**

```python
from pathlib import Path

import copier

TEMPLATE = Path(__file__).resolve().parent.parent

COMMON = {
    "project_name": "sample",
    "project_title": "Sample",
    "license": "GPL-3.0-or-later",
    "copyright_holder": "Caleb Cushing",
    "use_opencode": True,
}

JAVA_ANSWERS = {
    **COMMON,
    "template_type": "java",
    "java_group_id": "com.example",
    "java_module": "sample",
    "java_version": "0.0.0",
}

TS_ANSWERS = {
    **COMMON,
    "template_type": "typescript",
    "ts_scope": "@example",
    "first_package": "sample",
}


def copy_template(tmp_path: Path, answers: dict) -> Path:
    dst = tmp_path / "generated"
    copier.run_copy(
        src_path=str(TEMPLATE),
        dst_path=str(dst),
        data=answers,
        defaults=True,
        overwrite=True,
        unsafe=True,
        quiet=True,
    )
    return dst
```

- [ ] **Step 2: Create tests/test_render.py**

```python
from pathlib import Path

import pytest

from conftest import JAVA_ANSWERS, TS_ANSWERS, copy_template


@pytest.fixture(params=["java", "typescript"])
def generated(request, tmp_path):
    answers = JAVA_ANSWERS if request.param == "java" else TS_ANSWERS
    return copy_template(tmp_path, answers), answers


def test_copier_answers(generated):
    dst, _ = generated
    assert (dst / ".copier-answers.yml").exists()
    text = (dst / ".copier-answers.yml").read_text()
    assert "_src_path:" in text
    assert "_commit:" in text


def test_no_jinja_leak(generated):
    dst, _ = generated
    leftover = [p for p in dst.rglob("*") if p.suffix == ".jinja"]
    assert not leftover


def test_no_copier_yml_leak(generated):
    """copier.yml is added to _exclude; must not appear in consumer output."""
    dst, _ = generated
    assert not (dst / "copier.yml").exists()


def test_rendered_supersedes_static(generated):
    """Names that also exist as static authoring copies must still render."""
    dst, _ = generated
    envrc = (dst / ".envrc").read_text()
    assert ".share" not in envrc
    assert "asdf install" in envrc
    for rel in [".tool-versions", "REUSE.toml", ".lintstagedrc.cjs"]:
        assert (dst / rel).exists(), f"render suppressed for: {rel}"
        content = (dst / rel).read_text()
        assert "{{" not in content
        assert ".share" not in content


def test_shared_files_present(generated):
    dst, _ = generated
    for rel in [
        ".editorconfig",
        ".gitattributes",
        ".gitignore",
        ".prettierignore",
        "package.json",
        "pyproject.toml",
        "REUSE.toml",
        ".envrc",
        "README.md",
        "AGENTS.md",
        "CONTRIBUTING.md",
        "git/hooks/pre-commit",
        "git/hooks/commit-msg",
        "git/hooks/post-checkout",
        "git/hooks/post-merge",
        "git/hooks/sync-tooling",
        "git/hooks/check-yarn-env",
    ]:
        assert (dst / rel).exists(), f"missing shared file: {rel}"


def test_envrc_no_share_refs(generated):
    dst, _ = generated
    content = (dst / ".envrc").read_text()
    assert ".share" not in content
    assert "asdf install" in content


def test_java_layout(generated):
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    for rel in [
        "pom.xml",
        "mvnw",
        "mvnw.cmd",
        ".mvn/jvm.config",
        ".config/checkstyle/main.xml",
        ".config/checkstyle/test.xml",
        ".config/spotbugs/exclude.xml",
        "module/sample/pom.xml",
        "module/sample/src/main/java/com/example/sample/Example.java",
        "module/sample/src/main/java/module-info.java",
        "module/sample/src/test/java/com/example/sample/blackbox/ExampleTest.java",
        "module/sample/src/test/java/module-info.java",
    ]:
        assert (dst / rel).exists(), f"missing java file: {rel}"
    assert not (dst / "eslint.config.cts").exists()
    assert not (dst / "packages").exists()
    assert (dst / "staged/.github/workflows/pre-commit.yml").exists()
    assert (dst / "staged/.github/workflows/test.yml").exists()


def test_ts_layout(generated):
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    for rel in [
        "eslint.config.cts",
        "tsconfig.eslint.json",
        "vitest.config.ts",
        "packages/sample/package.json",
        "packages/sample/src/index.ts",
        "packages/sample/test/index.test.ts",
        "packages/sample/tsconfig.json",
    ]:
        assert (dst / rel).exists(), f"missing ts file: {rel}"
    assert not (dst / "pom.xml").exists()
    assert not (dst / "mvnw").exists()
    assert not (dst / ".mvn").exists()
    assert not (dst / "module").exists()
    assert (dst / "staged/.github/workflows/pre-commit.yml").exists()
    assert (dst / "staged/.github/workflows/test.yml").exists()


def test_maven_wrapper_executable(generated):
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    import stat
    st = (dst / "mvnw").stat()
    assert st.st_mode & stat.S_IXUSR


def test_opencode_workflow(generated):
    dst, answers = generated
    assert answers["use_opencode"] is True
    assert (dst / "staged/.github/workflows/opencode.yml").exists()


def test_opencode_workflow_absent_when_disabled(tmp_path):
    """When use_opencode is false, the opencode workflow must not be generated."""
    import copier
    answers = {**JAVA_ANSWERS, "use_opencode": False}
    dst = copy_template(tmp_path, answers)
    assert not (dst / "staged/.github/workflows/opencode.yml").exists()


def test_package_json_is_valid_json(generated):
    import json

    dst, _ = generated
    data = json.loads((dst / "package.json").read_text())
    assert data["packageManager"] == "yarn@4.18.0"


def test_pyproject_toml_is_valid(generated):
    import tomllib

    dst, _ = generated
    data = tomllib.loads((dst / "pyproject.toml").read_text())
    assert data["project"]["name"] == "sample"


def test_precommit_content(generated):
    dst, _ = generated
    content = (dst / "staged/.github/workflows/pre-commit.yml").read_text()
    assert "xenoterracide/github/.github/workflows/license.yml@" in content


def test_reuse_lint(generated):
    """Verify that generated project passes reuse lint (offline — no download task)."""
    import subprocess
    dst, _ = generated
    # Fetch license texts first (required for REUSE compliance)
    subprocess.run(
        ["uvx", "reuse@6.2.0", "download", "--all"],
        cwd=dst, check=True, capture_output=True, timeout=60,
    )
    result = subprocess.run(
        ["uvx", "reuse@6.2.0", "lint"],
        cwd=dst, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, f"reuse lint failed:\n{result.stdout}\n{result.stderr}"
```

- [ ] **Step 3: Create tests/verify.sh**

```bash
#!/bin/sh
# Full verification of a generated project.
# Usage: ./tests/verify.sh [java|typescript]
set -eu

VARIANT="${1:-java}"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Generating $VARIANT project into $TMPDIR..."
if [ "$VARIANT" = java ]; then
  uv run copier copy --trust --defaults \
    --data template_type=java \
    --data project_name=sample \
    --data java_group_id=com.example \
    --data java_module=sample \
    --data java_version=0.0.0 \
    "$(pwd)" "$TMPDIR/sample"
else
  uv run copier copy --trust --defaults \
    --data template_type=typescript \
    --data project_name=sample \
    "$(pwd)" "$TMPDIR/sample"
fi

cd "$TMPDIR/sample"
echo "Installing dependencies..."
yarn install
uv sync

echo "Running prettier check..."
yarn lint:prettier

echo "Running reuse lint..."
yarn lint:reuse

if [ "$VARIANT" = java ]; then
  echo "Running maven verify..."
  ./mvnw -q verify
else
  echo "Running typecheck..."
  yarn typecheck
  echo "Running tests..."
  yarn test
fi

echo "All $VARIANT checks passed."
```

```bash
chmod +x tests/verify.sh
```

- [ ] **Step 4: Run pytest to verify**

Run: `uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "feat: add template self-test harness with pytest"
```

---

### Task 8: Authoring CI workflows

**Purpose:** CI for this repo: run the template self-test suite, and the downstream-update job.

**Files:**

- Create: `.github/workflows/test-template.yml`
- Create: `.github/workflows/update-downstream.yml`

- [ ] **Step 1: Create test-template.yml**

```yaml
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

name: test-template
on: push
permissions:
  contents: read
jobs:
  pytest:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: astral-sh/setup-uv@v8.2.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: "24.14.1"
      - uses: actions/setup-java@v5.2.0
        with:
          distribution: temurin
          java-version: "25"
          cache: maven
      - run: uv sync --group dev
      - run: uv run pytest tests/ -v
  verify-java:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: astral-sh/setup-uv@v8.2.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: "24.14.1"
      - uses: actions/setup-java@v5.2.0
        with:
          distribution: temurin
          java-version: "25"
          cache: maven
      - run: ./tests/verify.sh java
  verify-typescript:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: astral-sh/setup-uv@v8.2.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: "24.14.1"
      - run: ./tests/verify.sh typescript
```

- [ ] **Step 2: Create update-downstream.yml**

```yaml
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

name: update-downstream
on:
  push:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        repo:
          - xenoterracide/java-commons
          - xenoterracide/ghb
          - xenoterracide/agent-skills
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          path: template

      - uses: actions/checkout@v7.0.1
        with:
          repository: ${{ matrix.repo }}
          ref: develop
          path: consumer
          token: ${{ secrets.DOWNSTREAM_UPDATE_PAT }}

      - uses: astral-sh/setup-uv@v8.2.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: "24.14.1"
      - uses: actions/setup-java@v5.2.0
        with:
          distribution: temurin
          java-version: "25"
          cache: maven

      - name: Point update at local template checkout
        working-directory: consumer
        run: |
          # copier update derives its template source from _src_path in the answers
          # file (it accepts no src positional). Rewrite it to the local develop
          # checkout so consumers update against this exact pushed SHA; restore the
          # canonical URL afterward so it is not committed into the answers file.
          sed -i "s|^_src_path:.*|_src_path: ${GITHUB_WORKSPACE}/template|" .copier-answers.yml
          uvx copier update --trust --defaults --conflict rej .
          sed -i "s|^_src_path:.*|_src_path: ${TEMPLATE_SRC}|" .copier-answers.yml
        env:
          TEMPLATE_SRC: https://github.com/xenoterracide/base-template

      - name: Run copier update
        working-directory: consumer
        run: uvx copier update --trust --defaults --conflict rej .

      - name: Create PR if changes
        working-directory: consumer
        run: |
          if git diff --quiet; then
            echo "No changes to commit"
            exit 0
          fi
          BRANCH="copier/update-$(date +%Y%m%d-%H%M%S)"
          git checkout -b "$BRANCH"
          git add -A
          git commit -m "chore: copier update from base-template"
          git push origin "$BRANCH"
          gh pr create \
            --title "chore: copier update from base-template" \
            --body "Automated copier update. Review .rej files if any." \
            --base develop
        env:
          GH_TOKEN: ${{ secrets.DOWNSTREAM_UPDATE_PAT }}
```

- [ ] **Step 3: Verify test-template runs locally**

Run: `git add .github/workflows/test-template.yml .github/workflows/update-downstream.yml && git status`
Expected: files staged

Note: this repo's own CI workflows (`pre-commit.yml`, `test.yml`, `devtools-regression.yml`, `opencode.yml`) remain as-is. The new `test-template.yml` and `update-downstream.yml` are added alongside them.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/test-template.yml .github/workflows/update-downstream.yml
git commit -m "ci: add test-template and update-downstream workflows"
```

---

### Task 9: Repo docs rewrite and final verification

**Purpose:** Rewrite `README.md`, `AGENTS.md`, `CONTRIBUTING.md` for the new template purpose; update spec; final full verification.

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/superpowers/specs/2026-09-07-template-repo-design.md` (update status + noted deviations)

- [ ] **Step 1: Rewrite README.md**

```markdown
<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# base-template

Copier project template for the xenoterracide ecosystem. Generates Java
(Maven multi-module) or TypeScript (yarn workspaces) projects with shared
tooling: prettier, REUSE compliance, git hooks, CI workflows, renovate, and
opencode integration.

## Quick start

    copier copy --trust https://github.com/xenoterracide/base-template my-project
    cd my-project
    yarn contribute

## Updating from the template

    copier update --trust

Conflicts appear as `.rej` files; resolve manually.

## Staged workflows

Generated projects receive CI workflows under `staged/.github/workflows/`.
Copy them into `.github/workflows/` using credentials with the `workflow`
scope:

    cp -r staged/.github/workflows .github/workflows
    git add .github/workflows
    git commit -m "ci: add generated workflows"

## License

This template source is licensed under [GPL-3.0-or-later](LICENSES/GPL-3.0-or-later.txt).
Individual generated projects carry their own chosen license.
```

- [ ] **Step 2: Rewrite AGENTS.md**

```markdown
<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# base-template

Copier project template with Java and TypeScript variants.

## Build and Test

- `yarn contribute` — bootstrap (run once after clone)
- `uv run pytest tests/ -v` — template self-tests (renders both variants, asserts structure)
- `./tests/verify.sh java` — full java variant verification
- `./tests/verify.sh typescript` — full typescript variant verification
- `yarn lint:prettier` — prettier check on template sources
- `yarn lint:reuse` — REUSE compliance on template sources

## Source of Truth

- Template config: `copier.yml`
- Spec: `docs/superpowers/specs/2026-09-07-template-repo-design.md`
- Plans: `docs/superpowers/plans/`

## Conventions

- `.jinja` sources carry baked SPDX headers via whole-line moustaches
- Verbatim shared files (hooks, configs) have static inline SPDX headers
- `git/hooks/` uses `git/hooks` path (not `.config/git/hooks`)
- `.jinja` files excluded from authoring prettier (`*.jinja` in `.prettierignore`)
```

- [ ] **Step 3: Rewrite CONTRIBUTING.md**

```markdown
<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing to base-template

## Setup

    git clone https://github.com/xenoterracide/base-template
    cd base-template
    yarn contribute

## Adding files

- **Shared config** (identical across consumers): place verbatim at the root.
  Use inline SPDX headers (CC0 for config, MIT for scripts).
- **Shared rendered** (varies by answer): create `*.jinja` with baked
  whole-line SPDX moustaches. Do NOT list the target name in `_exclude`
  (copier prefers the `.jinja` render over any static copy automatically).
- **Variant-only**: prefix with `{% if template_type == '...' %}` in the
  filename.

## Testing

    uv run pytest tests/ -v          # structure + reuse lint
    ./tests/verify.sh java           # full java verification
    ./tests/verify.sh typescript     # full typescript verification

## Versioning

Tag releases `vX.Y.Z` on `develop`. The downstream-update job triggers on
every push to `develop`, so changes flow to downstream repos continuously.
Document breaking template changes in the commit body.
```

- [ ] **Step 4: Update spec status**

Edit `docs/superpowers/specs/2026-09-07-template-repo-design.md`:

- Change `Status: Draft for review` to `Status: Accepted`
- Note the plan deviations in an addendum or "Recorded deviations" section:
  1. `contribute` uses non-frozen `yarn install && uv sync` (first run has no lockfiles)
  2. `update-downstream.yml` lives directly in `.github/workflows/` (human pushes, no scope issue)
  3. `.envrc` is rendered `.jinja` (not verbatim) to remove `.share/bin` references
  4. `_exclude` corrected: `_exclude` matches rendered destination paths, so
     names with `.jinja` siblings are NOT excluded; `copier.yml` and
     `.python-version` ARE added; `.github/workflows` excludes only the
     top-level CI dir
  5. Variant dirs are gated with CONDITIONAL DIRECTORY PARTS
     (`{% if template_type == 'java' %}module{% endif %}/...`): copier renders
     each path part separately and skips a file when any part renders empty, so
     this (not a whole-path condition) is what stops `module/`/`packages/` from
     leaking into the wrong variant. `java_package_path` is computed in
     `copier.yml` because a `replace('.', '/')` filter inside a path part breaks
     (copier splits paths on `/` before rendering). The update-downstream job
     rewrites `_src_path` in the consumer answers file to the local template
     checkout (copier `update` takes no src positional), then restores the
     canonical URL so it isn't committed.
  6. `test-template.yml` `pytest` and `verify-java` jobs add `setup-node`:
     `_tasks` run `npx prettier` on every copy, and `verify.sh` runs yarn in
     both variants.
  7. `.prettierrc.cjs` (verbatim shared) loads its plugins via a tolerant
     array that filters un-resolvable plugins: at copier copy time the
     generated project has no `node_modules` yet, so the raw
     `require.resolve("@prettier/plugin-xml")` form made the post-copy
     `_tasks` prettier step exit 2 (breaking every copy and the pytest
     suite). Authoring behavior is unchanged (all four plugins resolve
     there); missing plugins are silently skipped at copy time.
  8. `copier.yml` wraps the `SPDX-*` computed-answer templates in
     `REUSE-IgnoreStart`/`REUSE-IgnoreEnd`: the defaults contain the literal
     <!-- REUSE-IgnoreStart -->
     `SPDX-License-Identifier: {{ license }}"`, which `reuse lint` flags as an
     <!-- REUSE-IgnoreEnd -->
     invalid SPDX expression. copier.yml is excluded from consumer output
     (authoring-only), so the markers never reach a generated project.
  9. Authoring `.gitignore` adds `!.envrc.jinja`. When the template source is
     a local, DIRTY git checkout, copier clones HEAD then re-stages the dirty
     worktree via `git add -A`, which honors the parent `.gitignore` — so a
     gitignored-but-tracked template file (`.envrc.jinja` matched `.env*`) is
     dropped from the cloned template and the verbatim `.envrc` (pointing at
     `.share/`) wins over the `.jinja` render. The negation keeps
     `.envrc.jinja` present in the copy source. (Plan line 33's "copier
     prefers the `.jinja` render" only holds on clean worktrees.)

- [ ] **Step 5: Final lint**

Run: `yarn lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md CONTRIBUTING.md docs/superpowers/specs/
git commit -m "docs: rewrite repo docs for template purpose, accept spec"
```
