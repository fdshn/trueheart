# Staging · Runbook triển khai

Staging là môi trường tự deploy mỗi lần push vào `main`. Dùng để kiểm đúng image, migration,
PostGIS, Redis, HTTPS và API trước khi quyết định phát hành production.

```text
GitHub main → GHCR image sha-<commit> → server staging
                                         └→ Nginx → https://api-staging.<domain>
```

> Các lệnh server dùng `root` cho bootstrap/Nginx/Certbot. GitHub Actions chỉ SSH user `deploy`
> để kéo image và chạy Compose, không dùng root.

## 1. Điều kiện trước

- Ubuntu 22.04+; DNS A record `api-staging.<domain>` trỏ về IP server.
- Firewall mở TCP 80 và 443. Core 8080 chỉ nghe loopback, **không mở firewall 8080**.
- Host đã có Nginx + Certbot, hoặc cài theo chính sách vận hành của server.
- Không có proxy Docker khác giữ 80/443. Nếu từng thử proxy Docker cũ, dừng và xoá nó sau khi xác nhận Nginx staging hoạt động; không đụng host Nginx hay các website khác.

Kiểm cổng hiện hữu:

```bash
sudo ss -ltnp | grep -E ':(80|443)\b'
```

Nếu Nginx đang phục vụ website khác, chỉ thêm vhost mới; không dừng/restart bừa Nginx.

## 2. Bootstrap stack staging

Từ gốc repo trên máy local:

```bash
scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh \
  root@<server>:/tmp/
```

File chép từ Windows có thể là CRLF. Trên server root:

```bash
sed -i 's/\r$//' /tmp/docker-compose.yml /tmp/init.sql /tmp/bootstrap.sh
bash /tmp/bootstrap.sh staging
```

Script cài Docker nếu thiếu, tạo user `deploy`, thêm họ vào group Docker, tạo
`/home/deploy/chantam-staging`, chép file Compose/SQL, sinh `.env` với password database và
`JWT_SECRET` ngẫu nhiên, rồi sinh SSH key CI lần đầu.

Vì server dev hiện có dịch vụ khác dùng 3000, staging dùng 8080:

```bash
sed -i 's/^CORE_PORT=.*/CORE_PORT=8080/' \
  /home/deploy/chantam-staging/.env

grep '^CORE_PORT=' /home/deploy/chantam-staging/.env
ls -la /home/deploy/chantam-staging
```

Kỳ vọng: `CORE_PORT=8080`, cùng `.env`, `docker-compose.yml`, `init.sql`.

Nếu script vừa in `SSH_PRIVATE_KEY`, dán toàn bộ private key (BEGIN/END) vào GitHub Environment
`staging`. Không dán key vào chat. Sau khi đã lưu GitHub:

```bash
shred -u /root/chantam_deploy
```

## 3. Cài Nginx vhost và TLS

Trên máy local, chép template:

```bash
scp deploy/nginx/chantam.conf.example \
  root@<server>:/tmp/chantam.conf.example
```

Trên server root, tạo site staging **riêng**:

```bash
cp /tmp/chantam.conf.example /etc/nginx/sites-available/api-staging.<domain>
nano /etc/nginx/sites-available/api-staging.<domain>
```

Trong file vừa tạo:

1. Giữ **chỉ hai block staging** (`api-staging.example.com`), xoá hai block production.
2. Thay mọi `api-staging.example.com` bằng hostname thật.
3. Giữ upstream `proxy_pass http://127.0.0.1:8080;`.
4. Lần đầu chưa có certificate: xoá **toàn bộ server block `listen 443`** (không chỉ 4 dòng certificate), giữ block HTTP cho ACME.

Bật site và kiểm trước reload:

```bash
ln -s /etc/nginx/sites-available/api-staging.<domain> \
  /etc/nginx/sites-enabled/api-staging.<domain>

nginx -t && systemctl reload nginx
```

Xin certificate:

```bash
certbot --nginx -d api-staging.<domain>
```

Certbot có thể tự thêm block HTTPS. Sau đó, nếu cần security header/proxy setting đầy đủ, chép lại block HTTPS staging từ template (đã thay domain) và kiểm `nginx -t && systemctl reload nginx`. Chọn redirect HTTP → HTTPS khi Certbot hỏi.

Kiểm certificate/renewal:

```bash
certbot certificates
certbot renew --dry-run
curl -sI https://api-staging.<domain>/health
```

Trước deploy Core đầu tiên có thể trả 502 — Nginx/TLS đã đúng nhưng upstream chưa chạy. Sau
deploy phải trả 200. Swagger staging được mở tại `/docs`.

## 4. GitHub Environment `staging`

**Settings → Environments → staging**. Khai Environment secrets, không dùng Repository secrets:

| Secret | Giá trị |
| --- | --- |
| `SSH_HOST` | IP/hostname server staging |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | CI private key đã sinh ở bootstrap |
| `SSH_PORT` | `22` (tuỳ chọn) |
| `DEPLOY_PATH` | `/home/deploy/chantam-staging` |
| `HEALTH_URL` | `https://api-staging.<domain>` |

Environment Variable:

```text
DEPLOY_ENABLED=true
```

Workflow fail-fast nếu thiếu `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH` hoặc
`HEALTH_URL`; đừng để `HEALTH_URL` kèm `/health` vì smoke test tự nối path đó.

## 5. Deploy và kiểm

- Push mới vào `main` tự build/push image GHCR rồi deploy staging.
- Hoặc **Actions → Release → Run workflow → staging** để chạy tay.

Workflow deploy Core image SHA-pinned, tự kéo Postgres/PostGIS và Redis lần đầu, chạy migration,
đợi healthcheck, rồi gọi `HEALTH_URL/health` và `HEALTH_URL/docs/json` từ GitHub runner.

Trên server:

```bash
sudo -u deploy docker compose -f /home/deploy/chantam-staging/docker-compose.yml \
  --project-directory /home/deploy/chantam-staging ps

curl -s https://api-staging.<domain>/health
curl -sI https://api-staging.<domain>/docs
```

Kỳ vọng: Postgres, Redis, Core `healthy`; health 200; docs 200.

## 6. Kết nối database staging bằng DBeaver

Postgres chỉ bind `127.0.0.1:15432` trên VPS, nên không phơi database ra Internet. DBeaver tự
mở SSH tunnel bằng user `deploy`, rồi đi từ loopback VPS vào container:

```text
DBeaver → SSH deploy@server → 127.0.0.1:15432 (VPS) → postgres:5432 (Docker)
```

Không dùng port `5433`: đó là database EduStack khác trên VPS.

Nếu DBeaver báo `EOFException` với key Ed25519/OpenSSH mà Windows `ssh` vẫn vào được, tạo key
RSA PEM **riêng cho DBeaver** trên máy local:

```powershell
ssh-keygen -t rsa -b 4096 -m PEM `
  -f "$env:USERPROFILE\.ssh\dbeaver_chantam_rsa" `
  -C "dbeaver-chantam"

Get-Content "$env:USERPROFILE\.ssh\dbeaver_chantam_rsa.pub" |
  ssh deploy@<staging-server> `
  'umask 077; cat >> ~/.ssh/authorized_keys'
```

DBeaver **Main** tab:

```text
Host:       127.0.0.1
Port:       15432
Database:   chantam
Username:   chantam
Password:   giá trị POSTGRES_PASSWORD trong /home/deploy/chantam-staging/.env
```

DBeaver **SSH** tab:

```text
Use SSH Tunnel:         ✓
Host/IP:                <staging-server>
Port:                   22
User Name:              deploy
Authentication Method:  Public Key
Private Key:            C:\Users\<user>\.ssh\dbeaver_chantam_rsa
```

Chọn private key, **không** chọn file `.pub`. Không dùng SSH key GitHub Actions cho DBeaver.

## 7. Khi deploy đỏ

Workflow tự trả lại image SHA trước đó. Xem job Staging trên GitHub trước; không chạy `docker
compose down -v` vì sẽ xoá volume dữ liệu. Để xem log server:

```bash
cd /home/deploy/chantam-staging
docker compose logs --tail=200 core
docker compose ps
```

Rollback tay khi cần:

```bash
cd /home/deploy/chantam-staging
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/fdshn/trueheart/core:sha-<commit-cu>|' .env
docker compose pull core
docker compose up -d --wait --wait-timeout 180
```
