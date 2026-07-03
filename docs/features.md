# Funcionalidades

O Gravel Finance OS organiza as telas em quatro pilares: confiança do dado, decisão assistida, execução operacional e experiência premium.

## Telas principais

- `/`: dashboard com KPIs explicáveis, drill-downs consistentes, gráfico comparativo, fluxo e categorias.
- `/transactions`: lista unificada de transações com filtros por período, direção, categoria, conta, comerciante e filtros semânticos.
- `/inbox`: central de pendências acionáveis para revisar dados que podem distorcer cálculos.
- `/monthly-close`: checklist de fechamento do mês com progresso e resumo persistente.
- `/recurring`: recorrências e parcelas detectadas; `/recurring/income` tem CRUD completo de receitas recorrentes manuais.
- `/cash-flow`: leitura de caixa por período.
- `/accounts`: contas e cartões; cartões mostram fatura atual (por ciclo), próximas, total em aberto e status, com configuração de fechamento/vencimento.
- `/bills`: faturas por cartão calculadas pelo motor de ciclo — fatura atual em destaque, próximas, histórico e alerta de vencidas.
- `/portfolio`, `/investments`, `/crypto`: patrimônio.
- `/projection`: projeção mensal com componentes separados (recorrências, faturas de cartão, parcelas, variável), ajuste do mês corrente e alertas (saldo negativo, faturas vencidas, capacidade de poupança vs metas).
- `/playground`: simulações; hipóteses locais (navegador) e cenários salvos (afetam projeções). `/scenarios` redireciona para cá.
- `/people`: pessoas e valores emprestados a receber.
- `/goals`: metas com previsão de conclusão e alerta de ritmo insuficiente.
- `/reports`: relatórios de competência e caixa + relatórios consolidados (receitas vs despesas 12m, saúde financeira, gastos por conta, faturas por mês, maiores gastos, variação por categoria, recorrências).
- `/settings`: preferências por seções (financeiro, cartões de crédito, salário, aparência, segurança, sincronização, dados e cache).
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
