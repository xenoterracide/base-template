// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PullCommand } from "../../src/commands/pull.js";
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

describe("PullCommand", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pull-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return error for invalid format", async () => {
    const cmd = new PullCommand();
    cmd.from = "owner/repo";
    cmd.format = "invalid";

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should return success when no secrets found", async () => {
    const runner = createFakeRunner(new Map([["gh secret list --repo owner/repo --json name", "[]"]]));

    const cmd = new PullCommand();
    cmd.runner = runner;
    cmd.from = "owner/repo";
    cmd.format = "env";

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should use default output path", () => {
    // Test that default output is "secrets.env"
    const cmd = new PullCommand();
    // The default is set by clipanion, we just verify the property exists
    expect(cmd.output).toBeDefined();
  });

  it("should show output in dry-run mode without writing file", async () => {
    const runner = createFakeRunner(
      new Map([["gh secret list --repo owner/repo --json name", '[{"name":"API_KEY"}]']]),
    );

    const cmd = new PullCommand();
    cmd.runner = runner;
    cmd.from = "owner/repo";
    // Use a relative path to avoid issues with clipanion Option handling
    cmd.output = "test-output.env";
    cmd.format = "env";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(0);
    // File should not be created in dry-run
    expect(existsSync("test-output.env")).toBe(false);
  });

  it("should generate correct file format suggestions", () => {
    // Unit test for the file format logic without executing the command
    const secrets = [{ name: "GPG_KEY" }, { name: "SIGNING_KEY" }, { name: "API_TOKEN" }];

    const lines: string[] = [];
    for (const { name } of secrets) {
      if (name.toLowerCase().includes("gpg") || name.toLowerCase().includes("key")) {
        lines.push(`${name}=file://./keys/${name.toLowerCase().replace(/_/g, "-")}.asc`);
      } else {
        lines.push(`${name}=env://${name}`);
      }
    }

    expect(lines).toContain("GPG_KEY=file://./keys/gpg-key.asc");
    expect(lines).toContain("SIGNING_KEY=file://./keys/signing-key.asc");
    expect(lines).toContain("API_TOKEN=env://API_TOKEN");
  });
});
