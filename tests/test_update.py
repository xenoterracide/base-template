# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

"""The update contract: behavior is managed, versions are seeded."""

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


def render(tpl, dst):
    copier.run_copy(
        src_path=str(tpl),
        dst_path=str(dst),
        data=JAVA_ANSWERS,
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
    tv.write_text(tv.read_text().replace("nodejs 26.13.0", "nodejs 99.0.0"))
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
    authoring.write_text(
        authoring.read_text().replace("nodejs 26.13.0", "nodejs 99.0.0")
    )
    proj = render(template_repo, tmp_path / "proj")
    assert "nodejs 99.0.0" in (proj / ".tool-versions").read_text()
