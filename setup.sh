#!/bin/sh
# Bootstrap a checkout without requiring a global npm install or root.
set -eu
NINET_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$NINET_ROOT/.tools/node/bin/node" ]; then
  PATH="$NINET_ROOT/.tools/node/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  echo '9t needs Node.js 22 or newer.'
  printf 'Download Node.js 22 into this checkout (no system changes)? [Y/n] '
  read -r NINET_REPLY
  case "$NINET_REPLY" in n|N|no|NO) exit 0 ;; esac
  case "$(uname -s)" in Linux) NINET_OS=linux ;; Darwin) NINET_OS=darwin ;; *) echo 'Install Node.js 22 from nodejs.org, then run npm run setup.'; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) NINET_ARCH=x64 ;; aarch64|arm64) NINET_ARCH=arm64 ;; *) echo 'Install Node.js 22 for this CPU, then run npm run setup.'; exit 1 ;; esac
  command -v curl >/dev/null 2>&1 || { echo 'Install curl and tar first.' >&2; exit 1; }
  command -v tar >/dev/null 2>&1 || { echo 'Install tar first.' >&2; exit 1; }
  NINET_TMP=$(mktemp -d)
  trap 'rm -rf -- "$NINET_TMP"' EXIT HUP INT TERM
  NINET_BASE=https://nodejs.org/download/release/latest-v22.x
  curl --fail --location --proto '=https' --tlsv1.2 "$NINET_BASE/SHASUMS256.txt" -o "$NINET_TMP/SHASUMS256.txt"
  NINET_ARCHIVE=$(awk -v suffix="-$NINET_OS-$NINET_ARCH.tar.gz" 'index($2,suffix) && substr($2,length($2)-length(suffix)+1)==suffix {print $2; exit}' "$NINET_TMP/SHASUMS256.txt")
  case "$NINET_ARCHIVE" in node-v22.*.tar.gz) ;; *) echo 'Could not find the official Node.js archive.' >&2; exit 1 ;; esac
  curl --fail --location --proto '=https' --tlsv1.2 "$NINET_BASE/$NINET_ARCHIVE" -o "$NINET_TMP/$NINET_ARCHIVE"
  awk -v name="$NINET_ARCHIVE" '$2==name {print}' "$NINET_TMP/SHASUMS256.txt" > "$NINET_TMP/checksum"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$NINET_TMP" && sha256sum -c checksum)
  else
    (cd "$NINET_TMP" && shasum -a 256 -c checksum)
  fi
  mkdir -p "$NINET_ROOT/.tools"
  tar -xzf "$NINET_TMP/$NINET_ARCHIVE" -C "$NINET_TMP"
  # Never overwrite an existing runtime directory after a partial installation.
  if [ -e "$NINET_ROOT/.tools/node" ]; then
    echo 'An incomplete .tools/node directory exists. Move it aside and retry.' >&2
    exit 1
  fi
  mv "$NINET_TMP/${NINET_ARCHIVE%.tar.gz}" "$NINET_ROOT/.tools/node"
  rm -rf -- "$NINET_TMP"
  trap - EXIT HUP INT TERM
  PATH="$NINET_ROOT/.tools/node/bin:$PATH"
  export PATH
fi
exec node "$NINET_ROOT/bin/9t.mjs" setup "$@"
