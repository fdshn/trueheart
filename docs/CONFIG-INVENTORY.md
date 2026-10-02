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

> **Vì sao dev và CI vẫn cần MinIO dù production dùng R2.** Hai bước kiểm tự động chạm object
> storage THẬT: `scripts/smoke-test.sh` xin presigned URL rồi `PUT` ảnh lên và khẳng định hồ sơ
> hoàn tất, còn `test:media-policy` chứng minh ký `Content-Length` thì PUT quá cỡ bị **403** và
> object không hề được tạo. Chĩa chúng vào R2 thật thì phải nhét credential production vào CI,
> và mỗi lần chạy lại vứt rác vào một bucket thật.

> ⚠️ **Ảnh MinIO không còn kéo ẩn danh được** (24/09/2026). `quay.io/minio/minio` và
> `quay.io/minio/mc` đã chuyển sang riêng tư — 401 cho **mọi** tag và cả digest — còn
> `docker.io/minio/minio` thì bị xoá hẳn. Máy nào còn ảnh trong cache vẫn chạy, nên chuyện này
> chỉ lộ ra ở runner CI sạch.
>
> `quay.io/minio/aistor/minio` mà tài liệu MinIO chỉ sang **không thay được**: nó kéo được,
> container sống, `/minio/health/live` trả 200 — nhưng mọi thao tác S3 trả
> `AccessDenied — No license is installed`. Đó là ảnh bản thương mại.
>
> `docker-compose.yml` nay ghim một mirror theo **digest**, và `minio-init` dùng lại chính ảnh
> đó thay vì kéo thêm ảnh `mc` riêng (`mc` nằm sẵn ở `/usr/bin/mc`, chính là thứ healthcheck
> `mc ready local` đang gọi). Workflow `mirror-images.yaml` sao ảnh về registry của repo để lần
> sau ai khoá kho thì CI không đỏ theo.
>
> **Bản MinIO miễn phí cuối cùng sẽ không được vá nữa.** Với container CI dựng rồi vứt thì
> không sao, nhưng đừng chĩa nó ra Internet trên máy dev.

### 1.2b Cấu hình động trong `system_configs`

Không phải biến môi trường — Admin sửa lúc chạy, có đánh phiên bản và ghi audit.

| Khoá | Mặc định | Đổi thì ảnh hưởng gì |
| --- | --- | --- |
| `moderation.blocked_terms` | 66 mục (soát 30/09) | Danh sách từ chặn/giữ lại bình luận |
| ~~`point.referral_daily_cap`~~ · ~~`point.transaction_daily_cap`~~ | *(ĐÃ XOÁ 30/09)* | Bản THÔ hơn của `point_rules.daily_cap`, thứ đã chạy và mịn hơn theo từng mã quy tắc (GIVER 10, RECEIVER 5, REFERRAL 3). Nối vào là tạo hai con số cho một trần và làm mất độ mịn — một khoá chung không diễn đạt được "người tặng 10, người nhận 5". Trần thật sửa qua `GET\|PUT /admin/point-rules`; `test:config-inventory` đỏ nếu hai khoá này quay lại | — |
| `point.redemption` | — | Tỷ lệ quy đổi điểm sang giá trị vật phẩm |
| `review.grace` | 7 ngày, 80% | Chờ bao lâu rồi áp mức mặc định khi không ai đánh giá |
| `chat.retention` | — | Bao lâu sau khi khoá thì xoá lịch sử trò chuyện |
| `accuracy.giver` | — | Ngưỡng gắn cờ độ chính xác người tặng |
| `rating.display` | — | Số mẫu tối thiểu trước khi công bố điểm sao 1–5 |
| `selection.candidate_priority` | ai xin trước | Thứ tự tiêu chí auto-select |
| `notification.retention` | 90 ngày | Bao lâu thì dọn thông báo cũ khỏi hộp thư |
| **`rank.points_source`** | `BALANCE` | **Xét hạng đọc cột điểm nào** |

> **`rank.points_source` là quyết định sản phẩm, không phải kỹ thuật** — và nó đã bị đổi qua lại
> một lần (24/09), nên nay đưa ra cấu hình thay vì chốt cứng trong mã.
>
> - `BALANCE` — điểm **tiêu được**, kẹp ở 0. Tiêu điểm đổi vật phẩm làm tụt hạng, và khoản phạt
>   `SHIP_UNPAID_PENALTY` (−50) cũng làm tụt hạng. Thứ hạng là "đang giữ bao nhiêu".
> - `LIFETIME` — điểm **tích luỹ**, chỉ tăng. Thứ hạng là bằng ghi nhận đã đóng góp, và không ai
>   mất hạng vì đã tiêu điểm mình kiếm được.
>
> Mặc định `BALANCE` giữ **nguyên** hành vi đang chạy: một cấu hình mới không được lặng lẽ đổi
> thứ hạng của tất cả mọi người ngay lúc deploy. Giá trị lạ thì lùi về mặc định chứ không ném —
> một dòng cấu hình gõ sai không được làm chết cả vòng xét hạng.

### 1.3 Có mặc định hợp lý, chỉ đổi khi cần

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | 15 phút |
| `REFRESH_TOKEN_TTL_SECONDS` | 2592000 | 30 ngày |
| `MAX_LOGIN_ATTEMPTS_PER_IP` | 30 | Trần đăng nhập sai theo **địa chỉ IP**, bù cho trần theo tài khoản. Chỉ đếm khi sai |
| `MAX_REGISTRATIONS_PER_IP` | 5 | Số tài khoản tạo được từ một IP trong một cửa sổ. Chỉ đếm khi tạo được |
| `REGISTRATION_WINDOW_SECONDS` | 3600 | Độ dài cửa sổ đếm đăng ký |
| `PHONE_HASH_PEPPER` | *(trống)* | Khoá băm SĐT trong `verified_phones`. Bảng đó sống lâu hơn tài khoản nên số phải không đọc ngược được. Trống thì vẫn băm nhưng không có khoá — chống trùng vẫn chạy, chỉ là người đọc được database dò ngược ra số vì không gian số VN đủ nhỏ. Sinh bằng `openssl rand -base64 32` |
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
| `rating.display` | `minSamples: 3` | Số mẫu tối thiểu để công bố điểm sao (F42). Thấp hơn `accuracy.giver` vì điểm sao là cảm nhận trải nghiệm, không phải cáo buộc mô tả sai, và không gắn cờ ai vào diện Admin xem xét. Áp lúc ĐỌC nên hạ ngưỡng là công bố ngay | `GET\|POST /admin/system-configs` |
| `report.abuse` | `minSamples: 5`, `dismissedRatioPercent: 80` | Ngưỡng đưa người báo xấu vào diện Admin xem xét. Tính SỐNG từ bảng `reports` nên đổi ngưỡng có hiệu lực ngay, không cần job đối soát | `GET\|POST /admin/system-configs` |
| `moderation.blocked_terms` | **66 mục** (66 sau chuẩn hoá) | Danh sách từ ngữ cho bộ lọc bình luận. Trước 29/09 khoá này không có dòng nào nên `screenText` trả ALLOW cho mọi nội dung và cả nhánh kiểm duyệt bình luận nằm im. Soát lại 30/09 bằng corpus: bỏ 4 mục bắt nhầm câu vô hại (`con chó` ở mức BLOCK chặn cả người cho đồ thú nuôi, `súng` khớp trong "sung túc", `giá rẻ` khớp câu người tặng hay viết, `súc vật` khớp "thức ăn cho súc vật"), bỏ 3 mục trùng sau chuẩn hoá, hạ `cút đi`/`im đi` xuống REVIEW, thêm 28 mục. `test:config-inventory` chạy corpus trên danh sách ĐANG NẰM trong database: 0 dương tính giả, 0 mục chết, 0 câu xấu lọt lưới | `GET\|POST /admin/system-configs` |
| `chat.retention` | `value: 1`, `unit: WEEK` | Hạn lưu trữ lịch sử chat. Mốc xoá CHỐT theo cấu hình lúc phòng khoá | `GET\|POST /admin/system-configs` |
| `rank.points_source` | `source: BALANCE` | Cột điểm quyết định hạng. BALANCE = tiêu điểm làm tụt hạng (chốt 24/09); LIFETIME = hạng là bằng ghi nhận đã đóng góp | `GET\|POST /admin/system-configs` |
| `notification.retention` | `retentionDays: 90` | Hạn lưu trữ hộp thư | `GET\|POST /admin/system-configs` |
| `selection.candidate_priority` | *(cố ý CHƯA seed)* | Thứ tự tiêu chí chọn người nhận. Không seed vì `isConfigured` tính bằng "có dòng hay không" — seed mặc định vào là nói với Admin rằng đã có người đặt, trong khi chưa ai đặt | `GET\|PUT /admin/candidate-selection` |
| `group.default_radius_meters` · `min` · `max` | `10000` · `1000` · `50000` | Bán kính vùng nhóm, đơn vị MÉT. Khoá mặc định dùng khi bậc người tạo chưa có số riêng; `min`/`max` kẹp mọi giá trị. Tới 30/09 cả ba chỉ nằm trong allowlist mà **không ai đọc** — Admin sửa được và không gì thay đổi. Cột `groups.radius_km` có `CHECK (1..50)` nên đường ghi từ chối giá trị ngoài 1000–50000 | `GET\|POST /admin/system-configs` |
| `group.radius_meters.member` · `.silver` · `.gold` · `.diamond` | `3000` · `5000` · `7000` · `10000` | Bán kính RIÊNG theo bậc người tạo, đơn vị MÉT (chốt 30/09). Thiếu khoá của bậc nào thì bậc đó dùng khoá mặc định — không rơi về 0, vì 0 km là vùng rỗng và làm điều kiện địa lý của affiliate tắt lặng lẽ. Thang số là ĐỀ XUẤT, cần Bên A chốt; Kim Cương giữ đúng 10000 bằng giá trị chung cũ nên bật cơ chế không đổi vùng của nhóm nào. VIEWER cố ý không có khoá | `GET\|POST /admin/system-configs` |
| `discovery.min_radius_meters` · `default` · `max` | `100` · `5000` · `50000` | Bán kính quét bài, đơn vị MÉT. **Tới 30/09 chỉ `max` được đọc** — `min` trả hằng kỹ thuật, và "mặc định" thì không tồn tại: thiếu `radiusMeters` nghĩa là KHÔNG lọc bán kính, tức một client gửi toạ độ suông quét cả nước. Nay cả ba được đọc; `default` áp khi client bỏ trống, kẹp theo hạn mức của chính người gọi. Cận kỹ thuật 100–50.000 m không nới được bằng cấu hình | `GET\|POST /admin/system-configs` |
| `rank.maintenance_period_months` | `3` | Độ dài một kỳ duy trì hạng, đơn vị THÁNG. **Tới 30/09 không ai đọc** — hai câu `INSERT INTO rank_maintenance_cycles` viết cứng `interval '3 months'`, nên Admin sửa ô này và không gì thay đổi. Nay dùng `make_interval(months => $n)`, và giá trị đọc MỘT LẦN cho cả lượt duyệt để hai người cùng kỳ không nhận hai độ dài khác nhau. Kẹp 1–24 tháng | `GET\|POST /admin/system-configs` |
| `affiliate.active_member_window_days` | `90` | Cửa sổ "Active Member" của affiliate, đơn vị NGÀY. **Tới 30/09 không ai đọc** vì bộ máy chia thưởng chưa có. Nay `GET /groups/:id/affiliate` đọc nó để trả SỐ NGƯỜI đủ điều kiện — tức khoá này có người đọc trước cả khi bộ máy ra đời. Tính từ `users.status` + `users.last_active_at` trực tiếp, KHÔNG qua cột cờ `is_active` nào. Kẹp 1–365 ngày | `GET\|POST /admin/system-configs` |
| `point.redemption` | `vndPerPoint: 2000` | Tỷ lệ quy đổi khi đổi vật phẩm (F74). **Đã nối** vào `POST /posts/:id/redeem` | ⬆ |
| `review.grace` | `graceDays: 7`, `defaultAccuracyPercent: 80` | Chờ rồi áp mức mặc định khi người nhận không đánh giá (F40). Đọc bởi CLI `gift:settle-rewards` — job này còn trả nốt những lượt bị trần ngày chặn, và ở đó dùng mức người nhận ĐÃ chấm chứ không phải mức mặc định | ⬆ |
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

### 2.2a `check_in_policy_revisions` — điểm danh và lượt bù (F83, bảng đã dựng 02/10)

| Trường | Quy tắc | Trạng thái |
| --- | --- | --- |
| `enabled` | Chỉ bật sau khi publish đủ cấu hình | ✅ Có, mặc định `false` |
| `daily_points` | Điểm cơ bản cho điểm danh thường; ghi ledger `CHECK_IN_DAILY` | Chờ Product Owner chốt |
| `milestones_json` | Các cặp `{streakDays,bonusPoints}`, khởi đầu 7/14/30/50 ngày; điểm theo từng mốc | Chờ Product Owner chốt |
| `transactions_per_repair` | Số giao dịch tặng/nhận quà `COMPLETED` đổi một lượt bù, >= 1 | Chờ Product Owner chốt |
| `repair_window_days` | Số ngày được quay lại bù, >= 1 | Chờ Product Owner chốt |
| `effective_at`, `version`, `reason`, `created_by` | Publish phiên bản mới, không hồi tố, audit | ✅ Có, kèm `expectedVersion` chống ghi đè |

Policy này là **nguồn điểm duy nhất** cho `CHECK_IN_DAILY` và
`CHECK_IN_STREAK_MILESTONE`; không thêm hai mức điểm khác trong `point_rules` tổng quát.
Lượt tích từ giao dịch trước khi đổi ngưỡng tiếp tục theo version cũ, không bị quy đổi
lại. Đọc/ghi qua `GET|PUT /admin/check-in-policy` với `config.read/write` — **đang chạy**. Bật mà thiếu bất kỳ số nào ở trên thì publish bị từ chối kèm danh sách đúng cái thiếu.
Xem [thiết kế F83](./plan/CHECK-IN-STREAK-DESIGN.md).

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
| `POST_OPEN` (quota mọi bài đang mở) | 0 | 3 | 10 | 20 | 50 |
| `POST_SOS` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `CREATE_GROUP` | ✗ | ✗ | ✗ | ✗ | ✓ | (⚠️ `limit` rỗng nên bán kính rơi về 10km mặc định) |
| `OPEN_REQUEST_QUOTA` (yêu cầu đang mở) | 0 | 5 | 10 | 20 | 30 |
| `DISCOVERY_RADIUS` (bán kính quét bài, mét) | 5 000 | 10 000 | 20 000 | 30 000 | 50 000 |

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
| ⛔ **Adapter + credential SMS** | **Chặn TOÀN BỘ onboarding** từ 26/09: xác minh SĐT nay là nhiệm vụ bắt buộc, nên không có SMS thì không ai lên hạng Thành viên, không ai nhận 224đ, và không quan hệ giới thiệu nào đủ điều kiện. Đây là hạng mục gấp nhất | Bên A chọn nhà cung cấp |
| ⛔ **Adapter + credential Zalo ZNS** | Kênh thông báo thứ hai | ⬆ |
| ⛔ **FCM credential** (F44) | Đẩy thông báo tới máy. Hiện thông báo vẫn ghi đủ trong app nhưng **không có gì rung máy ai** | Bên A |
| ⛔ **R2 bucket + key + CORS + CDN domain** | Upload ảnh ở staging/prod | Bên A / hạ tầng |
| ⛔ **Xác thực domain người gửi email** | Thư không vào spam, và **xác minh email** — thứ quyết định một tài khoản có khôi phục được mật khẩu hay không | Bên A |
| ⛔ **`JWT_SECRET` + `CONFIG_ENCRYPTION_KEY` riêng cho staging/prod** | Bảo mật | Hạ tầng |

### 3.2 Con số chờ Bên A xác nhận

| Hạng mục | Giá trị đang dùng |
| --- | --- |
| Quota bài theo bậc | 0 · 3 · 10 · 20 · 50 — nay là MỘT capability `POST_OPEN` cho mọi loại bài (gộp từ `POST_OFFER` + `POST_WANTED` ngày 26/09) |
| Bậc được dùng SOS | Bạc trở lên |
| Cap ngày | 5 giao dịch tính điểm · 3 mời |
| Cap báo xấu | Tài liệu nói 10/ngày, rule đang **5** — **hai con số lệch nhau** |
| Bán kính Group | 10km, chỉnh 1–50km. ⚠️ **Đang luôn rơi về 10km**: mã đọc `limit` của capability `CREATE_GROUP`, nhưng capability đó seed kiểu BOOLEAN nên `limit` rỗng. Cần chốt bán kính khác nhau theo hạng hay chung một con số rồi seed lại |
| Bán kính quét bài cá nhân | Viewer 5km · Thành viên 10km · Bạc 20km · Vàng 30km · Kim Cương 50km qua `DISCOVERY_RADIUS`; độc lập với Group |
| Onboarding cho 224đ = lên thẳng Thành viên | Đúng ý chưa? |

### 3.3 Chưa có nút xoay nhưng nên có

| Nội dung | Hiện tại |
| --- | --- |
| Thời hạn lưu trữ tin nhắn chat | Hằng trong code |
| Bán kính jitter theo vùng | Một hằng cho cả nước |
| Danh sách từ ngữ bị lọc | Danh sách tĩnh trong code |
| Giới hạn dung lượng lưu trữ theo bậc | Không có. Hạn mức theo TỪNG ảnh thì đã tách theo loại (`MediaSizeLimits` trong `storage-lib`), hiện đều 5 MB, và **chưa đưa ra biến môi trường** |
| Vùng mặc định cho khách chưa đăng nhập | Chưa chốt là vùng nào |
| Hạn chót gỡ `/gift-posts` | Chưa ai đặt |
| ~~Lịch cron cho 11 CLI~~ | ✅ Đã có ở [`deploy/cron/`](../deploy/cron/README.md). ⛔ Còn thiếu: **alert vào kênh người thật đọc** |
| Sửa `group_role_permissions` qua API | Chỉ đổi được bằng migration (xem §2.9) |
| Xoá sub-team | Cột `deleted_at` đã có, chưa có endpoint; xoá tổ còn người thì xử lý ra sao cũng chưa ai nói |
| ~~Admin giải phóng một SĐT đã xác minh~~ | ✅ `POST /admin/users/verified-phones/release`, lý do bắt buộc, ghi audit |
| Giới hạn tốc độ toàn hệ thống | Mới có cho `/auth/login` và `/auth/register` (theo IP). Các endpoint còn lại **chưa có** |

---

## Phần 4 · Đọc thêm

- [`diagram/16-admin.md`](./diagram/16-admin.md) — cơ chế copy-on-write và vì sao không UPDATE tại chỗ
- [`diagram/24-entitlement.md`](./diagram/24-entitlement.md) — vì sao không hard-code `if (rank === ...)`
- [`diagram/21-open-issues.md`](./diagram/21-open-issues.md) — toàn bộ điểm còn treo
- [`plan/ASSUMPTIONS.md`](./plan/ASSUMPTIONS.md) — vì sao mỗi con số có giá trị đó
- [`plan/DEFERRED.md`](./plan/DEFERRED.md) — danh sách vận hành còn thiếu theo milestone
