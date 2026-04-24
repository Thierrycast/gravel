# Ideia: Ecossistema Local e Ativos Reais

Expandir o Gravel para ser o centro de controle de todo o patrimônio, não apenas o que está em APIs.

## 1. Gravel Local Node
- **Acesso Multi-dispositivo:** Ativar um modo "Servidor Local" onde o app gera um QR Code/Link. Você pode acessar o dashboard pelo celular ou tablet desde que esteja no mesmo Wi-Fi, mantendo a soberania total dos dados (zero cloud).

## 2. Ciclo de Vida de Ativos Físicos
- **Ativos Depreciáveis:** Cadastro de bens como Veículos e Eletrônicos.
- **Tabelas de Depreciação:** O sistema aplica automaticamente a queda de valor mensal (ex: 1% ao mês para carros) para que o Patrimônio Líquido reflita o valor real de mercado, não o valor de compra.
- **Ativos Imobiliários:** Tracking de valorização estimada de imóveis vs. custos de manutenção e impostos (IPTU).

## 3. Physical Ticker Support
- **API de Display:** Uma rota de API simples (`/api/metrics/compact`) para que o usuário possa integrar um display físico (ESP32/Raspberry Pi) na sua mesa que mostra o Net Worth ou o preço do BTC em tempo real, puxando os dados do Gravel.
