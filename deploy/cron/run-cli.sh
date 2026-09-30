#!/usr/bin/env bash
#
# Gọi một CLI của Core từ cron trên host.
#
# Vì sao qua `docker compose exec` chứ không `run --rm`: `exec` dùng lại container
# đang chạy nên không phải dựng lại tiến trình Node và nạp lại toàn bộ cây DI cho
# mỗi lượt. `run --rm` cũng đúng nhưng đắt hơn, và nó KHÔNG thất bại khi Core
# đang chết — mà Core chết là đúng lúc ta cần biết.
#
# Vì sao không dùng `@nestjs/schedule` trong tiến trình: hai bản sao service cùng
# chạy scheduler nội bộ sẽ chạy mọi job hai lần, và không có gì ngăn được điều đó
# từ bên trong. Lịch nằm ngoài là chỗ duy nhất biết "chỉ một máy chạy cái này".
#
# Dùng:
#   run-cli.sh <đường-dẫn-project> <tên-cli> [tham số...]
# Ví dụ:
#   run-cli.sh /home/deploy/chantam-production gift-settle-rewards
set -Eeuo pipefail

if [[ $# -lt 2 ]]; then
  echo "Dùng: $0 <project-dir> <cli-name> [args...]" >&2
  exit 64
fi

PROJECT_DIR="$1"
CLI_NAME="$2"
shift 2

LOG_DIR="${CHANTAM_CRON_LOG_DIR:-/var/log/chantam}"
LOG_FILE="${LOG_DIR}/${CLI_NAME}.log"
mkdir -p "${LOG_DIR}"

cd "${PROJECT_DIR}"

started_at="$(date --iso-8601=seconds)"

# `-T` tắt cấp TTY: cron không có terminal, và thiếu cờ này thì docker báo lỗi
# "the input device is not a TTY" chứ không chạy gì.
#
# Gộp stderr vào stdout để log giữ đúng thứ tự dòng — tách hai luồng vào cùng file
# cho ra thứ tự lộn xộn và không ai dựng lại được chuyện gì xảy ra trước.
set +e
output="$(
  docker compose exec -T core \
    node "dist/infrastructure/cli/${CLI_NAME}.cli.js" "$@" 2>&1
)"
exit_code=$?
set -e

{
  echo "=== ${started_at} → $(date --iso-8601=seconds) | ${CLI_NAME} | exit=${exit_code}"
  echo "${output}"
} >>"${LOG_FILE}"

# Giữ nguyên exit code cho cron.
#
# Vài CLI cố ý thoát khác 0 khi PHÁT HIỆN việc cần biết — `--dry-run` thấy lệch,
# hoặc `transaction:autocomplete` giữ lại lượt đang tranh chấp. Đó không phải sự
# cố, nhưng cũng không phải một lần chạy bình thường: cron gửi mail/alert đúng
# những lượt đó, và đó chính là điều ta muốn.
if [[ ${exit_code} -ne 0 ]]; then
  echo "[chantam-cron] ${CLI_NAME} thoát ${exit_code}; xem ${LOG_FILE}" >&2
  echo "${output}" >&2

  # Đẩy tới kênh người thật đọc. Ghi stderr một mình là chưa đủ: crontab không có
  # MAILTO, và kể cả có thì một VPS chỉ chạy docker-compose thường chưa cài MTA —
  # cron ghi "no MTA, discarding output" rồi bỏ. Một job đỏ mà không ai biết thì
  # y như job không chạy, và `post:expire` đã chết ba tháng theo đúng cách đó.
  #
  # `|| true` vì gửi cảnh báo thất bại KHÔNG được che mất exit code thật của CLI:
  # cron cần thấy đúng mã lỗi của job, và `send-alert.sh` đã tự ghi lại lượt không
  # gửi được vào file riêng.
  "$(dirname "${BASH_SOURCE[0]}")/send-alert.sh"     "${CLI_NAME} thoát ${exit_code}"     "$(tail -n 30 <<<"${output}")" || true
fi

exit "${exit_code}"
