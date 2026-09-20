# Mapeamento de Código: Auditoria GRAVEL

Este documento cruza as falhas validadas na UI/Dados do GRAVEL (AUD-001 a AUD-013) com os respectivos arquivos, funções e linhas de código no repositório local.

## 1. Bug: Transferências de mesma titularidade estourando orçamento (AUD-001)
**Local:** `lib/domain/notifications.ts` (linhas 193-200) e (linhas 237-245)
**Motivo:** A função que gera alertas de `Orçamento estourado` (`budget-deviation`) pesquisa transações usando o Prisma com `{ direction: "OUTFLOW" }`. Ela **falha** ao não filtrar `isSelfTransfer` nem utilizar a lista `EXCLUDED_SPENDING_CATEGORIES`. Toda transferência de mesma titularidade enviada é somada ao orçamento da categoria "Transferências".
**Solução recomendada:** Integrar `classifyCashFlowTransaction` ou as `EXCLUDED_SPENDING_CATEGORIES` (do arquivo `shared.ts`) nas queries de notificação de orçamento.

## 2. Bug: Falso Positivo "Possível Salário" (AUD-002)
**Local:** `lib/domain/review.ts` (linhas 287-298) -> `const salaryCandidates`
**Motivo:** A inbox gera um alerta de salário não confirmado se uma Inflow for > 200 e a função `!isSalaryLikeTransaction` retornar *true*. O problema é que a query `salaryCandidates` não exclui `internalTransferPairIds` ou `isSelfTransfer`. Então um Pix de R$ 3.000 entre as próprias contas do usuário é sinalizado como potencial salário.
**Solução recomendada:** Inserir a exclusão de self-transfers no `.filter()`: `if (internalTransferPairIds.has(tx.id)) return false;`.

## 3. Discrepância Fechamento Mensal vs Dashboard (AUD-003 / AUD-004)
**Local:** `lib/domain/review.ts` (linhas 520-530) vs `lib/domain/analytics/shared.ts` (linhas 78-80)
**Motivo:** O Dashboard utiliza o parâmetro genérico `period: "mtd"`, que é processado em `shared.ts` (em `resolvePeriodStart`) para cortar a pesquisa na data de hoje (`to: new Date()`). Já o "Fechamento Mensal", em `getMonthlyClosePayload()`, ignora o "hoje" e usa `monthRange(monthKey)`, que força o fim da busca para `2026-09-30T23:59:59`. Assim, faturas ou despesas parceladas cadastradas nos últimos dias do mês só entram no Fechamento.
**Solução recomendada:** Parametrizar a extração do `period` de forma padronizada, garantindo que "Este mês" (`currentMonth`) tenha significado idêntico em todas as APIs.

## 4. Bug de Slice de Período "6 meses exibindo 7" (AUD-005)
**Local:** `app/cash-flow/page.tsx` (linhas 156-164) e `lib/domain/analytics/shared.ts` (linhas 65-88)
**Motivo:** A página de Fluxo de Caixa tenta invocar a API com `period: "180d"`. No backend, a função `resolvePeriodStart` pega a data atual e subtrai exatamente 180 dias. Quando cai no dia 24 de Março, a API agrega todas as transações de Março. O frontend então puxa as *chaves de meses* completas (Março a Setembro) resultando em 7 meses agrupados e estragando o cálculo de médias mensais. O case `6m` nem existe no `switch`, o que piora o parsing caso usado diretamente.
**Solução recomendada:** Criar um case literal `6m` no `switch (period)` que faça a subtração de meses estritamente (ex: `setMonth(month - 5)` começando no dia 01), em vez de subtrair dias contínuos.

## 5. Recorrências Duplicadas (Jomag Fashion / Chsystems) (AUD-011)
**Local:** `lib/domain/installments.ts` (linhas 95-125) -> `splitExplicitInstallmentGroup()`
**Motivo:** Se o banco lançar/repassar duas transações com a mesma label `X/Y` no mesmo mês (o que acontece em algumas consolidações), o código valida se a parcela autal é MAIOR que a anterior (`explicit.current > previousExplicit.current`). Como as duas têm o mesmo índice, o código diz `false` e cria uma *nova* cadeia de regras de parcelamento, duplicando o lançamento até o final do tracking.
**Solução recomendada:** Flexibilizar o match de séries. Se o índice (`current`) for idêntico e no mesmo mês ou janela curta, fundir ou ignorar a duplicata, não quebrar a série gerando outra regra.

## 6. Falsos Positivos de Assinaturas (Juros, IOF, Multas) (AUD-012/013)
**Local:** `lib/domain/derived.ts` (linhas 224-240 e 458-470)
**Motivo:** A função que gera as "Regras Fixas" agrupa ocorrências que têm a mesma descrição normalizada (`Juros do Rotativo`) e ocorrem em ritmo mensal. Como não há bloqueio condicional para encargos financeiros, o motor de detecção transforma multas rotineiras em "Assinaturas".
**Solução recomendada:** Manter uma lista de exclusão (ignore-list) em `lib/domain/constants.ts` (ex: `EXCLUDED_RECURRING_KEYWORDS`) e filtrar na linha 233 do `derived.ts`.

---

## 🏗️ Recomendações de Arquitetura e Clean Code
1. **DRY (Don´t Repeat Yourself):** O arquivo `shared.ts` (em analytics) exporta constantes vitais como `EXCLUDED_SPENDING_CATEGORIES`. Porém, o motor do "Inbox/Review" (em `notifications.ts` e `review.ts`) roda Prisma puro para compor cálculos paralelos, perdendo toda a lógica central de exclusões. Recomenda-se exportar um `baseCashFlowQuery()` ou utilizar as mesmas services.
2. **Fallback Silencioso (Fail-fast):** A função `resolvePeriodStart` retorna `undefined` quando recebe um período desconhecido (ex: `6m` sem estar configurado no switch). O Prisma interpreta `undefined` em `gte` como "desde o início dos tempos", explodindo o payload da API. Recomenda-se jogar um Throw em vez de return default, para detecção imediata do erro.
3. **Data Parity entre UI e API:** O frontend re-calcula as faturas e subtrai `c.currentCycle + sum(futureCycles)` do `totalOpen` para achar discrepâncias, mas as compras em processamento não vêm identificadas na API de Statements (`domain/cards/statements`). Uma camada de formatação (Presenter) resolveria isso entregando os "processing" já classificados.


4. **Single Responsibility Principle / Componentes Inchados:** O arquivo `app/cash-flow/page.tsx` possui quase 700 linhas de código. Ele lida diretamente com fetching de API, formatação de datas manuais, renderização complexa de gráficos (Recharts) e listagens (Tabelas). O componente está severamente sobrecarregado. Recomenda-se extrair as lógicas de gráficos para módulos independentes (ex: `CashFlowBarChart`, `NetWorthChart`) dentro de `components/dashboard` e mover o parse de datas para um helper.
