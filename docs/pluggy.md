# Pluggy - Integracao

## Objetivo atual
- Usar `Pluggy Connect` em `/connect` para autenticar no MeuPluggy com Google.
- Salvar cada `itemId` retornado pelo widget na base local.
- Agregar todos os itens salvos nas rotas de consulta de item, contas e transacoes.

## Variaveis de ambiente
- `PLUGGY_CLIENT_ID`
- `PLUGGY_CLIENT_SECRET`
- `PLUGGY_API_BASE` (padrao: `https://api.pluggy.ai`)
- `PLUGGY_API_KEY_HEADER` (padrao: `X-API-KEY`)
- `PLUGGY_AUTH_PATH` (padrao: `/auth`)
- `PLUGGY_CONNECT_TOKEN_PATH` (padrao: `/connect_token`)
- `PLUGGY_API_KEY_TTL_SECONDS` (padrao: `7200`)
- `PLUGGY_ENRICHMENT_API_BASE` (padrao: `https://enrichment-api.pluggy.ai`)
- `GRAVEL_CLIENT_USER_ID` (opcional; usado no Pluggy Enrichment, padrao local)
- `LOGO_DEV_PUBLISHABLE_KEY` (opcional; usado para URLs CDN de logos)
- `LOGO_DEV_SECRET_KEY` (opcional; somente backend para Logo.dev Describe)
- `LOGO_DEV_DOMAIN_OVERRIDES_JSON` (opcional; mapa JSON `{"merchant normalizado":"dominio.com"}`)

## Rotas Pluggy em uso
- `POST /api/pluggy/connect-token`
  - Gera o `connectToken` usado pelo widget.
- `GET /api/pluggy/items`
  - Lista os itens Pluggy salvos localmente.
- `POST /api/pluggy/items`
  - Salva ou atualiza um `itemId` retornado pelo widget.
- `GET /api/pluggy/item?itemId=...`
  - Busca detalhes do item no Pluggy.
  - Se `itemId` nao for enviado, retorna todos os itens salvos.
- `GET /api/pluggy/accounts?itemId=...`
  - Busca contas do item.
  - Se `itemId` nao for enviado, agrega contas de todos os itens salvos.
  - Retorna `items`, `totalItems`, `readyItems`, `totalAccounts`, `results` e `pagesByItem`.
- `GET /api/pluggy/transactions?itemId=...&page=1&pageSize=100`
  - Busca transacoes do item.
  - Se `itemId` nao for enviado, agrega transacoes de todos os itens salvos.
  - Retorna `items`, `totalItems`, `readyItems`, `totalAccounts`, `totalTransactions`, `results` e `pagesByAccount`.
- `GET /api/pluggy/accounts/:accountId`
  - Busca o detalhe de uma conta.
- `GET /api/pluggy/accounts/:accountId/balance`
  - Busca saldo em tempo real quando o conector suportar Open Finance.
- `GET /api/pluggy/transactions/:transactionId`
  - Busca o detalhe de uma transacao.
- `GET /api/pluggy/investments`
  - Agrega investimentos de todos os itens salvos.
- `GET /api/pluggy/investments/:investmentId`
  - Busca o detalhe de um investimento.
- `GET /api/pluggy/loans`
  - Agrega emprestimos de todos os itens salvos.
- `GET /api/pluggy/loans/:loanId`
  - Busca o detalhe de um emprestimo.
- `GET /api/pluggy/bills`
  - Agrega faturas de todos os itens salvos.
- `GET /api/pluggy/bills/:billId`
  - Busca o detalhe de uma fatura.
- `GET /api/pluggy/categories`
  - Lista categorias do Pluggy.
- `GET /api/pluggy/merchants?cnpj=...`
  - Faz enriquecimento de estabelecimento por CNPJ.
- `GET /api/pluggy/sync`
  - Retorna o resumo persistido no banco local.
- `POST /api/pluggy/sync`
  - Sincroniza dados do Pluggy para o banco local em modo `insert-only`.
- `POST /api/admin/enrichment/pluggy/run`
  - Envia lotes por tipo de conta ao Pluggy Categorize, persiste `TransactionEnrichment` e reprojeta os read models quando ha enriquecimento novo.
- `POST /api/admin/enrichment/pluggy/backfill`
  - Executa multiplos lotes de categorization para historico.
- `POST /api/admin/enrichment/logo/run`
  - Resolve dominios/logos de merchants conhecidos via cache `MerchantEnrichment`.
- `POST /api/admin/domain/rebuild-installments`
  - Recria agrupamentos logicos de compras parceladas.

## Fluxo
1. Abrir `/connect`.
2. O frontend chama `POST /api/pluggy/connect-token`.
3. O widget abre o fluxo do MeuPluggy.
4. No `onSuccess`, o frontend salva o `itemId` em `POST /api/pluggy/items`.
5. As rotas de leitura passam a agregar os itens salvos.

## Observacoes
- O projeto agora assume multiplos itens no MeuPluggy.
- O `itemId` nao fica mais no `.env`.
- A listagem de itens usada pelo app e local, porque o widget devolve o `itemId` no sucesso e esse identificador precisa ser mantido pela aplicacao.
- O `connectToken` e limitado ao widget. Dados de produtos continuam sendo buscados no backend com API key.
- No Pluggy atual deste projeto, `transactions` exige `accountId`, entao a API local primeiro resolve as contas e depois agrega as transacoes por conta.
- O plano de persistencia esta em `docs/pluggy-persistencia.md`.
- Pluggy Categorize e uma camada complementar: regras locais continuam tendo precedencia sobre categorias/merchant enriquecidos.
- O endpoint de enrichment pode estar indisponivel em contas sem feature premium; nesse caso o erro fica cacheado e a UI segue usando raw/provider/fallback.
