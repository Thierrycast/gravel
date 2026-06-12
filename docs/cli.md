# CLI

Execute com:

```bash
pnpm gravel <comando>
```

## Comandos principais

- `doctor`: valida ambiente local.
- `snapshot finance --for-llm`: gera snapshot financeiro para análise.
- `diff <before> <after>`: compara snapshots.
- `ops status`: diagnóstico operacional.
- `project context`: gera contexto técnico do projeto.
- `review inbox`: lista pendências da Inbox Financeira.
- `review resolve <id>`: marca item da Inbox como resolvido.
- `review ignore <id>`: marca item da Inbox como ignorado.
- `review monthly-close --month YYYY-MM`: mostra checklist de fechamento.

## Exemplos

```bash
pnpm gravel review inbox
pnpm gravel review monthly-close --month 2026-06
pnpm gravel project context --format bundle
```
