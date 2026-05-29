// Inferred candidate. Not recovered verbatim from logs.
import { defineConfig } from "prisma/config"

export default defineConfig({
  migrations: {
    seed: "node prisma/seed.js",
  },
})
