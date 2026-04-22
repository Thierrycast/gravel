# Oportunidades de Integracao

Investigacao sobre integracoes atuais, APIs usadas e oportunidades que combinam
com a premissa do Gravel Finance.

## Premissa do produto

O Gravel e um cockpit financeiro pessoal local-first. O produto sincroniza dados
financeiros de provedores externos, persiste tudo em SQLite, projeta registros
normalizados para modelos de dominio e usa esses modelos para dashboards,
analises, projecoes e pacotes de contexto para LLMs.

Essa premissa favorece integracoes que:

- Aumentem a completude da visao patrimonial.
- Melhorem frescor e confiabilidade dos dados sincronizados.
- Expliquem variacoes de saldo, custo, rendimento e risco.
- Enriquecam categorizacao, comerciantes e recorrencias.
- Preservem o desenho local-first e auditavel.

## Integracoes atuais

### Pluggy Open Finance

Arquivos principais:

- `lib/integrations/pluggy.ts`
- `lib/pluggy-sync.ts`
- `components/pluggy-connect-client.tsx`
- `app/api/pluggy/*`
- `app/api/providers/pluggy/*`

Uso atual:

- Pluggy Connect para criar conexoes.
- Persistencia local de `itemId`.
- Consulta de item, contas, saldo, transacoes, categorias, merchants, faturas,
  investimentos e emprestimos.
- Snapshots brutos insert-only em `PluggyPayloadSnapshot`.
- Records normalizados em tabelas `Pluggy*Record`.
- Projecao para `DomainAccount`, `DomainTransaction`, `DomainBill`,
  `DomainInvestment`, `DomainCategory` e `DomainMerchant`.

Pontos fortes:

- Boa separacao entre API externa, ingestao e dominio.
- Paginacao ja considerada.
- Status de item ja aparece na UI de conexoes.
- Enriquecimento de merchants por CNPJ ja existe.
- Modelo insert-only permite reprocessar sem rebater no provedor.

Lacunas:

- Nao ha webhook Pluggy para reagir a `item/updated` e eventos de transacao.
- Fluxo de update/reconexao de item ainda nao esta completo no produto.
- Identity do Pluggy nao e usada.
- `fetchInvestmentTransactions` existe no cliente, mas nao entra no sync.
- Emprestimos sao persistidos como record do provedor, mas nao possuem um
  `DomainLoan` dedicado.
- Algumas informacoes ricas de investimento ficam em payload/metadata ou nem sao
  capturadas em read model.

### Binance

Arquivos principais:

- `lib/integrations/binance.ts`
- `lib/binance-sync.ts`
- `app/api/binance/*`
- `app/api/providers/binance/*`
- `lib/domain/crypto-math.ts`

Uso atual:

- Spot account.
- Saldos por ativo.
- Trades por simbolo.
- Precos atuais via ticker.
- Exchange info para escolher pares.
- Calculo de custo medio movel, PnL realizado e nao realizado.

Pontos fortes:

- Assinatura HMAC e ajuste de server time ja implementados.
- Deduplicacao por trade e snapshots de saldo/preco.
- Modelagem suficiente para portfolio crypto basico.
- UI ja apresenta custo medio e PnL.

Lacunas:

- Depositos e saques nao entram no custo/auditoria.
- Dust conversion, dividendos/airdrops e transferencias internas nao entram.
- User Data Stream nao e usado para eventos em tempo real.
- Trades dependem de simbolos rastreados, o que pode deixar historico incompleto.

### Cambio

Arquivos principais:

- `lib/exchange-rate.ts`
- `lib/currency-context.tsx`

Uso atual:

- USD/BRL via AwesomeAPI.
- Fallback server-side para Exchangerate-API.
- Fallback por snapshots Binance e valor fixo.

Lacunas:

- O client busca AwesomeAPI diretamente, duplicando a logica server-side.
- Nao ha serie historica de cambio para relatorios, benchmarks ou auditoria.
- Nao ha fonte oficial como PTAX/BCB para consolidacao historica.

### CLI e IA

Arquivos principais:

- `cli/commands/snapshot.ts`
- `cli/collectors/anomalies.ts`
- `cli/commands/export.ts`
- `cli/commands/prompt-pack.ts`

Uso atual:

- Snapshot financeiro para LLM.
- Export de entidades.
- Coleta de anomalias.
- Empacotamento de contexto do projeto.

Oportunidade:

- Transformar as novas integracoes em insumos para analises mais fortes:
  benchmark CDI/IPCA, explicacao de variacoes crypto, alertas de vencimento,
  risco de passivos e sugestoes de categorizacao.

## Oportunidades internas

### 1. Webhooks Pluggy

Motivo:

Pluggy recomenda que o cliente escute eventos de dados e sincronize a base local
quando a conexao ou as transacoes mudarem. Isso reduz sync manual e melhora
frescor.

Feature:

- `POST /api/webhooks/pluggy`.
- Tabela `ProviderWebhookEvent` ou equivalente com `eventId` unico.
- Processamento idempotente.
- Reacao a:
  - `item/created`
  - `item/updated`
  - `item/error`
  - `item/waiting_user_input`
  - `item/deleted`
  - `transactions/created`
  - `transactions/updated`
  - `transactions/deleted`
- Atualizacao da tela de Sync/Conexoes com origem `webhook`.

Impacto:

- Dados mais atuais.
- Menos execucoes manuais pesadas.
- Melhor observabilidade de falhas de conexao.
- Base para automacoes futuras.

Risco:

- Precisa de URL publica em ambiente real.
- Precisa responder rapido e processar pesado de forma assincrona.
- Deve evitar duplicidade de eventos.

### 2. Update/reconexao de item Pluggy

Motivo:

Quando um item entra em `LOGIN_ERROR`, `INVALID_CREDENTIALS`, `OUTDATED` ou
`WAITING_USER_INPUT`, o usuario precisa atualizar a conexao existente em vez de
criar outra.

Feature:

- `POST /api/pluggy/connect-token` aceitar `itemId` opcional.
- UI em `/connect` abrir Pluggy Connect em modo update.
- Acao por item: atualizar credenciais, resolver MFA ou forcar nova coleta.
- Mostrar `lastUpdatedAt`, `nextAutoSyncAt` e `executionStatus` quando
  disponiveis.

Impacto:

- Menos duplicidade de conexoes.
- Recuperacao melhor de contas quebradas.
- UX mais clara para MFA e credenciais expiradas.

### 3. Identity Pluggy

Motivo:

Identity ajuda a entender titularidade, validar agrupamento por pessoa e preparar
cenarios familiares ou multiusuario no futuro.

Feature:

- Cliente `fetchIdentity(itemId)`.
- Record bruto `PluggyIdentityRecord`.
- Read model opcional `DomainIdentity`.
- Tela ou secao de diagnostico de titularidade.

Impacto:

- Melhor confiabilidade de ownership.
- Agrupamento de contas por pessoa.
- Base para alertas de inconsistencias.

Risco:

- Dados pessoais sensiveis. Deve haver mascaramento, minimizacao e cuidado para
  nao exportar PII por padrao nos snapshots de LLM.

### 4. Investimentos Pluggy enriquecidos

Motivo:

O produto ja possui tela de investimentos, mas pode extrair mais valor dos dados
que Pluggy disponibiliza.

Feature:

- Sincronizar transacoes de investimento.
- Capturar campos como emissor, vencimento, taxa, rentabilidade mensal/12m/anual
  quando disponiveis.
- Mostrar agenda de vencimentos.
- Calcular rendimento por produto e grupo.
- Comparar com CDI/IPCA quando houver benchmark macro.

Impacto:

- Patrimonio deixa de ser apenas saldo e passa a explicar performance.
- Melhor decisao sobre vencimentos, concentracao e liquidez.

### 5. DomainLoan

Motivo:

Emprestimos entram no sync, mas nao tem dominio proprio. Hoje passivos sao
tratados de forma dispersa.

Feature:

- Criar `DomainLoan`.
- Projetar `PluggyLoanRecord` para dominio.
- Incluir parcelas, vencimentos, saldo devedor, produto, status e instituicao.
- Criar insights de passivos na projecao e portfolio.

Impacto:

- Visao patrimonial mais correta.
- Melhor previsao de caixa.
- Analise de risco de endividamento.

## Novas integracoes recomendadas

### 1. Banco Central / SGS / Focus

Dados uteis:

- CDI.
- Selic.
- IPCA.
- PTAX USD/BRL.
- Expectativas Focus para IPCA, Selic e cambio.

Features:

- Benchmark de investimentos contra CDI.
- Patrimonio real descontado por IPCA.
- Gastos por categoria corrigidos por inflacao.
- Cambio historico oficial para crypto em BRL.
- Alertas de reserva de emergencia contra juros/inflacao.

Notas:

- A API SGS publica series via endpoints JSON/CSV.
- Consultas longas podem exigir janelas de ate 10 anos.
- Para simplicidade, comecar com uma pequena camada `lib/integrations/bcb.ts`
  e cache local em tabela `MacroSeriesPoint`.

### 2. Binance Wallet API

Dados uteis:

- Historico de depositos.
- Historico de saques.
- Dust log.
- Dividendos/airdrops.
- Universal transfers, se aplicavel.

Features:

- Auditoria completa de movimentacao crypto.
- PnL mais confiavel quando ha deposito/saque externo.
- Explicacao de diferenca entre saldo atual e trades conhecidos.
- Alertas de historico incompleto.

Notas:

- Depositos e saques possuem janelas de consulta e limites proprios.
- Alguns endpoints sao caros em weight, entao devem ser sincronizados com
  checkpoints e backfill controlado.

### 3. Brapi para B3

Dados uteis:

- Cotacoes de acoes, FIIs, ETFs e BDRs.
- Historico OHLCV.
- Dividendos.
- Fundamentos.
- Indicadores macro simples.

Features:

- Ativos manuais de B3.
- Enriquecimento de investimentos que venham do Pluggy sem cotacao detalhada.
- Dividendos futuros/passados.
- Comparativo de carteira contra IBOV/CDI.

Notas:

- Pode exigir token para cobertura completa.
- Deve entrar como provider separado (`BRAPI` ou `MARKET_DATA`) para nao
  misturar posicao de custodia com dados de mercado.

### 4. OpenAI / LLM local via CLI

Dados uteis:

- Snapshot financeiro ja existe.
- Anomalias ja existem.

Features:

- "Analise este mes" gerada a partir do bundle local.
- Explicacao de variacoes relevantes.
- Sugestao de regras de categorizacao.
- Detector de assinaturas e renegociacoes.

Notas:

- Evitar enviar PII por padrao.
- Criar redacao estruturada e auditavel, com referencias aos registros internos.
- Pode ser CLI-first antes de entrar na UI.

### 5. Pluggy Payments

Dados uteis:

- PIX.
- Boleto.
- Pagamentos agendados.
- Smart transfers.

Features possiveis:

- Pagar fatura/conta a partir da tela de bills.
- Agendar pagamentos recorrentes.
- Fechar fluxo de "detectar conta -> projetar -> pagar".

Recomendacao:

Nao priorizar agora. Essa integracao muda o produto de leitura/analise para
movimentacao financeira. Antes disso, o projeto precisa de autorizacao forte,
auditoria, trilha de confirmacao, modelo de usuario e protecoes adicionais.

## Priorizacao sugerida

| Prioridade | Oportunidade | Motivo | Complexidade | Risco |
|---|---|---|---|---|
| P0 | Webhooks Pluggy | Frescor e confiabilidade dos dados | Media | Medio |
| P0 | Update/reconexao Pluggy | Recupera conexoes quebradas e evita duplicidade | Baixa/Media | Baixo |
| P1 | Investimentos Pluggy enriquecidos | Aumenta valor da tela de patrimonio | Media | Baixo |
| P1 | DomainLoan | Melhora passivos e projecao | Media | Medio |
| P1 | Binance Wallet API | Corrige lacunas de custo e movimentacao crypto | Media/Alta | Medio |
| P2 | BCB SGS/Focus | Benchmarks brasileiros e contexto macro | Baixa/Media | Baixo |
| P2 | Brapi/B3 | Completa carteira brasileira fora do Open Finance | Media | Medio |
| P3 | Analise por LLM na UI | Aproveita CLI e snapshots existentes | Media | Medio |
| P4 | Pluggy Payments | Expande para movimentacao financeira | Alta | Alto |

## Roadmap proposto

### Fase 1: confiabilidade de sincronizacao

- Criar endpoint de webhook Pluggy.
- Persistir eventos com idempotencia.
- Disparar sync incremental por evento.
- Melhorar tela de Sync com origem do trigger.
- Implementar update/reconexao de item pelo Connect Widget.

### Fase 2: profundidade patrimonial

- Projetar emprestimos para `DomainLoan`.
- Enriquecer investimentos com transacoes, vencimentos e rentabilidade.
- Incluir loans e vencimentos em Portfolio e Projecao.

### Fase 3: crypto auditavel

- Adicionar depositos e saques Binance.
- Adicionar dust/dividends quando aplicavel.
- Criar alertas de custo incompleto.
- Atualizar calculo de PnL com eventos nao-trade.

### Fase 4: benchmarks brasileiros

- Integrar BCB SGS para CDI, Selic, IPCA e PTAX.
- Criar cache historico local.
- Adicionar benchmarks em investimentos, patrimonio e relatorios.

### Fase 5: mercado e inteligencia

- Avaliar brapi para ativos B3, dividendos e fundamentos.
- Expandir CLI de analise para recomendacoes auditaveis.
- So depois avaliar Pluggy Payments.

## Criterios de decisao

Priorizar uma integracao quando ela atender pelo menos dois criterios:

- Reduzir trabalho manual do usuario.
- Corrigir uma lacuna de confiabilidade dos dados.
- Melhorar analise de patrimonio, risco ou fluxo de caixa.
- Aproveitar dados ja parcialmente sincronizados.
- Manter baixo risco operacional e de seguranca.

Evitar ou adiar quando:

- Exigir movimentacao financeira sem autenticacao/autorizacao robusta.
- Depender de dados sensiveis sem politica de minimizacao.
- Criar custo recorrente alto para pouco ganho no produto.
- Misturar dado de custodia com dado de mercado sem separar provedores.

## Fontes consultadas

- Pluggy Item: https://docs.pluggy.ai/docs/item
- Pluggy Webhooks: https://docs.pluggy.ai/docs/webhooks
- Pluggy Updating an Item: https://docs.pluggy.ai/docs/updating-an-item
- Pluggy Transactions: https://docs.pluggy.ai/docs/transactions
- Binance Account Endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
- Binance User Data Stream: https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream
- Binance Deposit History: https://developers.binance.com/docs/wallet/capital/deposite-history
- Binance Withdraw History: https://developers.binance.com/docs/wallet/capital/withdraw-history
- Binance DustLog: https://developers.binance.com/docs/wallet/asset/dust-log
- BCB SGS overview: https://brazilvisible.org/docs/apis/banco-central/sgs-indices/
- BacenData docs: https://bacendata.com/docs
- Brapi docs: https://brapi.dev/docs
