# Pluggy - Integracao

## Glossario
- Product: dados padronizados de uma instituicao (Accounts, Credit Cards, Investments, Identity, Transactions).
- Connector: integracao com instituicao para recuperar produtos.
- Item: conexao criada pelo usuario via um connector; ponto de acesso aos produtos.

## Chaves e tokens
- API key: criada via autenticacao com `CLIENT_ID` e `CLIENT_SECRET`. Expira em 2 horas.
- Para chamadas completas de produtos (transactions, investments, etc), use API key no servidor.

## Variaveis de ambiente
- `PLUGGY_CLIENT_ID`
- `PLUGGY_CLIENT_SECRET`
- `PLUGGY_ITEM_ID` (item unico da conta pessoal)
- `PLUGGY_CONNECTOR_ID` (conector do meuPluggy)
- `PLUGGY_OAUTH_REDIRECT_URI` (opcional, para fluxo OAuth)
- `PLUGGY_API_BASE` (padrao: https://api.pluggy.ai)
- `PLUGGY_API_KEY_HEADER` (padrao: X-API-KEY)
- `PLUGGY_AUTH_PATH` (padrao: /auth)
- `PLUGGY_API_KEY_TTL_SECONDS` (padrao: 7200)

Arquivo de exemplo: `.env.example`.

## Endpoints internos
- `POST /api/pluggy/api-key`
  - Retorna apenas `{ apiKey }` usando cache local.
- `POST /api/pluggy/item/create`
  - Cria item com `PLUGGY_CONNECTOR_ID` (ou override via body).
- `GET /api/pluggy/item`
  - Retorna o item configurado em `PLUGGY_ITEM_ID` (ou `?itemId=`).
- `GET /api/pluggy/item/oauth?itemId=...`
  - Retorna `oauthUrl` quando o item exigir login OAuth.
- `GET /api/pluggy/accounts`
  - Retorna contas do item configurado (status precisa ser `UPDATED`).
- `GET /api/pluggy/transactions?page=1&pageSize=100`
  - Retorna transacoes do item configurado (status precisa ser `UPDATED`).

## Fluxo recomendado (uso pessoal)
1. Backend gera API key com `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
2. Criar Item com `PLUGGY_CONNECTOR_ID` (ou via `POST /api/pluggy/item/create`).
3. Se o item exigir OAuth, pegar o `oauthUrl` em `GET /api/pluggy/item/oauth?itemId=...` e abrir no navegador.
4. Usar o `itemId` criado como `PLUGGY_ITEM_ID`.

## Uso pessoal com item unico
- Defina `PLUGGY_ITEM_ID` com o item criado no Pluggy (na resposta de criacao).
- Para dados diarios, use os endpoints internos de contas e transacoes.
- Se o item nao estiver `UPDATED`, os endpoints retornam `409` com o status atual.
- O `itemId` nao e o mesmo que `connectorId`.

## Open Finance (conector unico)
- Vamos usar apenas conectores Open Finance via Pluggy Connect.
- IDs de conectores Open Finance geralmente sao `>= 600` (ex: Itau OF = 601).
- O fluxo de consentimento abre o login do banco em popup e depois retorna ao app.
- O link de consentimento e de uso unico e expira rapido; evitar compartilhar em apps que previsualizam links.
- Sandbox de Open Finance: ver docs do Pluggy (sandbox open finance flow).

## MeuPluggy (proxy pessoal)
- O conector `MeuPluggy` (id 200) funciona como proxy e nao marca `isOpenFinance`.
- Os bancos conectados dentro do MeuPluggy podem ser Open Finance, mas o item retornado vem do proxy.

## Referencias
- Doc de OAuth v2 do Pluggy para fluxos sem widget (login em pop-up e callback). citeturn2open0

## Observacoes
- Nunca expor `PLUGGY_CLIENT_SECRET` no client.
- Para chamadas completas de produtos, usar API key no servidor.
- Quando forem criados webhooks, registrar a URL e salvar `itemId` na base.
- A API key fica em cache em memoria no servidor com TTL (padrao 2h). Em restart, ela e gerada novamente.
