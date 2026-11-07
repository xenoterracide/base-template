# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

"""Render the template once per variant per session; tests read the output."""

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

CONFIG_ANSWERS = {
    **COMMON,
    "template_type": "config",
}

ANSWERS = {
    "java": JAVA_ANSWERS,
    "typescript": TS_ANSWERS,
    "config": CONFIG_ANSWERS,
}


def copy_template(dst: Path, answers: dict) -> Path:
    generated = dst / "generated"
    copier.run_copy(
        src_path=str(TEMPLATE),
        dst_path=str(generated),
        data=answers,
        # Without an explicit ref copier renders the latest git tag, which
        # hides branch changes locally while CI (no tags) renders the tree.
        vcs_ref="HEAD",
        defaults=True,
        overwrite=True,
        unsafe=True,
        quiet=True,
    )
    return generated
