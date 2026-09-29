#!/usr/bin/env bash
# Chạy THẬT mọi CLI một lượt, trên Postgres thật.
#
# ## Vì sao cần, khi đã có unit test cho vài CLI
#
# Bốn spec CLI hiện có đều TIÊM một `createApplicationContext` giả vào. Mà đúng hai
# cái bẫy từng làm cả bảy CLI chết lại nằm chính ở chỗ bị tiêm:
#
#   1. `NestFactory.createApplicationContext` truyền trần thì mất `this` →
#      "Cannot read properties of undefined". Tham số mặc định
#      `.bind(NestFactory)` là thứ chữa nó, và một spec truyền hàm giả vào thì
#      KHÔNG BAO GIỜ chạy tới tham số mặc định đó.
#   2. Mỗi `*-cli.module.ts` phải nạp đủ module: `@Global()` chỉ có hiệu lực SAU
#      KHI được import ở đâu đó, nên thiếu một module là "Nest can't resolve
#      dependencies" — và chỉ lộ ra khi cây DI được dựng thật.
#
# Cả hai chỉ hiện khi tiến trình khởi động thật với module thật. Đó là việc của
# script này, và nó là lý do `21-open-issues` mục 10 từng ghi "chưa có test nào
# chạy CLI thật trong CI".
#
# ## Vì sao chạy TẤT CẢ, không chọn vài cái
#
# Bẫy 2 là lỗi theo từng module: `notification-cli.module.ts` đủ không nói gì về
# `post-cli.module.ts`. Chọn mẫu là bỏ sót đúng cái mới thêm — mà cái mới thêm là
# cái dễ thiếu nhất.
#
# ## Dùng --dry-run ở đâu có
#
# CLI nào có cờ thì chạy khô: mục tiêu là kiểm CÂY DI dựng được, không phải kiểm
# nghiệp vụ — nghiệp vụ đã có `test/*.check.ts` lo.
#
# ## exit 1 chỉ được tha cho CLI KHAI nó là tín hiệu
#
# Bản đầu của script này tha exit 1 cho MỌI CLI, và nó lập tức che một lỗi thật:
# `post:expire` chết ngay khi khởi động vì `PostModule` thiếu `GiftRequestModule`,
# nhưng `main()` bắt lỗi rồi đặt `exitCode = 1`, nên nó hiện ra y như một lượt
# "có việc cần biết". Một lưới chặn mà tha thứ quá rộng thì không phải lưới.
#
# Nên danh sách `SIGNAL_CLIS` dưới đây là những CLI mà exit 1 CÓ nghĩa nghiệp vụ.
# Mọi CLI khác phải thoát 0.
set -uo pipefail

cd "$(dirname "$0")/../suites/chantam.vn/chantam/core" || exit 1

# `media-sweep-orphans` cố ý KHÔNG có trong danh sách chạy ghi: nó xoá object
# không hoàn tác được. Chạy khô thì an toàn, nên nó nằm ở nhóm dry-run.
# CLI mà exit 1 là TÍN HIỆU, không phải lỗi:
# - nhóm `--dry-run` thoát 1 khi phát hiện lệch;
# - `transaction-autocomplete` thoát 1 khi giữ lại lượt đang tranh chấp;
# - `notification-purge` thoát 1 khi chạm trần lô, tức còn tồn đọng.
SIGNAL_CLIS=(
  accuracy-reconcile
  feed-reconcile-counts
  gift-settle-rewards
  notify-reminders
  selection-auto-select
  media-sweep-orphans
  transaction-autocomplete
  notification-purge
)

DRY_RUN_CLIS=(
  accuracy-reconcile
  feed-reconcile-counts
  gift-settle-rewards
  notify-reminders
  selection-auto-select
  media-sweep-orphans
)

PLAIN_CLIS=(
  chat-purge
  notification-purge
  point-reconcile
  post-expire
  rank-evaluate
  transaction-autocomplete
)

pass=0
fail=0
failed_names=()

run_one() {
  local name="$1"
  shift
  local output
  output="$(node "dist/infrastructure/cli/${name}.cli.js" "$@" 2>&1)"
  local code=$?

  local allowed=0
  if [[ ${code} -eq 0 ]]; then
    allowed=1
  elif [[ ${code} -eq 1 ]] && printf '%s\n' "${SIGNAL_CLIS[@]}" | grep -qx "${name}"; then
    # CLI này KHAI exit 1 là tín hiệu nghiệp vụ. Với CLI không khai, exit 1 gần như
    # luôn là `main()` bắt được một lỗi rồi đặt `exitCode = 1` — tức hỏng thật.
    allowed=1
  fi

  if [[ ${allowed} -eq 1 ]]; then
    printf '  \033[32m✓\033[0m %-26s exit=%s\n' "${name}" "${code}"
    pass=$((pass + 1))
    return
  fi

  printf '  \033[31m✗\033[0m %-26s exit=%s\n' "${name}" "${code}"
  printf '%s\n' "${output}" | tail -20 | sed 's/^/      /'
  fail=$((fail + 1))
  failed_names+=("${name}")
}

echo "Chạy thật từng CLI (dry-run ở đâu có):"
echo
for name in "${DRY_RUN_CLIS[@]}"; do run_one "${name}" --dry-run; done
for name in "${PLAIN_CLIS[@]}"; do run_one "${name}"; done

# Mọi CLI có file đều phải nằm trong một trong hai danh sách trên. Thiếu bước này
# thì thêm một CLI mới mà quên thêm vào đây sẽ không bao giờ được chạy, và script
# vẫn xanh — đúng kiểu lỗi im lặng mà nó được viết ra để chặn.
echo
echo "Không CLI nào bị bỏ ngoài danh sách:"
missing=0
for file in src/infrastructure/cli/*.cli.ts; do
  name="$(basename "${file}" .cli.ts)"
  if ! printf '%s\n' "${DRY_RUN_CLIS[@]}" "${PLAIN_CLIS[@]}" | grep -qx "${name}"; then
    printf '  \033[31m✗\033[0m %s chưa có trong scripts/smoke-cli.sh\n' "${name}"
    missing=$((missing + 1))
  fi
done
if [[ ${missing} -eq 0 ]]; then
  printf '  \033[32m✓\033[0m cả %s CLI đều được chạy\n' "$((pass + fail))"
else
  fail=$((fail + missing))
fi

echo
echo "Kết quả: ${pass} chạy được, ${fail} lỗi"
if [[ ${fail} -gt 0 ]]; then
  for name in "${failed_names[@]:-}"; do [[ -n "${name}" ]] && echo "  - ${name}"; done
  exit 1
fi
