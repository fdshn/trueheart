# `@chantam.vn/chantam.core`

Service lõi của nền tảng Chân Tâm. Đây cũng là **mẫu tham chiếu** cho mọi service khác
trong monorepo — resource `gift-post` đi trọn vẹn ba lớp của Clean Architecture.

## Chạy

```bash
cp .env.example .env.local
npm run dev
```

Cần PostgreSQL có PostGIS và Redis đang chạy (`docker compose up -d` ở gốc monorepo).

| Địa chỉ | Nội dung |
| --- | --- |
| `GET /health` | Trạng thái service + một truy vấn `SELECT 1` thật tới database |
| `GET /docs` | Swagger UI |
| `GET /docs/json` | Đặc tả OpenAPI |

## Endpoint

| Method | Đường dẫn | Use case |
| --- | --- | --- |
| `POST` | `/api/gift-posts` | `CreateGiftPostUseCase` |
| `GET` | `/api/gift-posts/nearby` | `GetNearbyGiftPostsUseCase` — truy vấn PostGIS |
| `GET` | `/api/gift-posts/:giftPostId` | `GetGiftPostUseCase` |
| `PATCH` | `/api/gift-posts/:giftPostId` | `UpdateGiftPostUseCase` |
| `DELETE` | `/api/gift-posts/:giftPostId` | `DeleteGiftPostUseCase` — xoá mềm |
| `POST` | `/api/posts` | `CreatePostUseCase` — canonical OFFER, JWT/profile/category/quota gate |
| `PATCH` | `/api/posts/:postId/moderation` | `ModeratePostUseCase` — allowlist `POST_OPERATOR_USERNAMES` tạm thời |
| `GET` | `/api/posts/map` | `GetPostMapUseCase` — marker bbox public, location jitter, client-side cluster |
| `GET` | `/api/posts/:postId` | `GetPostUseCase` — chỉ PUBLISHED/RESERVED, toạ độ đã jitter |

> Thứ tự khai báo route quan trọng: `@Get('nearby')` phải đứng **trước**
> `@Get(':giftPostId')`, nếu không Fastify sẽ khớp `nearby` thành một UUID và trả lỗi validate.

## Ví dụ

```bash
# Đăng bài
curl -X POST http://localhost:3000/api/gift-posts \
  -H 'Content-Type: application/json' \
  -d '{ "giftPost": {
        "title": "Xe đạp cũ còn dùng tốt",
        "description": "Xe đạp địa hình, phanh còn tốt, cần thay yên.",
        "category": "VEHICLE", "condition": "USED",
        "estimatedValue": 1500000,
        "location": { "lat": 10.7724, "lng": 106.698 },
        "areaLabel": "Quận 1, TP.HCM",
        "giverId": "9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b" } }'

# Quanh đây — sắp xếp gần → xa
curl "http://localhost:3000/api/gift-posts/nearby?lat=10.7724&lng=106.698&radiusMeters=5000"
```

> `giverId` phải là UUID hợp lệ theo chuẩn RFC (nibble variant là `8`/`9`/`a`/`b`).
> Chuỗi kiểu `22222222-2222-...` bị `@IsUUID()` từ chối.

## Canonical posts M2.1

`/api/posts` là API canonical mới. Trong compatibility window, `/api/gift-posts` vẫn tồn tại cho
client cũ, nhưng không được mở rộng thành source ghi thứ hai. `POST /api/posts` chỉ tạo `OFFER` ở
`PENDING_REVIEW`; author/type/status do server quyết định. Operator tạm thời cấu hình bằng
`POST_OPERATOR_USERNAMES` mới được gọi moderation sang `PUBLISHED` hoặc `REJECTED`.

Public detail chỉ nhìn thấy `PUBLISHED`/`RESERVED` và luôn nhận toạ độ đã jitter. Không dùng route
public để lấy location thật.

Bài đăng mới tạo ở trạng thái `PENDING_REVIEW` (đặc tả mục 3.2: mọi bài phải qua kiểm
duyệt), nên **chưa xuất hiện trong `/nearby`**. Chuyển sang `PUBLISHED` để kiểm thử:

```bash
curl -X PATCH http://localhost:3000/api/gift-posts/<globalId> \
  -H 'Content-Type: application/json' \
  -d '{ "giftPost": { "status": "PUBLISHED" } }'
```

## Cấu trúc

```
src/
├── domain/                 Không phụ thuộc gì bên ngoài
│   ├── ports/config/       IConfig
│   ├── ports/repository/   IGiftPostRepository (+ findNearby)
│   ├── exceptions/         Exception nghiệp vụ
│   └── consts/
├── application/            Use case — không biết HTTP, không biết TypeORM
│   ├── contracts/gift-post/
│   └── implementations/gift-post/   + .spec.ts cạnh mỗi use case
└── infrastructure/         Mọi thứ chạm ra ngoài
    ├── config/ persistence/ entity/ repository/
    └── controller/{api,dto}/
```

## Lưu ý khi phát triển tiếp

1. **Chưa có xác thực.** `giverId` đang nằm trong body và `canViewExactLocation` luôn
   `false`. Khi `system/auth-lib` xong, cả hai lấy từ access token — client không bao giờ
   được tự khai mình là ai.
2. **`synchronize` bật ở development.** Phải thay bằng migration TypeORM trước khi có dữ
   liệu thật.
3. **Trừ tồn kho phải nguyên tử.** Khi hiện thực duyệt đơn (kịch bản M-to-N, đặc tả mục
   3.3), dùng `UPDATE ... WHERE remaining_quantity > 0 RETURNING`, không đọc-rồi-ghi.
4. **Toạ độ.** Mọi đường ra công khai phải đi qua `applyGeoJitter()`. Xem `INVARIANTS.md`
   mục 10.
