// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseEnvFile, resolveSecretValue, UpdateCommand } from "./secrets-sync";

describe("parseEnvFile", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should parse plain values", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "DEBUG_MODE=true\nAPI_KEY=test123\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      DEBUG_MODE: { type: "value", value: "true" },
      API_KEY: { type: "value", value: "test123" },
    });
  });

  it("should parse env:// references", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=env://PROD_API_KEY\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      API_KEY: { type: "env", value: "PROD_API_KEY" },
    });
  });

  it("should parse file:// references", () => {
    const envPath = join(tmpDir, ".env");
    const keyPath = join(tmpDir, "key.asc");
    writeFileSync(keyPath, "gpg-key-content", "utf8");
    writeFileSync(envPath, `GPG_KEY=file://${keyPath}\n`, "utf8");

    const result = parseEnvFile(envPath);

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toBe(keyPath);
  });

  it("should resolve relative file:// paths", () => {
    const envPath = join(tmpDir, ".env");
    const keysDir = join(tmpDir, "keys");
    mkdirSync(keysDir);
    const keyPath = join(keysDir, "signing.asc");
    writeFileSync(keyPath, "key-content", "utf8");
    writeFileSync(envPath, "GPG_KEY=file://./keys/signing.asc\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result.GPG_KEY.value).toBe(keyPath);
  });

  it("should skip empty lines and comments", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "# This is a comment\n\nAPI_KEY=test123\n  \n# Another comment\nSECRET=val\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      API_KEY: { type: "value", value: "test123" },
      SECRET: { type: "value", value: "val" },
    });
  });

  it("should throw if file not found", () => {
    const missingPath = join(tmpDir, "missing.env");

    expect(() => parseEnvFile(missingPath)).toThrow("Env file not found");
  });
});

describe("resolveSecretValue", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
    delete process.env.TEST_ENV_VAR;
    delete process.env.EXISTING_VAR;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_ENV_VAR;
    delete process.env.EXISTING_VAR;
  });

  it("should return explicit value if provided", () => {
    const result = resolveSecretValue("API_KEY", undefined, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should resolve from env file entry with plain value", () => {
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");
  });

  it("should resolve from env file entry with env:// reference", () => {
    process.env.EXISTING_VAR = "env-var-value";
    const envFileEntries = {
      API_KEY: { type: "env" as const, value: "EXISTING_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("env-var-value");
  });

  it("should return undefined for missing env var in env:// reference", () => {
    const envFileEntries = {
      API_KEY: { type: "env" as const, value: "NONEXISTENT_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });

  it("should resolve from env file entry with file:// reference", () => {
    const keyPath = join(tmpDir, "key.asc");
    writeFileSync(keyPath, "file-contents", "utf8");
    const envFileEntries = {
      GPG_KEY: { type: "file" as const, value: keyPath },
    };

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBe("file-contents");
  });

  it("should return undefined for missing file in file:// reference", () => {
    const envFileEntries = {
      GPG_KEY: { type: "file" as const, value: "/path/to/missing.asc" },
    };

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
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should prefer env file entry over environment variable", () => {
    process.env.API_KEY = "from-env-var";
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");

    delete process.env.API_KEY;
  });
});

describe("UpdateCommand", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should add new key to file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "EXISTING_KEY=old-value\n", "utf8");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "NEW_KEY";
    cmd.value = "new-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("NEW_KEY=new-value");
    expect(content).toContain("EXISTING_KEY=old-value");
  });

  it("should update existing key in file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=old-value\nSECRET=unchanged\n", "utf8");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "API_KEY";
    cmd.value = "updated-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("API_KEY=updated-value");
    expect(content).toContain("SECRET=unchanged");
  });

  it("should create file if it does not exist", async () => {
    const envPath = join(tmpDir, "new-secrets.env");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "API_KEY";
    cmd.value = "new-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("API_KEY=new-value");
  });
});
