import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Only run *.test.ts; tests/*.spec.ts are Playwright (E2E) and run via
    // `pnpm exec playwright test`.
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/**"],
  },
})
