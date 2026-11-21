# Implement: tách staging/production theo nhánh và dựng server production

Ngày: 20/11/2026. Thay cho bản nháp cùng tên (chưa commit) ở working tree `main`.

## Mục tiêu

| Nhánh | Môi trường | Kích hoạt |
| --- | --- | --- |
| `develop` | Staging (`/home/deploy/chantam-staging`, port 8080) | push/merge vào `develop`, hoặc chạy Release tay |
| `main` | Production (`/home/deploy/chantam-production`, port 8085, server riêng) | push/merge vào `main`, hoặc chạy Release tay **trên `main`** |

Tag `v*` không deploy nữa.

## Ràng buộc: có session khác đang làm trên `main` local

- Working tree `D:\works\freelancer_dev\true-heart` (nhánh `main`) có 4 commit chưa push
  (`7a6199e7..8aaf2214`, loại tiếp nhận + điều kiện gửi duyệt) và nhiều file đang sửa.
- **Không đụng working tree đó.** Mọi việc của plan này làm ở worktree
  `D:\works\freelancer_dev\true-heart-deploy` (nhánh `chore/branch-based-deploy`) hoặc trên remote.
- Không merge gì vào `origin/main` cho tới khi session kia đã đẩy việc của nó lên (xem Bước 3).

## Trạng thái hiện tại

| Việc | Trạng thái |
| --- | --- |
| Sửa `release.yaml`, `ci.yaml` + tài liệu (commit `chore/branch-based-deploy`) | ✅ xong, PR #56 → `develop`, đang chờ CI |
| Fast-forward `origin/develop` `101823da → 17f7463d` (= `origin/main`) | ✅ xong |
| `DEPLOY_ENABLED` production | `false` (giữ nguyên) |
| Merge PR #56, PR `develop → main` | ⏳ chưa |
| Dựng server production | ⏳ chờ thông tin server |

### Nội dung PR #56

- `release.yaml`
  - `on.push.branches: [main, develop]`, bỏ `tags: ['v*']`, giữ `workflow_dispatch`.
  - Tag image: `main` → `:latest,:sha-<7>`; nhánh khác → `:staging,:sha-<7>`. `primary` luôn `sha-*`.
  - Job `staging`: `(push && ref == develop) || (dispatch && staging)`.
  - Job `production`: `ref == main && (push || inputs.environment == 'production')` — chạy tay
    production từ nhánh khác bị bỏ qua.
- `ci.yaml`: `push.branches: [main, develop]`.
- Docs: `deploy/README.md` (bảng + quy trình nhánh), `deploy/STAGING.md`, `deploy/PRODUCTION.md`
  (§1 mô tả, §4 deployment branch = `main`, §5 viết lại: deploy lần đầu = PR `develop → main`),
  `README.md`, `docs/ARCHITECTURE.md`.

## Bước 1 — Đưa workflow mới vào `develop`

1. Chờ CI PR #56 xanh (`gh pr checks 56`).
2. `gh pr merge 56 --merge` → push `develop` chạy Release → build `:staging` + deploy staging.
3. Kiểm: run Release xanh, job Staging chạy, job Production `skipped`;
   `curl -s https://api-staging.<domain>/health` = 200.

## Bước 2 — Thiết lập GitHub

1. Branch protection `develop`: cấm force-push, cấm xoá (giống `main`, không bắt buộc approval).
2. Environment `production` → Deployment branches: chỉ `main`.
   Environment `staging` → Deployment branches: `develop` (+ cho phép chạy tay nếu cần thử nhánh khác
   thì để "All branches").
3. (Tuỳ chọn) default branch = `develop` để PR mới mặc định nhắm `develop`.

## Bước 3 — Phối hợp với session đang làm trên `main`

Sau Bước 1, việc mới phải vào `develop`. Session kia khi xong:

```powershell
git push origin main:feat/campaign-intake-distribution   # đẩy thành nhánh feature, KHÔNG push main
gh pr create --base develop --head feat/campaign-intake-distribution
```

Base của nó là `17f7463d` = `origin/develop` hiện tại, nên không xung đột. Sau đó local `main`
reset về `origin/main` (chỉ khi đã chắc commit nằm trên remote).

## Bước 4 — Đưa workflow mới vào `main`

1. PR `develop → main` (gồm PR #56 và, nếu đã xong, việc của session kia).
2. Merge → Release chạy trên `main`: build `:latest`, job Production chạy nhưng dừng ở cổng
   `DEPLOY_ENABLED=false` (notice "chưa bật deploy"). Không job Staging.
3. Từ đây: push `main` = deploy production (khi đã bật).

## Bước 5 — Dựng server production (theo `deploy/PRODUCTION.md`)

Giữ `DEPLOY_ENABLED=false` suốt bước này.

Cần người dùng cung cấp:

1. IP/hostname, user SSH, port (máy này SSH được sẵn — thêm `Host` vào `~/.ssh/config`).
2. Domain API production (vd. `api.chantam.vn`), DNS A record đã trỏ về server.
3. Server có Nginx/website khác không (để không giẫm 80/443).
4. R2 production: bucket, key, public domain (6 biến `STORAGE_*`).
5. `WEB_PUBLIC_BASE_URL` production; Firebase service account production (tuỳ chọn).

Các bước:

1. Kiểm server: OS, RAM/đĩa, `ss -ltnp | grep -E ':(80|443)'`, firewall 80/443.
2. `scp deploy/docker-compose.yml deploy/init.sql deploy/bootstrap.sh` → `/tmp/`; chuẩn hoá CRLF
   (`sed -i 's/\r$//'`); `sudo bash /tmp/bootstrap.sh production api.<domain> api-staging.<domain>`.
3. `.env`: `CORE_PORT=8085`, secret ngẫu nhiên riêng (không copy staging), `TRUST_PROXY=true`;
   điền tay `WEB_PUBLIC_BASE_URL`, `STORAGE_*`, `FCM_SERVICE_ACCOUNT_BASE64`.
4. SSH key CI mới: `gh secret set SSH_PRIVATE_KEY --env production < key` (đọc từ file, không in
   ra chat/log), rồi `shred -u` key trên server.
5. Ghi đè secret Environment `production`: `SSH_HOST`, `SSH_USER`, `SSH_PORT`,
   `DEPLOY_PATH=/home/deploy/chantam-production`, `HEALTH_URL=https://api.<domain>` (không kèm `/health`).
6. Nginx: `chantam-ratelimit.conf` + vhost production (2 block production, `/docs*` 404,
   `proxy_pass http://127.0.0.1:8085`); `nginx -t && systemctl reload nginx`; `certbot --nginx -d api.<domain>`.
7. Cron production theo `deploy/cron/README.md`.
8. Backup database: `pg_dump` định kỳ + thử restore một lần.

## Bước 6 — Deploy production lần đầu

1. `curl -sI https://api.<domain>/health` trả 502 (Nginx/TLS ổn, Core chưa chạy).
2. `gh variable set DEPLOY_ENABLED --env production --body true`.
3. Actions → Release → Run workflow trên `main`, chọn `production`.
4. Kiểm: workflow xanh; `docker compose ps` 3 service healthy; `/health` 200; `/docs`, `/docs/json` 404.
5. Ghi lại image `sha-*` đang chạy để rollback tay.

## Rủi ro

- Sau Bước 4, mọi push `main` là deploy production → không commit việc dở lên `main`.
- Giữa Bước 1 và Bước 4, `main` vẫn chạy workflow cũ: push `main` vẫn deploy **staging** (cả
  `develop` và `main` cùng đẩy lên staging, ai sau thắng). Nên làm Bước 4 sớm sau Bước 1.
- Đổi `JWT_SECRET`/`CONFIG_ENCRYPTION_KEY`/`PHONE_HASH_PEPPER` sau khi có dữ liệu là mất dữ liệu — đặt một lần.
