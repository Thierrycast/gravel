#!/usr/bin/env bash
# Barra segredo em arquivo versionado.
#
# Existe porque em 2026-08-08 o `docker-compose.yml` foi para um repo PÚBLICO com
# credenciais literais de Pluggy, Binance e Logo.dev — e ninguém percebeu por
# meses. Sanear o arquivo conserta o passado; este hook é o que evita o futuro.
#
# Uso:
#   scripts/secret-scan.sh --staged   # o que está no índice (usado pelo hook)
#   scripts/secret-scan.sh            # tudo que está versionado
#
# Instalar o hook:
#   ln -sf ../../scripts/secret-scan.sh .git/hooks/pre-commit
#
# Escapar de um falso positivo (raro, e pense duas vezes):
#   git commit --no-verify
#
# Documentado por: Claude Code (claude-opus-5) — 2026-08-09.
set -uo pipefail

MODE="${1:-all}"
RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; RESET=$'\033[0m'

if [ "$MODE" = "--staged" ]; then
  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM)
else
  mapfile -t FILES < <(git ls-files)
fi

[ "${#FILES[@]}" -eq 0 ] && exit 0

# Padrões de credencial de provedor. Deliberadamente específicos: um regex de
# entropia genérico dispara em hashes de lockfile e vira ruído que se aprende a
# ignorar — e um hook ignorado não protege nada.
PATTERNS=(
  'sk_[A-Za-z0-9_-]{16,}'                      # Logo.dev / Stripe secret
  'sk-[A-Za-z0-9]{20,}'                        # OpenAI
  'ghp_[A-Za-z0-9]{36}'                        # GitHub PAT
  'github_pat_[A-Za-z0-9_]{22,}'               # GitHub PAT (novo)
  'AKIA[0-9A-Z]{16}'                           # AWS access key
  'xox[baprs]-[A-Za-z0-9-]{10,}'               # Slack
  'AIza[0-9A-Za-z_-]{35}'                      # Google API
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'         # chave privada
)

# Variáveis que NUNCA podem ter valor literal num arquivo versionado. Vazio,
# ${INTERPOLACAO} e placeholders óbvios passam.
SECRET_VARS='(PLUGGY_CLIENT_SECRET|PLUGGY_WEBHOOK_SECRET|BINANCE_API_KEY|BINANCE_API_SECRET|INTERNAL_API_KEY|LOGO_DEV_SECRET_KEY|APP_SECRETS_ENCRYPTION_KEY|VAPID_PRIVATE_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)'

# Identificadores da infraestrutura pessoal. Segredo não é o único vazamento:
# IP privado, host de tailnet e caminho de appdata dizem onde a máquina mora, e
# em 2026-09-20 o ROADMAP.md ainda carregava o IP do servidor de fala. Vão para
# variável de ambiente; no .env.example entra placeholder.
INFRA_PATTERNS=(
  '100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}'  # CGNAT/tailnet
  '192\.168\.[0-9]{1,3}\.[0-9]{1,3}'          # LAN
  '10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'    # LAN
  '[a-z0-9-]+\.ts\.net'                        # host de tailnet
  "/DATA"'/AppData'                          # appdata do CasaOS (literal partido de
                                               # propósito: uma reescrita de
                                               # histórico já apagou este padrão
                                               # de dentro do próprio scanner)
)

FOUND=0

report() {
  printf '%s  %s%s\n' "$RED" "$1" "$RESET"
  FOUND=1
}

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  # .env.example é o modelo: só documenta nomes, valores ficam vazios.
  case "$f" in
    pnpm-lock.yaml|*.lock|.git/*|*.test.ts) continue ;;
    # o próprio scanner declara os literais que procura
    scripts/secret-scan.sh) continue ;;
  esac

  for pat in "${PATTERNS[@]}"; do
    while IFS=: read -r line _; do
      [ -n "${line:-}" ] && report "$f:$line — padrão de credencial ($pat)"
    done < <(grep -nEo "$pat" "$f" 2>/dev/null | cut -d: -f1 | sort -u | sed 's/$/:/')
  done

  # Infra pessoal. 192.0.2.x/198.51.100.x/203.0.113.x são as faixas de
  # documentação (RFC 5737) e passam de propósito: é o que usar no exemplo.
  for pat in "${INFRA_PATTERNS[@]}"; do
    while IFS=: read -r line _; do
      [ -n "${line:-}" ] && report "$f:$line — endereço da infraestrutura pessoal ($pat)"
    done < <(grep -nE "$pat" "$f" 2>/dev/null \
      | grep -vE '192\.0\.2\.|198\.51\.100\.|203\.0\.113\.' \
      | cut -d: -f1 | sort -u | sed 's/$/:/')
  done

  # VAR=valor com conteúdo real. Ignora vazio, "", ${...} e placeholders.
  while IFS= read -r hit; do
    line="${hit%%:*}"
    content="${hit#*:}"

    # `process.env.X = y` é código lendo/escrevendo a env, não uma declaração de
    # configuração — é assim que os testes salvam e restauram o valor original.
    case "$content" in
      *process.env.*) continue ;;
    esac

    value="$(printf '%s' "$content" | sed -E "s/.*$SECRET_VARS[[:space:]]*[=:][[:space:]]*//" | tr -d '"'"'"' \r')"
    [ -z "$value" ] && continue
    case "$value" in
      '${'*|'$'*|COLE_*|'<'*|CHANGE*|xxx*|TODO*|your-*|'***'*) continue ;;
    esac
    [ "${#value}" -lt 8 ] && continue

    # Credencial real praticamente sempre mistura letra e dígito. Isso descarta
    # identificadores de código (`originalKey`, `someVariable`) sem enfraquecer a
    # detecção: valores com prefixo conhecido (sk_, ghp_, …) já são pegos pela
    # lista PATTERNS acima, independente disto.
    printf '%s' "$value" | grep -q '[0-9]' || continue
    printf '%s' "$value" | grep -q '[A-Za-z]' || continue

    report "$f:$line — valor literal em variável de segredo"
  done < <(grep -nE "$SECRET_VARS[[:space:]]*[=:]" "$f" 2>/dev/null)
done

if [ "$FOUND" -ne 0 ]; then
  cat >&2 <<MSG

${YELLOW}Commit bloqueado: há segredo ou endereço da infra em arquivo versionado.${RESET}

Segredos vivem em ~/.config/gravel/secrets.env (fora do git). Se este for um
falso positivo, ajuste os padrões em scripts/secret-scan.sh — não use
--no-verify por hábito. Contexto: docs/security.md
MSG
  exit 1
fi

[ "$MODE" = "--staged" ] || printf '%s✓ nenhum segredo nem endereço de infra em arquivo versionado (%s arquivos)%s\n' "$GREEN" "${#FILES[@]}" "$RESET"
exit 0
