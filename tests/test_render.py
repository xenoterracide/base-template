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


def test_heal_is_executable(generated):
    dst, _ = generated
    st = (dst / ".config/git/hooks/heal.sh").stat()
    assert st.st_mode & stat.S_IXUSR


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


def test_package_json_ranges_match_authoring():
    """Renovate bumps the authoring package.json; the template must follow."""
    authoring = json.loads((TEMPLATE / "package.json").read_text())
    rendered = json.loads(_strip_jinja((TEMPLATE / "package.json.jinja").read_text()))
    for dep, spec in authoring["devDependencies"].items():
        assert rendered["devDependencies"].get(dep) == spec, f"range drift: {dep}"


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


def test_reuse_lint(generated):
    """Generated projects must pass reuse lint offline (after license fetch)."""
    dst, _ = generated
    subprocess.run(
        ["uvx", "reuse@6.2.0", "download", "--all"],
        cwd=dst,
        check=True,
        capture_output=True,
        timeout=120,
    )
    result = subprocess.run(
        ["uvx", "reuse@6.2.0", "lint"],
        cwd=dst,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, f"reuse lint failed:\n{result.stdout}\n{result.stderr}"
