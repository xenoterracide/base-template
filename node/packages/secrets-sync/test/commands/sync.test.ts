// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SyncCommand } from "../../src/commands/sync.js";
import type { CommandRunner } from "../../src/types.js";

function createFakeRunner(responses: Map<string, string>): CommandRunner {
  return {
    runArgv: (cmd: string, args: string[]): string => {
      const key = `${cmd} ${args.join(" ")}`;
      const response = responses.get(key);
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      return response;
    },
  };
}

describe("SyncCommand", () => {
  let tmpDir = "";
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sync-test-"));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it("should return error when neither --secrets nor --env-file provided", async () => {
    const cmd = new SyncCommand();
    // Missing both secrets and env-file
    cmd.repo = "owner/target";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should return error when both --to and --label provided", async () => {
    const cmd = new SyncCommand();
    cmd.secrets = "API_KEY";
    cmd.repo = "owner/target";
    cmd.label = "production";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should sync secrets from environment variables to specific repo", async () => {
    process.env.API_KEY = "test-api-key";
    process.env.SECRET = "test-secret";

    const runner = createFakeRunner(
      new Map([
        ["gh secret set API_KEY --repo owner/target --body test-api-key", ""],
        ["gh secret set SECRET --repo owner/target --body test-secret", ""],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.secrets = "API_KEY,SECRET";
    cmd.repo = "owner/target";
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should sync all secrets from env file to specific repo", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=val:from-env\nSECRET=val:also-from-env\n", "utf8");

    const runner = createFakeRunner(
      new Map([
        ["gh secret set API_KEY --repo owner/target --body from-env", ""],
        ["gh secret set SECRET --repo owner/target --body also-from-env", ""],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    // No cmd.secrets - should sync all from env file
    cmd.envFile = envPath;
    cmd.repo = "owner/target";
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should auto-detect current repo when --to not specified", async () => {
    process.env.MY_SECRET = "secret-value";

    const runner = createFakeRunner(
      new Map([
        ["gh repo view --json nameWithOwner", '{"nameWithOwner":"current/repo"}'],
        ["gh secret set MY_SECRET --repo current/repo --body secret-value", ""],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.secrets = "MY_SECRET";
    // No cmd.repo specified - should auto-detect
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should sync to repos with label", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "TOKEN=val:abc123\n", "utf8");

    const runner = createFakeRunner(
      new Map([
        ["gh api user --jq .login", "myuser"],
        [
          "gh repo list myuser --topic auto-updated --no-archived --limit 1000 --json nameWithOwner",
          '[{"nameWithOwner":"myuser/repo1"},{"nameWithOwner":"myuser/repo2"}]',
        ],
        ["gh secret set TOKEN --repo myuser/repo1 --body abc123", ""],
        ["gh secret set TOKEN --repo myuser/repo2 --body abc123", ""],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.envFile = envPath;
    cmd.label = "auto-updated";
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });
});
