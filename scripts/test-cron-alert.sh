#!/usr/bin/env bash
#
# Kiểm đường CẢNH BÁO của cron, chạy thật qua HTTP.
#
# Vì sao script này tồn tại: một hệ báo động chưa ai thử là một hệ báo động không
# biết mình có chạy hay không, và đó là kiểu hỏng tệ nhất — khi cần tới nó thì đã
# muộn. Những thứ dưới đây không unit test nào thấy được: payload có phải JSON hợp
# lệ sau khi nhét log nhiều dòng vào, chưa cấu hình URL thì có im lặng không, gửi
# thất bại thì có ghi lại không, và hai hình payload của hai họ kênh có đúng không.
#
# Mục 3 và 4 là lý do nhánh Telegram được phép tồn tại. `send-alert.sh` từng cố ý
# không có nhánh đó, với lý do "một nhánh không ai dùng là một nhánh không ai thử".
# Lý do ấy vẫn đúng — nên nhánh này đi kèm phép thử, không đi một mình.
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
assert 'chat_id' not in d, 'nhanh webhook khong duoc mang chat_id'

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

echo '3. Telegram: hình payload khác, và thiếu chat_id thì KHÔNG gửi'

# Nhận kênh theo HÌNH DẠNG đường, nên một server ở 127.0.0.1 vẫn thử được nhánh
# Telegram. Nhận theo tên miền `api.telegram.org` thì chính nhánh này thành thứ
# không thử được — xem docblock của send-alert.sh.
TELEGRAM_PATH='/bot123456:AA-test-token/sendMessage'
CHAT_ID='-1001234567890'

: >"${WORK}/received.json"
set +e
CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}${TELEGRAM_PATH}" \
  CHANTAM_CRON_ALERT_CHAT_ID="${CHAT_ID}" \
  CHANTAM_CRON_LOG_DIR="${WORK}/logs-tg" CHANTAM_CRON_HOST='may-thu-alert' \
  "${SENDER}" 'backup that bai' 'chi tiet nhieu dong'
rc=$?
set -e
check "$([[ ${rc} -eq 0 ]] && echo true || echo false)" 'gửi Telegram thành công' "exit=${rc}"

if [[ -s "${WORK}/received.json" ]]; then
  python - "${WORK}/received.json" "${CHAT_ID}" <<'TGEOF' && ok 'payload Telegram mang chat_id + text, KHÔNG mang content' || ko 'payload Telegram'
import json, sys

d = json.load(open(sys.argv[1], encoding='utf-8'))
assert d.get('chat_id') == sys.argv[2], 'sai chat_id: ' + repr(d.get('chat_id'))
assert 'text' in d, 'thieu text'
# Telegram bo qua khoa la, nhung gui kem `content` lam payload to vo ich va che
# mat loi neu sau nay doi sang mot API khat khe hon.
assert 'content' not in d, 'Telegram khong hieu `content`, khong duoc gui kem'
assert 'backup' in d['text'], 'mat noi dung'
TGEOF
else
  ko 'payload Telegram' 'máy chủ không nhận được gì'
fi

# Thiếu chat_id phải chặn TRƯỚC khi gửi. Gửi rồi nhận 400 là mất cảnh báo, và
# mất đúng lúc đang có sự cố.
: >"${WORK}/received.json"
set +e
CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}${TELEGRAM_PATH}" \
  CHANTAM_CRON_ALERT_CHAT_ID='' \
  CHANTAM_CRON_LOG_DIR="${WORK}/logs-tg2" \
  "${SENDER}" 'thu thieu chat_id' 'noi dung' 2>/dev/null
rc=$?
set -e
check "$([[ ${rc} -ne 0 ]] && echo true || echo false)" \
  'thiếu chat_id thì trả mã khác 0' "exit=${rc}"
check "$([[ -f "${WORK}/logs-tg2/alerts-chua-gui-duoc.log" ]] && echo true || echo false)" \
  'thiếu chat_id thì ghi lại'
check "$([[ ! -s "${WORK}/received.json" ]] && echo true || echo false)" \
  'thiếu chat_id thì KHÔNG gửi gì lên mạng'

echo
echo '4. Tin quá trần ký tự thì bị cắt, không bị kênh từ chối'

# Telegram trả 400 khi tin quá 4096 ký tự. F67 đính stderr của `pg_restore` vào
# cảnh báo, nên tin dài là chuyện SẼ xảy ra. Hạ trần xuống 200 cho phép kiểm ngắn.
LONG_BODY="$(python -c "print('x' * 1000)")"
: >"${WORK}/received.json"
set +e
CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}${TELEGRAM_PATH}" \
  CHANTAM_CRON_ALERT_CHAT_ID="${CHAT_ID}" \
  CHANTAM_CRON_ALERT_MAX_CHARS=200 \
  CHANTAM_CRON_LOG_DIR="${WORK}/logs-tg3" \
  "${SENDER}" 'tin rat dai' "${LONG_BODY}"
rc=$?
set -e
check "$([[ ${rc} -eq 0 ]] && echo true || echo false)" 'vẫn gửi được tin dài' "exit=${rc}"

if [[ -s "${WORK}/received.json" ]]; then
  python - "${WORK}/received.json" <<'CUTEOF' && ok 'tin bị cắt về đúng trần và nói rõ là đã cắt' || ko 'cắt tin'
import json, sys

t = json.load(open(sys.argv[1], encoding='utf-8'))['text']
assert len(t) <= 200, 'khong cat, dai ' + str(len(t))
# Cat ma khong noi la da cat thi nguoi doc tin se tuong do la toan bo loi.
assert 'cắt' in t, 'cat ma khong noi la da cat'
CUTEOF
else
  ko 'cắt tin' 'máy chủ không nhận được gì'
fi

echo
echo '5. Cả hai bộ đóng gói JSON cho cùng một payload'

# `auto` ưu tiên jq, nên trên host KHÔNG có jq thì nhánh jq không bao giờ chạy — và
# nó chính là nhánh được ưu tiên trên host production. Ép từng bộ để cả hai được
# thử ở mọi nơi, thay vì phụ thuộc vào việc host tình cờ cài gì.
for encoder in jq python; do
  if [[ "${encoder}" == 'jq' ]] && ! command -v jq >/dev/null 2>&1; then
    # CI đặt `CHANTAM_ALERT_REQUIRE_JQ=1`, nên ở đó thiếu jq là ĐỎ chứ không phải
    # bỏ qua. Lý do: một dòng "BỎ QUA" trong log CI dài vài nghìn dòng là thứ không
    # ai đọc, và nhánh jq là nhánh host production ưu tiên dùng. Để nó bỏ qua im
    # trong CI thì ta có một phép thử tự nhận là đã phủ hai nhánh mà thật ra phủ một.
    if [[ -n "${CHANTAM_ALERT_REQUIRE_JQ:-}" ]]; then
      ko 'bộ jq' 'CHANTAM_ALERT_REQUIRE_JQ đã đặt nhưng host không có jq'
    else
      printf '  BỎ QUA  bộ jq — host này không có jq, nhánh jq CHƯA được thử ở đây\n'
    fi
    continue
  fi
  : >"${WORK}/received.json"
  set +e
  CHANTAM_CRON_ALERT_URL="http://127.0.0.1:${PORT}/hook" \
    CHANTAM_CRON_ALERT_ENCODER="${encoder}" \
    CHANTAM_CRON_LOG_DIR="${WORK}/logs-enc-${encoder}" \
    "${SENDER}" 'thu bo dong goi' 'noi dung co dau: chăn trở'
  rc=$?
  set -e
  check "$([[ ${rc} -eq 0 ]] && echo true || echo false)" \
    "bộ ${encoder} gửi được" "exit=${rc}"
  if [[ -s "${WORK}/received.json" ]]; then
    python - "${WORK}/received.json" <<'ENCEOF' && ok "bộ ${encoder} cho JSON đúng hình, giữ chữ có dấu" || ko "bộ ${encoder}"
import json, sys

d = json.load(open(sys.argv[1], encoding='utf-8'))
assert d['text'] == d['content'], 'hai khoa phai cung noi dung'
assert 'chat_id' not in d, 'nhanh webhook khong duoc mang chat_id'
# Chu co dau la ly do nhanh python phai giai ma UTF-8 tuong minh; hai bo phai cho
# cung ket qua, neu khong doi host la doi noi dung canh bao.
assert 'chăn trở' in d['text'], 'mat chu co dau'
ENCEOF
  else
    ko "bộ ${encoder}" 'máy chủ không nhận được gì'
  fi
done

echo
echo '6. Máy chủ chết thì ghi lại, không im lặng'
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
echo '7. Healthcheck ngoài: chỉ báo sau N lượt thất bại liên tiếp'
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
