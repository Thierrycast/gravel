import {
  logoProxyUrl,
  resolveMerchantDomain,
} from "@/lib/domain/enrichment/logo-dev";
import { PLUGGY_CONNECTOR_MAPPING, getPluggyLogoUrl } from "@/lib/constants/pluggy-connectors";

/**
 * Resolves a reliable logo URL for a given cryptocurrency asset ticker.
 * Routes through the local proxy for caching; falls back to spothq icons.
 */
export function getCryptoLogo(asset: string): string {
  const ticker = asset.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ticker) return `/api/logos/crypto/${encodeURIComponent(ticker)}`;
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${asset.toLowerCase()}.png`;
}

/**
 * Normalizes text for comparison or display.
 */
export function normalizeText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Resolves a reliable logo URL for a given merchant name.
 */
export function getMerchantLogo(name: string): string | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;

  const domain = resolveMerchantDomain(name);
  if (domain) return logoProxyUrl(domain);

  if (normalized.includes("netflix")) return logoProxyUrl("netflix.com");
  if (normalized.includes("spotify")) return logoProxyUrl("spotify.com");
  if (normalized.includes("amazon") || normalized.includes("prime"))
    return logoProxyUrl("amazon.com");
  if (normalized.includes("google") || normalized.includes("youtube"))
    return logoProxyUrl("google.com");
  if (normalized.includes("apple") || normalized.includes("icloud"))
    return logoProxyUrl("apple.com");
  if (normalized.includes("microsoft") || normalized.includes("office"))
    return logoProxyUrl("microsoft.com");
  if (normalized.includes("adobe")) return logoProxyUrl("adobe.com");
  if (normalized.includes("disney")) return logoProxyUrl("disney.com");

  // Generic fallback using Clearbit (free tier/public)
  return null;
}

/**
 * Derives the real financial institution brand name from a list of account names
 * belonging to the same Pluggy item (same Open Finance connection).
 *
 * MeuPluggy (connectorId=200) is a proxy that aggregates all Brazilian banks under
 * one connector. The only reliable source for the actual institution is the account
 * names returned by that bank's own API.
 */
export function deriveInstitutionFromNames(names: string[]): string | null {
  const haystack = names
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // 1. Try matching against our comprehensive Pluggy dictionary first
  for (const [institutionName] of Object.entries(PLUGGY_CONNECTOR_MAPPING)) {
    const normalizedTarget = normalizeText(institutionName);
    if (normalizedTarget && haystack.includes(normalizedTarget)) {
      return institutionName;
    }
  }

  // 2. Legacy fallbacks for specific patterns
  if (haystack.includes("nu pagamentos") || haystack.includes("nu financeira")) return "Nubank";
  if (haystack.includes("itau unibanco")) return "Itaú";
  if (haystack.includes("ourocard")) return "Banco do Brasil";
  if (haystack.includes("caixa federal")) return "Caixa Econômica Federal";
  if (haystack.includes("inter ")) return "Inter";
  if (haystack.includes("pagseguro") || haystack.includes("pagbank")) return "PagBank";

  return null;
}

export function getInstitutionLogo(
  name: string | null | undefined,
): string | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;

  // 1. Try exact or partial match in our new Pluggy Dictionary
  const pluggyMatch = Object.entries(PLUGGY_CONNECTOR_MAPPING).find(([key]) => {
    const normKey = normalizeText(key);
    return normKey && normalized.includes(normKey);
  });

  if (pluggyMatch?.[1]) {
    return getPluggyLogoUrl(pluggyMatch[1]);
  }

  const knownInstitutions: Array<[string, string]> = [
    ["nubank", "nubank.com.br"],
    ["nu pagamentos", "nubank.com.br"],
    ["nu financeira", "nubank.com.br"],
    ["itau", "itau.com.br"],
    ["bradesco", "bradesco.com.br"],
    ["santander", "santander.com.br"],
    ["banco do brasil", "bb.com.br"],
    ["ourocard", "bb.com.br"],
    ["caixa economica", "caixa.gov.br"],
    ["caixa federal", "caixa.gov.br"],
    ["banco inter", "bancointer.com.br"],
    ["c6 bank", "c6bank.com.br"],
    ["c6bank", "c6bank.com.br"],
    ["bandeirado", "c6bank.com.br"],
    ["mercado pago", "mercadopago.com.br"],
    ["pagseguro", "pagbank.com.br"],
    ["pagbank", "pagbank.com.br"],
    ["picpay", "picpay.com"],
    ["btg pactual", "btgpactual.com"],
    ["xp investimentos", "xpinc.com"],
    ["rico", "rico.com.vc"],
    ["clear corretora", "clear.com.br"],
    ["wise", "wise.com"],
    ["binance", "binance.com"],
    // Short/ambiguous matches last to avoid false positives
    ["caixa", "caixa.gov.br"],
    ["inter", "bancointer.com.br"],
    ["c6", "c6bank.com.br"],
    ["btg", "btgpactual.com"],
    ["xp", "xpinc.com"],
    ["clear", "clear.com.br"],
    ["bb", "bb.com.br"],
  ];

  const match = knownInstitutions.find(([needle]) =>
    normalized.includes(needle),
  );
  return match ? logoProxyUrl(match[1]) : null;
}
