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
| `POST` | `/api/v1/gift-posts` | `CreateGiftPostUseCase` |
| `GET` | `/api/v1/gift-posts/nearby` | `GetNearbyGiftPostsUseCase` — truy vấn PostGIS |
| `GET` | `/api/v1/gift-posts/:giftPostId` | `GetGiftPostUseCase` |
| `PATCH` | `/api/v1/gift-posts/:giftPostId` | `UpdateGiftPostUseCase` |
| `DELETE` | `/api/v1/gift-posts/:giftPostId` | `DeleteGiftPostUseCase` — xoá mềm |
| `POST` | `/api/v1/posts` | `CreatePostUseCase` — canonical OFFER, JWT/profile/category/quota gate |
| `POST` | `/api/v1/posts/wanted` | `CreateWantedPostUseCase` — canonical WANTED, chờ moderation |
| `POST` | `/api/v1/posts/:postId/media/upload` | Presign upload ảnh owner/post scoped |
| `POST` | `/api/v1/posts/:postId/media` | `HeadObject` xác minh rồi gắn media |
| `PATCH` | `/api/v1/posts/:postId/media/order` | Owner thay toàn bộ thứ tự media |
| `DELETE` | `/api/v1/posts/:postId/media/:mediaId` | Owner gỡ media, compact thứ tự |
| `DELETE` | `/api/v1/posts/:postId` | Owner xoá mềm canonical post |
| `PATCH` | `/api/v1/posts/:postId/moderation` | `ModeratePostUseCase` — allowlist `POST_OPERATOR_USERNAMES` tạm thời |
| `GET` | `/api/v1/posts/nearby` | `GetNearbyPostsUseCase` — guest radius scan canonical, required OFFER/WANTED filter, location jitter + bucketed distance |
| `GET` | `/api/v1/posts/map` | `GetPostMapUseCase` — marker bbox public, location jitter, client-side cluster |
| `GET` | `/api/v1/posts/:postId` | `GetPostUseCase` — chỉ PUBLISHED/RESERVED, toạ độ đã jitter |
| `GET` | `/api/v1/discovery/config` | `GetDiscoveryConfigUseCase` — giới hạn radius/pagination và loại post public cho guest |
| `GET` | `/api/v1/points/me` | `GetOwnPointSummaryUseCase` — số dư projection của chính chủ |
| `GET` | `/api/v1/points/me/ledger?page=&pageSize=` | `GetOwnPointLedgerUseCase` — lịch sử ledger phân trang của chính chủ |
| `GET` | `/api/v1/ranks/me` | `GetOwnRankSummaryUseCase` — điểm lifetime, tier hiện tại/tiếp theo và maintenance cycle của chính chủ |

## Rank lifecycle operations

Normal rank reconciliation runs after a committed point-rule append and after a newly committed referral qualification. It serializes by user advisory lock, preserves the onboarding-only `VIEWER → MEMBER` writer, and creates the first three-month maintenance cycle only for a real normal promotion to `SILVER` or above. Until a completed-gift source exists, unavailable activity leaves ranks and cycles unchanged.

> Thứ tự khai báo route quan trọng: `@Get('nearby')` và `@Get('map')` phải đứng **trước**
> `@Get(':postId')`, nếu không Fastify sẽ khớp static path thành một UUID và trả lỗi validate.

## Rank maintenance

`POST /api/v1/ranks/maintenance/evaluate` requires a valid bearer token whose username is in the temporary comma-separated `RANK_OPERATOR_USERNAMES` allowlist. Token failures and a non-operator forbidden response are documented in Swagger.

Use an external scheduler to invoke either that protected trigger or the one-shot CLI; Core intentionally starts no in-process maintenance scheduler:

```bash
npm run rank:evaluate
# after build
npm run rank:evaluate:built
```

The CLI loads `.env.local`, bootstraps the Nest application context without an HTTP listener, evaluates once, and closes it. In Sprint 1/M3 the completed-gift source is deliberately unavailable, so an otherwise due cycle is persisted as `UNEVALUATED` and never demotes the user. A later activity adapter may return concrete counts to enable normal maintenance evaluation.

## Ví dụ

```bash
# Đăng bài
curl -X POST http://localhost:3000/api/v1/gift-posts \
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
curl "http://localhost:3000/api/v1/gift-posts/nearby?lat=10.7724&lng=106.698&radiusMeters=5000"
```

> `giverId` phải là UUID hợp lệ theo chuẩn RFC (nibble variant là `8`/`9`/`a`/`b`).
> Chuỗi kiểu `22222222-2222-...` bị `@IsUUID()` từ chối.

## Guest discovery

Không cần JWT để guest khám phá dữ liệu public. Gói API dùng chung gồm:

| Capability | Endpoint | Quy tắc |
| --- | --- | --- |
| Quét theo bán kính | `GET /api/v1/posts/nearby` | Bắt buộc `lat`, `lng`, `radiusMeters`, `postType=OFFER\|WANTED`; optional `categoryId`, `page`, `pageSize`. |
| Marker bản đồ | `GET /api/v1/posts/map` | Bbox bắt buộc; optional origin/type/category; tối đa 200 marker tối thiểu để client cluster. |
| Chi tiết vật phẩm | `GET /api/v1/posts/:postId` | Chỉ `PUBLISHED`/`RESERVED`, media public và location jitter. |
| Bộ lọc danh mục | `GET /api/v1/categories` | Chỉ cây danh mục active. |
| Policy client | `GET /api/v1/discovery/config` | Radius 100–50,000m, page mặc định 20/tối đa 50, type guest OFFER/WANTED. |

Ví dụ quét item WANTED quanh vị trí hiện tại:

```bash
curl "http://localhost:3000/api/v1/posts/nearby?lat=10.7724&lng=106.698&radiusMeters=5000&postType=WANTED&page=1&pageSize=20"
```

Mọi public response có location đều jitter ổn định theo post ID. `distanceMeters` bị bucket, không phải khoảng cách chính xác; guest không nhận được địa chỉ thật, contact hay cấu hình hạ tầng. Legacy `GET /api/v1/gift-posts/nearby` vẫn tương thích client cũ và **luôn** chỉ tìm `OFFER`.

## Canonical posts M2.1

`/api/v1/posts` là API canonical mới. Trong compatibility window, `/api/v1/gift-posts` vẫn tồn tại cho
client cũ và đã map vào canonical `posts`; không ghi hai bảng song song. `POST /api/v1/posts` chỉ tạo `OFFER` ở
`PENDING_REVIEW`; author/type/status do server quyết định. Operator tạm thời cấu hình bằng
`POST_OPERATOR_USERNAMES` mới được gọi moderation sang `PUBLISHED` hoặc `REJECTED`.

Public detail chỉ nhìn thấy `PUBLISHED`/`RESERVED` và luôn nhận toạ độ đã jitter. Không dùng route
public để lấy location thật.

Bài đăng mới tạo ở trạng thái `PENDING_REVIEW` (đặc tả mục 3.2: mọi bài phải qua kiểm
duyệt), nên **chưa xuất hiện trong `/nearby`**. Chuyển sang `PUBLISHED` để kiểm thử:

```bash
curl -X PATCH http://localhost:3000/api/v1/gift-posts/<globalId> \
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
