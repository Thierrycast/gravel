import { describe, expect, it } from "vitest";

import { shouldReseedDraft } from "./use-url-filter";

/**
 * A regra que quebra o laço de sincronização em duas vias. Testada sem React
 * porque é a decisão, não o efeito, que estava errada em /transactions.
 */
describe("shouldReseedDraft", () => {
  it("não re-semeia quando a URL já reflete o campo", () => {
    expect(
      shouldReseedDraft({ incoming: "mercado", draft: "mercado", lastPushed: null }),
    ).toBe(false);
  });

  it("não re-semeia com o eco do nosso próprio push", () => {
    // Este é o laço: o push com debounce chega de volta como mudança de URL e
    // reescreve o campo com um valor já velho. Digitando rápido, o cursor pula.
    expect(
      shouldReseedDraft({ incoming: "merc", draft: "mercado", lastPushed: "merc" }),
    ).toBe(false);
  });

  it("re-semeia quando a URL mudou por fora — voltar no browser", () => {
    expect(
      shouldReseedDraft({ incoming: "padaria", draft: "mercado", lastPushed: "mercado" }),
    ).toBe(true);
  });

  it("re-semeia ao limpar filtros em outro componente", () => {
    expect(
      shouldReseedDraft({ incoming: "", draft: "mercado", lastPushed: "mercado" }),
    ).toBe(true);
  });

  it("re-semeia na primeira carga, com link colado", () => {
    expect(
      shouldReseedDraft({ incoming: "mercado", draft: "", lastPushed: null }),
    ).toBe(true);
  });

  it("volta a aceitar o mesmo valor depois de ele ter vindo de fora", () => {
    // Empurramos "mercado"; o usuário voltou para "padaria"; depois avançou e
    // a URL trouxe "mercado" de novo — agora é mudança externa, não eco.
    expect(
      shouldReseedDraft({ incoming: "mercado", draft: "padaria", lastPushed: "padaria" }),
    ).toBe(true);
  });

  it("campo vazio com URL vazia fica quieto", () => {
    expect(shouldReseedDraft({ incoming: "", draft: "", lastPushed: null })).toBe(false);
    expect(shouldReseedDraft({ incoming: "", draft: "", lastPushed: "" })).toBe(false);
  });
});
