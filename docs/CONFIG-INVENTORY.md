# Sổ cấu hình Chân Tâm

Một chỗ duy nhất trả lời: **hệ thống có những nút xoay nào, nút nào đã có giá trị, nút nào
còn trống, và ai xoay được.**

Ký hiệu:

| | Nghĩa |
| --- | --- |
| ✅ | Đã có giá trị, đang chạy |
| 🟡 | Có chỗ nhập nhưng **chưa dùng được thật** (thiếu adapter, thiếu credential) |
| ⛔ | **Chưa có** — cần ai đó cung cấp trước khi release |

---

## Phần 1 · Biến môi trường

Đọc từ `.env.local` rồi `.env`. **Đổi phải deploy lại** — nên chỉ những thứ không thể đổi
lúc chạy mới nằm ở đây.

### 1.1 Bắt buộc có, nếu thiếu thì service không lên

| Biến | Ý nghĩa | Trạng thái |
| --- | --- | --- |
| `DATABASE_URI` | Postgres + PostGIS | ✅ |
| `REDIS_URI` | Redis (OTP, phiên, cache) | ✅ |
| `JWT_SECRET` | Ký access token | ✅ dev · ⛔ **secret riêng cho staging/prod** |
| `CONFIG_ENCRYPTION_KEY` | Mã hoá secret động trong database | ✅ dev · ⛔ **key riêng cho staging/prod** |
| `PORT` · `NODE_ENV` | Cổng, môi trường | ✅ |

> **`CONFIG_ENCRYPTION_KEY` mất là mất hết secret động.** Mọi mật khẩu SMTP/Zalo Admin nhập
> vào CMS đều mã hoá bằng key này. Đổi key mà không giải mã trước là biến toàn bộ chúng thành
> rác không đọc lại được.

### 1.2 Lưu trữ đối tượng

| Biến | Dev (MinIO) | Staging/Prod (R2) |
| --- | --- | --- |
| `STORAGE_ENDPOINT` | ✅ | ⛔ |
| `STORAGE_REGION` | ✅ | ⛔ |
| `STORAGE_BUCKET` | ✅ | ⛔ |
| `STORAGE_ACCESS_KEY_ID` | ✅ | ⛔ |
| `STORAGE_SECRET_ACCESS_KEY` | ✅ | ⛔ |
| `STORAGE_PUBLIC_BASE_URL` | ✅ | ⛔ **cần CDN domain riêng** |

Kèm việc ngoài biến môi trường: **CORS của bucket** phải cho phép `PUT` từ domain app, nếu
không client upload trực tiếp sẽ bị chặn ở trình duyệt.

### 1.3 Có mặc định hợp lý, chỉ đổi khi cần

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | 15 phút |
| `REFRESH_TOKEN_TTL_SECONDS` | 2592000 | 30 ngày |
| `OTP_TTL_SECONDS` | 300 | 5 phút |
| `BCRYPT_ROUNDS` | 12 | Tăng là chậm đăng nhập, giảm là dễ dò mật khẩu |
| `MAX_LOGIN_ATTEMPTS` · `LOGIN_LOCK_SECONDS` | 5 · 900 | Chống dò mật khẩu |
| `GEO_JITTER_RADIUS_METERS` | — | Bán kính làm nhiễu toạ độ công khai |
| `API_SERVERS` · `WEB_PUBLIC_BASE_URL` | — | Dựng link trong email, Swagger |
| `ADMIN_BOOTSTRAP_USERNAMES` | — | Gán `SUPER_ADMIN` lần đầu; sau đó quản trị bằng RBAC |

> ⚠️ **`GEO_JITTER_RADIUS_METERS` là hằng cho cả nước.** Ở nông thôn, bán kính đủ cho thành
> phố vẫn có thể chỉ ra đúng một nhà. Cân nhắc đưa ra cấu hình động theo vùng.

### 1.4 Danh tính người gửi email

| Biến | Ghi chú |
| --- | --- |
| `OTP_EMAIL_FROM_ADDRESS` | ✅ |
| `OTP_EMAIL_FROM_NAME` | ✅ |

> Hai biến này **chỉ khai danh tính người gửi**. Chúng KHÔNG bật gửi thư, không chọn nhà cung
> cấp, không chứa credential — phần đó nằm ở [§2.4](#24-kênh-gửi-thông-báo).

### 1.5 Hạ tầng dev (đọc bởi `docker-compose.yml`)

`POSTGRES_USER` · `POSTGRES_PASSWORD` · `POSTGRES_DB` · `POSTGRES_PORT` (15432) ·
`REDIS_PORT` (16379).

> Cổng cố ý **không** dùng 5432/6379: máy dev thường đã có PostgreSQL/Redis cài cục bộ, và
> cái cài sẵn sẽ thắng kết nối, gây lỗi xác thực rất khó đoán.

---

## Phần 2 · Cấu hình động — Admin sửa lúc chạy

**Không cần deploy.** Mọi thay đổi đều có audit (ai, lúc nào, vì sao) và có đánh phiên bản,
nên tra được một bút toán điểm ra đời dưới phiên bản cấu hình nào.

### 2.1 `system_configs` — ghi theo copy-on-write

| Khoá | Giá trị hiện tại | Ý nghĩa | API |
| --- | --- | --- | --- |
| `accuracy.giver` | `minSamples: 5`, `reviewThresholdPercent: 75` | Ngưỡng Giver Accuracy (F43) | `GET\|POST /admin/system-configs` |
| `point.redemption` | `vndPerPoint: 2000` | Tỷ lệ quy đổi khi đổi vật phẩm (F74). **Đã nối** vào `POST /posts/:id/redeem` | ⬆ |
| `review.grace` | `graceDays: 7`, `defaultAccuracyPercent: 80` | Chờ rồi áp mức mặc định khi người nhận không đánh giá (F40). Đọc bởi CLI `gift:settle-rewards` | ⬆ |
| `selection.candidate_priority` | *(chưa đặt → mặc định "ai xin trước")* | Thứ tự tiêu chí chọn người nhận (CH-1). **Đã nối vào auto-select** 25/09 | `GET\|PUT /admin/candidate-selection` |

**Vì sao các con số này có giá trị đó:**

- **75%** theo CHỐT-03. **5 mẫu** để một lần đánh giá xấu không kết tội ai.
- **2.000 VNĐ/điểm** → món 1 triệu cần 500 điểm ≈ 9 lượt trao ở mức 100%.
- **7 ngày** khớp nhịp countdown chọn người nhận. **80%** cố ý nằm **trên** ngưỡng 75 nên một
  lượt không được đánh giá không bao giờ tự nó kéo ai vào diện Admin xem xét.

### 2.2 `point_rules` — điểm cho từng hành vi

| Mã | Điểm | Cap/ngày | Trạng thái |
| --- | ---: | ---: | --- |
| `PHONE_VERIFIED_FIRST_TIME` | 28 | — | ✅ đang gọi |
| `REFERRAL_QUALIFIED` | 56 | 3 | ✅ đang gọi |
| `ONBOARDING_COMPLETED` | 224 | — | ✅ đang gọi |
| `POST_REACTED` | 1 | — | ✅ đang gọi |
| `POST_COMMENTED` | 2 | — | ✅ đang gọi |
| `REPORT_UPHELD` | 5 | 5 | ✅ đang gọi |
| `SHIP_UNPAID_PENALTY` | −50 | — | ✅ đang gọi |
| `GIFT_COMPLETED_GIVER` | 56 | 10 | ✅ đang gọi — mức **TRẦN**, nhân với % người nhận chấm |
| `GIFT_COMPLETED_RECEIVER` | 28 | 5 | ✅ đang gọi ngay lúc hoàn tất |
| `ITEM_REDEMPTION` | *theo giá món* | — | ✅ đang gọi qua `appendAdjustment` |
| `MAINTENANCE_FAILED` | *theo bậc, xem `rank_tiers`* | — | ✅ đang gọi qua `appendAdjustment` |

API: `GET|POST /admin/points/rules`.

> **Toàn bộ phần thưởng mốc là bội số của 56** — 28 = 56/2, onboarding 224 = 56×4, và các
> ngưỡng rank 224/672/896/1792 = 56 × 4/12/16/32. `POST_REACTED`/`POST_COMMENTED`/
> `REPORT_UPHELD` cố ý nằm ngoài lưới: chúng là tiền lẻ khuyến khích hoạt động, không phải
> bậc thang thứ hạng.
>
> **Hai khoản không vừa khuôn `point_rules`** vì số điểm thay đổi theo từng lần: phạt trượt
> nhiệm vụ (mức nằm ở `rank_tiers` theo bậc) và đổi vật phẩm (tính từ giá món). Cả hai đi qua
> `appendAdjustment` — vẫn append-only, vẫn idempotent, và **bắt buộc có lý do đọc được**.

### 2.3 `rank_tiers` — ngưỡng và nhiệm vụ theo bậc

| Bậc | Ngưỡng | Cảnh báo | Nhiệm vụ/quý | Phạt trượt |
| --- | ---: | ---: | --- | ---: |
| Viewer | 0 | — | — | 0 |
| Thành viên | 224 | 157 | — | 0 |
| Bạc | 672 | 470 | 2 trao + 2 mời | 224 |
| Vàng | 896 | 627 | 3 + 3 | 336 |
| Kim Cương | 1792 | 1254 | 4 + 4 | 448 |

API: `GET|POST /admin/ranks/policy` (ngưỡng, cảnh báo) và
`POST /admin/ranks/policy/maintenance` (nhiệm vụ, phạt) — **hai endpoint riêng**.

> **Phạt = đúng số điểm đáng lẽ kiếm được nếu làm đủ nhiệm vụ quý đó** (2×56 + 2×56 = 224).
> Trượt thì mất đúng phần mình không làm, không hơn.
>
> ✅ **Cột cảnh báo đã có đường gửi** (25/09): `RankChangeNotifier` báo sau mọi biến động
> điểm, một lời nhắc mỗi ngày cho mỗi bậc. `GET /ranks/me` cũng trả `warningPoints` +
> `demotionWarning` để client tự dựng lời nhắc.

### 2.4 Kênh gửi thông báo

`GET|PUT /admin/notification-channels/:channel`. Ba kênh: `EMAIL` · `SMS` · `ZALO`.

| Trường | Ghi chú |
| --- | --- |
| `provider` · `enabled` | Bật được **chỉ khi đã có secret** |
| `fromAddress` · `fromName` | Danh tính người gửi |
| `host` · `port` · `username` | Máy chủ gửi |
| `secret` | **Chỉ ghi vào, không bao giờ đọc ra.** API chỉ trả `secretConfigured: true/false` |

| Kênh | Trạng thái |
| --- | --- |
| `EMAIL` | ✅ **adapter SMTP thật đã có** — đổi SMTP từ CMS là có hiệu lực ngay |
| `SMS` | 🟡 Nhập được, bật được, nhưng **`canSend` trả `false` ở production vì chưa có adapter nào gửi nổi** |
| `ZALO` | 🟡 như trên |

> **Bật trong CMS không biến thành lời hứa gửi.** Danh sách kênh đã hiện thực là nơi duy nhất
> quyết định, nên bật nhầm không làm hệ thống im lặng đánh rơi tin nhắn.
>
> **Hệ quả thực tế:** xác minh SĐT (F09) **không chạy được thật ở production** cho tới khi có
> adapter SMS, kéo theo phần thưởng 28đ không phát sinh, và cổng hồ sơ F07 không qua được.

### 2.5 `capability_rank_values` — đặc quyền theo bậc

`GET|POST /admin/entitlements`. Người dùng đọc quyền của mình ở `GET /me/entitlements`.

| Capability | Viewer | Thành viên | Bạc | Vàng | Kim Cương |
| --- | ---: | ---: | ---: | ---: | ---: |
| `POST_OFFER` (quota bài tặng) | 0 | 3 | 10 | 20 | 50 |
| `POST_WANTED` | 0 | 3 | 10 | 20 | 50 |
| `POST_SOS` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `CREATE_GROUP` | ✗ | ✗ | ✗ | ✗ | ✓ | (⚠️ `limit` rỗng nên bán kính rơi về 10km mặc định) |
| `OPEN_REQUEST_QUOTA` (yêu cầu đang mở) | 0 | 5 | 10 | 20 | 30 |

> ⚠️ **Toàn bộ con số này là baseline giả định, chờ Bên A xác nhận.**
>
> ⚠️ Bảng này **không có lịch sử phiên bản** như `system_configs` — chỉ có audit log. Khi một
> bài bị từ chối vì quota, không tra được lúc đó quota là bao nhiêu.

### 2.6 `notification_templates` — nội dung thông báo

`GET|PUT /admin/notification-templates/:type`. Mười bốn loại hiện có; biến trong mẫu được **kiểm
lúc lưu**, không phải lúc gửi — sai một tên biến mà chỉ phát hiện lúc gửi thì người đầu tiên
nhận được thông báo hỏng.

### 2.7 `categories` — danh mục

`GET /categories` (công khai) · `POST /categories` · `PATCH /categories/:id` (quyền
`category.manage`) · `GET /admin/categories` (thấy cả danh mục đã tắt).

Tắt chứ không xoá, và **chặn tắt danh mục đang có bài dùng**.

### 2.8 RBAC — quyền quản trị

`admin_roles` / `admin_permissions` / `admin_user_roles`. 15 quyền, 2 vai đã seed
(`SUPER_ADMIN`, `MODERATOR`). API: `GET /admin/roles` · `POST|DELETE /admin/users/:id/roles`.

### 2.9 RBAC nhóm — `group_role_permissions`

**Bảng riêng, KHÔNG dùng chung `admin_permissions`.** RBAC Admin là toàn cục và không có cột
nào diễn đạt phạm vi, nên gán `group.member.assign_role` ở đó cho một trưởng nhóm là cho họ
quyền trên *mọi* nhóm. Phép kiểm luôn mang `groupId`.

11 dòng đã seed cho ba vai:

| Vai | Quyền |
| --- | --- |
| `OWNER` | `group.overview.view`, `group.member.view`, `group.member.assign_role`, `group.subteam.manage`, `group.invite.view`, `group.activity.view`, `group.affiliate.view`, `group.settings.manage` |
| `SUBTEAM_ADMIN` | `group.overview.view`, `group.subteam.member.view`, `group.subteam.activity.view` |
| `MEMBER` | `group.overview.view` |

⛔ **Chưa có API sửa bảng này** — hiện chỉ đổi được bằng migration. Bộ quyền của
`SUBTEAM_ADMIN` cũng mới là đề xuất, Bên A chưa duyệt.

---

## Phần 3 · Còn trống — cần cung cấp trước release

### 3.1 Phải có người ngoài cấp

| Việc | Chặn cái gì | Ai cấp |
| --- | --- | --- |
| ⛔ **Adapter + credential SMS** | Xác minh SĐT (F09) → cổng hồ sơ F07 → đăng bài | Bên A chọn nhà cung cấp |
| ⛔ **Adapter + credential Zalo ZNS** | Kênh thông báo thứ hai | ⬆ |
| ⛔ **FCM credential** (F44) | Đẩy thông báo tới máy. Hiện thông báo vẫn ghi đủ trong app nhưng **không có gì rung máy ai** | Bên A |
| ⛔ **R2 bucket + key + CORS + CDN domain** | Upload ảnh ở staging/prod | Bên A / hạ tầng |
| ⛔ **Xác thực domain người gửi email** | Thư không vào spam | Bên A |
| ⛔ **`JWT_SECRET` + `CONFIG_ENCRYPTION_KEY` riêng cho staging/prod** | Bảo mật | Hạ tầng |

### 3.2 Con số chờ Bên A xác nhận

| Hạng mục | Giá trị đang dùng |
| --- | --- |
| Quota bài theo bậc | 0 · 3 · 10 · 20 · 50 |
| Bậc được dùng SOS | Bạc trở lên |
| Cap ngày | 5 giao dịch tính điểm · 3 mời |
| Cap báo xấu | Tài liệu nói 10/ngày, rule đang **5** — **hai con số lệch nhau** |
| Bán kính Group | 10km, chỉnh 1–50km. ⚠️ **Đang luôn rơi về 10km**: mã đọc `limit` của capability `CREATE_GROUP`, nhưng capability đó seed kiểu BOOLEAN nên `limit` rỗng. Cần chốt bán kính khác nhau theo hạng hay chung một con số rồi seed lại |
| Onboarding cho 224đ = lên thẳng Thành viên | Đúng ý chưa? |

### 3.3 Chưa có nút xoay nhưng nên có

| Nội dung | Hiện tại |
| --- | --- |
| Thời hạn lưu trữ tin nhắn chat | Hằng trong code |
| Bán kính jitter theo vùng | Một hằng cho cả nước |
| Danh sách từ ngữ bị lọc | Danh sách tĩnh trong code |
| Giới hạn dung lượng lưu trữ theo bậc | Không có |
| Vùng mặc định cho khách chưa đăng nhập | Chưa chốt là vùng nào |
| Hạn chót gỡ `/gift-posts` | Chưa ai đặt |
| ~~Lịch cron cho 10 CLI~~ | ✅ Đã có ở [`deploy/cron/`](../deploy/cron/README.md). ⛔ Còn thiếu: **alert vào kênh người thật đọc** |
| Sửa `group_role_permissions` qua API | Chỉ đổi được bằng migration (xem §2.9) |
| Xoá sub-team | Cột `deleted_at` đã có, chưa có endpoint; xoá tổ còn người thì xử lý ra sao cũng chưa ai nói |
| Giới hạn tốc độ toàn hệ thống | Không có |

---

## Phần 4 · Đọc thêm

- [`diagram/16-admin.md`](./diagram/16-admin.md) — cơ chế copy-on-write và vì sao không UPDATE tại chỗ
- [`diagram/24-entitlement.md`](./diagram/24-entitlement.md) — vì sao không hard-code `if (rank === ...)`
- [`diagram/21-open-issues.md`](./diagram/21-open-issues.md) — toàn bộ điểm còn treo
- [`plan/ASSUMPTIONS.md`](./plan/ASSUMPTIONS.md) — vì sao mỗi con số có giá trị đó
- [`plan/DEFERRED.md`](./plan/DEFERRED.md) — danh sách vận hành còn thiếu theo milestone
