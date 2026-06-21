# Gravel Finance CLI Reference

O Gravel Finance CLI (`pnpm gravel`) permite acessar todas as funcionalidades da aplicação diretamente do terminal, facilitando o diagnóstico, gerenciamento de dados e integração com ferramentas de Inteligência Artificial.

## Execução básica
```bash
pnpm gravel <comando> [opções]
```
Use `--help` em qualquer comando para ver as opções detalhadas.

---

## Tabela de Comandos Disponíveis

| Comando | Descrição | Subcomandos principais |
| :--- | :--- | :--- |
| `doctor` | Diagnóstico de integridade do ambiente | (nenhum) |
| `snapshot` | Exporta snapshots estruturados de dados para IA | `finance` |
| `diff` | Compara dois snapshots e lista alterações | (nenhum) |
| `ops` | Diagnóstico técnico e liberação de locks de sync | `status`, `sync-runs`, `clear-lock` |
| `project` | Exporta o contexto do projeto para agentes | `context` |
| `review` | Inbox financeira e rotinas de fechamento mensal | `inbox`, `resolve`, `ignore`, `monthly-close` |
| `transactions` | CRUD completo e filtros de transações | `list`, `create`, `update`, `delete` |
| `accounts` | Visualização e edição de contas bancárias | `list`, `update` |
| `investments` | Visualização de ativos de renda fixa e variável | `list` |
| `crypto` | Visualização do portfólio de criptomoedas | `list` |
| `bills` | Gerenciamento de faturas de cartão de crédito | `list`, `pay` |
| `goals` | Metas de economia com aportes automáticos | `list`, `create`, `update`, `delete` |
| `scenarios` | Simulação de receitas/despesas futuras | `list`, `create`, `delete` |
| `lends` | Empréstimos devidos/a receber de amigos | `list`, `create`, `update`, `delete` |
| `rules` | Regras de categorização automática de transações | `list`, `create`, `delete` |
| `settings` | Exibição e atualização de preferências do usuário | `show`, `update` |
| `sync` | Disparo manual e monitoramento de sincronização | `trigger`, `status` |
| `mcp` | Instalação e gerenciamento do MCP Server | `install` |

---

## Detalhamento dos Comandos

### 1. Transações (`gravel transactions`)
Gerencia o histórico de movimentações financeiras.
*   **`list`**:
    *   Filtros disponíveis: `-q` (busca textual), `-p` (período: `mtd`, `30d`, `90d`, `12m`, `ytd`, `all`), `--from` / `--to` (datas `YYYY-MM-DD`), `-d` (direção: `inflow`, `outflow`, `transfer`), `--account` (ID da conta), `--category` (ID da categoria), `--min-amount` / `--max-amount`.
    *   Ordenação e paginação: `--sort-by`, `--sort-order` (`asc` / `desc`), `--page`, `--page-size`.
*   **`create`**: Cria uma transação manual.
    *   Parâmetros: `-d, --description <desc>`, `-a, --amount <val>`, `--direction <dir>` (`inflow` / `outflow`), `--occurred-at <date>`, `--account <id>`, `--category <id>`.
*   **`update <id>`**: Atualiza campos (descrição, valor, direção, data, categoria, comerciante, etc.).
*   **`delete <id>`**: Exclui transações manuais (apenas transações locais criadas como `MANUAL`).

### 2. Contas (`gravel accounts`)
Controle de saldo e contas manuais ou sincronizadas.
*   **`list`**: Exibe saldos, apelidos, tipos de conta (banco, cartão, investimento) e o provedor de dados.
*   **`update <id>`**: Altera apelido (`--nickname`) ou saldo (`--balance`, apenas para contas manuais).

### 3. Investimentos (`gravel investments`)
Acompanhamento de ativos de investimento de renda fixa e variável.
*   **`list`**: Exibe nome do ativo, tipo de investimento (renda fixa/variada), saldo atual e provedor de origem.

### 4. Criptomoedas (`gravel crypto`)
Acompanhamento do portfólio de ativos cripto.
*   **`list`**: Exibe o símbolo do ativo, quantidade mantida, cotação atual, valor em BRL, custo médio de aquisição e P&L não realizado colorizado.

### 5. Faturas (`gravel bills`)
Monitoramento do passivo de cartões.
*   **`list`**: Exibe faturas com vencimento, status (aberta/paga/atrasada) e valores residuais.
*   **`pay <id>`**: Marca uma fatura de cartão de crédito como quitada.

### 6. Metas (`gravel goals`)
Acompanhamento de metas financeiras e regras de Open Finance.
*   **`list`**: Mostra progresso acumulado, metas mensais e filtros automáticos associados.
*   **`create`**: Cria meta.
    *   Parâmetros: `-t, --title <title>`, `-a, --amount <val>`, `--emoji <emoji>`, `--monthly-contribution <val>`, `--due-date <date>`, `--match-category <slug>` (aportar transações desta categoria), `--match-keyword <word>` (aportar transações com esta palavra).
*   **`update <id>`**: Altera metas, atalhos de match e datas.
*   **`delete <id>`**: Exclui a meta.

### 7. Cenários (`gravel scenarios`)
Simulação de fluxo de caixa futuro para planejamento.
*   **`list`**: Lista simulações ativas.
*   **`create`**: Adiciona evento futuro simulado.
    *   Parâmetros: `-t, --title <title>`, `-a, --amount <val>`, `-d, --date <date>`, `-r, --recurring` (se é recorrente), `-f, --frequency <freq>` (`once`, `monthly`, `yearly`), `-c, --category <id>`.
*   **`delete <id>`**: Remove a simulação.

### 8. Empréstimos (`gravel lends`)
Acompanhamento de dívidas a receber ou pagar a terceiros.
*   **`list`**: Lista empréstimos pendentes e resolvidos.
*   **`create`**: Registra dívida ou empréstimo.
    *   Parâmetros: `-f, --friend <name>`, `-a, --amount <val>`, `-d, --due-date <date>`, `--desc <desc>`, `--category <id>`, `--transaction <id>` (vincular transação de débito de origem).
*   **`update <id>`**: Altera status para quitado (`--status paid`) ou associa a transação de recebimento de quitação (`--inflow-transaction <id>`).
*   **`delete <id>`**: Remove o registro.

### 9. Regras (`gravel rules`)
Automação de categoria baseada em padrões.
*   **`list`**: Exibe as regras de conciliação.
*   **`create`**: Cria regra automática.
    *   Parâmetros: `-t, --type <type>` (`EXACT`, `CONTAINS`, `PREFIX`, `REGEX`), `-f, --field <field>` (ex: `description`), `-v, --value <value>`, `-c, --category <id>`, `-p, --priority <n>`.
*   **`delete <id>`**: Remove a regra.

### 10. Configurações (`gravel settings`)
Gerencia as preferências gerais de cálculo da plataforma.
*   **`show`**: Exibe salário base, intervalo de sync, cooldown e status de encriptação do Vault.
*   **`update`**: Modifica variáveis como `--salary`, `--show-future-salary` (`true` / `false`), `--show-future-accounts` (`true` / `false`), `--sync-interval` e `--lookback`.

### 11. Sincronização (`gravel sync`)
Controle operacional das integrações de dados.
*   **`trigger`**: Dispara sincronização para `--provider pluggy`, `binance` ou `all`. A opção `--force` limpa travas de lock ativas devido a interrupções abruptas anteriores.
*   **`status`**: Exibe o status da última rodada de sincronização, incluindo tempo de execução e status final.

### 12. Inbox e Fechamento (`gravel review`)
Fluxos guiados de organização e conformidade financeira.
*   **`inbox`**: Lista itens que necessitam de atenção na Inbox Financeira (ex: transações sem categoria, salário não confirmado).
*   **`monthly-close`**: Acompanhamento e checklist do fechamento mensal de receitas e despesas.

### 13. Model Context Protocol (`gravel mcp`)
Gerenciamento de integrações MCP.
*   **`install`**: Instala e configura automaticamente o Gravel MCP Server no Claude Desktop e cria a Skill correspondente para Codex/Antigravity.
    *   Opções: `--claude-only` (instala apenas no Claude), `--skill-only` (cria apenas a Skill local).

---

## Exemplos Práticos de Uso

```bash
# Sincronizar todos os dados forçando liberação de travas
pnpm gravel sync trigger --provider all --force

# Listar transações de saída maiores que R$ 100 este mês
pnpm gravel transactions list --direction outflow --min-amount 100 --period mtd

# Criar meta de viagem com aporte automático de transações com a tag "viagem"
pnpm gravel goals create --title "Viagem Férias" --amount 5000 --emoji "✈️" --match-keyword "viagem"

# Registrar que o empréstimo ID "ab12cd34" foi quitado
pnpm gravel lends update ab12cd34 --status paid
```
