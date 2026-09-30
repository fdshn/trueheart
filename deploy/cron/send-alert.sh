#!/usr/bin/env bash
#
# Đẩy một dòng cảnh báo tới kênh người thật đọc.
#
# ## Vì sao không dùng MAILTO của cron
#
# Cron luôn đi qua MTA cục bộ, mà một VPS chỉ chạy docker-compose thường chưa cài
# MTA — lúc đó cron ghi "no MTA, discarding output" rồi bỏ. Gửi tới Gmail còn cần
# SPF/DKIM, thiếu thì bị chặn im lặng: **có alert mà không biết mình không nhận
# được alert**, kiểu hỏng tệ nhất cho một hệ báo động. Và credential SMTP sẽ tồn
# tại ở hai nơi — app trong `system_configs`, hệ thống trong cấu hình MTA.
#
# Một lượt `curl` không cần MTA, không cần SPF/DKIM, không nhân bản credential.
#
# ## Vì sao payload mang CẢ `text` lẫn `content`
#
# Slack và Mattermost đọc `text`; Discord đọc `content`. Gửi cả hai khoá thì một
# URL webhook của bên nào cũng chạy, và bên kia bỏ qua khoá nó không biết. Nhờ vậy
# Bên A chọn kênh sau mà không phải sửa script — chỉ điền một biến môi trường.
#
# Telegram cần hình khác (`chat_id` + `text` trên query string), nên nếu chốt
# Telegram thì thêm một nhánh ở đây. Chưa thêm sẵn: một nhánh không ai dùng là một
# nhánh không ai thử.
#
# ## Vì sao KHÔNG im lặng khi chưa cấu hình
#
# `CHANTAM_CRON_ALERT_URL` rỗng là trạng thái mặc định hôm nay. Nếu script chỉ
# `return 0` thì nó thành một hệ báo động trông như đang chạy mà không gửi gì —
# đúng cái bệnh đã làm `post:expire` chết ba tháng. Nên lượt nào không gửi được
# đều ghi vào một file có TÊN nói rõ là chưa ai đọc, và hàm trả khác 0.
#
# Dùng:
#   send-alert.sh "<tiêu đề>" "<nội dung nhiều dòng>"
set -Eeuo pipefail

ALERT_URL="${CHANTAM_CRON_ALERT_URL:-}"
LOG_DIR="${CHANTAM_CRON_LOG_DIR:-/var/log/chantam}"
UNDELIVERED_LOG="${LOG_DIR}/alerts-chua-gui-duoc.log"
HOST="${CHANTAM_CRON_HOST:-$(hostname 2>/dev/null || echo 'không rõ máy')}"

title="${1:-Cảnh báo không có tiêu đề}"
body="${2:-}"
stamp="$(date --iso-8601=seconds)"

mkdir -p "${LOG_DIR}"

record_undelivered() {
  {
    echo "=== ${stamp} | ${HOST} | ${1}"
    echo "${title}"
    echo "${body}"
  } >>"${UNDELIVERED_LOG}"
}

if [[ -z "${ALERT_URL}" ]]; then
  record_undelivered 'CHANTAM_CRON_ALERT_URL chưa đặt'
  echo "[chantam-alert] chưa cấu hình kênh; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 78
fi

# Đóng gói JSON bằng MỘT bộ mã hoá thật, không escape tay.
#
# Bản đầu tôi viết một nhánh dự phòng escape bằng `${var//.../...}` của bash.
# `scripts/test-cron-alert.sh` bắt được hai lỗi liền: JSON cấm ký tự điều khiển
# thô nên một dấu tab trong log làm webhook trả 400, và `tr` trên môi trường không
# phải UTF-8 băm nát chữ có dấu — payload ra không decode được.
#
# Bài học: escape JSON bằng tay trong shell là thứ hỏng đúng lúc đang cần gửi một
# cảnh báo. Nên thà TỪ CHỐI gửi và ghi lại, hơn là gửi một payload hỏng rồi tưởng
# đã gửi.
message="$(printf '%s
%s
%s' "[Chân Tâm · ${HOST}] ${title}" "${stamp}" "${body}")"
payload=''
if command -v jq >/dev/null 2>&1; then
  payload="$(jq -Rs '{text: ., content: .}' <<<"${message}")"
else
  # Đọc/ghi qua `sys.stdin.buffer` và giải mã UTF-8 TƯỜNG MINH, không dựa vào
  # locale của host. `sys.stdin.read()` dùng code page mặc định của hệ — trên một
  # máy không phải UTF-8 nó giải mã byte UTF-8 thành cp1252 và mọi chữ có dấu ra
  # mojibake. `scripts/test-cron-alert.sh` bắt được: payload về mang
  # `0xe1 0xba 0xb7` thành ba ký tự rời thay vì một chữ `ặ`.
  #
  # Không ai nhận ra lỗi này cho tới lần đọc cảnh báo thật đầu tiên — mà lúc đó
  # người ta đang cần đọc nội dung, không cần đoán chữ.
  for candidate in python3 python; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      payload="$(
        "${candidate}" -c 'import json,sys; t=sys.stdin.buffer.read().decode("utf-8", "replace"); sys.stdout.buffer.write(json.dumps({"text": t, "content": t}).encode("utf-8"))'           <<<"${message}"
      )"
      break
    fi
  done
fi

if [[ -z "${payload}" ]]; then
  record_undelivered 'thiếu jq và python — không đóng gói được JSON'
  echo "[chantam-alert] cần jq hoặc python trên host; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 69
fi

set +e
response="$(
  curl --silent --show-error --fail-with-body \
    --max-time 10 --retry 2 --retry-delay 3 \
    -H 'Content-Type: application/json' \
    -X POST --data "${payload}" "${ALERT_URL}" 2>&1
)"
curl_code=$?
set -e

if [[ ${curl_code} -ne 0 ]]; then
  # Cảnh báo về việc gửi cảnh báo thất bại KHÔNG đi qua cùng kênh đó được.
  record_undelivered "curl thoát ${curl_code}: ${response}"
  echo "[chantam-alert] gửi thất bại (${curl_code}); đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 75
fi

exit 0
