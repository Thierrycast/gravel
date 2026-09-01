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
| `AI_API_KEY` | chave `app-gravel`, restrita a `lab-economico` |

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
