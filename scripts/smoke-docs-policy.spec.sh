#!/usr/bin/env bash
set -euo pipefail

# Test contract cho phần docs của smoke test mà không gọi HTTP thật. Mock curl
# theo policy để chứng minh script sẽ yêu cầu Basic Auth ở staging, nhưng không
# hề truyền credential trong production hidden/public local.

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "$TEMP_DIR/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

has_auth=0
path=""
for arg in "$@"; do
  [ "$arg" = "-u" ] && has_auth=1
  case "$arg" in
    */health|*/docs|*/docs/json) path="$arg" ;;
  esac
done

if [[ "$path" = */health ]]; then
  printf '%s\n200\n' '{"success":true,"body":{"status":"ok","checks":[{"name":"postgres","healthy":true}]}}'
elif [[ "$path" = */docs* ]]; then
  if [ "${MOCK_DOCS_POLICY:-public}" = "hidden" ]; then
    printf '%s\n404\n' '{"success":false}'
  elif [ "${MOCK_DOCS_POLICY:-public}" = "basic" ] && [ "$has_auth" = 0 ]; then
    printf '%s\n401\n' '{"success":false}'
  else
    printf '%s\n200\n' '{"paths":{"/api/v1/gift-posts":{},"/api/v1/gift-posts/nearby":{},"/api/v1/gift-posts/{giftPostId}":{},"/api/v1/auth/register":{},"/api/v1/auth/login":{},"/api/v1/auth/refresh":{},"/api/v1/auth/logout":{},"/api/v1/auth/password-reset/request":{},"/api/v1/auth/password-reset/confirm":{},"/api/v1/auth/account":{},"x":{"errorCode":65286},"y":{"errorCode":257},"z":{"errorCode":260},"a":{"errorCode":772},"201":{},"b":{"201":{}}}}'
  fi
fi
MOCK
chmod +x "$TEMP_DIR/curl"

run_policy() {
  local policy="$1"
  PATH="$TEMP_DIR:$PATH" \
    MOCK_DOCS_POLICY="$policy" \
    SMOKE_DOCS_POLICY="$policy" \
    SWAGGER_DOCS_USERNAME=chantam \
    SWAGGER_DOCS_PASSWORD=test-password \
    bash "$SCRIPT_DIR/smoke-test.sh" https://example.test --read-only
}

BASIC_OUTPUT=$(run_policy basic)
printf '%s' "$BASIC_OUTPUT" | grep -q '/docs/json từ chối khi thiếu Swagger credential'

HIDDEN_OUTPUT=$(run_policy hidden)
printf '%s' "$HIDDEN_OUTPUT" | grep -q '/docs và /docs/json bị ẩn ở production'

PUBLIC_OUTPUT=$(run_policy public)
printf '%s' "$PUBLIC_OUTPUT" | grep -q '/docs/json có đủ route versioned'

echo 'Smoke docs policies: basic, hidden, public — OK'
