# Production · Runbook triển khai

Production là một server riêng chạy toàn bộ **Core API + PostgreSQL/PostGIS + Redis**.
GitHub chỉ deploy khi push tag `v*`; không có chuyện staging tự động đi tiếp sang production.

```text
Internet HTTPS
   ↓ :443
Host Nginx + Certbot
   ↓ 127.0.0.1:8085
Docker Compose production
   ├─ core       Chân Tâm BE
   ├─ postgres   PostgreSQL 16 + PostGIS 3.4
   └─ redis
```

Postgres và Redis chỉ nằm trong Docker network; không mở database ra Internet. Core gọi:

```text
postgres:5432
redis:6379
```

> Runbook staging: [`STAGING.md`](./STAGING.md). Tổng quan kiến trúc: [`README.md`](./README.md).

---

## 1. Điều kiện bắt buộc trước khi deploy

- Commit đã được deploy/test thành công ở staging.
- Khách đã cấp server production; không dùng lại VPS dev staging khi có người dùng thật.
- Có DNS A record `api.<domain>` trỏ về IP server production.
- Host có Nginx + Certbot, firewall mở TCP 80/443.
- Có kế hoạch backup database và đã thử restore tối thiểu một lần trước khi nhận dữ liệu thật.
- Production có SSH key CI **riêng**; không dùng lại key staging.
- GitHub Environment `production` có đủ secret riêng, nhưng `DEPLOY_ENABLED=false` cho tới khi
  hoàn tất Nginx/TLS/DNS.

Kiểm Nginx đang giữ public port:

```bash
sudo ss -ltnp | grep -E ':(80|443)\b'
```

Không chạy proxy Docker khác cạnh host Nginx. Một máy chỉ có một dịch vụ nghe 80/443.

---

## 2. Bootstrap application stack — làm một lần

Từ **gốc repo** trên máy local:

```powershell
cd "D:\works\freelancer_dev\true-heart"

scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh `
  root@<IP-SERVER-PRODUCTION>:/tmp/
```

Nếu root SSH tắt, chép bằng user `deploy`, sau đó vào VPS Web Console với root để chạy bootstrap.

Trên server, bằng `root`:

```bash
# File chép từ Windows có thể dùng CRLF; chuẩn hoá trước khi Bash đọc.
sed -i 's/\r$//' /tmp/docker-compose.yml /tmp/init.sql /tmp/bootstrap.sh

bash /tmp/bootstrap.sh production api.<domain>
```

Tham số thứ hai là hostname công khai, dùng làm mục **Servers** của Swagger trên
chính server này. Chỉ khai production, tuyệt đối không kèm staging vào danh sách
— hai môi trường cùng xuất hiện là mời người ta bấm `Try it out` nhầm bên.

Bootstrap tự làm:

- cài Docker Engine/Compose nếu chưa có;
- tạo user `deploy`, thêm vào group `docker`;
- tạo `/home/deploy/chantam-production`;
- chép `docker-compose.yml` và `init.sql`;
- sinh `.env` với `POSTGRES_PASSWORD` và `JWT_SECRET` ngẫu nhiên;
- sinh SSH key CI lần đầu, thêm public key vào `deploy/.ssh/authorized_keys`.

Kiểm đầu ra:

```bash
ls -la /home/deploy/chantam-production
grep -E '^(CORE_PORT|POSTGRES_USER|POSTGRES_DB)=' \
  /home/deploy/chantam-production/.env
```

Phải có:

```text
.env
docker-compose.yml
init.sql
CORE_PORT=8085
POSTGRES_USER=chantam
POSTGRES_DB=chantam
```

> Không copy `.env` từ staging. `POSTGRES_PASSWORD` và đặc biệt `JWT_SECRET` phải riêng:
> dùng chung JWT secret khiến token staging có thể được production chấp nhận.

Nếu bootstrap vừa in `SSH_PRIVATE_KEY`, lưu toàn bộ key vào GitHub Environment `production`, rồi xoá
bản tạm trên server:

```bash
shred -u /root/chantam_deploy
```

Không gửi private key qua chat, email hoặc commit vào repo.

---

## 3. Cài Nginx vhost + TLS

Từ gốc repo local:

```powershell
scp deploy/nginx/chantam.conf.example `
  root@<IP-SERVER-PRODUCTION>:/tmp/chantam.conf.example
```

Trên server root:

```bash
cp /tmp/chantam.conf.example /etc/nginx/sites-available/api.<domain>
nano /etc/nginx/sites-available/api.<domain>
```

Trong file Nginx:

1. Giữ **hai block production**; xoá hai block staging.
2. Thay toàn bộ `api.example.com` bằng domain thật, ví dụ `api.chantam.vn`.
3. Giữ upstream đúng:

   ```nginx
   proxy_pass http://127.0.0.1:8085;
   ```

4. Giữ block chặn Swagger production:

   ```nginx
   location = /docs { return 404; }
   location ^~ /docs/ { return 404; }
   ```

   Production cố ý **không** dùng Basic Auth cho Swagger: `404` mạnh hơn password
   protection khi không có nhu cầu mở tài liệu API ra Internet. Vì vậy không cần
   `SWAGGER_DOCS_USERNAME`/`SWAGGER_DOCS_PASSWORD` ở Environment production.

5. Nếu certificate chưa tồn tại, xoá **toàn bộ block `listen 443`** lần đầu, chỉ giữ HTTP block
   cho Certbot ACME challenge.

Bật site và kiểm config trước reload:

```bash
ln -s /etc/nginx/sites-available/api.<domain> \
  /etc/nginx/sites-enabled/api.<domain>

nginx -t && systemctl reload nginx
```

Chỉ khi `nginx -t` thành công mới reload. Reload không làm rớt các website khác đang chạy.

Xin certificate:

```bash
certbot --nginx -d api.<domain>
certbot certificates
certbot renew --dry-run
```

Khi Certbot hỏi, chọn redirect HTTP sang HTTPS. Sau đó, nếu Certbot sinh block HTTPS tối giản,
chép lại block HTTPS production từ template để giữ proxy/security header rồi chạy lại:

```bash
nginx -t && systemctl reload nginx
```

Trước deploy Core lần đầu, lệnh dưới có thể trả `502 Bad Gateway`; điều đó chỉ có nghĩa Nginx/TLS
đã nhận domain nhưng Core chưa chạy:

```bash
curl -sI https://api.<domain>/health
```

---

## 4. GitHub Environment `production`

Vào **Settings → Environments → production**. Khai **Environment secrets**, không dùng
Repository secrets fallback:

| Secret | Giá trị |
| --- | --- |
| `SSH_HOST` | IP hoặc hostname server khách |
| `SSH_USER` | `deploy` hoặc user khách cấp |
| `SSH_PRIVATE_KEY` | private key CI riêng của server production |
| `SSH_PORT` | `22` — tuỳ chọn, workflow mặc định 22 |
| `DEPLOY_PATH` | `/home/deploy/chantam-production` |
| `HEALTH_URL` | `https://api.<domain>` — không kèm `/health` |

Environment Variable lúc setup:

```text
DEPLOY_ENABLED=false
```

Workflow kiểm fail-fast tên secret thiếu, và bắt `DEPLOY_PATH` production khớp chính xác:

```text
/home/deploy/chantam-production
```

Chỉ chuyển sang:

```text
DEPLOY_ENABLED=true
```

sau khi DNS, certificate và external `https://api.<domain>/health` đã gọi được.

Nếu GitHub plan hỗ trợ, cấu hình thêm `Required reviewers` và giới hạn deployment branch/tag
cho `v*`. Nếu không hỗ trợ, quy trình tag/release phải do người chịu trách nhiệm thực hiện thủ công.

---

## 5. Deploy production lần đầu

Đảm bảo local sạch và đúng `main`:

```powershell
cd "D:\works\freelancer_dev\true-heart"

git checkout main
git pull --ff-only origin main
git status
```

Tạo tag SemVer rồi push:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Tag `v*` chạy workflow Release:

```text
1. Build Core image từ đúng commit được tag
2. Push ghcr.io/fdshn/trueheart/core:v0.1.0
3. Push ghcr.io/fdshn/trueheart/core:latest
4. Push tag bất biến ghcr.io/fdshn/trueheart/core:sha-<commit>
5. SSH server production bằng user deploy
6. docker compose pull core
7. docker compose up -d --wait --wait-timeout 180
8. Core tự chạy TypeORM migration schema còn thiếu
9. GitHub gọi read-only smoke test qua HEALTH_URL
10. Nếu lỗi: pin lại SHA image trước đó, up --wait rollback
```

Lần đầu server tự pull ba image:

```text
ghcr.io/fdshn/trueheart/core:sha-<commit>
postgis/postgis:16-3.4
redis:7-alpine
```

Mỗi deploy sau workflow chỉ pull **Core**. Postgres/Redis/version/volume dữ liệu giữ nguyên;
migration schema chạy lúc Core khởi động khi cần. Không chạy `docker compose down -v` trên
production — `-v` xoá cả database/Redis volume.

---

## 6. Cloudflare R2 production

Production dùng bucket/key riêng, ví dụ `chantam-media`; staging key không được đọc/ghi bucket
này. Thêm sáu `STORAGE_*` vào `.env` production giống staging guide, nhưng dùng R2 production và
public domain `https://media.<domain>`. CORS chỉ whitelist origin frontend production.

## 7. Kiểm sau deploy

Trên server:

```bash
cd /home/deploy/chantam-production
docker compose ps
```

Kỳ vọng `postgres`, `redis`, `core` đều `healthy`.

Từ máy ngoài:

```bash
curl -s https://api.<domain>/health
curl -sI https://api.<domain>/docs
curl -sI https://api.<domain>/docs/json
```

Kỳ vọng:

```text
/health     → 200
/docs       → 404
/docs/json  → 404
```

Database không publish Internet. Nếu DBA cần DBeaver, dùng SSH tunnel như staging: VPS loopback
`127.0.0.1:15432` → container `postgres:5432`, cùng key/credential **production riêng**.

---

## 8. Rollback tay

Workflow tự rollback khi deploy/health gate lỗi. Chỉ dùng rollback tay khi cần quay lại bản cũ
có chủ đích:

```bash
cd /home/deploy/chantam-production
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/fdshn/trueheart/core:sha-<commit-cu>|' .env
docker compose pull core
docker compose up -d --wait --wait-timeout 180
```

Không rollback database bằng cách xoá volume. Migration production phải tương thích ngược; migration
phá dữ liệu cần backup + kế hoạch restore riêng trước release.
