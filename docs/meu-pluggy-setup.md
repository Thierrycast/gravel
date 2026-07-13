# Configuração: Pluggy + MeuPluggy (conta, tokens e acesso)

Guia passo a passo para obter acesso ao Open Finance e rodar o Gravel do zero,
sem plano pago da Pluggy. Ao final você terá: seus bancos conectados, as
credenciais no `.env` e os dados sincronizando.

## 0. Entenda as peças (2 minutos)

A [Pluggy](https://www.pluggy.ai/) é a infraestrutura de agregação: uma API
única que conecta a mais de 130 instituições brasileiras via Open Finance. É
um produto **pago**, voltado a empresas — com trial gratuito de avaliação.

O [MeuPluggy](https://meu.pluggy.ai/) é um aplicativo **gratuito** da própria
Pluggy, para pessoas físicas. Você conecta seus bancos a ele via Open Finance
e ele passa a funcionar como um **proxy da conexão original**: é ele quem
guarda o consentimento com o banco e atualiza os dados diariamente. Para a
API da Pluggy, o MeuPluggy aparece como **um conector a mais** — então dá
para consumir os próprios dados bancários pela API, de graça, para
desenvolvimento e uso pessoal.

O fluxo completo usado pelo Gravel:

```
Banco (Nubank, Inter, ...) ──Open Finance──▶ MeuPluggy ──conector──▶ API Pluggy ──▶ Gravel
```

Você vai criar **duas contas** que se conectam no final:

| # | Conta | Onde | Papel |
|---|---|---|---|
| 1 | MeuPluggy | https://meu.pluggy.ai | Lado "pessoa física": segura o consentimento Open Finance com seus bancos |
| 2 | Pluggy Dashboard | https://dashboard.pluggy.ai | Lado "desenvolvedor": fornece `CLIENT_ID`/`CLIENT_SECRET` da API |

---

## 1. Conta no MeuPluggy + conexão dos bancos

1. Acesse https://meu.pluggy.ai e crie uma conta gratuita (e-mail e senha).
2. Clique em **Conectar conta** e escolha sua instituição (ex.: Nubank).
3. Siga o fluxo de autorização Open Finance — você será redirecionado para o
   app/site do **próprio banco** para aprovar o consentimento. Nenhuma senha
   bancária é digitada no MeuPluggy.
4. Repita para **cada banco** que quiser rastrear (Inter, PagSeguro, etc.).

**Confira antes de seguir:** no painel do MeuPluggy devem aparecer seus
saldos, cartões e transações. Se apareceu, o consentimento está de pé. Os
dados são atualizados diariamente pela conexão original.

> O MeuPluggy também é onde você revisa e **revoga** acessos depois: ele
> lista quais aplicações leem seus dados.

## 2. Conta de desenvolvedor no Pluggy Dashboard

1. Acesse https://dashboard.pluggy.ai e cadastre-se. Ao criar a conta, um
   **Team** é criado automaticamente e você ganha um **trial de 15 dias** com
   a API completa. Depois do trial, o acesso via conector MeuPluggy continua
   funcionando para desenvolvimento.
2. No menu lateral, abra a aba **Applications**.
3. Clique em **criar a primeira Application** (aplicação de desenvolvimento).
4. Com a Application criada, o dashboard exibe as duas credenciais que o
   Gravel precisa:
   - `CLIENT_ID`
   - `CLIENT_SECRET`

> ⚠️ Essas credenciais dão acesso a dados financeiros. Guarde-as apenas no
> `.env` do servidor — nunca em código versionado, nunca no navegador.

5. Ainda nas configurações da Application, **habilite o conector MeuPluggy**
   na lista de conectores da aplicação (é isso que faz seus dados do Passo 1
   ficarem acessíveis pela API).

**Confira antes de seguir:** teste as credenciais direto no terminal —

```bash
curl -s -X POST https://api.pluggy.ai/auth \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"SEU_CLIENT_ID","clientSecret":"SEU_CLIENT_SECRET"}'
```

Resposta esperada: `{"apiKey":"eyJhb..."}`. Se vier `403`/`401`, as
credenciais estão erradas ou a Application não foi criada.

## 3. Ligar as duas contas (autorização OAuth)

Falta o passo que conecta o lado pessoa física (MeuPluggy) ao lado
desenvolvedor (sua Application). Há dois caminhos equivalentes:

**Pelo app Demo da Pluggy** (sem precisar do Gravel rodando):

1. No Dashboard, abra **Applications**, selecione a sua e clique em
   **Preview in Demo**.
2. No demo, escolha o conector **MeuPluggy** e faça login com a conta do
   Passo 1 (fluxo OAuth).
3. Autorize o acesso.

**Pelo próprio Gravel** (com o `.env` do Passo 4 já configurado):

1. Rode o Gravel e abra a tela **`/connect`**.
2. Clique para adicionar conexão — o widget Pluggy Connect abre.
3. Escolha o conector **MeuPluggy**, faça login com a conta do Passo 1 e
   autorize.

> **Importante:** a autorização é **por banco conectado** no MeuPluggy, não
> por conta individual. Se você tem Nubank + Inter no MeuPluggy, são **duas**
> autorizações. E se conectar um banco novo ao MeuPluggy no futuro, volte
> aqui e autorize-o também.

Cada autorização vira um **Item** na API da Pluggy (item = uma conexão com
uma instituição). São esses itens que o Gravel sincroniza.

### Alternativa sem banco real: sandbox "Pluggy Bank"

Para testar o fluxo sem expor dados reais, use o conector de teste
**Pluggy Bank** no widget/demo:

| Campo | Valor |
|---|---|
| Usuário | `user-ok` |
| Senha | `password-ok` |
| Token MFA | `123456` |

Ele simula logins, erros de credencial e MFA sem tocar em bancos reais.

## 4. Configurar o `.env` do Gravel

```env
# Obrigatórias (Passo 2)
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...

# Opcionais (defaults mostrados — normalmente não precisa mexer)
PLUGGY_API_BASE=https://api.pluggy.ai
PLUGGY_AUTH_PATH=/auth
PLUGGY_CONNECT_TOKEN_PATH=/connect_token
PLUGGY_API_KEY_HEADER=X-API-KEY
PLUGGY_API_KEY_TTL_SECONDS=7200
```

Depois:

```bash
pnpm install
pnpm db:push        # cria o SQLite local
pnpm dev            # http://localhost:3000
```

## 5. Conectar e sincronizar no Gravel

1. Abra **`/connect`** e vincule o MeuPluggy (Passo 3, se ainda não fez).
2. Clique em **sync** (topo da UI) ou rode:

```bash
pnpm gravel sync trigger   # dispara a sincronização
pnpm gravel ops status     # itens, status e última sync
pnpm gravel review inbox   # pendências geradas a partir dos dados
```

3. Confira o dashboard (`/`): saldos, transações e faturas devem aparecer.

## Como o Gravel usa os tokens (referência)

O cliente vive em `lib/integrations/pluggy.ts` e segue o fluxo oficial
([docs de autenticação](https://docs.pluggy.ai/docs/authentication)):

1. **API Key** — `POST /auth` com `{ clientId, clientSecret }` → `apiKey`
   com acesso total, válida por **2 horas**. Enviada no header `X-API-KEY`
   em toda chamada server-side; cacheada em memória e renovada sozinha
   (`PLUGGY_API_KEY_TTL_SECONDS`, default 7200s).
2. **Connect Token** — `POST /connect_token` (autenticado com a API Key) →
   token de escopo restrito, válido por **30 minutos**, usado só pelo widget
   no navegador. É o que `POST /api/pluggy/connect-token` devolve à tela
   `/connect`; um novo é gerado a cada conexão.

O segredo nunca sai do servidor; o navegador só vê o connect token de curta
duração (e um connect token não consegue ler dados — chamadas de dados com
ele retornam `403`).

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Pluggy não configurado. Verifique as credenciais no arquivo .env` | `PLUGGY_CLIENT_ID`/`SECRET` ausentes | Preencha o `.env` e reinicie o servidor |
| `Pluggy auth error: 403` no log | Credenciais inválidas/trocadas | Copie de novo do Dashboard → Applications |
| Widget abre mas o MeuPluggy não aparece na lista | Conector não habilitado na Application | Passo 2.5 — habilite o MeuPluggy na lista de conectores |
| Banco aparece no MeuPluggy mas não no Gravel | Falta autorizar aquele banco (é por banco!) | Refaça o Passo 3 para o banco novo |
| Item em `WAITING_USER_INPUT`/`WAITING_USER_ACTION` | Banco pediu MFA ou novo consentimento | Abra `/connect` e siga a ação recomendada |
| Item em `LOGIN_ERROR` | Consentimento expirou/revogado | Reconecte o banco no MeuPluggy e reautorize |
| Dados "atrasados" mesmo após sync | O MeuPluggy atualiza a conexão original 1x/dia | Normal — o PATCH pede refresh, mas a janela real é do proxy |

## Limitações e notas

- O MeuPluggy é para **desenvolvimento e uso pessoal**. Produto em produção
  com usuários terceiros exige plano comercial da Pluggy (aí o widget conecta
  os bancos dos usuários diretamente, sem o proxy).
- A categorização automática da Pluggy erra com frequência (ex.: pagamento de
  fatura categorizado como "Salário") — o Gravel aplica a própria camada de
  classificação e regras por cima; veja [Integração Pluggy](pluggy.md).
- Dúvidas e bugs do MeuPluggy: [repositório oficial](https://github.com/pluggyai/meu-pluggy)
  e [Discord da Pluggy](https://discord.gg/EanrwJADby).

## Referências

- MeuPluggy (app): https://meu.pluggy.ai
- MeuPluggy (repo/README com o passo a passo oficial): https://github.com/pluggyai/meu-pluggy
- Pluggy (produto): https://www.pluggy.ai
- Pluggy Dashboard: https://dashboard.pluggy.ai
- Documentação da API: https://docs.pluggy.ai
- Autenticação: https://docs.pluggy.ai/docs/authentication
- API keys: https://docs.pluggy.ai/docs/get-your-api-keys
- Primeiro item: https://docs.pluggy.ai/docs/create-your-first-item
