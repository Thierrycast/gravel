# Integração Pluggy

O Gravel usa Pluggy/Open Finance para importar contas, faturas, transações,
investimentos e metadados de instituição.

> **Primeira vez configurando?** Siga o guia
> [Configuração: Pluggy + MeuPluggy](meu-pluggy-setup.md) — ele explica como
> criar as contas (MeuPluggy + Dashboard de dev), obter `client_id`/
> `client_secret` e autorizar o acesso aos seus bancos.

## Arquitetura da integração

```
Banco ──Open Finance──▶ MeuPluggy (proxy) ──conector──▶ API Pluggy ──▶ Gravel
```

Em desenvolvimento, os bancos são conectados ao [MeuPluggy](https://meu.pluggy.ai)
(serviço gratuito da Pluggy), que aparece para a API como um conector. O
Gravel autentica na API com `CLIENT_ID`/`CLIENT_SECRET` (`POST /auth` →
API Key de 2h, header `X-API-KEY`) e gera connect tokens de 30 min para o
widget da tela `/connect`.

## Pipeline de dados

Cada conexão autorizada vira um **Item** na Pluggy. A sincronização
(`/api/pluggy/sync`, `pnpm gravel sync trigger` ou o botão "sync" da UI):

1. Dispara `PATCH /items/{id}` para pedir dados frescos à instituição e
   acompanha o `executionStatus` (com lock por item, timeout e tratamento de
   MFA/reconexão/rate limit). **Items via MeuPluggy não aceitam `PATCH`**
   (respondem `MeuPluggy item cant be updated`); para eles o passo é pulado e o
   dado fresco vem do auto-sync da Pluggy;
2. Grava os payloads brutos (`PluggyPayloadSnapshot`) e os registros
   normalizados (`Pluggy*Record`);
3. Projeta os read models de domínio (`DomainAccount`, `DomainTransaction`,
   `DomainBill`, ...). Compras em moeda estrangeira usam
   `amountInAccountCurrency` (valor cobrado em BRL), nunca o valor na moeda
   original;
4. Recalcula caches derivados (recorrências, histórico de patrimônio,
   projeção).

## Tela de Conexões

`/connect` mostra:

- instituição (nome resolvido, com logo);
- status de sincronização;
- última sincronização;
- quantidade de contas;
- quantidade de importações;
- ação recomendada;
- detalhes técnicos com UUID do item.

## Estados relevantes

- `UPDATED`: dados sincronizados.
- `UPDATING`: sincronização em andamento.
- `OUTDATED`: atualização recomendada.
- `WAITING_USER_INPUT`/`WAITING_USER_ACTION`: precisa de ação do usuário
  (MFA ou novo consentimento).
- `LOGIN_ERROR`/`ERROR`: reconexão recomendada.

## Webhook (o caminho principal de atualização)

O webhook **não é opcional na prática**: é por ele que o dado chega em segundos.
A Pluggy roda auto-sync a cada 24/12/8h (conforme o plano) e, ao terminar,
dispara `item/updated` + `transactions/created`. Sem webhook registrado, o app
só vê dado novo quando o agendador interno passar — ver [Sincronização](sync.md).

`POST /api/webhooks/pluggy` autentica, grava o evento na fila
(`PluggyWebhookEvent`) e **responde 2XX em milissegundos**; o processamento roda
depois, via `after()`. Isso é requisito da Pluggy: ela espera resposta em menos
de **5 segundos**, senão trata como falha e reenvia o evento **até 9 vezes**
(3 imediatas, 3 após 15 min, 3 após 2 h).

### Registro

```bash
pnpm gravel sync webhook              # mostra o estado atual
pnpm gravel sync webhook --register   # cria/reconcilia
pnpm gravel sync webhook --register --force   # recria (rotação de secret)
```

O registro é feito por API (`POST /webhooks`) com `event: "all"` e o header
`X-Webhook-Secret` — headers só podem ser configurados por API, não pelo
Dashboard. O agendador reconcilia sozinho no boot, então em geral não é preciso
rodar nada à mão. Variáveis:

- `PLUGGY_WEBHOOK_URL` — URL pública HTTPS (a Pluggy rejeita http e localhost).
- `PLUGGY_WEBHOOK_SECRET` — 32 bytes (`openssl rand -hex 32`). Também pode ser
  gravado no cofre em `/settings → Segurança` em vez do `.env`.

Trocar o secret exige reregistrar com `--force`; o reconciliador detecta
divergência (o `GET /webhooks` devolve os headers gravados) e recria sozinho, mas
só quando roda.

### Eventos tratados

| Evento | O que o Gravel faz |
|---|---|
| `item/created`, `item/updated` | `GET /items/{id}`, sync incremental do item, reprojeção |
| `item/login_succeeded` | atualiza estado; não relê (a coleta ainda está em curso) |
| `item/error` | grava o motivo em `PluggyItem.syncError` e notifica |
| `item/waiting_user_input` / `waiting_user_action` | marca "precisa reconectar" e notifica |
| `item/deleted` | marca a conexão como removida (mantém o histórico já ingerido) |
| `transactions/created` | busca **só o lote novo** via `createdAtFrom` do próprio evento |
| `transactions/updated` | relê por `ids` (lotes de 500) e faz upsert |
| `transactions/deleted` | apaga os registros e os read models correspondentes |
| `connector/status_updated` | grava ONLINE/UNSTABLE/OFFLINE para a UI avisar |

Eventos de pagamento (`payment_intent/*`, `smart_transfer_*`) são recebidos e
ignorados de propósito — registramos `all` para não perder evento novo.

### Idempotência e diagnóstico

O `eventId` é único em `PluggyWebhookEvent`, então reenvio da Pluggy responde
`{ ok: true, skipped: true }` sem reprocessar. Um evento que falhe fica na fila e
o agendador tenta de novo (até 5 tentativas).

`GET /api/webhooks/pluggy` (na LAN, com `X-INTERNAL-API-KEY`) lista os últimos
eventos e o estado de cada um — é o primeiro lugar a olhar quando "o dado não
atualiza".

**Entrega recusada por secret aparece em `lastRejection`.** Isso existe porque um
401 aqui é indistinguível de silêncio: a Pluggy tenta 9 vezes, desiste, e antes
disso nada no app contava que o dado tinha parado de chegar — a fila ficava
vazia, e fila vazia parece "a Pluggy não mandou nada" quando na verdade ela
mandou e foi recusada. Dois motivos possíveis:

| `reason` | O que aconteceu | Conserto |
|---|---|---|
| `sem-header-provavel-registro-pelo-painel` | A Pluggy bateu sem `X-Webhook-Secret`. O Dashboard dela **não deixa definir headers** — quem cadastra por lá nunca envia o header. | Registrar pela API: `pnpm gravel sync webhook --register` |
| `secret-divergente` | O header veio, mas não bate. Secret rotacionado de um lado só. | `pnpm gravel sync webhook --register --force` |

Cadastrar a URL pelo Dashboard **não é suficiente** — ela fica registrada, a
Pluggy entrega, e toda entrega leva 401. O registro tem que passar pela API, e é
o que o reconciliador faz sozinho no boot assim que `PLUGGY_CLIENT_SECRET` for
uma credencial real (com placeholder ele desiste cedo e loga
`pluggy-nao-configurada`).

### Entregar não é o mesmo que funcionar

São duas falhas diferentes, em dois lugares diferentes, e confundi-las custa
tempo:

1. **A entrega falha** — a Pluggy bate e leva 401/404/timeout. O evento nunca
   entra na fila. Sintoma: `PluggyWebhookEvent` sem registros novos, e
   `lastRejection` preenchido se foi por secret. Olhar: Funnel, Traefik, secret.
2. **A entrega dá certo e o processamento falha** — o evento entra na fila com
   `SUCCESS` na recepção e depois vira `ERROR`. Sintoma: eventos recentes na
   fila com `status: ERROR` e `attempts: 5`. Olhar: o campo `error` do evento.

O caso 2 é o mais enganoso, porque tudo *parece* certo: a URL responde, a Pluggy
não reclama, o webhook aparece registrado. Mas `item/created`/`item/updated`
mandam o app fazer `GET /items/{id}` **de volta na Pluggy** — e isso usa
`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`. Com credencial inválida, a Pluggy
recusa, o evento tenta 5 vezes e morre. O dado bancário nunca chega, mesmo com a
cadeia de rede impecável.

Um sinal que separa os dois na hora: `connector/status_updated` continua
passando, porque é o único evento que **não** precisa chamar a Pluggy de volta.
Fila com `connector/status_updated` em SUCCESS e `item/updated` em ERROR é
assinatura de credencial recusada, não de problema de rede.

```bash
pnpm gravel sync webhook     # estado do registro (caso 1)
# caso 2: GET /api/webhooks/pluggy na LAN, e olhar o `error` dos eventos
```

### Exposição no lab (Tailscale Funnel + Traefik)

A única porta pública é o Tailscale Funnel, compartilhada por vários serviços;
o webhook entra como sub-rota:

```
https://<host-publico>/hooks/pluggy   (só POST)
   → Traefik (entrypoint funnel) → replacePath → /api/webhooks/pluggy
```

Configurado em `<appdata>/traefik-v3/config/dynamic/funnel-routes.yml`, com
rate limit e limite de corpo. `Path` exato + `Method(POST)`: nada mais do Gravel
fica exposto (o `GET` de diagnóstico só responde em `<host>.lab.home`).

> **Filtrar pelo IP da Pluggy (52.67.145.81) não é possível aqui.** O tailscaled
> entrega no loopback e não repassa o IP do cliente — o Traefik vê sempre
> `127.0.0.1`. Medido em 2026-08-07. O controle de acesso é o secret no header.

## Endpoints da Pluggy usados (e prazos)

| Uso | Endpoint |
|---|---|
| Auth / connect token | `POST /auth`, `POST /connect_token` (com `webhookUrl`) |
| Items | `GET /items/{id}`, `PATCH /items/{id}`, `DELETE /items/{id}` |
| Contas e saldo | `GET /accounts`, `GET /accounts/{id}/balance` (tempo real) |
| **Transações** | **`GET /v2/transactions`** — cursor `after`, 500/página, filtros `createdAtFrom` \| `dateFrom`/`dateTo`, `ids` (máx. 500) |
| Faturas, investimentos, empréstimos | `GET /bills`, `GET /investments`, `GET /loans` |
| Categorias | `GET /categories`, `PATCH /transactions/{id}` (devolve a correção) |
| Merchants | `GET /merchants?cnpj=a,b,c` (lote) |
| Perfil | `GET /identity`, `GET /consents` |
| Webhooks | `GET/POST/PATCH/DELETE /webhooks` |
| Enriquecimento | `POST /recurring-payments`, `POST /behavior-analysis` (enrichment-api) |
| Renda (opcional) | `POST /income` (insights-api) — pode não estar habilitado no plano |

> ⚠️ **`GET /transactions` (paginado por página) foi descontinuado e será
> removido em 2026-12-31.** O Gravel já usa `GET /v2/transactions`; a função
> antiga (`fetchTransactions`) permanece marcada como deprecada só para
> comparação durante a migração.
>
> `createdAtFrom` e `dateFrom` são **mutuamente exclusivos** — a escolha entre os
> dois é feita em `lib/ingestion/transaction-window.ts`.

## Observações sobre os dados

- A categorização automática da Pluggy erra com frequência; o Gravel aplica a
  própria classificação de fluxo de caixa e regras (`CategoryRule`) por cima.
- Alguns provedores duplicam lançamentos de pagamento de fatura (mesmo
  dia/valor com IDs diferentes) — o motor de faturas deduplica por dia+valor.
- Faturas podem chegar com resíduos de centavos (ex.: `0.0039`); valores
  abaixo de R$ 0,01 são tratados como fatura fechada.
