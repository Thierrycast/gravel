# Funcionalidades

O Gravel Finance OS organiza as telas em quatro pilares: confiança do dado, decisão assistida, execução operacional e experiência premium.

## Telas principais

- `/`: dashboard com KPIs explicáveis, drill-downs consistentes, gráfico comparativo, fluxo e categorias.
- `/transactions`: lista unificada de transações com filtros por período, direção, categoria, conta, comerciante e filtros semânticos.
- `/inbox`: central de pendências acionáveis para revisar dados que podem distorcer cálculos.
- `/monthly-close`: checklist de fechamento do mês com progresso e resumo persistente.
- `/recurring`: recorrências e parcelas detectadas.
- `/cash-flow`: leitura de caixa por período.
- `/accounts`, `/bills`, `/portfolio`, `/investments`, `/crypto`: contas, faturas e patrimônio.
- `/reports`: relatórios de competência e caixa.
- `/settings`: preferências, financeiro, segurança e integrações.
- `/connect`: conexões Pluggy/Open Finance com status humano.

## KPIs explicáveis

Os cards financeiros importantes mostram composição com fórmula, período, fonte, inclusões, exclusões e link para listagem filtrada. Entradas e saídas usam filtros semânticos que batem exatamente com os totais exibidos.

## Inbox Financeira

Detecções iniciais:

- transações sem categoria confiável;
- transferências internas ambíguas;
- pagamentos de fatura possivelmente classificados como gasto operacional;
- recorrências com baixa confiança;
- salário não confirmado;
- conexões atrasadas ou com erro;
- faturas próximas;
- metas em risco.

Cada item tem severidade, impacto, origem, ação primária, ação secundária e status.

## Fechamento do mês

O fechamento mensal guia a revisão de receitas, transferências internas, pagamentos de fatura, categorias, recorrências, faturas e metas. A conclusão salva um resumo em `UserSetting.dashboardConfigJson`.
