# Lộ trình triển khai

72 chức năng chia 6 mốc. Thứ tự quyết bởi **phụ thuộc kỹ thuật**, không phải độ ưu tiên —
cả 72 đều là P0.

| Mốc | Nội dung | Số chức năng | Trạng thái |
| --- | --- | ---: | --- |
| M0 | Nền tảng monorepo + CI/CD | — | ✅ Xong |
| [M1](#m1--người-dùng--nội-dung-cơ-sở) | Người dùng, hồ sơ, danh mục, media | 13 | ✅ Xong (provider/ledger rollout deferred) |
| [M2](#m2--bài-đăng--bản-đồ) | Bài đăng 5 loại, bản đồ | 15 | 🟡 13/15 — chỉ còn 2 loại bài mới: Quảng cáo (F20) và Dharma Hub (F73) |
| [M3](#m3--giao-dịch--chat) | Giao dịch, chat, thông báo | 10 | 🟡 9/10 — F44 backend xong, khoá đã cắm staging 05/10; chờ client mobile gửi `fcmToken` lên (hiện đếm được 0 token) |
| [M4](#m4--điểm--thứ-hạng) | Điểm, đánh giá, thứ hạng | 7 | 🟡 3/7 — ledger/rank/referral xong; đánh giá & accuracy chưa |
| [M5](#m5--group--affiliate) | Group, affiliate, chống gian lận | 10 | ⬜ 0/10 |
| [M6](#m6--quản-trị--bàn-giao) | Admin CMS, kiểm duyệt, bàn giao | 18 | 🟡 1/18 — RBAC/config động/nhật ký/quản lý user đã có; giao diện CMS chưa |

## Vì sao thứ tự này

```
M1 users ──▶ M2 posts ──▶ M3 transactions ──▶ M4 points ──▶ M5 affiliate
                              │                                    ▲
                              └──── chat                           │
                                                          M6 admin ┘
```

- Mọi thứ cần **users** trước. Bài đăng cần **danh mục + media** trước.
- **Điểm chỉ phát sinh khi giao dịch hoàn tất** → M4 phải sau M3.
- **Affiliate cần ledger + Rank** (chỉ Kim Cương tạo Group) → M5 phải sau M4.

> ⚠️ **Rủi ro tiến độ lớn nhất:** phân hệ phức tạp nhất (Group/Affiliate/Geo) lại nằm cuối
> chuỗi phụ thuộc. Trễ ở M3 hoặc M4 dồn thẳng vào M5. Nếu phải cắt, cắt ở M5 chứ đừng cắt
> M4 — bỏ M4 thì M5 mất nền.

---

## M1 · Người dùng & nội dung cơ sở

**Package:** `system/auth-lib`, `system/otp-lib`, `system/storage-lib` · resource `user`, `category`

- [x] F01 Đăng ký tối thiểu (username + password)
- [x] F02 Đăng nhập đa định danh + chống dò mật khẩu
- [x] F03 Vòng đời refresh token
- [x] F04 Đăng xuất + xoá FCM token thiết bị
- [x] F05 Quên mật khẩu ⚠️ *phần Admin chưa định nghĩa* ⛔ *chưa có nhà cung cấp email/SMS*
- [x] F06 Xoá tài khoản + ẩn danh hoá ⚠️ *chặn giao dịch dở dang chờ M3*
- [x] F07 Cổng hoàn thiện hồ sơ
- [x] F08 Hồ sơ cá nhân & thống kê có backing thật
- [x] F09 Xác minh SĐT — OTP state và thưởng lần đầu qua ledger đã xong; SMS provider rollout còn treo
- [x] F10 Hồ sơ công khai — điểm tích luỹ và share URL đã có; deep link là phần của client
- [x] F11 Vị trí mặc định
- [x] F14 Danh mục động dạng cây — tree/public seed + mutation qua RBAC quyền `category.manage`
- [x] F24 Media R2 qua presigned URL — MinIO local/CI, R2 staging/production qua env

**Xong khi:** đăng ký → hoàn thiện hồ sơ → đặt vị trí mặc định → upload avatar chạy thông,
và `scripts/smoke-test.sh` phủ được luồng này.

**Chặn:** không có. Bắt đầu được ngay.

---

## M2 · Bài đăng & bản đồ

**Package:** resource `post` trong `chantam.core`

- [x] F15 Đăng Muốn Tặng (+ quota theo Rank — dùng [MĐ-1](./ASSUMPTIONS.md#6-mặc-định-mềm))
- [x] F16 Đăng Muốn Nhận
- [x] F17 Smart Match + SOS — Smart Match rule-based (`GET /posts/:postId/matches`) và
      cờ `isSos` lúc đăng bài, chặn theo capability `POST_SOS` mà admin bật/tắt lúc chạy
- [x] F18 Từ thiện / Hoạt động — ⚠️ tạo được qua `CHARITY`, chưa có trường riêng theo loại
- [x] F19 Rao vặt giá rẻ — `CLASSIFIED` kèm `price`/`condition`/`negotiable`, và vòng quét
      `post:expire` chuyển bài quá hạn thành `OFFER` kèm hạn mới (CHỐT-05)
- [x] F21 Công đức / Hồi hướng — ⚠️ tạo được qua `MERIT`, chưa có trường riêng theo loại
- [ ] F73 Phật Pháp – Dharma Hub (Kinh sách, Tụng kinh, Hồi hướng, Cúng/Công đức, Diễn đàn, Giới thiệu chùa)
- [x] F22 Vòng đời bài + gia hạn 1 lần (CHỐT-07) — CLI `post:expire` đóng bài quá hạn,
      `POST /posts/:postId/renew` gia hạn một lần kèm kiểm quota; kiểm chứng trên database
      thật bằng `npm run test:lifecycle`
- [x] F23 Chuyển vật phẩm về điểm từ thiện — chủ bài gửi `POST /posts/:postId/charity-transfer`,
      Admin duyệt bằng `PATCH` cùng đường dẫn; duyệt thì bài sang `ARCHIVED`, từ chối thì bài
      giữ nguyên
- [x] F25 Bản đồ toàn màn hình — `GET /posts/map` trả marker đã làm nhiễu toạ độ
- [x] F26 GPS + dự phòng Default Location — `/posts/nearby` cho phép bỏ trống toạ độ và
      lùi về Vị trí mặc định, response trả `originSource` để giao diện nói rõ đang tính từ đâu
- [x] F27 Nạp theo khung nhìn — `applyBoundingBox()`
- [x] F28 Gom cụm marker + bộ lọc
- [x] F29 Thẻ xem nhanh + deep link — marker bản đồ mang `title`, `thumbnailUrl`, `isSos`
      và `deepLinkPath` tương đối; *ghép tên miền và điều hướng là phần của client*

**Xong khi:** đăng đủ 5 loại bài + bài viết Dharma Hub, bài hiện trên bản đồ với toạ độ **đã làm nhiễu**, cron hết
hạn 3 tháng chạy đúng.

**Đã có sẵn:** `@GeoColumn`, `applyGeoJitter`, `bucketDistance`, `GeoQueryHelper`, và khung
resource `gift-post` làm mẫu.

---

## M3 · Giao dịch & chat

**Package:** resource `gift-request`, `transaction`, `chat` · Socket.io

- [x] F30 Gửi yêu cầu xin nhận — unique một yêu cầu đang mở mỗi người/bài ở tầng DB;
      rút yêu cầu qua `POST /posts/:postId/requests/withdraw`
- [x] F31 Danh sách ứng viên + quyền chọn theo Rank — `GET /posts/:postId/requests`
- [x] F32 **Trừ tồn kho nguyên tử** — UPDATE có điều kiện, huỷ thì trả lại
- [x] F33 Hàng đợi dự phòng — người chưa được chọn vào `STANDBY`; huỷ thì họ quay về
      `PENDING` và hệ thống **đề xuất** người vào sớm nhất, KHÔNG tự trao
- [x] F34 Chấp nhận giao dịch + mở chat — duyệt nguyên tử, khoá theo thứ tự cố định, và
      mở phòng chat trong CÙNG transaction ở cả hai đường duyệt
- [x] F35 Huỷ giao dịch + mở lại hàng đợi — trả tồn kho, mở lại hàng đợi, ghi `closed_by`
      để đếm được số lần huỷ, và báo cho người cho cùng ứng viên kế tiếp
- [x] F36 Xác nhận nhận + tự hoàn tất sau 5 ngày qua CLI `transaction:autocomplete`
- [x] F37 Chat text 1-1 theo giao dịch — REST để gửi/đọc, Socket.io namespace `/chat` để
      nhận tức thì; xác thực ngay lúc bắt tay kèm tra danh sách thu hồi token
- [x] F38 Lưu bền vững + khoá chỉ đọc khi xong — `chat_messages` chỉ ghi thêm (trigger
      chặn UPDATE/DELETE), phòng sang `READ_ONLY` ở cả ba đường kết thúc giao dịch
- [~] F44 Push FCM + thông báo trong app — thông báo trong app và hộp thư đã chạy thật, có
      chống trùng. Đường đẩy: `FcmPushSender` (FCM HTTP v1, tự ký JWT RS256) **đã gọi thật tới
      Google 05/10** và khoá đã cắm trên staging — dòng cũ ghi "chưa có khoá dự án Firebase" là
      sai từ hôm đó. Còn chờ **client mobile** gửi `fcmToken` lên: `user_sessions.fcm_token`
      đếm được **0**, nên chưa đẩy tới máy nào được. Khi biến khoá trống thì
      `LoggingPushSender` fail-closed ở production, không bao giờ giả vờ đã gửi

**Xong khi:** chạy trọn vòng xin → duyệt → chat → xác nhận → hoàn tất, và kiểm được **race
condition**: 50 request đồng thời trên bài có 10 món phải ra đúng 10 giao dịch.

**Đây là mốc khó nhất về đúng đắn.** Hai chỗ dễ sai: trừ tồn kho ([DATA-MODEL §1](./DATA-MODEL.md#1--trừ-tồn-kho-phải-nguyên-tử))
và mở chat phải nằm trong cùng transaction với việc duyệt.

---

## M4 · Điểm & thứ hạng

**Package:** resource `point`, `review`, `rank`, `referral`

- [x] F39 Point Rule Engine + Ledger (xét Rank theo `balance_after`, `lifetime_after` dùng để thống kê/audit — CHỐT-01)
- [ ] F40 Điểm theo giá trị vật phẩm — dùng [GĐ-1](./ASSUMPTIONS.md#gđ-1--đánh-giá--giver-accuracy)
- [x] F41 Điểm Like/Comment/Report — `POST_REACTED` (1đ, trần 20/ngày), `POST_COMMENTED`
  (2đ, trần 10/ngày) và `REPORT_UPHELD` (5đ, trần 5/ngày) đều ở **version 2 và ĐANG BẬT**
  trong `point_rules`. Ghi chú *"mặc định tắt"* đúng ở bản seed đầu, đã lạc hậu từ 29/09
- [x] F42 Đánh giá chất lượng hai chiều — `POST|GET /transactions/{id}/reviews`, và
  `transaction_reviews.reviewer_role` nhận `GIVER`/`RECEIVER` nên thật sự hai chiều;
  bảng chỉ ghi thêm (trigger `TRG_transaction_reviews_append_only`). `npm run test:reviews`
- [x] F43 Giver Accuracy (dùng %, đủ 5 mẫu mới tính, warning < 75% — CHỐT-03) —
  `reviewThresholdPercent: 75` và `minSamples: 5` ở core-lib, ngưỡng đưa ra cấu hình động,
  hàng đợi soát là `GET /admin/users?accuracyReviewRequired=true`. Đối chiếu ở `BR-ACC-03`
- [x] F12 Rank 5 tầng + chu kỳ duy trì (xét theo current balance — CHỐT-01; chu kỳ 3 tháng 2+2/3+3/4+4 — BR-PROF-RANK-03)
- [x] F13 Referral cá nhân, thưởng một lần
- [x] F83 Điểm danh hằng ngày, lịch sử, streak, thưởng mốc và điểm danh bù từ giao dịch
  tặng/nhận quà hoàn tất; policy Admin có version/audit — **hiện thực 02/10, ship ở trạng
  thái TẮT**: chờ Bên A chốt điểm ngày, điểm từng mốc, số giao dịch đổi một lượt bù, cửa
  sổ bù và giới hạn lượt tích trữ, rồi Admin publish policy

**Xong khi:** hoàn tất một giao dịch → điểm vào ledger có idempotency → đủ 224 điểm thì lên
Member. Ghi cùng một `idempotency_key` hai lần chỉ cộng một lần.

**Bổ sung F83:** xong khi ngày điểm danh/lượt bù/mốc thưởng nguyên tử và idempotent;
app xem được lịch sử, streak, lượt bù; Admin cấu hình ngưỡng giao dịch/lượt, điểm ngày,
điểm từng mốc và thời hạn bù. [Đặc tả triển khai](./CHECK-IN-STREAK-DESIGN.md).

> ✅ **Toàn bộ 4 câu hỏi/giả định của mốc này đã được chốt chính thức trong SRS v1.15.0** (Mục 1.7). Không còn rủi ro đụng cấu trúc bảng do thiếu yêu cầu.

---

## M5 · Group & affiliate

**Package:** resource `group`, `affiliate`

- [x] F51 Quyền tạo Group theo Rank — capability `CREATE_GROUP`, Admin đổi được bậc
  qua `POST /admin/entitlements`. Đối chiếu ở `BR-GRP-01`
- [x] F52 Tạo Group từ Default Location (chụp tâm + bán kính) — copy `user.default_location`
  sang `group.center_location` và snapshot bán kính theo hạng; đổi Vị trí mặc định sau đó
  KHÔNG dịch tâm nhóm. `BR-GRP-03`, migration `1796100000000`
- [x] F53 Quản lý Group + Sub-team (1 tầng — [MĐ-4](./ASSUMPTIONS.md#6-mặc-định-mềm)) —
  `GET|POST /groups/{id}/sub-teams`, `PATCH /groups/{id}/members/{memberId}`, quyền theo vai
  có version (`group_role_permissions`). `BR-GRP-05`, `npm run test:group`
- [x] F54 Link mời — chỉ tài khoản mới — `GET /groups/{id}/invite`, và
  `POST /auth/register` nhận `group_invite_token`. Link không tự hết hạn khi nhóm ACTIVE
  (`BR-GRP-04`)
- [x] F55 Owner xoá tài khoản → Group giải tán — `delete-account.use-case.ts` giải tán nhóm,
  KHÔNG chuyển owner cho member khác. `BR-GRP-07`
- [x] F56 Affiliate Event Engine (depth = 1, recurring) — `affiliate_events` +
  `affiliate_rewards` + `affiliate_policy_revisions`, hook thật ở đăng bài và hoàn tất
  lượt trao, chạy TRONG transaction của đường nghiệp vụ. **Ship ở trạng thái TẮT**:
  chưa Admin publish chính sách thì engine không ghi gì
- [x] F57 **Geo eligibility bắt buộc** (`ST_DWithin`) — đo bằng Postgres, cùng hàm mà
  discovery dùng; `CHK_affiliate_events_geo_zero` ở database chặn sự kiện ngoài vùng
  mang điểm khác 0
- [x] F58 Thứ tự ưu tiên vị trí + audit khoảng cách — `resolveAffiliateLocation` là chỗ
  DUY NHẤT viết thứ tự `EVENT → TRANSACTION → POST → MEMBER_DEFAULT`; mỗi sự kiện lưu
  `location_source`, `distance_meters`, `radius_meters` nên trả lời được "vì sao bị loại"
- [ ] F50 Chống gian lận referral/điểm — **nửa đã có**: trần ngày mỗi người nhận và
  trần người nhận mỗi sự kiện là BẮT BUỘC khi bật affiliate (publish bị từ chối nếu
  thiếu), cộng hàng đợi soát referral `GET /admin/referrals/review`. Còn thiếu: ba ngưỡng
  dấu vết đăng ký vẫn seed `0 = TẮT` chờ dữ liệu thật. ~~và không có đường nối kết luận
  báo xấu với việc đình chỉ (L4)~~ — **L4 đã đóng 02/10**, xem F49
- [x] F47 Thông báo theo khu vực — bảng `notification_broadcasts`,
  `POST|GET /admin/notifications/broadcasts` và CLI `notify:broadcast`. Ba chế độ người
  nhận đúng SRS mục 1507: `ALL`, `GROUP` (lọc `status = 'ACTIVE'` nên người có membership
  `DISSOLVED` không nhận), `AREA` (`ST_DWithin` trên `users.default_location`, bán kính
  tính bằng MÉT). `POST` chỉ xếp lượt gửi rồi trả ngay — gửi đồng bộ cho trăm nghìn người
  trong một request HTTP là hết giờ. Con trỏ `last_user_id` cho lượt chạy sau tiếp đúng
  chỗ còn dở

**Xong khi:** sự kiện trong bán kính Group thì cộng điểm cho Active Member; sự kiện ngoài
bán kính ghi `NOT_ELIGIBLE_GEO` với `point_delta = 0`, và audit lưu đủ khoảng cách + bán kính.

> **F50 phải xong cùng M5, không được đẩy sang M6.** Cơ chế duy trì Rank đòi hỏi referral
> liên tục, nên tài khoản ảo là đường tấn công rẻ nhất. Geo là hàng rào duy nhất — thả M5 ra
> mà chưa có chống gian lận là mở cửa cho farm điểm.

---

## M6 · Quản trị & bàn giao

**Package:** `apps/admin` (React) · `system/notification-lib`

**Admin CMS**
- [x] F59 Dashboard KPI — `GET /admin/dashboard` nay có **mười** khối. Sáu khối cũ
  (users, posts, transactions, media, queues, byRank) cộng bốn khối thêm 02/10 đúng theo
  UC-ADM-01 và dòng Analytics: `points` (phân bổ Điểm Cống hiến cắt theo đúng
  `rank_tiers.threshold_points`), `transactions.completionRatePercent` kèm mẫu số,
  `groups`, `affiliate` (có `policyPublished` tách khỏi `policyEnabled`), `accuracy` (kèm
  ngưỡng đang dùng). **Điểm danh KHÔNG có** — không dòng nào trong đặc tả đòi nó làm KPI
- [x] F60 Kiểm duyệt + quản lý người dùng — 23 endpoint đã chạy (`users` 7, `reports` 5,
  `chat` 5, `comments` 3, `posts` 3) và **đã gọi `ITokenDenyList.revokeIssuedBefore()`**
  trước khi thu hồi phiên. Phần API xong; **giao diện CMS chưa có** (không có `apps/`)
- [x] F61 Cấu hình Rank/Point/Referral/Affiliate/Accuracy (có version) — đã phủ đủ: Rank
  (`/admin/ranks` + `publishRankPolicy`), Point (`/admin/points`), Referral
  (`referral.review_*`), Affiliate (`/admin/affiliate-policy`), Accuracy (`accuracy.giver`),
  và 02/10 thêm **phân bổ & ghép nối** (`GET|PUT /admin/config/allocation-policy`, SRS
  §6.2.14) — sáu trường trước đó là hằng số cứng `SmartMatchWeights` /
  `SmartMatchMaxResults` và nhánh lọc viết thẳng trong câu truy vấn. Mặc định trùng khít
  hành vi cũ nên triển khai không đổi gợi ý nào; `autoCreateTransaction` có trong schema
  nhưng `PUT` TỪ CHỐI bật vì chưa hiện thực
- [x] F62 Quản lý danh mục + mẫu thông báo — mẫu và kênh ở `/admin/notification-templates`
  (2) và `/admin/notification-channels` (2); danh mục ĐỌC ở `/admin/categories` còn SỬA ở
  `/categories` (POST), `/categories/{id}` (PATCH), `/categories/{id}/merge` (POST) — chia
  hai tiền tố nên dễ tưởng là thiếu, nhưng không thiếu endpoint nào
- [x] F63 Campaign + Home động — bảng `home_campaign_configs` (SRS §6.2.11), bốn endpoint
  admin `GET|POST /admin/campaigns` + `GET|PUT /admin/campaigns/:id`, và một endpoint công
  khai `GET /config/home-layout` có đệm Redis TTL 1h. BR_CAMP_01 là ràng buộc
  `EXCLUDE USING gist` dưới database, không phải nhánh `if`; BR_CAMP_02 là
  `DefaultHomeLayout` nên app luôn có bố cục vẽ. Quyền riêng `campaign.read` /
  `campaign.manage` — KHÔNG dùng lại `config.write`, vốn mở luôn ngưỡng hạng và quy tắc điểm
- [ ] F65 mở rộng Từ thiện — phân biệt `INDIVIDUAL_APPEAL` và `ORGANIZED_CAMPAIGN`, bảng
  nhu cầu từng vật phẩm, đề nghị đóng góp nhiều dòng, organizer chấp nhận/từ chối một phần
  và sinh transaction giao nhận. Contract đã chốt tại
  [`CHARITY-CONTRIBUTION-DESIGN.md`](./CHARITY-CONTRIBUTION-DESIGN.md); backend/staging chưa
  triển khai nên client không được giả lập thành công.
- [x] F64 Blog / Tin tức — bảng `blogs` (SRS §6.2.12), bốn endpoint admin
  `GET|POST /admin/blogs` + `PUT|DELETE /admin/blogs/:id`, hai endpoint công khai
  `GET /blogs` + `GET /blogs/:idOrSlug`. `content_html` được LỌC ở tầng ghi qua
  `IHtmlSanitizer` (hiện thực `sanitize-html`, 22 ca tấn công có spec canh), cột lưu bản
  đã sạch. Xoá MỀM để `slug` giữ chỗ. Quyền riêng `blog.read` / `blog.manage`
- [ ] F65 Quản lý Từ thiện, Rao vặt, Quảng cáo, Công đức

**Kiểm duyệt & thông báo**
- [x] F48 Báo cáo kèm bằng chứng — `POST /reports` nhận `evidenceUrls`, hàng đợi
  `GET /admin/reports` + `PATCH /admin/reports/{id}/review`; thưởng người báo cáo CHỈ khi
  Admin kết luận `RESOLVED` (`BR-REP-03`). Đích `POST`/`USER`/`COMMENT`
- [x] F49 Tín hiệu kiểm duyệt + chế tài — `PATCH /admin/reports/:reportId/review` nhận thêm
  `enforcement` (`NONE` | `SUSPEND_USER` | `BAN_USER`), đóng mục mở **L4**. Thu hồi token
  đi kèm vì nó gọi lại NGUYÊN `ChangeAdminUserStatusUseCase`, không viết lại — nên cũng
  không mở cửa leo thang quyền: chế tài đòi `admin.manage`, kết luận chỉ đòi
  `report.resolve`. Gỡ/ẩn bài viết KHÔNG gộp vào đây
- [ ] F45 Phân loại + mẫu thông báo
- [x] F46 Lịch Âm — bộ chuyển đổi Âm lịch Việt Nam viết THUẦN trong `core-lib` (không
  dependency, UTC+7, can chi, mốc Rằm/Mùng Một), bảng `lunar_holidays` seed 10 ngày lễ
  Phật giáo, `GET /config/lunar-today` công khai và `GET|PUT /admin/lunar-holidays`.
  Phần **nhắc ngày lễ** đã làm 02/10: `npm run notify:lunar` gửi toàn hệ thống, lô 500,
  chống trùng theo ngày âm lịch — xem [L28](../diagram/31-open-items.md). Gửi theo VÙNG
  vẫn chờ F47

**Hạ tầng & bàn giao**
- [x] F66 VPS, Docker, Nginx SSL — template host Nginx + runbook staging/production đã có; backup, monitoring và rate limit vẫn là phần còn lại
- [ ] F67 Sao lưu + **kiểm thử restore**
- [ ] F68 Bảo mật, log, giám sát
- [ ] F69 Kiểm thử hồi quy + UAT
- [ ] F70 Sửa lỗi UAT + nghiệm thu Sprint
- [ ] F71 Build + phát hành Store
- [ ] F72 Bàn giao mã nguồn + quyền quản trị

**Xong khi:** Admin cấu hình được rule mà không cần deploy lại, và bản backup **đã được
restore thử thành công**.

---

## Việc bắt buộc, chưa nằm trong 72 chức năng

Không có mã F nhưng không làm thì không lên production được:

- [x] **Migration TypeORM** thay cho `synchronize` — xong. Nợ kỹ thuật #1 đã đóng
- [x] **Rate limit toàn cục** — `GlobalRateLimitGuard` chạy thật, mặc định 600 req/phút theo
  IP (`GLOBAL_RATE_LIMIT_PER_MINUTE`), có danh sách path miễn trừ và nuốt lỗi Redis để một
  sự cố cache không đánh sập API. ⚠️ Cần `TRUST_PROXY=true` khi đứng sau proxy, nếu không
  mọi người dùng chung một bucket — xem B5 ở [31](../diagram/31-open-items.md)
- [x] **Host Nginx + Certbot cho staging** — vhost tách port 8080, HTTPS external health gate xanh; xem `deploy/STAGING.md`
- [ ] **Production Nginx + TLS** — chuẩn bị theo `deploy/PRODUCTION.md` khi khách cấp server thật

---

## Đã bỏ khỏi phạm vi

Ghi lại chứ không xoá: một chức năng biến mất không dấu vết sẽ được hỏi lại sáu tháng sau.
Những mục này **không tính vào mẫu số tiến độ**.

| Mã | Ngày bỏ | Lý do |
| --- | --- | --- |
| F20 Giới thiệu / Quảng cáo | 02/10/2026 | Bên A chốt gộp vào `RAO_VẶT` (CLASSIFIED). `BR-POST-TYPE-01` của SRS đã sửa từ sáu nhóm bài còn năm |

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 6 mốc, 72 chức năng |
| 2026-10-02 | Dựng bộ máy affiliate F56–F58, nên **M5 đóng** phần cơ chế; A1–A4 của Bên A nay là lựa chọn trong `PUT /admin/affiliate-policy` |
| 2026-10-02 | Dọn theo đợt đối chiếu SRS ↔ mã nguồn: **10 mục đổi sang `[x]`** vì đã xong từ trước mà tài liệu chưa theo (F41, F42, F43, F48, F51–F55, rate limit toàn cục); F20 chuyển sang mục đã bỏ; thêm F83. Hai tài liệu kế hoạch từng nói trái nhau về F41/F42/F43 — `SPRINT-PLAN` ghi xong, file này ghi chưa; nay cùng một nguồn |
