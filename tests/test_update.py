# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

"""The update contract: behavior is managed, versions are seeded."""

import re
import shutil
import subprocess

import copier
import pytest
import yaml
from conftest import JAVA_ANSWERS, TEMPLATE

MVNW_JINJA = "{% if template_type == 'java' %}mvnw{% endif %}.jinja"
IGNORE = shutil.ignore_patterns(
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".superpowers",
    ".worktree",
    "uv.lock",
    "pnpm-lock.yaml",
)


def git(*args, cwd):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def template_repo(tmp_path):
    """This template as a git repo, safe to mutate per test."""
    tpl = tmp_path / "template"
    shutil.copytree(TEMPLATE, tpl, ignore=IGNORE)
    git("init", "-q", cwd=tpl)
    git("add", "-A", cwd=tpl)
    git("commit", "-qm", "template", cwd=tpl)
    return tpl


def render(tpl, dst, answers=JAVA_ANSWERS):
    copier.run_copy(
        src_path=str(tpl),
        dst_path=str(dst),
        data=answers,
        defaults=True,
        unsafe=True,
        quiet=True,
        skip_tasks=True,
    )
    git("init", "-q", cwd=dst)
    git("add", "-A", cwd=dst)
    git("commit", "-qm", "render", cwd=dst)
    return dst


def test_copier_skips_consumer_version_files():
    """copier update must never rewrite a consumer-owned version file."""
    data = yaml.safe_load((TEMPLATE / "copier.yml").read_text())
    assert set(data["_skip_if_exists"]) == {
        ".tool-versions",
        "mvnw",
        "mvnw.cmd",
        ".mvn/wrapper/maven-wrapper.properties",
    }


def test_update_leaves_consumer_versions_alone(template_repo, tmp_path):
    """Consumer bumps survive an update; template version bumps do not land."""
    proj = render(template_repo, tmp_path / "proj")
    tv = proj / ".tool-versions"
    tv.write_text(re.sub(r"nodejs \S+", "nodejs 99.0.0", tv.read_text()))
    mvnw = proj / "mvnw"
    mvnw.write_text(mvnw.read_text() + "\n# consumer edit\n")
    git("add", "-A", cwd=proj)
    git("commit", "-qm", "consumer bumps", cwd=proj)

    for rel, extra in (
        (".tool-versions.jinja", "extra-tool 9.9.9\n"),
        (MVNW_JINJA, "# template edit\n"),
    ):
        source = template_repo / rel
        source.write_text(source.read_text() + extra)
    git("add", "-A", cwd=template_repo)
    git("commit", "-qm", "template bumps", cwd=template_repo)

    copier.run_update(
        dst_path=str(proj),
        defaults=True,
        unsafe=True,
        quiet=True,
        skip_tasks=True,
        overwrite=True,
    )

    assert "nodejs 99.0.0" in tv.read_text()
    assert "extra-tool" not in tv.read_text()
    assert "# consumer edit" in mvnw.read_text()
    assert "# template edit" not in mvnw.read_text()


def test_fresh_copy_seeds_current_authoring_pins(template_repo, tmp_path):
    """Renovate bumps the authoring .tool-versions; fresh copies follow."""
    authoring = template_repo / ".tool-versions"
    authoring.write_text(re.sub(r"nodejs \S+", "nodejs 99.0.0", authoring.read_text()))
    proj = render(template_repo, tmp_path / "proj")
    assert "nodejs 99.0.0" in (proj / ".tool-versions").read_text()


def test_update_seeds_new_readme_answers_without_prompting(template_repo, tmp_path):
    """Hosted updates accept new answers from defaults, then keep them."""
    new_keys = ("project_purpose", "project_usage", "project_kind", "docs_license", "docs_license_url")
    old_settings = yaml.safe_load((template_repo / "copier.yml").read_text())
    for key in new_keys:
        old_settings.pop(key, None)
    (template_repo / "copier.yml").write_text(yaml.safe_dump(old_settings, sort_keys=False))
    (template_repo / "README.md.jinja").write_text(
        "<!--\nSPDX-License" + "-Identifier: CC0-1.0\n-->\n\n# {{ project_title }}\n"
    )
    git("add", "-A", cwd=template_repo)
    git("commit", "-qm", "template before README answers", cwd=template_repo)

    old_answers = {key: value for key, value in JAVA_ANSWERS.items() if key not in new_keys}
    proj = render(template_repo, tmp_path / "proj", old_answers)
    answers_file = proj / ".copier-answers.yml"
    assert "project_usage:" not in answers_file.read_text()

    for name in ("copier.yml", "README.md.jinja"):
        shutil.copy2(TEMPLATE / name, template_repo / name)
    git("add", "-A", cwd=template_repo)
    git("commit", "-qm", "template with README answers", cwd=template_repo)

    copier.run_update(
        dst_path=str(proj),
        defaults=True,
        unsafe=True,
        quiet=True,
        skip_tasks=True,
        skip_answered=True,
        overwrite=True,
    )

    text = answers_file.read_text()
    assert "project_purpose:" in text
    assert "project_usage: Add the library to your build, then call its public API." in text
    assert "project_kind: library" in text
    readme = (proj / "README.md").read_text()
    assert "Add the library to your build, then call its public API." in readme
    assert "above" not in readme
    assert "below" not in readme


def test_render_excludes_editor_junk(template_repo, tmp_path):
    """Restated copier defaults keep editor junk out of renders."""
    (template_repo / ".DS_Store").write_text("junk")
    (template_repo / "~draft.md").write_text("junk")
    git("add", "-A", cwd=template_repo)
    git("commit", "-qm", "junk lands in checkout", cwd=template_repo)
    proj = render(template_repo, tmp_path / "proj")
    assert not (proj / ".DS_Store").exists()
    assert not (proj / "~draft.md").exists()


def test_update_recreates_deleted_seeds(template_repo, tmp_path):
    """Deleted seeds come back; only skip-listed files do."""
    proj = render(template_repo, tmp_path / "proj")
    seeds = (
        ".tool-versions",
        "mvnw",
        "mvnw.cmd",
        ".mvn/wrapper/maven-wrapper.properties",
    )
    for rel in seeds:
        (proj / rel).unlink()
    git("add", "-A", cwd=proj)
    git("commit", "-qm", "consumer deletes seeds", cwd=proj)

    copier.run_update(
        dst_path=str(proj),
        defaults=True,
        unsafe=True,
        quiet=True,
        skip_tasks=True,
        overwrite=True,
    )

    for rel in seeds:
        assert (proj / rel).exists(), f"deleted seed not recreated: {rel}"
