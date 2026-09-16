# Production · Runbook triển khai

Production chỉ deploy khi push tag `v*`. Nó nên chạy trên **server khách riêng**, không dùng lại
server dev staging. GitHub workflow giống staging nhưng lấy toàn bộ credential từ Environment
`production`.

```text
git tag vX.Y.Z → GHCR image vX.Y.Z + sha-<commit> → server production
                                                    └→ Nginx → https://api.<domain>
```

## 1. Điều kiện bắt buộc trước khi bật

- Bản commit đã deploy/test thành công ở staging.
- Server khách đã có backup database, kiểm restore tối thiểu một lần và đủ CPU/RAM/disk.
- DNS A record `api.<domain>` trỏ về server production.
- Nginx + Certbot host hoạt động, firewall mở 80/443. Core 8085 chỉ bind loopback.
- Tên miền production có certificate hợp lệ và `https://api.<domain>/health` gọi được qua
  Internet trước khi bật deploy.
- GitHub Environment production có đủ credential riêng. **Không dùng lại SSH key staging**.

> GitHub Free/private có thể không cho Required reviewers. Nếu giao diện không bật được, quy
> trình tag/release phải do một người chịu trách nhiệm thực hiện thủ công; không coi tag `v*`
> là có duyệt tự động.

## 2. Bootstrap server production

Từ gốc repo trên máy local:

```bash
scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh \
  root@<server-production>:/tmp/
```

Trên server root:

```bash
sed -i 's/\r$//' /tmp/docker-compose.yml /tmp/init.sql /tmp/bootstrap.sh
bash /tmp/bootstrap.sh production

sed -i 's/^CORE_PORT=.*/CORE_PORT=8085/' \
  /home/deploy/chantam-production/.env

grep '^CORE_PORT=' /home/deploy/chantam-production/.env
ls -la /home/deploy/chantam-production
```

Kỳ vọng: `CORE_PORT=8085`, path có `.env`, `docker-compose.yml`, `init.sql`.

Bootstrap sinh `POSTGRES_PASSWORD` + `JWT_SECRET` ngẫu nhiên riêng. Không copy `.env` từ
staging: dùng chung JWT secret khiến token staging có thể gọi production.

Nếu bootstrap in `SSH_PRIVATE_KEY`, dùng key đó cho Environment production, rồi:

```bash
shred -u /root/chantam_deploy
```

## 3. Nginx + Certbot production

Chép template:

```bash
scp deploy/nginx/chantam.conf.example \
  root@<server-production>:/tmp/chantam.conf.example
```

Trên server root:

```bash
cp /tmp/chantam.conf.example /etc/nginx/sites-available/api.<domain>
nano /etc/nginx/sites-available/api.<domain>
```

Trong file:

1. Giữ **chỉ hai block production** (`api.example.com`), xoá staging.
2. Thay mọi `api.example.com` bằng domain thật.
3. Giữ upstream `proxy_pass http://127.0.0.1:8085;`.
4. Lần đầu chưa có certificate: xoá **toàn bộ server block `listen 443`**, nạp block
   HTTP, chạy Certbot; sau đó Certbot tự thêm HTTPS hoặc chép lại block HTTPS production từ
template (đã thay domain).
5. Giữ ba block chặn Swagger: `/docs`, `/docs/`, `/docs/json` phải 404 ở production.

```bash
ln -s /etc/nginx/sites-available/api.<domain> \
  /etc/nginx/sites-enabled/api.<domain>

nginx -t && systemctl reload nginx
certbot --nginx -d api.<domain>
certbot renew --dry-run
```

Kiểm trước deploy Core có thể là 502, nhưng certificate/DNS phải đúng:

```bash
curl -sI https://api.<domain>/health
```

## 4. GitHub Environment `production`

**Settings → Environments → production**. Khai Environment secrets riêng:

| Secret | Giá trị |
| --- | --- |
| `SSH_HOST` | IP/hostname server khách |
| `SSH_USER` | `deploy` hoặc user khách cấp |
| `SSH_PRIVATE_KEY` | CI private key riêng của server khách |
| `SSH_PORT` | `22` (tuỳ chọn) |
| `DEPLOY_PATH` | `/home/deploy/chantam-production` |
| `HEALTH_URL` | `https://api.<domain>` |

Mặc định giữ Environment Variable:

```text
DEPLOY_ENABLED=false
```

Chỉ đổi sang `true` sau khi bootstrap, Nginx, Certbot, DNS và external health check xanh.
Workflow sẽ fail rõ tên secret thiếu thay vì cố SSH bằng credential staging/rỗng.

## 5. Phát hành

Đảm bảo local trùng `main`, rồi tag version SemVer:

```bash
git checkout main
git pull --ff-only origin main
git status

git tag v0.1.0
git push origin v0.1.0
```

Tag chạy workflow Release:

1. Build Core từ **đúng commit được tag**.
2. Push `v0.1.0`, `latest` và `sha-<commit>` lên GHCR.
3. Deploy image SHA-pinned vào `/home/deploy/chantam-production`.
4. Compose khởi động Postgres/PostGIS, Redis và Core; migration chạy tại startup production.
5. GitHub gọi read-only smoke test qua `HEALTH_URL`.
6. Lỗi ở deploy/health thì workflow tự pin lại image SHA trước rồi `up --wait` rollback.

Sau release:

```bash
curl -s https://api.<domain>/health
curl -sI https://api.<domain>/docs
curl -sI https://api.<domain>/docs/json
```

Kỳ vọng: health 200, `/docs` 404, `/docs/json` 404.

## 6. Rollback tay

Tìm SHA image trước trong Actions log hoặc `.env`, rồi trên server:

```bash
cd /home/deploy/chantam-production
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/fdshn/trueheart/core:sha-<commit-cu>|' .env
docker compose pull core
docker compose up -d --wait --wait-timeout 180
```

Không rollback database bằng cách xoá volume. Migration production phải được thiết kế tương thích
ngược; migration phá dữ liệu cần một kế hoạch backup/restore riêng trước release.
