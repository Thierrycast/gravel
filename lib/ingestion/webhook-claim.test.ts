import { OpsRunStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildWebhookClaimFilter } from "./webhook-events";

/**
 * A reivindicação de um evento da fila é um `updateMany` condicional — o banco
 * é quem serializa. O que dá para testar sem banco é a *condição*, e é ela que
 * carrega a sutileza: `status` nasce RUNNING por default do schema, então
 * "está RUNNING" não distingue recém-chegado de já-em-processamento.
 *
 * Estes testes avaliam o filtro contra linhas de exemplo, do mesmo jeito que o
 * Prisma avaliaria: `status != SUCCESS` E pelo menos um dos ramos do `OR`.
 */
type Row = {
  status: OpsRunStatus;
  attempts: number;
  updatedAt: Date;
};

function isClaimable(row: Row, now: Date) {
  const filter = buildWebhookClaimFilter(now);
  if (row.status === OpsRunStatus.SUCCESS) return false;
  return filter.OR.some((clause) => {
    if ("attempts" in clause) return row.attempts === clause.attempts;
    if ("status" in clause) return row.status === clause.status;
    if ("updatedAt" in clause) return row.updatedAt < clause.updatedAt.lt;
    return false;
  });
}

const NOW = new Date("2026-09-20T12:00:00.000Z");
const seconds = (n: number) => new Date(NOW.getTime() - n * 1000);

describe("buildWebhookClaimFilter", () => {
  it("reivindica um evento recém-inserido (RUNNING por default, attempts 0)", () => {
    expect(
      isClaimable({ status: OpsRunStatus.RUNNING, attempts: 0, updatedAt: NOW }, NOW),
    ).toBe(true);
  });

  it("NÃO reivindica um evento que outra execução acabou de pegar", () => {
    // É este o caso que a corrida produzia: dois reenvios simultâneos da
    // Pluggy, os dois entrando em handleWebhookEvent sobre o mesmo item.
    expect(
      isClaimable(
        { status: OpsRunStatus.RUNNING, attempts: 1, updatedAt: seconds(2) },
        NOW,
      ),
    ).toBe(false);
  });

  it("nunca reivindica um evento já concluído", () => {
    expect(
      isClaimable({ status: OpsRunStatus.SUCCESS, attempts: 1, updatedAt: seconds(9999) }, NOW),
    ).toBe(false);
    expect(
      isClaimable({ status: OpsRunStatus.SUCCESS, attempts: 0, updatedAt: NOW }, NOW),
    ).toBe(false);
  });

  it("reivindica um evento que falhou, para o redreno do scheduler", () => {
    expect(
      isClaimable({ status: OpsRunStatus.ERROR, attempts: 2, updatedAt: seconds(5) }, NOW),
    ).toBe(true);
  });

  it("reivindica um RUNNING órfão (processo morreu no meio)", () => {
    // Sem este ramo, um container reiniciado deixaria o evento preso em RUNNING
    // para sempre — e o redreno do scheduler, que busca justamente RUNNING,
    // nunca conseguiria pegá-lo de volta.
    expect(
      isClaimable(
        { status: OpsRunStatus.RUNNING, attempts: 1, updatedAt: seconds(6 * 60) },
        NOW,
      ),
    ).toBe(true);
  });

  it("respeita a janela: RUNNING dentro de 5 minutos ainda é de outro", () => {
    expect(
      isClaimable(
        { status: OpsRunStatus.RUNNING, attempts: 1, updatedAt: seconds(4 * 60) },
        NOW,
      ),
    ).toBe(false);
  });

  it("exclui SUCCESS no nível do filtro, não só no ramo do OR", () => {
    expect(buildWebhookClaimFilter(NOW).status).toEqual({ not: OpsRunStatus.SUCCESS });
  });
});
