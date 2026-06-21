# Gravel Finance MCP Server Reference

O Gravel Finance MCP Server (`mcp/server.ts`) expõe todas as funcionalidades e inteligência financeira do Gravel para agentes de Inteligência Artificial usando o **Model Context Protocol (MCP)**. Ele permite que LLMs analisem diretamente seu histórico, controlem saldos, criem metas, simulem cenários e configurem conciliações automatizadas.

---

## 🛠️ Instalação e Configuração

### 🚀 Método Automatizado (Recomendado)
Você pode instalar e configurar automaticamente o servidor MCP no **Claude Desktop** e criar a Skill local do **Codex/Antigravity** executando um único comando no terminal na pasta raiz do projeto:

```bash
pnpm gravel mcp install
```

O comando irá:
1. Detectar seu sistema operacional e localizar o arquivo de configuração do Claude Desktop.
2. Injetar a configuração do servidor `gravel-finance` apontando para os diretórios e caminhos absolutos corretos do projeto local.
3. Criar a pasta `.agents/skills/gravel_mcp` com a especificação `SKILL.md` pronta para ser detectada e carregada pelo Antigravity/Codex.

Se desejar realizar o setup manualmente, siga as instruções abaixo:

### 1. No Claude Desktop
Para instalar no Claude Desktop, edite o arquivo de configuração do Claude:
*   **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
*   **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Adicione o servidor `gravel-finance` dentro do objeto `mcpServers`:

```json
{
  "mcpServers": {
    "gravel-finance": {
      "command": "pnpm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/repositorio-base-github",
      "env": {
        "DATABASE_URL": "file:/absolute/path/to/repositorio-base-github/prisma/dev.db",
        "PLUGGY_CLIENT_ID": "seu_client_id",
        "PLUGGY_CLIENT_SECRET": "seu_client_secret"
      }
    }
  }
}
```
*Substitua `/absolute/path/to/repositorio-base-github` pelo caminho absoluto do projeto no seu sistema.*

---

### 2. Em Agentes (Codex / Antigravity / Custom Sidecars)
Para configurar em outros clients MCP compatíveis ou agentes de codificação, registre-o como um comando subprocesso STDIO:
*   **Comando**: `pnpm run mcp` (ou `npx tsx mcp/server.ts` se preferir execução direta).
*   **Variáveis necessárias**: `DATABASE_URL` apontando para o seu arquivo `.db` e as variáveis do Open Finance (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`).

---

### 3. Execução Remota (Conexão via Rede)
O servidor MCP do Gravel suporta execução remota em outros computadores através de dois métodos de rede genéricos:

#### Método A: Túnel SSH (Para clientes baseados em Stdio/Subprocesso)
Se o seu cliente de IA (ex: Claude Desktop) roda em uma máquina cliente e o Gravel em uma máquina servidora, você pode tunelar a entrada/saída padrão por SSH (certifique-se de configurar chaves de acesso sem senha entre elas):

```json
"gravel-finance-remote": {
  "command": "ssh",
  "args": [
    "seu_usuario@ip_ou_host_do_servidor",
    "pnpm --dir /caminho/absoluto/no/servidor run mcp"
  ]
}
```

#### Método B: Transporte SSE/HTTP (Para clientes compatíveis com HTTP/SSE, como o Cursor)
O Gravel MCP suporta o protocolo HTTP Server-Sent Events (SSE). Para iniciar o servidor MCP como um endpoint de rede HTTP, execute informando a porta (`PORT` ou `MCP_PORT`) e a flag `--sse`:

```bash
MCP_BIND_HOST=0.0.0.0 PORT=3001 pnpm run mcp -- --sse
```

Isso iniciará o servidor HTTP de escuta na porta especificada. Para conectar um cliente compatível (como o Cursor), registre o servidor com as seguintes configurações:
*   **Tipo de Conexão (Type)**: `SSE`
*   **URL**: `http://ip_ou_host_do_servidor:3001/sse`

Se quiser manter validação estrita de `Host` no endpoint remoto, defina também `MCP_ALLOWED_HOSTS` com os hosts aceitos, separados por vírgula:

```bash
MCP_BIND_HOST=0.0.0.0 \
MCP_ALLOWED_HOSTS=seu-host-publico,seu-host.tailnet.ts.net,localhost \
PORT=3001 \
pnpm run mcp -- --sse
```

Resumo da política:
* `MCP_BIND_HOST=0.0.0.0`: aceita conexões remotas e desliga a proteção automática de localhost da SDK.
* `MCP_ALLOWED_HOSTS=...`: reativa uma allowlist explícita de `Host` para cenários expostos em rede.
* Se o cliente estiver vindo por Tailscale IP/hostname, esse valor precisa estar na allowlist quando `MCP_ALLOWED_HOSTS` for usada.

---

### 4. Como uma Skill Autônoma para Antigravity/Codex
Você também pode empacotar as instruções do MCP do Gravel como uma **Skill** nativa.
Para fazer isso, crie um diretório de Skill em sua pasta de customizações (ex: `.agents/skills/gravel_mcp/` ou no diretório global `~/.gemini/config/skills/gravel_mcp/`):

Crie o arquivo `SKILL.md` com o seguinte conteúdo:

```markdown
---
name: gravel-financial-analyst
description: Permite analisar contas, transações, fluxos de caixa e simular cenários financeiros no Gravel Finance usando ferramentas MCP.
---

# Gravel Financial Analyst Skill

Você tem acesso ao servidor MCP `gravel-finance`. Use-o sempre que o usuário solicitar diagnósticos de contas, buscas de transações, criação de metas de economia, simulação de projeções financeiras ou fechamento mensal.

## Diretrizes de Uso das Ferramentas:
1. Para dar um panorama geral de saúde: Chame `get_financial_snapshot` e `analyze_financial_health`.
2. Para criar transações manuais: Chame `create_transaction` garantindo que o valor é positivo e especificando a direção (INFLOW ou OUTFLOW).
3. Para ajustar categorização: Use `update_transaction` definindo o `domainCategoryId` correto ou use `create_automation_rule` para registrar padrões contínuos.
4. Para simular e analisar: Chame `project_future_cashflow` ou use `create_scenario` para criar simulações temporárias de receitas/despesas futuras.
```

---

## 🧰 Catálogo de Ferramentas MCP

### 📊 Métricas e Análise Financeira
*   **`get_financial_snapshot`**: Retorna um resumo financeiro do período selecionado (saldo líquido, total de entradas, saídas e patrimônio).
*   **`get_net_worth_history`**: Retorna o histórico consolidado do patrimônio líquido mês a mês.
*   **`get_cashflow`**: Gráfico diário ou mensal de movimentação de caixa.
*   **`get_cashflow_comparison`**: Comparativo entre meses consecutivos detalhando o delta percentual de receitas e despesas.
*   **`get_spending_by_category`**: Gastos ordenados com percentual de relevância de cada categoria.
*   **`get_spending_by_merchant`**: Top estabelecimentos por volume de saídas de caixa.
*   **`get_spending_trends`**: Evolução temporal de despesas categorizadas.
*   **`analyze_financial_health`**: Indicadores automáticos de score financeiro e runway (meses de sobrevivência com o saldo atual).
*   **`project_future_cashflow`**: Projeção matemática do saldo com base nas recorrências conhecidas e faturas futuras.

### 🔍 Consultas e Listas
*   **`search_transactions`**: Busca transações de forma paginada com suporte a termos de pesquisa, filtros de data, direção, conta, comerciantes e valores mínimos/máximos.
*   **`get_accounts`**: Detalha saldos de todas as contas associadas.
*   **`get_bills`**: Exibe faturas de cartão de crédito do mês.
*   **`get_investments`**: Lista ativos de renda fixa e fundos.
*   **`get_crypto_portfolio`**: Posição e P&L consolidado de ativos de criptomoedas.
*   **`get_recurring_expenses`**: Parcelamentos e assinaturas recorrentes com datas.
*   **`get_goals`**: Exibe metas ativas e percentual de progresso.
*   **`get_scenarios`**: Cenários e eventos de simulação futuros.
*   **`get_financial_inbox`**: Retorna pendências de conciliação.
*   **`get_monthly_close`**: Retorna o checklist de fechamento.

### ✍️ Ações de Escrita e Mutação (CRUD)
*   **`create_transaction`** / **`update_transaction`** / **`delete_transaction`**: Cria, edita e remove transações locais manuais.
*   **`update_account`**: Edita apelidos e saldos de contas manuais.
*   **`pay_bill`**: Registra a quitação de faturas de cartão.
*   **`create_goal`** / **`update_goal`**: Configura metas de investimento com triggers de Open Finance.
*   **`create_scenario`** / **`delete_scenario`**: Insere e remove cenários preditivos.
*   **`create_lend`** / **`update_lend`** / **`delete_lend`**: Registra empréstimos a receber ou dívidas a pagar para amigos.
*   **`create_automation_rule`** / **`delete_automation_rule`**: Cria e remove regras de conciliação automática baseadas em palavras-chave ou regex.
*   **`update_settings`**: Altera configurações de exibição e valores base de salário.
*   **`trigger_sync`**: Dispara rotinas de atualização da Pluggy e Binance.
