# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

"""Structure and compliance assertions over rendered variants."""

import json
import os
import re
import stat
import subprocess
import tomllib
import xml.etree.ElementTree as ET

import pytest

from conftest import ANSWERS, JAVA_ANSWERS, TEMPLATE, copy_template

SHARED_FILES = [
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.yml",
    "package.json",
    "pyproject.toml",
    "REUSE.toml",
    ".envrc",
    ".tool-versions",
    ".lintstagedrc.cjs",
    "git-conventional-commits.yaml",
    "pnpm-workspace.yaml",
    "README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    ".config/git/hooks/heal.sh",
    ".config/git/hooks/pre-commit",
    ".config/git/hooks/commit-msg",
    ".config/git/hooks/post-checkout",
    ".config/git/hooks/post-merge",
    "staged/.github/workflows/pre-commit.yml",
    "staged/.github/workflows/devtools-regression.yml",
]


@pytest.fixture(scope="session", params=["java", "typescript", "config"])
def generated(request, tmp_path_factory):
    dst = tmp_path_factory.mktemp(f"render-{request.param}")
    return copy_template(dst, ANSWERS[request.param]), ANSWERS[request.param]


def test_copier_answers(generated):
    dst, _ = generated
    text = (dst / ".copier-answers.yml").read_text()
    assert "_src_path:" in text
    assert "_commit:" in text
    # the answers file carries its header from the template, so copier
    # updates never strip the consumer's coverage; the tag is split so
    # reuse cannot read this source as an SPDX expression
    assert "SPDX-License" + "-Identifier: MIT" in text


def test_no_jinja_leak(generated):
    dst, _ = generated
    assert not [p for p in dst.rglob("*") if p.suffix == ".jinja"]


def test_no_copier_yml_leak(generated):
    dst, _ = generated
    assert not (dst / "copier.yml").exists()


def test_no_opencode_artifacts(generated):
    dst, _ = generated
    assert not [p for p in dst.rglob("*") if "opencode" in p.name.lower()]


def test_shared_files_present(generated):
    dst, _ = generated
    for rel in SHARED_FILES:
        assert (dst / rel).exists(), f"missing shared file: {rel}"


def test_old_hooks_absent(generated):
    dst, _ = generated
    assert not (dst / "git").exists()
    for name in ("sync-tooling", "check-yarn-env"):
        assert not (dst / ".config/git/hooks" / name).exists()


def test_old_prettierrc_cjs_absent(generated):
    """The yml config replaced the yarn-era cjs; the cjs must never render."""
    dst, _ = generated
    assert not (dst / ".prettierrc.cjs").exists()


def test_prettierrc_plugins_are_dev_dependencies(generated):
    """Lint passes --ignore-unknown, so a plugin missing from devDependencies
    would silently skip its file type; every named plugin must ship."""
    dst, _ = generated
    plugins = re.findall(
        r'^\s+- "?([\w@/.-]+)"?$', (dst / ".prettierrc.yml").read_text(), re.M
    )
    dev_deps = json.loads((dst / "package.json").read_text())["devDependencies"]
    assert plugins, "no plugin list in .prettierrc.yml"
    for plugin in plugins:
        assert plugin in dev_deps, f"prettier plugin not installed: {plugin}"


def test_envrc_is_heal_form(generated):
    """Dirty worktrees drop gitignored template files; the render must win."""
    dst, _ = generated
    content = (dst / ".envrc").read_text()
    assert "./.config/git/hooks/heal.sh" in content
    assert ".share" not in content


def test_rendered_supersedes_static(generated):
    dst, _ = generated
    for rel in (".tool-versions", "REUSE.toml", ".lintstagedrc.cjs"):
        content = (dst / rel).read_text()
        assert "{{" not in content
        assert ".share" not in content


def test_tool_versions_matches_authoring(generated):
    """Renders carry the authoring common pins plus the variant's lines."""
    dst, answers = generated
    common = (TEMPLATE / ".tool-versions").read_text()
    rendered = (dst / ".tool-versions").read_text()
    if answers["template_type"] == "java":
        assert rendered == "java temurin-25.0.5+8.0.LTS\nktlint 1.8.0\n" + common
    else:
        assert rendered == common


def test_heal_is_executable(generated):
    dst, _ = generated
    st = (dst / ".config/git/hooks/heal.sh").stat()
    assert st.st_mode & stat.S_IXUSR


def test_no_git_dir_in_render(generated):
    """Copier replaces its default excludes when _exclude is set; .git must stay."""
    dst, _ = generated
    assert not (dst / ".git").exists(), "template clone's .git leaked into render"


def test_no_lockfiles_in_output(generated):
    dst, _ = generated
    assert not (dst / "pnpm-lock.yaml").exists()
    assert not (dst / "uv.lock").exists()


def test_package_json_is_valid_json(generated):
    dst, _ = generated
    data = json.loads((dst / "package.json").read_text())
    # the exact version is Renovate's to bump (customManagers matches the
    # seed in package.json.jinja); the render must only carry a valid pin
    assert re.fullmatch(r"pnpm@\d+\.\d+\.\d+", data["packageManager"])


def _strip_jinja(text: str) -> str:
    text = re.sub(r"\{%[^%]*%\}", "", text)
    return re.sub(r"\{\{[^{}]*\}\}", "x", text)


def test_package_json_defines_the_shared_tool_set():
    """The authoring package.json names the shared tools; ranges are floors."""
    authoring = json.loads((TEMPLATE / "package.json").read_text())
    rendered = json.loads(_strip_jinja((TEMPLATE / "package.json.jinja").read_text()))
    # authoring-only tools never reach a render: renovate validates this
    # repo's template authoring, a job consumers never do
    authoring_only = {"renovate"}
    assert set(authoring["devDependencies"]) - authoring_only <= set(
        rendered["devDependencies"]
    )


def test_tracked_files_end_with_a_newline():
    """insert_final_newline holds where prettier cannot check."""
    vendored = {
        # upstream maven wrapper sources, kept byte-faithful; their renders
        # end with a newline through the raw block instead
        "{% if template_type == 'java' %}mvnw{% endif %}.jinja",
        "{% if template_type == 'java' %}mvnw.cmd{% endif %}.jinja",
    }
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=TEMPLATE, capture_output=True, check=True
    ).stdout.split(b"\0")
    for raw in tracked:
        if not raw:
            continue
        rel = raw.decode()
        if rel in vendored:
            continue
        assert (TEMPLATE / rel).read_bytes().endswith(b"\n"), f"no final newline: {rel}"


def test_pyproject_toml_is_valid(generated):
    dst, _ = generated
    data = tomllib.loads((dst / "pyproject.toml").read_text())
    assert data["project"]["name"] == "sample"


def test_copier_is_provisioned_for_updates(generated):
    """The documented template refresh needs copier; the dev group ships it."""
    dst, _ = generated
    dev = tomllib.loads((dst / "pyproject.toml").read_text())["dependency-groups"][
        "dev"
    ]
    assert any(dep.startswith("copier") for dep in dev)


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
        "module/sample/src/main/java/module-info.java",
        "module/sample/src/main/java/com/example/sample/Example.java",
        "module/sample/src/test/java/com/example/sample/blackbox/ExampleTest.java",
        "staged/.github/workflows/test.yml",
    ]:
        assert (dst / rel).exists(), f"missing java file: {rel}"
    assert not (dst / "packages").exists()
    # every render carries the pnpm hardening; java is not a workspace
    assert "packages:" not in (dst / "pnpm-workspace.yaml").read_text()


def test_checkstyle_carries_the_family_maxima(generated):
    """The family's established values; a render flattened them once
    (semver adoption, 2026-11)."""
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()

    def props(tree, name):
        return [
            {p.get("name"): p.get("value") for p in m.iter("property")}
            for m in tree.iter("module")
            if m.get("name") == name
        ]

    main = ET.parse(dst / ".config/checkstyle/main.xml").getroot()
    test = ET.parse(dst / ".config/checkstyle/test.xml").getroot()
    # filters do not cross TreeWalker boundaries; every walker carries one
    for walker in (m for m in main.iter("module") if m.get("name") == "TreeWalker"):
        assert any(
            c.get("name") == "SuppressionCommentFilter" for c in walker.iter("module")
        ), "TreeWalker without SuppressionCommentFilter"
    assert props(main, "LambdaBodyLength") == [{"max": "20"}]
    assert props(main, "ReturnCount") == [{"max": "3"}]
    assert props(main, "JavadocTagContinuationIndentation") == [
        {"offset": "2", "violateExecutionOnNonTightHtml": "true"}
    ]
    assert props(main, "ExecutableStatementCount") == [
        {"max": "20"},
        {"max": "10", "tokens": "LAMBDA"},
    ]
    assert props(test, "ExecutableStatementCount") == [{"max": "100"}]
    assert props(test, "LambdaBodyLength") == [{"max": "20"}]


def test_spotbugs_excludes_are_scoped(generated):
    """A Match with only a Bug pattern suppresses it in every class;
    exclusions must name their scope."""
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    ns = "{https://github.com/spotbugs/filter/3.0.0}"
    root = ET.parse(dst / ".config/spotbugs/exclude.xml").getroot()
    for match in root.iter(f"{ns}Match"):
        assert [c.tag for c in match] != [f"{ns}Bug"], "global bug suppression"


def test_ts_layout(generated):
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    for rel in [
        "eslint.config.cts",
        "tsconfig.eslint.json",
        "vitest.config.ts",
        "pnpm-workspace.yaml",
        "packages/sample/package.json",
        "packages/sample/src/index.ts",
        "packages/sample/test/index.test.ts",
        "staged/.github/workflows/test.yml",
    ]:
        assert (dst / rel).exists(), f"missing ts file: {rel}"
    assert not (dst / "pom.xml").exists()
    assert not (dst / "mvnw").exists()
    # the workspace packages list is ts-only and load-bearing: pnpm -r
    # and --filter no-op without it
    assert "packages:" in (dst / "pnpm-workspace.yaml").read_text()


ESLINT_BASE_RULE_TWINS = {
    "max-params": "@typescript-eslint/max-params",
    "default-param-last": "@typescript-eslint/default-param-last",
    "no-use-before-define": "@typescript-eslint/no-use-before-define",
    "init-declarations": "@typescript-eslint/init-declarations",
    "prefer-destructuring": "@typescript-eslint/prefer-destructuring",
}


def test_eslint_disables_only_twin_base_rules(generated):
    """No rule is off anywhere in the config except the base half of a
    base/typescript-eslint twin pair; any other off disables strict rules."""
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    text = (dst / "eslint.config.cts").read_text()
    off_rules = re.findall(r'"([^"\s]+)":\s*(?:"off"|0\b)', text)
    error_rules = set(
        re.findall(r'"(@[^"\s]+)":\s*(?:"error"|2\b|\[2|\[\s*"error")', text)
    )
    unexpected = [rule for rule in off_rules if rule not in ESLINT_BASE_RULE_TWINS]
    assert not unexpected, f"rules off outside the twin idiom: {unexpected}"
    for base, twin in ESLINT_BASE_RULE_TWINS.items():
        if base in off_rules:
            assert twin in error_rules, f"twin not on: {twin}"


def test_eslint_carries_the_family_metrics(generated):
    """The family's metric thresholds, pinned like the checkstyle maxima;
    a render flattened those once."""
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    text = (dst / "eslint.config.cts").read_text()
    metrics = {
        "complexity": r'"complexity": \["error", 10\]',
        "max-classes-per-file": r'"max-classes-per-file": "error"',
        "max-depth": r'"max-depth": \["error", 3\]',
        "max-lines": r'"max-lines": "error"',
        "max-lines-per-function": r'"max-lines-per-function": \["error", \{ max: 25 \}\]',
        "max-statements": r'"max-statements": \["error", 20, \{ ignoreTopLevelFunctions: false \}\]',
    }
    for rule, pattern in metrics.items():
        assert re.search(pattern, text), f"{rule}: not on at the family value"
    ts_block = text.index("strictTypeChecked")
    for rule in metrics:
        assert text.index(rule) > ts_block, f"{rule} lives outside the typescript block"


def test_eslint_carries_the_sonarjs_parity_rules(generated):
    """NPath and BooleanExpressionComplexity exist only in sonarjs; the
    config enables the two parity rules by exception, never the plugin's
    preset, and the plugin stays a caret floor for renovate to bump."""
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    text = (dst / "eslint.config.cts").read_text()
    assert '"sonarjs/cognitive-complexity": "error"' in text
    assert re.search(
        r'"sonarjs/expression-complexity": \["error", \{ max: 3 \}\]', text
    )
    assert "sonarjs.configs" not in text
    dev_deps = json.loads((dst / "package.json").read_text())["devDependencies"]
    assert "eslint-plugin-sonarjs" in dev_deps
    assert re.fullmatch(r"\^\d+\.\d+\.\d+", dev_deps["eslint-plugin-sonarjs"])


def test_config_layout(generated):
    """The config variant renders shared files and nothing build-specific."""
    dst, answers = generated
    if answers["template_type"] != "config":
        pytest.skip()
    for rel in ("pom.xml", "mvnw", ".mvn", "module", "packages"):
        assert not (dst / rel).exists(), f"config variant leaked: {rel}"
    # every render carries the pnpm hardening; config is not a workspace
    assert "packages:" not in (dst / "pnpm-workspace.yaml").read_text()
    assert not (dst / "staged/.github/workflows/test.yml").exists()
    assert (dst / ".config/git/hooks/heal.sh").exists()


def test_no_stray_variant_files_at_root(generated):
    """Variant filenames must vanish whole, not leave extension-only strays."""
    dst, _ = generated
    for stray in (".cts", ".ts", ".license"):
        assert not (dst / stray).exists(), f"stray root file: {stray}"


def test_maven_wrapper_executable(generated):
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    st = (dst / "mvnw").stat()
    assert st.st_mode & stat.S_IXUSR


def test_skeleton_suppressed(tmp_path):
    """Adopted consumers must never receive scaffold or resurrected files."""
    for answers in (JAVA_ANSWERS, ANSWERS["typescript"]):
        dst = copy_template(
            tmp_path / answers["template_type"], {**answers, "include_skeleton": False}
        )
        assert not (dst / "module").exists(), "java skeleton leaked"
        assert not (dst / "packages").exists(), "ts skeleton leaked"
        assert not list(dst.rglob("Example.java"))
        assert not list(dst.rglob("ExampleTest.java"))
    java = copy_template(
        tmp_path / "java-x", {**JAVA_ANSWERS, "include_skeleton": False}
    )
    pom = (java / "pom.xml").read_text()
    assert "<modules>" not in pom, "parent pom references a module that does not exist"
    ts = copy_template(
        tmp_path / "ts-x", {**ANSWERS["typescript"], "include_skeleton": False}
    )
    vitest = (ts / "vitest.config.ts").read_text()
    assert "packages/" not in vitest, "vitest project rooted at a missing package"


def test_renders_carry_no_blank_line_scaffolding(generated):
    """False variant blocks must not leave blank lines behind."""
    dst, _ = generated
    for path in dst.rglob("*"):
        if not path.is_file() or "LICENSES" in path.parts:
            continue
        assert "\n\n\n" not in path.read_text(), f"blank scaffolding: {path.name}"


def test_renders_carry_baked_lineage_headers(generated):
    """The template bakes SPDX headers with lineage years; annotate extends.

    The ranges record when each file's expression first appeared in the
    holder's own history, so a render asserts the holder's copyright from
    the start. JSON files cannot carry comments: package.json and tsconfig
    stay annotation-covered, with the range in REUSE.toml's annotation.
    """
    dst, _ = generated
    lineage = {
        ".gitignore": "2008",
        ".editorconfig": "2013",
        ".gitattributes": "2013",
        ".prettierignore": "2021",
        ".prettierrc.yml": "2020",
        ".lintstagedrc.cjs": "2023",
        ".envrc": "2024",
        "git-conventional-commits.yaml": "2024",
        "pyproject.toml": "2025",
        "REUSE.toml": "2024",
        ".github/renovate.json5": "2024",
        "pnpm-workspace.yaml": "2026",
        ".copier-answers.yml": "2026",
    }
    for rel, start in lineage.items():
        text = (dst / rel).read_text()
        assert re.search(rf"Copyright © {start}(?:-\d{{4}})? Caleb Cushing", text), rel
        assert "SPDX-License-Identifier" in text, rel

    # json files carry no inline header; the annotation carries the range
    package_json = json.loads((dst / "package.json").read_text())
    assert package_json["name"] in ("sample", "@example/sample")
    assert "SPDX-FileCopyrightText" not in (dst / "package.json").read_text()
    assert "Copyright © 2013-2026 Caleb Cushing" in (dst / "REUSE.toml").read_text()

    # docs are documentation-licensed with their own lineage
    assert re.search(r"Copyright © 2015-\d{4}", (dst / "README.md").read_text())


def test_hooks_carry_the_consumer_header(generated):
    """Hooks are shell that people read; the license rides in the file."""
    dst, _ = generated
    # split the tags so reuse cannot read this source as SPDX expressions
    copyright_line = "# SPDX-FileCopyright" + "Text: Copyright © "
    license_line = "# SPDX-License" + "-Identifier: MIT"
    lineage = {
        "commit-msg": "2024",
        "heal.sh": "2026",
        "post-checkout": "2026",
        "post-merge": "2026",
        "pre-commit": "2021",
    }
    hooks = sorted((dst / ".config/git/hooks").iterdir())
    assert hooks, "no hooks rendered"
    for path in hooks:
        lines = path.read_text().splitlines()
        assert lines[0] == "#!/bin/sh", path.name
        assert license_line in lines, path.name
        start = lineage[path.name]
        assert any(line.startswith(copyright_line + start) for line in lines), (
            f"{path.name}: no {start} lineage header"
        )


def test_hooks_carry_the_author_not_the_answered_holder(tmp_path):
    """The lineage ranges are facts about the author's history; the hooks
    carry the author's name, whatever a stray answer says."""
    dst = copy_template(
        tmp_path / "holder", {**ANSWERS["config"], "copyright_holder": "Sample Owner"}
    )
    text = (dst / ".config/git/hooks/pre-commit").read_text()
    assert "Caleb Cushing" in text
    assert "Sample Owner" not in text


def test_no_license_sidecars_rendered(generated):
    """Annotate, not the template, creates .license sidecars."""
    dst, _ = generated
    assert not [p for p in dst.rglob("*.license")]


def test_answers_record_no_header_machinery(generated):
    """copyright_year and spdx_* answers no longer exist."""
    dst, _ = generated
    answers = (dst / ".copier-answers.yml").read_text()
    assert "copyright_year" not in answers
    assert "spdx_" not in answers


def test_reuse_toml_carries_no_gitmodules(generated):
    """The consumer REUSE.toml annotates exemptions, not speculative files."""
    dst, _ = generated
    assert ".gitmodules" not in (dst / "REUSE.toml").read_text()


def test_reuse_toml_annotates_python_version(generated):
    """A .python-version pin is licensed in every variant, not just java."""
    dst, _ = generated
    assert ".python-version" in (dst / "REUSE.toml").read_text()


def test_envrc_keeps_its_shebang(generated):
    """The rendered .envrc stays a shell script; shellcheck requires a shebang."""
    dst, _ = generated
    assert (dst / ".envrc").read_text().startswith("#!/bin/sh")


def test_xml_files_open_with_the_xml_declaration(generated):
    """Rendered xml keeps its declaration; annotate stamps below it."""
    dst, answers = generated
    if answers["template_type"] != "java":
        pytest.skip()
    xmls = sorted(dst.rglob("*.xml"))
    assert xmls, "expected rendered xml files"
    for path in xmls:
        rel = path.relative_to(dst)
        assert path.read_text().startswith('<?xml version="1.0" encoding="UTF-8" ?>'), (
            f"{rel} lost its xml declaration"
        )


def test_package_json_scope_is_answerable(tmp_path):
    """The root package name keeps its npm scope when the consumer has one."""
    dst = copy_template(
        tmp_path / "scoped", {**ANSWERS["config"], "npm_scope": "@xenoterracide"}
    )
    data = json.loads((dst / "package.json").read_text())
    assert data["name"] == "@xenoterracide/sample"


def test_lintstagedrc_licenses_by_file_class(generated):
    """Config files get CC0; code files get the answered license."""
    dst, _ = generated
    content = (dst / ".lintstagedrc.cjs").read_text()
    assert "const licenseCode = \"--license 'GPL-3.0-or-later'\";" in content
    assert (
        "const licenseConfiguration = \"--license 'CC0-1.0' --fallback-dot-license\";"
        in content
    )
    assert (
        '"*.ts": run([`${reuse} ${copyright} ${symbol} ${licenseCode}`, prettier])'
        in content
    )
    assert (
        '"*.java": run([`${reuse} ${copyright} ${symbol} ${licenseCode}`, prettier])'
        in content
    )


def test_lintstagedrc_never_writes_sidecars(generated):
    """Unrecognized extensions and JSON must not reach reuse annotate."""
    dst, _ = generated
    content = (dst / ".lintstagedrc.cjs").read_text()

    # reuse does not recognise .cts; annotate --fallback-dot-license would
    # write a sidecar the inline header already covers
    assert '"*.cts": run(prettier)' in content

    # JSON cannot carry headers; REUSE.toml licenses it, not a companion
    assert '"package.json": run(prettier)' in content
    assert '"!(package).json": run(prettier)' in content


def test_lintstagedrc_stamps_the_author(tmp_path):
    """The annotate stamp carries the author, matching the authoring copy."""
    dst = copy_template(
        tmp_path / "holder", {**JAVA_ANSWERS, "copyright_holder": "Sample Owner"}
    )
    content = (dst / ".lintstagedrc.cjs").read_text()
    assert "Caleb Cushing" in content
    assert "Sample Owner" not in content


def test_consumer_contribute_bootstraps_without_lockfile(generated):
    """Fresh consumers have no lockfile; precontribute must not freeze."""
    dst, _ = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    assert scripts["precontribute"] == "npm run setup:corepack"
    assert "setup:pnpm" not in scripts


def test_heal_bootstraps_corepack_shims(generated):
    """corepack enable exits ENOENT without ~/.local/bin, and its shims
    land outside the default PATH; heal must create and export both."""
    dst, _ = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    assert "mkdir -p" in scripts["setup:corepack"]
    heal = (dst / ".config/git/hooks/heal.sh").read_text()
    assert heal.index("mkdir -p") < heal.index("corepack enable --install-directory")
    assert 'PATH="$HOME/.local/bin:$PATH"' in heal


def test_gitattributes_catchall_leads(generated):
    """gitattributes lets later patterns win per attribute; the catch-all
    leading keeps the specialized eol rules effective."""
    dst, _ = generated
    lines = (dst / ".gitattributes").read_text().splitlines()
    patterns = [line for line in lines if line and not line.startswith("#")]
    assert patterns[0].startswith("* "), "catch-all does not lead"


def test_precommit_content(generated):
    dst, _ = generated
    content = (dst / "staged/.github/workflows/pre-commit.yml").read_text()
    assert "xenoterracide/github/.github/workflows/license.yml@" in content
    assert "shfmt.yml@" in content
    assert "shellcheck.yml@" in content


@pytest.mark.parametrize("variant", ["java", "typescript", "config"])
def test_reuse_lint(tmp_path, variant):
    """A bare render turns REUSE-compliant at the first commit.

    The hook annotates the sources via lint-staged — never the hooks
    themselves, whose rewrite under the executing shell corrupts them —
    then downloads exactly the texts the tree now references and stages
    LICENSES, so the license CI job, which lints without downloading,
    passes on the first push.
    """
    dst = copy_template(tmp_path, ANSWERS[variant])
    subprocess.run(["git", "init", "--quiet"], cwd=dst, check=True)
    subprocess.run(
        ["pnpm", "install", "--reporter=silent"],
        cwd=dst,
        check=True,
        capture_output=True,
        timeout=600,
    )
    subprocess.run(
        ["uv", "sync", "--quiet"],
        cwd=dst,
        check=True,
        capture_output=True,
        timeout=600,
    )
    subprocess.run(["git", "add", "-A"], cwd=dst, check=True)
    # CI= simulates a developer commit: the hook's guard skips it under a
    # real CI=true, where GitHub runs the checks instead of the hooks.
    subprocess.run(
        ["sh", ".config/git/hooks/pre-commit"],
        cwd=dst,
        check=True,
        capture_output=True,
        timeout=600,
        env={**os.environ, "CI": ""},
    )
    subprocess.run(["git", "add", "-A"], cwd=dst, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=verify",
            "-c",
            "user.email=verify@localhost",
            "commit",
            "-qm",
            "verify render",
        ],
        cwd=dst,
        check=True,
    )
    result = subprocess.run(
        ["uv", "run", "--frozen", "--group", "dev", "reuse", "lint"],
        cwd=dst,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, (
        f"reuse lint failed:\n{result.stdout}\n{result.stderr}"
    )


def test_copier_runs_no_tasks():
    """The hosted Renovate app never runs trusted tasks; _tasks block it."""
    assert "\n_tasks:" not in (TEMPLATE / "copier.yml").read_text()


def test_contribute_runs_heal_only(generated):
    """LICENSES seeding belongs to the pre-commit hook, after annotate.

    A contribute-time download cannot know the set: the code license lands
    only when lint-staged annotates source files, and a text nothing
    references fails `reuse lint` as unused.
    """
    dst, _ = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    assert scripts["contribute"] == "sh .config/git/hooks/heal.sh"


def test_renovate_copier_updates_automerge_when_checks_pass(generated):
    """A conflicted copier update leaves .rej files, which fail reuse lint.

    Green checks therefore mean the update landed cleanly, so automerge is
    safe: the reject path cannot reach a merge.
    """
    dst, _ = generated
    content = (dst / ".github/renovate.json5").read_text()
    assert re.search(r'matchManagers: \["copier"\],\s*automerge: true', content), (
        "copier manager does not automerge clean updates"
    )


def test_renovate_automerges_maven_wrapper_updates(generated):
    """Renovate runs the wrapper as its own manager, so a rule naming only
    "maven" leaves .mvn/wrapper bumps for a human. The automerge rule must
    list "maven-wrapper" too.
    """
    dst, _ = generated
    content = (dst / ".github/renovate.json5").read_text()
    assert re.search(
        r'matchManagers: \[[^\]]*"maven-wrapper"[^\]]*\],\s*'
        r'branchTopic: "[^"]*",\s*automerge: true',
        content,
    ), "maven-wrapper updates do not automerge"


def test_renovate_applies_a_three_day_release_cooldown(generated):
    """Day-zero releases carry most supply-chain risk. Registry
    takedowns of hijacked packages take hours, so a 3-day hold skips
    them outright. Renovate's security:minimumReleaseAge* presets use
    the same 3 days.

    Updates with no release timestamp cannot age — python-version and
    github-packages maven expose none — so timestamp-optional raises
    them instead of holding them forever.
    """
    dst, _ = generated
    content = (dst / ".github/renovate.json5").read_text()
    assert 'minimumReleaseAge: "3 days"' in content, "no 3-day cooldown"
    assert 'minimumReleaseAgeBehaviour: "timestamp-optional"' in content, (
        "updates without a release timestamp would wait forever"
    )
    assert re.search(
        r'matchUpdateTypes: \["lockFileMaintenance"\],\s*minimumReleaseAge: null',
        content,
    ), "lock file maintenance would never leave the dashboard"


def test_renovate_exempts_update_types_it_cannot_age(generated):
    """bump, lockfileUpdate, pin, replacement, and rollback carry no
    release timestamp, so Renovate cannot age them. The security
    presets disable the cooldown for them after the fact.
    """
    dst, _ = generated
    content = (dst / ".github/renovate.json5").read_text()
    assert re.search(
        r'matchUpdateTypes: \["bump", "lockfileUpdate", "pin", "replacement", "rollback"\],\s*'
        r"minimumReleaseAge: null",
        content,
    ), "update types Renovate cannot age inherit the cooldown"


def test_renovate_cooldown_matches_the_authoring_copy(generated):
    """The authoring config renders into nothing; only the template copy
    reaches consumers, and no test pins them together. Drift between the
    two strands consumers on old settings, so every cooldown line must
    hold in both.
    """
    dst, _ = generated
    rendered = (dst / ".github/renovate.json5").read_text()
    authoring = (TEMPLATE / ".github" / "renovate.json5").read_text()
    for label, content in (("rendered", rendered), ("authoring", authoring)):
        assert 'minimumReleaseAge: "3 days"' in content, (
            f"no 3-day cooldown in the {label} copy"
        )
        assert 'minimumReleaseAgeBehaviour: "timestamp-optional"' in content, (
            f"updates without a release timestamp would wait forever in the {label} copy"
        )
        assert 'internalChecksFilter: "strict"' in content, (
            f"young updates would land in pending branches in the {label} copy"
        )
        assert re.search(
            r'matchUpdateTypes: \["lockFileMaintenance"\],\s*minimumReleaseAge: null',
            content,
        ), f"lock file maintenance would never leave the dashboard in the {label} copy"
        assert re.search(
            r'matchUpdateTypes: \["bump", "lockfileUpdate", "pin", "replacement", "rollback"\],\s*'
            r"minimumReleaseAge: null",
            content,
        ), f"un-ageable update types inherit the cooldown in the {label} copy"


def test_pnpm_release_age_hardening_matches_the_authoring_copy(generated):
    """The rendered pnpm-workspace.yaml carries the release-age gate the
    authoring copy rides. Drift would strand consumers on pnpm's soft
    default, which installs day-0 pins and writes the bypass into a
    committable file.
    """
    dst, _ = generated
    # authoring-only build rulings never reach a render
    assert "allowBuilds" not in (dst / "pnpm-workspace.yaml").read_text()
    for label, content in (
        ("rendered", (dst / "pnpm-workspace.yaml").read_text()),
        ("authoring", (TEMPLATE / "pnpm-workspace.yaml").read_text()),
    ):
        assert "minimumReleaseAge: 1440" in content, f"no age gate in the {label} copy"
        assert "minimumReleaseAgeStrict: true" in content, (
            f"soft gate would silently bypass day-0 pins in the {label} copy"
        )
        # the key form: the comment explaining the gate names the word too
        assert "minimumReleaseAgeExclude:" not in content, (
            f"a recorded bypass disarms the gate in the {label} copy"
        )


def test_renovate_configs_pass_the_renovate_validator(generated):
    """Renovate halts every PR in a repo whose config it rejects, so the
    authoring copy and every render must pass its own validator. The
    renovate devDependency pins the validator to the lockfile — a
    floating dlx made every run non-deterministic — and Renovate bumps
    it under the repo's release cooldown.
    """
    dst, _ = generated
    copies = {
        "rendered": dst / ".github/renovate.json5",
        "authoring": TEMPLATE / ".github/renovate.json5",
    }
    for label, config in copies.items():
        result = subprocess.run(
            [
                "pnpm",
                "exec",
                "renovate-config-validator",
                "--strict",
                str(config),
            ],
            capture_output=True,
            text=True,
            timeout=600,
            cwd=TEMPLATE,
        )
        assert result.returncode == 0, (
            f"{label} config failed validation:\n{result.stdout}\n{result.stderr}"
        )


def test_renovate_manager_file_patterns_are_regex_wrapped(generated):
    """managerFilePatterns takes glob and regex; only the /.../ wrapper
    marks a pattern as regex. An unwrapped regex reads as a glob that
    matches nothing, which killed the copyright-year manager in every
    strand without any error.
    """
    dst, _ = generated
    copies = {
        "rendered": (dst / ".github/renovate.json5").read_text(),
        "authoring": (TEMPLATE / ".github/renovate.json5").read_text(),
    }
    for label, content in copies.items():
        # bound on the closing bracket-comma: a bare ] appears inside the
        # [^/] character class of the hook pattern itself; the trailing
        # comma and double quotes the parse relies on are prettier's
        # formatting of these files
        blocks = re.findall(r"managerFilePatterns:\s*\[(.*?)\],", content, re.S)
        assert blocks, f"no managerFilePatterns in the {label} copy"
        for block in blocks:
            entries = re.findall(r'"((?:[^"\\]|\\.)*)"', block)
            assert entries, f"empty managerFilePatterns in the {label} copy"
            for entry in entries:
                assert entry.startswith("/") and entry.endswith("/"), (
                    f"unwrapped pattern in the {label} copy: {entry}"
                )
