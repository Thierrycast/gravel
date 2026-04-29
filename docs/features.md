# Funcionalidades

Descrição completa de todas as funcionalidades da aplicação Gravel Finance.

---

## 1. Dashboard (Visão Geral)

Pagina principal com resumo da saúde financeira do mes.

**Ritmo de Gastos**: gráfico de linhas comparando o acumulo de gastos do mes atual (linha solida) com o mesmo periodo do mes anterior (linha pontilhada). Mostra quanto o usuário esta abaixo ou acima em relacao ao mes passado, em valor absoluto e percentual. Link direto para Transações.

**Patrimônio Líquido**: valor atual do patrimonio com seletor de periodo (1M, 3M, 6M, 1Y, ALL). Gráfico de area mostrando a evolução historica. Link para Portfolio.

**Resultado Parcial**: saldo do mes (receita menos despesa), indicador de variacao percentual, barra de progresso visual entre receita e gasto. Detalhamento em Receita, Gasto e Excluído. Seção interna "Esperado Este Mes" lista receitas recorrentes previstas.

**Principais Categorias**: tabela com as categorias de maior gasto no mes. Colunas: nome, valor atual, barra de comparacao com mes anterior, variacao percentual, valor anterior. Link para Categorias.

**Transações Recentes**: últimas 8 transações agrupadas por data. Cada linha mostra descricao, badge de categoria, valor colorido (verde/vermelho), conta e data. Link para Transações.

**Proximas Despesas**: despesas recorrentes previstas. Mostra nome, categoria, frequencia, valor e proxima data. Link para Recorrências.

---

## 2. Contas

Gerenciamento das contas bancarias e cartões conectados.

**Resumo**: cards com saldo total, total em bancos e total em cartões.

**Cartoes de Credito**: lista de cartões com avatar da instituicao, nome, valor atual da fatura, barra de alocacao percentual e saldo.

**Contas Bancarias**: lista de contas correntes/poupança com logo, nome, tipo e saldo. Total da seção no rodape.

**Detalhes**: ao clicar em uma conta, abre painel lateral (Sheet) com tipo, saldo, moeda, numero mascarado, alocacao e link para transações filtradas.

**Adicionar Conta**: botao que redireciona para a pagina de Conexoes (Pluggy).

---

## 3. Transações

Listagem e gerenciamento de todas as transações financeiras.

**Filtros**: periodo (Este mes, Mes passado, Últimos 30 dias, Últimos 3 meses), tipo (Todos, Despesas, Receitas), categoria (dropdown), conta (via URL params para cross-page filtering).

**Busca**: campo de busca textual em tempo real por descricao.

**Totalizadores**: contagem total, total de despesas (vermelho), total de receitas (verde), resultado liquido.

**Tabela**: colunas Descrição, Categoria (badge colorido), Conta, Data, Valor. Agrupamento visual por data. Valores coloridos por tipo. Paginacao com seletor de itens por pagina.

**Detalhes**: clicar em uma linha abre Sheet com valor, descricao, data/hora, categoria, conta e tipo.

**Criar Transacao**: endpoint POST `/api/domain/transactions/create` para criação manual com provider MANUAL.

**Editar Transacao**: endpoint PUT para alterar categoria, descricao ou marcar como ignorada (excluir dos relatórios).

**Exportar CSV**: endpoint GET `/api/domain/transactions/export` gera arquivo CSV com colunas Data, Descrição, Valor, Tipo, Categoria, Conta, Comerciante.

---

## 4. Faturas

Acompanhamento das faturas de cartao de credito.

**Navegação de Mes**: setas para navegar entre meses.

**Resumo**: card com total de todas as faturas, contagem de abertas (amarelo), vencidas (vermelho) e pagas (azul).

**Cards por Cartao**: cada cartao mostra avatar da instituicao, nome, badge de status, data de vencimento com label relativa ("Vence em breve", "Vencida", "Paga"), pagamento minimo e valor total.

**Ver Transações**: link em cada card filtrando transações pelo cartao e mes.

---

## 5. Fluxo de Caixa

Análise do movimento de dinheiro com comparativo de periodos.

**Filtro de Periodo**: dropdown com Últimos 3 meses, 6 meses, Este ano, 12 meses.

**Resultado Líquido**: valor acumulado no periodo com variacao percentual. Gráfico de linha com evolução dia a dia. Pontos vermelhos em meses negativos.

**Gastos**: total de gastos com comparativo percentual. Gráfico de barras por mes.

**Receitas**: total de receitas com comparativo percentual. Gráfico de barras por mes.

---

## 6. Categorias

Organizacao e gestao de categorias, tags e automações.

### Aba Categorias

**Resumo Mensal**: seletor de mes com setas, gráfico de rosca (donut) mostrando distribuição de gastos entre categorias. Total do mes em destaque.

**Tabela**: nome da categoria (com ponto colorido), contagem de transações, barra de progresso relativa ao total, valor gasto, percentual do total. Ordenada por valor decrescente.

### Aba Tags

**Lista de Tags**: grid de cards com ponto colorido e nome da tag. Cada tag tem opções de editar e excluir.

**Nova Tag**: dialog com campos nome e cor (hex). Criação via POST `/api/tags`.

**CRUD Completo**: criar, editar, excluir tags. Tags podem ser associadas a transações via `/api/transactions/:id/tags`.

### Aba Automações

**Regras de Categorizacao**: tabela com Campo (descricao, nome do comerciante, CNPJ, categoria do provider), Tipo (exato, contem, prefixo, regex), Valor, Categoria de destino, Prioridade, Status ativo/inativo.

**Nova Automacao**: dialog com dropdowns para campo e tipo de correspondencia, input para valor, seletor de categoria de destino e prioridade numerica.

**Toggle Ativo/Inativo**: clicar no badge de status alterna entre ativo e inativo.

---

## 7. Metas

Acompanhamento de objetivos financeiros de poupança.

**Estado Vazio**: mensagem "Nenhuma meta ainda" com botao "Nova Meta".

**Resumo**: cards com total guardado, total alvo e progresso geral (barra + percentual).

**Cards de Metas**: cada meta mostra emoji + nome, barra de progresso colorida (verde > 75%, amarelo > 50%), "R$ X de R$ Y", badge de percentual, contribuicao mensal, data alvo com dias restantes, estimativa de conclusao baseada na contribuicao mensal.

**Criar/Editar**: dialog com campos nome, emoji, valor alvo, valor atual, contribuicao mensal, data alvo.

**Adicionar Valor**: botao "+" em cada card abre dialog para incrementar o valor atual.

**Excluir**: soft delete (marca como inativa).

---

## 8. Recorrências (Visão Geral)

Cobracas recorrentes detectadas automaticamente: assinaturas, contas fixas e parcelas.

**Resumo**: cards com total mensal, total de despesas recorrentes e quantidade de itens.

**Gráfico Anual**: barras agrupadas mostrando mes a mes o volume em contas fixas vs parcelas.

**Contas Fixas**: lista de assinaturas e cobracas mensais com nome, badge de categoria, badge de frequencia (Mensal, Quinzenal, Semanal), valor e indicador de confianca.

**Parcelas**: lista de parcelamentos com nome, barra de progresso (parcela atual/total), valor.

**Detecção Automatica**: o sistema detecta recorrências analisando padroes de transações. Criterios: minimo 3 ocorrencias, intervalo mensal (25-35 dias), variacao de valor ate 15% ou R$ 20.

---

## 9. Receitas Recorrentes

Sub-pagina de recorrências dedicada a receitas.

**Resumo**: total mensal de receitas recorrentes e contagem.

**Gráfico**: barras verdes mostrando total de receitas por mes.

**Lista**: itens recorrentes de receita com nome, badge de frequencia, proxima data com label relativa e valor.

---

## 10. Despesas Recorrentes

Sub-pagina de recorrências dedicada a despesas.

**Resumo**: total mensal de despesas recorrentes e contagem.

**Gráfico**: barras vermelhas mostrando total de despesas por mes.

**Lista**: itens recorrentes de despesa com nome, badge de categoria, badge de frequencia, proxima data e valor.

---

## 11. Projeção de Saldo

Simulação financeira futura baseada nos dados do usuário.

**Seletor de Horizonte**: botoes 3M, 6M, 12M.

**Cards de Insights**: ate 3 cards informativos gerados a partir dos dados. Exemplos: parcelas que terminam em breve, despesas acima da receita, margem de seguranca.

**Resumo**: saldo atual, saldo projetado final, variacao.

**Gráfico Composto**: barras agrupadas por mes mostrando receitas (verde), recorrências (vermelho), parcelas (laranja), gastos variaveis (cinza). Linha pontilhada verde para saldo projetado.

**Tabela Detalhada**: expansivel mes a mes. Componentes: Saldo Inicial, Receitas, Recorrências, Parcelas, Variavel, Resultado. Cada linha mostra valor e badge positivo/negativo.

---

## 12. Patrimônio (Portfolio)

Visão consolidada do patrimonio liquido.

**Patrimônio Líquido**: valor total em destaque, com detalhamento em Ativos e Dividas.

**Histórico**: gráfico de area com seletor de periodo (1M, 3M, YTD, 1Y, ALL).

**Abas Ativos/Dividas**: cada aba mostra barra colorida de alocacao proporcional e tabela com Nome, Peso (%), Valor. Agrupamento por tipo (Caixa, Investimentos, Crypto, etc.).

---

## 13. Crypto

Painel de criptomoedas com métricas de performance.

**KPIs**: cards com Valor Total, Total Investido, P&L Total, P&L Percentual. Cores: verde positivo, vermelho negativo.

**Alocacao**: gráfico de rosca (PieChart) mostrando distribuição por ativo.

**Destaques**: melhor e pior performer com nome, valor e variacao.

**Tabela de Ativos**: colunas Ativo (com badge de simbolo), Quantidade, Preço Atual, Preço Medio, Valor, P&L Não Realizado, P&L Realizado. Valores coloridos por performance.

**Calculos**: custo medio móvel, PnL realizado (por venda com custo medio removido), PnL não realizado (valor atual menos custo base). Comissoes consideradas no custo quando pagas em quote asset e na quantidade quando pagas no proprio ativo.

---

## 14. Investimentos

Visualização de investimentos tradicionais (renda fixa, fundos, etc.).

**Resumo**: total investido, numero de posicoes, distribuição por tipo.

**Tabela por Tipo**: investimentos agrupados por tipo (Renda Fixa, Fundos, etc.) com sub-total por grupo. Colunas: Nome, Tipo (badge), Subtipo, Saldo, Status (badge verde/cinza).

---

## 15. Comerciantes

Ranking de gastos por comerciante/estabelecimento.

**Resumo**: total de comerciantes, total gasto, total de transações.

**Busca**: campo de pesquisa por nome.

**Tabela**: Comerciante, CNPJ (mascarado XX.XXX.XXX/XXXX-XX), Transações, Total Gasto, Percentual do total. Ordenada por valor decrescente. Linhas clicaveis redirecionam para transações filtradas.

---

## 16. Relatórios

Analises aprofundadas e comparativos financeiros.

**Filtro de Periodo**: dropdown (Últimos 3 meses, 6 meses, Este ano, 12 meses).

**Total Gasto**: valor em destaque com comparativo percentual vs periodo anterior. Detalhamento de receitas e despesas com indicadores de tendencia.

**Gastos por Categoria**: gráfico de rosca interativo com distribuição por categoria. Lista lateral com nome, ponto colorido e valor.

**Resultado Parcial**: saldo liquido com variacao, barra de progresso (despesas como % da receita), breakdown em Receitas e Despesas.

**Diagrama Sankey**: visualização de fluxo com d3-sankey. Mostra Receitas fluindo para Despesas e depois ramificando para cada categoria de gasto. Cada fluxo e proporcional ao valor. Nodes mostram nome e valor. Links com opacidade e hover interativo.

---

## 17. Sincronização

Monitoramento e controle dos provedores de dados.

**Cards de Providers**: Pluggy e Binance, cada um mostrando status (SUCCESS/ERROR/RUNNING com badge colorido), ultimo sync (tempo relativo), itens conectados (Pluggy). Botao "Sincronizar" que dispara sync completo.

**Contagens do Dominio**: grid com Contas, Transações, Faturas, Investimentos, Crypto e Recorrências, cada um com icone e contagem.

**Histórico de Sync**: tabela com últimas execucoes combinadas. Colunas: Provider (badge), Recurso, Status (badge), Trigger, Inicio, Duração, Erro.

---

## 19. Security Vault (Cofre de Seguran\u00e7a)

Prote\u00e7\u00e3o da interface contra acesso n\u00e3o autorizado localmente.
- **Lockscreen**: Bloqueio global da interface exigindo a senha mestre para desbloqueio.
- **Panic Key**: Atalho instant\u00e2neo (tecla `ESC`) que trava o sistema e oculta dados imediatamente.
- **Auto-Lock**: Bloqueio autom\u00e1tico por inatividade, configur\u00e1vel nas configura\u00e7\u00f5es.
- **Persist\u00eancia**: A senha mestre \u00e9 armazenada de forma segura e criptografada no banco de dados.

---

## 20. AI Insights & Forensics

An\u00e1lises inteligentes e detec\u00e7\u00e3o de anomalias estat\u00edsticas.
- **Behavioral Nudges**: Alertas no Dashboard sobre ritmo de gastos e custo de oportunidade (ex: "Taxas banc\u00e1rias vs BTC").
- **Lei de Benford**: Gr\u00e1fico de distribui\u00e7\u00e3o de d\u00edgitos para identificar anomalias ou manipula\u00e7\u00e3o de dados financeiros.
- **Detector de Assinaturas**: Identifica servi\u00e7os recorrentes ocultos que possuem varia\u00e7\u00e3o de valor (ex: assinaturas com taxas vari\u00e1veis).

---

## 21. Scenario Engine (Motor de Cen\u00e1rios)

Simula\u00e7\u00e3o de impactos financeiros futuros e gest\u00e3o de d\u00edvidas informais.
- **Proje\u00e7\u00f5es de Cen\u00e1rio**: Linha pontilhada no gr\u00e1fico de patrim\u00f4nio que simula eventos hipot\u00e9ticos (ex: "Se eu comprar um carro em Junho").
- **Cofre de Amigos (Lends)**: Registro e controle de dinheiro emprestado ou a receber de terceiros.
- **Integra\u00e7\u00e3o de Sal\u00e1rio**: Proje\u00e7\u00e3o de saldo considerando receitas fixas futuras configuradas pelo usu\u00e1rio.

---

## 22. Themes & Customization

Personaliza\u00e7\u00e3o profunda da experi\u00eancia visual.
- **Temas Premium**: Suporte a temas como Cyberpunk (Neon), Emerald (Verde Premium) e Dark Mode absoluto.
- **Configura\u00e7\u00f5es Core**: Controle centralizado de sal\u00e1rio mensal, visibilidade de widgets e prefer\u00eancias de sincroniza\u00e7\u00e3o.
- **Identidade Visual**: Logo premium din\u00e2mico em SVG e interface otimizada para legibilidade.
