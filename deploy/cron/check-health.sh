#!/usr/bin/env bash
#
# Gọi `/health` và báo khi service không trả lời.
#
# ## Vì sao cần, khi cron đỏ đã có đường báo
#
# `run-cli.sh` báo khi một JOB đỏ. Nhưng service chết lúc 2 giờ sáng thì không job
# nào đỏ — chúng chỉ đơn giản không chạy được, và `docker compose exec` thất bại
# cũng chỉ báo đúng job đó vào giờ nó tới. Giữa hai lượt job là một khoảng service
# nằm im mà không ai biết.
#
# Đây là healthcheck NGOÀI tiến trình: nó không phụ thuộc vào việc service còn sống
# để báo rằng service đã chết.
#
# ## Vì sao KHÔNG báo ngay lượt thất bại đầu
#
# Một lượt `curl` trượt vì mạng chớp, vì container đang khởi động lại sau deploy, vì
# runner GC — báo ngay là dạy người ta bỏ qua cảnh báo. Đòi `FAILURES_BEFORE_ALERT`
# lượt liên tiếp thất bại, đếm bằng một file trạng thái.
#
# ## Vì sao báo cả lúc HỒI PHỤC
#
# Thiếu nó thì người nhận cảnh báo không biết chuyện đã xong, và họ sẽ vào xem một
# sự cố đã tự khỏi — hoặc tệ hơn, tưởng nó vẫn đang xảy ra.
#
# Dùng (mỗi 5 phút trong crontab):
#   check-health.sh https://api.example.com/health
set -Eeuo pipefail

HEALTH_URL="${1:-${CHANTAM_HEALTH_URL:-}}"
LOG_DIR="${CHANTAM_CRON_LOG_DIR:-/var/log/chantam}"
STATE_FILE="${LOG_DIR}/health-that-bai.count"
FAILURES_BEFORE_ALERT="${CHANTAM_HEALTH_FAILURES:-3}"
TIMEOUT_SECONDS="${CHANTAM_HEALTH_TIMEOUT:-10}"
SENDER="$(dirname "${BASH_SOURCE[0]}")/send-alert.sh"

if [[ -z "${HEALTH_URL}" ]]; then
  echo "Dùng: $0 <health-url>   (hoặc đặt CHANTAM_HEALTH_URL)" >&2
  exit 64
fi

mkdir -p "${LOG_DIR}"
previous=0
[[ -f "${STATE_FILE}" ]] && previous="$(cat "${STATE_FILE}" 2>/dev/null || echo 0)"
[[ "${previous}" =~ ^[0-9]+$ ]] || previous=0

set +e
body="$(curl --silent --show-error --max-time "${TIMEOUT_SECONDS}" \
  --write-out '\n%{http_code}' "${HEALTH_URL}" 2>&1)"
curl_code=$?
set -e
status="$(printf '%s' "${body}" | tail -n 1)"

if [[ ${curl_code} -eq 0 ]] && [[ "${status}" == '200' ]]; then
  # Chỉ báo hồi phục khi TRƯỚC ĐÓ đã báo sự cố. Không có vế này thì mỗi lượt chạy
  # bình thường cũng gửi một dòng, và cảnh báo thành tiếng ồn.
  if [[ ${previous} -ge ${FAILURES_BEFORE_ALERT} ]]; then
    "${SENDER}" 'service đã trả lời lại' \
      "GET ${HEALTH_URL} trả 200 sau ${previous} lượt thất bại liên tiếp." || true
  fi
  echo 0 >"${STATE_FILE}"
  exit 0
fi

failures=$((previous + 1))
echo "${failures}" >"${STATE_FILE}"

reason="curl thoát ${curl_code}, HTTP ${status}"
echo "[chantam-health] ${HEALTH_URL}: ${reason} (lượt thất bại thứ ${failures})" >&2

# Báo ĐÚNG ở lượt chạm ngưỡng, không báo lại mỗi 5 phút sau đó: một sự cố kéo dài
# hai giờ sẽ gửi 24 dòng giống nhau, và người ta sẽ tắt kênh.
if [[ ${failures} -eq ${FAILURES_BEFORE_ALERT} ]]; then
  "${SENDER}" 'service KHÔNG trả lời' \
    "$(printf '%s\n%s\n%s' \
        "GET ${HEALTH_URL} thất bại ${failures} lượt liên tiếp." \
        "${reason}" \
        "$(printf '%s' "${body}" | head -n 20)")" || true
fi

exit 1
