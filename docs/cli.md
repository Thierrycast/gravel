# Gravel CLI

A CLI do Gravel é uma ferramenta de linha de comando poderosa projetada para diagnóstico, exportação de dados e geração de contexto para agentes de IA.

## Como Executar

A CLI pode ser executada através do script `npm` definido no `package.json`:

```bash
npm run gravel -- [comando] [opções]
```

*Nota: O `--` é necessário para passar argumentos para o comando subjacente.*

## Comandos Principais

### `doctor`
Realiza um check-up completo do ambiente local.
- Verifica versão do Node.js.
- Valida existência do `.env` e chaves obrigatórias.
- Testa conectividade com o banco de dados SQLite.
- Resume o volume de dados em cada entidade de domínio.
- Mostra o status dos últimos sincronismos (Pluggy/Binance).

```bash
npm run gravel -- doctor
```

### `project context`
Gera um resumo técnico de toda a estrutura do projeto. Útil para dar contexto a novos agentes ou desenvolvedores.
- Lista modelos do Prisma.
- Mapeia rotas de API e páginas.
- Lista módulos de domínio e seus exports.
- Formatos suportados: `bundle` (JSON+MD), `md`, `json`.

```bash
npm run gravel -- project context --format md
```

### `snapshot finance`
Gera um "congelamento" dos dados financeiros atuais para análise profunda.
- Coleta métricas de overview, cash flow, categorias e merchants.
- Identifica anomalias automaticamente.
- Opção `--for-llm`: Gera um arquivo `prompt-context.md` otimizado para ser colado diretamente em chats de IA (ChatGPT/Claude), respeitando limites de contexto.

```bash
# Para análise completa
npm run gravel -- snapshot finance

# Para copiar e colar em uma IA
npm run gravel -- snapshot finance --for-llm
```

### `export`
Exporta entidades específicas do banco de dados para arquivos `json` ou `jsonl`.
Entidades: `transactions`, `categories`, `merchants`, `bills`, `accounts`, `investments`, `recurring`, `portfolio`, `crypto`.

```bash
npm run gravel -- export transactions --period 90d --format jsonl
```

### `ops`
Comandos para monitoramento operacional fino.
- `status`: Resumo de saúde operacional.
- `sync-runs`: Histórico de execuções de sincronismo.
- `failures`: Detalhamento de falhas recentes.
- `locks`: Visualização de travas de concorrência ativas.

```bash
npm run gravel -- ops status
npm run gravel -- ops failures --days 7
```

## Desenvolvimento

A CLI está localizada em `/cli` e utiliza as seguintes tecnologias:
- **Commander.js**: Gerenciamento de comandos e argumentos.
- **tsx**: Execução direta de TypeScript com suporte a variáveis de ambiente.
- **cli-table3**: Renderização de tabelas no terminal.
- **chalk**: Estilização de cores.

Para adicionar um novo comando, crie o arquivo em `cli/commands/` e registre-o no `cli/index.ts`.
