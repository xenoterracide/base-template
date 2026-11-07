# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

"""Structure and compliance assertions over rendered variants."""

import json
import re
import stat
import subprocess
import tomllib

import pytest

from conftest import ANSWERS, JAVA_ANSWERS, TEMPLATE, copy_template

SHARED_FILES = [
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.cjs",
    "package.json",
    "pyproject.toml",
    "REUSE.toml",
    ".envrc",
    ".tool-versions",
    ".lintstagedrc.cjs",
    "git-conventional-commits.yaml",
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
    "staged/.github/workflows/opencode.yml",
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


def test_no_jinja_leak(generated):
    dst, _ = generated
    assert not [p for p in dst.rglob("*") if p.suffix == ".jinja"]


def test_no_copier_yml_leak(generated):
    dst, _ = generated
    assert not (dst / "copier.yml").exists()


def test_shared_files_present(generated):
    dst, _ = generated
    for rel in SHARED_FILES:
        assert (dst / rel).exists(), f"missing shared file: {rel}"


def test_old_hooks_absent(generated):
    dst, _ = generated
    assert not (dst / "git").exists()
    for name in ("sync-tooling", "check-yarn-env"):
        assert not (dst / ".config/git/hooks" / name).exists()


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
    assert data["packageManager"] == "pnpm@12.16.1"


def _strip_jinja(text: str) -> str:
    text = re.sub(r"\{%[^%]*%\}", "", text)
    return re.sub(r"\{\{[^{}]*\}\}", "x", text)


def test_package_json_defines_the_shared_tool_set():
    """The authoring package.json names the shared tools; ranges are floors."""
    authoring = json.loads((TEMPLATE / "package.json").read_text())
    rendered = json.loads(_strip_jinja((TEMPLATE / "package.json.jinja").read_text()))
    assert set(authoring["devDependencies"]) <= set(rendered["devDependencies"])


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
    assert not (dst / "pnpm-workspace.yaml").exists()


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


def test_config_layout(generated):
    """The config variant renders shared files and nothing build-specific."""
    dst, answers = generated
    if answers["template_type"] != "config":
        pytest.skip()
    for rel in ("pom.xml", "mvnw", ".mvn", "module", "packages", "pnpm-workspace.yaml"):
        assert not (dst / rel).exists(), f"config variant leaked: {rel}"
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
        dst = copy_template(tmp_path / answers["template_type"], {**answers, "include_skeleton": False})
        assert not (dst / "module").exists(), "java skeleton leaked"
        assert not (dst / "packages").exists(), "ts skeleton leaked"
        assert not list(dst.rglob("Example.java"))
        assert not list(dst.rglob("ExampleTest.java"))
    java = copy_template(tmp_path / "java-x", {**JAVA_ANSWERS, "include_skeleton": False})
    pom = (java / "pom.xml").read_text()
    assert "<modules>" not in pom, "parent pom references a module that does not exist"
    ts = copy_template(tmp_path / "ts-x", {**ANSWERS["typescript"], "include_skeleton": False})
    vitest = (ts / "vitest.config.ts").read_text()
    assert "packages/" not in vitest, "vitest project rooted at a missing package"


def test_renders_carry_no_blank_line_scaffolding(generated):
    """False variant blocks must not leave blank lines behind."""
    dst, _ = generated
    for path in dst.rglob("*"):
        if not path.is_file() or "LICENSES" in path.parts:
            continue
        assert "\n\n\n" not in path.read_text(), f"blank scaffolding: {path.name}"


def test_renders_carry_no_baked_headers(generated):
    """reuse annotate, not the template, writes SPDX headers."""
    dst, _ = generated
    for path in dst.rglob("*"):
        if not path.is_file() or path.name == "REUSE.toml":
            continue
        text = path.read_text()
        assert "SPDX-FileCopyrightText" not in text, path.name
        assert "SPDX-License-Identifier" not in text, path.name
    assert "# SPDX-License-Identifier" not in (dst / "REUSE.toml").read_text()


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
        assert path.read_text().startswith(
            '<?xml version="1.0" encoding="UTF-8" ?>'
        ), f"{rel} lost its xml declaration"


def test_package_json_scope_is_answerable(tmp_path):
    """The root package name keeps its npm scope when the consumer has one."""
    dst = copy_template(tmp_path / "scoped", {**ANSWERS["config"], "npm_scope": "@xenoterracide"})
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


def test_lintstagedrc_uses_the_answered_holder(tmp_path):
    """A consumer's files must carry the consumer's copyright, not the author's."""
    dst = copy_template(tmp_path / "holder", {**JAVA_ANSWERS, "copyright_holder": "Sample Owner"})
    content = (dst / ".lintstagedrc.cjs").read_text()
    assert "Sample Owner" in content
    assert "Caleb Cushing" not in content


def test_consumer_contribute_bootstraps_without_lockfile(generated):
    """Fresh consumers have no lockfile; precontribute must not freeze."""
    dst, _ = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    assert scripts["precontribute"] == "pnpm setup:corepack"
    assert "setup:pnpm" not in scripts


def test_opencode_workflow_absent_when_disabled(tmp_path):
    dst = copy_template(tmp_path / "nooc", {**JAVA_ANSWERS, "use_opencode": False})
    assert not (dst / "staged/.github/workflows/opencode.yml").exists()


def test_precommit_content(generated):
    dst, _ = generated
    content = (dst / "staged/.github/workflows/pre-commit.yml").read_text()
    assert "xenoterracide/github/.github/workflows/license.yml@" in content
    assert "shfmt.yml@" in content
    assert "shellcheck.yml@" in content


@pytest.mark.parametrize("variant", ["java", "typescript", "config"])
def test_reuse_lint(tmp_path, variant):
    """A bare render turns REUSE-compliant once lint-staged annotates it."""
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
    subprocess.run(
        ["pnpm", "exec", "lint-staged"],
        cwd=dst,
        check=True,
        capture_output=True,
        timeout=600,
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
        ["pnpm", "lint:reuse"],
        cwd=dst,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, f"reuse lint failed:\n{result.stdout}\n{result.stderr}"


def test_copier_runs_no_tasks():
    """The hosted Renovate app never runs trusted tasks; _tasks block it."""
    assert "\n_tasks:" not in (TEMPLATE / "copier.yml").read_text()


def test_contribute_downloads_the_license_texts(generated):
    """A fresh consumer's contribute populates LICENSES, replacing the task.

    Only inside a git work tree: without one reuse scans `node_modules` and
    seeds licenses the project never uses, which then fails `reuse lint`.
    """
    dst, _ = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    assert scripts["contribute"] == (
        "if git rev-parse --is-inside-work-tree >/dev/null 2>&1; "
        "then uvx reuse@6.2.0 download --all; fi && sh .config/git/hooks/heal.sh"
    )


def test_renovate_copier_updates_automerge_when_checks_pass(generated):
    """A conflicted copier update leaves .rej files, which fail reuse lint.

    Green checks therefore mean the update landed cleanly, so automerge is
    safe: the reject path cannot reach a merge.
    """
    dst, _ = generated
    content = (dst / ".github/renovate.json5").read_text()
    assert re.search(
        r'matchManagers: \["copier"\],\s*automerge: true', content
    ), "copier manager does not automerge clean updates"
