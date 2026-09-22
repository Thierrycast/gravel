# Revisão para tornar o repositório público — 2026-09-22

Repositório privado e repositório público exigem revisões **diferentes**. A
rodada de 20-21/09 tratou de segredo e de infraestrutura. Publicar acrescenta uma
pergunta que privado não faz: *o histórico contém dado pessoal — meu ou de
terceiros?*

Contém. Continha.

## O que foi encontrado

**19 imagens no histórico, com dado financeiro real.** Tinham sido removidas da
árvore de trabalho havia tempo, mas histórico é exatamente o que um repositório
público entrega.

| Caminho | O que mostrava |
|---|---|
| `docs/assets/screenshots/` (4) | patrimônio líquido, ativos, passivos, receita e despesa mensais reais, categorias com valores, transações com nome de estabelecimento |
| `docs/assets/refs/` (15) | telas de outro app financeiro, logado, com extrato real: valores, estabelecimentos, cartão, e **nome completo de três pessoas** em transferências recebidas e enviadas |

O segundo caso é o grave. Não é dado do dono do repositório — é de terceiros que
nunca souberam que o nome deles estava num extrato, muito menos num commit.
Publicar isso não seria um vazamento de infraestrutura; seria expor gente.

## O que foi feito

`git filter-repo --path docs/assets --invert-paths` sobre os 252 commits.
Restam no histórico apenas `public/icon-192.png` e `public/icon-512.png`, que são
o ícone do app (192×192 e 512×512, verificados).

Backup do `.git` anterior à purga: `~/backups/gravel-pre-purge-imagens-*.tar.gz`.
SHA antes da purga: `394d114`.

## O que foi verificado e está limpo

| Item | Resultado |
|---|---|
| Segredos no histórico | gitleaks com a config do lab: `no leaks found` |
| Infra pessoal (IP, `.ts.net`, appdata) | `scripts/secret-scan.sh`: limpo em 542 arquivos |
| CPF | 4 ocorrências, **todas fixture falsa** (`123.456.789-09`) em testes do guard e do projetor |
| Banco de dados, dumps, `.jsonl` | nenhum jamais versionado (o `.gitignore` cobre `*.db`, `/data/`, `snapshot-*`) |
| Imagens restantes | só os dois ícones do app |

Uma coisa fica e é escolha, não defeito: **o e-mail pessoal está no metadado de
autoria dos 249 commits**. Isso é como o git funciona e vale para a maioria dos
repositórios públicos. Para esconder, seria preciso reescrever o histórico de
novo trocando o autor pelo endereço `@users.noreply.github.com` — 3 commits já
usam esse.

## Por que o repositório NÃO foi tornado público mesmo depois da purga

Force-push não apaga do GitHub o que já foi enviado. Os objetos antigos ficam
**inalcançáveis por branch, mas ainda acessíveis por SHA direto**, até o GitHub
rodar coleta de lixo — o que não é garantido nem imediato. Num repositório
privado isso é irrelevante: ninguém alcança. Público, qualquer pessoa que
descubra um SHA alcança, e SHA vaza por feed de eventos, fork e cache.

Este repositório carrega duas reescritas recentes: a de 20/09 (infra) e a de hoje
(imagens). Tornar público agora apostaria que nenhum objeto órfão sobrevive do
outro lado.

Os dois caminhos honestos:

1. **Repositório novo, história zerada.** `git checkout --orphan`, um commit
   inicial, push para um repositório novo e público. Perde-se o histórico —
   que, neste caso, é justamente o que não se quer publicar.
2. **Pedir ao Suporte do GitHub** a coleta de lixo do repositório atual,
   confirmar que os SHAs antigos deixaram de responder, e só então tornar
   público.

O que não é caminho: tornar público e torcer.

*Documentado por: Claude Code (claude-opus-5) — 2026-09-22.*
