import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.mts";

// Run selected pure source tests without the destructive Postgres global setup.
const { test, ...rest } = baseConfig as { test: Record<string, unknown> };
const exclude = Array.isArray(test.exclude) ? test.exclude : [];

export default defineConfig({
  ...rest,
  test: {
    ...test,
    include: ["src/**/*.test.ts", "relay/**/*.test.ts", "scripts/**/*.test.ts"],
    // One legacy database contract lacks the .database.test.ts suffix.
    exclude: [...exclude, "**/*.database.test.ts", "**/health-check-runner.test.ts"],
    globalSetup: [],
  },
});
