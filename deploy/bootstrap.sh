#!/usr/bin/env bash
#
# Dựng một môi trường Chân Tâm trên server.
#
# Chạy bằng root:
#   scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh root@<server>:/tmp/
#   ssh root@<server> 'bash /tmp/bootstrap.sh staging api-staging.example.com'
#   ssh root@<server> 'bash /tmp/bootstrap.sh production api.example.com'
#
# Hostname công khai là TUỲ CHỌN nhưng nên khai: nó trở thành mục "Servers" của
# Swagger trên chính server đó. Bỏ trống thì Swagger chỉ còn localhost, mà
# localhost trong trình duyệt người đọc là máy của họ, không phải API này.
#
# Chạy được nhiều lần. Đã có .env thì GIỮ NGUYÊN, không ghi đè — chạy lại để
# nâng Docker hay sửa quyền không làm mất bí mật đã sinh.
#
# Mỗi môi trường là một stack độc lập: thư mục riêng, database riêng, volume
# riêng, cổng riêng, và bí mật riêng. Chúng chỉ dùng chung máy và reverse proxy.
#
set -euo pipefail

ENVIRONMENT="${1:-}"
PUBLIC_HOST="${2:-}"

case "$ENVIRONMENT" in
  # 3000 đang có dịch vụ khác trên server dev (EduStack), nên Chân Tâm dùng
  # cổng nội bộ riêng. Nginx là thứ duy nhất nghe 80/443 từ Internet.
  staging) CORE_PORT=8080 ;;
  production) CORE_PORT=8085 ;;
  *)
    echo "Dùng: bash bootstrap.sh <staging|production> [hostname-công-khai]" >&2
    exit 2
    ;;
esac

# Mỗi server chỉ khai CHÍNH NÓ. Liệt kê môi trường khác ở đây là mời người mở
# tài liệu production bấm "Try it out" nhầm sang staging và ngược lại.
case "$ENVIRONMENT" in
  staging) SERVER_LABEL=Staging ;;
  production) SERVER_LABEL=Production ;;
esac

if [ -n "$PUBLIC_HOST" ]; then
  API_SERVERS_VALUE="$SERVER_LABEL=https://$PUBLIC_HOST"
else
  API_SERVERS_VALUE=""
fi

DEPLOY_USER=deploy
DEPLOY_HOME=/home/$DEPLOY_USER
APP_DIR=$DEPLOY_HOME/chantam-$ENVIRONMENT
SOURCE_DIR=$(dirname "$(readlink -f "$0")")
KEY_PATH=/root/chantam_deploy

if [ "$(id -u)" != "0" ]; then
  echo "Phải chạy bằng root." >&2
  exit 1
fi

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ─────────────────────────────────────────────────────────────────────────────
say "1/5 Docker"

if command -v docker > /dev/null 2>&1; then
  echo "Đã có: $(docker --version)"
else
  echo "Chưa có Docker, đang cài từ kho chính thức..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# Cờ --wait-timeout mà workflow deploy dùng cần Compose v2.17 trở lên.
echo "Compose: $(docker compose version --short 2> /dev/null || echo 'KHÔNG CÓ') (cần tối thiểu 2.17)"

# ─────────────────────────────────────────────────────────────────────────────
say "2/5 Tài khoản triển khai"

# Không dùng root cho CI: khoá SSH của CI nằm trong GitHub Secrets, và một khoá
# root bị lộ là mất cả máy chứ không chỉ mất ứng dụng.
if id "$DEPLOY_USER" > /dev/null 2>&1; then
  echo "User $DEPLOY_USER đã có."
else
  adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi

usermod -aG docker "$DEPLOY_USER"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$APP_DIR"

# ─────────────────────────────────────────────────────────────────────────────
say "3/5 File cấu hình cho môi trường $ENVIRONMENT"

for file in docker-compose.yml init.sql; do
  if [ -f "$SOURCE_DIR/$file" ]; then
    install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 644 \
      "$SOURCE_DIR/$file" "$APP_DIR/$file"
    echo "Đã chép $file"
  else
    echo "THIẾU $file — chép nó vào cùng thư mục với script rồi chạy lại." >&2
    exit 1
  fi
done

if [ -f "$APP_DIR/.env" ]; then
  echo ".env đã có, giữ nguyên (không ghi đè)."
else
  # Sinh bí mật RIÊNG cho từng môi trường. Dùng chung JWT_SECRET giữa staging và
  # production nghĩa là token cấp ở staging gọi được production — staging vốn
  # lỏng lẻo hơn, ai cũng tạo được tài khoản ở đó.
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 48)

  cat > "$APP_DIR/.env" << ENVFILE
# Môi trường: $ENVIRONMENT
# Sinh tự động bởi bootstrap.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)
# KHÔNG commit file này. Bí mật ở đây KHÁC với môi trường kia, cố ý.

POSTGRES_USER=chantam
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=chantam

# Workflow deploy tự ghi đè dòng này mỗi lần triển khai.
IMAGE=ghcr.io/fdshn/trueheart/core:$ENVIRONMENT

JWT_SECRET=$JWT_SECRET

LOG_LEVEL=info
# Bind trên 127.0.0.1 thôi; host Nginx đứng trước lo TLS/proxy.
CORE_PORT=$CORE_PORT
GEO_JITTER_RADIUS_METERS=300
OTP_TTL_SECONDS=300

# Ô chọn "Servers" của Swagger — CHỈ môi trường này. Không liệt kê môi trường
# khác, để không ai bấm "Try it out" nhầm sang bên kia.
API_SERVERS=$API_SERVERS_VALUE

# CẢNH BÁO: chưa có nhà cung cấp email/SMS/Zalo ZNS nào được cắm vào.
# Chức năng quên mật khẩu TỰ TẮT: mọi yêu cầu trả về kênh ADMIN_SUPPORT, không
# mã nào được ghi ra log. Service vẫn khởi động bình thường.
ENVFILE

  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Đã sinh .env với mật khẩu database và JWT_SECRET ngẫu nhiên, cổng $CORE_PORT."
fi

# ─────────────────────────────────────────────────────────────────────────────
say "4/5 Khoá SSH cho CI"

# Một khoá dùng chung cho mọi môi trường: cùng một máy, cùng một user.
if [ -f "$KEY_PATH" ]; then
  echo "Khoá đã có ở $KEY_PATH — không sinh lại."
  PRINT_KEY=0
else
  ssh-keygen -t ed25519 -C 'github-actions-chantam' -f "$KEY_PATH" -N '' -q
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 "$DEPLOY_HOME/.ssh"
  cat "$KEY_PATH.pub" >> "$DEPLOY_HOME/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
  chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
  echo "Đã sinh khoá và cấp quyền cho $DEPLOY_USER."
  PRINT_KEY=1
fi

# ─────────────────────────────────────────────────────────────────────────────
say "5/5 Xong môi trường $ENVIRONMENT"

cat << NEXT
Khai secret trong GitHub: Settings > Environments > $ENVIRONMENT

  SSH_HOST      IP máy này
  SSH_USER      $DEPLOY_USER
  SSH_PORT      22
  DEPLOY_PATH   $APP_DIR
  HEALTH_URL    https://<tên miền của $ENVIRONMENT>

Biến (Variables, KHÔNG phải Secrets):

  DEPLOY_ENABLED = true

NEXT

if [ "$PRINT_KEY" = "1" ]; then
  cat << 'KEYNOTE'
Dán khoá riêng dưới đây vào secret SSH_PRIVATE_KEY (của CẢ HAI môi trường — cùng một
máy, cùng một user). Dán nguyên văn, cả dòng BEGIN và END.

Sau khi dán xong, XOÁ khoá riêng khỏi server:

  shred -u /root/chantam_deploy

KEYNOTE
  echo "──────────────────────── SSH_PRIVATE_KEY ────────────────────────"
  cat "$KEY_PATH"
  echo "─────────────────────────────────────────────────────────────────"
else
  echo "Khoá SSH đã cấp ở lần chạy trước — dùng lại đúng giá trị SSH_PRIVATE_KEY đó."
fi

cat << 'PROXY'

CÒN MỘT BƯỚC NỮA: host Nginx + Certbot. Chưa có nó thì API không ra được
Internet (mỗi stack chỉ bind 127.0.0.1), và cổng kiểm tra sau deploy sẽ luôn
thất bại vì nó gọi HEALTH_URL từ máy của GitHub.

Dùng template trong repo, nhưng KHÔNG chạy Nginx bằng Docker:

  deploy/nginx/chantam.conf.example

Làm theo deploy/STAGING.md hoặc deploy/PRODUCTION.md tương ứng. Thứ tự bắt buộc:

  1. DNS A record trỏ về máy này
  2. thêm vhost vào /etc/nginx/sites-available/ + symlink sites-enabled/
  3. sudo nginx -t && sudo systemctl reload nginx
  4. sudo certbot --nginx -d <domain>
  5. kiểm https://<domain>/health trước khi đặt DEPLOY_ENABLED=true
PROXY
