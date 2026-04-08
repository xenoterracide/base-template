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

  it("should return error when no secrets specified", async () => {
    const cmd = new SyncCommand();
    cmd.secrets = ""; // Empty secrets
    cmd.to = "owner/target";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should return error when no target repos", async () => {
    const cmd = new SyncCommand();
    cmd.secrets = "API_KEY";
    cmd.to = ""; // Empty targets
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should return error when secrets specified but no values provided", async () => {
    const cmd = new SyncCommand();
    cmd.secrets = "API_KEY,SECRET";
    cmd.to = "owner/target";
    cmd.dryRun = true;
    // No env values set

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should sync secrets from environment variables", async () => {
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
    cmd.to = "owner/target";
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should sync secrets from env file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=from-env\nSECRET=also-from-env\n", "utf8");

    const runner = createFakeRunner(
      new Map([
        ["gh secret set API_KEY --repo owner/target --body from-env", ""],
        ["gh secret set SECRET --repo owner/target --body also-from-env", ""],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.secrets = "API_KEY,SECRET";
    cmd.to = "owner/target";
    cmd.fromEnvFile = envPath;
    cmd.dryRun = false;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });
});
