#!/usr/bin/env bash
set -euo pipefail

# Hợp đồng CHẠY của scripts/smoke-cli.sh — không phải nghiệp vụ của các CLI.
#
# Vì sao script này tồn tại: deploy nạp smoke-cli.sh qua stdin
# (`bash -s < scripts/smoke-cli.sh`), và khi bash đọc từ stdin thì `$0` là
# "bash", không phải đường dẫn file. Mọi đường dẫn suy ra từ `$0` đều trỏ sai —
# `dirname "$0"` cho `.`, tính từ thư mục home của tài khoản SSH.
#
# CI gọi smoke-cli.sh bằng `bash scripts/smoke-cli.sh`, nơi `$0` đúng, nên lỗi
# đó KHÔNG BAO GIỜ lộ ra ở CI. Ngày 30/09 nó chỉ đổ ở bước release:
#   bash: line 43: cd: ./../suites/***/core: No such file or directory
#
# Nên phép kiểm này cố ý bắt chước đúng đường của deploy: nạp qua stdin, từ một
# thư mục KHÔNG phải gốc repo, và chỉ đưa đường đi bằng CHANTAM_CLI_WORKDIR.

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Runner giả: phép kiểm này nói về việc script có tới được nơi cần tới, không
# phải về việc các CLI có chạy đúng. Dựng `dist` thật ở đây là đo nhầm thứ.
cat > "$TEMP_DIR/runner" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$TEMP_DIR/runner"

# Đứng ở một thư mục bất kỳ khác gốc repo — đúng như phiên SSH vừa đăng nhập.
cd "$TEMP_DIR"

if ! output=$(
  CHANTAM_CLI_SELF_CHECK=1 \
  CHANTAM_CLI_RUNNER="$TEMP_DIR/runner" \
  CHANTAM_CLI_WORKDIR="$TEMP_DIR" \
  bash -s < "$SCRIPT_DIR/smoke-cli.sh" 2>&1
); then
  echo 'smoke-cli.sh chet khi nap qua stdin voi CHANTAM_CLI_WORKDIR' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

# Chết ở dòng `cd` cho ra đúng chuỗi này; bắt riêng để thông báo nói thẳng ra
# nguyên nhân thay vì bắt người đọc đi dò.
if printf '%s' "$output" | grep -q 'No such file or directory'; then
  echo 'smoke-cli.sh van con cd theo $0 — duong dan suy tu $0 vo nghia qua stdin' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

# Không có cây mã nguồn ở đây, nên phép kiểm phủ CLI phải tự bỏ qua chứ không
# được tính là lỗi.
if ! printf '%s' "$output" | grep -q 'không có cây mã nguồn'; then
  echo 'Mong doi smoke-cli.sh bo qua phep kiem phu khi khong co src/' >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

echo 'smoke-cli qua stdin + CHANTAM_CLI_WORKDIR — OK'
