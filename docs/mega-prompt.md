PROMPT_FINAL:

````md
CONTEXTO

Estamos evoluindo a aplicação de finanças/investimentos. Existem bugs importantes de lógica financeira, enriquecimento de dados incompleto e alguns problemas visuais/arquiteturais. O objetivo não é fazer um ajuste isolado, mas revisar o fluxo inteiro para que os dados fiquem consistentes em todas as páginas.

Você pode usar multi-agents, Claude Code e Gemini CLI para delegar investigação, revisão e implementação. Use isso se ajudar a acelerar ou validar melhor as mudanças.

TAREFA PRINCIPAL

Faça uma revisão e implementação completa dos pontos abaixo, com cuidado para não quebrar funcionalidades existentes.

1. Corrigir lógica de parcelamento

Existe um caso em que duas transações foram separadas indevidamente, mas na verdade elas representam parcelas:
- uma parcela deste mês;
- outra parcela do próximo mês.

A lógica atual de parcelamento parece falha e não deve ser corrigida apenas na página de categorias.

Revise o comportamento de parcelamento em toda a aplicação:
- página de categorias;
- dashboard;
- listagens de transações;
- páginas individuais;
- relatórios/resumos;
- qualquer outro lugar onde transações parceladas sejam agrupadas, exibidas, somadas ou categorizadas.

Objetivo:
- identificar corretamente parcelas de uma mesma compra;
- evitar duplicidade visual ou contábil;
- garantir que cada parcela apareça no mês correto;
- garantir que o total, agrupamentos, filtros e categorias respeitem a lógica de parcelamento;
- revisar se existe diferença entre “transação original”, “parcela”, “compra parcelada” e “lançamento mensal”.

Se for necessário refatorar estruturas já feitas, faça.

2. Implementar serviço aprimorado de enriquecimento de logos com Logo.dev

Vamos integrar a Logo.dev para exibir logotipos de empresas/merchants.

Documentação base:
https://www.logo.dev/docs/integrations/in

Uso do CDN:
- URL base: `https://img.logo.dev/:domain`
- Sempre passar `token=LOGO_DEV_PUBLISHABLE_KEY`
- Exemplo:
  `https://img.logo.dev/nike.com?token=LOGO_DEV_PUBLISHABLE_KEY`

Uso da API Describe, somente quando necessário:
- Endpoint:
  `GET https://api.logo.dev/describe/:domain`
- Header:
  `Authorization: Bearer LOGO_DEV_SECRET_KEY`
- Essa API pode retornar dados como nome da empresa, descrição e redes sociais.

Variáveis de ambiente:
```env
LOGO_DEV_PUBLISHABLE_KEY=pk_...
LOGO_DEV_SECRET_KEY=sk_...
````

Importante:
Não faça requisições repetidas desnecessárias. Precisamos proteger a cota.

Implemente uma arquitetura inteligente:

* resolver o domínio correto a partir do nome do merchant/empresa;
* salvar/cachear o resultado enriquecido;
* reutilizar dados já armazenados;
* evitar chamadas repetidas para a Logo.dev;
* ter fallback quando o domínio não for encontrado;
* ter fallback visual quando não houver logo;
* separar claramente lógica de busca, cache, persistência e exibição;
* evitar chamadas diretas do frontend para dados sensíveis;
* nunca expor `LOGO_DEV_SECRET_KEY` no client.

Sugestão de abordagem:

* criar um serviço de enriquecimento de merchant/logo;
* criar ou ajustar tabela/modelo/camada de persistência para armazenar domínio, logo_url, nome normalizado, descrição, redes sociais, fonte do enriquecimento, data da última atualização e status;
* usar cache com expiração razoável;
* permitir reprocessamento manual ou automático quando necessário;
* evitar enriquecer novamente registros já resolvidos com sucesso recentemente.

3. Usar enriquecimento da Pluggy

Além da Logo.dev, vamos usar melhor o enriquecimento da própria Pluggy:

* categorias;
* informações de merchant;
* metadados disponíveis;
* possíveis dados de localização;
* qualquer informação útil já retornada pela Pluggy.

Primeiro implemente/organize o enriquecimento.
Depois implemente o uso dele nas telas.

Se já existir código de integração com Pluggy, revise e reaproveite.
Se estiver bagunçado ou limitado, refatore.

A ideia é ter uma camada mais confiável de dados enriquecidos, e não várias páginas tentando resolver essas informações de forma isolada.

4. Adicionar logo na página individual de cripto

Na página individual de uma criptomoeda, adicionar o logo dela.

Critérios:

* usar fonte confiável já disponível na aplicação, se existir;
* se fizer sentido, integrar ao mesmo padrão de enriquecimento visual;
* manter fallback visual elegante;
* garantir que não quebre quando a cripto não tiver logo.

5. Corrigir card de investimento na dashboard

Existe um bug no card de investimento da dashboard:

* ele está pegando investimento em USD;
* mas está exibindo como se fosse BRL.

Corrija a origem, conversão ou formatação.

Garanta que:

* valores em USD sejam exibidos como USD;
* valores em BRL sejam exibidos como BRL;
* conversões, se existirem, sejam explícitas e corretas;
* não haja mistura silenciosa de moedas;
* os cards e totais estejam coerentes.

6. Refinar badges

Os badges atuais estão muito quadrados.

Ajuste visual:

* adicionar arredondamento sutil;
* adicionar padding interno;
* melhorar alinhamento vertical/horizontal;
* avaliar `align-items: center` ou equivalente na coluna onde eles aparecem;
* manter o visual consistente com o estilo geral da aplicação.

Não exagerar. A ideia é um refinamento sutil e mais premium.

7. Corrigir sistema de temas

O sistema de temas feito anteriormente pelo Claude Code não está funcionando corretamente.

Investigue e corrija:

* troca de tema;
* persistência do tema escolhido;
* aplicação correta em todas as páginas;
* compatibilidade com refresh;
* possíveis conflitos entre CSS variables, Tailwind, classes globais ou provider de tema;
* comportamento em modo claro/escuro, se existir.

Garanta que o sistema fique estável.

8. Mapa com localização de vendedores/merchants

Se os dados enriquecidos da Pluggy ou de outra fonte trouxerem localização dos vendedores/merchants, implemente uma visualização de mapa.

Condições:

* só implemente se houver dados reais suficientes;
* não force uma feature fake;
* seguir o estilo visual da aplicação, com uma pegada meio “dev”, limpa e informativa;
* usar fallback quando não houver localização;
* evitar dependências pesadas sem necessidade.

9. Revisar demais páginas

Depois das alterações principais, revise as outras páginas da aplicação para garantir que:

* parcelamento esteja correto;
* logos/enriquecimento estejam sendo usados onde faz sentido;
* moedas estejam formatadas corretamente;
* tema esteja funcionando;
* componentes visuais estejam consistentes;
* não existam páginas antigas usando lógica duplicada ou desatualizada.

10. Qualidade, arquitetura e segurança

Regras importantes:

* não espalhar lógica de enriquecimento pelas views;
* evitar duplicação;
* criar serviços/helpers reutilizáveis;
* não expor secrets no frontend;
* preservar dados existentes;
* não quebrar fluxos atuais;
* adicionar tratamento de erro;
* adicionar fallback visual;
* adicionar logs úteis, mas sem poluir;
* revisar performance;
* revisar chamadas externas para evitar excesso de requisições;
* atualizar types/interfaces se necessário;
* atualizar documentação interna se fizer sentido.

11. Testes e validação

Antes de finalizar:

* rodar lint/typecheck/testes disponíveis;
* testar manualmente os fluxos principais;
* validar dashboard;
* validar categorias;
* validar transações parceladas;
* validar página individual de cripto;
* validar tema;
* validar cards de investimento;
* validar badges;
* validar comportamento sem internet/API externa, se aplicável.

12. Git e commits

Antes de começar, rode `git status` e entenda o que já está modificado.

Não descarte alterações existentes.

Ao final:

* commitar também as alterações que já estavam sem commit;
* commitar as novas alterações;
* organizar commits de forma minimamente coerente, se possível;
* incluir mensagens claras;
* garantir que o working tree fique limpo ou explicar exatamente o que ficou pendente.

FORMATO DE SAÍDA ESPERADO

Ao finalizar, entregue um relatório objetivo contendo:

1. Resumo do que foi implementado.
2. Arquivos principais alterados.
3. Como a nova lógica de parcelamento funciona.
4. Como o enriquecimento Logo.dev/Pluggy funciona.
5. Como o cache/persistência evita estouro de cota.
6. Correções visuais realizadas.
7. Bugs corrigidos.
8. Testes/checks executados e resultados.
9. Commits criados.
10. Pendências ou riscos, se houver.

IMPORTANTE

Não trate isso como uma tarefa pequena de UI.
É uma revisão estrutural de consistência financeira, enriquecimento de dados e qualidade visual da aplicação.

Se encontrar problemas relacionados durante a implementação, corrija ou registre claramente.
Priorize qualidade, consistência e arquitetura limpa.

```
```


eu ja adicionei as envs da logo entao pode implementar sem medo






Perfeito — abaixo vai um **mega prompt** já pronto para você colar na sua IA/coding agent, com contexto, objetivos, arquitetura, regras de implementação, fluxos, edge cases e referências da Pluggy. A ideia é manter o escopo enxuto: usar **apenas Pluggy** para categorias, merchant enrichment e rules, com sua camada local só como complemento visual e de UX. [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)

## Prompt

```text
Você vai implementar uma camada de enriquecimento transacional em uma aplicação de gestão financeira pessoal já integrada com Pluggy (Open Finance) e Binance.

Objetivo principal:
- Manter o escopo reduzido.
- NÃO adicionar novos providers de enrichment neste momento.
- Usar a Pluggy como fonte principal de enriquecimento para transações bancárias/Open Finance.
- Implementar uma arquitetura limpa, extensível e resiliente para:
  1) categorização de transações,
  2) merchant enrichment,
  3) regras locais de recategorização/normalização,
  4) UX consistente para lista, filtros, resumo e analytics.

Contexto do produto:
- A aplicação já possui dados financeiros vindos da Pluggy.
- A aplicação também possui integração com Binance, mas esta tarefa deve focar no enrichment das transações Pluggy/Open Finance.
- A meta é transformar transações brutas em transações inteligíveis para o usuário, sem aumentar muito a complexidade do sistema.
- A experiência desejada é parecida com apps modernos de finanças pessoais: descrição limpa, categoria útil, merchant quando disponível, e boa base para relatórios.

Contexto técnico da Pluggy:
- A Enrichment API da Pluggy é um serviço separado, mas usa a mesma autenticação dos serviços principais da Pluggy.[page:1]
- A Enrichment API permite enriquecer dados transacionais com categorization e merchant information.[page:1]
- O endpoint aceita até 5000 transações por request.[page:1]
- A acurácia melhora quando enviamos contexto adicional, por exemplo:
  - accountType = CHECKING ou CREDIT_CARD,[page:1]
  - isBusiness = true/false,[page:1]
  - paymentData com documento do pagador/recebedor (CPF/CNPJ),[page:1]
  - creditCardMetadata.payeeMCC para cartão, o que melhora bastante a categorização.[page:1]
- A resposta pode incluir:
  - id,
  - amount,
  - date,
  - description,
  - type,
  - merchant.name,
  - merchant.businessName,
  - merchant.cnpj,
  - category.[page:1]
- A categorização da Pluggy usa um campo category e categoryId nas transações, e category pode ser null quando não houver inferência.[page:2]
- As categorias Pluggy são organizadas em árvore, com nível pai e filhos, e existe tradução para português no catálogo de categorias via endpoint de categorias.[page:2]
- A Pluggy também suporta Category Rules específicas por client_id, e recategorizações podem gerar regras para usos futuros.[page:2]
- Se o recurso premium não estiver habilitado, category pode vir null para todas as transações; então a implementação deve ser tolerante a isso.[page:2]

O que implementar:
1. Modelo de domínio para transação enriquecida
Crie um modelo/DTO unificado chamado, por exemplo, EnrichedTransaction, com os seguintes grupos de campos:
- identity:
  - internalId
  - pluggyTransactionId
  - accountId
  - itemId
  - source = "pluggy"
- raw:
  - rawDescription
  - rawAmount
  - rawDate
  - rawType
  - rawCategory
  - rawCategoryId
- enrichment:
  - category
  - categoryId
  - categoryLabelPt
  - parentCategoryId
  - parentCategoryLabel
  - merchantName
  - merchantBusinessName
  - merchantCnpj
  - merchantDisplayName
  - merchantConfidence (nullable, local heuristic)
  - enrichmentStatus = enriched | partial | missing | failed
- normalization:
  - normalizedDescription
  - normalizedCounterparty
  - normalizedSign
  - normalizedChannel (pix, ted, boleto, card, cash, fee, transfer, purchase etc.)
- overrides:
  - userCategoryOverride
  - userMerchantOverride
  - effectiveCategory
  - effectiveMerchant
  - overrideSource = none | user | local_rule | pluggy_rule
- ui:
  - logoKey
  - colorKey
  - displayTitle
  - displaySubtitle
  - displayAmount
  - isRecurringCandidate
  - isTransferCandidate
- metadata:
  - lastEnrichedAt
  - enrichmentVersion
  - errors[]
  - debugPayload (somente ambiente dev)

2. Pipeline de enriquecimento
Implemente um pipeline determinístico em etapas:
- Etapa A: carregar transação bruta da Pluggy.
- Etapa B: normalização local leve da descrição.
  - Remover excesso de espaços.
  - Padronizar uppercase/lowercase.
  - Remover lixo comum de extrato, quando não destruir significado.
  - Preservar descrição original sempre.
- Etapa C: enviar para Enrichment API da Pluggy em lote.
  - Lotes de até 5000, ou menores por segurança operacional.
  - Incluir accountType quando conhecido.
  - Incluir isBusiness quando a conta for PJ.
  - Incluir paymentData quando existirem documentos do pagador/recebedor.
  - Incluir creditCardMetadata.payeeMCC em transações de cartão quando disponível.
- Etapa D: mesclar resposta enriquecida com transação local.
- Etapa E: aplicar regras locais de override apenas por cima do resultado Pluggy, nunca substituindo o raw.
- Etapa F: calcular campos derivados para UI e analytics.

3. Estratégia de precedência
Defina ordem de precedência clara:
- rawDescription = sempre preservado
- normalizedDescription = limpeza local
- merchantDisplayName:
  1) userMerchantOverride
  2) merchant.name da Pluggy
  3) merchant.businessName da Pluggy
  4) normalizedDescription
- effectiveCategory:
  1) userCategoryOverride
  2) regra local
  3) category da Pluggy
  4) "Não categorizado"
- effectiveMerchant:
  1) userMerchantOverride
  2) merchant.name da Pluggy
  3) merchant.businessName da Pluggy
  4) null

4. Catálogo de categorias
Implemente sincronização/cache do catálogo de categorias da Pluggy.
Objetivo:
- Resolver categoryId -> label EN/PT
- Resolver parentId -> parentDescription
- Montar árvore de categorias local
- Permitir filtro por categoria pai ou filha
- Permitir analytics agregados por nível 1, 2 e 3

Crie estrutura local como:
- categoriesById
- childrenByParentId
- translatedLabelById
- ancestryPathById

Use descriptionTranslated em português sempre que disponível.[page:2]

5. Regras locais mínimas
Implemente uma camada pequena de regras locais, sem competir com a Pluggy:
- Regras por match exato insensitive
- Regras por prefixo opcional
- Regras por combinação:
  - descrição + faixa de valor
  - descrição + accountType
  - descrição + sinal da transação
- Permitir override de:
  - categoria
  - merchant display name
  - flags especiais, ex.: transfer interna, recorrente, ignorar em relatórios

Importante:
- A regra local é complemento.
- Não criar engine excessivamente complexa.
- Persistir regras em tabela simples.
- Toda regra deve ser auditável.

6. Casos especiais
Trate explicitamente:
- category null
- merchant null
- cnpj ausente
- response parcial
- enrichment desabilitado no plano
- timeout/falha da Enrichment API
- duplicidade de transações
- reprocessamento idempotente
- transações antigas sendo reenriquecidas
- cartão de crédito vs conta corrente
- transferências entre contas do mesmo usuário
- PIX para PF com CPF, PIX para PJ com CNPJ
- pagamento de fatura de cartão
- cashback
- taxas bancárias
- investimentos e resgates
- estornos/refunds
- compras parceladas quando a descrição for ambígua

7. UX e produto
Implemente a UX com foco em legibilidade:
- Na lista de transações, exibir:
  - displayTitle = merchantDisplayName ou categoria amigável
  - displaySubtitle = categoria pai/filha ou descrição curta
  - rawDescription disponível em detalhe expandido
- Em detalhe da transação, exibir:
  - descrição original
  - descrição normalizada
  - categoria Pluggy
  - categoria efetiva
  - merchant name
  - business name
  - CNPJ quando disponível
  - origem do enrichment
  - se houve override manual
- Filtros:
  - período
  - conta
  - categoria pai
  - categoria filha
  - merchant
  - status de enriquecimento
- Resumos:
  - gastos por categoria pai
  - gastos por categoria filha
  - top merchants
  - transações não categorizadas
  - transações sem merchant
- Ações do usuário:
  - recategorizar
  - renomear merchant
  - marcar como transferência interna
  - marcar como recorrente
  - ocultar de analytics se necessário

8. Jobs e processamento
Crie dois modos:
- synchronous on-demand:
  - usado ao importar ou atualizar transações recentes
- background backfill:
  - usado para reenriquecer histórico

Implemente:
- fila ou scheduler
- controle de retry com backoff
- idempotência por pluggyTransactionId + enrichmentVersion
- logs estruturados
- métricas:
  - total enriquecidas
  - taxa de category null
  - taxa de merchant null
  - tempo médio de enriquecimento
  - taxa de erro por lote

9. Banco de dados
Sugestão de entidades/tabelas:
- transactions_raw
- transactions_enriched
- transaction_category_catalog
- transaction_override_rules
- transaction_user_overrides
- enrichment_jobs
- enrichment_job_items

Garanta:
- versionamento do enrichment
- rastreabilidade do payload original
- auditoria de overrides
- possibilidade de recomputar effectiveCategory/effectiveMerchant sem perder histórico

10. API interna da aplicação
Crie endpoints internos claros, por exemplo:
- POST /internal/enrichment/pluggy/run
- POST /internal/enrichment/pluggy/backfill
- GET /internal/categories
- GET /internal/transactions?filters...
- PATCH /internal/transactions/:id/category
- PATCH /internal/transactions/:id/merchant
- PATCH /internal/transactions/:id/flags
- GET /internal/transactions/:id

11. Qualidade e testes
Implemente testes para:
- mapeamento do payload Pluggy -> EnrichedTransaction
- precedência de overrides
- fallback quando category for null
- fallback quando merchant for null
- resolução de árvore de categorias
- regras locais
- reprocessamento idempotente
- falha parcial do lote
- timeout da Pluggy
- tradução/category label em PT
- detecção de regressão em nomes display

12. Não fazer agora
- Não integrar novos providers externos
- Não construir sistema complexo de scoring de merchant
- Não fazer OCR
- Não fazer geolocalização
- Não fazer enriquecimento manual por LLM
- Não unificar Binance nesta mesma pipeline agora
- Não inventar categorias próprias antes de aproveitar a árvore oficial da Pluggy

13. Entregáveis esperados
Quero que você entregue:
- arquitetura proposta
- schema/modelos
- fluxos principais
- pseudocódigo ou implementação real
- endpoints
- estratégia de armazenamento
- regras de fallback
- exemplos de payload request/response
- plano de testes
- checklist de rollout
- sugestões de UI/UX diretamente ligadas aos dados enriquecidos

14. Estilo de implementação
- Código limpo e pragmático
- Modular
- Idempotente
- Observável
- Fácil de manter
- Preparado para escalar depois, mas simples agora
- Evitar overengineering
- Priorizar clareza dos nomes de campos e funções
- Sempre preservar dado bruto e separar raw/enriched/effective

15. Referências oficiais a considerar
Use estas referências como fonte de verdade funcional:
- Pluggy Enrichment API: serviço separado com mesma autenticação, categorization + merchant information, até 5000 transações por request, suporte a accountType, isBusiness, paymentData e creditCardMetadata.payeeMCC.[page:1]
- Pluggy Transaction Categorization: category/categoryId, categorias em árvore, descriptionTranslated em português, category null quando recurso não estiver habilitado ou quando não houver interpretação, Category Rules por client_id.[page:2]

16. Exemplos de comportamento esperados
Exemplo 1:
rawDescription = "MC DONALDS"
resultado Pluggy:
- merchant.name = "mc donalds"
- merchant.businessName = "ARCOS DOURADOS COMERCIO DE ALIMENTOS LTDA"
- merchant.cnpj = "42.591.651/0001-43"
- category = "Eating out"
Então:
- displayTitle = "Mc Donalds"
- displaySubtitle = "Alimentação fora"
- effectiveMerchant = "Mc Donalds"
- effectiveCategory = "Eating out" com label PT correspondente
- rawDescription preservada

Exemplo 2:
rawDescription = "PIX RECEBIDO FULANO"
Pluggy retorna category = null e merchant = null
Então:
- displayTitle = descrição normalizada
- effectiveCategory = "Não categorizado"
- enrichmentStatus = partial ou missing
- transação entra em fila de revisão do usuário

Exemplo 3:
transação com cartão e MCC disponível
Então:
- sempre enviar creditCardMetadata.payeeMCC para melhorar classificação

17. Resultado final esperado
Ao fim, quero uma implementação que permita ao usuário:
- entender melhor suas transações,
- navegar por categorias consistentes,
- corrigir erros pontuais sem quebrar o fluxo,
- manter a Pluggy como núcleo do enrichment,
- e preparar a base para relatórios confiáveis sem inflar demais o escopo.
```

## Referências

A Pluggy documenta que a Enrichment API é um serviço separado, com a mesma autenticação dos serviços principais, e que serve para enriquecer transações com **categorization** e **merchant information**. A mesma documentação mostra suporte a `accountType`, `isBusiness`, `paymentData` com CPF/CNPJ e `creditCardMetadata.payeeMCC`, além do limite de até 5000 transações por request. [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)

Na documentação de categorização, a Pluggy informa que a classificação vem em `category` e `categoryId`, que as categorias são organizadas em **árvore**, que existe `descriptionTranslated` em português e que `category` pode vir `null` quando não houver interpretação ou quando o recurso não estiver habilitado no plano. A mesma página também explica que existem **Category Rules** específicas por `client_id`, e que recategorizações podem alimentar esse mecanismo para melhorar o comportamento futuro. [galileo-ft](https://www.galileo-ft.com/pt/platform/galileo-open-apis/)

## Contexto de implementação

Para o seu caso, a melhor abordagem é usar a Pluggy como **fonte oficial de enrichment** e deixar sua lógica local apenas como camada de override e apresentação. Isso reduz risco, evita overengineering e combina com seu objetivo de não expandir demais o escopo da aplicação agora. [galileo-ft](https://www.galileo-ft.com/pt/platform/galileo-open-apis/)

A separação mais importante é entre **raw**, **enriched** e **effective**. Em outras palavras: preserve o que veio do banco, anexe o que a Pluggy inferiu, e só então aplique correções do usuário ou regras locais para produzir o dado final usado na UI e nos relatórios. [galileo-ft](https://www.galileo-ft.com/pt/platform/galileo-open-apis/)

## Dica prática

Se quiser extrair mais qualidade da Pluggy já no primeiro ciclo, priorize sempre o envio de:
- `accountType` quando souber se é conta corrente ou cartão, [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)
- `isBusiness` para diferenciar PF/PJ, [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)
- `paymentData.receiver.documentNumber` ou `payer.documentNumber` quando existir CPF/CNPJ, [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)
- `creditCardMetadata.payeeMCC` em compras de cartão. [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)

Isso tende a melhorar o resultado sem precisar adicionar nenhum novo provedor externo. [reddit](https://www.reddit.com/r/SaaS/comments/1r1r54w/what_are_the_best_b2b_data_enrichment_apis_for/)

Quer que eu transforme esse prompt agora em uma versão **ainda mais prática para Copilot/Codex/Claude Code**, com seções do tipo “faça arquivo por arquivo” e checklist de implementação?
