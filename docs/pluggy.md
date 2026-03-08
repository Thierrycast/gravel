# Pluggy - Integracao

## Glossario
- Product: dados padronizados de uma instituicao (Accounts, Credit Cards, Investments, Identity, Transactions).
- Connector: integracao com instituicao para recuperar produtos.
- Item: conexao criada pelo usuario via um connector; ponto de acesso aos produtos.

## Chaves e tokens
- API key: criada via autenticacao com `CLIENT_ID` e `CLIENT_SECRET`. Expira em 2 horas.
- Connect Token: criado com a API key. Expira em 30 minutos e serve para o widget no client.

Regras importantes:
- Connect Token tem acesso limitado: `GET /items/:id` e acesso reduzido a `GET /accounts?itemId`.
- Connect Token nao serve para endpoints completos de produtos (retorna 403).
- Um Connect Token novo nao acessa dados criados com outro token.
- Para chamadas completas de produtos (transactions, investments, etc), use API key no servidor.

## Variaveis de ambiente
- `PLUGGY_CLIENT_ID`
- `PLUGGY_CLIENT_SECRET`
- `PLUGGY_ITEM_ID` (item unico da conta pessoal)
- `PLUGGY_API_BASE` (padrao: https://api.pluggy.ai)
- `PLUGGY_API_KEY_HEADER` (padrao: X-API-KEY)
- `PLUGGY_AUTH_PATH` (padrao: /auth)
- `PLUGGY_CONNECT_TOKEN_PATH` (padrao: /connect_token)
- `PLUGGY_API_KEY_TTL_SECONDS` (padrao: 7200)

Arquivo de exemplo: `.env.example`.

## Setup rapido (exemplo Next.js)
1. Criar `.env` a partir de `.env.example` e preencher `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
2. Instalar dependencias.
3. Rodar `pnpm dev` e acessar `http://localhost:3000`.

Dependencias do widget (quando formos para UI):
- `react-pluggy-connect` no client.
- `pluggy-sdk` no server para gerar Connect Token.

## Endpoints internos
- `POST /api/pluggy/api-key`
  - Retorna apenas `{ apiKey }` usando cache local.
- `POST /api/pluggy/connect-token`
  - Cria uma API key e em seguida um Connect Token.
  - Aceita um body opcional para configurar o token.
- `GET /api/pluggy/item`
  - Retorna o item configurado em `PLUGGY_ITEM_ID`.
- `GET /api/pluggy/accounts`
  - Retorna contas do item configurado (status precisa ser `UPDATED`).
- `GET /api/pluggy/transactions?page=1&pageSize=100`
  - Retorna transacoes do item configurado (status precisa ser `UPDATED`).

Body opcional (exemplo):
```
{
  "webhookUrl": "https://example.com/webhook",
  "clientUserId": "meu-user-id",
  "oauthRedirectUrl": "https://example.com/redirect",
  "avoidDuplicates": true,
  "itemId": "item_123"
}
```

## Fluxo recomendado (uso pessoal)
1. Backend gera API key com `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
2. Backend gera Connect Token com a API key.
3. Frontend usa Connect Token no widget Pluggy Connect.
4. Armazenar `itemId` ao finalizar a conexao (evento `onSuccess`) para referencia futura.

## Uso pessoal com item unico
- Defina `PLUGGY_ITEM_ID` com o item criado no Pluggy.
- Para dados diarios, use os endpoints internos de contas e transacoes.
- Se o item nao estiver `UPDATED`, os endpoints retornam `409` com o status atual.

## Open Finance (conector unico)
- Vamos usar apenas conectores Open Finance via Pluggy Connect.
- IDs de conectores Open Finance geralmente sao `>= 600` (ex: Itau OF = 601).
- O fluxo de consentimento abre o login do banco em popup e depois retorna ao widget.
- O link de consentimento e de uso unico e expira rapido; evitar compartilhar em apps que previsualizam links.
- Sandbox de Open Finance: ver docs do Pluggy (sandbox open finance flow).

## Update mode
- Para atualizar um item, o Connect Token precisa ser gerado com o `itemId` alvo ou reutilizar o mesmo token que criou o item.
- A recomendacao no quickstart e gerar um token novo para cada atualizacao do ultimo item.

## Referencias do quickstart (Next.js)
- O quickstart oficial de Next.js usa `react-pluggy-connect` no client e `pluggy-sdk` no server para gerar Connect Token.
- Ver `frontend/nextjs/README.md` no repo oficial para o passo a passo e variaveis de ambiente.

## Observacoes
- Nunca expor `PLUGGY_CLIENT_SECRET` no client.
- Para chamadas completas de produtos, usar API key no servidor.
- Quando forem criados webhooks, registrar a URL e salvar `itemId` na base.
- A API key fica em cache em memoria no servidor com TTL (padrao 2h). Em restart, ela e gerada novamente.
