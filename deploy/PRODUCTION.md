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

bash /tmp/bootstrap.sh production api.<domain> api-staging.<domain>
```

Tham số thứ hai là hostname công khai, dùng làm mục **Servers** ĐẦU TIÊN của Swagger
trên chính server này (`API_SERVERS`), nên `Try it out` mặc định gọi production. Tham số thứ
ba (tuỳ chọn) là hostname staging: có nó thì Swagger liệt kê cả hai, môi trường hiện tại đứng
đầu (chủ dự án yêu cầu 01/11). Token không dùng chéo được vì `JWT_SECRET` mỗi bên khác nhau.
Host đã có `.env` thì sửa tay
`API_SERVERS=Production=https://api.<domain>,Staging=https://api-staging.<domain>`.
Lưu ý: Nginx production chặn `/docs` (mục 3), nên danh sách này chỉ hiện ra khi mở Swagger
production; Swagger **staging** mới là nơi người ta thấy mục Production.

Bootstrap tự làm:

- cài Docker Engine/Compose nếu chưa có;
- tạo user `deploy`, thêm vào group `docker`;
- tạo `/home/deploy/chantam-production`;
- chép `docker-compose.yml` và `init.sql`;
- sinh `.env` với `POSTGRES_PASSWORD`, `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, `PHONE_HASH_PEPPER`
  và `ATTRIBUTION_SIGNING_KEYS` ngẫu nhiên, đặt `TRUST_PROXY=true`;
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

### Host dựng trước đó phải thêm biến bằng tay

`bootstrap.sh` cố ý **không ghi đè** `.env` đã tồn tại, nên một host dựng trước sẽ không nhận
các biến thêm sau này (ba biến 05/10, `ATTRIBUTION_SIGNING_KEYS` 01/11). Thiếu đều hỏng
**im lặng** — không có gì đỏ lúc khởi động:

```bash
cd /home/deploy/chantam-production
grep -qE '^TRUST_PROXY=' .env || echo 'TRUST_PROXY=true' >> .env
grep -qE '^CONFIG_ENCRYPTION_KEY=' .env ||
  echo "CONFIG_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
grep -qE '^PHONE_HASH_PEPPER=' .env ||
  echo "PHONE_HASH_PEPPER=$(openssl rand -base64 32)" >> .env
grep -qE '^ATTRIBUTION_SIGNING_KEYS=' .env ||
  echo "ATTRIBUTION_SIGNING_KEYS=k$(date +%Y%m):$(openssl genpkey -algorithm ed25519 | base64 -w0)" >> .env
grep -q 'ATTRIBUTION_SIGNING_KEYS' docker-compose.yml ||
  echo 'docker-compose.yml cũ: chép lại deploy/docker-compose.yml mới lên server trước' >&2
docker compose up -d core
```

| Thiếu | Hậu quả |
| --- | --- |
| `TRUST_PROXY` | Mọi request mang IP của Nginx, nên trần gọi chung và trần đăng nhập/đăng ký theo IP dồn vào **một xô**: một người lụt là cả hệ bị 429 |
| `CONFIG_ENCRYPTION_KEY` | Admin bấm lưu cấu hình SMTP/Zalo và nó fail closed. Lỗi chỉ hiện khi có người thử lưu |
| `PHONE_HASH_PEPPER` | Vẫn băm số điện thoại nhưng **không có khoá**, và chống trùng vẫn chạy nên không ai thấy gì. Không gian số VN đủ nhỏ để kẻ đọc được database dò ngược hết bảng băm |
| `ATTRIBUTION_SIGNING_KEYS` | `/attribution/*` trả `ATTRIBUTION_NOT_CONFIGURED`: link giới thiệu không sống sót qua bước cài app |

**Đặt hai khoá kia MỘT LẦN rồi đừng đổi.** Đổi `CONFIG_ENCRYPTION_KEY` là không giải mã được
secret Admin đã lưu; đổi `PHONE_HASH_PEPPER` là mọi băm cũ không khớp nữa, nên chống trùng mất
sạch lịch sử.

**`ATTRIBUTION_SIGNING_KEYS` thì xoay được, nhưng theo thứ tự:** thêm khoá mới lên ĐẦU danh sách
(`kid:base64(PEM)`, ngăn bằng dấu phẩy — khoá đầu dùng để ký), giữ khoá cũ **ít nhất 14 ngày**
(token sống 14 ngày) rồi mới bỏ. Bỏ sớm là link đã phát chết.

Workflow deploy **không** đồng bộ `docker-compose.yml` lên server — nó chỉ ghi `IMAGE` vào `.env`
rồi `docker compose up`. Compose trên server phải là bản có dòng
`ATTRIBUTION_SIGNING_KEYS: ${ATTRIBUTION_SIGNING_KEYS:-}`; không thì biến nằm trong `.env` mà
không vào container. Chép lại `deploy/docker-compose.yml` khi nó đổi.

### Biến điền tay trong `.env`

| Biến | Đặt thế nào |
| --- | --- |
| `WEB_PUBLIC_BASE_URL` | Gốc **web công khai/landing**, vd. `https://chantam.vn` — **không bao giờ** là trang admin. Nó dựng link chia sẻ `/p/{shareCode}`, `/posts/{id}`, `/u/{username}`, `/invite/{code}`, `/a/{code}`, `/dl?t=`. Trống thì API trả link `null` |
| `FCM_SERVICE_ACCOUNT_BASE64` | `base64 -w0 service-account.json` của dự án Firebase production. Trống thì push fail-closed, thông báo trong app vẫn chạy |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | Trần gọi chung theo IP, mặc định 600 (kẹp 60–100.000). Chỉ đổi khi đo được lý do |

Toàn bộ biến: [`docs/CONFIG-INVENTORY.md`](../docs/CONFIG-INVENTORY.md) §1.

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
scp deploy/nginx/chantam-ratelimit.conf.example `
  root@<IP-SERVER-PRODUCTION>:/tmp/chantam-ratelimit.conf.example
```

> **File thứ hai là BẮT BUỘC.** vhost dùng các zone chặn tốc độ và biến
> `$connection_upgrade`, mà `limit_req_zone`/`limit_conn_zone`/`map` chỉ hợp lệ ở
> ngữ cảnh `http{}`. Thiếu nó thì `nginx -t` đỏ và Nginx không reload.

Trên server root:

```bash
cp /tmp/chantam-ratelimit.conf.example /etc/nginx/conf.d/chantam-ratelimit.conf
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
