# Triển khai

Hướng dẫn dựng server và cấu hình GitHub để pipeline CD chạy được.

Cho tới khi bạn làm xong phần này, workflow deploy **tự bỏ qua** và pipeline vẫn xanh —
không cần comment workflow ra hay sửa gì.

---

## 1. Chuẩn bị server

Yêu cầu: Ubuntu 22.04+ (hoặc tương đương), Docker Engine 24+ kèm plugin Compose v2.17+
(cần cho cờ `--wait-timeout`).

### Cách nhanh: chạy `bootstrap.sh`

```bash
scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh root@<server>:/tmp/
ssh root@<server> 'bash /tmp/bootstrap.sh'
```

Script cài Docker nếu thiếu, tạo user `deploy`, chép hai file cấu hình, **sinh `.env` với
mật khẩu database và `JWT_SECRET` ngẫu nhiên**, sinh cặp khoá SSH cho CI rồi in khoá riêng
ra một lần. Chạy lại nhiều lần được — `.env` đã có thì giữ nguyên.

Sinh bí mật bằng máy thay vì gõ tay là có lý do: mật khẩu người tự nghĩ thường yếu, hoặc
trùng luôn với mật khẩu môi trường dev.

### Cách thủ công

```bash
# Tài khoản riêng cho việc triển khai — không dùng root
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy

sudo -u deploy mkdir -p /home/deploy/chantam
```

Chép ba file vào `/home/deploy/chantam/`:

| File | Nguồn |
| --- | --- |
| `docker-compose.yml` | `deploy/docker-compose.yml` của repo |
| `init.sql` | `deploy/init.sql` — tạo extension PostGIS lúc initdb |
| `.env` | chép từ `deploy/.env.example` rồi điền giá trị thật |

```bash
sudo -u deploy nano /home/deploy/chantam/.env
sudo -u deploy chmod 600 /home/deploy/chantam/.env
```

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
vào secret `SSH_KEY` ở bước sau. Xoá file khỏi máy sau khi dán xong.

---

## 3. Cấu hình GitHub Environments

Vào **Settings → Environments**, tạo hai môi trường: `staging` và `production`.

### Secrets (khai riêng cho từng môi trường)

| Tên | Ví dụ | Ghi chú |
| --- | --- | --- |
| `SSH_HOST` | `103.x.x.x` | IP hoặc tên miền của server |
| `SSH_USER` | `deploy` | |
| `SSH_PORT` | `22` | bỏ trống thì mặc định 22 |
| `SSH_KEY` | `-----BEGIN OPENSSH...` | khoá riêng sinh ở bước 2 |
| `DEPLOY_PATH` | `/home/deploy/chantam` | thư mục chứa docker-compose.yml |
| `HEALTH_URL` | `https://api.chantam.vn` | URL công khai để kiểm tra sau triển khai |

### Variables

| Tên | Giá trị | Ghi chú |
| --- | --- | --- |
| `DEPLOY_ENABLED` | `true` | **Công tắc chính.** Chưa đặt thì job deploy bỏ qua |

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
| Reverse proxy + TLS (Caddy hoặc nginx) | Làm tay. Trỏ về `127.0.0.1:3000` |
| Backup database định kỳ | Làm tay. `pg_dump` theo cron, đẩy lên Cloudflare R2 |
| Giám sát và cảnh báo | Làm tay. Uptime Kuma trỏ vào `/health` là đủ cho giai đoạn đầu |
| Cập nhật image Postgres/Redis | Nửa tự động. Dependabot mở PR đổi tag hằng tuần, người duyệt và merge; deploy mới áp dụng |
| Nhà cung cấp OTP (email/SMS/Zalo ZNS) | **Chưa có trong hợp đồng.** Quên mật khẩu tự tắt ở production, trả về kênh `ADMIN_SUPPORT` |

Migration TypeORM **đã xong**: `migrationsRun` bật khi `NODE_ENV=production`, nên container
tự dựng bảng lúc khởi động. Không cần thao tác tay.
