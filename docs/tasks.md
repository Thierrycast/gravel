# Gravel Finance — Task Backlog

> Auditoria completa: bugs, melhorias de UX, novas features, débito técnico.
> Prioridades: 🔴 Crítico · 🟠 Alta · 🟡 Média · 🟢 Baixa

---

## 🔴 Bugs Críticos

### BUG-01 — Legenda do gráfico de Recorrências está invertida
**Arquivo:** `app/recurring/page.tsx` linhas 149-154  
**Problema:** As cores da legenda estão trocadas. A bolinha âmbar diz "Parcelas" mas o gráfico usa âmbar para "Contas Fixas", e vice-versa.  
**Impacto:** Usuário lê o gráfico ao contrário.  
**Fix:** Trocar os textos: `bg-amber-500` → "Contas Fixas", `bg-blue-500` → "Parcelas".

---

### BUG-02 — Navegação de mês em Recorrências não funciona
**Arquivos:** `app/recurring/expenses/page.tsx`, `app/recurring/income/page.tsx`  
**Problema:** Botões de mês atualizam o estado `selectedMonth`, mas a lista de regras exibida nunca é filtrada por esse estado. O seletor de mês é essencialmente decorativo.  
**Impacto:** Feature visualmente prometida mas completamente quebrada.  
**Fix:** Filtrar `rules` pelo `selectedMonth` selecionado, ou remover o seletor até a feature ser implementada corretamente.

---

### BUG-03 — Componente `recent-transactions` usa campo errado
**Arquivo:** `components/dashboard/recent-transactions.tsx` linhas 87-90  
**Problema:** Usa `tx.type === "INCOME"` para determinar cor do valor, mas a interface real usa `direction: "INFLOW" | "OUTFLOW"`. O campo `type` não existe no objeto, então a condição sempre é `false` — todos os valores aparecem como negativos/vermelho.  
**Impacto:** Todas as transações recentes do dashboard mostram cor errada.  
**Fix:** Substituir `tx.type === "INCOME"` por `tx.direction === "INFLOW"` (ou verificar o sinal de `tx.amount`).

---

### BUG-04 — Active state do Bottom Nav quebrado para rotas aninhadas
**Arquivo:** `components/bottom-nav.tsx` linhas 31-32  
**Problema:** `pathname.startsWith(href)` faz com que `/recurring/income` ative tanto o item `/recurring` quanto qualquer outro item cujo href seja prefixo. Se um tab futuro apontar para `/accounts/detail`, vai conflitar com `/accounts`.  
**Impacto:** Múltiplos itens do nav ficam ativos ao mesmo tempo.  
**Fix:** Usar match exato para tabs que têm sub-rotas, ou adicionar lista de exceções.

---

### BUG-05 — Cor invertida em cartões de crédito na página Contas
**Arquivo:** `app/accounts/page.tsx` linha ~170  
**Problema:** Saldo negativo em cartão de crédito é mostrado como `text-destructive` (vermelho), mas saldo negativo num cartão de crédito é crédito a favor — deveria ser verde/neutro.  
**Impacto:** Usuário interpreta situação positiva como problema.  
**Fix:** Inverter lógica de cor para contas do tipo CARD/CREDIT.

---

### BUG-06 — Sync polling roda infinitamente em erro de servidor
**Arquivo:** `components/sync-button.tsx` linhas 90-111  
**Problema:** O polling verifica `serverStatus === "SUCCESS" || "ERROR"`, mas se o servidor retornar 500 ou resposta malformada, `serverStatus` nunca muda — o interval nunca é limpo.  
**Impacto:** Memory leak. Spinner roda para sempre. Requisições continuam indefinidamente.  
**Fix:** Adicionar limite de tentativas (ex: 20 polls = 100s) e tratar erro de HTTP.

---

### BUG-07 — Sankey Chart oculta dados válidos quando income = 0
**Arquivo:** `components/charts/sankey-chart.tsx` linhas 86-87  
**Problema:** Retorna vazio quando `totalExpenses <= 0 && remaining <= 0`, mas se `data.income = 0` e há despesas, é um estado válido (gastou mais do que recebeu) que merece visualização.  
**Impacto:** Meses com receita zero mostram "dados insuficientes" mesmo com dados reais.  
**Fix:** Revisar condição — mostrar o sankey mesmo com income=0 se houver despesas.

---

### BUG-08 — Link para transações usa `accountName` (deprecated) em vez de `accountId`
**Arquivos:** `app/bills/page.tsx` linha ~469, `app/accounts/page.tsx` linha ~450  
**Problema:** Links de "Ver Transações" constroem a URL com `?accountName=...` mas a página de transações agora resolve por `accountId`. O filtro não funciona.  
**Impacto:** Usuário clica em "Ver transações desta conta" e vê todas as transações sem filtro.  
**Fix:** Usar `?accountId=...` nos links de navegação.

---

### BUG-09 — Falha silenciosa na conversão USD/BRL no Portfolio
**Arquivo:** `app/api/portfolio/route.ts` linha ~32  
**Problema:** Se a API de câmbio falhar, `usdBrl` pode ser `NaN` ou `0`. O cálculo `cryptoTotalBrl = cryptoTotal * usdBrl` silenciosamente retorna 0 ou NaN, e o patrimônio total fica errado.  
**Impacto:** Patrimônio total exibido incorretamente sem qualquer aviso ao usuário.  
**Fix:** Validar `usdBrl > 0 && Number.isFinite(usdBrl)`, caso contrário retornar erro explícito.

---

### BUG-10 — Cálculo de média diária de gastos errado em Reports
**Arquivo:** `app/reports/page.tsx` linhas 170-180  
**Problema:** `daysInPeriod` para períodos "ytd" e "12m" usa o número de dias desde 1/jan do ano atual, não o período da query. Para "30d"/"90d" usa valores fixos que podem não bater com o período real filtrado.  
**Impacto:** "Gasto médio diário" exibido é matematicamente incorreto.  
**Fix:** Calcular `daysInPeriod` como `(endDate - startDate) / 86400000` usando as datas reais da query.

---

## 🟠 Alta Prioridade

### HIGH-01 — Páginas sem estado de erro (skeleton eterno em caso de falha)
**Arquivos:** `app/reports/page.tsx`, `app/projection/page.tsx`, `app/recurring/expenses/page.tsx`, `app/recurring/income/page.tsx`  
**Problema:** Todas usam `useApi()` mas nunca verificam `error`. Se a API retornar 500, o usuário vê o skeleton para sempre.  
**Fix:** Adicionar `if (error) return <ErrorState message={...} onRetry={refetch} />` após o loading check.

---

### HIGH-02 — Ícone duplicado no sidebar (TrendingUp usado duas vezes)
**Arquivo:** `components/app-sidebar.tsx` linhas 60, 108  
**Problema:** "Fluxo de Caixa" e "Projeções" usam o mesmo ícone `TrendingUp`. Usuário não consegue distinguir visualmente.  
**Fix:** Trocar "Projeções" para `LineChart` ou `BarChart3`, e "Fluxo de Caixa" para `Activity` ou `TrendingUp`.

---

### HIGH-03 — Erro silencioso no sync (console.error em produção)
**Arquivo:** `app/api/sync/trigger/route.ts` linha 41  
**Problema:** `runPluggySync()` é fire-and-forget com apenas `console.error` no catch. Se o sync falhar assincronamente, a UI já recebeu `{ triggered: true }` e nunca saberá.  
**Fix:** Armazenar status do sync no banco antes de responder, ou aguardar resultado (com timeout).

---

### HIGH-04 — Transações: perda silenciosa de filtro quando contas falham a carregar
**Arquivo:** `app/transactions/page.tsx` linhas 222-237  
**Problema:** Se o endpoint de contas retornar erro, `effectiveAccountId` fica `undefined` e a query roda sem filtro — usuário vê todas as transações quando deveria ver apenas uma conta.  
**Fix:** Verificar `accounts.error` e exibir mensagem antes de rodar a query.

---

### HIGH-05 — Indicadores de vencimento ausentes nas Faturas
**Arquivo:** `app/bills/page.tsx`  
**Problema:** A data existe mas não é interpretada. Não há badge/cor indicando "venceu há 5 dias" (vermelho) ou "vence em 3 dias" (amarelo).  
**Fix:** Calcular `diffDays = daysUntil(bill.dueDate)` e mostrar badge contextual em cada linha.

---

### HIGH-06 — Não existe forma de criar/editar/deletar regras de recorrência manualmente
**Arquivos:** `app/recurring/page.tsx`, `app/recurring/expenses/page.tsx`  
**Problema:** O schema `DomainRecurringRule` suporta CRUD completo, mas a UI só exibe regras (sem criar, editar ou deletar). Usuário não consegue adicionar uma assinatura manualmente.  
**Fix:** Adicionar botão "Nova regra" com formulário, ícone de edição e confirmação de exclusão.

---

### HIGH-07 — Schema `DomainBill` existe mas faturas nunca aparecem em lugar nenhum
**Schema:** `DomainBill` (prisma/schema.prisma)  
**Problema:** O modelo de faturas está completo mas o app busca `PluggyBillRecord` em vez de `DomainBill`. Dados de fatura no domínio da aplicação ficam inacessíveis.  
**Fix:** Verificar se `DomainBill` está sendo populado no sync e exibi-lo na página `/bills` junto ou substituindo os dados do Pluggy.

---

### HIGH-08 — Campo `metadataJson` de Investimentos nunca exibido
**Schema:** `DomainInvestment.metadataJson` contém `amountOriginal`, `amountProfit`  
**Problema:** O ganho/perda por investimento existe no banco mas a UI mostra apenas tipo, subtipo, saldo e status.  
**Fix:** Parsear `metadataJson` e exibir "Custo original" e "Lucro/Prejuízo" na tabela de investimentos.

---

### HIGH-09 — Campo `metadataJson` de Crypto nunca exibido (PnL realizado oculto)
**Schema:** `DomainCryptoAsset.metadataJson` contém PnL realizado, primeira/última trade, count de trades  
**Problema:** Só `tradeCount` é exibido. PnL realizado, que é dado crítico de investimento, está escondido.  
**Fix:** Expandir a tabela de crypto para mostrar "PnL Realizado" e "Primeira compra".

---

### HIGH-10 — Tarefas de recurring/income: ícone Calendar igual ao de Recorrências
**Arquivo:** `components/app-sidebar.tsx` linhas 50-56  
**Problema:** "Recorrências" e "Receitas" usam o mesmo ícone `Calendar`. Nenhuma distinção visual.  
**Fix:** Usar `TrendingUp` ou `ArrowDownCircle` para "Receitas recorrentes".

---

## 🟡 Features de Alto Impacto

### FEAT-01 — Export CSV de transações
**Onde:** `app/transactions/page.tsx` — botão no header  
**Detalhe:** Exportar transações com filtros ativos aplicados. Colunas: data, descrição, comerciante, conta, categoria, valor, direção. Endpoint `GET /api/transactions?format=csv`.  
**Esforço:** ~2h

---

### FEAT-02 — Auto-detecção de recorrências a partir do histórico
**Onde:** `app/recurring/page.tsx` — nova seção "Detectadas automaticamente"  
**Detalhe:** Endpoint que varre transações dos últimos 90 dias, agrupa por comerciante e intervalo (25-35 dias = mensal, 7 = semanal), retorna lista de "prováveis recorrências" com botão "Criar regra". Usar `DomainTransaction` + date math.  
**Esforço:** ~3-4h

---

### FEAT-03 — Sistema de orçamento por categoria
**Schema:** Nova tabela `CategoryBudget(id, categoryId, amount, period, createdAt)`  
**Onde:** `app/categories/page.tsx` + `app/reports/page.tsx`  
**Detalhe:** Definir limite mensal por categoria. Reports mostra barra de progresso "R$ 350 / R$ 500 (70%)". Gera alertas no dashboard quando >80%.  
**Esforço:** ~6-8h (schema + API + UI)

---

### FEAT-04 — Status automático de metas (No prazo / Atrasada / Adiantada)
**Onde:** `app/goals/page.tsx` + dashboard  
**Detalhe:** Calcular ritmo de contribuição atual vs ritmo necessário para atingir meta na data. Exibir badge "✓ No prazo", "⚡ Adiantada", "⚠ Atrasada" em cada card. Widget no dashboard com top 3 metas + status.  
**Esforço:** ~2h

---

### FEAT-05 — Edição inline de regras de recorrência
**Onde:** `app/recurring/expenses/page.tsx`, `app/recurring/income/page.tsx`  
**Detalhe:** Ícone de lápis em cada item → modal com campos editáveis (valor, frequência, categoria, descrição). `PUT /api/recurring/rules/:id`.  
**Esforço:** ~2-3h

---

### FEAT-06 — Tags visíveis e filtráveis em transações
**Schema:** `TransactionTag` já existe no Prisma  
**Onde:** `app/transactions/page.tsx`  
**Detalhe:** (1) Exibir pills de tags em cada linha da tabela. (2) Filtro de tag no header. (3) No detalhe da transação (sheet), permitir adicionar/remover tags. (4) Tag autocomplete com tags existentes.  
**Esforço:** ~3-4h

---

### FEAT-07 — "Burn rate" — quantos dias até zerar o saldo
**Onde:** `app/page.tsx` — novo StatTile ou card  
**Detalhe:** `burnDays = saldoAtual / (gastoMédioUltimos30dias / 30)`. Card: "No ritmo atual, saldo em 47 dias." Atualizado com cada refresh. Útil como alerta de saúde financeira.  
**Esforço:** ~1h

---

### FEAT-08 — Comparação Ano a Ano (YoY) em Relatórios
**Onde:** `app/reports/page.tsx` — nova seção  
**Detalhe:** Gráfico de barras agrupadas: meses do ano atual vs mesmo mês do ano anterior. Receitas e despesas lado a lado. Revela sazonalidade e crescimento.  
**Esforço:** ~2-3h

---

### FEAT-09 — Detecção de anomalias de gasto no Dashboard
**Onde:** `app/page.tsx` — nova seção de alertas ou card  
**Detalhe:** Para cada categoria, comparar gasto atual vs média dos últimos 3 meses. Se > 150%, gerar alerta "🍔 Restaurantes +72% vs média". Usar dados já disponíveis de `categories.data`.  
**Esforço:** ~2h

---

### FEAT-10 — Barra de progresso orçamentária por categoria (pós FEAT-03)
**Onde:** `app/categories/page.tsx` e `app/reports/page.tsx`  
**Detalhe:** Após FEAT-03, exibir progresso do orçamento em cada linha da lista de categorias. Cor verde → amarelo → vermelho conforme % do orçamento consumido.  
**Esforço:** ~1-2h (depende de FEAT-03)

---

### FEAT-11 — Detalhe de fatura ao clicar (Drill-down em Bills)
**Onde:** `app/bills/page.tsx`  
**Detalhe:** Click em uma fatura abre sheet lateral com: total, mínimo, data de fechamento, data de vencimento, últimas transações da conta no período, status de pagamento.  
**Esforço:** ~2-3h

---

### FEAT-12 — Gestão de passivos no Portfolio
**Onde:** `app/portfolio/page.tsx` — seção Passivos  
**Detalhe:** Botões "Adicionar passivo", editar valor, marcar como quitado. `DomainLiability` (schema a criar ou usar campo existente). Útil para quem tem financiamentos manuais.  
**Esforço:** ~4h

---

### FEAT-13 — "Marcar como recorrência" no detalhe de transação
**Onde:** `app/transactions/page.tsx` — sheet de detalhe  
**Detalhe:** Se transação não tem matching com nenhuma regra de recorrência, mostrar botão "Parece recorrente? Criar regra". Pré-popula formulário com descrição/comerciante/valor/frequência sugerida.  
**Esforço:** ~2-3h

---

### FEAT-14 — Busca global no header
**Onde:** `app/layout.tsx` — novo input no header  
**Detalhe:** Autocomplete que busca em paralelo: transações (por descrição), comerciantes, categorias, metas. Atalho Cmd+K. Resultados com ícone de tipo e navegação direta.  
**Esforço:** ~4h

---

### FEAT-15 — Visualização de calendário para transações e faturas
**Onde:** Nova view em `app/transactions/page.tsx` ou página separada  
**Detalhe:** Toggle "Calendário / Lista" no topo. Calendário mensal com dias marcados por intensidade de gastos (heat map). Click no dia filtra transações. Datas de vencimento de faturas marcadas.  
**Esforço:** ~6h

---

### FEAT-16 — Digest semanal por e-mail
**Dependência:** Integração com serviço de e-mail (Resend / Nodemailer)  
**Detalhe:** Todo domingo: resumo da semana (receitas, despesas, top 3 categorias, faturas próximas, progresso de metas). Template HTML responsivo. Toggle on/off nas configurações.  
**Esforço:** ~6-8h

---

### FEAT-17 — Configurações do usuário
**Onde:** Nova página `/settings`  
**Detalhe:** (1) Intervalo de auto-sync (padrão 24h). (2) Toggle de digest por e-mail. (3) Moeda padrão. (4) Limites de alerta (ex: alerta quando categoria > X%). (5) Gerenciar conexões Pluggy.  
**Esforço:** ~4-6h

---

### FEAT-18 — Ordenação de colunas em tabelas (Crypto, Investimentos, Comerciantes)
**Onde:** `app/crypto/page.tsx`, `app/investments/page.tsx`, `app/merchants/page.tsx`  
**Detalhe:** Headers de coluna clicáveis com ícone ↑↓. Estado de sort persistido via `useSearchParams`. Mínimo: ordenar por valor, %, nome.  
**Esforço:** ~2-3h

---

### FEAT-19 — Milestone / checkpoints em Metas
**Schema:** Nova tabela `GoalMilestone(id, goalId, name, targetAmount, reachedAt)`  
**Onde:** `app/goals/page.tsx`  
**Detalhe:** Ao criar meta, adicionar marcos intermediários (ex: R$ 5k em março, R$ 10k em junho). Barra de progresso mostra marcos. Celebração visual ao atingir.  
**Esforço:** ~4h

---

### FEAT-20 — Custo de aquisição em lote para Crypto
**Onde:** `app/crypto/page.tsx`  
**Detalhe:** Botão "Atualizar custos em lote" → tabela editável com todos ativos sem custo cadastrado. Submit único salva todos. Alternativa mais eficiente do que editar um por um.  
**Esforço:** ~2-3h

---

## 🟡 UX & Refinamentos

### UX-01 — Insights de Projeção limitados a 3 sem opção de ver mais
**Arquivo:** `app/projection/page.tsx` linha 144  
**Fix:** Substituir `.slice(0, 3)` por lista colapsável "Ver todos os insights".

---

### UX-02 — Categorias em Reports limitadas a 8 sem expansão
**Arquivo:** `app/reports/page.tsx` linha ~293  
**Fix:** Botão "Ver mais" que expande a lista completa ou usa scroll virtual.

---

### UX-03 — Metas sem opção de ordenação
**Arquivo:** `app/goals/page.tsx`  
**Fix:** Adicionar seletor de ordenação: "Por data", "Por progresso %", "Por valor restante".

---

### UX-04 — Empty states sem call-to-action útil
**Arquivos:** `app/merchants/page.tsx`, `app/investments/page.tsx`, `app/recurring/expenses/page.tsx`  
**Fix:** Substituir "Nenhum item encontrado" por mensagem contextual + botão de ação (ex: "Sincronize sua conta para ver investimentos" → botão Sync).

---

### UX-05 — Alertas no Dashboard limitados a 3 sem indicação de mais
**Arquivo:** `app/page.tsx` linha ~366  
**Fix:** Se `alerts.length > 3`, mostrar "+2 alertas" como link que expande ou navega para página de alertas.

---

### UX-06 — Tooltip de categoria de automações pouco descritivo
**Arquivo:** `app/categories/page.tsx`  
**Fix:** "Menor número = maior prioridade" → "Prioridade 1 é avaliada primeiro. Use números menores para regras mais específicas."

---

### UX-07 — Skeleton count inconsistente com número real de items
**Arquivo:** `app/transactions/page.tsx` linha ~761  
**Problema:** Skeleton mostra 10 linhas mas `pageSize` padrão é 25.  
**Fix:** Usar `Math.min(pageSize, 10)` ou mostrar skeleton genérico de tamanho fixo.

---

### UX-08 — Período não persiste ao navegar entre páginas
**Afeta:** Dashboard, Reports, Cash Flow, Categories  
**Fix:** Salvar período selecionado em `localStorage` com chave por contexto. Restaurar na próxima visita.

---

### UX-09 — Net Worth Chart sem legenda
**Arquivo:** `components/dashboard/net-worth-chart.tsx`  
**Problema:** Mostra 3 linhas (patrimônio, ativos, passivos) sem legenda. Usuário não sabe o que cada linha representa sem fazer hover.  
**Fix:** Adicionar `<Legend />` do Recharts ou legenda manual abaixo do gráfico.

---

### UX-10 — Hora de vencimento pode ser off-by-one por timezone
**Arquivo:** `lib/format.ts` linhas ~151-152  
**Problema:** `setHours(0,0,0,0)` normaliza localmente, mas datas ISO do servidor são UTC. Em UTC-3 (Brasil), meia-noite UTC = 21h do dia anterior.  
**Fix:** Normalizar comparação de datas considerando `new Date(dateStr + 'T00:00:00')` (sem Z).

---

### UX-11 — Gráfico de Sankey pode mostrar "NaN" em labels
**Arquivo:** `components/charts/sankey-chart.tsx` linhas 374-375  
**Fix:** Adicionar `Number.isFinite(nodeValue) ? format(nodeValue) : "—"` antes de renderizar o texto.

---

### UX-12 — Automações de categoria: toggle de status sem feedback visual
**Arquivo:** `app/categories/page.tsx`  
**Problema:** Clicar no badge de status alterna active/inactive mas não há loading indicator ou toast de confirmação.  
**Fix:** Mostrar spinner no badge durante a chamada API + toast "Automação ativada/desativada".

---

### UX-13 — `formatPercent("0%")` ambíguo: 0% real vs "sem dado anterior"
**Arquivo:** `lib/format.ts`  
**Fix:** Passar flag opcional `{ showZeroAsDash: true }` para retornar "—" quando o valor é zero por ausência de dado, não por resultado real.

---

### UX-14 — Detalhe de transação não mostra se está marcada como ignorada
**Arquivo:** `app/transactions/page.tsx` — sheet de detalhe  
**Fix:** Mostrar badge "Ignorada" quando `transaction.ignored === true`, com opção de des-ignorar inline.

---

### UX-15 — Recurring: frequências não mapeadas mostram string raw
**Arquivo:** `components/dashboard/upcoming-expenses.tsx` linha ~88  
**Problema:** Se API retornar frequência desconhecida (ex: "quarterly", "bimonthly"), aparece o valor cru em inglês.  
**Fix:** Adicionar mapeamento para "Trimestral", "Bimestral" e fallback "Personalizado".

---

### UX-16 — Goals: estimativa de conclusão não trata prazos absurdos
**Arquivo:** `app/goals/page.tsx`  
**Fix:** Se estimativa > 10 anos, mostrar "+10 anos" ou "⚠ Sem prazo realista no ritmo atual" em vez de uma data específica em 2045.

---

### UX-17 — Crypto: mudança 24h sem tom de cor quando null
**Arquivo:** `app/crypto/page.tsx` linha ~316  
**Fix:** Quando `change24hPercent === null`, aplicar classe `text-muted-foreground` e mostrar "—" ao invés de um cell vazio.

---

### UX-18 — Sem confirmação antes de deletar metas
**Arquivo:** `app/goals/page.tsx`  
**Fix:** Dialog de confirmação "Tem certeza que quer excluir a meta X? Essa ação é irreversível."

---

## 🟡 Mobile & Responsividade

### MOB-01 — Tabela de Automações em Categorias sem scroll horizontal
**Arquivo:** `app/categories/page.tsx` linhas 489-559  
**Problema:** Tabela com 7 colunas sem `overflow-x-auto`. Quebra completamente em mobile.  
**Fix:** Envolver em `<div className="overflow-x-auto">` ou reformular como cards em mobile.

---

### MOB-02 — Status pills em Faturas forçam 3 colunas em telas < 380px
**Arquivo:** `app/bills/page.tsx` linha ~341  
**Fix:** `grid-cols-1 xs:grid-cols-2 sm:grid-cols-3` com `gap-2 sm:gap-3`.

---

### MOB-03 — Projection: tabela de detalhe de meses sem max-height em mobile
**Arquivo:** `app/projection/page.tsx`  
**Problema:** Expandir todos os meses torna a página inutilizavelmente longa em mobile.  
**Fix:** Adicionar `max-h-96 overflow-y-auto` no container expandido, ou limitar a 1 mês aberto por vez.

---

### MOB-04 — Bottom nav cobre conteúdo em páginas com input no rodapé
**Arquivo:** `app/layout.tsx`  
**Problema:** Em alguns dispositivos, o teclado virtual + bottom nav empilham e cobrem campos de formulário.  
**Fix:** Detectar teclado aberto e esconder `BottomNav` quando input tem foco (`visualViewport` API).

---

### MOB-05 — Header em telas < 360px: PrivacyToggle + CurrencySelector + SyncButton ficam apertados
**Arquivo:** `app/layout.tsx` linha 48  
**Fix:** Em telas muito pequenas (`xs:`), ocultar label do SyncButton (já feito) e reduzir gap para `gap-1`.

---

## 🟢 Débito Técnico & Arquitetura

### TECH-01 — Tipo inconsistente: `Decimal` vs `Number` nas APIs de Recorrência
**Arquivos:** `app/api/recurring/route.ts` vs `app/api/recurring/expenses/route.ts`  
**Problema:** Um converte `Number(r.amount)`, o outro retorna `r.amount` (Prisma Decimal). Causa comportamentos diferentes no frontend.  
**Fix:** Padronizar todos os routes: `amount: Number(r.amount.toFixed(2))` ou `amount: r.amount.toNumber()`.

---

### TECH-02 — Inconsistência visual: "—" vs "-" para valores ausentes
**Afeta:** Múltiplos componentes  
**Fix:** Criar constante `EMPTY_VALUE = "—"` em `lib/format.ts` e usar em todos os lugares.

---

### TECH-03 — `useApi` não tem retry automático
**Arquivo:** `hooks/use-api.ts`  
**Fix:** Adicionar opção `retries: number` com backoff exponencial. Padrão: 0 retries (comportamento atual), mas permitir `useApi(url, { retries: 2 })`.

---

### TECH-04 — POLL_INTERVAL_MS hardcoded a 5s (agressivo)
**Arquivo:** `components/sync-button.tsx` linha 10  
**Fix:** Aumentar para 10s e adicionar backoff: `Math.min(interval * 1.5, 30000)` a cada poll sem mudança.

---

### TECH-05 — Ausência de validação de inputs nas APIs
**Arquivos:** `app/api/domain/transactions/[transactionId]/route.ts`, rotas de recurring  
**Fix:** Adicionar schemas Zod para validar body das requisições PUT/POST. Retornar `400 Bad Request` com mensagem clara em vez de deixar passar dados inválidos.

---

### TECH-06 — `console.error` em código de produção
**Arquivo:** `app/api/sync/trigger/route.ts` linha 41  
**Fix:** Substituir por logger estruturado ou simplesmente remover. Dados sensíveis não devem ir para console em produção.

---

### TECH-07 — Falta de metadados por página
**Afeta:** `app/reports/page.tsx`, `app/projection/page.tsx`, todas as páginas secundárias  
**Fix:** Adicionar `export const metadata: Metadata = { title: "Relatórios | Gravel", description: "..." }` em cada `page.tsx`.

---

### TECH-08 — `topCategories` e `maxCategory` em memo boundaries separadas
**Arquivo:** `app/page.tsx` linhas 284-294  
**Fix:** Mover `maxCategory` para dentro do mesmo `useMemo` de `topCategories` para evitar recálculo desnecessário.

---

### TECH-09 — Sem validação de entradas em formulários de Metas
**Arquivo:** `app/goals/page.tsx`  
**Fix:** `min="0"` em todos os campos monetários, `step="0.01"`, validação de `targetDate` não no passado, nome não vazio.

---

### TECH-10 — Dependency `radix-ui` importada diretamente além do shadcn
**Arquivo:** `package.json`  
**Fix:** Auditar imports: se todos os usos são via shadcn, remover dependência direta de `radix-ui` para reduzir bundle size (~150KB).

---

### TECH-11 — Ausência de form library (react-hook-form + zod)
**Problema:** Formulários de metas, categorias, recorrências usam estado manual (`useState`) com validação manual inconsistente.  
**Fix:** Adotar `react-hook-form` + `zod` como padrão para todos os forms. Melhorar DX e consistência de erros.

---

### TECH-12 — Nenhuma tabela de histórico de alertas
**Problema:** Alertas do dashboard são recalculados a cada visita. Não há registro de quando apareceram ou foram dispensados.  
**Fix (futuro):** Criar `Alert(id, type, payload, seenAt, dismissedAt)`. Permite persistência e auditoria.

---

## 🟢 Acessibilidade

### A11Y-01 — Linhas de tabela de Transações não acessíveis via teclado
**Arquivo:** `app/transactions/page.tsx` linha ~582  
**Fix:** Adicionar `tabIndex={0}` e `onKeyDown={(e) => e.key === 'Enter' && openTransaction(transaction)}` em cada `<TableRow>`.

---

### A11Y-02 — Botões de direção de transação sem aria-label
**Arquivo:** `app/transactions/page.tsx` linhas 485-497  
**Fix:** `<Button aria-label="Mostrar todas as transações">ALL</Button>`, etc.

---

### A11Y-03 — Avatares de conta sem aria-label
**Arquivo:** `app/accounts/page.tsx`, `app/bills/page.tsx`  
**Fix:** `<AvatarFallback aria-label={account.name}>` com `role="img"`.

---

### A11Y-04 — Ícones decorativos sem `aria-hidden`
**Afeta:** Múltiplos componentes  
**Fix:** Todos os ícones que são puramente decorativos devem ter `aria-hidden="true"`.

---

### A11Y-05 — CurrencySelector sem `aria-pressed`
**Arquivo:** `components/currency-selector.tsx`  
**Fix:** `<button aria-pressed={currency === c} aria-label={`Moeda ${c}`}>`.

---

### A11Y-06 — Gráficos sem `role="img"` ou `aria-label`
**Afeta:** `app/reports/page.tsx`, `app/recurring/page.tsx`, `app/cash-flow/page.tsx`  
**Fix:** Envolver cada `<ChartContainer>` em `<div role="img" aria-label="Descrição do gráfico">`.

---

## Resumo por Prioridade

| Prioridade | Categoria | Total |
|---|---|---|
| 🔴 Crítico | Bugs que causam dado errado ou feature quebrada | 10 |
| 🟠 Alta | Erros silenciosos, UX crítico, dados ocultos | 10 |
| 🟡 Média | Features novas de alto impacto | 20 |
| 🟡 Média | Refinamentos UX | 18 |
| 🟡 Média | Mobile | 5 |
| 🟢 Baixa | Débito técnico | 12 |
| 🟢 Baixa | Acessibilidade | 6 |
| **Total** | | **81 itens** |

---

## Ordem de Execução Sugerida

```
Sprint 1 — Bugs críticos (1-2 dias)
  BUG-01  Legenda do gráfico recorrências invertida
  BUG-02  Mês não filtra em recorrências/despesas e /income
  BUG-03  recent-transactions: campo `type` vs `direction`
  BUG-05  Cor invertida em cartão de crédito
  BUG-06  Sync polling infinito em erro
  HIGH-02 Ícone TrendingUp duplicado no sidebar
  HIGH-10 Ícone Calendar duplicado no sidebar

Sprint 2 — Estabilidade e erros silenciosos (1 dia)
  HIGH-01 Error states em pages sem feedback
  BUG-09  Falha silenciosa no câmbio do Portfolio
  BUG-10  Cálculo de média diária errado em Reports
  BUG-08  Links com accountName deprecated
  TECH-01 Tipo Decimal vs Number nas APIs

Sprint 3 — Features de alto impacto rápidas (2-3 dias)
  FEAT-01 Export CSV de transações
  FEAT-07 Burn rate widget no dashboard
  FEAT-04 Status de metas (no prazo / atrasada)
  HIGH-05 Indicadores de vencimento em Faturas
  UX-09   Net Worth Chart: adicionar legenda

Sprint 4 — Features de médio esforço (3-4 dias)
  FEAT-05 Edição inline de regras de recorrência
  HIGH-06 Criar/deletar regras manualmente
  FEAT-02 Auto-detecção de recorrências
  FEAT-06 Tags em transações (ver + filtrar)
  HIGH-08 Exibir profit/loss por investimento

Sprint 5 — Features estratégicas (4-6 dias)
  FEAT-03 Sistema de orçamento por categoria
  FEAT-08 Comparação YoY em Relatórios
  FEAT-09 Detecção de anomalias no dashboard
  FEAT-14 Busca global no header
  FEAT-17 Página de configurações

Backlog — Longo prazo
  FEAT-15 Visualização em calendário
  FEAT-16 Digest semanal por e-mail
  FEAT-19 Milestones em metas
  FEAT-12 Gestão de passivos
  TECH-11 Migrar forms para react-hook-form + zod
```
