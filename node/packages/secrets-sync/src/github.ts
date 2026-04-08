// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type { CommandRunner, SetSecretOptions } from "./types.js";
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
  // Use mkdtemp for collision-resistant temp directory with secure permissions
  const tmpDir = mkdtempSync(join(tmpdir(), `secret-${name}-`));
  const tmpFile = join(tmpDir, "secret.txt");

  try {
    // Create file with mode 0600 from the start
    writeFileSync(tmpFile, value, { encoding: "utf8", mode: 0o600 });
    runner.runArgv("gh", ["secret", "set", name, "--repo", repo, "--body-file", tmpFile]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set secret "${name}" on ${repo}: ${msg}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch (e) {
      logger.debug({ tmpFile, error: e instanceof Error ? e.message : String(e) }, "Could not clean up temp file");
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

export function getCurrentRepo(runner: CommandRunner = defaultRunner): string {
  try {
    const output = runner.runArgv("gh", ["repo", "view", "--json", "nameWithOwner"]);
    const parsed = JSON.parse(output) as { nameWithOwner: string };
    return parsed.nameWithOwner;
  } catch {
    throw new Error("Failed to detect current repo. Run from within a git repo or specify --to");
  }
}
