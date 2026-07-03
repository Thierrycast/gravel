# Roadmap — Revisão Geral Gravel Finance (2026-07-02)

Checklist da revisão de ponta a ponta solicitada. Itens são marcados conforme concluídos.

## 0. Análise geral
- [x] Mapear estrutura (rotas, modelos, serviços, cálculos, fluxo de dados entre telas) — ver "Achados da análise" abaixo

## 1. Receitas recorrentes (`/recurring/income`)
- [x] CRUD manual (POST `/api/recurring`, PATCH/DELETE `/api/recurring/[id]`; editar detectada converte em manual; excluir detectada cria marcador "dismissed" que impede recriação)
- [x] Exibição clara de periodicidade (badges Semanal/Quinzenal/Mensal/Trimestral/Anual + equivalente mensal por regra)
- [x] Integração correta com projeções (periodicidade real respeitada: semanal 4-5x/mês, trimestral/anual só nos meses certos — antes tudo era tratado como mensal)
- [x] Total mensal correto no summary (equivalente mensal, não soma bruta)

## 2. Contas e cartões (`/accounts`)
- [x] Corrigir "Fatura atual" (hoje mostra o total em aberto, não a fatura do ciclo)
- [x] Exibir separado: fatura atual, próximas faturas, total em aberto, vencimento, status
- [x] Configuração de fechamento/vencimento no sheet de detalhes do cartão (com sugestão inferida do histórico)

## 3. Faturas (`/bills`)
- [x] Campos de dia de fechamento e vencimento no cadastro do cartão (`billingClosingDay`/`billingDueDay` em `DomainAccount`)
- [x] Motor de ciclo de fatura (`lib/domain/billing.ts` + 15 testes): atual, futuras, passadas; agrupamento por ciclo; reconciliação com faturas do provedor; detecção de pagamento
- [x] Warning amigável para cartões sem fechamento/vencimento configurados
- [x] Revisão de design da página (visão por cartão: fatura atual em destaque, próximas, passadas colapsáveis, alerta de vencidas, link para transações do ciclo)
- [x] Consumidores antigos verificados: nenhuma tela consome os endpoints antigos de bills; CLI/MCP ainda usam `getBillsSummaryMetrics` (anotado em "Pontos de atenção futuros")

## 4. Projeções (`/projection`)
- [x] Revisar cálculos (saldo, recorrências, faturas, cenários)
- [x] Usar faturas por ciclo (motor de billing) para cartões configurados, eliminando dupla contagem entre DomainBill futuro + parcelas detectadas + regras de parcelamento
- [x] Corrigir bug: fatura/lançamentos que vencem ainda no mês corrente eram ignorados — agora ajustam o saldo inicial (exposto como `currentMonthAdjustment`)
- [x] Novo componente "Faturas de cartão" no gráfico e no detalhamento mensal
- [x] Alertas: primeiro mês com saldo negativo + faturas vencidas

## 5. Cenários (`/scenarios`)
- [x] Página fundida com o Playground: `/scenarios` agora redireciona para `/playground`; cenários salvos são geridos lá (lista + exclusão + exportação de hipóteses)
- [x] "Amigos" (empréstimos) movido para página própria `/people` ("Pessoas") com resumo de valores a receber; entrada no menu substituiu "Cenários"
- [x] Removidos botões de debug que expunham IDs internos (scenario/lend)

## 6. Playground (`/playground`)
- [x] Copy explicando os dois níveis: hipóteses (localStorage, só no navegador) vs cenários salvos (banco, afetam Projeções)
- [x] Corrigido cálculo do saldo simulado: usava soma parcial dos componentes e ignorava faturas de cartão/cenários — agora usa `projected` da API
- [x] Seção "Cenários salvos" com gestão inline; exportar hipótese atualiza a lista
- [x] Container/título padronizados com o resto do app

## 7. Metas (`/goals`)
- [x] Previsão de conclusão (mês/ano curto) e alerta de ritmo insuficiente ("Precisa de R$ X/mês para chegar a tempo")
- [x] Conectar metas com projeções: novo insight compara sobra média projetada vs aportes mensais comprometidos (`goalCommitmentMonthly`); aportes NÃO são descontados do saldo (dinheiro continua nas contas)
- [x] Microcopy do estado vazio, tratamento de erro com `PageError`, remoção do botão de debug com ID interno

## 8. Relatórios (`/reports`)
- [x] Nova API consolidada `/api/domain/metrics/reports` (uma passada nas transações de 12 meses; mesma classificação de fluxo do resto do app)
- [x] Receitas vs despesas (12 meses, gráfico composto com linha de saldo líquido)
- [x] Variação por categoria vs mês anterior (top 8 deltas)
- [x] Gastos por conta/cartão (barras de progresso com link para transações)
- [x] Recorrências mensais (equivalente mensal, receitas e despesas, links para gestão)
- [x] Faturas por mês (motor de ciclo de billing, cartões configurados)
- [x] Maiores gastos (90 dias, top 10, exclui parcelas)
- [x] Saúde financeira (score 0-100: taxa de poupança + dívida de cartão/renda)

## 9. Configurações (`/settings`)
- [x] Reestruturar com navegação por seções (pills fixas: Financeiro, Cartões, Fontes de salário, Aparência, Segurança, Sincronização, Dados e cache)
- [x] Nova seção "Cartões de crédito": fechamento/vencimento por cartão com sugestão inferida
- [x] Nova seção "Dados e cache": exportar CSV + limpar cache local (react-query persist + Cache Storage do SW)
- [x] Removida seção vazia "Interface do Dashboard (Phase 4)"; Vault com inputs `disabled` de verdade; loading com skeletons

## 10. Revisão visual geral
- [x] Cabeçalhos padronizados com `PageHeader` em todas as páginas (accounts, bills, projection, playground, goals, settings, recurring, cash-flow — antes cada uma tinha `<h1>` manual com tamanhos diferentes)
- [x] Container raiz padronizado (`flex flex-col gap-6`, sem `max-w`/paddings próprios que causavam "pulos" de layout entre rotas)
- [x] Estados vazios unificados no `EmptyState` global (accounts, goals, transactions — que tinha componente local duplicado —, merchants)
- [x] Tratamento de erro com `PageError` adicionado em goals, cash-flow e recurring (antes falha de API deixava tela quebrada/branca)
- [x] Exclusão de tag em /categories agora pede confirmação via `AlertDialog`

## 11. Bugs de lógica e visuais
- [x] Recorrências tratadas como mensais na projeção (trimestral/anual cobradas todo mês) → `occurrenceDatesInMonth`
- [x] Faturas/lançamentos do mês corrente ignorados pela projeção → `currentMonthAdjustment`
- [x] Somatórios de recorrências ignoravam periodicidade → equivalente mensal
- [x] Saldo simulado do playground ignorava faturas de cartão/cenários → usa `projected` da API
- [x] Faturas antigas marcadas OVERDUE por resíduo do provedor → heurística de reconciliação em 3 camadas
- [x] Botões de debug expondo IDs internos (goals, scenarios/lends) removidos

## 12. PWA, cache e offline
- [x] Manifest: ícones 192/512 reais gerados (antes o mesmo PNG 1254px era declarado com tamanhos falsos)
- [x] Service worker: `ExpirationPlugin` nos caches (API 24h/64 entradas; logos 30d/200) — antes cresciam sem limite e nunca expiravam
- [x] Cache de API ampliado de `/api/domain/*` para todo `/api/*` GET (projeção/metas/recorrências agora funcionam offline) com `NetworkFirst` e timeout 10s (antes 3s — rede lenta servia dado financeiro velho silenciosamente)
- [x] `public/sw.js` (artefato de build) removido do git e adicionado ao .gitignore
- [x] Persistência react-query validada: maxAge 24h + buster de versão + staleTime 60s com refetch em foco/reconexão — dado rehidratado sempre revalida

## 13. Qualidade de código
- [x] Cálculos centralizados: `lib/domain/billing.ts` (faturas) e `lib/domain/recurring.ts` (recorrências) como fontes únicas
- [x] Código morto removido: `lib/invoice-period.ts` (nunca importado) e `occurrenceForMonth` em derived.ts (substituído por `occurrenceDatesInMonth`)
- [x] Tipagem/validação nos endpoints novos (billing 1–31 ou null; recurring com validação campo a campo)
- [x] ESLint limpo (artefatos gerados `mcp.js`/`run-lighthouse.js`/`public/sw.js` ignorados no config e no git; 2 imports não usados removidos)

## 14. Documentação
- [x] README (destaques recentes), docs/architecture.md (motor de billing + recorrências), docs/features.md (telas atualizadas), docs/api-reference.md (novos endpoints)
- [x] Documentar novas lógicas (ciclo de fatura, recorrências manuais)
- [x] Registrado em `.agents/logs/CHANGELOG_TECHNICAL.md` e `CHANGELOG_SUMMARY.md`

## 15. Validação final
- [x] Typecheck (`tsc --noEmit` limpo), lint (0 erros/0 avisos), testes (178 Vitest passando), build de produção standalone OK
- [x] Smoke test: 200 em 17 rotas principais
- [x] Resumo final entregue na conversa

## Pontos de atenção futuros
- CLI e MCP ainda usam `getBillsSummaryMetrics` (heurística antiga de bills) — funcional, mas migrar para o motor de ciclo traria os mesmos números da UI.
- "Implementações sugeridas" não iniciadas: DomainBudget + tools MCP de orçamento, webhooks/SSE de eventos, upload/parsing de boletos, `simulate_purchase_impact` e `get_goal_history` no MCP.
- Cartões sem fechamento/vencimento configurados continuam nas heurísticas antigas — configurar cada cartão em /settings › Cartões de crédito.
- O deploy em produção aplica o schema automaticamente (`prisma db push` no entrypoint); os campos novos de billing entram sem passo manual.

---

## Achados da análise (em andamento)

- `DomainRecurringRule` não tem direção/dia próprio em colunas — tudo vive em `metadataJson`; não existe endpoint de CRUD manual (página income é somente leitura).
- `DomainAccount` não tem dia de fechamento/vencimento de fatura; `lib/invoice-period.ts` implementa o cálculo de ciclo mas é código morto (nunca importado).
- Cartão de crédito usa `account.balance` (saldo devedor total da Pluggy) rotulado como "Fatura Atual" em `/accounts` — causa raiz do problema 2.
- Faturas Pluggy (`DomainBill`) existem até o ciclo anterior; a fatura corrente é sintetizada via `bills-fallback.ts` usando o saldo total do cartão (soma de tudo em aberto) — causa raiz do problema 3.
- Transações futuras de parcelas já existem em `DomainTransaction` (até 2027) — dá para agrupar por ciclo de fatura com precisão.
- Projeção (`getProjectionPayload`) mistura 4 fontes de estimativa (regras, bills, parcelas detectadas, transações futuras) com riscos de dupla contagem.
