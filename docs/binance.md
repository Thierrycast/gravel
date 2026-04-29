# Binance - Integração

## Objetivo atual
- Ler Spot account, ativos e trades da Binance.
- Persistir ativos, trades e snapshots de preço no banco local.
- Atualizar o preço atual dos ativos que voce possui.

## Variáveis de ambiente
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `BINANCE_API_BASE` (padrão: `https://api.binance.com`)
- `BINANCE_RECV_WINDOW` (padrão: `5000`)

## Endpoints Binance implementados
- `GET /api/binance/account`
  - Busca a conta Spot ao vivo na Binance.
- `GET /api/binance/assets`
  - Retorna os ativos persistidos no banco com ultimo saldo e ultimo preço.
- `GET /api/binance/trades`
  - Retorna trades persistidos.
  - Filtros: `symbol`, `asset`, `take`
- `GET /api/binance/symbols`
  - Retorna os simbolos rastreados para coleta de trades.
- `GET /api/binance/prices/update`
  - Atualiza o preço atual dos ativos possuidos.
- `GET /api/binance/sync`
  - Mostra o resumo persistido no banco.
- `POST /api/binance/sync`
  - Executa sync Binance -> banco.

## Rotas genericas
- `GET /api/crypto`
  - Quando houver dados Binance persistidos, passa a responder com eles.

## Persistencia
- `BinanceAccountSnapshot`
  - Snapshot bruto da resposta de `GET /api/v3/account`
- `BinanceAssetRecord`
  - Catalogo de ativos ja vistos
- `BinanceAssetBalanceSnapshot`
  - Snapshot insert-only de saldo por ativo
- `BinanceAssetPriceSnapshot`
  - Snapshot insert-only do preço atual por ativo
- `BinanceTradeRecord`
  - Trades persistidos por `symbol + tradeId`
- `BinanceSyncRun`
  - Histórico das sincronizacoes

## Importante sobre trades
- A Binance Spot não oferece um endpoint global de trades de toda a conta.
- O endpoint oficial `GET /api/v3/myTrades` exige `symbol`.
- Por isso a integração usa simbolos rastreados:
  - pares inferidos a partir dos ativos possuidos
  - pares ja vistos nos trades persistidos
  - simbolos enviados manualmente no `POST /api/binance/sync`

## Exemplo de sync completo
```bash
curl -X POST http://localhost:3000/api/binance/sync \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## Exemplo de sync focado
```bash
curl -X POST http://localhost:3000/api/binance/sync \
  -H 'Content-Type: application/json' \
  -d '{
    "resources": ["trades", "prices"],
    "symbols": ["BTCUSDT", "ETHUSDT"]
  }'
```

## Atualizar precos atuais
```bash
curl http://localhost:3000/api/binance/prices/update
```


## Calculos de dominio ja preparados
- `GET /api/domain/metrics/crypto/assets`
  - custo medio móvel por ativo, PnL realizado e não realizado, filtros por periodo e ativo
- `GET /api/domain/metrics/crypto/overview`
  - resumo consolidado da carteira cripto, alocacao, melhor e pior ativo

## Fontes
- Spot account e `myTrades`:
  - https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
- Market data:
  - https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints
- Exchange info e server time:
  - https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-endpoints
