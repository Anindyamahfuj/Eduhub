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

# The bootstrap CLI must write to the SAME database the tested deployment uses.
# localhost -> local D1; anything else -> remote (production) D1.
case "$BASE" in
  *localhost*|*127.0.0.1*) DB_TARGET="--local" ;;
  *)                       DB_TARGET="--remote" ;;
esac

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
echo "db:   $DB_TARGET"
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

# Promote the developer account through the real CLI (the bootstrap path),
# against the SAME database this deployment reads from.
node "$(dirname "$0")/promote-admin.mjs" grant "$DEV_EMAIL" "$DB_TARGET" >/dev/null 2>&1
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

for route in overview "users" data files tools logs system ai; do
  code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/$route")
  check "GET /api/admin/$route -> 200" "$code" "200"
done

code=$(curl -s -b "$DJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/data/tables")
check "GET /api/admin/data/tables -> 200" "$code" "200"

# ---- admin page routes serve the shell -------------------------------------
for page in admin admin/users admin/data admin/files admin/tools admin/logs admin/system admin/ai; do
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
echo "Tools API: curation round-trip"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools")
check "unauth -> /api/admin/tools denied (401)" "$code" "401"

code=$(curl -s -b "$SJAR" -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools")
check "student -> /api/admin/tools denied (403)" "$code" "403"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tools")
check "public GET /api/tools open (200)" "$code" "200"

TOOLS=$(curl -s "$BASE/api/tools")
echo "$TOOLS" | grep -q '"available":true' && ok "public tool list available" || bad "public tool list should be available"
echo "$TOOLS" | grep -q '"calculator"' && ok "public list includes calculator" || bad "public list should include calculator"

# Create a custom tool and watch it appear publicly.
CREATE=$(curl -s -b "$DJAR" -X POST -H 'Content-Type: application/json' \
  -d '{"label":"E2E Probe","href":"https://example.com/probe","icon":"ph-flask"}' \
  "$BASE/api/admin/tools")
echo "$CREATE" | grep -q '"ok":true' && ok "custom tool created" || bad "custom tool create failed: $CREATE"
TOOL_ID=$(echo "$CREATE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

if [ -n "$TOOL_ID" ]; then
  echo "$CREATE" | grep -q 'javascript:' && bad "href echoed unsanitized" || ok "created tool href sanitized"
  PUBLIC=$(curl -s "$BASE/api/tools")
  echo "$PUBLIC" | grep -q "\"$TOOL_ID\"" && ok "public list shows the new custom tool" || bad "public list should show $TOOL_ID"
else
  bad "custom tool id not parsed; round-trip skipped"
fi

# Disable a builtin: hidden publicly, still listed for the admin.
code=$(curl -s -b "$DJAR" -X PUT -H 'Content-Type: application/json' -d '{"enabled":false}' -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/calculator")
check "disable calculator -> 200" "$code" "200"
PUBLIC=$(curl -s "$BASE/api/tools")
echo "$PUBLIC" | grep -q '"calculator"' && ok "calculator still listed (flag contract)" || bad "calculator should stay listed"
echo "$PUBLIC" | grep -q '"enabled":false' && ok "disabled tool flagged in public list" || bad "public list should flag disabled tools"
ADMINLIST=$(curl -s -b "$DJAR" "$BASE/api/admin/tools")
echo "$ADMINLIST" | grep -q '"calculator"' && ok "admin list still shows disabled calculator" || bad "admin list should keep disabled tools"

code=$(curl -s -b "$DJAR" -X PUT -H 'Content-Type: application/json' -d '{"enabled":true}' -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/calculator")
check "re-enable calculator -> 200" "$code" "200"
PUBLIC=$(curl -s "$BASE/api/tools")
echo "$PUBLIC" | grep -q '"enabled":false' && bad "calculator should be re-enabled" || ok "no disabled tools left in public list"

# The dashboard is the fallback page and cannot be disabled.
code=$(curl -s -b "$DJAR" -X PUT -H 'Content-Type: application/json' -d '{"enabled":false}' -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/dashboard")
check "disabling dashboard rejected (409)" "$code" "409"

# Dangerous href schemes are rejected at the door.
code=$(curl -s -b "$DJAR" -X POST -H 'Content-Type: application/json' -d '{"label":"Bad","href":"javascript:alert(1)"}' -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools")
check "javascript: href rejected (400)" "$code" "400"

# Rename a builtin, then restore it.
code=$(curl -s -b "$DJAR" -X PUT -H 'Content-Type: application/json' -d '{"label":"Calculator Pro"}' -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/calculator")
check "rename builtin -> 200" "$code" "200"
curl -s -b "$DJAR" -X PUT -H 'Content-Type: application/json' -d '{"label":"Calculator"}' "$BASE/api/admin/tools/calculator" >/dev/null

# Builtins cannot be deleted; customs can.
code=$(curl -s -b "$DJAR" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/calculator")
check "deleting a builtin rejected (400)" "$code" "400"

if [ -n "$TOOL_ID" ]; then
  code=$(curl -s -b "$DJAR" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/admin/tools/$TOOL_ID")
  check "delete custom tool -> 200" "$code" "200"
  PUBLIC=$(curl -s "$BASE/api/tools")
  echo "$PUBLIC" | grep -q "\"$TOOL_ID\"" && bad "deleted tool should not be public" || ok "deleted tool gone from public list"
fi

echo ""
echo "AI page makes no LLM call"

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/ai")
echo "$BODY" | grep -q '"configured":false' && ok "AI reports not configured" || bad "AI should report not configured"
echo "$BODY" | grep -q 'chatEndpoint' && echo "$BODY" | grep -q 'keyHint' && ok "AI page reports config state with masked key" || bad "AI page should report config state with masked key"

echo ""
echo "Logs record real events"

BODY=$(curl -s -b "$DJAR" "$BASE/api/admin/logs?limit=200")
echo "$BODY" | grep -q '"available":true' && ok "audit log available" || bad "audit log should be available"
echo "$BODY" | grep -q 'auth.register' && ok "account creation logged" || bad "account creation should be logged"
echo "$BODY" | grep -q 'auth.login_failed\|authz.denied' && ok "denials logged" || bad "denials should be logged"
echo "$BODY" | grep -q 'admin.view' && ok "admin views logged" || bad "admin views should be logged"
echo "$BODY" | grep -q 'admin.tool_create' && ok "tool create logged" || bad "tool create should be logged"
echo "$BODY" | grep -q 'admin.tool_update' && ok "tool update logged" || bad "tool update should be logged"
echo "$BODY" | grep -q 'admin.tool_delete' && ok "tool delete logged" || bad "tool delete should be logged"

echo ""
echo "---------------------------------"
echo "  $pass passed, $fail failed"
rm -rf "$JAR_ROOT"
[ "$fail" -eq 0 ]
