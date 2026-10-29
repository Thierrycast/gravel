# Changelog

## 0.1.14 — 2026-10-28 — datas congeladas no build

- **Páginas eram pré-renderizadas no build** e guardavam `new Date()` no HTML:
  `/people` mostrava o vencimento padrão com a data do build, `/monthly-close` o
  mês do build, e a hidratação quebrava (React #418) quando o dia virava entre o
  build (container em UTC) e o acesso. Todas as rotas passam a ser renderizadas
  por requisição: são dados do usuário, atrás de login.

## 0.1.13 — 2026-10-28 — fichas de classificação e débito de lint

### Números

- **Entrada em cartão nunca é renda.** Quitação com descrição de banco
  ("Inclusao de Pagamento Ciclo Corrente") e estorno de compra entravam como
  receita. O classificador central passou a receber o tipo da conta.
- **Auto-transferência "Pix recebido de Fulano" não pareava** com o envio
  "enviada|FULANO": o extrator de contraparte mantinha o "de" no nome.
- **Histórico de meta** somava valor absoluto (resgate virava aporte) e
  começava do zero; agora usa o mesmo sinal do progresso e parte do valor
  manual, então o último ponto bate com a meta.

### Qualidade

- As 17 ocorrências das regras de hooks do React Compiler foram resolvidas e as
  regras voltaram a ser **erro**: `useSyncExternalStore` para montagem, media
  query, `localStorage` e suporte a push; ajuste de estado na renderização para
  semear rascunhos; React Query no banner de falha de sync. Lint com zero avisos.
- Nomes longos em linhas flex ganham reticências em vez de corte no meio.
- `simulate_purchase_impact` e `get_goal_history` documentados em `docs/mcp.md`.

## 0.1.9 – 0.1.12 — 2026-10-28 — retomada

O app estava parado desde setembro. Rodada de atualização, integração com as
novidades da Pluggy e uma revisão pela interface, tela a tela, em celular e
desktop, com o PWA ativo. Cada versão passou por `pnpm lint`, `tsc`, `pnpm test`
e pelo scanner de segredos antes do build.

### Dependências e segurança

- Next 16.1.6 → 16.4.3 e dependências vulneráveis atualizadas: o audit saiu de
  6 críticas para **1 baixa**, transitiva do `shadcn` e sem correção publicada.
- A imagem Docker levava `prisma/dev.db`: o estágio final copia `prisma/`
  inteiro. O `.dockerignore` passou a excluir bases SQLite locais. **Imagens até
  a 0.1.8 contêm esse arquivo.**
- As regras novas `react-hooks/set-state-in-effect` e `react-hooks/refs` viraram
  aviso: 17 ocorrências antigas ficam como débito de refatoração.

### Pluggy

- Transações em `GET /v2/transactions` com cursor: a v1 paginada sai em
  dezembro. `page`/`pageSize` em `/api/pluggy/transactions` passam a dar 400.
- `operationType: PAGAMENTO_FATURA` identifica a quitação de fatura mesmo com
  descrição genérica, em faturas, fluxo de caixa e relatórios.
- `/connect` mostra os recursos do consentimento que aguardam aprovação
  (`GET /api/pluggy/items/{itemId}/resources`, sem expor identificadores).
- `productCoverage` e os incidentes ativos do status page, lidos do conector do
  banco real: com MeuPluggy, o id já mapeado, e não o do proxy. Aparecem em
  `/connect` e no aviso de conexões, com link para o incidente.
- Status de conector recebido por webhook expira em 24 h. Quando os webhooks
  param, um "instável" antigo ficava na tela por meses.

### Faturas

- Um resumo só (`summarizeCardStatements`) para `/bills`, CLI, MCP, chat e
  briefing. A fatura **fechada e ainda não vencida** contava como paga no
  CLI/MCP e sumia dos totais da tela, justo a próxima a pagar. O chat chamava de
  "em aberto" só o ciclo atual; o briefing usava a contagem de abertas como
  "vence em 7 dias".
- Removidos `GET /api/domain/metrics/bills/summary` e `getBillsSummaryMetrics`,
  sem consumidores.

### PWA e interface

- **O app congelava depois de ~6 telas.** O service worker interceptava o SSE de
  `/api/sync/events` e mantinha um stream aberto por página visitada até esgotar
  as conexões HTTP/1.1 do host. Streams agora passam direto para a rede.
- Valores dos cards do painel escalam com a largura e não estouram mais no
  celular; o painel de análise não passa da tela.
- Insights formatam reais e BTC em pt-BR; os filtros de transação estão em
  português; os avisos ganharam respiro até o título; `/connect` usa grade 2×2
  no celular.
- O painel deixou de repetir três consultas que o SSR já trazia.

## 0.1.7 — 2026-09-21 — auditoria de setembro

Rodada sobre os seis relatórios em `docs/audit-reports/`. Quatro ondas, cada uma
mergeada na main só depois de `pnpm lint`, `pnpm test`, `pnpm build` e o
scanner de segredos passarem. A suíte saiu de **261 para 479 testes** — cada
correção de matemática ou heurística entrou com teste vermelho antes.

### Segurança

- **O app passa a ter porta.** Até aqui nenhuma das 133 rotas de `/api` tinha
  autenticação: quem alcançasse a porta 3000 lia o extrato inteiro, criava
  transação e puxava os segredos de `/api/settings/secrets`. A única defesa era a
  rede. `proxy.ts` nega por padrão; a lista de exceções tem cinco entradas, cada
  uma com o motivo escrito, e `proxy.test.ts` trava essa lista.
  **`APP_PASSWORD` agora é obrigatória** — sem ela o app nega tudo, inclusive a
  tela de login.
- `GET /api/webhooks/pluggy` exige `X-INTERNAL-API-KEY`. Devolvia `itemId` de
  cada conexão a quem pedisse, e precisa ficar fora do porteiro porque a Pluggy
  não faz login.
- `ensureInternalApiKey` compara em tempo constante.
- Corrida no processamento de webhook fechada no ponto certo — o processador, não
  só o enfileiramento. Dois reenvios simultâneos rodavam `handleWebhookEvent` em
  paralelo sobre o mesmo item.
- `POST /api/domain/transactions/create` valida com zod e arredonda para centavo
  antes de virar `Decimal`.
- `docker-compose.yml` saiu do git (o CasaOS o reescreve com segredo literal) e
  231 commits foram reescritos para tirar endereço de infraestrutura do
  histórico. Ver `docs/security.md`.

### Matemática financeira

- **Euro não é dólar.** A conversão estava copiada em cinco lugares, sempre como
  "se não é BRL, multiplica pela cotação do dólar". 100 EUR viravam 500 BRL.
- **Stablecoin não era convertida.** A alocação comparava com `"USD"` literal, e
  `normalizeCurrencyCode` devolve `"USDT"` inalterado: 1000 USDT entravam no
  patrimônio como 1000 BRL.
- **Dívida de cartão contava como ativo.** A Pluggy modela a fatura como saldo
  positivo, e `assetsTotal` somava toda conta positiva.
- Faturas em dólar somavam junto com as em real no resumo de `/bills`.
- A fatura que vence **hoje** sumia dos totais de 7 e 30 dias.
- Cenário não acumulava: um evento de +10.000 em novembro sumia em dezembro.
- "6 meses" mostrava sete barras; período desconhecido virava "desde sempre".
- O último dia da janela de comparação vazava para o mês seguinte.
- "Este mês" queria dizer coisas diferentes no Dashboard e no Fechamento Mensal.
- Projeção de gasto variável dividia por 3 mesmo para quem tem um mês de extrato.

### Heurísticas

- "Uber em 01/12" era lido como parcela 1 de 12, e o motor projetava doze Ubers.
- Parcela repassada em duplicidade pelo banco duplicava a série inteira.
- Transferência entre contas próprias entrava como gasto e estourava o orçamento
  da categoria "Transferências" — e, do outro lado, virava "possível salário".
- **Spam de notificação:** os alertas eram disparados a cada abertura da Inbox.
  Agora há trava de idempotência (`NotificationDelivery`), com a chave carregando
  o mês.
- Salário quinzenal e adiantamento 40/60 tinham o segundo pagamento descartado.
- Juros do rotativo, IOF e multa viravam "assinatura".
- Regra ancorada no dia 31 virava dia 28 para sempre depois de um fevereiro.

### UI

- `/cash-flow` e `/portfolio` ganharam fronteira de `Suspense`.
- `error.tsx` local em `/cash-flow`, `/transactions`, `/portfolio` e `/crypto`:
  antes, uma exceção nelas derrubava o layout inteiro.
- `/transactions` tinha sincronização em duas vias entre URL e estado — o cursor
  pulava ao digitar. A URL virou fonte única.
- Monólitos quebrados: `/transactions` 1557 → 1026 linhas, `/cash-flow` 697 → 334.

### Dois achados do relatório que não se confirmaram

- O `Content-Type` ausente em `/crypto` não quebrava nada: o handler usa
  `request.json()`, que não checa o header. Adicionado por higiene.
- O drift de data em recorrência não tinha o mecanismo descrito —
  `occurrenceDatesInMonth` não reatribui a âncora a cada iteração. O problema
  real era outro e está corrigido com `anchorDay`.

## Unreleased
- Contas: o limite de cada cartão de crédito e a soma dos limites entram na tela de `/accounts`. O dado sempre chegava — `creditData` vem em todo `GET /accounts` da Pluggy e era gravado cru em `PluggyPayloadSnapshot` desde o primeiro sync — mas nunca subia para o domínio. Agora sobe (`PluggyAccountRecord` e `DomainAccount`), com a data do conector ao lado do número. Cartão que o banco reporta com limite `0` (o Ourocard) fica **fora** da soma e é nomeado na tela: contar como zero faria o total parecer completo sem ser. `disaggregatedCreditLimits` é ignorado de propósito — no payload real do Nubank as linhas repetem o mesmo limite por modalidade e por cartão adicional, e somá-las daria um limite quatro vezes maior. Backfill em `scripts/backfill-credit-data.ts` preenche o histórico sem chamar a Pluggy.
- CasaOS: o ícone do app apontava para `raw.githubusercontent.com/Thierrycast/gravel/main/public/icon.png`, que devolve **404** porque o repositório é privado — o tile aparecia com o placeholder genérico do CasaOS. Substituído pelos bytes de `public/icon.png` reduzidos a 96×96 e embutidos como `data:image/png;base64` nos três campos do compose (`services.gravel.labels.icon`, `x-casaos.icon`, `x-casaos.thumbnail`). Regra do lab: ícone é CDN https **ou** data-URI — nunca URL de repo privado, que sempre nasce quebrada.
- Fixed persistence issue where the resolved institution name for "MeuPluggy" connections would revert to the generic name upon synchronization.
- Foreign-currency purchases are now ingested using the amount actually charged to the account (`amountInAccountCurrency`, BRL) instead of the raw foreign amount; added a backfill script for existing records.
- Card bill payment outflows ("Pagamento de fatura") are no longer counted as expenses — card purchases already count individually, so the payment leg was doubling monthly spending.
- Salary patterns are no longer split on `|`/`,`/`;` (bank descriptions contain those characters); a pattern like "Transferência Recebida|NAME" no longer turns every incoming transfer into income.
- Crypto totals are converted USDT→BRL inside `getOverviewMetrics`, so web UI, MCP, CLI and the portfolio page all report identical net worth (portfolio previously double-converted and showed ~4x the real crypto value).
- Self-transfer pair detection excludes both legs of same-amount/same-counterparty transfers from income, expenses and recurring detection.
- Prisma interactive transactions in sync projectors got explicit timeouts (P2028 crashes on large batches).
- Regenerated derived caches (portfolio history snapshots and detected recurring rules) that had been computed with the old classification.
