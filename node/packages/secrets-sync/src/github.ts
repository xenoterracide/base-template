// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CommandRunner, SetSecretOptions } from "./types.js";
import { setSecurePermissions } from "./fs-utils.js";
import { logger } from "./logger.js";

function createDefaultCommandRunner(): CommandRunner {
  return {
    runArgv(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string {
      return execFileSync(cmd, args, {
        encoding: "utf8",
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env },
      }).trim();
    },
  };
}

const defaultRunner = createDefaultCommandRunner();

export function listSecretNames(repo: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", ["secret", "list", "--repo", repo, "--json", "name"]);
    const parsed = JSON.parse(output) as { name: string }[];
    return parsed.map((s) => s.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list secrets for ${repo}: ${msg}`);
  }
}

export function setSecret(opts: SetSecretOptions): void {
  const { repo, name, value, runner = defaultRunner } = opts;
  const tmpFile = join(tmpdir(), `secret-${name}-${String(Date.now())}.txt`);
  try {
    writeFileSync(tmpFile, value, "utf8");
    setSecurePermissions(tmpFile);
    runner.runArgv("gh", ["secret", "set", name, "--repo", repo, "--body-file", tmpFile]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set secret "${name}" on ${repo}: ${msg}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch (e) {
      logger.debug(`Could not clean up temp file ${tmpFile}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export function findReposByLabel(owner: string, label: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", [
      "repo",
      "list",
      owner,
      "--topic",
      label,
      "--no-archived",
      "--limit",
      "1000",
      "--json",
      "nameWithOwner",
    ]);
    const parsed = JSON.parse(output) as { nameWithOwner: string }[];
    return parsed.map((r) => r.nameWithOwner);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list repos for owner "${owner}" with label "${label}": ${msg}`);
  }
}

export function getCurrentUser(runner: CommandRunner = defaultRunner): string {
  try {
    const output = runner.runArgv("gh", ["api", "user", "--jq", ".login"]);
    return output.trim();
  } catch {
    throw new Error("Failed to get current user. Make sure you're authenticated with 'gh auth login'");
  }
}
