# Auditoria de Performance e Arquitetura - Gravel V2

Este relatório substitui e expande a análise anterior, focando em otimizações de nível de sistema para garantir que o Gravel seja "Instant-First".

---

## 🚀 1. A Mudança de Paradigma: "Direct Data Access"
### Phase 1: Database Foundation ✅
- [x] Enable SQLite WAL Mode (Write-Ahead Logging) for concurrent access.
- [x] Add formal relations to `schema.prisma` for native JOIN support.
- [x] Enforce `synchronous = NORMAL` for better ingestion performance.

### Phase 2: Server Component Migration & SQL Aggregations ✅
- [x] Migrate `app/page.tsx` to a Server Component.
- [x] Replace JS-based reductions with native `prisma.aggregate` and `prisma.groupBy`.
- [x] Eliminate internal API calls for the main Dashboard flow (Direct Data Access).
 
- **Impacto:** Redução de ~90% na latência de "Primeiro Dado" (TTFB) e eliminação total de waterfalls de rede.

---

## 📊 2. SQLite em Esteroides: "Push Logic to SQL"
**O Problema:** O processamento de dados está sendo feito em JavaScript (Node.js). Trazer 10.000 transações para a memória para fazer um `.reduce()` é ineficiente.
**O Veredito:** O SQLite é extremamente rápido em agregação. Se o cálculo pode ser feito em SQL, **deve** ser feito em SQL.

### 🛠️ Plano de Ação
- **Agregações Nativas:** Substituir loops JS por `prisma.groupBy` ou `prisma.$queryRaw`.
- **Window Functions:** Utilizar funções de janela do SQLite para cálculos de saldo contínuo (Running Balance) e variações percentuais diretamente na query.
- **Índices de Cobertura:** Além dos índices compostos (`direction`, `occurredAt`), criar índices que incluam a coluna `amount` para permitir *Index-Only Scans*.

---

## 💎 3. Estado Materializado (PnL e Saldos)
**O Problema:** O cálculo de Preço Médio e PnL de Cripto é $O(N)$, onde $N$ é o número de trades. Hoje ele recalcula tudo do zero em cada leitura.
**O Veredito:** Precisamos de uma arquitetura de **Snapshots/Deltas**.

### 🛠️ Plano de Ação
- **Tabela `CryptoPosition`:** Criar uma tabela que armazena o "Estado Atual" de cada ativo (Quantidade, Custo Total, Preço Médio).
- **Processamento de Ingestão:** Ao sincronizar novos dados da Binance/Pluggy, o sistema calcula o *delta* e atualiza o Snapshot. 
- **Resultado:** A leitura do dashboard passa a ser $O(1)$, independente de o usuário ter 10 ou 10.000 trades.

---

## 🔒 4. Concorrência e Confiabilidade (Modo WAL)
**O Problema:** O SQLite no modo padrão (DELETE) trava leituras durante escritas intensas (Ingestion/Sync), causando erros de "Database is locked".
**O Veredito:** O modo **WAL (Write-Ahead Logging)** é obrigatório para aplicações multi-processo ou com workers de background.

### 🛠️ Plano de Ação
- **Ativar WAL:** Executar `PRAGMA journal_mode = WAL;` na inicialização do Prisma.
- **Configuração de Busy Timeout:** Ajustar o timeout de conexão para lidar com picos de escrita sem derrubar a UI.
- **Impacto:** Dashboard continua fluido mesmo durante uma sincronização pesada de 2 anos de histórico bancário.

---

## 📦 5. Bundle e Renderização "Lean"
**O Problema:** Gráficos pesados (Recharts/D3) estão sendo serializados no bundle principal.
**O Veredito:** O JS de visualização só deve ser baixado quando o dado estiver pronto para ser exibido.

### 🛠️ Plano de Ação
- **Lazy Charts:** Usar `next/dynamic` com `{ ssr: false }` para todos os componentes de visualização.
- **Skeleton-First:** Renderizar o esqueleto no servidor para dar percepção de velocidade instantânea, enquanto o gráfico carrega em background.

---

## 📈 Matriz de Priorização (Esforço x Impacto)

| Prioridade | Iniciativa | Impacto | Esforço |
| :--- | :--- | :--- | :--- |
| **1** | Migrar Home para Server Components (Matar API interna) | 🔥 Extremo | 🟢 Baixo |
| **2** | Ativar Modo WAL no SQLite | ⚡ Alto | 🟢 Baixo |
| **3** | Mover Agregações do Analytics para SQL Nativos | 🔥 Extremo | 🟡 Médio |
| **4** | Materializar Estado de PnL/Saldos (Snapshots) | ⚡ Alto | 🔴 Alto |
| **5** | Dynamic Imports para Recharts e Lucide Icons | 📈 Médio | 🟢 Baixo |
| **6** | Higiene de Serialização (Primitivos vs Decimais) | 📈 Médio | 🟢 Baixo |
| **7** | Isolamento de Background Workers (Sync Process) | ⚡ Alto | 🟡 Médio |
| **8** | Implementar Balance Anchors (Cálculo de Saldo por Delta) | 🔥 Extremo | 🔴 Alto |

---

## 🔍 6. Higiene de Serialização (Zero-Overhead JSON)
**O Problema:** Passar objetos `Decimal` do Prisma para Client Components sobrecarrega o payload e exige processamento extra no cliente.
**O Veredito:** O Server Component deve agir como um "Transformador". 

### 🛠️ Plano de Ação
- Transformar todos os valores financeiros em `number` ou `string` formatada no Servidor.
- Garantir que o Client Component receba apenas o necessário para renderizar, reduzindo o tamanho do JSON trafegado pelo Cloudflare Tunnel.

## ⚙️ 7. Isolamento de Processos de Ingestão
**O Problema:** Sincronizações pesadas competem com o Event Loop da UI no notebook do Home Lab.
**O Veredito:** Ingestão é uma tarefa de background, UI é prioridade.

### 🛠️ Plano de Ação
- Isolar a lógica de `sync` para que possa ser executada de forma assíncrona sem bloquear a Thread principal do Next.js.
- Utilizar o banco de dados (tabela `DomainSyncState`) para comunicação de progresso entre o Sync e a UI.

## ⚓ 8. Balance Anchors (Cálculo por Delta)
**O Problema:** Calcular saldos atuais ou históricos exige varrer a tabela `DomainTransaction` completa repetidamente.
**O Veredito:** O passado não muda. Não precisamos re-somá-lo.

### 🛠️ Plano de Ação
- Criar uma tabela de "âncoras de saldo" mensais ou anuais.
- O cálculo de saldo atual torna-se: `Saldo da última âncora + Soma das transações após a âncora`.
- **Impacto:** Performance de leitura constante, independentemente de o banco ter 1 ou 10 anos de dados.
