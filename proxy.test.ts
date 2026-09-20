import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "./proxy";

/**
 * Inventário das rotas de API.
 *
 * O porteiro (`middleware.ts`) nega por padrão, então uma rota nova já nasce
 * protegida — este teste existe para que a *exceção* seja uma decisão explícita
 * e não um esquecimento. Toda rota pública precisa estar nesta lista, com o
 * motivo escrito. Criar uma rota sob um caminho público sem passar por aqui
 * quebra o teste.
 *
 * Contexto: até 2026-09-20 nenhuma das 133 rotas tinha guard nenhum.
 */

const API_ROOT = join(__dirname, "app", "api");

/** Prefixos que o middleware deixa passar sem sessão, e por quê. */
const PUBLIC_API_PREFIXES: Record<string, string> = {
  "api/auth/login": "é por onde se obtém a sessão",
  "api/auth/logout": "encerrar sessão não pode exigir sessão válida",
  "api/health": "healthcheck do Docker não tem cookie; não expõe dado",
  "api/webhooks": "a Pluggy não faz login — POST usa x-webhook-secret, GET usa X-INTERNAL-API-KEY",
};

function listRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      found.push(full);
    }
  }
  return found;
}

/** `app/api/sync/cron/route.ts` -> `api/sync/cron` */
function routePath(file: string) {
  return relative(join(__dirname, "app"), file)
    .split(sep)
    .slice(0, -1)
    .join("/");
}

const routeFiles = listRouteFiles(API_ROOT);
const routes = routeFiles.map((file) => ({ file, path: routePath(file) }));

function isPublic(path: string) {
  return Object.keys(PUBLIC_API_PREFIXES).some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

describe("inventário de rotas da API", () => {
  it("encontra as rotas do app", () => {
    // Guarda contra o próprio teste passar por não ter achado nada.
    expect(routes.length).toBeGreaterThan(100);
  });

  it("toda rota pública está declarada com motivo", () => {
    const publicas = routes.filter((route) => isPublic(route.path)).map((route) => route.path);
    for (const path of publicas) {
      const prefix = Object.keys(PUBLIC_API_PREFIXES).find(
        (candidate) => path === candidate || path.startsWith(`${candidate}/`),
      );
      expect(PUBLIC_API_PREFIXES[prefix!]).toBeTruthy();
    }
  });

  it("o middleware cobre /api (o matcher não exclui rota de API)", () => {
    const matcher = config.matcher[0];
    const excluded = ["_next/static", "_next/image"];
    for (const term of excluded) {
      expect(matcher).toContain(term);
    }
    // O que não pode acontecer é alguém "consertar" um 401 chato excluindo
    // /api do matcher — seria voltar ao estado de antes da auditoria.
    expect(matcher).not.toContain("api");
  });

  it("rota pública que lê dado sensível precisa ter guard próprio", () => {
    // /api/webhooks fica fora do porteiro porque a Pluggy não faz login. Sem
    // guard próprio, essa exceção vira exatamente o buraco que ela evitava: o
    // GET de diagnóstico devolvia itemId de cada conexão a quem pedisse.
    const webhookRoutes = routes.filter((route) => route.path.startsWith("api/webhooks"));
    expect(webhookRoutes.length).toBeGreaterThan(0);

    for (const route of webhookRoutes) {
      const source = readFileSync(route.file, "utf8");
      const hasGuard =
        source.includes("ensureInternalApiKey") ||
        source.includes("WEBHOOK_SECRET_HEADER") ||
        source.includes("constantTimeEquals");
      expect(hasGuard, `${route.path} está público e sem guard próprio`).toBe(true);
    }
  });

  it("a lista de rotas públicas é exatamente esta", () => {
    // Trava deliberada: acrescentar rota sob um prefixo público quebra aqui e
    // obriga alguém a olhar o que está sendo aberto. É o único teste da suíte
    // que existe para dar trabalho.
    const publicas = routes
      .filter((route) => isPublic(route.path))
      .map((route) => route.path)
      .sort();

    expect(publicas).toEqual([
      "api/auth/login",
      "api/auth/logout",
      "api/health/ready",
      "api/webhooks/pluggy",
      "api/webhooks/pluggy/register",
    ]);
  });

  it("a esmagadora maioria das rotas fica atrás do porteiro", () => {
    const protegidas = routes.filter((route) => !isPublic(route.path));
    expect(protegidas.length).toBe(routes.length - 5);
    // Antes desta rodada este número era zero.
    expect(protegidas.length).toBeGreaterThan(120);
  });

});
