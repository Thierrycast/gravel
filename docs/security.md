# Segredos e credenciais

Como o Gravel guarda credenciais, por que assim, e o que fazer quando uma vaza.

## Regra única

**Nenhum segredo entra no repositório.** Nem literal, nem placeholder, nem
interpolação a preencher. O `docker-compose.yml` versionado pode ficar num
repositório público exatamente como está.

Todos os valores sensíveis vivem em **um arquivo fora do git**:

```
~/.config/gravel/secrets.env      chmod 600, diretório 700
```

- O compose aponta para ele com `env_file:`.
- O `.env` do projeto é um **link simbólico** para esse arquivo, então
  desenvolvimento (`pnpm dev`, CLI, MCP) e produção leem a mesma fonte — sem
  valores duplicados que saem de sincronia.
- O compose sobrescreve `DATABASE_URL` (`environment:` tem precedência sobre
  `env_file:`), então o mesmo arquivo serve para o banco de dev e o de produção.

## As duas camadas

| Camada | O que guarda | Por quê |
|---|---|---|
| `secrets.env` (arquivo, 600) | `APP_SECRETS_ENCRYPTION_KEY`, `INTERNAL_API_KEY` | São **auto-gerados**, sem terceiros, e um deles é necessário para abrir o cofre — não podem depender dele |
| `AppSecret` (SQLite, AES-256-GCM) | credenciais de Pluggy, Binance e Logo.dev | Geridas em `/settings → Segurança`; nunca aparecem em `docker inspect` |

O cofre é `lib/server/secret-store.ts`: AES-256-GCM, chave derivada de
`APP_SECRETS_ENCRYPTION_KEY`, resolução **banco primeiro, ambiente como
fallback** (`getManagedSecretValue`). O fallback é o que permite migrar sem
downtime: a credencial funciona vindo do arquivo até ser gravada no cofre.

> ⚠️ Perder `APP_SECRETS_ENCRYPTION_KEY` torna o conteúdo do cofre
> **irrecuperável**. Guarde uma cópia num gerenciador de senhas.

## Não confunda as duas chaves

| | O que faz |
|---|---|
| `APP_SECRETS_ENCRYPTION_KEY` | **Criptografa** os segredos do cofre (AES-256-GCM) |
| `INTERNAL_API_KEY` | **Não criptografa nada.** É a senha do header `X-INTERNAL-API-KEY` que libera 22 rotas de operação (`/api/admin/*`, `/api/sync/cron`, disparos de sync, registro do webhook) |

Com o `INTERNAL_API_KEY`, alguém na LAN/tailnet consegue forçar sync e
reprocessar read models — não consegue ler dado bancário.

## O que este desenho protege — e o que não

**Protege:** repositório público, clone por terceiros, histórico do git, e o
`docker inspect` (que passa a mostrar só as duas chaves auto-geradas).

**Não protege:** quem tem root ou shell no servidor. Num host único a chave e o
banco vivem na mesma máquina; nenhum esquema muda isso. O modelo de ameaça aqui
é o repositório, e para esse o desenho é completo.

## Incidente de 2026-08-08

O `docker-compose.yml` versionado carregava credenciais literais desde o commit
`e165d0a`, e o repositório era **público**. Expostos: `PLUGGY_CLIENT_ID`,
`PLUGGY_CLIENT_SECRET`, `BINANCE_API_KEY`, `BINANCE_API_SECRET`,
`INTERNAL_API_KEY`, `LOGO_DEV_SECRET_KEY`.

O arquivo `.env` **nunca** foi versionado — o vazamento veio da duplicação
desses valores no compose. VAPID e `APP_SECRETS_ENCRYPTION_KEY` não vazaram.

Resposta: repositório tornado privado, as credenciais de terceiros rotacionadas,
`INTERNAL_API_KEY` regenerada, compose migrado para `env_file`, e a história do
git reescrita para remover os valores.

Risco medido na época: a chave da Binance era **somente leitura**
(`enableWithdrawals`, trading e transferência todos `false`) — exposição de
saldo, não de saque. O grave era o `PLUGGY_CLIENT_SECRET`, que dá leitura de
extratos e faturas de todas as conexões de Open Finance.

## Rotacionar uma credencial

1. Gere a nova no provedor (ou `openssl rand -hex 32` para as auto-geradas).
2. Edite `~/.config/gravel/secrets.env`.
3. Reimplante: `casaos-cli app-management apply gravel --file <compose>`.
4. **Verifique contra a API de verdade** — é o passo que pega rotação pela
   metade (chave nova no provedor, antiga ainda no app):

```bash
# Pluggy
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.pluggy.ai/auth \
  -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$PLUGGY_CLIENT_ID\",\"clientSecret\":\"$PLUGGY_CLIENT_SECRET\"}"

# rotas internas
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-INTERNAL-API-KEY: $INTERNAL_API_KEY" \
  http://127.0.0.1:8421/api/sync/cron
```

⚠️ **Atenção ao cache de API key da Pluggy** (`PLUGGY_API_KEY_TTL_SECONDS`,
2 h): depois de rotacionar o `client_secret`, o app continua funcionando com a
API key em cache e o sync reporta `SUCCESS` — até o cache expirar, quando tudo
para de uma vez. Um `SUCCESS` logo após a rotação **não** prova que a
credencial nova chegou. Só o teste acima prova.

Trocar `PLUGGY_WEBHOOK_SECRET` exige reregistrar o webhook:
`pnpm gravel sync webhook --register --force`.

---

*Documentado por: Claude Code (claude-opus-5) — 2026-08-09.*
