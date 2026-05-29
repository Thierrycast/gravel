import { describe, expect, it } from "vitest";
import { cleanMerchantName, extractDocumentFromText, isPaymentFacilitatorOrBank } from "./shared";

describe("cleanMerchantName", () => {
  it("removes common payment prefixes and formats accurately", () => {
    expect(cleanMerchantName("Pagamento Com Qr Pix Jomag Fashion Ltda")).toBe("jomag fashion");
    expect(cleanMerchantName("Jomag Fashion")).toBe("jomag fashion");
    expect(cleanMerchantName("Compra No Debito Supermercado BH S/A")).toBe("supermercado bh");
    expect(cleanMerchantName("PGTO PIX - LOJAS AMERICANAS - SA")).toBe("lojas americanas");
    expect(cleanMerchantName("Compra Credito Lojas Renner S.a.")).toBe("lojas renner");
    expect(cleanMerchantName("estabelecimento comercial padaria real")).toBe("padaria real");
  });

  it("removes corporate suffixes in portuguese", () => {
    expect(cleanMerchantName("Posto Graal ME")).toBe("posto graal");
    expect(cleanMerchantName("Consultoria Alfa Eireli")).toBe("consultoria alfa");
    expect(cleanMerchantName("Mecanica Silva EPP")).toBe("mecanica silva");
    expect(cleanMerchantName("Marcio Silva MEI")).toBe("marcio silva");
    expect(cleanMerchantName("Sorveteria Ice SA")).toBe("sorveteria ice");
  });

  it("removes payment gateway initials/prefixes", () => {
    expect(cleanMerchantName("Mp Docechurros")).toBe("docechurros");
    expect(cleanMerchantName("Pg Drogaraia")).toBe("drogaraia");
    expect(cleanMerchantName("Ec Doug")).toBe("doug");
    expect(cleanMerchantName("Ipg Bizzinternet")).toBe("bizzinternet");
  });

  it("handles fallback to original when result is empty", () => {
    expect(cleanMerchantName("Pix")).toBe("pix");
    expect(cleanMerchantName("Ltda")).toBe("ltda");
    expect(cleanMerchantName("")).toBe("");
    expect(cleanMerchantName(null)).toBe("");
  });
});

describe("isPaymentFacilitatorOrBank", () => {
  it("correctly identifies facilitators by name and CNPJ", () => {
    expect(isPaymentFacilitatorOrBank("Mercado Pago Instituicao De Pagamento")).toBe(true);
    expect(isPaymentFacilitatorOrBank("Stone Pagamentos S.A.")).toBe(true);
    expect(isPaymentFacilitatorOrBank("Nu Pagamentos S.A.")).toBe(true);
    expect(isPaymentFacilitatorOrBank("Itau Unibanco")).toBe(true);
    expect(isPaymentFacilitatorOrBank(null, "10.573.521/0001-91")).toBe(true);
    
    // Non-facilitators
    expect(isPaymentFacilitatorOrBank("Jomag Fashion")).toBe(false);
    expect(isPaymentFacilitatorOrBank("Docechurros")).toBe(false);
    expect(isPaymentFacilitatorOrBank(null, "04.738.926/0001-30")).toBe(false);
  });
});

describe("extractDocumentFromText", () => {
  it("extracts CNPJ in various formats", () => {
    expect(extractDocumentFromText("PIX - ENVIADO - CNPJ 12.345.678/0001-90")).toBe("12345678000190");
    expect(extractDocumentFromText("DOC ENVIADO 12345678000190 ST")).toBe("12345678000190");
    expect(extractDocumentFromText("MAQUINA CARD 12.345.678/0001-90")).toBe("12345678000190");
  });

  it("extracts CPF in various formats", () => {
    expect(extractDocumentFromText("TED RECEBIDO CPF 123.456.789-00")).toBe("12345678900");
    expect(extractDocumentFromText("PIX EMITIDO 12345678900 XPTO")).toBe("12345678900");
  });

  it("returns null when no document is found or invalid length", () => {
    expect(extractDocumentFromText("COMPRA MERCADO CENTRAL")).toBeNull();
    expect(extractDocumentFromText("PIX DE R$ 123,45 ENVIADO")).toBeNull();
    expect(extractDocumentFromText("DOC 12345")).toBeNull();
    expect(extractDocumentFromText(null)).toBeNull();
  });
});
