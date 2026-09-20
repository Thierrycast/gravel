import { describe, expect, it } from "vitest";

import {
  SESSION_TTL_SECONDS,
  constantTimeEquals,
  createSessionToken,
  readSessionConfig,
  verifyPassword,
  verifySessionToken,
} from "./session";

const SECRET = "segredo-de-teste-com-tamanho-razoavel";

describe("createSessionToken / verifySessionToken", () => {
  it("aceita um token que ele mesmo emitiu", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
  });

  it("rejeita token assinado com outro segredo", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, "outro-segredo")).resolves.toBe(false);
  });

  it("rejeita token expirado", async () => {
    const emittedAt = Date.now();
    const token = await createSessionToken(SECRET, emittedAt, 60);
    // Um segundo depois do fim da validade.
    const later = emittedAt + 61_000;
    await expect(verifySessionToken(token, SECRET, later)).resolves.toBe(false);
  });

  it("aceita token ainda dentro da validade", async () => {
    const emittedAt = Date.now();
    const token = await createSessionToken(SECRET, emittedAt, 60);
    await expect(verifySessionToken(token, SECRET, emittedAt + 30_000)).resolves.toBe(true);
  });

  it("rejeita assinatura adulterada", async () => {
    const token = await createSessionToken(SECRET);
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    await expect(verifySessionToken(tampered, SECRET)).resolves.toBe(false);
  });

  it("rejeita payload adulterado para esticar a validade", async () => {
    const token = await createSessionToken(SECRET, Date.now(), 60);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const distantFuture = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS * 10;
    await expect(verifySessionToken(`${distantFuture}.${signature}`, SECRET)).resolves.toBe(false);
  });

  it.each([undefined, null, "", "sem-ponto", ".só-assinatura", "payload."])(
    "rejeita token malformado: %s",
    async (token) => {
      await expect(verifySessionToken(token as string | undefined, SECRET)).resolves.toBe(false);
    },
  );

  it("rejeita quando não há segredo configurado", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, null)).resolves.toBe(false);
    await expect(verifySessionToken(token, "")).resolves.toBe(false);
  });
});

describe("constantTimeEquals", () => {
  it("compara conteúdo, não referência", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
  });

  it("trata tamanhos diferentes sem estourar", () => {
    expect(constantTimeEquals("abc", "abcdef")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
    expect(constantTimeEquals("", "x")).toBe(false);
  });

  it("não confunde prefixo com igualdade", () => {
    // O bug clássico de comparar só até o menor dos dois.
    expect(constantTimeEquals("senha", "senha-mais-longa")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("aceita a senha certa e recusa a errada", () => {
    expect(verifyPassword("correta", "correta")).toBe(true);
    expect(verifyPassword("errada", "correta")).toBe(false);
  });

  it("recusa tudo quando não há senha configurada", () => {
    expect(verifyPassword("qualquer", null)).toBe(false);
    expect(verifyPassword("", null)).toBe(false);
    expect(verifyPassword("", "")).toBe(false);
  });
});

describe("readSessionConfig", () => {
  it("usa SESSION_SECRET quando existe", () => {
    const config = readSessionConfig({
      APP_PASSWORD: "senha",
      SESSION_SECRET: "dedicado",
      APP_SECRETS_ENCRYPTION_KEY: "cofre",
    });
    expect(config).toEqual({ password: "senha", secret: "dedicado" });
  });

  it("cai para a chave do cofre e depois para a própria senha", () => {
    expect(readSessionConfig({ APP_PASSWORD: "senha", APP_SECRETS_ENCRYPTION_KEY: "cofre" }).secret).toBe("cofre");
    expect(readSessionConfig({ APP_PASSWORD: "senha" }).secret).toBe("senha");
  });

  it("trata string vazia e só espaço como ausência", () => {
    expect(readSessionConfig({ APP_PASSWORD: "   " }).password).toBeNull();
    expect(readSessionConfig({}).password).toBeNull();
    expect(readSessionConfig({}).secret).toBeNull();
  });
});
