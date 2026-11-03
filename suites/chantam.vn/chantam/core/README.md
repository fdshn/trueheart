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

Danh sách route đầy đủ (hơn 300 route, kèm mức truy cập) **sinh tự động** ở
[`docs/API-ROUTES.md`](../../../../docs/API-ROUTES.md) — chạy `npm run docs:routes` ở gốc
monorepo sau khi đổi controller, CI kiểm bằng `docs:routes:check`. Hành vi đầy đủ của từng
endpoint — quyền truy cập, ràng buộc riêng tư, thứ tự kiểm tra — xem
[`docs/API.md`](../../../../docs/API.md). Mọi route nằm dưới tiền tố `/api/v1` (trừ `/health`).

Các nhóm chính, mỗi nhóm một thư mục trong `infrastructure/controller/api/`:

| Nhóm | Ví dụ |
| --- | --- |
| Bài đăng canonical | `POST /posts` cho cả năm loại (`postType`), tạo thẳng ở `PUBLISHED` — Admin hậu kiểm; media, gia hạn, `GET /posts/nearby`, `/posts/map`, `/posts/share/:shareCode` |
| Xin nhận & lượt trao | `POST /posts/:postId/requests`, `POST /posts/:postId/requests/:requestId/accept`, `GET /transactions/me`, xác nhận/huỷ lượt trao |
| Tương tác | `PUT\|DELETE /posts/:subjectId/reactions/me` (thay endpoint like cũ), bình luận, chia sẻ |
| Chat & presence | `/chat/rooms/...`, `/chat/direct-post/rooms`, `/chat/direct-user/rooms`, `/presence/*`, `/me/blocks` |
| Điểm, hạng, giới thiệu | `/points/me`, `/ranks/me`, `/check-ins/*` (F83), `/leaderboards/*`, `/referrals/me`, `/attribution/*` |
| Admin | `/admin/*` — mỗi route khai quyền RBAC |
| Tương thích cũ | `/gift-posts` — map vào `posts`, chỉ `OFFER` |

> **Quyền Admin là fail-closed.** `AdminPermissionGuard` chặn MỌI route dưới
> `/admin` không khai `@RequiresPermission(...)`. Thêm endpoint quản trị mà quên
> decorator thì nó khoá ngay lần gọi đầu, thay vì lặng lẽ mở một cửa quản trị.

## Rank lifecycle operations

Normal rank reconciliation runs after a committed point-rule append and after a newly committed referral qualification. It serializes by user advisory lock, preserves the onboarding-only `VIEWER → MEMBER` writer, and creates the first three-month maintenance cycle only for a real normal promotion to `SILVER` or above. Until a completed-gift source exists, unavailable activity leaves ranks and cycles unchanged.

> Thứ tự khai báo route quan trọng: `@Get('nearby')` và `@Get('map')` phải đứng **trước**
> `@Get(':postId')`, nếu không Fastify sẽ khớp static path thành một UUID và trả lỗi validate.

## Rank maintenance

`POST /api/v1/ranks/maintenance/evaluate` requires a valid bearer token whose user holds the `rank.operate` permission in Admin CMS. Token failures and a forbidden response are documented in Swagger.

Use an external scheduler to invoke either that protected trigger or the one-shot CLI; Core intentionally starts no in-process maintenance scheduler:

```bash
npm run rank:evaluate
# after build
npm run rank:evaluate:built
```

The CLI loads `.env.local`, bootstraps the Nest application context without an HTTP listener, evaluates once, and closes it. In Sprint 1/M3 the completed-gift source is deliberately unavailable, so an otherwise due cycle is persisted as `UNEVALUATED` and never demotes the user. A later activity adapter may return concrete counts to enable normal maintenance evaluation.

## Ví dụ

```bash
# Đăng bài — cần access token; người tặng lấy từ token, không khai trong body
curl -X POST http://localhost:3000/api/v1/gift-posts \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "giftPost": {
        "title": "Xe đạp cũ còn dùng tốt",
        "description": "Xe đạp địa hình, phanh còn tốt, cần thay yên.",
        "category": "VEHICLE", "condition": "USED",
        "estimatedValue": 1500000,
        "location": { "lat": 10.7724, "lng": 106.698 },
        "areaLabel": "Quận 1, TP.HCM" } }'

# Quanh đây — sắp xếp gần → xa
curl "http://localhost:3000/api/v1/gift-posts/nearby?lat=10.7724&lng=106.698&radiusMeters=5000"
```

## Guest discovery

Không cần JWT để guest khám phá dữ liệu public. Gói API dùng chung gồm:

| Capability | Endpoint | Quy tắc |
| --- | --- | --- |
| Quét theo bán kính | `GET /api/v1/posts/nearby` | Bắt buộc `lat`, `lng`, `radiusMeters`, `postType=OFFER\|WANTED`; optional `categoryId`, `page`, `pageSize`. |
| Marker bản đồ | `GET /api/v1/posts/map` | Bbox bắt buộc; optional origin/type/category; tối đa 200 marker tối thiểu để client cluster. |
| Chi tiết vật phẩm | `GET /api/v1/posts/:postId` | Chỉ `PUBLISHED`/`RESERVED`, media public và location jitter. |
| Bộ lọc danh mục | `GET /api/v1/categories` | Chỉ cây danh mục active. |
| Policy client | `GET /api/v1/discovery/config` | Radius tối thiểu 100m; trần lấy từ `discovery.max_radius_meters` (hiện 5,000m), page mặc định 20/tối đa 50. |

Khách bị giới hạn bởi `discovery.max_radius_meters`. Người đã đăng nhập dùng
capability `DISCOVERY_RADIUS` theo hạng (baseline 5/10/20/30/50km); giá trị này
được trả cùng các quyền khác ở `GET /api/v1/me/entitlements`. Bán kính này độc
lập với bán kính hoạt động của Group.

Ví dụ quét item WANTED quanh vị trí hiện tại:

```bash
curl "http://localhost:3000/api/v1/posts/nearby?lat=10.7724&lng=106.698&radiusMeters=5000&postType=WANTED&page=1&pageSize=20"
```

Mọi public response có location đều jitter ổn định theo post ID. `distanceMeters` bị bucket, không phải khoảng cách chính xác; guest không nhận được địa chỉ thật, contact hay cấu hình hạ tầng. Legacy `GET /api/v1/gift-posts/nearby` vẫn tương thích client cũ và **luôn** chỉ tìm `OFFER`.

## Canonical posts M2.1

### Owner editing

`PATCH /api/v1/posts/:postId` edits title, description, active category, area/location,
quantity, SOS and delivery/shipping terms. OFFER supports condition/estimatedValue;
CLASSIFIED supports condition/price/negotiable. Explicit `deliveryMethod: null`
means privately negotiated delivery and clears shipPayer; omitted fields stay unchanged.
Type, author, lifecycle status, expiry and rewards are not editable.

Only DRAFT/PENDING_REVIEW/PUBLISHED, still-valid posts without ACCEPTED/DELIVERING
transactions can be edited. The post-row lock serializes saving/media changes with
stock allocation, including multi-quantity posts still PUBLISHED. Quantity preserves
already allocated stock. Waiting requests and queue timestamps remain untouched.
Content changes are audited. Owner detail returns original coordinates and canEdit;
non-owner coordinates remain jittered.

TODO notification: after committed important edits, notify still-waiting applicants
without deleting/rejecting their requests. Cover item/category/condition/media,
quantity, location and delivery/ship-payer changes. Use durable outbox + per-recipient
idempotency, coalesce content/media requests, respect privacy, and never send before
commit. Detailed follow-up is in the Flutter repository's
`documentation/post-edit-notifications.md`; notifications are intentionally deferred.

`/api/v1/posts` là API canonical mới. Trong compatibility window, `/api/v1/gift-posts` vẫn tồn tại cho
client cũ và đã map vào canonical `posts`; không ghi hai bảng song song. `POST /api/v1/gift-posts` chỉ tạo `OFFER`;
author/status do server quyết định. Bài tạo thẳng ở `PUBLISHED`, không có bước duyệt trước —
Admin có quyền `post.moderate` gỡ về sau qua hậu kiểm.

Public detail chỉ nhìn thấy `PUBLISHED`/`RESERVED` và luôn nhận toạ độ đã jitter. Không dùng route
public để lấy location thật.

Bài đăng mới tạo ở trạng thái `PUBLISHED` nên hiện ngay trong `/nearby` (xem
`create-post.use-case.ts`).

## Vòng đời bài đăng

Hạn đặt lúc bài lên `PUBLISHED` (mà bài mới tạo là `PUBLISHED` ngay): `OFFER`/`WANTED`
sống 7 + 30 = **37 ngày** (CHỐT-10), các loại khác **3 tháng** — xem
`postExpiryDateFor` trong `core-lib/src/models/post-lifecycle.ts`.

Đóng vòng đời chạy từ lịch bên ngoài, Core cố ý **không** dựng scheduler trong
tiến trình vì deploy nhiều replica sẽ chạy trùng:

```bash
npm run post:expire
```

Lượt quét chuyển bài quá hạn sang `EXPIRED`, đóng các yêu cầu còn treo và báo chủ bài.
Từ 26/10 Rao vặt (`CLASSIFIED`) hết hạn như mọi bài, không còn tự chuyển thành `OFFER`.

Vòng quét chỉ đụng vào bài `PUBLISHED`. Bài `RESERVED`/`DELIVERING` đang có giao
dịch sống nên hết hạn ngang là cắt ngang một lượt trao đang diễn ra.

Chủ bài gia hạn được **một lần** qua `POST /api/v1/posts/:postId/renew`: thêm 3
tháng, bài `EXPIRED` quay lại `PUBLISHED`. Lượt gia hạn tính quota như một bài
mới (CHỐT-07), nên bài đã hết hạn phải giành lại chỗ trong hạn mức.

Yêu cầu xin nhận bị từ chối ngay khi bài quá `expires_at`, kể cả lúc vòng quét
chưa kịp chạy — nếu không, khoảng trễ giữa hai lần quét sẽ thành cửa sổ xin nhận
trên bài đã chết.

Kiểm chứng trên database thật: `npm run test:lifecycle`.

## SOS, dự phòng vị trí và thẻ xem nhanh

**SOS (F17).** `POST /api/v1/posts` nhận `isSos`. Quyền là capability `POST_SOS`, Admin
bật/tắt theo từng Rank lúc chạy — không phải một ô tuỳ ý trên form. Bài thường **không**
tốn truy vấn entitlement nào cho SOS: chỉ kiểm khi người dùng thật sự bật nó.

**Dự phòng vị trí (F26).** `lat`/`lng` của `/api/v1/posts/nearby` là tuỳ chọn. Bỏ trống thì
server lùi về Vị trí mặc định của người đang đăng nhập và trả `originSource:
'DEFAULT_LOCATION'`. Không có gốc nào thì trả `DISCOVERY_ORIGIN_UNAVAILABLE` chứ **không**
tự chọn một toạ độ mặc định — kết quả quanh một điểm người dùng không chọn là nói sai về
thứ họ đang xem. Gửi một nửa toạ độ cũng là lỗi, không phải ý muốn lùi vị trí.

**Thẻ xem nhanh (F29).** Marker của `/api/v1/posts/map` mang `title`, `thumbnailUrl`,
`isSos`, `deepLinkPath`. Ảnh lấy bằng truy vấn con `LIMIT 1` theo `sort_order` — JOIN thẳng
vào `post_media` sẽ nhân bản marker theo số ảnh và bản đồ hiện nhiều pin trùng chỗ cho một
bài. `deepLinkPath` là đường dẫn tương đối; server không ghép tên miền.

## Chat và thông báo

**Gửi bằng REST, nhận bằng socket.** Gateway (`infrastructure/realtime`) chỉ đọc và
phát, không ghi. Một đường ghi duy nhất nghĩa là chỉ một chỗ kiểm quyền, kiểm trạng
thái phòng và sinh mã lỗi.

Socket.io ở namespace **`/chat`** — không có tiền tố `/api/v1` vì `setGlobalPrefix`
không áp cho WebSocket. Gắn vào chính HTTP server của Fastify nên không mở cổng thứ
hai. Xác thực lúc bắt tay làm **đủ hai bước** như `JwtAuthGuard`: verify chữ ký *và*
tra `ITokenDenyList`.

**Phát tin chỉ sau khi commit.** `IChatRealtimePublisher` được gọi từ use case, không
từ repository: phát từ trong transaction rồi rollback là nói với client về một tin
nhắn không tồn tại.

**Chat mở/khoá trong cùng transaction với giao dịch.** Mở ở cả hai đường duyệt
(`gift-request` và `gift-transaction`), khoá ở cả **ba** đường kết thúc — xác nhận
nhận, huỷ/từ chối, và tự hoàn tất sau 5 ngày. Thiếu đường thứ ba thì những lượt do
cron đóng để lại phòng vẫn gửi được tin.

**`chat_messages` chỉ ghi thêm**, trigger chặn UPDATE và DELETE. Vì vậy không khoá
ngoại nào cascade: cascade và chỉ-ghi-thêm loại trừ nhau. Hệ quả là một lượt trao đã
có lịch sử chat thì không xoá cứng được — đó chính là điều đang muốn.

**Đẩy FCM chưa dùng được.** `LoggingPushSender` ghi log ở dev và fail-closed ở
production cho tới khi có khoá dự án Firebase. Thông báo trong app không phụ thuộc
vào nó.

Kiểm trên service thật: `npm run test:chat-e2e` (cần service đang chạy).

## Bẫy: body rỗng với `Content-Type: application/json`

Fastify mặc định trả **400 "Body cannot be empty"** khi client đặt content-type JSON
mà không gửi body. Mọi endpoint không có body đều vướng: xác nhận nhận hàng, gia hạn
bài, đánh dấu đã đọc, chạy đánh giá chu kỳ. Client mobile thường đặt content-type đó
cho mọi request, nên đó là một 400 mà người dùng không gửi sai gì cả.

`main.ts` thay bộ phân tích JSON **sau `app.init()`** để coi body rỗng là `{}`. Phải
sau `init()`: Nest tự đăng ký một bộ trong đó, nên thêm trước là đụng
`FST_ERR_CTP_ALREADY_PRESENT` và tiến trình chết lúc khởi động. JSON hỏng vẫn bị từ
chối như cũ.

## Bẫy: `UPDATE ... RETURNING` bị bọc

`query()` của TypeORM trả về hai hình dạng khác nhau tuỳ loại câu lệnh:

| Câu lệnh | Trả về |
| --- | --- |
| `UPDATE ... RETURNING` | `[rows, affectedCount]` |
| `DELETE ... RETURNING` | `[rows, affectedCount]` |
| `INSERT ... RETURNING` | `rows` |
| `SELECT` | `rows` |

Hai câu nằm cạnh nhau cho hai hình dạng khác nhau, nên chỗ sai trông y hệt chỗ
đúng. Và nó hỏng **im lặng**: `rows.length === 0` không bao giờ đúng vì độ dài
luôn là 2; `rows[0].cot` ra `undefined`; rồi `findOne({ where: { id: undefined } })`
không ném lỗi mà **bỏ qua điều kiện lọc** và trả về hàng đầu bảng — bản ghi của
người dùng khác.

Dùng `updateReturning()` trong `infrastructure/repository/` cho mọi
`UPDATE`/`DELETE ... RETURNING`. `INSERT` gọi `manager.query` như thường.
`update-returning-guard.spec.ts` quét toàn bộ repository và fail nếu mẫu cũ
quay lại.

Kiểm trên database thật: `npm run test:returning`.

## CLI chạy một lần

Mười lăm lệnh (`src/infrastructure/cli/*.cli.ts`), tất cả cùng một khuôn: nạp `.env.local`, dựng application context
KHÔNG mở cổng HTTP, chạy một lượt rồi đóng. Gọi từ cron bên ngoài; Core cố ý
không tự dựng scheduler nào trong tiến trình.

```bash
npm run chat:purge                 # xoá tin nhắn quá hạn lưu trữ
npm run point:reconcile            # vá thưởng xác minh SĐT bị thiếu
npm run post:expire                # đóng bài quá hạn
npm run rank:evaluate              # đánh giá chu kỳ duy trì rank
npm run transaction:autocomplete   # tự hoàn tất lượt trao quá hạn
npm run feed:reconcile-counts      # đối soát số đếm feed
npm run accuracy:reconcile         # tính lại Giver Accuracy theo ngưỡng hiện hành
npm run gift:settle-rewards        # trả thưởng chờ: review quá hạn, lượt bị trần ngày chặn
npm run selection:auto-select      # tự chọn người nhận khi hết hạn xét
npm run notify:reminders           # nhắc việc theo hạn
npm run notify:lunar               # nhắc ngày lễ Âm lịch
npm run notify:broadcast           # gửi thông báo hàng loạt đã lên lịch
npm run notification:purge         # dọn thông báo quá hạn lưu trữ
npm run media:sweep-orphans        # dọn ảnh mồ côi trên storage
npm run leaderboard:close-month    # chốt bảng thành tích tháng, trao huy hiệu
```

Lịch chạy thật trên server: `deploy/cron/`.

Lệnh có số liệu lệch nhận thêm `--dry-run`: in ra chỗ lệch, không sửa, và
thoát khác 0 để cron coi đó là chuyện cần biết.

### Hai cái bẫy đã từng làm mọi CLI chết

Cả hai chỉ lộ ra khi chạy thật, vì unit test tiêm sẵn hàm giả vào đúng chỗ
hỏng và do đó không bao giờ chạm tới.

**1. `NestFactory.createApplicationContext` phải `.bind(NestFactory)`.**
`NestFactory` là một instance, nên truyền tham chiếu method trần làm mất
`this` và CLI chết ngay dòng đầu với `Cannot read properties of undefined`.

**2. Module CLI phải import `CliInfrastructureModule`, không liệt kê tay.**
`@Global()` chỉ có hiệu lực SAU KHI module được import ở đâu đó — không import
thì nó không tồn tại. Trước đây mỗi `*-cli.module.ts` tự đoán bốn module nó
cần và cả bảy CLI khi đó đều thiếu. Thêm một phụ thuộc vào bất kỳ repository nào là mọi
CLI cùng chết trong im lặng.

`RealtimeModule` là ngoại lệ có chủ ý: CLI dùng `NoopRealtimeModule` thay thế,
vì dựng máy chủ websocket cho một tiến trình sống vài giây là giữ cổng đủ lâu
để hai lượt cron chồng nhau đụng nhau. Bản không-làm-gì ghi log cảnh báo nếu
thật sự bị gọi, chứ không nuốt lặng lẽ.

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

1. **Danh tính lấy từ access token.** Đường ghi dùng `@CurrentUser()` sau guard JWT; route
   không cần đăng nhập phải khai `@Public()`. Client không bao giờ được tự khai mình là ai
   (không có `giverId` trong body).
2. **Schema đi bằng migration, `synchronize` tắt ở mọi môi trường.** Production tự chạy
   migration còn thiếu lúc khởi động (`migrationsRun`); dev/CI chạy `npm run migration:run`.
3. **Trừ tồn kho phải nguyên tử.** Khi hiện thực duyệt đơn (kịch bản M-to-N, SRS v1.15.0 - UC-TXN-01 / Chương 3), dùng `UPDATE ... WHERE remaining_quantity > 0 RETURNING`, không đọc-rồi-ghi.
4. **Toạ độ.** Mọi đường ra công khai phải đi qua `applyGeoJitter()`. Xem `INVARIANTS.md`
   mục 10.
