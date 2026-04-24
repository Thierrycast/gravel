# Ideia: Inteligência e Automação (AI Copilot)

Utilizar a infraestrutura de dados do Gravel para gerar insights automáticos.

## 1. AI Analytics & Context
- **Briefing Automático:** Gerar um resumo em texto sobre a saúde financeira do período usando o motor de `analytics.ts`.
- **Interface para Prompt-Packs:** O Gravel já possui comandos CLI para extrair dados para IAs. Esta ideia propõe levar isso para a UI, permitindo "Conversar com seus Dados" (via OpenAI/Anthropic ou Ollama local).

## 3. Behavioral Nudges (O "Se liga!")
Transformar dados frios em provocações comportamentais para o usuário.
- **Budget Guardrail:** Alerta agressivo na Dashboard se o gasto em categorias "não-essenciais" (Lazer, iFood, Compras) ultrapassar a média histórica na primeira quinzena. Ex: *"Se liga! Você já queimou 75% do seu orçamento de 'estilo de vida' e ainda é dia 12."*
- **Custo de Oportunidade:** Exibir mensagens de reflexão: *"Suas taxas bancárias acumuladas no ano (R$ X) comprariam 0.00Y BTC hoje. Já pensou em mudar de conta?"*
- **Análise de Tendência de 'Besteiras':** Identificar estabelecimentos que são "vazios de caixa" (pequenos gastos repetitivos que somam muito no fim do mês).
