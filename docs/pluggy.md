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
- `GET /api/pluggy/transactions?itemId=...&page=1&pageSize=100`
  - Busca transacoes do item.
  - Se `itemId` nao for enviado, agrega transacoes de todos os itens salvos.

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
