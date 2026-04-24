# Funcionalidades

Descricao completa de todas as funcionalidades da aplicacao Gravel Finance.

---

## 1. Dashboard (Visao Geral)

Pagina principal com resumo da saude financeira do mes.

**Ritmo de Gastos**: grafico de linhas comparando o acumulo de gastos do mes atual (linha solida) com o mesmo periodo do mes anterior (linha pontilhada). Mostra quanto o usuario esta abaixo ou acima em relacao ao mes passado, em valor absoluto e percentual. Link direto para Transacoes.

**Patrimonio Liquido**: valor atual do patrimonio com seletor de periodo (1M, 3M, 6M, 1Y, ALL). Grafico de area mostrando a evolucao historica. Link para Portfolio.

**Resultado Parcial**: saldo do mes (receita menos despesa), indicador de variacao percentual, barra de progresso visual entre receita e gasto. Detalhamento em Receita, Gasto e Excluido. Secao interna "Esperado Este Mes" lista receitas recorrentes previstas.

**Principais Categorias**: tabela com as categorias de maior gasto no mes. Colunas: nome, valor atual, barra de comparacao com mes anterior, variacao percentual, valor anterior. Link para Categorias.

**Transacoes Recentes**: ultimas 8 transacoes agrupadas por data. Cada linha mostra descricao, badge de categoria, valor colorido (verde/vermelho), conta e data. Link para Transacoes.

**Proximas Despesas**: despesas recorrentes previstas. Mostra nome, categoria, frequencia, valor e proxima data. Link para Recorrencias.

---

## 2. Contas

Gerenciamento das contas bancarias e cartoes conectados.

**Resumo**: cards com saldo total, total em bancos e total em cartoes.

**Cartoes de Credito**: lista de cartoes com avatar da instituicao, nome, valor atual da fatura, barra de alocacao percentual e saldo.

**Contas Bancarias**: lista de contas correntes/poupanca com logo, nome, tipo e saldo. Total da secao no rodape.

**Detalhes**: ao clicar em uma conta, abre painel lateral (Sheet) com tipo, saldo, moeda, numero mascarado, alocacao e link para transacoes filtradas.

**Adicionar Conta**: botao que redireciona para a pagina de Conexoes (Pluggy).

---

## 3. Transacoes

Listagem e gerenciamento de todas as transacoes financeiras.

**Filtros**: periodo (Este mes, Mes passado, Ultimos 30 dias, Ultimos 3 meses), tipo (Todos, Despesas, Receitas), categoria (dropdown), conta (via URL params para cross-page filtering).

**Busca**: campo de busca textual em tempo real por descricao.

**Totalizadores**: contagem total, total de despesas (vermelho), total de receitas (verde), resultado liquido.

**Tabela**: colunas Descricao, Categoria (badge colorido), Conta, Data, Valor. Agrupamento visual por data. Valores coloridos por tipo. Paginacao com seletor de itens por pagina.

**Detalhes**: clicar em uma linha abre Sheet com valor, descricao, data/hora, categoria, conta e tipo.

**Criar Transacao**: endpoint POST `/api/domain/transactions/create` para criacao manual com provider MANUAL.

**Editar Transacao**: endpoint PUT para alterar categoria, descricao ou marcar como ignorada (excluir dos relatorios).

**Exportar CSV**: endpoint GET `/api/domain/transactions/export` gera arquivo CSV com colunas Data, Descricao, Valor, Tipo, Categoria, Conta, Comerciante.

---

## 4. Faturas

Acompanhamento das faturas de cartao de credito.

**Navegacao de Mes**: setas para navegar entre meses.

**Resumo**: card com total de todas as faturas, contagem de abertas (amarelo), vencidas (vermelho) e pagas (azul).

**Cards por Cartao**: cada cartao mostra avatar da instituicao, nome, badge de status, data de vencimento com label relativa ("Vence em breve", "Vencida", "Paga"), pagamento minimo e valor total.

**Ver Transacoes**: link em cada card filtrando transacoes pelo cartao e mes.

---

## 5. Fluxo de Caixa

Analise do movimento de dinheiro com comparativo de periodos.

**Filtro de Periodo**: dropdown com Ultimos 3 meses, 6 meses, Este ano, 12 meses.

**Resultado Liquido**: valor acumulado no periodo com variacao percentual. Grafico de linha com evolucao dia a dia. Pontos vermelhos em meses negativos.

**Gastos**: total de gastos com comparativo percentual. Grafico de barras por mes.

**Receitas**: total de receitas com comparativo percentual. Grafico de barras por mes.

---

## 6. Categorias

Organizacao e gestao de categorias, tags e automacoes.

### Aba Categorias

**Resumo Mensal**: seletor de mes com setas, grafico de rosca (donut) mostrando distribuicao de gastos entre categorias. Total do mes em destaque.

**Tabela**: nome da categoria (com ponto colorido), contagem de transacoes, barra de progresso relativa ao total, valor gasto, percentual do total. Ordenada por valor decrescente.

### Aba Tags

**Lista de Tags**: grid de cards com ponto colorido e nome da tag. Cada tag tem opcoes de editar e excluir.

**Nova Tag**: dialog com campos nome e cor (hex). Criacao via POST `/api/tags`.

**CRUD Completo**: criar, editar, excluir tags. Tags podem ser associadas a transacoes via `/api/transactions/:id/tags`.

### Aba Automacoes

**Regras de Categorizacao**: tabela com Campo (descricao, nome do comerciante, CNPJ, categoria do provider), Tipo (exato, contem, prefixo, regex), Valor, Categoria de destino, Prioridade, Status ativo/inativo.

**Nova Automacao**: dialog com dropdowns para campo e tipo de correspondencia, input para valor, seletor de categoria de destino e prioridade numerica.

**Toggle Ativo/Inativo**: clicar no badge de status alterna entre ativo e inativo.

---

## 7. Metas

Acompanhamento de objetivos financeiros de poupanca.

**Estado Vazio**: mensagem "Nenhuma meta ainda" com botao "Nova Meta".

**Resumo**: cards com total guardado, total alvo e progresso geral (barra + percentual).

**Cards de Metas**: cada meta mostra emoji + nome, barra de progresso colorida (verde > 75%, amarelo > 50%), "R$ X de R$ Y", badge de percentual, contribuicao mensal, data alvo com dias restantes, estimativa de conclusao baseada na contribuicao mensal.

**Criar/Editar**: dialog com campos nome, emoji, valor alvo, valor atual, contribuicao mensal, data alvo.

**Adicionar Valor**: botao "+" em cada card abre dialog para incrementar o valor atual.

**Excluir**: soft delete (marca como inativa).

---

## 8. Recorrencias (Visao Geral)

Cobracas recorrentes detectadas automaticamente: assinaturas, contas fixas e parcelas.

**Resumo**: cards com total mensal, total de despesas recorrentes e quantidade de itens.

**Grafico Anual**: barras agrupadas mostrando mes a mes o volume em contas fixas vs parcelas.

**Contas Fixas**: lista de assinaturas e cobracas mensais com nome, badge de categoria, badge de frequencia (Mensal, Quinzenal, Semanal), valor e indicador de confianca.

**Parcelas**: lista de parcelamentos com nome, barra de progresso (parcela atual/total), valor.

**Deteccao Automatica**: o sistema detecta recorrencias analisando padroes de transacoes. Criterios: minimo 3 ocorrencias, intervalo mensal (25-35 dias), variacao de valor ate 15% ou R$ 20.

---

## 9. Receitas Recorrentes

Sub-pagina de recorrencias dedicada a receitas.

**Resumo**: total mensal de receitas recorrentes e contagem.

**Grafico**: barras verdes mostrando total de receitas por mes.

**Lista**: itens recorrentes de receita com nome, badge de frequencia, proxima data com label relativa e valor.

---

## 10. Despesas Recorrentes

Sub-pagina de recorrencias dedicada a despesas.

**Resumo**: total mensal de despesas recorrentes e contagem.

**Grafico**: barras vermelhas mostrando total de despesas por mes.

**Lista**: itens recorrentes de despesa com nome, badge de categoria, badge de frequencia, proxima data e valor.

---

## 11. Projecao de Saldo

Simulacao financeira futura baseada nos dados do usuario.

**Seletor de Horizonte**: botoes 3M, 6M, 12M.

**Cards de Insights**: ate 3 cards informativos gerados a partir dos dados. Exemplos: parcelas que terminam em breve, despesas acima da receita, margem de seguranca.

**Resumo**: saldo atual, saldo projetado final, variacao.

**Grafico Composto**: barras agrupadas por mes mostrando receitas (verde), recorrencias (vermelho), parcelas (laranja), gastos variaveis (cinza). Linha pontilhada verde para saldo projetado.

**Tabela Detalhada**: expansivel mes a mes. Componentes: Saldo Inicial, Receitas, Recorrencias, Parcelas, Variavel, Resultado. Cada linha mostra valor e badge positivo/negativo.

---

## 12. Patrimonio (Portfolio)

Visao consolidada do patrimonio liquido.

**Patrimonio Liquido**: valor total em destaque, com detalhamento em Ativos e Dividas.

**Historico**: grafico de area com seletor de periodo (1M, 3M, YTD, 1Y, ALL).

**Abas Ativos/Dividas**: cada aba mostra barra colorida de alocacao proporcional e tabela com Nome, Peso (%), Valor. Agrupamento por tipo (Caixa, Investimentos, Crypto, etc.).

---

## 13. Crypto

Painel de criptomoedas com metricas de performance.

**KPIs**: cards com Valor Total, Total Investido, P&L Total, P&L Percentual. Cores: verde positivo, vermelho negativo.

**Alocacao**: grafico de rosca (PieChart) mostrando distribuicao por ativo.

**Destaques**: melhor e pior performer com nome, valor e variacao.

**Tabela de Ativos**: colunas Ativo (com badge de simbolo), Quantidade, Preco Atual, Preco Medio, Valor, P&L Nao Realizado, P&L Realizado. Valores coloridos por performance.

**Calculos**: custo medio movel, PnL realizado (por venda com custo medio removido), PnL nao realizado (valor atual menos custo base). Comissoes consideradas no custo quando pagas em quote asset e na quantidade quando pagas no proprio ativo.

---

## 14. Investimentos

Visualizacao de investimentos tradicionais (renda fixa, fundos, etc.).

**Resumo**: total investido, numero de posicoes, distribuicao por tipo.

**Tabela por Tipo**: investimentos agrupados por tipo (Renda Fixa, Fundos, etc.) com sub-total por grupo. Colunas: Nome, Tipo (badge), Subtipo, Saldo, Status (badge verde/cinza).

---

## 15. Comerciantes

Ranking de gastos por comerciante/estabelecimento.

**Resumo**: total de comerciantes, total gasto, total de transacoes.

**Busca**: campo de pesquisa por nome.

**Tabela**: Comerciante, CNPJ (mascarado XX.XXX.XXX/XXXX-XX), Transacoes, Total Gasto, Percentual do total. Ordenada por valor decrescente. Linhas clicaveis redirecionam para transacoes filtradas.

---

## 16. Relatorios

Analises aprofundadas e comparativos financeiros.

**Filtro de Periodo**: dropdown (Ultimos 3 meses, 6 meses, Este ano, 12 meses).

**Total Gasto**: valor em destaque com comparativo percentual vs periodo anterior. Detalhamento de receitas e despesas com indicadores de tendencia.

**Gastos por Categoria**: grafico de rosca interativo com distribuicao por categoria. Lista lateral com nome, ponto colorido e valor.

**Resultado Parcial**: saldo liquido com variacao, barra de progresso (despesas como % da receita), breakdown em Receitas e Despesas.

**Diagrama Sankey**: visualizacao de fluxo com d3-sankey. Mostra Receitas fluindo para Despesas e depois ramificando para cada categoria de gasto. Cada fluxo e proporcional ao valor. Nodes mostram nome e valor. Links com opacidade e hover interativo.

---

## 17. Sincronizacao

Monitoramento e controle dos provedores de dados.

**Cards de Providers**: Pluggy e Binance, cada um mostrando status (SUCCESS/ERROR/RUNNING com badge colorido), ultimo sync (tempo relativo), itens conectados (Pluggy). Botao "Sincronizar" que dispara sync completo.

**Contagens do Dominio**: grid com Contas, Transacoes, Faturas, Investimentos, Crypto e Recorrencias, cada um com icone e contagem.

**Historico de Sync**: tabela com ultimas execucoes combinadas. Colunas: Provider (badge), Recurso, Status (badge), Trigger, Inicio, Duracao, Erro.

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
