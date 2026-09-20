import { Prisma } from "@prisma/client";

const BRL_CODES = new Set(["BRL", "R$"]);
const USD_CODES = new Set(["USD", "USDT", "USDC", "BUSD"]);

export function normalizeCurrencyCode(value?: string | null) {
  const code = value?.trim().toUpperCase();
  if (!code) return "BRL";
  if (code === "REAL" || code === "REAIS") return "BRL";
  if (code === "DOLAR" || code === "DOLLAR") return "USD";
  return code;
}

export function isBrlCurrency(value?: string | null) {
  return BRL_CODES.has(normalizeCurrencyCode(value));
}

export function isUsdLikeCurrency(value?: string | null) {
  return USD_CODES.has(normalizeCurrencyCode(value));
}

export function decimal(value?: Prisma.Decimal | null) {
  return value ?? new Prisma.Decimal(0);
}

export function sumCurrencyDecimals<T>(
  rows: T[],
  amountOf: (row: T) => Prisma.Decimal | null | undefined,
  currencyOf: (row: T) => string | null | undefined,
  currencyCode = "BRL",
) {
  const target = normalizeCurrencyCode(currencyCode);
  return rows.reduce((total, row) => {
    if (normalizeCurrencyCode(currencyOf(row)) !== target) return total;
    return total.plus(decimal(amountOf(row)));
  }, new Prisma.Decimal(0));
}

export type BrlConversion = {
  /** Valor em BRL. Quando não houve como converter, é o valor original. */
  amount: Prisma.Decimal;
  /** `false` quando a moeda não é conhecida — o valor saiu como entrou. */
  converted: boolean;
  /** Código da moeda que não soubemos converter, quando for o caso. */
  unsupportedCurrency?: string;
};

/**
 * Converte um valor para BRL.
 *
 * Antes desta função a conversão estava copiada em cinco lugares
 * (cash-flow, overview e três pontos de reports), sempre na forma
 * `se não é BRL, multiplica pela cotação do dólar`. Isso tratava **euro e
 * libra como se fossem dólar** — 100 EUR viravam 500 BRL a uma cotação de 5.
 * E em `getAccountAllocationMetrics` a comparação era literal com "USD", o que
 * deixava stablecoin passar sem conversão nenhuma: 1000 USDT entravam no
 * patrimônio como 1000 BRL.
 *
 * O que ela faz com moeda que não conhece é deliberado: **não some e não
 * mente**. Somar 1:1 era o bug; descartar faria dinheiro do usuário desaparecer
 * da tela sem aviso. Então preserva o valor e declara, em `unsupportedCurrency`,
 * que aquele número não está em BRL — cabe a quem chama decidir se avisa.
 */
export function convertToBrl(
  amount: Prisma.Decimal | null | undefined,
  currencyCode: string | null | undefined,
  usdBrlRate: number | Prisma.Decimal,
): BrlConversion {
  const value = decimal(amount);
  const code = normalizeCurrencyCode(currencyCode);

  if (BRL_CODES.has(code)) {
    return { amount: value, converted: true };
  }
  if (USD_CODES.has(code)) {
    return { amount: value.mul(new Prisma.Decimal(usdBrlRate)), converted: true };
  }
  return { amount: value, converted: false, unsupportedCurrency: code };
}

/**
 * Conversor com memória: converte e vai anotando as moedas que não soube
 * tratar, para quem chama poder expor isso no payload em vez de entregar um
 * total silenciosamente errado.
 */
export function createBrlConverter(usdBrlRate: number | Prisma.Decimal) {
  const unsupportedCurrencies = new Set<string>();

  function convert(
    amount: Prisma.Decimal | null | undefined,
    currencyCode: string | null | undefined,
  ) {
    const result = convertToBrl(amount, currencyCode, usdBrlRate);
    if (result.unsupportedCurrency) unsupportedCurrencies.add(result.unsupportedCurrency);
    return result.amount;
  }

  convert.unsupportedCurrencies = unsupportedCurrencies;
  return convert;
}

export function sumConvertedToBrl<T>(
  rows: T[],
  amountOf: (row: T) => Prisma.Decimal | null | undefined,
  currencyOf: (row: T) => string | null | undefined,
  usdBrlRate: number,
) {
  const convert = createBrlConverter(usdBrlRate);
  return rows.reduce(
    (total, row) => total.plus(convert(amountOf(row), currencyOf(row))),
    new Prisma.Decimal(0),
  );
}
