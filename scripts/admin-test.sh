#!/usr/bin/env bash
# =============================================================================
# StudyHub admin authorization test suite.
#
# Verifies the required matrix for BOTH halves of the guard:
#
#   unauthenticated -> /admin        denied
#   student         -> /admin        denied
#   student         -> /api/admin/*  denied
#   developer       -> /admin        allowed
#   developer       -> /api/admin/*  allowed
#
# plus the per-section API behaviour and the "no secrets exposed" rule.
#
# Usage: bash scripts/admin-test.sh [base_url]
# =============================================================================
set -u

BASE="${1:-http://localhost:3000}"
JAR_ROOT="$(mktemp -d)"
pass=0; fail=0

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (expected $3, got $2)"; fi; }

# Unique accounts per run so the suite is re-runnable.
SUFFIX="$(date +%s)$RANDOM"
STUDENT_EMAIL="student_${SUFFIX}@example.com"
DEV_EMAIL="dev_${SUFFIX}@example.com"
PW="StudyHub!2026"

echo "StudyHub admin authorization tests"
echo "base: $BASE"
echo "---------------------------------"

# ---------------------------------------------------------------- accounts --
reg() { # email -> jar
  local email="$1" jar="$2"
  curl -s -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PW\"}" \
    "$BASE/api/auth/register" >/dev/null
}

SJAR="$JAR_ROOT/student.jar"
DJAR="$JAR_ROOT/dev.jar"
reg "$STUDENT_EMAIL" "$SJAR"
reg "$DEV_EMAIL" "$DJAR"

# Promote the developer account through the real CLI (the bootstrap path).
node "$(dirname "$0")/promote-admin.mjs" grant "$DEV_EMAIL" >/dev/null 2>&1
GRANTED=$?
check "developer bootstrap CLI grant succeeds" "$GRANTED" "0"

echo ""
echo "Authorization matrix"

# ---- unauthenticated -------------------------------------------------------
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
check "unauth -> /admin denied (302 to login)" "$code" "302"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/whoami")
check "unauth -> /api/admin/whoami denied (401)" "$code" "401"

# ---- student ---------------------------------------------------------------
code=$(curl -s -b "$SJAR" -o /dev/null -w '%{http_code}' "$BASE/admin")
check "student -> /admin denied (403)" "$code" "403"

code=$(curl -s -b "$SJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/whoami")
check "student -> /api/admin/whoami denied (403)" "$code" "403"

code=$(curl -s -b "$SJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/users")
check "student -> /api/admin/users denied (403)" "$code" "403"

# ---- developer -------------------------------------------------------------
code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/admin")
check "developer -> /admin allowed (200)" "$code" "200"

code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/whoami")
check "developer -> /api/admin/whoami allowed (200)" "$code" "200"

echo ""
echo "Admin sections (developer)"

for route in overview "users" data files logs system ai; do
  code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/$route")
  check "GET /api/admin/$route -> 200" "$code" "200"
done

code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/data/tables")
check "GET /api/admin/data/tables -> 200" "$code" "200"

# ---- admin page routes serve the shell -------------------------------------
for page in admin admin/users admin/data admin/files admin/logs admin/system admin/ai; do
  code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/$page")
  check "developer -> /$page allowed (200)" "$code" "200"
done

# ---- admin assets are public (no data) -------------------------------------
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/admin.css")
check "admin.css served without auth (200)" "$code" "200"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/admin.js")
check "admin.js served without auth (200)" "$code" "200"

echo ""
echo "Security: no secrets exposed"

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/users")
if echo "$BODY" | grep -qi 'password'; then bad "users payload contains 'password'"; else ok "users payload has no password field"; fi
if echo "$BODY" | grep -qi 'hash'; then bad "users payload contains a hash"; else ok "users payload has no hash"; fi
if echo "$BODY" | grep -qi 'token'; then bad "users payload contains a token"; else ok "users payload has no token"; fi

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/files")
if echo "$BODY" | grep -q '"data"'; then bad "files payload contains file data"; else ok "files payload exposes no contents"; fi

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/ai")
if echo "$BODY" | grep -qi 'sk-'; then bad "ai payload leaks an API key"; else ok "ai payload leaks no API key"; fi

echo ""
echo "AI page makes no LLM call"

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/ai")
echo "$BODY" | grep -q '"configured":false' && ok "AI reports not configured" || bad "AI should report not configured"
echo "$BODY" | grep -qi 'no LLM' && ok "AI page states no integration" || bad "AI page should state no integration"

echo ""
echo "Logs record real events"

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/logs?limit=200")
echo "$BODY" | grep -q '"available":true' && ok "audit log available" || bad "audit log should be available"
echo "$BODY" | grep -q 'auth.register' && ok "account creation logged" || bad "account creation should be logged"
echo "$BODY" | grep -q 'auth.login_failed\|authz.denied' && ok "denials logged" || bad "denials should be logged"
echo "$BODY" | grep -q 'admin.view' && ok "admin views logged" || bad "admin views should be logged"

echo ""
echo "---------------------------------"
echo "  $pass passed, $fail failed"
rm -rf "$JAR_ROOT"
[ "$fail" -eq 0 ]
