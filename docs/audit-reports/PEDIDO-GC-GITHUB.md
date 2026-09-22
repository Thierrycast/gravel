# Pedido de coleta de lixo ao Suporte do GitHub

**Por que:** o histórico foi reescrito para remover dado pessoal, mas o GitHub
continua servindo os objetos antigos por SHA direto. Verificado em 22/09/2026:
depois da reescrita e do `push --force`, `GET /repos/.../contents/docs/assets/
screenshots?ref=b40c0f7` ainda devolveu os quatro arquivos com tamanho e
conteúdo. Force-push torna inalcançável por branch; não apaga.

**Quando fazer:** antes de tornar o repositório público. Enquanto privado, os
órfãos só são alcançáveis por quem já tem acesso.

**Onde:** https://support.github.com/ → conta → repositório → "I need help with
something else".

---

## Texto para colar (em inglês — o suporte responde mais rápido)

> Subject: Request garbage collection of unreachable objects after history rewrite
>
> Hello,
>
> I rewrote the history of my private repository `Thierrycast/gravel` to remove
> files that contained personal data (screenshots of a financial application
> showing real account balances and, in some of them, the full names of third
> parties). The rewrite was done with `git filter-repo` and force-pushed.
>
> The current branch history is clean, but the old objects are still served by
> SHA. For example, this still returns the removed files today:
>
>     GET /repos/Thierrycast/gravel/contents/docs/assets/screenshots?ref=b40c0f7
>
> I would like to make this repository public, and these unreachable objects
> must be gone first. Could you please run garbage collection on the repository
> so the unreachable commits and blobs are permanently removed?
>
> The repository has no forks and no pull requests.
>
> Thank you.

---

## Depois que responderem

Confirme que sumiu antes de tornar público:

```bash
gh api "repos/Thierrycast/gravel/contents/docs/assets/screenshots?ref=b40c0f7"
# esperado: 404 Not Found
gh api repos/Thierrycast/gravel/commits/b40c0f7
# esperado: 422 No commit found
```

Só depois dos dois 404/422: `gh repo edit Thierrycast/gravel --visibility public`

*Documentado por: Claude Code (claude-opus-5) — 2026-09-22.*
