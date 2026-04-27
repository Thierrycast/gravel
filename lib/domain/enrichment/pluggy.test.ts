import { describe, expect, it } from "vitest";

import { extractPluggyEnrichmentFields, resolveEffectiveCategory } from "./pluggy";

describe("extractPluggyEnrichmentFields", () => {
  it("keeps only enrichment fields that exist in the raw payload", () => {
    expect(
      extractPluggyEnrichmentFields({
        paymentData: {
          payer: { documentNumber: "111" },
          receiver: { documentNumber: "222" },
        },
        creditCardMetadata: {
          payeeMCC: "5411",
        },
        isBusiness: true,
      }),
    ).toEqual({
      paymentData: {
        payer: { documentNumber: "111" },
        receiver: { documentNumber: "222" },
      },
      creditCardMetadata: {
        payeeMCC: "5411",
      },
      isBusiness: true,
    });
  });

  it("falls back to alternate MCC keys without fabricating business type", () => {
    expect(
      extractPluggyEnrichmentFields({
        creditCardMetadata: {
          mcc: 5812,
        },
      }),
    ).toEqual({
      paymentData: undefined,
      creditCardMetadata: {
        payeeMCC: 5812,
      },
      isBusiness: undefined,
    });
  });

  it("returns empty defaults for non-object payload", () => {
    expect(extractPluggyEnrichmentFields(null)).toEqual({
      paymentData: undefined,
      creditCardMetadata: undefined,
      isBusiness: undefined,
    });
    expect(extractPluggyEnrichmentFields("string")).toEqual({
      paymentData: undefined,
      creditCardMetadata: undefined,
      isBusiness: undefined,
    });
  });
});

describe("resolveEffectiveCategory", () => {
  const categories = new Map([
    ["alimentação", "cat-food"],
    ["transporte", "cat-transport"],
  ]);

  it("prefers local category override over everything", () => {
    expect(
      resolveEffectiveCategory({
        localCategoryId: "local-1",
        providerCategoryId: "provider-1",
        enrichment: { pluggyCategory: "alimentação", pluggyCategoryId: "p-1" },
        categoriesByName: categories,
      }),
    ).toBe("local-1");
  });

  it("falls back to provider category when no local override", () => {
    expect(
      resolveEffectiveCategory({
        localCategoryId: null,
        providerCategoryId: "provider-1",
        enrichment: { pluggyCategory: "alimentação" },
        categoriesByName: categories,
      }),
    ).toBe("provider-1");
  });

  it("resolves pluggy enrichment category name to local id", () => {
    expect(
      resolveEffectiveCategory({
        localCategoryId: null,
        providerCategoryId: null,
        enrichment: { pluggyCategory: "Alimentação" },
        categoriesByName: categories,
      }),
    ).toBe("cat-food");
  });

  it("returns null when no category can be resolved", () => {
    expect(
      resolveEffectiveCategory({
        localCategoryId: null,
        providerCategoryId: null,
        enrichment: { pluggyCategory: "desconhecido" },
        categoriesByName: categories,
      }),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(resolveEffectiveCategory({})).toBeNull();
  });
});
