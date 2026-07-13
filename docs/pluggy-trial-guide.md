# Pluggy Trial e Sandbox

> Para o passo a passo completo de criação de contas (MeuPluggy + Dashboard),
> obtenção de credenciais e autorização de acesso, use o guia
> [Configuração: Pluggy + MeuPluggy](meu-pluggy-setup.md). Esta página é um
> resumo rápido.

O cadastro em https://dashboard.pluggy.ai dá um trial de 15 dias com a API
completa. Para desenvolvimento contínuo sem plano pago, use o conector
**MeuPluggy** (seus bancos conectados via https://meu.pluggy.ai).

Credenciais no `.env`:

```env
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
```

Depois abra `/connect` e use o widget para vincular uma instituição — em
desenvolvimento, escolha o conector MeuPluggy; para testes descartáveis, os
conectores sandbox da conta Pluggy também funcionam.

Para validar sem abrir o widget:

```bash
pnpm gravel ops status
pnpm gravel review inbox
```
