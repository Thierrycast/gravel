# OmniRoute como provider padrão do briefing

O briefing por IA passou a sair pelo gateway do lab. **Anthropic continua
válido** — /settings → "Provider do briefing" sobrescreve o padrão, e o que
estiver salvo lá sempre vence o ambiente.

## Configuração

Vive em `~/.config/gravel/secrets.env` (0600, fora do git), lido pelo compose
via `env_file`. A chave nunca entra em arquivo versionado.

| Variável | Valor |
|---|---|
| `AI_PROVIDER` | `openai-compatible` |
| `AI_BASE_URL` | `http://omniroute:20128/v1` |
| `AI_MODEL` | `lab-economico` (nome de **combo**) |
| `AI_API_KEY` | chave compartilhada `homelab-inference`, somente inferência |

`AI_API_KEY` também pode ser gravada em /settings → Segurança; o secret store
do app vence a variável de ambiente quando as duas existem.

## Duas mudanças de código

- `lib/ai/provider.ts`: `stream: false` explícito no corpo OpenAI-compatible.
  A OpenAI assume não-streaming quando o campo falta; o gateway assume o
  contrário, e a resposta SSE chegava como "Provider respondeu JSON inválido".
- `app/api/briefing/route.ts`: provider, baseUrl e model ganham default vindo
  do ambiente. Sem isso o padrão continuaria fixo em Anthropic no código.

## Rede

O gateway publica só em `127.0.0.1:20128`. O Gravel entrou na rede
`omniroute_default` (declarada `external`) e fala com `http://omniroute:20128`.

## Verificado em 2026-09-01

- `pnpm vitest run` → **236 testes passaram** (21 arquivos).
- `GET /api/briefing` na instância de produção devolveu briefing real, com
  saldo projetado, faturas em atraso e top 5 categorias — texto gerado pelo
  gateway, não pela Anthropic.
- O app continua **rodando**: era o estado dele antes da mudança.

Contexto do gateway: `~/dev/lab-standards/OMNIROUTE-INTEGRATION.md`.

---

*Documentado por: Claude Code (claude-opus-5) — 2026-09-01.*

---

# Etapa 2 — o briefing dizia coisa errada sobre dinheiro

## O bug

Um briefing real, gerado em produção, abria assim:

> *"Seu saldo projetado para setembro é positivo em **R$ 1.309,49** (receita de
> R$ 3.411,74 menos despesas de R$ 2.102,25)"*

Os dois números são **médias históricas**, não setembro. E o saldo de
R$ 1.309,49 não existe em lugar nenhum — o modelo o obteve subtraindo uma média
da outra.

A causa estava no prompt: o cabeçalho dizia `DADOS DO MÊS` sobre uma lista que
começava com `Receita média mensal`. O modelo fez o que era de esperar. Em
texto sobre dinheiro isso não é imprecisão de estilo, é erro material.

## A correção

Cada bloco agora diz o que é — `MÉDIAS HISTÓRICAS (não são o realizado de
<mês>)`, `PROJEÇÃO`, `SITUAÇÃO ATUAL (contagens reais de hoje)`, `GASTO
REALIZADO NOS ÚLTIMOS 30 DIAS` — e há uma regra explícita proibindo derivar
valores que não foram dados.

Mesmo endpoint, depois:

> *"Sua **receita média mensal** é de R$ 3.411,74, enquanto as **despesas
> médias mensais** somam R$ 2.102,25. Não há projeção de saldo negativo nos
> próximos meses."*

O rótulo sobreviveu e o saldo inventado sumiu.

## Cache por impressão digital dos dados

A rota é `force-dynamic`, então **toda** requisição que chegava ao servidor
gerava um briefing novo. O `Cache-Control: max-age=86400` só instruía o
navegador. Abrir o dashboard cinco vezes na mesma tarde custava cinco gerações
idênticas.

Agora a chave é o SHA do prompt montado: mudou um número, refaz; não mudou,
devolve o de antes com `cached: true`. Em memória de propósito — é um dashboard
de um usuário só, e perder o cache num restart não custa nada. Uma tabela no
banco resolveria o mesmo problema com uma migração a mais e nenhum ganho.

## Erro de provedor deixou de ser 500

`generateAiText` sem `try` virava stack trace na tela. Agora responde
`502 {"error":"ai_provider_failed", detail}`, no mesmo formato do
`api_key_missing` que a UI já trata.

## Verificado em 2026-09-01

- `pnpm vitest run` → 236 testes; `tsc --noEmit` limpo.
- `GET /api/briefing` em produção: primeira chamada `cached: false`, segunda
  `cached: true`, e o texto com os rótulos corretos.
- App continua **rodando** — era o estado dele.

---

*Etapa 2 documentada por: Claude Code (claude-opus-5) — 2026-09-01.*
