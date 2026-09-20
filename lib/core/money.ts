import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Entrada de dinheiro vinda de JSON.
 *
 * O problema que isto resolve: `amount` chega como número IEEE-754, e o schema
 * guarda `Decimal`. Todo valor que passou por aritmética em JavaScript antes de
 * virar JSON já chega sujo — `10.15 * 1.2` é `12.180000000000001`, e era esse
 * número que ia para o banco. Depois ele volta em soma de categoria, em fatura,
 * em projeção, e a conta não fecha por centavos que ninguém consegue explicar.
 *
 * A regra aqui é simples: **arredonda para centavo antes de virar Decimal**, e
 * a conversão passa pela string, não pelo float — `new Prisma.Decimal(0.1 + 0.2)`
 * guardaria `0.30000000000000004`, enquanto `new Prisma.Decimal("0.3")` guarda
 * exatamente 0,3.
 */

/**
 * Arredonda para duas casas.
 *
 * O arredondamento é sobre o valor binário que de fato chegou, não sobre o
 * decimal que a pessoa digitou — e os dois nem sempre são o mesmo. `1.015` não
 * existe em double: o mais próximo é `1.01499999999999990...`, e portanto
 * arredonda para `1.01`, não `1.02`. Isso não é defeito daqui; é o que sobra
 * quando o valor atravessa JSON como número. Para arredondar meio-para-cima de
 * verdade, o valor precisaria chegar como string e nunca virar `number` —
 * mudança de contrato de API, não de função.
 *
 * O que esta função garante: o resultado tem no máximo duas casas e está a
 * menos de meio centavo do valor recebido. É o suficiente para o `Decimal` do
 * banco parar de guardar `12.180000000000001`.
 */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Valor monetário precisa ser um número finito");
  }
  // `toFixed` faz o arredondamento em decimal e devolve string; o Number de
  // volta é exato porque duas casas cabem num double sem perda.
  return Number.parseFloat(value.toFixed(2));
}

/** Converte para `Decimal` pelo caminho seguro: string, nunca float. */
export function toMoneyDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundToCents(value).toFixed(2));
}

/**
 * Schema de um valor monetário positivo. Rejeita NaN, Infinity, zero e
 * negativo — a direção do lançamento é quem diz se entra ou sai, o valor em si
 * é sempre positivo.
 */
export const positiveMoney = z
  .number()
  .finite("Valor precisa ser um número finito")
  .positive("Valor deve ser maior que zero")
  .transform(roundToCents);

/** Data vinda de JSON: aceita ISO ou timestamp, rejeita string sem sentido. */
export const isoDate = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida" });
      return z.NEVER;
    }
    return parsed;
  });

/** Texto obrigatório já sem espaço nas pontas. */
export const requiredText = (field: string, max = 500) =>
  z
    .string({ message: `${field} é obrigatório` })
    .trim()
    .min(1, `${field} é obrigatório`)
    .max(max, `${field} é longo demais`);

/**
 * Formata erro de validação numa mensagem só, legível na UI. O `jsonError` do
 * app espera um `Error`, não a árvore do zod.
 */
export function validationError(error: z.ZodError): Error {
  const first = error.issues[0];
  const path = first?.path.join(".");
  return new Error(path ? `${path}: ${first.message}` : (first?.message ?? "Payload inválido"));
}
