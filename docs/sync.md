# Sincronização e frescura dos dados

Como o dado bancário chega ao Gravel e o que fazer quando para de chegar.

## As quatro fontes de atualização

```
                        ┌─ webhook (segundos)  ← caminho principal
Banco ─▶ MeuPluggy ─▶ Pluggy ─┼─ agendador (30 min, configurável)
                        ├─ reconciliação diária (12 meses)
                        └─ botão "sync" na UI (manual)
```

1. **Webhook** — a Pluggy roda auto-sync a cada 24/12/8h (conforme o plano) e,
   ao terminar, notifica. O app relê só o que mudou e reprojeta. É o caminho
   normal: dado novo aparece na tela em segundos, sem ninguém pedir.
   Detalhes em [Pluggy → Webhook](pluggy.md#webhook-o-caminho-principal-de-atualização).
2. **Agendador interno** (`instrumentation.ts` → `lib/ingestion/scheduler.ts`) —
   rede de segurança para evento perdido. Tick de 60 s que decide o que venceu.
3. **Reconciliação diária** — relê 12 meses de transações e atualiza identidade e
   consentimentos. Corrige qualquer buraco acumulado.
4. **Manual** — botão de sync, `pnpm gravel sync trigger`, `POST /api/sync/trigger`.
   Único caminho que dispara `PATCH /items` (pedido explícito de dado fresco).

## Cadências

| Tarefa | Padrão | Onde muda |
|---|---|---|
| Sync incremental | **30 min** | `/settings → Sincronização` (`syncIntervalMinutes`) |
| Janela sem checkpoint | 30 dias | `/settings → Sincronização` (`syncLookbackDays`) |
| Saldo em tempo real | 15 min | `BALANCE_REFRESH_MS` |
| Reconciliação completa | 24 h | `RECONCILE_INTERVAL_MS` |
| Watchdog + dreno de webhooks | a cada tick (60 s) | `TICK_INTERVAL_MS` |

O intervalo é lido do banco a cada tick — mudar em `/settings` vale no próximo
minuto, sem restart.

## Incremental: como o app evita reler tudo

Cada conta tem um watermark em `OpsSyncCheckpoint`
(`provider=PLUGGY, resource=transactions, cursorKey=<accountId>`). O sync pede
`createdAtFrom = watermark − 24 h` (a sobreposição cobre diferença de relógio; os
upserts são idempotentes). Conta sem checkpoint cai na janela de
`syncLookbackDays`; `full: true` faz backfill de 12 meses.

A paginação é por cursor (`GET /v2/transactions`, 500 por página, campo `next`).

## Watchdog — por que ele existe

Entre 18/07/2026 e 07/08/2026 o auto-sync ficou **19 dias parado**: um
`OpsSyncRun` ficou preso em `RUNNING` (o processo morreu no meio) e a checagem de
"já tem sync rodando" desistia para sempre. Não havia erro, log nem alerta — só
dado velho.

Agora, a cada tick: run em `RUNNING` há mais de 30 min vira `ERROR`, e
`OpsSyncLock` expirado é apagado. Um processo morto atrasa um ciclo, não trava
todos.

## UI ao vivo (SSE)

`lib/sync-events.ts` publica eventos in-process; `GET /api/sync/events` os serve
por SSE (heartbeat de 25 s); `hooks/use-sync-stream.ts` invalida o React Query e
revalida os Server Components. Resultado: quando um webhook traz transação nova, a
tela atualiza sem recarregar e sem polling.

O polling de `use-sync-trigger` ficou como fallback (8 s), para o caso de o
stream cair.

## Diagnóstico — na ordem

```bash
# 1. O webhook está registrado e com o secret certo?
pnpm gravel sync webhook

# 2. Eventos estão chegando e sendo processados?
curl -s http://<servidor>:8421/api/webhooks/pluggy | jq

# 3. O agendador está vivo? O que rodou por último?
pnpm gravel sync tick --watchdog-only
pnpm gravel ops status

# 4. Alguma conexão precisa de ação humana?
curl -s http://<servidor>:8421/api/pluggy/connections/health | jq

# 5. Forçar um ciclo agora
pnpm gravel sync tick --force-sync
```

Sintomas e causas mais prováveis:

| Sintoma | Causa provável |
|---|---|
| Nenhum evento em `PluggyWebhookEvent` | webhook não registrado, ou a rota do Funnel caiu |
| Eventos com status `ERROR` e `attempts` subindo | erro no processamento — ver `error` na fila |
| Eventos `SUCCESS` mas dado velho | a Pluggy não sincronizou (ver `lastUpdatedAt` do item) |
| Sync nunca roda | run órfão travando (o watchdog deve resolver; ver `ops status`) |
| `MeuPluggy item cant be updated` | esperado: MeuPluggy não aceita `PATCH`; não é falha |

## Notificações

Problema de conexão (MFA, credencial expirada, erro na instituição,
consentimento a menos de 15 dias do vencimento) gera notificação por
webhook/Telegram/push, além do banner na UI
(`components/connection-alerts-banner.tsx`). Sem isso o usuário só descobriria
quando a sincronização já tivesse parado.

---

*Documentado por: Claude Code (claude-opus-5) — 2026-08-07.*
