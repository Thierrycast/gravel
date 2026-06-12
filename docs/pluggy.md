# Integração Pluggy

O Gravel usa Pluggy/Open Finance para importar contas, faturas, transações, investimentos e metadados de instituição.

## Tela de Conexões

`/connect` mostra:

- instituição;
- status de sincronização;
- última sincronização;
- quantidade de contas;
- quantidade de importações;
- ação recomendada;
- detalhes técnicos com UUID do item.

## Estados relevantes

- `UPDATED`: dados sincronizados.
- `UPDATING`: sincronização em andamento.
- `OUTDATED`: atualização recomendada.
- `WAITING_USER_INPUT`/`WAITING_USER_ACTION`: precisa de ação do usuário.
- `LOGIN_ERROR`/`ERROR`: reconexão recomendada.
