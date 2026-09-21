import { EXCLUDED_RECURRING_KEYWORDS } from "./constants";

function normalize(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

/**
 * `true` quando a transação é encargo financeiro, não assinatura.
 *
 * AUD-012/013: "Juros do Rotativo", IOF e multa entram todo mês, com a mesma
 * descrição e valor parecido — que é literalmente o que o detector de
 * recorrência procura. Sem este corte, o app passava a listar juros como
 * assinatura, oferecia "cancelar" uma cobrança que não se cancela e somava o
 * encargo na projeção como gasto planejado.
 */
export function isFinancialChargeDescription(
  ...values: Array<string | null | undefined>
) {
  const haystack = normalize(values.filter(Boolean).join(" "));
  if (!haystack) return false;

  return EXCLUDED_RECURRING_KEYWORDS.some((keyword) => {
    const needle = normalize(keyword);
    if (!needle) return false;
    // Palavra inteira: "mora" não pode casar "moradia", "iof" não pode casar
    // um merchant que contenha essas letras por acaso.
    return new RegExp(`(^|\\s)${needle}(\\s|$)`).test(haystack);
  });
}
