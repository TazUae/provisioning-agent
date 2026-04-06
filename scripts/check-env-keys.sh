#!/usr/bin/env bash
# Compare variable names in .env.example vs .env (values are ignored).
# Usage: from repo root: bash scripts/check-env-keys.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="${ROOT}/.env.example"
LOCAL="${ROOT}/.env"

if [[ ! -f "${EXAMPLE}" ]]; then
  echo "error: missing ${EXAMPLE}" >&2
  exit 1
fi

extract_keys() {
  # Lines like KEY=value (ignore comments and blank lines)
  grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null \
    | sed 's/^[[:space:]]*//; s/=.*//' | sort -u
}

keys_ex="$(extract_keys "${EXAMPLE}")"
if [[ -z "${keys_ex}" ]]; then
  echo "error: no KEY= entries found in .env.example" >&2
  exit 1
fi

if [[ -f "${LOCAL}" ]]; then
  keys_loc="$(extract_keys "${LOCAL}")"
else
  keys_loc=""
  echo "warning: ${LOCAL} not found — comparing against empty key set" >&2
fi

missing="$(comm -23 <(echo "${keys_ex}") <(echo "${keys_loc}"))"
extra="$(comm -13 <(echo "${keys_ex}") <(echo "${keys_loc}"))"

status=0
if [[ -n "${missing}" ]]; then
  echo "Missing in .env (present in .env.example):"
  echo "${missing}" | sed 's/^/  - /'
  status=1
fi

if [[ -n "${extra}" ]]; then
  echo "Extra in .env (not in .env.example):"
  echo "${extra}" | sed 's/^/  - /'
  status=1
fi

if [[ "${status}" -eq 0 ]]; then
  echo "OK: .env keys match .env.example (names only)."
fi

exit "${status}"
