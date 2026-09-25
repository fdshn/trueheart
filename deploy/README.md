# Triển khai Chân Tâm

Docker Compose chạy Core, Postgres/PostGIS và Redis; **host Nginx + Certbot** là lớp duy nhất
nghe Internet ở cổng 80/443. Core chỉ bind loopback, không phơi trực tiếp Node/Postgres/Redis.

```text
Internet HTTPS → host Nginx → 127.0.0.1:8080 (staging Core)
                         └→ 127.0.0.1:8085 (production Core)
```

| Môi trường | Khi nào deploy | Stack | Hướng dẫn |
| --- | --- | --- | --- |
| Staging | Push `main` hoặc chạy Release tay | `/home/deploy/chantam-staging`, port 8080 | [STAGING.md](./STAGING.md) |
| Production | Push tag `v*` | `/home/deploy/chantam-production`, port 8085 | [PRODUCTION.md](./PRODUCTION.md) |

Hai stack độc lập: project Compose, database, Redis, volume, network, `.env`, password database
và `JWT_SECRET` riêng. Chúng có thể cùng chạy trên một VPS dev, nhưng chung CPU/RAM/đĩa; khi
có người dùng thật, production nên chuyển sang server khách riêng.

## File deploy

| File | Vai trò |
| --- | --- |
| `docker-compose.yml` | Stack ứng dụng; Core chỉ bind 127.0.0.1 |
| `init.sql` | Tạo PostGIS, unaccent và pg_trgm lúc Postgres init volume trống |
| `bootstrap.sh` | Cài Docker (nếu thiếu), tạo stack `.env` và SSH key CI theo từng môi trường |
| `nginx/chantam.conf.example` | Template hai vhost để host admin cài vào Nginx hiện hữu; staging Basic Auth Swagger, production 404 docs |
| `STAGING.md` | Runbook dựng, deploy và kiểm staging |
| `PRODUCTION.md` | Runbook server khách, release tag và rollback production |

## Bất biến vận hành

- Không chạy proxy Docker thứ hai cạnh host Nginx: một máy chỉ có một dịch vụ nghe 80/443.
- Luôn chạy `sudo nginx -t` **trước** `sudo systemctl reload nginx`.
- DNS + TLS phải xanh trước khi `DEPLOY_ENABLED=true`: GitHub gọi `HEALTH_URL` từ Internet sau
  mỗi deploy; không gọi được thì workflow rollback.
- Swagger staging dùng HTTP Basic Auth tại host Nginx; password hash nằm ngoài repo. Production ẩn `/docs*` bằng 404.
- Không tự sửa `.env` server ngoài `IMAGE=` do workflow quản lý. Bootstrap giữ nguyên `.env`
  có sẵn để chạy lại không làm mất bí mật.
- Không chạy `docker compose down -v` trên môi trường có dữ liệu: lệnh xoá database/Redis volume.

## Lịch job nền

Xem [`cron/README.md`](./cron/README.md) — crontab, wrapper, logrotate và runbook cho chín
CLI chạy một lần. Core cố ý không dựng scheduler nào trong tiến trình.
