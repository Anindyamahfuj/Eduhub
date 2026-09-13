#!/usr/bin/env bash
# ============================================================
# StudyHub — local end-to-end smoke test.
#
# Verifies, against the locally running server:
#   * every static page and asset is served
#   * the frontend files are byte-identical to the pristine source
#   * script.js keeps the original bytes as an unmodified prefix
#   * auth is enforced and works (register / me / logout)
#   * the workspace document round-trips through D1
#   * user isolation holds (a second account cannot see the first)
#   * the AI scaffold responds as "not configured"
#
# Usage: bash scripts/test.sh [base_url]
# ============================================================
set -u

BASE="${1:-http://localhost:3000}"
COOKIE_A="$(mktemp)"
COOKIE_B="$(mktemp)"
PASS=0
FAIL=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got '$2', want '$3')"; fi; }

code() { curl -sL -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -sL "$@"; }

echo "StudyHub local test — $BASE"
echo "--------------------------------------------"

echo "[1] static assets"
for p in index.html ai-tools.html calculator.html files.html habits.html \
         notice.html notes.html assignments.html planner.html flashcards.html \
         reading.html style.css script.js logoedu.png login.html login.js; do
  check "/$p" "$(code "$BASE/$p")" "200"
done

echo
echo "[2] frontend integrity (public/ vs pristine frontend/)"
for f in index.html ai-tools.html calculator.html files.html habits.html \
         notice.html notes.html assignments.html planner.html flashcards.html \
         reading.html style.css logoedu.png; do
  served=$(body "$BASE/$f" | md5sum | cut -d' ' -f1)
  local=$(md5sum "frontend/$f" | cut -d' ' -f1)
  check "$f byte-identical" "$served" "$local"
done

echo
echo "[3] script.js — original bytes preserved as prefix"
n=$(stat -c%s frontend/script.js)
head -c "$n" <(body "$BASE/script.js") > /tmp/sh_pfx.bin
if cmp -s frontend/script.js /tmp/sh_pfx.bin; then ok "prefix intact ($n bytes)"; else bad "prefix modified"; fi
size=$(body "$BASE/script.js" | wc -c)
if [ "$size" -gt "$n" ]; then ok "storage layer appended (+$((size-n)) bytes)"; else bad "storage layer missing"; fi

echo
echo "[4] auth enforcement"
check "GET /api/workspace unauthenticated" "$(code "$BASE/api/workspace")" "401"
check "GET /api/files unauthenticated"     "$(code "$BASE/api/files")" "401"
check "GET /api/auth/me unauthenticated"   "$(code "$BASE/api/auth/me")" "401"

echo
echo "[5] health"
check "GET /api/health" "$(code "$BASE/api/health")" "200"

echo
echo "[6] register / me / workspace round-trip (user A)"
EMAIL_A="a$(date +%s%N)@test.local"
REG=$(curl -s -c "$COOKIE_A" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"testpassword123\"}" -w '\n%{http_code}')
REG_CODE=$(echo "$REG" | tail -n1)
if [ "$REG_CODE" = "201" ]; then ok "register user A (201)"; else bad "register user A (got $REG_CODE)"; fi

check "me returns 200 when signed in" "$(code -b "$COOKIE_A" "$BASE/api/auth/me")" "200"

PUT_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_A" -X PUT "$BASE/api/workspace" \
  -H 'Content-Type: application/json' \
  -d '{"data":{"notes":[{"id":"n1","text":"hello","pinned":false}],"subjects":["General","Math"]}}')
check "PUT /api/workspace" "$PUT_CODE" "200"

GOT=$(body -b "$COOKIE_A" "$BASE/api/workspace")
if echo "$GOT" | grep -q '"hello"'; then ok "workspace persisted and returned"; else bad "workspace did not round-trip"; fi

echo
echo "[7] user isolation (user B must not see user A's data)"
EMAIL_B="b$(date +%s%N)@test.local"
curl -s -c "$COOKIE_B" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"testpassword123\"}" -o /dev/null
GOT_B=$(body -b "$COOKIE_B" "$BASE/api/workspace")
if echo "$GOT_B" | grep -q '"hello"'; then bad "user B can see user A's data (LEAK)"; else ok "user B workspace is isolated"; fi

echo
echo "[8] files module"
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
UP=$(curl -s -b "$COOKIE_A" -X POST "$BASE/api/files" -H 'Content-Type: application/json' \
  -d "{\"files\":[{\"id\":\"file1\",\"name\":\"tiny.png\",\"size\":70,\"data\":\"$PNG\"}]}" -w '\n%{http_code}')
UP_CODE=$(echo "$UP" | tail -n1)
if [ "$UP_CODE" = "200" ]; then ok "upload file (200)"; else bad "upload file (got $UP_CODE)"; fi
LIST=$(body -b "$COOKIE_A" "$BASE/api/files")
if echo "$LIST" | grep -q 'tiny.png'; then ok "file appears in list"; else bad "file missing from list"; fi
if echo "$LIST" | grep -q 'data:image/png'; then ok "file data returned to frontend"; else bad "file data not returned"; fi
check "DELETE file" "$(code -b "$COOKIE_A" -X DELETE "$BASE/api/files/file1")" "200"

echo
echo "[9] AI scaffold (must be unconfigured, no key assumed)"
check "GET /api/ai/config" "$(code -b "$COOKIE_A" "$BASE/api/ai/config")" "200"
AICHAT=$(curl -s -b "$COOKIE_A" -X POST "$BASE/api/ai/chat/completions" \
  -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}' -w '\n%{http_code}')
AICHAT_CODE=$(echo "$AICHAT" | tail -n1)
check "POST /api/ai/chat/completions returns 501" "$AICHAT_CODE" "501"

echo
echo "[10] logout"
check "POST /api/auth/logout" "$(code -b "$COOKIE_A" -c "$COOKIE_A" -X POST "$BASE/api/auth/logout")" "200"
check "me returns 401 after logout" "$(code -b "$COOKIE_A" "$BASE/api/auth/me")" "401"

echo
echo "--------------------------------------------"
printf 'PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
rm -f "$COOKIE_A" "$COOKIE_B" /tmp/sh_pfx.bin
[ "$FAIL" -eq 0 ] || exit 1
echo "All checks passed."
