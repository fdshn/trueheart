# Dữ liệu demo staging

Dữ liệu demo tồn tại để người xem staging có ngay tài khoản và bài đăng gần nhau trên bản đồ.
Nó **không phải migration schema** và không tự chạy lúc Core khởi động: production cũng dùng
`NODE_ENV=production` để tự chạy migration schema, nên trộn seed vào migration sẽ đưa tài khoản
demo lên server khách ở lần deploy đầu — không chấp nhận được.

## Nội dung seed

| Loại | Số lượng | Chi tiết |
| --- | --- | --- |
| User | 3 | Người tặng (GOLD), người nhận (MEMBER), kiểm duyệt (DIAMOND) |
| Gift post | 4 | 2 `PUBLISHED`, 1 `PENDING_REVIEW`, 1 `COMPLETED`; tập trung quanh Hà Nội |
| Session | 3 | Đã thu hồi/hết hạn; chỉ để minh hoạ bảng, không tạo phiên đăng nhập còn dùng được |

Tài khoản demo:

```text
demo-nguoi-tang
demo-nguoi-nhan
demo-kiem-duyet

Mật khẩu chung: Demo@12345
```

## Chạy tại máy local

```bash
cd suites/chantam.vn/chantam/core
npm run seed:demo
```

Cần Postgres local đang chạy tại `DATABASE_URI` trong `.env.local`.

## Chạy trên staging đã deploy

Image production đã prune devDependencies nên không có `ts-node`; dùng bản seed đã build trong
Core container:

```bash
ssh deploy@<staging-server>
cd /home/deploy/chantam-staging
docker compose exec core npm run seed:demo:built
```

Chỉ chạy khi URL staging, username demo và password demo được phép công khai cho người thử.
Không chạy lệnh này ở production.

## An toàn và chạy lại

- Lệnh yêu cầu `SEED_DEMO_DATA=true` do script npm tự truyền. Chạy file CLI trần sẽ bị từ chối.
- Upsert theo `global_id` cố định nên chạy lại chỉ cập nhật record demo, không nhân đôi.
- Không `TRUNCATE`, không `DELETE`, không chạm bảng PostGIS `tiger`, `topology`,
  `spatial_ref_sys`.
- Mật khẩu demo được bcrypt hash lúc seed, chỉ chuỗi `Demo@12345` được ghi ở tài liệu này.

## Dọn dữ liệu demo

Dọn theo UUID cố định, không dùng username mơ hồ. Trên staging:

```bash
cd /home/deploy/chantam-staging
docker compose exec postgres psql -U chantam -d chantam
```

```sql
DELETE FROM user_sessions
WHERE user_id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

DELETE FROM gift_posts
WHERE global_id IN (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004'
);

DELETE FROM users
WHERE global_id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);
```

Nếu account demo đã tham gia dữ liệu nghiệp vụ mới ở milestone sau, dừng lại và xem foreign key
trước khi xóa; không tắt constraint để xóa cho xong.
