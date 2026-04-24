# Ideia: Scenario Engine (Simulação de Futuro)

Mudar a percepção do usuário de "o que aconteceu" para "o que pode acontecer".

## 1. Eventos Hipotéticos
- **Simulação de Fluxo:** Criar eventos temporários (Ex: "Compra de Carro", "Aumento de Salário") que não existem no banco de dados real.
- **Gráfico de Comparação:** A projeção de saldo (`BalanceProjection`) ganha uma segunda linha pontilhada mostrando o impacto do cenário simulado vs. a realidade atual.

## 2. Guardrails (Limites de Segurança)
- **Zonas de Perigo:** Definir um valor de "Saldo Mínimo de Segurança". Se a projeção de 6 ou 12 meses tocar nesse valor, o sistema emite um alerta visual.
- **Lookahead Period:** Configurar quão longe o sistema deve tentar prever o futuro (de 1 a 24 meses).
