#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
: "${NINET_KEYSTORE:?Set NINET_KEYSTORE to your private release keystore}"
: "${NINET_PASSWORD_FILE:?Set NINET_PASSWORD_FILE to a mode-0600 password file}"
NINET_ALIAS="${NINET_ALIAS:-ninet}"
NINET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NINET_OUTPUT="${1:-$NINET_ROOT/artifacts/9t-android-0.4.0.apk}"
mkdir -p "$(dirname "$NINET_OUTPUT")"
"$ANDROID_HOME/build-tools/35.0.0/zipalign" -f -p 4 "$NINET_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk" "$NINET_OUTPUT"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" sign --ks "$NINET_KEYSTORE" --ks-key-alias "$NINET_ALIAS" --ks-pass "file:$NINET_PASSWORD_FILE" "$NINET_OUTPUT"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$NINET_OUTPUT"
sha256sum "$NINET_OUTPUT"
