import { describe, expect, it } from "vitest";

import { extractPluggyEnrichmentFields } from "./pluggy";

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
});
