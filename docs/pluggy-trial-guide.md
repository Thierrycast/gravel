# Pluggy Trial e Sandbox

Use credenciais Pluggy em `.env`:

```env
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
```

Depois abra `/connect` e use o widget para vincular uma instituição. Em ambiente de teste, prefira conectores sandbox quando disponíveis na conta Pluggy.

Para validar sem abrir o widget:

```bash
pnpm gravel ops status
pnpm gravel review inbox
```
