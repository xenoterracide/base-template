// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { listSecretNames, setSecret, findReposByLabel, getCurrentUser, getCurrentRepo } from "../src/github.js";
import type { CommandRunner } from "../src/types.js";

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

describe("listSecretNames", () => {
  it("should parse secret list from gh output", () => {
    const runner = createFakeRunner(
      new Map([["gh secret list --repo owner/repo --json name", '[{"name":"API_KEY"},{"name":"SECRET_TOKEN"}]']]),
    );

    const result = listSecretNames("owner/repo", runner);

    expect(result).toEqual(["API_KEY", "SECRET_TOKEN"]);
  });

  it("should return empty array when no secrets", () => {
    const runner = createFakeRunner(new Map([["gh secret list --repo owner/repo --json name", "[]"]]));

    const result = listSecretNames("owner/repo", runner);

    expect(result).toEqual([]);
  });

  it("should throw on error", () => {
    const runner = createFakeRunner(new Map());

    expect(() => listSecretNames("owner/repo", runner)).toThrow("Unexpected command");
  });
});

describe("findReposByLabel", () => {
  it("should parse repo list from gh output", () => {
    const runner = createFakeRunner(
      new Map([
        [
          "gh repo list myorg --topic production --no-archived --limit 1000 --json nameWithOwner",
          '[{"nameWithOwner":"myorg/repo1"},{"nameWithOwner":"myorg/repo2"}]',
        ],
      ]),
    );

    const result = findReposByLabel("myorg", "production", runner);

    expect(result).toEqual(["myorg/repo1", "myorg/repo2"]);
  });

  it("should return empty array when no repos", () => {
    const runner = createFakeRunner(
      new Map([["gh repo list myorg --topic empty --no-archived --limit 1000 --json nameWithOwner", "[]"]]),
    );

    const result = findReposByLabel("myorg", "empty", runner);

    expect(result).toEqual([]);
  });
});

describe("getCurrentUser", () => {
  it("should return trimmed login from gh api", () => {
    const runner = createFakeRunner(new Map([["gh api user --jq .login", "myuser"]]));

    const result = getCurrentUser(runner);

    expect(result).toBe("myuser");
  });

  it("should throw on authentication error", () => {
    const runner = createFakeRunner(new Map());

    expect(() => getCurrentUser(runner)).toThrow("Failed to get current user");
  });
});

describe("getCurrentUser", () => {
  it("should return trimmed login from gh api", () => {
    const runner = createFakeRunner(new Map([["gh api user --jq .login", "myuser"]]));

    const result = getCurrentUser(runner);

    expect(result).toBe("myuser");
  });

  it("should throw on authentication error", () => {
    const runner = createFakeRunner(new Map());

    expect(() => getCurrentUser(runner)).toThrow("Failed to get current user");
  });
});

describe("getCurrentRepo", () => {
  it("should return nameWithOwner from gh repo view", () => {
    const runner = createFakeRunner(
      new Map([["gh repo view --json nameWithOwner", '{"nameWithOwner":"myorg/myrepo"}']]),
    );

    const result = getCurrentRepo(runner);

    expect(result).toBe("myorg/myrepo");
  });

  it("should throw when not in a git repo", () => {
    const runner = createFakeRunner(new Map());

    expect(() => getCurrentRepo(runner)).toThrow("Failed to detect current repo");
  });
});

describe("setSecret", () => {
  it("should call gh secret set with body-file", () => {
    const commands: string[] = [];
    const runner: CommandRunner = {
      runArgv: (cmd: string, args: string[]): string => {
        commands.push(`${cmd} ${args.join(" ")}`);
        return "";
      },
    };

    setSecret({ repo: "owner/repo", name: "API_KEY", value: "secret123", runner });
    return undefined;

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatch(/gh secret set API_KEY --repo owner\/repo --body-file .+/);
  });

  it("should throw on error", () => {
    const runner = createFakeRunner(new Map());

    expect(() => {
      setSecret({ repo: "owner/repo", name: "KEY", value: "val", runner });
    }).toThrow("Failed to set secret");
  });
});
