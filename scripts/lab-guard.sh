#!/usr/bin/env bash
# Guarda do lab: o que NÃO pode sair da máquina dentro de um commit.
#
# ┌─ CÓPIA VENDORIZADA ──────────────────────────────────────────────────────┐
# │ Original: ~/dev/lab-standards/githooks/lib/lab-guard.sh                  │
# │ Esta cópia existe para o CI: o runner do GitHub não tem o lab-standards. │
# │ Ao mudar o original, copie de novo. São dois arquivos de propósito —     │
# │ o hook local protege a máquina, este protege o repositório em qualquer   │
# │ lugar, inclusive num clone feito por outra pessoa.                       │
# └──────────────────────────────────────────────────────────────────────────┘
#
# Existe por causa de 2026-09-22. Uma auditoria para publicar o repositório do
# Gravel encontrou, no histórico, 19 imagens com extrato bancário real — quatro
# do próprio app (patrimônio, receita, despesa, transações) e quinze de outro
# app financeiro, logado, com o NOME COMPLETO DE TRÊS PESSOAS em transferências.
# Ficaram num repositório público de 21/04 a 08/08/2026. Ninguém percebeu porque
# o scanner de então só procurava segredo, e imagem não tem regex de segredo.
#
# O gitleaks continua cuidando de credencial e de endereço de infraestrutura.
# Este script cuida do que ele não vê:
#
#   - arquivo que nunca deve ser versionado (.env, chave, banco, dump);
#   - documento (CPF, CNPJ, RG, telefone);
#   - identidade pessoal, lida de ~/.config/lab-guard/identity.conf;
#   - imagem — AVISO, não bloqueio, porque ícone e diagrama são legítimos.
#     Vira bloqueio quando o nome cheira a captura de tela, que foi o caso real.
#
# Uso:
#   lab-guard.sh --staged          # o que está no índice (pre-commit)
#   lab-guard.sh --range A..B      # um intervalo de commits (pre-push)
#   lab-guard.sh --tracked         # tudo que está versionado (auditoria)
#
# Escapar: LAB_GUARD_ALLOW=1 git commit ...   (pense duas vezes)
# Documentado por: Claude Code (claude-opus-5) — 2026-09-22.

set -uo pipefail

RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RESET=$'\033[0m'

IDENTITY_FILE="${LAB_GUARD_IDENTITY:-$HOME/.config/lab-guard/identity.conf}"
MODE="${1:---staged}"
RANGE="${2:-}"

BLOCKED=0
WARNED=0

# Padroes vindos de variavel de ambiente (CI) precisam de arquivo temporario.
TMP_IDENTITY="$(mktemp)"
trap 'rm -f "$TMP_IDENTITY"' EXIT

block() { printf '%s  BLOQUEIO  %s%s\n' "$RED" "$1" "$RESET"; BLOCKED=1; }
warn()  { printf '%s  aviso     %s%s\n' "$YELLOW" "$1" "$RESET"; WARNED=1; }
hint()  { printf '%s            %s%s\n' "$DIM" "$1" "$RESET"; }

# ── que arquivos olhar ──────────────────────────────────────────────────────
case "$MODE" in
  --staged)  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM) ;;
  --range)   mapfile -t FILES < <(git diff --name-only --diff-filter=ACM "$RANGE" 2>/dev/null) ;;
  --tracked) mapfile -t FILES < <(git ls-files) ;;
  *) echo "uso: lab-guard.sh [--staged|--range A..B|--tracked]" >&2; exit 2 ;;
esac

[ "${#FILES[@]}" -eq 0 ] && exit 0

# Conteúdo de um arquivo, na versão certa para o modo.
content_of() {
  case "$MODE" in
    --staged) git show ":$1" 2>/dev/null ;;
    *)        [ -f "$1" ] && cat "$1" 2>/dev/null ;;
  esac
}

# ── 1. arquivos que nunca devem ser versionados ─────────────────────────────
# .env.example é o modelo e passa; .env de verdade, não.
NEVER_VERSIONED='(^|/)\.env($|\.[a-z]+$)|(^|/)\.env\.local|\.pem$|\.p12$|\.pfx$|(^|/)id_(rsa|ed25519|ecdsa)($|[^.])|\.kdbx$|\.(db|sqlite3?)$|\.(dump|bak)$|(^|/)secrets?\.(ya?ml|json|env)$'
ALLOWED_EXAMPLES='\.env\.example$|\.env\.sample$|\.env\.template$'

# ── 2. imagens ──────────────────────────────────────────────────────────────
IMAGE_EXT='\.(png|jpe?g|gif|webp|bmp|tiff?|heic|avif)$'
# Nome que denuncia captura de tela — em pt, en, es e o padrão do Windows/macOS.
SCREENSHOT_NAME='captura[ _-]?de[ _-]?tela|screen[ _-]?shot|screenshot|screen[ _-]?capture|captura[ _-]?de[ _-]?pantalla|^Screen Shot|\bprint\b.*\.(png|jpe?g)$'

# ── 3. documentos ───────────────────────────────────────────────────────────
# Sequência obviamente fictícia usada em teste não deve travar o commit.
FAKE_DOCS='000\.000\.000|111\.111\.111|123\.456\.789|999\.999\.999|00\.000\.000/0000'

for f in "${FILES[@]}"; do
  [ -n "$f" ] || continue

  # O próprio guarda e a config declaram os padrões que procuram.
  case "$f" in
    */lab-guard.sh|lab-guard.sh|*/identity.conf) continue ;;
    */gitleaks.toml|gitleaks.toml) continue ;;
  esac

  # ---- arquivo proibido -----------------------------------------------------
  if printf '%s' "$f" | grep -qE "$ALLOWED_EXAMPLES"; then
    : # modelo, tudo bem
  elif printf '%s' "$f" | grep -qE "$NEVER_VERSIONED"; then
    block "$f — este tipo de arquivo não é versionado"
    hint "segredo vive em .env (fora do git); banco e dump, fora do repositório"
    continue
  fi

  # ---- imagem ---------------------------------------------------------------
  if printf '%s' "$f" | grep -qiE "$IMAGE_EXT"; then
    if printf '%s' "$f" | grep -qiE "$SCREENSHOT_NAME"; then
      block "$f — parece captura de tela"
      hint "foi exatamente assim que extrato bancário de 3 pessoas foi parar num repo público"
      hint "se for mesmo necessária, renomeie conscientemente e use LAB_GUARD_ALLOW=1"
    else
      warn "$f — imagem nova; confira que não há dado pessoal nela"
      hint "histórico de git é para sempre: apagar depois não desfaz o clone de ninguém"
    fi
    continue   # binário: não adianta varrer o conteúdo com regex de texto
  fi

  # ---- conteúdo -------------------------------------------------------------
  body="$(content_of "$f")"
  [ -n "$body" ] || continue
  # pula binário que escapou da lista de extensões
  printf '%s' "$body" | head -c 8000 | grep -qP '\x00' 2>/dev/null && continue

  # CPF
  while IFS= read -r hit; do
    printf '%s' "$hit" | grep -qE "$FAKE_DOCS" && continue
    block "$f — parece um CPF ($hit)"
  done < <(printf '%s' "$body" | grep -oE '\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b' | sort -u)

  # CNPJ — AVISO, não bloqueio. CNPJ é registro público da Receita e identifica
  # empresa, não pessoa. Um teste de "este CNPJ é de facilitador de pagamento?"
  # precisa do número real para ter sentido. Vale o aviso porque o número pode
  # ter vindo do SEU extrato, o que diz com quem você transaciona.
  while IFS= read -r hit; do
    printf '%s' "$hit" | grep -qE "$FAKE_DOCS" && continue
    warn "$f — CNPJ ($hit); público, mas confira se não revela seu histórico"
  done < <(printf '%s' "$body" | grep -oE '\b[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}\b' | sort -u)

  # Telefone brasileiro com DDD entre parênteses
  while IFS= read -r hit; do
    block "$f — parece um telefone ($hit)"
  done < <(printf '%s' "$body" | grep -oE '\([0-9]{2}\) ?9?[0-9]{4}-[0-9]{4}' | sort -u | grep -vE '\(11\) ?98765-4321|\(00\)')

  # Identidade pessoal.
  #
  # Duas fontes, porque são dois mundos: na máquina, o arquivo em ~/.config
  # (600, fora de git). Em CI, onde esse arquivo não existe e não pode existir,
  # a variável LAB_GUARD_IDENTITY_PATTERNS — que no GitHub Actions vem de um
  # secret do repositório. Os padrões são, eles mesmos, a informação protegida:
  # nunca entram no repositório.
  if [ -n "${LAB_GUARD_IDENTITY_PATTERNS:-}" ]; then
    printf '%s\n' "$LAB_GUARD_IDENTITY_PATTERNS" > "$TMP_IDENTITY"
    IDENTITY_SOURCE="$TMP_IDENTITY"
  else
    IDENTITY_SOURCE="$IDENTITY_FILE"
  fi

  if [ -r "$IDENTITY_SOURCE" ]; then
    while IFS= read -r pattern; do
      case "$pattern" in ''|'#'*) continue ;; esac
      if printf '%s' "$body" | grep -qiE "$pattern"; then
        block "$f — casa um padrão de identidade pessoal"
        hint "ajuste em $IDENTITY_FILE (ou no secret LAB_GUARD_IDENTITY_PATTERNS)"
      fi
    done < "$IDENTITY_SOURCE"
  fi
done

# ── veredito ────────────────────────────────────────────────────────────────
if [ "$BLOCKED" -ne 0 ]; then
  if [ "${LAB_GUARD_ALLOW:-}" = "1" ]; then
    printf '\n%sLAB_GUARD_ALLOW=1 — seguindo mesmo assim. Espero que você tenha olhado.%s\n' "$YELLOW" "$RESET"
    exit 0
  fi
  cat >&2 <<MSG

${RED}O guarda do lab barrou isto.${RESET}

Histórico de git não se corrige depois: quem clonou, clonou. Remover o arquivo
num commit seguinte não apaga nada — em 2026 um repositório deste lab ficou
público por três meses e meio com extrato bancário de terceiros no histórico, e
só foi descoberto por acaso.

  Falso positivo?        ajuste ~/.config/lab-guard/identity.conf
  Precisa mesmo?         LAB_GUARD_ALLOW=1 git commit ...
  Já está no histórico?  aí é git-filter-repo, e depois pedir GC ao GitHub

MSG
  exit 1
fi

if [ "$WARNED" -ne 0 ]; then
  printf '%s✓ nada bloqueado, mas leia os avisos acima.%s\n' "$YELLOW" "$RESET"
else
  [ "$MODE" = "--tracked" ] && printf '%s✓ guarda do lab: limpo (%s arquivos)%s\n' "$GREEN" "${#FILES[@]}" "$RESET"
fi
exit 0
