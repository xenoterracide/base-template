// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CommandRunner } from "./secrets-sync";
import { parseEnvFile, resolveSecretValue, EnvEntry } from "./secrets-sync";

// Mock the fs module
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  chmodSync: vi.fn(),
}));

import { existsSync, readFileSync, statSync } from "fs";

describe("CommandRunner", () => {
  it("should execute commands with args array", () => {
    const mockRunner: CommandRunner = {
      runArgv: vi.fn().mockReturnValue('[{"name": "TEST_SECRET"}]'),
    };

    const result = mockRunner.runArgv("gh", ["secret", "list", "--repo", "test/repo"]);
    expect(mockRunner.runArgv).toHaveBeenCalledWith("gh", ["secret", "list", "--repo", "test/repo"]);
    expect(JSON.parse(result)).toEqual([{ name: "TEST_SECRET" }]);
  });
});

describe("parseEnvFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse plain values", () => {
    const mockContent = "DEBUG_MODE=true\nAPI_KEY=test123";
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(mockContent);

    const result = parseEnvFile(".env");

    expect(result).toEqual({
      DEBUG_MODE: { type: "value", value: "true" },
      API_KEY: { type: "value", value: "test123" },
    });
  });

  it("should parse env:// references", () => {
    const mockContent = "API_KEY=env://PROD_API_KEY";
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(mockContent);

    const result = parseEnvFile(".env");

    expect(result).toEqual({
      API_KEY: { type: "env", value: "PROD_API_KEY" },
    });
  });

  it("should parse file:// references", () => {
    const mockContent = "GPG_KEY=file://./keys/key.asc";
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(mockContent);

    const result = parseEnvFile(".env");

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toContain("keys/key.asc");
  });

  it("should skip empty lines and comments", () => {
    const mockContent = "# This is a comment\n\nAPI_KEY=test123\n  \n";
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(mockContent);

    const result = parseEnvFile(".env");

    expect(result).toEqual({
      API_KEY: { type: "value", value: "test123" },
    });
  });

  it("should throw if file not found", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => parseEnvFile(".env")).toThrow("Env file not found");
  });
});

describe("resolveSecretValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_ENV_VAR;
    delete process.env.EXISTING_VAR;
  });

  it("should return explicit value if provided", () => {
    const result = resolveSecretValue("API_KEY", undefined, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should resolve from env file entry with plain value", () => {
    const envFileEntries: Record<string, EnvEntry> = {
      API_KEY: { type: "value", value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");
  });

  it("should resolve from env file entry with env:// reference", () => {
    process.env.EXISTING_VAR = "env-var-value";
    const envFileEntries: Record<string, EnvEntry> = {
      API_KEY: { type: "env", value: "EXISTING_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("env-var-value");
  });

  it("should return undefined for missing env var in env:// reference", () => {
    const envFileEntries: Record<string, EnvEntry> = {
      API_KEY: { type: "env", value: "NONEXISTENT_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });

  it("should resolve from env file entry with file:// reference", () => {
    const envFileEntries: Record<string, EnvEntry> = {
      GPG_KEY: { type: "file", value: "/path/to/key.asc" },
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ mode: 0o100400 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue("file-contents");

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBe("file-contents");
  });

  it("should return undefined for missing file in file:// reference", () => {
    const envFileEntries: Record<string, EnvEntry> = {
      GPG_KEY: { type: "file", value: "/path/to/missing.asc" },
    };
    vi.mocked(existsSync).mockReturnValue(false);

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });

  it("should resolve from environment variable matching secret name", () => {
    process.env.MY_SECRET = "env-value";

    const result = resolveSecretValue("MY_SECRET");
    expect(result).toBe("env-value");

    delete process.env.MY_SECRET;
  });

  it("should return undefined if no value found", () => {
    const result = resolveSecretValue("NONEXISTENT_SECRET");
    expect(result).toBeUndefined();
  });

  it("should prefer explicit value over env file entry", () => {
    const envFileEntries: Record<string, EnvEntry> = {
      API_KEY: { type: "value", value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should prefer env file entry over environment variable", () => {
    process.env.API_KEY = "from-env-var";
    const envFileEntries: Record<string, EnvEntry> = {
      API_KEY: { type: "value", value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");

    delete process.env.API_KEY;
  });
});
