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
# ## Vì sao có nhánh Telegram, và vì sao nhận kênh theo HÌNH DẠNG đường
#
# Telegram cần hình khác: `chat_id` đi cùng `text`. Bản trước cố ý KHÔNG thêm nhánh
# này, với lý do "một nhánh không ai dùng là một nhánh không ai thử". Lý do đó vẫn
# đúng, nên nhánh này thêm KÈM phép thử: `scripts/test-cron-alert.sh` chạy nó qua
# HTTP thật ở bốn ca — hình payload, thiếu `chat_id`, tin quá dài, và webhook cũ
# không đổi hành vi.
#
# Nhận kênh theo hình dạng đường (`…/bot<token>/sendMessage`) chứ KHÔNG theo tên
# miền `api.telegram.org`: bộ thử dựng server thật ở `127.0.0.1`, nên nhận theo tên
# miền làm chính nhánh này thành thứ không thử được. Một phép nhận dạng không thử
# được là một phép nhận dạng sẽ sai trong im lặng.
#
# `CHANTAM_CRON_ALERT_KIND=telegram|webhook` ép tay, cho trường hợp có proxy đứng
# trước làm đường mất hình dạng đó.
#
# ## Vì sao cắt ngắn tin
#
# Telegram trả 400 khi tin quá 4096 ký tự; Discord quá 2000. F67 đính stderr của
# `pg_restore` vào cảnh báo, nên tin dài là chuyện SẼ xảy ra — và mất cảnh báo đúng
# lúc sự cố lớn nhất là kiểu hỏng tệ nhất.
#
# Cắt trong CÙNG bộ đóng gói JSON, không cắt bằng bash: `${#var}` của bash đếm ký
# tự chỉ khi locale là UTF-8, còn trên host locale POSIX nó đếm BYTE rồi cắt giữa
# một chữ có dấu — đúng họ lỗi mà phần dưới đã mắc một lần với `tr`.
#
# Trần mặc định của `webhook` là 1900, dưới mức 2000 của Discord, vì script không
# biết URL webhook thuộc bên nào. Dàn chỉ dùng Slack nâng được bằng
# `CHANTAM_CRON_ALERT_MAX_CHARS`.
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
#
# Biến môi trường:
#   CHANTAM_CRON_ALERT_URL        bắt buộc — webhook Slack/Mattermost/Discord, hoặc
#                                 https://api.telegram.org/bot<TOKEN>/sendMessage
#   CHANTAM_CRON_ALERT_CHAT_ID    bắt buộc KHI đường là Telegram
#   CHANTAM_CRON_ALERT_KIND       telegram|webhook — ép tay, mặc định tự nhận
#   CHANTAM_CRON_ALERT_MAX_CHARS  trần ký tự, mặc định 4096 (telegram) / 1900 (webhook)
#   CHANTAM_CRON_ALERT_ENCODER     auto|jq|python — ép bộ đóng gói JSON, mặc định auto.
#                                 Chỉ dùng để BỘ THỬ chạy được cả hai nhánh.
set -Eeuo pipefail

ALERT_URL="${CHANTAM_CRON_ALERT_URL:-}"
ALERT_KIND="${CHANTAM_CRON_ALERT_KIND:-}"
ALERT_CHAT_ID="${CHANTAM_CRON_ALERT_CHAT_ID:-}"
ALERT_ENCODER="${CHANTAM_CRON_ALERT_ENCODER:-auto}"
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

# Ép bộ đóng gói. Mặc định `auto` ưu tiên jq, nên trên một host không có jq thì
# nhánh jq KHÔNG BAO GIỜ chạy — và nó là nhánh script ưu tiên dùng. Đo 05/10: máy
# phát triển không có jq, nên bộ thử chỉ chạy nhánh python và nhánh jq hoàn toàn
# chưa được thử. Biến này tồn tại để bộ thử chạy được CẢ HAI trên mọi host, thay vì
# phụ thuộc vào việc host tình cờ cài gì.
if [[ "${ALERT_ENCODER}" != 'auto' && "${ALERT_ENCODER}" != 'jq' &&
  "${ALERT_ENCODER}" != 'python' ]]; then
  record_undelivered "CHANTAM_CRON_ALERT_ENCODER không hợp lệ: ${ALERT_ENCODER}"
  echo "[chantam-alert] ENCODER phải là auto, jq hoặc python; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 78
fi

# Ép một bộ không có mặt thì nói ĐÚNG lý do. Thiếu dòng này, nó rơi xuống thông
# điệp "thiếu jq và python" ở dưới — một chẩn đoán sai hướng, mà chẩn đoán sai còn
# tốn thời gian hơn không chẩn đoán.
if [[ "${ALERT_ENCODER}" == 'jq' ]] && ! command -v jq >/dev/null 2>&1; then
  record_undelivered 'ép ENCODER=jq nhưng host không có jq'
  echo "[chantam-alert] ép jq nhưng host không có jq; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 69
fi

# Nhận kênh theo hình dạng đường của Telegram Bot API. Xem docblock vì sao không
# nhận theo tên miền.
if [[ -z "${ALERT_KIND}" ]]; then
  if [[ "${ALERT_URL}" == */bot*/sendMessage* ]]; then
    ALERT_KIND='telegram'
  else
    ALERT_KIND='webhook'
  fi
fi

if [[ "${ALERT_KIND}" != 'telegram' && "${ALERT_KIND}" != 'webhook' ]]; then
  record_undelivered "CHANTAM_CRON_ALERT_KIND không hợp lệ: ${ALERT_KIND}"
  echo "[chantam-alert] KIND phải là telegram hoặc webhook; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 78
fi

# Telegram KHÔNG suy ra được người nhận từ URL — token nằm trong đường, nhưng
# `chat_id` thì không. Thiếu nó mà vẫn gửi là nhận một 400 rồi mất cảnh báo, nên
# chặn ở đây và ghi lại, đúng lối "không bao giờ im lặng" của file này.
if [[ "${ALERT_KIND}" == 'telegram' && -z "${ALERT_CHAT_ID}" ]]; then
  record_undelivered 'đường là Telegram nhưng CHANTAM_CRON_ALERT_CHAT_ID chưa đặt'
  echo "[chantam-alert] Telegram cần CHANTAM_CRON_ALERT_CHAT_ID; đã ghi vào ${UNDELIVERED_LOG}" >&2
  exit 78
fi

# Trần ký tự theo kênh. 1900 cho webhook là mức dưới giới hạn 2000 của Discord.
if [[ "${ALERT_KIND}" == 'telegram' ]]; then
  ALERT_MAX_CHARS="${CHANTAM_CRON_ALERT_MAX_CHARS:-4096}"
else
  ALERT_MAX_CHARS="${CHANTAM_CRON_ALERT_MAX_CHARS:-1900}"
fi
ALERT_TRUNCATED_MARK="
[… đã cắt vì quá trần ${ALERT_MAX_CHARS} ký tự của kênh; xem log đầy đủ trên host]"

# Kiểm trần là SỐ ngay ở đây. Một giá trị rác làm `jq --argjson` vỡ, và lúc đó
# `payload` rỗng — rồi script báo "thiếu jq và python", một thông điệp sai hướng
# hoàn toàn. Chẩn đoán sai còn tốn thời gian hơn không chẩn đoán.
if ! [[ "${ALERT_MAX_CHARS}" =~ ^[1-9][0-9]*$ ]]; then
  record_undelivered "CHANTAM_CRON_ALERT_MAX_CHARS không phải số dương: ${ALERT_MAX_CHARS}"
  echo "[chantam-alert] trần ký tự phải là số dương; đã ghi vào ${UNDELIVERED_LOG}" >&2
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
if [[ "${ALERT_ENCODER}" == 'jq' ]] ||
  { [[ "${ALERT_ENCODER}" == 'auto' ]] && command -v jq >/dev/null 2>&1; }; then
  payload="$(
    jq -Rs \
      --argjson max "${ALERT_MAX_CHARS}" \
      --arg mark "${ALERT_TRUNCATED_MARK}" \
      --arg kind "${ALERT_KIND}" \
      --arg chat "${ALERT_CHAT_ID}" \
      '(if (. | length) > $max
          then (.[0:($max - ($mark | length))] + $mark)
          else . end) as $t
       | if $kind == "telegram"
           then {chat_id: $chat, text: $t}
           else {text: $t, content: $t}
         end' <<<"${message}"
  )"
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
        ALERT_MAX="${ALERT_MAX_CHARS}" \
        ALERT_MARK="${ALERT_TRUNCATED_MARK}" \
        ALERT_KIND="${ALERT_KIND}" \
        ALERT_CHAT="${ALERT_CHAT_ID}" \
        "${candidate}" -c 'import json, os, sys
t = sys.stdin.buffer.read().decode("utf-8", "replace")
mx = int(os.environ["ALERT_MAX"])
mark = os.environ["ALERT_MARK"]
if len(t) > mx:
    t = t[: max(0, mx - len(mark))] + mark
if os.environ["ALERT_KIND"] == "telegram":
    p = {"chat_id": os.environ["ALERT_CHAT"], "text": t}
else:
    p = {"text": t, "content": t}
sys.stdout.buffer.write(json.dumps(p).encode("utf-8"))' <<<"${message}"
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
