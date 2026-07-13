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
   MFA/reconexão/rate limit);
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

## Webhook (opcional)

`POST /api/webhooks/pluggy` recebe eventos da Pluggy (ex.: `item/updated`) e
reprojeta o item correspondente sem esperar o próximo sync manual.

- Configure a URL do webhook no Dashboard da Pluggy apontando para
  `https://SEU_HOST/api/webhooks/pluggy`.
- Defina `PLUGGY_WEBHOOK_SECRET` no `.env`; o endpoint exige o header
  `X-Webhook-Secret` com o mesmo valor (comparação em tempo constante). Sem a
  variável, o endpoint aceita qualquer chamada — não deixe assim em produção.
- Idempotente por evento: o `id` do evento vira uma claim atômica em
  `DomainSyncState`, então retries da Pluggy não reprocessam o mesmo evento.

## Observações sobre os dados

- A categorização automática da Pluggy erra com frequência; o Gravel aplica a
  própria classificação de fluxo de caixa e regras (`CategoryRule`) por cima.
- Alguns provedores duplicam lançamentos de pagamento de fatura (mesmo
  dia/valor com IDs diferentes) — o motor de faturas deduplica por dia+valor.
- Faturas podem chegar com resíduos de centavos (ex.: `0.0039`); valores
  abaixo de R$ 0,01 são tratados como fatura fechada.
