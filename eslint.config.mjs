import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    // Artefatos locais gerados (bundle do MCP e script de auditoria).
    "mcp.js",
    "run-lighthouse.js",
    // Código de terceiro vendorizado: as regras de hooks deste app não mandam
    // nele, e "corrigir" aqui só faria o próximo update do kit dar conflito.
    "vendor/**",
  ]),
  {
    // Regras do React Compiler ligadas como erro pelo eslint-config-next 16.4.
    // Pegam padrões pré-existentes (setState em effect para sincronizar
    // formulário, ref lida no render do pull-to-refresh) que funcionam hoje.
    // Ficam como aviso até uma refatoração dedicada — débito registrado em
    // my_stuff/HANDOFF_RETOMADA_2026-10-28.md.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    files: ["scripts/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
