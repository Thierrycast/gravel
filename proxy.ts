import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  readSessionConfig,
  verifySessionToken,
  constantTimeEquals,
} from "@/lib/server/session";

/**
 * O porteiro. Antes dele, as 133 rotas de `/api` respondiam a qualquer um que
 * alcançasse a porta 3000 — extrato, criação de transação e os segredos em
 * `/api/settings/secrets`, tudo aberto para a LAN e para a tailnet.
 *
 * A regra é "nega por padrão": tudo exige sessão, e o que é público está na
 * lista abaixo, com o motivo escrito. Rota nova nasce protegida sem ninguém
 * precisar lembrar de protegê-la — que é o ponto.
 */

/**
 * Caminhos públicos. Cada um tem um porquê:
 *
 * - `/login` e `/api/auth/*`: é por onde se obtém a sessão. Trancar seria um
 *   ciclo.
 * - `/api/health/*`: o healthcheck do Docker não tem cookie. Não expõe dado —
 *   só responde se o processo está de pé.
 * - `/api/webhooks/*`: a Pluggy não faz login. O POST tem o próprio segredo
 *   (`x-webhook-secret`); o GET de diagnóstico ganhou `ensureInternalApiKey`
 *   nesta mesma rodada, porque estava devolvendo `itemId` e payload a quem
 *   pedisse.
 * - estáticos e PWA: `manifest`, service worker e ícones são buscados pelo
 *   browser antes de existir sessão.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/webhooks",
  "/offline",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
  "/favicon.ico",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (publicPath) => pathname === publicPath || pathname.startsWith(`${publicPath}/`),
  );
}

/**
 * Automação (cron, sync, admin) já se identificava com `X-INTERNAL-API-KEY`
 * antes deste middleware existir. Continua valendo: quem tem a chave interna
 * passa sem cookie, senão o scheduler precisaria de um login.
 */
function hasInternalKey(request: NextRequest) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return false;
  const incoming = request.headers.get("x-internal-api-key");
  if (!incoming) return false;
  return constantTimeEquals(incoming, configured);
}

function denyApi(reason: string, status = 401) {
  return NextResponse.json(
    {
      status: "error",
      summary: null,
      results: null,
      meta: null,
      error: { message: reason },
    },
    { status },
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const { password, secret } = readSessionConfig(process.env);

  // Sem senha configurada o app não tem como distinguir dono de estranho.
  // Nega tudo e diz o que falta — falhar aberto aqui seria reabrir o buraco.
  if (!password) {
    if (isApi) {
      return denyApi(
        "APP_PASSWORD não configurada: o app está trancado até que ela exista no ambiente.",
        503,
      );
    }
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login?motivo=sem-senha", request.url));
    }
    return NextResponse.next();
  }

  if (hasInternalKey(request)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, secret)) return NextResponse.next();

  if (isApi) return denyApi("Não autorizado");

  const login = new URL("/login", request.url);
  // Volta para onde a pessoa queria ir, em vez de despejar todo mundo na home.
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Tudo, menos o que o Next serve sozinho. Os assets de `_next/static` são
   * imutáveis e com hash no nome; passá-los pelo middleware só adiciona
   * latência a cada requisição.
   */
  matcher: ["/((?!_next/static|_next/image|icons/|images/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
