import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Only run *.test.ts; tests/*.spec.ts are Playwright (E2E) and run via
    // `pnpm exec playwright test`.
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".kilo/**", "tests/**"],
  },
})
