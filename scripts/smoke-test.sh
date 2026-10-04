#!/usr/bin/env bash
#
# Kiểm tra nhanh một instance Chân Tâm Core đang chạy.
#
# Dùng chung ở hai nơi:
#   - CI: chạy đầy đủ, xác nhận chuỗi PostGIS thật sự hoạt động
#   - Sau deploy: chạy --read-only làm cổng chặn trước khi coi là thành công
#
# Cùng một script cho cả hai là có chủ đích: nếu cổng kiểm tra sau deploy kiểm
# thứ khác với CI thì "CI xanh" không nói lên điều gì về production.
#
# Chỉ phụ thuộc curl + grep + sed — chạy được cả trên Git Bash của máy dev lẫn
# runner Linux, không cần cài jq hay python.
#
# Cách dùng:
#   scripts/smoke-test.sh http://localhost:3000
#   scripts/smoke-test.sh https://api.chantam.vn --read-only
#
set -uo pipefail

BASE_URL="${1:-}"
MODE="${2:-full}"

if [ -z "$BASE_URL" ]; then
  echo "Cách dùng: $0 <base-url> [--read-only]" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"

READ_ONLY=0
[ "$MODE" = "--read-only" ] && READ_ONLY=1

# Chính sách docs do môi trường reverse proxy quyết định:
#   public — local/dev, Swagger không khoá
#   basic  — staging, phải có Basic Auth
#   hidden — production, Nginx trả 404 cho cả /docs và /docs/json
DOCS_POLICY="${SMOKE_DOCS_POLICY:-public}"
SWAGGER_DOCS_USERNAME="${SWAGGER_DOCS_USERNAME:-}"
SWAGGER_DOCS_PASSWORD="${SWAGGER_DOCS_PASSWORD:-}"

case "$DOCS_POLICY" in
  public|basic|hidden) ;;
  *)
    echo "SMOKE_DOCS_POLICY phải là public, basic hoặc hidden." >&2
    exit 2
    ;;
esac

if [ "$DOCS_POLICY" = "basic" ] && {
  [ -z "$SWAGGER_DOCS_USERNAME" ] || [ -z "$SWAGGER_DOCS_PASSWORD" ];
}; then
  echo "Swagger Basic Auth bật nhưng thiếu SWAGGER_DOCS_USERNAME hoặc SWAGGER_DOCS_PASSWORD." >&2
  exit 2
fi

# UUID hợp lệ theo RFC (nibble variant là 8/9/a/b) — @IsUUID() từ chối các chuỗi
# kiểu 2222-2222-... dù trông giống UUID.
GIVER_ID='9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b'

# Toạ độ thử đặt ở Hà Nội, còn phép thử "ngoài bán kính" dùng TP.HCM cách ~1.100km
# — đủ xa để không bao giờ lọt vào bán kính 1km dù dữ liệu có sẵn thế nào.
TEST_LAT=21.0278
TEST_LNG=105.8342
FAR_LAT=10.7724
FAR_LNG=106.6980

PASSED=0
FAILED=0
CREATED_ID=""

pass() { PASSED=$((PASSED + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }

fail() {
  FAILED=$((FAILED + 1))
  printf '  \033[31m✗\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  return 0
}

# Gọi API, trả về body ở $RESP_BODY và mã HTTP ở $RESP_CODE.
# Tham số thứ tư là tuỳ chọn `user:password` cho Swagger Basic Auth.
call() {
  local method="$1" path="$2" data="${3:-}" basic_auth="${4:-}"
  local raw auth_args=()

  if [ -n "$basic_auth" ]; then
    auth_args=(-u "$basic_auth")
  fi

  if [ -n "$data" ]; then
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      ${auth_args:+"${auth_args[@]}"} -H 'Content-Type: application/json' -d "$data" 2>&1)
  else
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      ${auth_args:+"${auth_args[@]}"} 2>&1)
  fi

  RESP_CODE="${raw##*$'\n'}"
  RESP_BODY="${raw%$'\n'*}"
}

# Như `call` nhưng kèm access token.
call_auth() {
  local method="$1" path="$2" token="$3" data="${4:-}"
  local raw

  if [ -n "$data" ]; then
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $token" -d "$data" 2>&1)
  else
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      -H "Authorization: Bearer $token" 2>&1)
  fi

  RESP_CODE="${raw##*$'\n'}"
  RESP_BODY="${raw%$'\n'*}"
}

# Lấy giá trị chuỗi đầu tiên của một khoá JSON mà không cần jq.
json_str() {
  printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed 's/.*:"//; s/"$//'
}

echo "Kiểm tra: $BASE_URL  (chế độ: $([ $READ_ONLY -eq 1 ] && echo 'chỉ đọc' || echo 'đầy đủ'))"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "Sức khoẻ dịch vụ"

call GET /health
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"status":"ok"'; then
  pass "/health trả status ok"
else
  fail "/health không xanh" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Kết nối database nằm trong health: nếu Postgres chết, checks[].healthy = false.
if printf '%s' "$RESP_BODY" | grep -q '"name":"postgres","healthy":true'; then
  pass "kết nối database sống"
else
  fail "database không phản hồi" "$RESP_BODY"
fi

if [ "$DOCS_POLICY" = "hidden" ]; then
  call GET /docs
  DOCS_UI_CODE="$RESP_CODE"
  call GET /docs/json

  if [ "$DOCS_UI_CODE" = "404" ] && [ "$RESP_CODE" = "404" ]; then
    pass "/docs và /docs/json bị ẩn ở production"
  else
    fail "Swagger production đáng lẽ phải 404" "/docs=$DOCS_UI_CODE, /docs/json=$RESP_CODE"
  fi
else
  DOCS_AUTH=""
  [ "$DOCS_POLICY" = "basic" ] && DOCS_AUTH="${SWAGGER_DOCS_USERNAME}:${SWAGGER_DOCS_PASSWORD}"

  # Khi docs Basic Auth, xác nhận trước rằng Nginx thật sự từ chối anonymous
  # request. Không làm bước này thì password file hỏng/mất vẫn có thể bị bỏ qua.
  if [ "$DOCS_POLICY" = "basic" ]; then
    call GET /docs/json
    if [ "$RESP_CODE" = "401" ]; then
      pass "/docs/json từ chối khi thiếu Swagger credential"
    else
      fail "Swagger Basic Auth không chặn anonymous request" "HTTP $RESP_CODE"
    fi
  fi

  call GET /docs/json "" "$DOCS_AUTH"
  MISSING=""
  for route in '/api/v1/gift-posts' '/api/v1/gift-posts/nearby' '/api/v1/gift-posts/{giftPostId}' '/api/v1/auth/register' '/api/v1/auth/login' '/api/v1/auth/refresh' '/api/v1/auth/logout' \
    '/api/v1/auth/password-reset/request' '/api/v1/auth/password-reset/confirm' \
    '/api/v1/auth/account' \
    '/api/v1/points/me' '/api/v1/points/me/ledger' '/api/v1/ranks/me' \
    '/api/v1/referrals/me' '/api/v1/me/entitlements' \
    '/api/v1/transactions/me' \
    '/api/v1/categories' \
    '/api/v1/posts' '/api/v1/posts/me' '/api/v1/posts/nearby' \
    '/api/v1/posts/{postId}' '/api/v1/posts/{postId}/matches' \
    '/api/v1/admin/system-configs' '/api/v1/admin/audit-logs' \
    '/api/v1/admin/system-logs' '/api/v1/admin/users' \
    '/api/v1/admin/dashboard' '/api/v1/admin/reports/reporters' \
    '/api/v1/admin/entitlements'; do
    printf '%s' "$RESP_BODY" | grep -q "\"$route\"" || MISSING="$MISSING $route"
  done
  LEGACY_ROUTES=$(printf '%s' "$RESP_BODY" | grep -oE '"/api/[^"]*"' | grep -v '^"/api/v1/' || true)

  if [ "$RESP_CODE" = "200" ] && [ -z "$MISSING" ] && [ -z "$LEGACY_ROUTES" ]; then
    pass "/docs/json có đủ route versioned"
  else
    fail "/docs/json sai contract versioned" "HTTP $RESP_CODE — thiếu:$MISSING cũ:$LEGACY_ROUTES"
  fi

  # ── swagger-ui-init.js phải là JS CHẠY ĐƯỢC ────────────────────────────────
  #
  # Lỗi thật trên staging 05/10: `/docs` trả trang TRẮNG TINH sau khi đăng nhập, mà
  # mọi phép kiểm ở trên đều xanh — `/docs` 200, `/docs/json` 200 với spec đúng và đủ
  # route, cả ba asset 200. Trang trắng vì `swagger-ui-init.js` là JS **lỗi cú pháp**:
  #
  #   SyntaxError: Invalid or unexpected token
  #     "description": "Nhận cả hai dạng: slug có dạng `^[a-z0-9]+(-[a-z0-9]+)*
  #
  # `@nestjs/swagger` nhét spec vào template bằng `String.replace()`, và trong CHUỖI
  # THAY THẾ của `replace()` thì `$`` nghĩa là "toàn bộ phần trước chỗ khớp". Một
  # description chứa `$`` (dấu đô ngay trước backtick) làm spec vỡ từ điểm đó.
  #
  # Vì sao cần phép kiểm RIÊNG: `/docs/json` dựng theo đường khác nên nó vẫn ĐÚNG
  # hoàn toàn. Không có bước nào hỏi "cái file init kia có chạy được không", nên lỗi
  # nằm im hai ngày qua ba commit và chỉ lộ khi có người mở trang.
  #
  # `node --check` là phép kiểm đúng: nó phân tích cú pháp mà không chạy mã.
  #
  # Tên file PHẢI kết thúc bằng `.js`. `mktemp` cho `/tmp/tmp.AbC123`, và Node 22 đọc
  # `.AbC123` là một phần mở rộng lạ rồi ném `ERR_UNKNOWN_FILE_EXTENSION` — tức
  # `node --check` thất bại với MỌI nội dung, kể cả một file hoàn toàn đúng. Lượt đầu
  # của phép kiểm này mắc đúng lỗi đó: nó làm job docker đỏ trên một image lành, và
  # thông điệp đỏ lại nói "trang docs sẽ trắng" — một phép kiểm luôn đỏ vô dụng y như
  # một phép kiểm luôn xanh.
  INIT_DIR="$(mktemp -d)"
  INIT_JS="$INIT_DIR/swagger-ui-init.js"
  INIT_CONTROL="$INIT_DIR/positive-control.js"
  echo 'window.onload = function () { return 1; };' > "$INIT_CONTROL"
  INIT_CODE="$(
    curl -sS -o "$INIT_JS" -w '%{http_code}' \
      ${DOCS_AUTH:+-u "$DOCS_AUTH"} "$BASE_URL/docs/swagger-ui-init.js" || echo 000
  )"
  if [ "$INIT_CODE" != "200" ]; then
    fail "/docs/swagger-ui-init.js không tải được" "HTTP $INIT_CODE"
  elif ! command -v node >/dev/null 2>&1; then
    # Không có node thì nói thẳng là BỎ QUA. Im lặng coi như đạt là đúng kiểu lỗi
    # phép kiểm này được viết ra để chặn.
    printf '  (bỏ qua: host không có node để chạy `node --check`)\n'
  elif ! NODE_ERR="$(node --check "$INIT_CONTROL" 2>&1)"; then
    # Mẫu đối chứng: một file JS chắc chắn đúng, nằm cùng thư mục, cùng phần mở rộng.
    # Nó đỏ thì lỗi ở CÁCH GỌI `node --check`, không phải ở nội dung tải về — nói đúng
    # điều đó thay vì vu cho trang docs.
    fail "node --check không dùng được ở host này" \
      "$(printf '%s' "$NODE_ERR" | head -3 | tr '\n' ' ')"
  elif NODE_ERR="$(node --check "$INIT_JS" 2>&1)"; then
    pass "/docs/swagger-ui-init.js là JS hợp lệ — trang docs dựng được"
  else
    fail "/docs/swagger-ui-init.js LỖI CÚ PHÁP — trang docs sẽ trắng" \
      "$(printf '%s' "$NODE_ERR" | head -3 | tr '\n' ' ')"
  fi
  rm -rf "$INIT_DIR"
fi

if [ "$DOCS_POLICY" != "hidden" ]; then
  # Cặp (errorOrigin, errorCode) là thứ client mobile phải code theo. Tài liệu chỉ
  # khai mã 200 thì client không biết phân biệt "sai mật khẩu" với "tài khoản bị
  # khoá" — nên kiểm luôn rằng đặc tả có khai lỗi, không chỉ đường thành công.
  DOCS_BODY="$RESP_BODY"
  MISSING_ERRORS=""

  # Mã lỗi đại diện cho từng tầng, tất cả đều đã đối chiếu với hành vi thật:
  #   65286 kernel/common-lib (validate) · 257 system/auth-lib (thiếu token)
  #   260   system/auth-lib (token bị thu hồi) · 772 chantam/core (trùng username)
  for code in 65286 257 260 772; do
    printf '%s' "$DOCS_BODY" | grep -q "\"errorCode\":$code" ||
      MISSING_ERRORS="$MISSING_ERRORS $code"
  done

  if [ -z "$MISSING_ERRORS" ]; then
    pass "/docs/json khai cả mã lỗi, không chỉ đường thành công"
  else
    fail "/docs/json thiếu mã lỗi" "thiếu:$MISSING_ERRORS"
  fi

  # Nest trả 201 cho POST không đánh @HttpCode, nên đặc tả phải khai 201 chứ không
  # phải 200 — client sinh từ đặc tả sẽ coi mã lạ là ngoài dự kiến. Hiện có đúng
  # hai endpoint như vậy: tạo tài khoản và tạo bài đăng.
  CREATED_COUNT=$(printf '%s' "$DOCS_BODY" | grep -o '"201":' | wc -l)

  if [ "$CREATED_COUNT" -ge 2 ]; then
    pass "endpoint tạo mới khai đúng mã 201"
  else
    fail "đặc tả khai sai mã cho endpoint tạo mới" "tìm thấy $CREATED_COUNT chỗ khai 201, cần ít nhất 2"
  fi
fi

if [ $READ_ONLY -eq 1 ]; then
  echo
  echo "Chế độ chỉ đọc — bỏ qua các phép thử có ghi dữ liệu."
  echo
  echo "Kết quả: $PASSED đạt, $FAILED lỗi"
  [ $FAILED -eq 0 ] || exit 1
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Xác thực"

SMOKE_USER="smoke$(date +%s)$$"
SMOKE_PASS='SmokeTest@123'

call POST /api/v1/auth/register "{\"registration\":{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"$SMOKE_PASS\",\"deviceId\":\"smoke-device\"}}"
ACCESS_TOKEN=$(json_str "$RESP_BODY" accessToken)
REFRESH_TOKEN=$(json_str "$RESP_BODY" refreshToken)

if [ -n "$ACCESS_TOKEN" ] && [ -n "$REFRESH_TOKEN" ]; then
  pass "đăng ký và nhận được cặp token"
else
  fail "đăng ký không trả về token" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Đăng ký xong hồ sơ chưa đủ Họ tên/Avatar/SĐT/Email nên chưa được đăng bài (F07).
if printf '%s' "$RESP_BODY" | grep -q '"profileComplete":false'; then
  pass "hồ sơ mới chưa đủ điều kiện đăng bài"
else
  fail "profileComplete sai ngay sau khi đăng ký" "$RESP_BODY"
fi

call POST /api/v1/auth/register "{\"registration\":{\"username\":\"${SMOKE_USER}x\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"KhacHoanToan@9\",\"deviceId\":\"d\"}}"
if [ "$RESP_CODE" = "400" ]; then
  pass "mật khẩu xác nhận không khớp bị chặn"
else
  fail "confirmPassword không được kiểm" "HTTP $RESP_CODE"
fi

call GET /api/v1/auth/me
if [ "$RESP_CODE" = "401" ]; then
  pass "endpoint cần quyền từ chối khi thiếu token"
else
  fail "endpoint cần quyền vẫn cho qua khi không có token" "HTTP $RESP_CODE"
fi

# Sai mật khẩu và tài khoản không tồn tại phải trả về HỆT NHAU — nếu khác, kẻ
# tấn công dò được username nào đang tồn tại.
call POST /api/v1/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"SaiHoanToan@9\",\"deviceId\":\"d\"}}"
WRONG_PASSWORD_BODY="$RESP_BODY"
call POST /api/v1/auth/login "{\"credentials\":{\"identifier\":\"khong-ton-tai-$$\",\"password\":\"SaiHoanToan@9\",\"deviceId\":\"d\"}}"

if [ "$WRONG_PASSWORD_BODY" = "$RESP_BODY" ]; then
  pass "sai mật khẩu và tài khoản lạ trả lời giống hệt nhau"
else
  fail "phản hồi khác nhau — dò được tài khoản tồn tại" "$WRONG_PASSWORD_BODY vs $RESP_BODY"
fi

call POST /api/v1/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"deviceId\":\"smoke-device-2\"}}"
if [ "$RESP_CODE" = "200" ]; then
  pass "đăng nhập bằng mật khẩu đúng"
else
  fail "không đăng nhập được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call POST /api/v1/auth/refresh "{\"session\":{\"refreshToken\":\"$REFRESH_TOKEN\"}}"
ROTATED_TOKEN=$(json_str "$RESP_BODY" refreshToken)
ROTATED_ACCESS=$(json_str "$RESP_BODY" accessToken)

if [ -n "$ROTATED_TOKEN" ] && [ "$ROTATED_TOKEN" != "$REFRESH_TOKEN" ]; then
  pass "làm mới phiên trả về refresh token mới"
else
  fail "refresh không xoay vòng token" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Token cũ phải chết ngay. Không chết nghĩa là token bị đánh cắp dùng được mãi.
call POST /api/v1/auth/refresh "{\"session\":{\"refreshToken\":\"$REFRESH_TOKEN\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "refresh token cũ mất hiệu lực sau khi xoay vòng"
else
  fail "refresh token cũ VẪN DÙNG ĐƯỢC" "HTTP $RESP_CODE"
fi

call_auth POST /api/v1/auth/logout "$ROTATED_ACCESS" "{\"session\":{\"refreshToken\":\"$ROTATED_TOKEN\"}}"
if [ "$RESP_CODE" = "200" ]; then
  pass "đăng xuất"
else
  fail "không đăng xuất được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call POST /api/v1/auth/refresh "{\"session\":{\"refreshToken\":\"$ROTATED_TOKEN\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "phiên đã đăng xuất không làm mới được nữa"
else
  fail "vẫn refresh được sau khi đăng xuất" "HTTP $RESP_CODE"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Quên mật khẩu (F05)"

# Tài khoản smoke chưa gắn email/SĐT, nên nó và một tài khoản không tồn tại
# phải trả lời HỆT NHAU. Khác nhau một chữ là endpoint này thành công cụ dò
# xem username nào có thật — đúng lỗ hổng màn đăng nhập đã cẩn thận tránh.
call POST /api/v1/auth/password-reset/request "{\"reset\":{\"identifier\":\"$SMOKE_USER\"}}"
NO_CONTACT_BODY="$RESP_BODY"
NO_CONTACT_CODE="$RESP_CODE"
call POST /api/v1/auth/password-reset/request "{\"reset\":{\"identifier\":\"khong-ton-tai-$$\"}}"

if [ "$NO_CONTACT_BODY" = "$RESP_BODY" ] && [ "$NO_CONTACT_CODE" = "$RESP_CODE" ]; then
  pass "tài khoản không có liên hệ và tài khoản lạ trả lời giống hệt nhau"
else
  fail "phản hồi khác nhau — dò được tài khoản tồn tại" "$NO_CONTACT_BODY vs $RESP_BODY"
fi

if printf '%s' "$RESP_BODY" | grep -q '"channel":"ADMIN_SUPPORT"'; then
  pass "không có kênh khôi phục thì hướng người dùng sang hỗ trợ"
else
  fail "kênh khôi phục sai" "$RESP_BODY"
fi

# Không có đích gửi thì không được lộ email/SĐT nào cả.
if printf '%s' "$RESP_BODY" | grep -q '"maskedTarget":null'; then
  pass "không lộ đích gửi khi chưa có kênh khôi phục"
else
  fail "maskedTarget đáng lẽ phải null" "$RESP_BODY"
fi

# Mã sai của tài khoản có thật và của tài khoản lạ cũng phải giống nhau.
call POST /api/v1/auth/password-reset/confirm "{\"reset\":{\"identifier\":\"$SMOKE_USER\",\"otp\":\"000000\",\"newPassword\":\"MoiHoanToan@9\",\"confirmPassword\":\"MoiHoanToan@9\"}}"
BAD_OTP_BODY="$RESP_BODY"
BAD_OTP_CODE="$RESP_CODE"
call POST /api/v1/auth/password-reset/confirm "{\"reset\":{\"identifier\":\"khong-ton-tai-$$\",\"otp\":\"000000\",\"newPassword\":\"MoiHoanToan@9\",\"confirmPassword\":\"MoiHoanToan@9\"}}"

if [ "$BAD_OTP_CODE" = "400" ] && [ "$BAD_OTP_BODY" = "$RESP_BODY" ]; then
  pass "mã sai bị từ chối, và không phân biệt tài khoản có thật hay không"
else
  fail "xác nhận mã không an toàn" "HTTP $BAD_OTP_CODE — $BAD_OTP_BODY vs $RESP_BODY"
fi

# Chặng gửi mã thật (OTP -> đổi mật khẩu) không kiểm được ở đây vì mã chỉ nằm
# trong log dịch vụ, mà smoke test có thể chạy từ máy khác. Chặng đó đã có test
# thủ công và sẽ có test tích hợp khi cắm nhà cung cấp email/SMS thật.

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Xoá tài khoản (F06)"

call POST /api/v1/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"deviceId\":\"smoke-delete\"}}"
DELETE_TOKEN=$(json_str "$RESP_BODY" accessToken)

call DELETE /api/v1/auth/account "{\"account\":{\"password\":\"$SMOKE_PASS\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "không có token thì không xoá được tài khoản"
else
  fail "xoá tài khoản không cần token" "HTTP $RESP_CODE"
fi

call_auth DELETE /api/v1/auth/account "$DELETE_TOKEN" '{"account":{"password":"SaiHoanToan@9"}}'
if [ "$RESP_CODE" = "401" ]; then
  pass "sai mật khẩu thì không xoá được tài khoản"
else
  fail "xoá tài khoản không bắt nhập lại mật khẩu" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth GET /api/v1/auth/me "$DELETE_TOKEN"
if [ "$RESP_CODE" = "200" ]; then
  pass "tài khoản còn nguyên sau lần xoá hụt"
else
  fail "tài khoản hỏng sau lần xoá hụt" "HTTP $RESP_CODE"
fi

call_auth DELETE /api/v1/auth/account "$DELETE_TOKEN" "{\"account\":{\"password\":\"$SMOKE_PASS\"}}"
if [ "$RESP_CODE" = "200" ]; then
  pass "xoá tài khoản với mật khẩu đúng"
else
  fail "không xoá được tài khoản" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Đây là phép thử quan trọng nhất của khối này. Access token là JWT nên tự nó
# còn hiệu lực tới 15 phút; không có danh sách thu hồi thì token vừa dùng để
# xoá tài khoản vẫn gọi API được sau đó — tài khoản "đã xoá" mà vẫn thao tác.
call_auth GET /api/v1/auth/me "$DELETE_TOKEN"
if [ "$RESP_CODE" = "401" ]; then
  pass "access token chết NGAY khi tài khoản bị xoá"
else
  fail "TOKEN CŨ VẪN DÙNG ĐƯỢC SAU KHI XOÁ TÀI KHOẢN" "HTTP $RESP_CODE — $RESP_BODY"
fi

call POST /api/v1/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"deviceId\":\"d\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "tài khoản đã xoá không đăng nhập lại được"
else
  fail "vẫn đăng nhập được sau khi xoá" "HTTP $RESP_CODE"
fi

# Username được giữ lại có chủ đích: xoá nó đi thì người khác đăng ký lại đúng
# tên đó và mạo danh trong lịch sử giao dịch cũ.
call POST /api/v1/auth/register "{\"registration\":{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"$SMOKE_PASS\",\"deviceId\":\"d\"}}"
if [ "$RESP_CODE" = "409" ]; then
  pass "username của tài khoản đã xoá không ai chiếm được"
else
  fail "username bị giải phóng — có thể mạo danh" "HTTP $RESP_CODE"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Hồ sơ và cổng đăng bài"

# F06 đã xoá SMOKE_USER ở phần auth phía trên, nên tạo tài khoản RIÊNG cho
# profile/post flow. Nếu dùng lại token/user vừa xoá thì smoke vô tình kiểm sai.
PROFILE_USER="profile$(date +%s)$$"
PROFILE_PHONE="+${PROFILE_USER#profile}"
PROFILE_EMAIL="${PROFILE_USER}@example.com"
call POST /api/v1/auth/register "{\"registration\":{\"username\":\"$PROFILE_USER\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"$SMOKE_PASS\",\"deviceId\":\"profile-device\"}}"
PROFILE_ACCESS_TOKEN=$(json_str "$RESP_BODY" accessToken)

# F07: account mới thiếu 4 field profile thì phải bị chặn trước khi tạo bài.
call_auth POST /api/v1/gift-posts "$PROFILE_ACCESS_TOKEN" '{"giftPost":{"title":"Xe dap cu con dung tot","description":"Xe dap con dung tot, tang nguoi can di hoc hoac di lam.","category":"VEHICLE","condition":"USED","estimatedValue":100000,"location":{"lat":21.028,"lng":105.835},"areaLabel":"Hoan Kiem, Ha Noi"}}'
if [ "$RESP_CODE" = "403" ] && printf '%s' "$RESP_BODY" | grep -q '"errorCode":776'; then
  pass "hồ sơ chưa đủ bị chặn đăng bài (F07)"
else
  fail "cổng hoàn thiện hồ sơ không hoạt động" "HTTP $RESP_CODE — $RESP_BODY"
fi

# F24: xin presign, PUT ảnh trực tiếp rồi chỉ gửi avatarKey. Không nhận URL tuỳ
# ý: server HeadObject xác nhận key/MIME/kích thước thuộc đúng user trước attach.
call_auth PATCH /api/v1/profile/me/avatar-upload "$PROFILE_ACCESS_TOKEN" '{"contentType":"image/webp","contentLength":20}'
AVATAR_UPLOAD_URL=$(json_str "$RESP_BODY" uploadUrl)
AVATAR_KEY=$(json_str "$RESP_BODY" key)
if [ -n "$AVATAR_UPLOAD_URL" ] && [ -n "$AVATAR_KEY" ]; then
  # Tiny WebP-shaped payload đủ cho object-storage; content type/length đã ký.
  AVATAR_PUT=$(printf 'RIFF....WEBPVP8 ........' | curl -sS -m 20 -o /dev/null -w '%{http_code}'     -X PUT -H 'Content-Type: image/webp' -H 'Content-Length: 20' --data-binary @- "$AVATAR_UPLOAD_URL" 2>&1)
else
  AVATAR_PUT=000
fi

call_auth PATCH /api/v1/profile/me "$PROFILE_ACCESS_TOKEN" "{\"profile\":{\"fullName\":\"Smoke User\",\"avatarKey\":\"$AVATAR_KEY\",\"email\":\"$PROFILE_EMAIL\",\"phone\":\"$PROFILE_PHONE\",\"defaultLocation\":{\"lat\":21.028,\"lng\":105.835}}}"
if [ "$AVATAR_PUT" = "200" ] && [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"profileComplete":true'; then
  pass "upload avatar trực tiếp + cập nhật hồ sơ/vị trí (F08/F11/F24)"
else
  fail "không hoàn thiện được hồ sơ sau upload avatar" "PUT=$AVATAR_PUT, HTTP $RESP_CODE — $RESP_BODY"
fi

# Email/phone/default location chỉ owner thấy; public profile tuyệt đối không lộ.
call_auth GET /api/v1/profile/me "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"defaultLocation"'; then
  pass "hồ sơ owner có vị trí mặc định"
else
  fail "hồ sơ owner thiếu vị trí mặc định" "HTTP $RESP_CODE — $RESP_BODY"
fi

# F56: hồ sơ đủ mới chỉ qua được `assertComplete`. Đăng bài còn cần
# `assertOnboarded` — tức đã thoát VIEWER — và từ 26/09 thoát VIEWER đòi thêm
# bằng chứng PHONE_VERIFIED. Bỏ chặng này thì mọi phép thử vòng đời bài đăng
# phía dưới đều ăn 403 "Cần hoàn tất onboarding trước khi đăng bài".
#
# OTP không đi qua HTTP được: ở môi trường không phải production nó được GHI RA
# LOG thay vì gửi SMS (`ConfiguredOtpSender`), và đó là đường duy nhất lấy được
# mã mà không chọc thẳng vào database. Nên smoke đọc log service — cần
# `CORE_LOG` trỏ tới file log, và cần service chạy ở mức log `debug` vì mã nằm
# ở dòng `logger.debug`.
call_auth PATCH /api/v1/profile/me/phone-verification/request "$PROFILE_ACCESS_TOKEN" ''
if [ "$RESP_CODE" = "200" ]; then
  pass "xin được OTP xác minh SĐT (F56)"
else
  fail "không xin được OTP xác minh SĐT" "HTTP $RESP_CODE — $RESP_BODY"
fi

PHONE_OTP=""
if [ -n "${CORE_LOG:-}" ] && [ -f "$CORE_LOG" ]; then
  # Lấy mã CUỐI CÙNG: cùng một lần chạy có thể đã xin OTP cho việc khác trước đó,
  # và mã cũ thì OTP store đã thay thế.
  PHONE_OTP=$(grep -o 'mã: [0-9]\{6\}' "$CORE_LOG" | tail -1 | grep -o '[0-9]\{6\}')
fi

if [ -z "$PHONE_OTP" ]; then
  fail "không đọc được OTP từ log service" "CORE_LOG='${CORE_LOG:-chưa đặt}' — cần trỏ tới log của service và service phải chạy LOG_LEVEL=debug"
else
  call_auth PATCH /api/v1/profile/me/phone-verification/confirm "$PROFILE_ACCESS_TOKEN" "{\"verification\":{\"otp\":\"$PHONE_OTP\"}}"
  if [ "$RESP_CODE" = "200" ]; then
    pass "xác minh SĐT bằng OTP đọc từ log (F56)"
  else
    fail "xác nhận OTP thất bại" "HTTP $RESP_CODE — $RESP_BODY"
  fi

  # Thoát VIEWER là điều kiện đăng bài. Kiểm ngay tại đây chứ không để lộ ra ở
  # bước tạo bài: ở đó lỗi sẽ hiện thành "không tạo được bài đăng", đúng nhưng
  # chỉ sai chỗ.
  call_auth GET /api/v1/profile/me "$PROFILE_ACCESS_TOKEN"
  if printf '%s' "$RESP_BODY" | grep -q '"rank":"VIEWER"'; then
    fail "xác minh SĐT xong vẫn là VIEWER" "$RESP_BODY"
  else
    pass "xác minh SĐT xong thì thoát VIEWER, đăng bài được"
  fi
fi

call GET "/api/v1/profile/$PROFILE_USER"
if [ "$RESP_CODE" = "200" ] && ! printf '%s' "$RESP_BODY" | grep -qE '"(email|phone|defaultLocation)"'; then
  pass "hồ sơ công khai không lộ contact/vị trí"
else
  fail "hồ sơ công khai làm lộ dữ liệu riêng" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Public profile được phép khoe điểm TÍCH LUỸ, nhưng số dư tiêu được là của
# riêng chủ tài khoản — lộ ra là lộ sức mua của người ta.
if printf '%s' "$RESP_BODY" | grep -q '"lifetimePoints"' &&
  ! printf '%s' "$RESP_BODY" | grep -q '"balance"'; then
  pass "hồ sơ công khai có điểm tích luỹ nhưng không lộ số dư tiêu được"
else
  fail "hồ sơ công khai sai về điểm" "HTTP $RESP_CODE — $RESP_BODY"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Điểm, thứ hạng, giới thiệu và quyền"

call_auth GET /api/v1/points/me "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] &&
  printf '%s' "$RESP_BODY" | grep -q '"balance"' &&
  printf '%s' "$RESP_BODY" | grep -q '"lifetime"'; then
  pass "số dư điểm chính chủ tách lifetime và balance"
else
  fail "không đọc được số dư điểm chính chủ" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth GET "/api/v1/points/me/ledger?page=1&pageSize=5" "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"meta"'; then
  pass "lịch sử ledger chính chủ có phân trang"
else
  fail "không đọc được lịch sử ledger" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Ledger là dữ liệu nội bộ: khoá idempotency và actor không được ra ngoài.
if ! printf '%s' "$RESP_BODY" | grep -qE '"(idempotencyKey|actor|referenceId)"'; then
  pass "ledger không lộ khoá idempotency/actor ra ngoài"
else
  fail "ledger lộ dữ liệu nội bộ" "$RESP_BODY"
fi

call_auth GET /api/v1/ranks/me "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"rank"'; then
  pass "tóm tắt thứ hạng chính chủ đọc được"
else
  fail "không đọc được thứ hạng chính chủ" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth GET /api/v1/referrals/me "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"code"'; then
  pass "mã giới thiệu chính chủ đọc được"
else
  fail "không đọc được mã giới thiệu" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth GET /api/v1/me/entitlements "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"capabilities"'; then
  pass "quyền theo hạng đọc được"
else
  fail "không đọc được quyền theo hạng" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth GET /api/v1/transactions/me "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"transactions"'; then
  pass "danh sách giao dịch của chính mình đọc được"
else
  fail "không đọc được danh sách giao dịch" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Người thường không được chạm vào khu quản trị. Guard là fail-closed nên đây
# cũng là phép kiểm rằng nó thật sự đang gắn.
for admin_path in /api/v1/admin/system-configs /api/v1/admin/audit-logs \
  /api/v1/admin/users /api/v1/admin/dashboard /api/v1/admin/reports/reporters; do
  call_auth GET "$admin_path" "$PROFILE_ACCESS_TOKEN"
  if [ "$RESP_CODE" = "403" ]; then
    pass "người thường bị chặn khỏi $admin_path"
  else
    fail "khu quản trị không chặn người thường" "$admin_path — HTTP $RESP_CODE"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Kiểm tra dữ liệu đầu vào"

call_auth POST /api/v1/gift-posts "$PROFILE_ACCESS_TOKEN" '{"giftPost":{}}'
if [ "$RESP_CODE" = "400" ] && printf '%s' "$RESP_BODY" | grep -q '"errorOrigin":"kernel/common-lib"'; then
  pass "dữ liệu sai trả 400 kèm errorOrigin của nền tảng"
else
  fail "validate không hoạt động đúng" "HTTP $RESP_CODE — $RESP_BODY"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Vòng đời bài đăng"

PAYLOAD=$(cat <<JSON
{"giftPost":{
  "title":"Smoke test $(date +%s)",
  "description":"Ban ghi do smoke-test.sh tao ra, co the xoa an toan.",
  "category":"BOOKS","condition":"USED","estimatedValue":100000,
  "location":{"lat":${TEST_LAT},"lng":${TEST_LNG}},
  "areaLabel":"Smoke test"}}
JSON
)

call_auth POST /api/v1/gift-posts "$PROFILE_ACCESS_TOKEN" "$PAYLOAD"
CREATED_ID=$(json_str "$RESP_BODY" globalId)

if [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ]; then
  if [ -n "$CREATED_ID" ]; then
    pass "tạo bài đăng ($CREATED_ID)"
  else
    fail "tạo bài đăng nhưng không có globalId" "$RESP_BODY"
  fi
else
  fail "không tạo được bài đăng" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Từ 26/09 bài lên THẲNG PUBLISHED — hậu kiểm thay cho tiền kiểm. Trước đó chỗ
# này canh PENDING_REVIEW, và nó đúng cho tới ngày đổi.
if printf '%s' "$RESP_BODY" | grep -q '"status":"PUBLISHED"'; then
  pass "bài mới lên thẳng PUBLISHED, không chờ duyệt"
else
  fail "bài mới không vào PUBLISHED" "$RESP_BODY"
fi

if [ -z "$CREATED_ID" ]; then
  echo
  echo "Không có globalId — dừng, các phép thử sau không có ý nghĩa."
  echo "Kết quả: $PASSED đạt, $FAILED lỗi"
  exit 1
fi

# Hậu kiểm: bài hiện NGAY, không chờ ai duyệt. Đây chính là điều khoản đã đổi
# 26/09, nên kiểm thẳng nó thay vì kiểm điều ngược lại như trước.
call GET "/api/v1/gift-posts/nearby?lat=${TEST_LAT}&lng=${TEST_LNG}&radiusMeters=2000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  pass "bài mới hiện ngay trên bảng tin, không qua hàng đợi duyệt"
else
  fail "bài mới KHÔNG hiện trên bảng tin" "$CREATED_ID"
fi

# Hậu kiểm đi qua CÙNG một endpoint, chỉ đổi vai: nay nó dùng để GỠ bài đang
# hiện chứ không phải để thả bài đang chờ. `reason` vẫn bắt buộc và mọi quyết
# định vẫn đi vào nhật ký kiểm duyệt. Tài khoản demo-kiem-duyet được
# `npm run seed:demo` gán vai trò MODERATOR, nên quyền đọc từ database chứ
# không từ biến môi trường.
call POST /api/v1/auth/login '{"credentials":{"identifier":"demo-kiem-duyet","password":"Demo@12345","deviceId":"smoke-moderator"}}'
MOD_ACCESS_TOKEN=$(json_str "$RESP_BODY" accessToken)

call_auth PATCH "/api/v1/admin/posts/${CREATED_ID}/moderation" "$MOD_ACCESS_TOKEN" '{"moderation":{"decision":"REJECTED","reason":"Smoke test gỡ thử"}}'
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"status":"REJECTED"'; then
  pass "hậu kiểm gỡ được bài đang hiện"
else
  fail "không gỡ được bài bằng hậu kiểm" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Gỡ xong thì phải BIẾN MẤT khỏi bảng tin — nếu không thì hậu kiểm chỉ là ghi
# chép, không phải biện pháp.
call GET "/api/v1/gift-posts/nearby?lat=${TEST_LAT}&lng=${TEST_LNG}&radiusMeters=2000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  fail "bài đã gỡ VẪN còn trên bảng tin" "$CREATED_ID"
else
  pass "bài bị gỡ biến mất khỏi bảng tin"
fi

# Trả lại để những phép thử không gian phía dưới vẫn có bài mà tìm.
call_auth PATCH "/api/v1/admin/posts/${CREATED_ID}/moderation" "$MOD_ACCESS_TOKEN" '{"moderation":{"decision":"PUBLISHED","reason":"Smoke test trả lại"}}'
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"status":"PUBLISHED"'; then
  pass "hậu kiểm trả lại được bài gỡ nhầm"
else
  fail "không trả lại được bài" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Thiếu lý do thì phải bị từ chối — vết audit không được để trống.
call_auth PATCH "/api/v1/admin/posts/${CREATED_ID}/moderation" "$MOD_ACCESS_TOKEN" '{"moderation":{"decision":"REJECTED","reason":"   "}}'
if [ "$RESP_CODE" = "400" ] || [ "$RESP_CODE" = "422" ]; then
  pass "duyệt bài KHÔNG kèm lý do bị từ chối"
else
  fail "duyệt bài thiếu lý do vẫn lọt" "HTTP $RESP_CODE — $RESP_BODY"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Truy vấn không gian PostGIS"

call GET "/api/v1/gift-posts/nearby?lat=${TEST_LAT}&lng=${TEST_LNG}&radiusMeters=2000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  pass "bài đã duyệt xuất hiện trong bán kính (ST_DWithin)"
else
  fail "ST_DWithin không tìm thấy bài trong bán kính" "$RESP_BODY"
fi

if printf '%s' "$RESP_BODY" | grep -q '"distanceMeters":'; then
  pass "có trường khoảng cách (ST_Distance)"
else
  fail "thiếu distanceMeters" "$RESP_BODY"
fi

if printf '%s' "$RESP_BODY" | grep -q '"isLocationApproximate":true'; then
  pass "toạ độ công khai được đánh dấu là gần đúng"
else
  fail "bảng tin công khai không đánh dấu toạ độ gần đúng" "$RESP_BODY"
fi

# Bài ở Hà Nội, truy vấn từ TP.HCM bán kính 1km — nếu lọt ra thì ST_DWithin sai.
call GET "/api/v1/gift-posts/nearby?lat=${FAR_LAT}&lng=${FAR_LNG}&radiusMeters=1000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  fail "bài cách 1.100km vẫn lọt vào bán kính 1km" "bộ lọc không gian hỏng"
else
  pass "bài ngoài bán kính bị loại đúng"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Chi tiết và xoá"

call GET "/api/v1/gift-posts/${CREATED_ID}"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"isLocationApproximate":true'; then
  pass "chi tiết bài trả toạ độ đã làm nhiễu"
else
  fail "chi tiết bài sai" "HTTP $RESP_CODE — $RESP_BODY"
fi

call_auth DELETE "/api/v1/gift-posts/${CREATED_ID}" "$PROFILE_ACCESS_TOKEN"
if [ "$RESP_CODE" = "200" ]; then
  pass "xoá mềm bài đăng"
else
  fail "không xoá được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call GET "/api/v1/gift-posts/${CREATED_ID}"
if [ "$RESP_CODE" = "404" ] && printf '%s' "$RESP_BODY" | grep -q '"errorOrigin":"chantam/core"'; then
  pass "bài đã xoá trả 404 kèm errorOrigin nghiệp vụ"
else
  fail "404 sau khi xoá không đúng" "HTTP $RESP_CODE — $RESP_BODY"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Kết quả: $PASSED đạt, $FAILED lỗi"
[ $FAILED -eq 0 ] || exit 1
exit 0
