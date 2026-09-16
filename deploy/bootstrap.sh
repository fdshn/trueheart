#!/usr/bin/env bash
#
# Dựng server lần đầu cho Chân Tâm Core.
#
# Chạy bằng root trên một server Ubuntu còn trống:
#   scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh root@<server>:/tmp/
#   ssh root@<server> 'bash /tmp/bootstrap.sh'
#
# Script làm những việc sau và KHÔNG làm gì hơn:
#   - cài Docker Engine + plugin Compose nếu chưa có
#   - tạo user `deploy` (không mật khẩu, chỉ đăng nhập bằng khoá SSH)
#   - tạo /home/deploy/chantam và chép docker-compose.yml + init.sql vào đó
#   - sinh .env với mật khẩu database và JWT_SECRET NGẪU NHIÊN
#   - sinh cặp khoá SSH riêng cho CI và in khoá riêng ra MỘT LẦN
#
# Chạy lại được nhiều lần: đã có .env thì giữ nguyên, không ghi đè.
#
set -euo pipefail

DEPLOY_USER=deploy
DEPLOY_HOME=/home/$DEPLOY_USER
APP_DIR=$DEPLOY_HOME/chantam
SOURCE_DIR=$(dirname "$(readlink -f "$0")")

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

# Cờ --wait-timeout của compose cần v2.17+; workflow deploy dùng cờ đó.
COMPOSE_VERSION=$(docker compose version --short 2> /dev/null || echo "0")
echo "Compose: $COMPOSE_VERSION (cần tối thiểu 2.17)"

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
say "3/5 File cấu hình"

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
  # Sinh bí mật ngẫu nhiên tại chỗ. Người ta gõ tay thì hay đặt mật khẩu yếu,
  # hoặc dùng lại đúng mật khẩu của môi trường dev.
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 48)

  cat > "$APP_DIR/.env" << ENVFILE
# Sinh tự động bởi bootstrap.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)
# KHÔNG commit file này.

POSTGRES_USER=chantam
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=chantam

# Workflow deploy tự ghi đè dòng này mỗi lần triển khai.
IMAGE=ghcr.io/fdshn/trueheart/core:staging

JWT_SECRET=$JWT_SECRET

LOG_LEVEL=info
CORE_PORT=3000
GEO_JITTER_RADIUS_METERS=300
OTP_TTL_SECONDS=300

# CẢNH BÁO: chưa có nhà cung cấp email/SMS/Zalo ZNS nào được cắm vào.
# Ở production, chức năng quên mật khẩu TỰ TẮT: mọi yêu cầu đặt lại mật khẩu
# trả về kênh ADMIN_SUPPORT, không mã nào được ghi ra log.
ENVFILE

  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Đã sinh .env với mật khẩu database và JWT_SECRET ngẫu nhiên."
fi

# ─────────────────────────────────────────────────────────────────────────────
say "4/5 Khoá SSH cho CI"

KEY_PATH=/root/chantam_deploy

if [ -f "$KEY_PATH" ]; then
  echo "Khoá đã có ở $KEY_PATH — không sinh lại."
else
  ssh-keygen -t ed25519 -C 'github-actions-chantam' -f "$KEY_PATH" -N '' -q
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 "$DEPLOY_HOME/.ssh"
  cat "$KEY_PATH.pub" >> "$DEPLOY_HOME/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
  chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
  echo "Đã sinh khoá và cấp quyền cho $DEPLOY_USER."
fi

# ─────────────────────────────────────────────────────────────────────────────
say "5/5 Xong. Việc còn lại phải làm bằng tay"

cat << 'NEXT'
Khai secret trong GitHub: Settings > Environments > staging (và production).

  SSH_HOST      địa chỉ server này
  SSH_USER      deploy
  SSH_PORT      22
  DEPLOY_PATH   /home/deploy/chantam
  HEALTH_URL    URL công khai, ví dụ https://api.chantam.vn
  SSH_KEY       nội dung khoá riêng in ra dưới đây

Biến (Variables, không phải Secrets):

  DEPLOY_ENABLED = true

Sau khi dán SSH_KEY vào GitHub, XOÁ khoá riêng khỏi server:

  shred -u /root/chantam_deploy

Chưa làm: reverse proxy + TLS, backup database, giám sát. Xem README.md mục 7.
NEXT

echo
echo "───────── SSH_KEY (dán NGUYÊN VĂN, cả dòng BEGIN và END) ─────────"
cat "$KEY_PATH"
echo "──────────────────────────────────────────────────────────────────"
