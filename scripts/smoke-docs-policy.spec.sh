#!/usr/bin/env bash
set -euo pipefail

# Test contract cho phần docs của smoke test mà không gọi HTTP thật. Mock curl
# theo policy để chứng minh script sẽ yêu cầu Basic Auth ở staging, nhưng không
# hề truyền credential trong production hidden/public local.

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Danh sách route bắt buộc được TRÍCH RA từ chính smoke-test.sh, không chép lại.
#
# Vì sao: bản chép tay đứng im trong khi danh sách thật dài thêm theo từng phân hệ,
# nên phép kiểm này đỏ vì cái nó mock thiếu route, chứ không vì policy sai — và một
# phép kiểm đỏ mãi vì lý do của chính nó thì không ai đọc nó nữa. Đo được 30/09: nó
# báo thiếu 19 route, không route nào liên quan tới điều nó muốn kiểm.
sed -n '/^  for route in /,/; do$/p' "$SCRIPT_DIR/smoke-test.sh" \
  | grep -oE "'/api/v1/[^']*'" | tr -d "'" | sort -u > "$TEMP_DIR/required-routes"
if [ ! -s "$TEMP_DIR/required-routes" ]; then
  echo 'Khong trich duoc danh sach route tu smoke-test.sh' >&2
  exit 1
fi
# Bốn khoá `errorCode` và hai khoá `201` ở cuối là thứ hai phép kiểm sau cần thấy;
# chúng không phải route nên không trích được từ vòng lặp trên.
{
  printf '{"paths":{'
  awk '{printf "%s\"%s\":{}", (NR>1 ? "," : ""), $0}' "$TEMP_DIR/required-routes"
  printf ',"x":{"errorCode":65286},"y":{"errorCode":257},"z":{"errorCode":260}'
  printf ',"a":{"errorCode":772},"201":{},"b":{"201":{}}}}'
} > "$TEMP_DIR/docs.json"

cat > "$TEMP_DIR/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

has_auth=0
path=""
out=""
prev=""
for arg in "$@"; do
  [ "$arg" = "-u" ] && has_auth=1
  # `-o <file>`: curl thật ghi THÂN vào file và chỉ in mã HTTP ra stdout. Mock phải
  # làm đúng vậy, nếu không bên gọi đọc được một chuỗi rỗng rồi báo "không tải được".
  [ "$prev" = "-o" ] && out="$arg"
  case "$arg" in
    */health|*/docs|*/docs/json|*/docs/swagger-ui-init.js) path="$arg" ;;
  esac
  prev="$arg"
done

# `*/docs*` ở dưới sẽ hút luôn đường này, nên phải chặn trước.
if [[ "$path" = */docs/swagger-ui-init.js ]]; then
  if [ "${MOCK_DOCS_POLICY:-public}" = "hidden" ]; then
    code=404
    body='{"success":false}'
  elif [ "${MOCK_DOCS_POLICY:-public}" = "basic" ] && [ "$has_auth" = 0 ]; then
    code=401
    body='{"success":false}'
  else
    code=200
    body='window.onload = function () { return 1; };'
  fi
  if [ -n "$out" ]; then
    printf '%s\n' "$body" > "$out"
    printf '%s' "$code"
  else
    printf '%s\n%s\n' "$body" "$code"
  fi
  exit 0
fi

if [[ "$path" = */health ]]; then
  printf '%s\n200\n' '{"success":true,"body":{"status":"ok","checks":[{"name":"postgres","healthy":true}]}}'
elif [[ "$path" = */docs* ]]; then
  if [ "${MOCK_DOCS_POLICY:-public}" = "hidden" ]; then
    printf '%s\n404\n' '{"success":false}'
  elif [ "${MOCK_DOCS_POLICY:-public}" = "basic" ] && [ "$has_auth" = 0 ]; then
    printf '%s\n401\n' '{"success":false}'
  else
    printf '%s\n200\n' "$(cat "$MOCK_DOCS_JSON")"
  fi
fi
MOCK
chmod +x "$TEMP_DIR/curl"

run_policy() {
  local policy="$1"
  PATH="$TEMP_DIR:$PATH" \
    MOCK_DOCS_POLICY="$policy" \
    MOCK_DOCS_JSON="$TEMP_DIR/docs.json" \
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
