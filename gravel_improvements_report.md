# Implementações Sugeridas: Gravel Finance

Este relatório foca exclusivamente nas funcionalidades e modificações necessárias no **Gravel Finance** (Back-end, Banco de Dados, MCP Server) para fornecer insumos para que um assistente autônomo possa operar.

## 1. Sistema de Orçamentos Dinâmicos (Budgets)
Para que o agente possa ser proativo em avisos de saúde financeira, ele precisa conhecer os limites que você se impôs.
- **Nova Tabela no Banco**: `DomainBudget` (Categoria, Valor Limite Mês, Notificar em X%).
- **Novas Ferramentas MCP**: 
  - `get_budgets()`: Para o agente ler o teto de gastos.
  - `create_budget()` e `update_budget()`: Para você poder pedir ao assistente para ajustar o orçamento conversando com ele.

## 2. Eventos, Webhooks ou SSE Reverso (Notificações Push)
Atualmente o Gravel não "grita" quando acontece algo importante. O agente precisa ficar perguntando.
- **Implementação**: Adicionar no Gravel um disparador (Webhook ou um socket/SSE invertido) que envie eventos importantes diretamente para o OpenClaw (ex: `TransactionCreated`, `SyncFailed`).
- **Exemplo Prático**: Quando o Pluggy (Open Finance) sincronizar e identificar uma compra de valor muito alto e atípico, o Gravel dispara o evento para o OpenClaw, que imediatamente manda uma mensagem no seu WhatsApp.

## 3. Upload e Parsing de Faturas (Contas Domésticas)
Para a vida financeira 100% automatizada, precisamos cobrir as contas de casa (Energia, Água, Internet).
- **Implementação**: Uma nova API/Ferramenta MCP `register_utility_bill(pdfText, provider)` ou `upload_bill`.
- **Uso**: O OpenClaw extrai os dados do PDF/foto recebida no WhatsApp, chama essa ferramenta no Gravel, e o Gravel agenda o gasto e avisa os impactos no Runway do mês.

## 4. Evolução do Endpoint de Cenários
A ferramenta `create_scenario` atual é boa, mas o assistente precisa de um motor de simulação sem salvar nada no banco apenas para te responder rapidamente.
- **Ferramenta MCP**: `simulate_purchase_impact(amount, date)`
- **Uso**: Simplesmente retorna matematicamente o "Antes e Depois" do `analyze_financial_health` caso aquela compra seja feita, sem gravar no banco, facilitando as perguntas do dia a dia ("Posso comprar isso?").

## 5. Histórico e Track de Metas Mais Refinado
Para gerar motivação, o Gravel precisa exportar como as metas evoluíram com o tempo.
- **Ferramenta MCP**: `get_goal_history` que mostra em quais meses você mais contribuiu, permitindo que o OpenClaw dê parabéns ou "puxe sua orelha" baseado na consistência histórica.
