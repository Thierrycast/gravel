/**
 * Sessão do app: um cookie assinado, sem banco e sem dependência.
 *
 * Até 2026-09-20 o Gravel não tinha porteiro nenhum: as 133 rotas de `/api`
 * respondiam a qualquer um que alcançasse a porta. Quem estivesse na LAN ou na
 * tailnet lia o extrato inteiro, criava transação e puxava os segredos de
 * `/api/settings/secrets`. A auditoria chamou isso de "complete lack of
 * authentication" e estava certa — a única defesa era a rede.
 *
 * O desenho é deliberadamente pequeno, porque o app é de um usuário só:
 *
 * - uma senha (`APP_PASSWORD`), nada de tabela de usuários;
 * - um cookie HMAC-SHA256 com expiração embutida, nada de sessão em banco;
 * - Web Crypto em vez de `node:crypto`, porque o middleware roda no Edge e lá
 *   `node:crypto` não existe.
 *
 * Sem `APP_PASSWORD` configurada o app **nega tudo**. É chato de propósito:
 * falhar aberto aqui devolveria exatamente o buraco que este arquivo fecha.
 */

const encoder = new TextEncoder();

/** Nome do cookie. Curto porque vai em toda requisição. */
export const SESSION_COOKIE = "gravel_session";

/** Trinta dias. É um app pessoal: expirar toda hora só ensina a odiar a tela. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionConfig = {
  password?: string | null;
  secret?: string | null;
};

/**
 * Lê a configuração do ambiente. `SESSION_SECRET` é opcional: sem ela, a
 * própria senha assina o cookie — trocar a senha invalida as sessões abertas,
 * que é o comportamento desejado.
 */
export function readSessionConfig(env: Record<string, string | undefined>): SessionConfig {
  return {
    password: env.APP_PASSWORD?.trim() || null,
    secret:
      env.SESSION_SECRET?.trim() ||
      env.APP_SECRETS_ENCRYPTION_KEY?.trim() ||
      env.APP_PASSWORD?.trim() ||
      null,
  };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Comparação em tempo constante. `a !== b` sai no primeiro byte diferente, e a
 * diferença de tempo é medível o bastante para adivinhar um token byte a byte.
 * `node:crypto.timingSafeEqual` não existe no Edge, então é na mão.
 */
export function constantTimeEquals(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  // O tamanho vaza de qualquer jeito (está no cookie); o que não pode vazar é
  // *onde* diverge. Compara sempre o mesmo número de bytes.
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Emite `<expiraEm>.<assinatura>`. */
export async function createSessionToken(
  secret: string,
  now = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS,
) {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = String(expiresAt);
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * Confere assinatura e validade. Devolve `false` em qualquer dúvida — token
 * malformado, assinatura errada ou expirado são todos o mesmo "não".
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | null | undefined,
  now = Date.now(),
) {
  if (!token || !secret) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!payload || !signature) return false;

  const expected = await hmac(secret, payload);
  if (!constantTimeEquals(signature, expected)) return false;

  const expiresAt = Number.parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt * 1000 > now;
}

/** Confere a senha de login, também em tempo constante. */
export function verifyPassword(candidate: string, configured: string | null | undefined) {
  if (!configured) return false;
  return constantTimeEquals(candidate, configured);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;

/** Só exporta `base64UrlDecode` para o teste conseguir corromper um token. */
export const __testing = { base64UrlEncode, base64UrlDecode, hmac };
