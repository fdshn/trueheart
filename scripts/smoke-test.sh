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
call() {
  local method="$1" path="$2" data="${3:-}"
  local raw

  if [ -n "$data" ]; then
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' -d "$data" 2>&1)
  else
    raw=$(curl -sS -m 20 -w $'\n%{http_code}' -X "$method" "${BASE_URL}${path}" 2>&1)
  fi

  RESP_CODE="${raw##*$'\n'}"
  RESP_BODY="${raw%$'\n'*}"
}

# Như `call` nhưng kèm access token.
call_auth() {
  local method="$1" path="$2" token="$3" data="${4:-}"
  local raw

  raw=$(curl -sS -m 20 -w $'
%{http_code}' -X "$method" "${BASE_URL}${path}" -H 'Content-Type: application/json' -H "Authorization: Bearer $token" -d "$data" 2>&1)

  RESP_CODE="${raw##*$'
'}"
  RESP_BODY="${raw%$'
'*}"
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

call GET /docs/json
MISSING=""
for route in '/api/gift-posts' '/api/gift-posts/nearby' '/api/gift-posts/{giftPostId}' '/api/auth/register' '/api/auth/login' '/api/auth/refresh' '/api/auth/logout'; do
  printf '%s' "$RESP_BODY" | grep -q "\"$route\"" || MISSING="$MISSING $route"
done
if [ "$RESP_CODE" = "200" ] && [ -z "$MISSING" ]; then
  pass "/docs/json có đủ route"
else
  fail "/docs/json thiếu route" "HTTP $RESP_CODE — thiếu:$MISSING"
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

call POST /api/auth/register "{\"registration\":{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"$SMOKE_PASS\",\"deviceId\":\"smoke-device\"}}"
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

call POST /api/auth/register "{\"registration\":{\"username\":\"${SMOKE_USER}x\",\"password\":\"$SMOKE_PASS\",\"confirmPassword\":\"KhacHoanToan@9\",\"deviceId\":\"d\"}}"
if [ "$RESP_CODE" = "400" ]; then
  pass "mật khẩu xác nhận không khớp bị chặn"
else
  fail "confirmPassword không được kiểm" "HTTP $RESP_CODE"
fi

call GET /api/auth/me
if [ "$RESP_CODE" = "401" ]; then
  pass "endpoint cần quyền từ chối khi thiếu token"
else
  fail "endpoint cần quyền vẫn cho qua khi không có token" "HTTP $RESP_CODE"
fi

# Sai mật khẩu và tài khoản không tồn tại phải trả về HỆT NHAU — nếu khác, kẻ
# tấn công dò được username nào đang tồn tại.
call POST /api/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"SaiHoanToan@9\",\"deviceId\":\"d\"}}"
WRONG_PASSWORD_BODY="$RESP_BODY"
call POST /api/auth/login "{\"credentials\":{\"identifier\":\"khong-ton-tai-$$\",\"password\":\"SaiHoanToan@9\",\"deviceId\":\"d\"}}"

if [ "$WRONG_PASSWORD_BODY" = "$RESP_BODY" ]; then
  pass "sai mật khẩu và tài khoản lạ trả lời giống hệt nhau"
else
  fail "phản hồi khác nhau — dò được tài khoản tồn tại" "$WRONG_PASSWORD_BODY vs $RESP_BODY"
fi

call POST /api/auth/login "{\"credentials\":{\"identifier\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\",\"deviceId\":\"smoke-device-2\"}}"
if [ "$RESP_CODE" = "200" ]; then
  pass "đăng nhập bằng mật khẩu đúng"
else
  fail "không đăng nhập được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call POST /api/auth/refresh "{\"session\":{\"refreshToken\":\"$REFRESH_TOKEN\"}}"
ROTATED_TOKEN=$(json_str "$RESP_BODY" refreshToken)
ROTATED_ACCESS=$(json_str "$RESP_BODY" accessToken)

if [ -n "$ROTATED_TOKEN" ] && [ "$ROTATED_TOKEN" != "$REFRESH_TOKEN" ]; then
  pass "làm mới phiên trả về refresh token mới"
else
  fail "refresh không xoay vòng token" "HTTP $RESP_CODE — $RESP_BODY"
fi

# Token cũ phải chết ngay. Không chết nghĩa là token bị đánh cắp dùng được mãi.
call POST /api/auth/refresh "{\"session\":{\"refreshToken\":\"$REFRESH_TOKEN\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "refresh token cũ mất hiệu lực sau khi xoay vòng"
else
  fail "refresh token cũ VẪN DÙNG ĐƯỢC" "HTTP $RESP_CODE"
fi

call_auth POST /api/auth/logout "$ROTATED_ACCESS" "{\"session\":{\"refreshToken\":\"$ROTATED_TOKEN\"}}"
if [ "$RESP_CODE" = "200" ]; then
  pass "đăng xuất"
else
  fail "không đăng xuất được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call POST /api/auth/refresh "{\"session\":{\"refreshToken\":\"$ROTATED_TOKEN\"}}"
if [ "$RESP_CODE" = "401" ]; then
  pass "phiên đã đăng xuất không làm mới được nữa"
else
  fail "vẫn refresh được sau khi đăng xuất" "HTTP $RESP_CODE"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Kiểm tra dữ liệu đầu vào"

call POST /api/gift-posts '{"giftPost":{}}'
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
  "areaLabel":"Smoke test","giverId":"${GIVER_ID}"}}
JSON
)

call POST /api/gift-posts "$PAYLOAD"
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

if printf '%s' "$RESP_BODY" | grep -q '"status":"PENDING_REVIEW"'; then
  pass "bài mới ở trạng thái chờ kiểm duyệt"
else
  fail "bài mới không vào PENDING_REVIEW" "$RESP_BODY"
fi

if [ -z "$CREATED_ID" ]; then
  echo
  echo "Không có globalId — dừng, các phép thử sau không có ý nghĩa."
  echo "Kết quả: $PASSED đạt, $FAILED lỗi"
  exit 1
fi

# Cổng kiểm duyệt: bài chưa duyệt tuyệt đối không được lộ ra bảng tin công khai.
call GET "/api/gift-posts/nearby?lat=${TEST_LAT}&lng=${TEST_LNG}&radiusMeters=2000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  fail "bài CHƯA duyệt đã lộ ra bảng tin công khai" "$CREATED_ID"
else
  pass "bài chưa duyệt không xuất hiện ở bảng tin"
fi

call PATCH "/api/gift-posts/${CREATED_ID}" '{"giftPost":{"status":"PUBLISHED"}}'
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"status":"PUBLISHED"'; then
  pass "duyệt bài sang PUBLISHED"
else
  fail "không duyệt được bài" "HTTP $RESP_CODE — $RESP_BODY"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Truy vấn không gian PostGIS"

call GET "/api/gift-posts/nearby?lat=${TEST_LAT}&lng=${TEST_LNG}&radiusMeters=2000"
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
call GET "/api/gift-posts/nearby?lat=${FAR_LAT}&lng=${FAR_LNG}&radiusMeters=1000"
if printf '%s' "$RESP_BODY" | grep -q "$CREATED_ID"; then
  fail "bài cách 1.100km vẫn lọt vào bán kính 1km" "bộ lọc không gian hỏng"
else
  pass "bài ngoài bán kính bị loại đúng"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "Chi tiết và xoá"

call GET "/api/gift-posts/${CREATED_ID}"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q '"isLocationApproximate":true'; then
  pass "chi tiết bài trả toạ độ đã làm nhiễu"
else
  fail "chi tiết bài sai" "HTTP $RESP_CODE — $RESP_BODY"
fi

call DELETE "/api/gift-posts/${CREATED_ID}"
if [ "$RESP_CODE" = "200" ]; then
  pass "xoá mềm bài đăng"
else
  fail "không xoá được" "HTTP $RESP_CODE — $RESP_BODY"
fi

call GET "/api/gift-posts/${CREATED_ID}"
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
