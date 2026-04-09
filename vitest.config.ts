// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.share/**", "**/.agents/**", "**/.pnp.*"],
    projects: [
      {
        test: {
          name: "merge",
          root: "./node/packages/merge",
          include: ["merge.test.ts"],
        },
      },
      {
        test: {
          name: "secrets-sync",
          root: "./node/packages/secrets-sync",
          include: ["test/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      exclude: ["**/.share/**", "**/.pnp.*", "**/node_modules/**", "**/*.test.ts", "**/coverage/**"],
    },
  },
});
