# Triển khai

Hướng dẫn dựng server và cấu hình GitHub để pipeline CD chạy được.

Cho tới khi bạn làm xong phần này, workflow deploy **tự bỏ qua** và pipeline vẫn xanh —
không cần comment workflow ra hay sửa gì.

---

## 1. Chuẩn bị server

Yêu cầu: Ubuntu 22.04+ (hoặc tương đương), Docker Engine 24+ kèm plugin Compose v2.17+
(cần cho cờ `--wait-timeout`).

### Bố cục trên máy

Staging và production chạy trên cùng một máy nhưng là **hai stack hoàn toàn tách nhau**:

```
/home/deploy/chantam-staging      cổng 127.0.0.1:3000
/home/deploy/chantam-production   cổng 127.0.0.1:3001
/home/deploy/caddy                reverse proxy dùng chung, cổng 80/443
```

Mỗi stack có database, Redis, volume, network và bí mật riêng. Tên project của Compose lấy
theo tên thư mục nên Docker tự tách mọi thứ.

> **Đánh đổi đã biết:** chung CPU, RAM và ổ đĩa. Một lần kiểm thử tải ở staging có thể làm
> chậm production. Chấp nhận được ở giai đoạn đầu; tách máy khi có người dùng thật.

### Chạy `bootstrap.sh` — mỗi môi trường một lần

```bash
scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh root@<server>:/tmp/

ssh root@<server> 'bash /tmp/bootstrap.sh staging'
ssh root@<server> 'bash /tmp/bootstrap.sh production'
```

Script cài Docker nếu thiếu, tạo user `deploy`, chép file cấu hình, **sinh `.env` với mật
khẩu database và `JWT_SECRET` ngẫu nhiên RIÊNG cho từng môi trường**, sinh cặp khoá SSH cho
CI (một lần, dùng chung) rồi in khoá riêng ra. Chạy lại nhiều lần được — `.env` đã có thì
giữ nguyên.

Sinh bí mật bằng máy thay vì gõ tay là có lý do: mật khẩu người tự nghĩ thường yếu, hoặc
trùng luôn với môi trường khác. Và **`JWT_SECRET` của hai môi trường bắt buộc phải khác
nhau** — dùng chung thì token cấp ở staging gọi được production, mà staging thì ai cũng tự
đăng ký tài khoản được.

### Reverse proxy — bắt buộc, làm sau bootstrap

Mỗi stack chỉ bind `127.0.0.1`, nên chưa có proxy thì API không ra được Internet. Quan
trọng hơn: **cổng kiểm tra sau deploy chạy trên máy của GitHub** và gọi vào `HEALTH_URL`,
nên thiếu proxy là mọi lần deploy đều đỏ ở bước cuối.

Tên miền phải **đã trỏ A record** về máy này trước khi chạy — Caddy xin chứng chỉ ngay lúc
khởi động, và Let's Encrypt giới hạn số lần thất bại.

```bash
ssh root@<server> 'install -d -o deploy -g deploy /home/deploy/caddy'
scp deploy/caddy/* root@<server>:/home/deploy/caddy/

ssh root@<server>
cd /home/deploy/caddy
cp .env.example .env && nano .env      # điền tên miền thật
docker compose up -d
docker compose logs -f caddy           # xem nó xin chứng chỉ
```

Caddy tự xin và tự gia hạn chứng chỉ Let's Encrypt, tự bật chuyển hướng HTTP→HTTPS. Nó chạy
`network_mode: host` để với được tới `127.0.0.1:3000` và `:3001` — nhờ vậy hai môi trường
giữ được mạng Docker riêng thay vì phải nối chung một network chỉ để proxy đi qua.

Cấu hình sẵn **chặn `/docs` ở production**: tài liệu API phơi toàn bộ hình dạng endpoint và
mã lỗi, ở staging thì tiện còn ở production thì chỉ giúp người dò. Bỏ khối `@docs` trong
`Caddyfile` nếu Bên A muốn mở công khai.

> Volume `caddy-data` giữ chứng chỉ. **Mất nó là mất chứng chỉ**, mà Let's Encrypt giới hạn
> 5 lần cấp lại mỗi tuần cho cùng một tên miền.

### Cách thủ công

Làm hai lần, thay `<env>` bằng `staging` rồi `production`.

```bash
# Tài khoản riêng cho việc triển khai — không dùng root
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy

sudo -u deploy mkdir -p /home/deploy/chantam-<env>
```

Chép ba file vào `/home/deploy/chantam-<env>/`:

| File | Nguồn |
| --- | --- |
| `docker-compose.yml` | `deploy/docker-compose.yml` của repo |
| `init.sql` | `deploy/init.sql` — tạo extension PostGIS lúc initdb |
| `.env` | chép từ `deploy/.env.example` rồi điền giá trị thật |

```bash
sudo -u deploy nano /home/deploy/chantam-<env>/.env
sudo -u deploy chmod 600 /home/deploy/chantam-<env>/.env
```

Đặt `CORE_PORT=3000` cho staging và `3001` cho production, và **`JWT_SECRET` khác nhau**.

> `init.sql` chỉ chạy **một lần duy nhất** khi volume dữ liệu còn trống. Nếu bạn khởi động
> Postgres trước rồi mới thêm file, extension sẽ không được tạo và service sẽ chết khi
> TypeORM gặp kiểu `geography`. Trường hợp đó: `docker compose down -v` rồi dựng lại — thao
> tác này **xoá sạch dữ liệu**, chỉ làm khi server còn trống.

---

## 2. Khoá SSH cho việc triển khai

Sinh một cặp khoá **riêng cho CI**, không dùng lại khoá cá nhân:

```bash
ssh-keygen -t ed25519 -C 'github-actions-chantam' -f ./chantam_deploy -N ''

# Khoá công khai đưa lên server
ssh-copy-id -i ./chantam_deploy.pub deploy@<địa-chỉ-server>
```

Nội dung `chantam_deploy` (khoá riêng, **toàn bộ file kể cả dòng BEGIN/END**) sẽ được dán
vào secret `SSH_PRIVATE_KEY` ở bước sau. Xoá file khỏi máy sau khi dán xong.

---

## 3. Cấu hình GitHub Environments

Vào **Settings → Environments**, tạo hai môi trường: `staging` và `production`.

### Secrets — **mỗi environment giữ trọn một bộ riêng**

Khai **cùng sáu tên** dưới đây trong cả `staging` lẫn `production`. Workflow không dùng
Repository secrets làm fallback: mọi credential được lấy từ environment mà job đang deploy.
Nhờ vậy production không thể SSH nhầm vào server staging khi sau này chuyển sang máy khách.

| Tên | `staging` hiện tại | `production` khi khách cấp server thật |
| --- | --- | --- |
| `SSH_HOST` | IP / hostname server dev | IP / hostname server khách |
| `SSH_USER` | `deploy` | `deploy` (hoặc user khách cấp) |
| `SSH_PORT` | `22` — có thể bỏ trống, workflow tự mặc định 22 | tương tự |
| `SSH_PRIVATE_KEY` | Khoá private có public key trong `/home/deploy/.ssh/authorized_keys` server dev | Khoá CI riêng của server khách, **không dùng lại** khoá staging |
| `DEPLOY_PATH` | `/home/deploy/chantam-staging` | `/home/deploy/chantam-production` |
| `HEALTH_URL` | `https://api-staging.chantam.vn` | `https://api.chantam.vn` |

> **Thứ tự chuyển đổi an toàn:** chép ba SSH secret hiện tại vào environment `staging`, tạo
> đủ sáu secret placeholder/thật ở `production`, rồi mới xoá `SSH_HOST`, `SSH_USER`,
> `SSH_PRIVATE_KEY` cấp Repository. Workflow có chốt fail-fast: bật deploy mà thiếu một trong
> `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`, `HEALTH_URL` thì dừng ngay và nêu
> **tên** secret thiếu, không in giá trị ra log.

### Variables

| Tên | `staging` | `production` hiện tại | Ghi chú |
| --- | --- | --- | --- |
| `DEPLOY_ENABLED` | `true` | `false` | Công tắc chính. Chỉ đúng `true` mới thực sự SSH/deploy. |

Giữ `production` là `false` cho tới khi server khách có bootstrap + nginx/TLS/DNS xanh. Khi
đó đổi thành `true`; tag `v*` tiếp theo mới deploy production.

### Bảo vệ môi trường `production`

Đây là phần **không khai được bằng file cấu hình** — phải bấm trong giao diện web:

1. **Required reviewers** — chọn ít nhất một người. Không có bước này thì mọi tag `v*`
   đi thẳng ra production không qua ai duyệt.
2. **Deployment branches and tags** — giới hạn ở `v*` để nhánh linh tinh không deploy được.

---

## 4. Cách kích hoạt triển khai

| Hành động | Kết quả |
| --- | --- |
| Push vào `main`/`master` | Build image, đẩy GHCR, deploy **staging** |
| Gắn tag `v1.2.3` và push | Build image, đẩy GHCR, deploy **production** sau khi có người duyệt |
| Chạy tay workflow `Release` | Chọn môi trường trong danh sách |

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Image được deploy luôn mang tag `sha-<commit>` chứ không phải `staging` hay `latest`. Tag di
động không cho biết chắc server đang chạy commit nào, và làm rollback trở nên vô nghĩa.

---

## 5. Quyền kéo image từ GHCR

Bước triển khai tự `docker login ghcr.io` bằng `GITHUB_TOKEN` của lượt chạy, nên **không cần
khai thêm secret nào**. Token này hết hạn khi workflow kết thúc — server không giữ lại
credential dài hạn.

Nếu bạn muốn kéo image bằng tay trên server, tạo một Personal Access Token có quyền
`read:packages` và đăng nhập riêng.

---

## 6. Rollback

Tự động: nếu bước triển khai hoặc cổng kiểm tra sau triển khai thất bại, workflow ghim lại
image trước đó, `up -d` lại, rồi mới báo job đỏ.

Bằng tay:

```bash
ssh deploy@<server>
cd /home/deploy/chantam
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/fdshn/trueheart/core:sha-<commit-cũ>|' .env
docker compose up -d --wait
```

---

## 7. Việc chưa được tự động hoá

| Việc | Trạng thái |
| --- | --- |
| Reverse proxy + TLS | **Đã có.** `deploy/caddy/` — Caddy tự xin và gia hạn Let's Encrypt |
| Backup database định kỳ | Làm tay. `pg_dump` theo cron, đẩy lên Cloudflare R2. **Càng cần hơn khi hai môi trường chung một ổ đĩa** |
| Tách staging khỏi production | Chưa. Chung máy nên chung CPU/RAM/ổ đĩa — tách máy khi có người dùng thật |
| Giám sát và cảnh báo | Làm tay. Uptime Kuma trỏ vào `/health` là đủ cho giai đoạn đầu |
| Cập nhật image Postgres/Redis | Nửa tự động. Dependabot mở PR đổi tag hằng tuần, người duyệt và merge; deploy mới áp dụng |
| Nhà cung cấp OTP (email/SMS/Zalo ZNS) | **Chưa có trong hợp đồng.** Quên mật khẩu tự tắt ở production, trả về kênh `ADMIN_SUPPORT` |

Migration TypeORM **đã xong**: `migrationsRun` bật khi `NODE_ENV=production`, nên container
tự dựng bảng lúc khởi động. Không cần thao tác tay.
