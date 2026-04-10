// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { CommandRunner } from "./types.js";

export function findMainRepoRoot(cwd: string = process.cwd()): string {
  let currentDir = cwd;
  while (true) {
    const gitDir = join(currentDir, ".git");
    if (existsSync(gitDir)) {
      const parentDir = join(currentDir, "..");
      const parentGitmodules = join(parentDir, ".gitmodules");
      if (existsSync(parentGitmodules)) {
        currentDir = parentDir;
      } else {
        return currentDir;
      }
    } else {
      const parentDir = join(currentDir, "..");
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
  }
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8", cwd }).trim();
}

export function getBranch(runner: CommandRunner): string {
  return runner.run("git branch --show-current");
}

export function hasPR(branch: string | undefined, runner: CommandRunner): boolean {
  try {
    const args = ["pr", "view", "--json", "number"];
    if (branch) {
      args.push(branch);
    }
    runner.runArgv("gh", args);
    return true;
  } catch {
    return false;
  }
}

export function getHead(runner: CommandRunner): string {
  return runner.run("git rev-parse --verify HEAD");
}
