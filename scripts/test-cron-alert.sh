#!/usr/bin/env bash
#
# Kiểm đường CẢNH BÁO của cron, chạy thật qua HTTP.
#
# Vì sao script này tồn tại: một hệ báo động chưa ai thử là một hệ báo động không
# biết mình có chạy hay không, và đó là kiểu hỏng tệ nhất — khi cần tới nó thì đã
# muộn. Ba thứ dưới đây không unit test nào thấy được: payload có phải JSON hợp lệ
# sau khi nhét log nhiều dòng vào, chưa cấu hình URL thì có im lặng không, và gửi
# thất bại thì có ghi lại không.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SENDER="${ROOT}/deploy/cron/send-alert.sh"
WORK="$(mktemp -d)"
PORT="${CHANTAM_ALERT_TEST_PORT:-8791}"
pass=0
fail=0

cleanup() {
  [[ -n "${SERVER_PID:-}" ]] && kill "${SERVER_PID}" 2>/dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

ok() { printf '  OK   %s\n' "$1"; pass=$((pass + 1)); }
ko() { printf '  LỖI  %s — %s\n' "$1" "${2:-}"; fail=$((fail + 1)); }
check() { if [[ "$1" == 'true' ]]; then ok "$2"; else ko "$2" "${3:-}"; fi; }

# Crontab gọi THẲNG các script này, không qua `bash`, nên mất bit thực thi là
# mọi job chết với exit 126. Kiểm trước mọi thứ khác: thiếu bit thì bốn mục dưới
# đều đỏ vì cùng một lý do, và không mục nào nói ra lý do đó.
echo '0. Script cron còn bit thực thi'
for script in run-cli.sh send-alert.sh check-health.sh; do
  check "$([[ -x "${ROOT}/deploy/cron/${script}" ]] && echo true || echo false)" \
    "${script} chạy trực tiếp được" 'thiếu bit x — git update-index --chmod=+x'
done
echo

echo '1. Chưa cấu hình URL thì KHÔNG im lặng'
set +e
CHANTAM_CRON_ALERT_URL='' CHANTAM_CRON_LOG_DIR="${WORK}/logs" \
  "${SENDER}" 'thử chưa cấu hình' 'nội dung' 2>/dev/null
rc=$?
set -e
check "$([[ ${rc} -ne 0 ]] && echo true || echo false)" \
  'trả mã khác 0 khi thiếu URL' "exit=${rc}"
check "$([[ -f "${WORK}/logs/alerts-chua-gui-duoc.log" ]] && echo true || echo false)" \
  'ghi vào file có tên nói rõ là chưa ai đọc'

echo
echo '2. Có URL thì gửi được, và payload là JSON hợp lệ'
cat >"${WORK}/server.py" <<'PYEOF'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[2]

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(OUT, 'wb') as f:
            f.write(raw)
        try:
            json.loads(raw.decode('utf-8'))
            self.send_response(200)
        except Exception:
            self.send_response(400)
        self.end_headers()
        self.wfile.write(b'{}')

    def log_message(self, *a):
        pass

HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
PYEOF
python "${WORK}/server.py" "${PORT}" "${WORK}/received.json" &
SERVER_PID=$!
for _ in $(seq 1 40); do
  curl -sf -X POST -d '{}' "http://127.0.0.1:${PORT}/" -o /dev/null 2>/dev/null && break
  sleep 0.25
done

# Nội dung CỐ Ý khó: nhiều dòng, dấu ngoặc kép, dấu gạch chéo ngược. Nối chuỗi
# bằng tay sẽ sinh JSON hỏng đúng ở đây.
# Nội dung CỐ Ý khó, và dựng bằng heredoc với ký tự THẬT thay vì escape của
# printf: một dấu gạch chéo ngược đi qua printf là một chỗ nữa để mất nó, mà
# chính nó là thứ phép kiểm này cần thử.
BODY="$(cat <<'BODYEOF'
dòng 1 có "ngoặc kép"
dòng 2 có \ gạch chéo
dòng 3: tab	cuối
BODYEOF
)"
set +e
CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}/hook" \
  CHANTAM_CRON_LOG_DIR="${WORK}/logs2" CHANTAM_CRON_HOST='may-thu-alert' \
  "${SENDER}" 'notification:purge thoát 1' "${BODY}"
rc=$?
set -e
check "$([[ ${rc} -eq 0 ]] && echo true || echo false)" 'gửi thành công' "exit=${rc}"
check "$([[ -s "${WORK}/received.json" ]] && echo true || echo false)" \
  'máy chủ nhận được payload'

if [[ -s "${WORK}/received.json" ]]; then
  python - "${WORK}/received.json" <<'PYEOF' && ok 'payload JSON hợp lệ, mang cả text lẫn content, giữ nguyên nội dung' || ko 'payload JSON'
import json, sys

# Dựng ký tự khó bằng `chr` thay vì viết thẳng: một dấu gạch chéo ngược trong
# nguồn script là chỗ dễ mất nhất khi file đi qua các lớp trích dẫn.
BACKSLASH = chr(92)
TAB = chr(9)
NEWLINE = chr(10)

d = json.load(open(sys.argv[1], encoding='utf-8'))
assert 'text' in d and 'content' in d, 'thieu khoa text hoac content'
assert d['text'] == d['content'], 'hai khoa phai cung noi dung'

# Ba ký tự dưới đây là lý do phép kiểm này tồn tại: JSON cấm ký tự điều khiển
# thô, nên tab và dòng mới phải được escape, còn gạch chéo ngược phải nhân đôi.
# Tên máy để ASCII: mục đích của phép kiểm là đóng gói và gửi được, không phải
# cách một tên máy có dấu được chuẩn hoá Unicode. Chữ có dấu kiểm ở NỘI DUNG.
for needle in ['notification:purge', 'may-thu-alert',
               'ngoặc kép', 'dòng 2', BACKSLASH, TAB]:
    assert needle in d['text'], 'mat noi dung: ' + repr(needle)
assert d['text'].count(NEWLINE) >= 3, 'mat dong moi'
PYEOF
fi

echo

echo '3. Máy chủ chết thì ghi lại, không im lặng'
kill "${SERVER_PID}" 2>/dev/null || true
wait "${SERVER_PID}" 2>/dev/null || true
unset SERVER_PID
set +e
CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}/hook" \
  CHANTAM_CRON_LOG_DIR="${WORK}/logs3" \
  "${SENDER}" 'thử kênh chết' 'nội dung' 2>/dev/null
rc=$?
set -e
check "$([[ ${rc} -ne 0 ]] && echo true || echo false)" \
  'trả mã khác 0 khi kênh chết' "exit=${rc}"
check "$([[ -f "${WORK}/logs3/alerts-chua-gui-duoc.log" ]] && echo true || echo false)" \
  'ghi lại lượt không gửi được — cảnh báo về cảnh báo không đi qua cùng kênh'

echo
echo '4. Healthcheck ngoài: chỉ báo sau N lượt thất bại liên tiếp'
HEALTH="${ROOT}/deploy/cron/check-health.sh"
HLOG="${WORK}/hlogs"

# URL chắc chắn không ai phục vụ. Ngưỡng 2 để phép kiểm ngắn.
run_health() {
  set +e
  CHANTAM_CRON_ALERT_URL="" CHANTAM_CRON_LOG_DIR="${HLOG}" \
    CHANTAM_HEALTH_FAILURES=2 CHANTAM_HEALTH_TIMEOUT=2 \
    "${HEALTH}" "http://127.0.0.1:1/health" >/dev/null 2>&1
  local rc=$?
  set -e
  return ${rc}
}

# Lượt 1: thất bại nhưng CHƯA chạm ngưỡng nên KHÔNG gửi gì.
run_health || true
check "$([[ ! -f "${HLOG}/alerts-chua-gui-duoc.log" ]] && echo true || echo false)" \
  'lượt thất bại ĐẦU chưa báo — mạng chớp một nhịp không phải sự cố'

# Lượt 2: chạm ngưỡng nên PHẢI gửi. Kênh chưa cấu hình nên nó rơi vào file
# "chưa gửi được" — đúng đường đã kiểm ở mục 1.
run_health || true
check "$([[ -f "${HLOG}/alerts-chua-gui-duoc.log" ]] && echo true || echo false)" \
  'lượt chạm ngưỡng thì BÁO'

# Lượt 3: vẫn đỏ nhưng KHÔNG báo lại — một sự cố hai giờ không được gửi 24 dòng.
before_lines=$(wc -l < "${HLOG}/alerts-chua-gui-duoc.log")
run_health || true
after_lines=$(wc -l < "${HLOG}/alerts-chua-gui-duoc.log")
check "$([[ "${before_lines}" == "${after_lines}" ]] && echo true || echo false)" \
  'lượt sau ngưỡng KHÔNG báo lại' "${before_lines} -> ${after_lines}"

check "$([[ "$(cat "${HLOG}/health-that-bai.count")" == '3' ]] && echo true || echo false)" \
  'đếm đúng số lượt thất bại liên tiếp' "$(cat "${HLOG}/health-that-bai.count")"
echo
if [[ ${fail} -eq 0 ]]; then
  echo "Kết quả: ${pass} đạt, 0 lỗi"
else
  echo "Kết quả: ${pass} đạt, ${fail} lỗi"
  exit 1
fi
