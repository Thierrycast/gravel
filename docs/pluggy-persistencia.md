# Pluggy - Plano de Persistencia

## Objetivo
- Persistir dados do Pluggy localmente sem sobrescrever enriquecimentos internos da aplicacao.
- Sincronizar apenas dados novos por padrao.
- Manter payload bruto para auditoria, reprocessamento e futuras features.

## Estrategia
1. `request layer`
- A camada `lib/integrations/pluggy.ts` concentra todos os GETs usados pela app.
- As rotas `app/api/pluggy/*` servem para depuracao, testes e consumo interno.

2. `persistencia insert-only`
- Registros normalizados do Pluggy sao inseridos apenas na primeira vez.
- Se o mesmo recurso voltar com o mesmo `id`, ele nao e sobrescrito automaticamente.
- Isso evita perder classificacoes e ajustes internos futuros.

3. `snapshots brutos`
- Toda resposta relevante do Pluggy gera um snapshot em `PluggyPayloadSnapshot`.
- O snapshot so entra se o hash do payload mudar.
- Isso permite reprocessar mudancas depois, sem precisar sobrescrever o registro normalizado.

## Tabelas

### Controle
- `PluggyItem`
  - Registro local dos `itemId` retornados pelo widget.
  - Pode atualizar `status` e metadados do conector.

- `PluggySyncRun`
  - Historico de execucoes de sincronizacao.
  - Guarda `resources`, `status`, `summaryJson` e erro.

### Snapshot bruto
- `PluggyPayloadSnapshot`
  - `resourceType`
  - `externalId`
  - `itemExternalId`
  - `parentExternalId`
  - `payloadHash`
  - `payloadJson`
  - `sourceUpdatedAt`
  - `fetchedAt`

### Registros normalizados
- `PluggyAccountRecord`
- `PluggyAccountBalanceSnapshot`
- `PluggyTransactionRecord`
- `PluggyInvestmentRecord`
- `PluggyLoanRecord`
- `PluggyBillRecord`
- `PluggyCategoryRecord`
- `PluggyMerchantRecord`

## Regras por recurso

### Items
- Atualiza `status` no registro local.
- Tambem salva snapshot bruto do item.

### Accounts
- Insere a conta se `externalId` ainda nao existir.
- Snapshot bruto entra quando o payload mudar.

### Balances
- Saldo e dinamico.
- Por isso entra em tabela de snapshot, nunca em update destrutivo.

### Transactions
- Transacao entra apenas uma vez por `externalId`.
- Mudancas futuras ficam registradas em snapshot bruto.
- Categorizacao interna da app nao e tocada pelo sync do Pluggy.

### Bills, Investments, Loans
- Mesmo criterio: inserir novo registro uma vez e salvar snapshots separados para mudancas futuras.

### Categories
- Sao catalogo do provedor.
- Podem ser importadas e reutilizadas como referencia.

### Merchants
- Enriquecimento opcional por `cnpj`.
- Sincronizacao atual busca apenas comerciantes novos encontrados nas transacoes.

## Fluxo do sync
1. Resolver os `itemId` salvos localmente.
2. Buscar o estado vivo de cada item no Pluggy.
3. Sincronizar `categories`.
4. Para cada item `UPDATED`:
   - importar `accounts`
   - tentar `balances`
   - importar `bills`
   - importar `transactions`
   - importar `investments`
   - importar `loans`
5. A partir das transacoes, enriquecer `merchants` novos.
6. Registrar o resumo em `PluggySyncRun`.

## Rotas de sync
- `GET /api/pluggy/sync`
  - Resumo do que ja existe persistido no banco.
- `POST /api/pluggy/sync`
  - Dispara sincronizacao Pluggy -> banco.
  - Body opcional:

```json
{
  "itemId": "uuid-opcional",
  "resources": ["items", "accounts", "balances", "transactions", "investments", "loans", "bills", "categories", "merchants"],
  "pageSize": 200
}
```

## Decisao atual
- Sync automatico padrao: `insert-only`.
- Atualizacao seletiva de registros existentes fica para uma feature futura, explicita e controlada.
