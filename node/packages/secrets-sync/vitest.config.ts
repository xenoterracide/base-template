// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Use forks for better isolation with PnP
    pool: "forks",
    // Enable dependency optimization for faster imports
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
        },
      },
    },
  },
});
