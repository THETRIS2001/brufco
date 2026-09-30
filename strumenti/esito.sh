#!/usr/bin/env bash
# Com'e' andata una build fallita, senza nomi.
#
#   bash strumenti/esito.sh <log> "<titolo>"
#
# Il repository e' pubblico, e i log di GitHub pure: dagli errori del log si
# tolgono il nome del certificato, il team e i percorsi, poi il risultato va
# nel log e a /build/esito.txt sul server (da dove lo legge chi corregge).
# Vuole nell'ambiente SERVER, CARICA_BUILD e SQUADRA_APPLE.
set -u
LOG="$1"
TITOLO="$2"
mkdir -p build
{
  echo "$TITOLO"
  grep -E "error:|fatal error" "$LOG" \
    | sed -E \
      -e "s#${GITHUB_WORKSPACE:-$PWD}/##g" \
      -e 's/(Apple (Distribution|Development)): [^"(]+/\1: (nascosto)/g' \
      -e "s/${SQUADRA_APPLE:-SQUADRA}/(team)/g" \
    | sort -u | head -200
} > build/esito.txt
cat build/esito.txt
curl --silent --show-error -X PUT -H "Authorization: Bearer $CARICA_BUILD" \
  -H "Content-Type: text/plain" --data-binary @build/esito.txt "$SERVER/build/esito.txt" || true
