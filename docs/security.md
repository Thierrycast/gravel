# Segredos e credenciais

Como o Gravel guarda credenciais, por que assim, e o que fazer quando uma vaza.

## Regra única

**Nenhum segredo entra no repositório, e nenhum exige editar arquivo.** Quem
conecta um banco não abre terminal — credencial de provedor se cadastra na tela.

```
Primeiro boot (automático, o usuário não vê)
  <dir do banco>/secret.key           0600  → chave AES-256-GCM do cofre
  <dir do banco>/internal-token.key   0600  → token das rotas internas

Usuário, em /settings → Segurança
  1. cria a senha mestre         (portão da UI, hash scrypt)
  2. cadastra Pluggy/Binance/…   (criptografado em AppSecret)
```

As duas chaves de infraestrutura são **geradas pelo app**, não pelo usuário:
são infraestrutura, não configuração. E a chave do cofre não poderia vir da
tela — a tela precisa dela para criptografar o que você digita.

Variáveis de ambiente continuam funcionando como **override opcional**
(`getManagedSecretValue` resolve banco primeiro, ambiente depois), para quem faz
deploy declarativo. Mas nada exige que existam.

## Por que a senha mestre não é a chave de criptografia

Tentador, e errado aqui. Se a chave fosse derivada da sua senha, ninguém
descriptografaria sem ela — nem com o servidor na mão. Mas o servidor precisa
descriptografar **sozinho**, às 02:30, quando o webhook da Pluggy chega e não há
ninguém para digitar. Chave derivada de senha tornaria o sync desassistido
impossível — e é a função central do app.

Então: **chave da máquina criptografa; senha do usuário é o portão da UI.**

Exceção que vale inverter: se algum dia o app iniciar pagamentos (a Pluggy
suporta), aí a senha por operação passa a fazer sentido — credencial que move
dinheiro *deve* exigir humano, e o custo de não ser desassistida vira o objetivo.

## Backup e recuperação

`backup-db.sh` copia **só o banco** (`.backup` do SQLite), não o volume. Isso é
deliberado: um backup vazado é inútil sem a chave, que fica fora dele.

O problema óbvio seria o restore: volume novo, chave nova, segredos
indescriptografáveis. Resolvido com **envelope**: a chave do cofre também fica no
banco, cifrada por uma chave derivada da senha mestre (`SystemMetadata`,
`vault-key-recovery-v1`). Assim:

| Cenário | Resultado |
|---|---|
| Backup roubado | inútil — precisa da senha, que está na sua cabeça |
| Restore em máquina nova | funciona digitando a senha mestre (`recoverVaultKey`) |

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

## O guard-rail

`scripts/secret-scan.sh` barra commit com segredo em arquivo versionado. Sanear o
compose conserta o passado; este hook é o que evita repetir.

```bash
ln -sf ../../scripts/secret-scan.sh .git/hooks/pre-commit   # instalar
./scripts/secret-scan.sh                                    # varrer tudo agora
```

Duas checagens: padrões de credencial de provedor (`sk_`, `ghp_`, `AKIA`,
chave privada PEM…) e valor literal em variável sensível. Passa em vazio,
`${INTERPOLACAO}` e placeholders; ignora `process.env.X = y` (código lendo a env)
e exige mistura de letra e dígito, o que descarta identificadores como
`originalKey` sem enfraquecer a detecção — valores com prefixo conhecido caem na
primeira checagem de qualquer forma.

Deliberadamente **não** usa detector de entropia genérico: ele dispara em hash de
lockfile, e um hook que grita à toa é um hook que se aprende a ignorar.

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
