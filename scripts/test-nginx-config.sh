#!/usr/bin/env bash
#
# Chạy `nginx -t` THẬT trên cấu hình Nginx của repo, bằng Docker.
#
# ## Vì sao cần, khi đã có nginx-ratelimit-guard.spec.ts
#
# Phép kiểm kia đọc VĂN BẢN: nó canh zone dùng đều đã khai, quan hệ ngưỡng đúng,
# hai khối server không lệch nhau. Nó KHÔNG biết Nginx có khởi động được không.
#
# Những lỗi chỉ `nginx -t` thấy: một dấu `}` thiếu, một directive đặt sai ngữ cảnh,
# một biến dùng trước khi khai, một tên directive viết sai. Cả bốn đều làm
# `systemctl reload nginx` thất bại — và trên một host đang chạy, reload thất bại
# nghĩa là cấu hình CŨ vẫn phục vụ, nên người ta tưởng đã áp dụng xong.
#
# ## Những gì script này THAY THẾ, và vì sao vẫn là phép kiểm thật
#
# Cấu hình thật tham chiếu bốn thứ do HOST cung cấp, không phải do repo:
#
#   - `/etc/nginx/proxy_params` — gói nginx của Debian/Ubuntu mang theo, ảnh
#     nginx chính thức thì không.
#   - `/etc/letsencrypt/options-ssl-nginx.conf` và `ssl-dhparams.pem` — Certbot sinh.
#   - `/etc/letsencrypt/live/<host>/fullchain.pem` + `privkey.pem` — Certbot sinh.
#
# Script tạo bản thay thế tối giản cho bốn thứ đó. Đây đúng là những giá trị mà
# runbook đã bảo người triển khai tự thay, nên thay chúng KHÔNG làm phép kiểm mất
# ý nghĩa: thứ đang được kiểm là cấu trúc của chính cấu hình trong repo — zone,
# location, thứ tự ngữ cảnh, cú pháp.
#
# Thứ script này KHÔNG kiểm: certificate thật có hợp lệ không, upstream có sống
# không, và ngưỡng chặn tốc độ có hợp với lưu lượng thật không. Hai cái đầu chỉ
# host trả lời được; cái thứ ba cần dữ liệu thật.
#
# Dùng:
#   bash scripts/test-nginx-config.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_DIR="${ROOT}/deploy/nginx"
IMAGE="${CHANTAM_NGINX_TEST_IMAGE:-nginx:1.27-alpine}"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

pass=0
fail=0
ok() {
  printf '  \033[32m✓\033[0m %s\n' "$1"
  pass=$((pass + 1))
}
ko() {
  printf '  \033[31m✗\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  fail=$((fail + 1))
}

if ! command -v docker >/dev/null 2>&1; then
  echo 'Bỏ qua: host không có docker.' >&2
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  # Nói THẲNG là bỏ qua, và thoát 0 — nhưng in ra, vì im lặng coi như đạt là
  # đúng kiểu lỗi mà cả bộ kiểm này được viết ra để chặn.
  echo 'Bỏ qua: docker daemon không chạy.' >&2
  exit 0
fi

echo "Kiểm cấu hình Nginx bằng ${IMAGE}"
echo

# ── Dựng bản thay thế cho những gì host cung cấp ──────────────────────────────
mkdir -p "${WORK}/conf.d" "${WORK}/sites-enabled" "${WORK}/letsencrypt"

# `proxy_params` của Debian, bản tối giản.
cat >"${WORK}/proxy_params" <<'EOF'
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
EOF

cat >"${WORK}/letsencrypt/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF

# 2048 bit, KHÔNG phải 1024. Bản đầu của script này dùng 1024 với lý do "file chỉ
# cần Nginx phân tích được" — lý do đó SAI, và `nginx -t` thật đã nói ra:
#
#   SSL_CTX_set_tmp_dh(...) failed (SSL: error:0A00018A:
#   SSL routines::dh key too small)
#
# Nginx NẠP và kiểm tham số DH ngay lúc test cấu hình, không chỉ đọc cú pháp. Đây
# đúng là loại điều mà một phép kiểm văn bản không bao giờ phát hiện được, và là
# lý do script này tồn tại.
openssl dhparam -out "${WORK}/letsencrypt/ssl-dhparams.pem" 2048 >/dev/null 2>&1

# Hostname lấy TỪ CHÍNH cấu hình, không chép tay: thêm một môi trường mới mà quên
# sinh certificate cho nó thì phép kiểm phải đỏ, chứ không phải bỏ qua lặng lẽ.
HOSTS="$(grep -oE '^\s*server_name\s+\S+;' "${NGINX_DIR}/chantam.conf.example" |
  sed -E 's/^\s*server_name\s+//; s/;$//' | sort -u)"
if [ -z "${HOSTS}" ]; then
  ko 'trích được hostname từ cấu hình' 'không thấy dòng server_name nào'
else
  ok "trích được $(printf '%s' "${HOSTS}" | wc -w | tr -d ' ') hostname từ chính cấu hình"
fi

for host in ${HOSTS}; do
  mkdir -p "${WORK}/letsencrypt/live/${host}"
  # `//CN=` hai dấu chéo, không phải một. Git Bash đổi `/CN=...` thành một đường
  # dẫn Windows (`C:/Program Files/Git/CN=...`) rồi openssl từ chối; còn tắt hẳn
  # chuyển đường dẫn thì chính `-keyout /tmp/...` lại không dịch được. Hai dấu
  # chéo là cách duy nhất đi qua cả hai: MSYS để nguyên, openssl đọc ra đúng
  # `CN=<host>`. Trên Linux `//CN=` cũng hợp lệ, nên không cần rẽ nhánh theo OS.
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -subj "//CN=${host}" \
    -keyout "${WORK}/letsencrypt/live/${host}/privkey.pem" \
    -out "${WORK}/letsencrypt/live/${host}/fullchain.pem" >/dev/null 2>&1
done

# ── Cấu hình thật của repo, không sửa một ký tự ───────────────────────────────
cp "${NGINX_DIR}/chantam-ratelimit.conf.example" "${WORK}/conf.d/chantam-ratelimit.conf"
cp "${NGINX_DIR}/chantam.conf.example" "${WORK}/sites-enabled/chantam.conf"

# `nginx.conf` dựng lại thứ tự của host thật: conf.d (nơi khai zone và map) rồi
# sites-enabled (nơi dùng chúng).
cat >"${WORK}/nginx.conf" <<'EOF'
worker_processes 1;
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log off;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

# ── Chạy nginx -t ─────────────────────────────────────────────────────────────
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}
MOUNT="$(host_path "${WORK}")"

set +e
OUTPUT="$(
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "${MOUNT}/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "${MOUNT}/conf.d:/etc/nginx/conf.d:ro" \
    -v "${MOUNT}/sites-enabled:/etc/nginx/sites-enabled:ro" \
    -v "${MOUNT}/proxy_params:/etc/nginx/proxy_params:ro" \
    -v "${MOUNT}/letsencrypt:/etc/letsencrypt:ro" \
    "${IMAGE}" nginx -t 2>&1
)"
code=$?
set -e

if [ ${code} -eq 0 ]; then
  ok 'nginx -t: cấu hình hợp lệ, Nginx khởi động được với nó'
else
  ko 'nginx -t ĐỎ — reload trên host sẽ thất bại và cấu hình CŨ vẫn phục vụ' \
    "$(printf '%s' "${OUTPUT}" | tail -5 | tr '\n' ' ')"
fi

# ── Thiếu file zone thì PHẢI đỏ ───────────────────────────────────────────────
#
# Đây là phép kiểm quan trọng thứ hai: runbook nói file `conf.d` là bắt buộc, và
# lời đó chỉ đúng nếu thiếu nó thật sự làm `nginx -t` thất bại. Chưa kiểm thì đó
# chỉ là một câu trong tài liệu.
rm -f "${WORK}/conf.d/chantam-ratelimit.conf"
set +e
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${MOUNT}/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "${MOUNT}/conf.d:/etc/nginx/conf.d:ro" \
  -v "${MOUNT}/sites-enabled:/etc/nginx/sites-enabled:ro" \
  -v "${MOUNT}/proxy_params:/etc/nginx/proxy_params:ro" \
  -v "${MOUNT}/letsencrypt:/etc/letsencrypt:ro" \
  "${IMAGE}" nginx -t >/dev/null 2>&1
missing_code=$?
set -e

if [ ${missing_code} -ne 0 ]; then
  ok 'thiếu conf.d/chantam-ratelimit.conf thì nginx -t ĐỎ — runbook nói đúng'
else
  ko 'thiếu file zone mà nginx -t vẫn xanh' \
    'runbook bảo file đó bắt buộc, nhưng Nginx không đồng ý — một trong hai sai'
fi

echo
if [ ${fail} -eq 0 ]; then
  echo "Kết quả: ${pass} đạt, 0 lỗi"
else
  echo "Kết quả: ${pass} đạt, ${fail} lỗi"
  exit 1
fi
