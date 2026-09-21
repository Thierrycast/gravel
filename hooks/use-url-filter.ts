"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtro de texto que mora na URL, com rascunho local enquanto se digita.
 *
 * O que havia antes em `/transactions`: três `useEffect` copiando URL para
 * estado (`setSearchInput(query)`) e um quarto, com debounce, empurrando estado
 * de volta para a URL. Sincronização em duas vias é um laço — o push chega de
 * volta como mudança de URL, que reescreve o estado com um valor já velho.
 * Digitando rápido, o cursor pula e caracteres se perdem.
 *
 * Aqui a URL é a fonte da verdade e o estado local é só rascunho. O rascunho é
 * re-semeado quando a URL muda **por fora** — voltar/avançar no browser, um
 * "limpar filtros" em outro componente — e ignorado quando a mudança é o eco
 * do nosso próprio push. Quem separa os dois casos é `shouldReseedDraft`.
 */

export type ReseedDecision = {
  /** Valor que veio da URL agora. */
  incoming: string;
  /** O que está no campo. */
  draft: string;
  /** Último valor que NÓS mandamos para a URL. */
  lastPushed: string | null;
};

/**
 * `true` quando o rascunho deve adotar o valor da URL.
 *
 * É a regra inteira do laço, isolada para poder ser testada sem React.
 */
export function shouldReseedDraft({ incoming, draft, lastPushed }: ReseedDecision) {
  // A URL já reflete o que está no campo: nada a fazer.
  if (incoming === draft) return false;
  // A URL mudou porque o nosso próprio push chegou. Re-semear aqui é o laço.
  if (lastPushed !== null && incoming === lastPushed) return false;
  // Mudou por fora: voltar/avançar, limpar filtros, link colado.
  return true;
}

export type UrlFilterOptions = {
  /** Milissegundos antes de escrever na URL. */
  delayMs?: number;
  /** Parâmetros a remover junto (paginação, por exemplo). */
  resetParams?: string[];
};

/**
 * Um campo de texto atrelado a um parâmetro da URL.
 *
 * Devolve `[rascunho, setRascunho]`. A escrita na URL é debounced; a leitura é
 * imediata e sempre da URL.
 */
export function useUrlFilter(
  key: string,
  { delayMs = 400, resetParams = ["page"] }: UrlFilterOptions = {},
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const incoming = searchParams.get(key) ?? "";
  const [draft, setDraft] = useState(incoming);
  const lastPushedRef = useRef<string | null>(null);

  // Re-semeia só quando a URL mudou por fora.
  useEffect(() => {
    if (shouldReseedDraft({ incoming, draft, lastPushed: lastPushedRef.current })) {
      setDraft(incoming);
    }
    // `draft` de propósito fora das dependências: reagir a ele aqui seria
    // reintroduzir a segunda via da sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === incoming) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (trimmed) next.set(key, trimmed);
      else next.delete(key);
      for (const param of resetParams) next.delete(param);

      lastPushedRef.current = trimmed;
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [draft, incoming, key, delayMs, pathname, router, searchParams, resetParams]);

  const reset = useCallback(() => setDraft(""), []);

  return [draft, setDraft, reset] as const;
}
