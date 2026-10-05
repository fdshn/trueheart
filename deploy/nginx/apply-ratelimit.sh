#!/usr/bin/env bash
#
# Áp chặn tốc độ + WebSocket vào một vhost Nginx ĐANG CHẠY, bình thái.
#
# ## Vì sao script này tồn tại
#
# `chantam.conf.example` là template. Vhost thật trên host đã khác nó khá nhiều:
# Certbot dựng lại khối `listen`, người triển khai điền hostname và đường
# certificate thật, và thêm basic auth cho `/docs`. Nên **`cp` template đè lên
# vhost thật là mất hết những thứ đó** và site sập tới khi có người sửa lại tay.
#
# Lượt áp đầu tiên (staging, 05/10) làm bằng tay qua SSH. Script này để lượt sau —
# production, hay khi template đổi — không phải làm tay nữa.
#
# ## Bình thái nghĩa là gì ở đây
#
# Chạy hai lần cho cùng một kết quả. Mỗi thay đổi được kiểm "đã có chưa" trước khi
# chèn, nên chạy lại KHÔNG nhân đôi khối `location` hay dòng `limit_req`. Lý do cần
# tính chất này: một lượt chạy nửa vời (mất mạng giữa SSH) phải chạy lại được mà
# không phải dọn tay trước.
#
# ## Cổng upstream đọc TỪ vhost, không truyền vào
#
# Staging dùng 8080, production 8085. Truyền tay là một chỗ để điền sai, và điền
# sai cổng thì Nginx vẫn `nginx -t` XANH rồi proxy vào hư không — hỏng im lặng,
# kiểu tệ nhất. Đọc từ chính `proxy_pass` đang có thì không sai được.
#
# ## nginx -t trước khi reload, và tự hoàn nguyên khi đỏ
#
# Trên một host đang phục vụ, `systemctl reload` thất bại nghĩa là cấu hình CŨ vẫn
# chạy — nên người ta tưởng đã áp dụng xong trong khi chưa. Script đòi `nginx -t`
# xanh trước, và nếu đỏ thì phục hồi từ bản sao lưu rồi thoát khác 0.
#
# Dùng:
#   sudo bash apply-ratelimit.sh /etc/nginx/sites-available/api-staging.chantam.vn
#
# Yêu cầu: file zone đã cài ở /etc/nginx/conf.d/chantam-ratelimit.conf
set -Eeuo pipefail

VHOST="${1:-}"
ZONE_FILE="${CHANTAM_NGINX_ZONE_FILE:-/etc/nginx/conf.d/chantam-ratelimit.conf}"

pass=0
changed=0
ok() {
  printf '  \033[32m✓\033[0m %s\n' "$1"
  pass=$((pass + 1))
}
skip() { printf '  \033[90m•\033[0m %s\n' "$1"; }
die() {
  printf '  \033[31m✗\033[0m %s\n' "$1" >&2
  [ -n "${2:-}" ] && printf '      %s\n' "$2" >&2
  exit 1
}

[ -n "${VHOST}" ] || die 'Thiếu tham số' "Dùng: $0 <đường-dẫn-vhost>"
[ -f "${VHOST}" ] || die "Không thấy vhost: ${VHOST}"

# Zone phải có TRƯỚC. Thiếu nó thì `limit_req` tham chiếu một zone chưa khai và
# Nginx từ chối khởi động — tức script này sẽ tự hoàn nguyên ở bước cuối, nhưng
# báo ở đây thì người chạy biết ngay phải làm gì.
[ -f "${ZONE_FILE}" ] ||
  die "Chưa cài file zone: ${ZONE_FILE}" \
    'Chép deploy/nginx/chantam-ratelimit.conf.example vào /etc/nginx/conf.d/ trước.'

PORT="$(grep -oE 'proxy_pass http://127\.0\.0\.1:[0-9]+' "${VHOST}" |
  grep -oE '[0-9]+$' | sort -u | head -n 1)"
[ -n "${PORT}" ] || die 'Không đọc được cổng upstream từ vhost'
ok "đọc được cổng upstream từ vhost: ${PORT}"

# Sao lưu vào một thư mục RIÊNG, không đặt cạnh vhost.
#
# Lý do đo được khi chạy thử: nếu người dùng truyền đường `sites-enabled/...`, một
# file sao lưu đặt cạnh nó rơi vào đúng thư mục `include sites-enabled/*` của
# Nginx — tức bản sao lưu THÀNH một vhost thứ hai trùng `server_name`. Nginx chỉ
# cảnh báo "conflicting server name" chứ không đỏ, nên lỗi này đi qua `nginx -t`.
BACKUP_DIR="${CHANTAM_NGINX_BACKUP_DIR:-/var/backups/chantam-nginx}"
mkdir -p "${BACKUP_DIR}"
BACKUP="${BACKUP_DIR}/$(basename "${VHOST}")-$(date +%Y%m%dT%H%M%S)"

WORK="$(mktemp)"
cp "${VHOST}" "${WORK}"

headers() {
  cat <<EOF
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
EOF
}

# ── 1. Hai khối location mới, chèn TRƯỚC `location / {` ───────────────────────
if grep -qE 'location\s+\^~\s+/socket\.io/' "${WORK}"; then
  skip 'khối /socket.io/ đã có — bỏ qua'
else
  NEW="$(mktemp)"
  {
    echo '    # Đường xác thực đi zone chặt hơn: đây là nơi người ta dò mật khẩu.'
    echo '    # Ngưỡng vẫn CAO HƠN trần của app, để app là bên trả lỗi JSON có errorCode.'
    echo '    location ^~ /api/v1/auth/ {'
    echo '        limit_req zone=chantam_auth burst=10 nodelay;'
    echo '        limit_conn chantam_conn 100;'
    echo ''
    echo "        proxy_pass http://127.0.0.1:${PORT};"
    headers
    echo ''
    echo '        proxy_connect_timeout 10s;'
    echo '        proxy_read_timeout 60s;'
    echo '        proxy_send_timeout 60s;'
    echo '    }'
    echo ''
    echo '    # Socket.io cho chat. KHÔNG chặn tốc độ: long-polling sinh rất nhiều lượt'
    echo '    # hợp lệ, chặn ở đây là chẹn chính chat chứ không chẹn kẻ lụt.'
    echo '    location ^~ /socket.io/ {'
    echo "        proxy_pass http://127.0.0.1:${PORT};"
    headers
    echo '        proxy_set_header Upgrade $http_upgrade;'
    echo '        proxy_set_header Connection $connection_upgrade;'
    echo ''
    echo '        # 60s như REST sẽ cắt một kết nối đang CHỜ tin nhắn mỗi phút.'
    echo '        proxy_connect_timeout 10s;'
    echo '        proxy_read_timeout 3600s;'
    echo '        proxy_send_timeout 3600s;'
    echo '    }'
    echo ''
  } >"${NEW}"

  # Chèn trước dòng `location / {` ĐẦU TIÊN có thụt lề — không phải dòng trong
  # một chú thích, và không phải khối redirect HTTP→HTTPS (khối đó không proxy).
  LINE="$(grep -nE '^\s+location\s+/\s*\{' "${WORK}" | head -n 1 | cut -d: -f1)"
  [ -n "${LINE}" ] || die 'Không thấy khối `location / {` để chèn trước'
  { head -n "$((LINE - 1))" "${WORK}"; cat "${NEW}"; tail -n "+${LINE}" "${WORK}"; } >"${WORK}.next"
  mv "${WORK}.next" "${WORK}"
  rm -f "${NEW}"
  changed=$((changed + 1))
  ok 'chèn hai khối /api/v1/auth/ và /socket.io/'
fi

# ── 2. limit_req cho `location / {` ───────────────────────────────────────────
if grep -qE 'limit_req\s+zone=chantam_general' "${WORK}"; then
  skip 'limit_req trên location / đã có — bỏ qua'
else
  LINE="$(grep -nE '^\s+location\s+/\s*\{' "${WORK}" | tail -n 1 | cut -d: -f1)"
  [ -n "${LINE}" ] || die 'Không thấy khối `location / {`'
  {
    head -n "${LINE}" "${WORK}"
    echo '        limit_req zone=chantam_general burst=60 nodelay;'
    echo '        limit_conn chantam_conn 100;'
    tail -n "+$((LINE + 1))" "${WORK}"
  } >"${WORK}.next"
  mv "${WORK}.next" "${WORK}"
  changed=$((changed + 1))
  ok 'thêm limit_req vào location /'
fi

# ── 3. Sửa `Connection "upgrade"` cố định ─────────────────────────────────────
#
# Dòng đó gửi `Connection: upgrade` cho MỌI request, kể cả REST không xin nâng
# cấp, với `Upgrade` rỗng. `$connection_upgrade` trả `close` khi không có yêu cầu
# nâng cấp — đó chính là lý do mẫu `map` tồn tại.
if grep -qE 'proxy_set_header\s+Connection\s+"upgrade"' "${WORK}"; then
  sed -i 's|proxy_set_header Connection "upgrade";|proxy_set_header Connection $connection_upgrade;|g' "${WORK}"
  changed=$((changed + 1))
  ok 'đổi Connection "upgrade" cố định thành $connection_upgrade'
else
  skip 'không có Connection "upgrade" cố định — bỏ qua'
fi

if [ ${changed} -eq 0 ]; then
  echo
  echo 'Không có gì để đổi — vhost đã được áp trước đó. Không tạo sao lưu.'
  rm -f "${WORK}"
  exit 0
fi

# Sao lưu CHỈ khi thật sự sắp ghi. Bản đầu sao lưu ngay từ đầu, và hai lượt chạy
# trong cùng một giây cho cùng tên file — nên lượt no-op thứ hai xoá đúng bản sao
# lưu của lượt đã sửa. Tạo muộn thì không có chuyện đó.
cp "${VHOST}" "${BACKUP}"
ok "sao lưu: ${BACKUP}"

cp "${WORK}" "${VHOST}"
rm -f "${WORK}"

# ── 4. nginx -t, rồi reload — hoặc hoàn nguyên ────────────────────────────────
if nginx -t 2>/dev/null; then
  ok 'nginx -t xanh'
else
  cp "${BACKUP}" "${VHOST}"
  nginx -t >/dev/null 2>&1 || true
  die 'nginx -t ĐỎ — đã hoàn nguyên từ bản sao lưu' "$(nginx -t 2>&1 | tail -3 | tr '\n' ' ')"
fi

systemctl reload nginx
ok 'đã reload nginx'

# Gọi thẳng upstream: nếu vhost hỏng thì đường ngoài mới là chỗ thấy, nhưng gọi
# qua Internet cần hostname thật và certificate, nên kiểm ở đây là upstream sống.
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PORT}/health" || echo 000)"
if [ "${CODE}" = "200" ]; then
  ok "upstream 127.0.0.1:${PORT}/health trả 200"
else
  printf '  \033[33m!\033[0m upstream /health trả %s — kiểm container app, không phải Nginx\n' "${CODE}"
fi

echo
echo "Xong: ${changed} thay đổi, ${pass} bước đạt. Sao lưu giữ tại ${BACKUP}"
