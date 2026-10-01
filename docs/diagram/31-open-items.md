# 31 · Sổ treo theo phân hệ

Danh sách **đang còn treo**, xếp theo phân hệ, dựng từ mục "Chỗ cần soát" của 30 sơ đồ
còn lại. Soát ngày **2026-10-01**.

> **Khác [21](./21-open-issues.md) thế nào.** 21 xếp theo *loại* vấn đề và giữ **lịch sử**:
> mỗi mục đã đóng được đánh ✅ chứ không xoá, vì xoá đi thì lần sau không ai biết nó từng là
> vấn đề. File này xếp theo *phân hệ* và chỉ chứa thứ **chưa đóng** — để trả lời một câu khác:
> "làm phân hệ này thì còn vướng gì".
>
> Hai file, một nguồn. Khi một mục ở đây đóng lại, nó được đánh ✅ ở **21** rồi **xoá khỏi đây**.

## Cách đọc

| Dấu | Nghĩa | Ai làm |
| --- | --- | --- |
| 🔴 | Chặn phát hành | Bên A hoặc hạ tầng |
| 🟠 | Lỗ hổng thật, chưa chặn phát hành | Dev |
| 🟡 | Cần Bên A chốt mới làm được | Bên A |
| ⚪ | Tính năng thêm, không phải lỗi | Bên A xếp ưu tiên |

Mỗi mục ghi **để treo thì mất gì** — một danh sách không nói hậu quả sẽ bị đọc thành một
danh sách mong muốn, rồi bị bỏ qua cả khối.

---

## 🔴 Chặn phát hành

Năm mục. Bốn thuộc hạ tầng, một thuộc bảo mật dữ liệu.

| # | Mục | Để treo thì mất gì | Sơ đồ |
| --- | --- | --- | --- |
| B1 | **SMS/Zalo chưa có adapter.** `canSend()` trả `false` ở `production` | Xác minh SĐT là **cửa bắt buộc** để thoát VIEWER từ 26/09, nên không ai lên được Thành viên: không đăng bài, không xin nhận, không chat. Toàn bộ sản phẩm đứng sau một cái cửa không mở được | [01](./01-auth.md) · [02](./02-profile.md) |
| B2 | **Bucket media đang MỞ ĐỌC cho tất cả** (`mc anonymous set download`) | Ảnh bài đăng là công khai nên không sao, nhưng avatar và ảnh trong chat đi cùng một bucket. Ai có URL là đọc được, và URL thì đoán được nếu key có quy luật | [03](./03-media.md) |
| B3 | **R2 staging/production chưa có** bucket, key, CORS, CDN domain — hiện chỉ MinIO cục bộ | Không deploy được ra môi trường thật | [03](./03-media.md) |
| B4 | **Restore test CHƯA TỪNG chạy.** Backup có, phục hồi thì chưa ai thử | Một bản backup chưa ai phục hồi thử là một bản backup **không biết có dùng được hay không** — và biết điều đó vào lúc cần là quá muộn | [27](./27-database.md) · [29](./29-cicd.md) |
| B5 | **Ba biến môi trường chưa điền**: `CHANTAM_CRON_ALERT_URL`, `CHANTAM_HEALTH_URL`, và `TRUST_PROXY=true` nếu đứng sau proxy | Hai cái đầu: mọi cảnh báo rơi vào `alerts-chua-gui-duoc.log` — **có ghi lại nhưng không ai đọc**. Cái thứ ba để sai theo chiều ngược lại còn tệ hơn: trần gọi chung đánh sập cả API vì mọi người dùng chung một bucket | [17](./17-jobs.md) · [29](./29-cicd.md) |

> **B5 là mục rẻ nhất trong cả file này** — ba dòng biến môi trường — và nó đang làm vô hiệu
> toàn bộ phần báo động đã dựng xong.

---

## 🟡 Quyết định kinh tế còn treo

### [19](./19-affiliate.md) · Affiliate — bộ máy chia thưởng

Nền móng đã có đủ (`groups.center_location` + `radius_km`, `last_active_at`,
`group_memberships`, `GET /groups/:id/affiliate` đếm được ai đủ điều kiện **hôm nay**).
Thiếu đúng phần chia thưởng, và nó chờ năm câu:

| # | Câu hỏi | Vì sao không viết trước được |
| --- | --- | --- |
| A1 | **Cách chia thưởng** — chia đều cho mọi Active Member, hay chia một mức cố định mỗi người? | **Quyết định kinh tế lớn nhất còn treo của cả hệ.** Với nhóm 500 người, hai cách chênh nhau **500 lần**. Viết trước khi chốt là viết để bỏ |
| A2 | Những loại sự kiện nào sinh affiliate | BR-AFF-02 liệt kê "đăng bài, hoàn tất trao, giới thiệu…" nhưng không chốt danh sách |
| A3 | Điểm cho từng loại sự kiện | Chưa có con số nào |
| A4 | **Cap ngày** | Không có cap thì một nhóm lớn sinh điểm **không giới hạn** |
| A5 | Cơ chế thu hồi: thu khi nào, ai bấm, ghi sổ thế nào | Chưa có thiết kế |

### [23](./23-referral.md) · Referral — ngưỡng diện xem xét

| # | Câu hỏi | Trạng thái |
| --- | --- | --- |
| R1 | `referral.review_min_device_clusters` và `review_min_cluster_size` đặt bao nhiêu | **Cơ chế đã xong**, ba khoá mặc định `0 = TẮT`. Dấu vết chỉ bắt đầu ghi từ 30/09 nên chưa có dữ liệu để chọn — chọn hôm nay là phỏng đoán mặc áo chính sách. Sau 4–8 tuần thì chọn theo **phân vị** |
| R2 | Có **thu hồi** 56 điểm khi xác minh là tài khoản ảo không | Đường thu hồi đã có và đã đúng (kể cả ca "điểm đã bị tiêu" → nợ ở `raw_balance`, `lifetime` bị trừ). Câu còn lại thuần nghiệp vụ: có thu hay không |

> **Đòn mạnh hơn mọi heuristic**, nếu farm thành vấn đề thật: **giảm trần 3 lượt/ngày**, hoặc
> **đòi người được mời hoàn tất một giao dịch thật** chứ không chỉ onboarding. Cả hai **không có
> dương tính giả nào** và dịch chuyển kinh tế của việc farm nhiều hơn mọi dấu vết đăng ký cộng
> lại. Dấu vết chỉ để *nhìn thấy*, không phải để *ngăn*.

### [14](./14-redemption.md) · Đổi điểm — một câu nhỏ nhưng là tiền

| # | Câu hỏi | Số liệu |
| --- | --- | --- |
| D1 | Người vừa **trả 500 điểm** để đổi món đồ có nên nhận lại `+28` `GIFT_COMPLETED_RECEIVER`? | Không phải cỗ máy in điểm — cả lượt là `−500 +28 +56 = −416`, vẫn giảm phát. Nhưng hoàn 28 cho người vừa **mua** cần Bên A chốt là có chủ ý hay không. **Chưa sửa, chỉ ghi lại** |

### [24](./24-entitlement.md) · Entitlement + [12](./12-rank.md) · Rank — con số vẫn là giả định

| Hạng mục | Giá trị đang chạy |
| --- | --- |
| Quota bài theo rank | Viewer 0 · Thành viên 3 · Bạc 10 · Vàng 20 · Kim Cương 50 |
| Rank được dùng SOS | Bạc trở lên |
| Cap ngày | 5 giao dịch tính điểm · 3 referral |
| Cap báo xấu | 10/người/ngày |
| Ngưỡng accuracy | 75%, công bố điểm sao từ 3 mẫu |
| Onboarding 224đ = lên thẳng Thành viên | **đúng ý chưa?** |

Tất cả đã nằm trong cấu hình động nên đổi không cần deploy — nhưng **đang chạy bằng giả định**.

### [24](./24-entitlement.md) · Entitlement — hai capability khai mà chưa ai đọc

| # | Câu hỏi | Trạng thái |
| --- | --- | --- |
| E1 | `SELECT_REQUESTER` — hạn mức 1/3/5/10 theo bậc, **không ai đọc** | Không ai biết đơn vị của nó: mỗi bài được chọn mấy người, hay mỗi ngày? Nối nó đòi chốt nghiệp vụ trước — đoán sai là đặt một trần người dùng không hiểu |
| E2 | `SUBMIT_CHARITY_PROPOSAL` — **không ai đọc** | Dành cho F65, phân hệ chưa có dòng code nào. Giữ dòng cấu hình để khi làm thì cổng quyền đã sấn |
| E3 | Chat có nên đi qua capability để đặt trần theo bậc? | Hiện trần chat là hằng trong code (30/phút, 500/ngày), giống trần bình luận. Nếu không phân biệt theo bậc thì một hằng có tên vẫn tốt hơn một ô cấu hình không ai đổi |

Cả hai mục đầu nay được `test:entitlement-inventory` ghi là **nợ đã biết** kèm lý do, nên
chúng không còn lặng lẽ nằm đó — và thêm một capability vào database mà quên khai là phép
kiểm đỏ.

### [16](./16-admin.md) · Admin — danh sách từ kiểm duyệt

66 mục là bản **khởi tạo**, cần Bên A soát. Ba từ tải hàng đợi Admin nặng nhất vì chúng xuất
hiện trong hội thoại bình thường: **`đặt cọc`**, **`chuyển tiền`**, **`phí vận chuyển`**.

---

## 🟠 Lỗ hổng thật — việc của dev

Xếp theo mức đáng làm trước.

| # | Phân hệ | Vấn đề | Để treo thì mất gì |
| --- | --- | --- | --- |
| L1 | [02](./02-profile.md) | **Cổng F07 chỉ đòi CÓ email và SĐT, không đòi ĐÃ XÁC MINH** | "Đăng bài được" và "đã xác minh" là hai mức khác nhau mà cổng đang coi là một |
| L2 | [07](./07-request.md) | **INSTANT auto-accept nuốt lỗi.** `acceptRequest` hỏng thì yêu cầu nằm lại `PENDING` | Người xin tưởng đã chốt ngay, thực tế đang treo, và không ai được báo |
| L3 | [17](./17-jobs.md) | **`transaction:autocomplete` đếm từ `accepted_at`**, không từ `handed_over_at` | Đóng lượt trao trước khi hàng thật sự tới tay — ngược chiều với §8 vốn đếm từ `COALESCE(handed_over_at, accepted_at)` |
| L4 | [15](./15-report.md) | **Không có gì nối kết luận báo xấu với việc đình chỉ người dùng** | Admin xác minh một báo xấu rồi… phải tự đi tìm tài khoản đó mà đình chỉ tay, bằng một đường khác |
| L5 | [12](./12-rank.md) | **`reconcileNormalRank` gọi sau MỌI bút toán** | Một người nhận 50 thông báo/ngày kéo theo 50 lượt xét hạng. Chưa đau vì dữ liệu nhỏ |
| L6 | [13](./13-review.md) | **`accuracy:reconcile` không chia lô** — quét mọi hồ sơ có mẫu rồi sửa tất cả trong MỘT transaction | Với vài nghìn hồ sơ là một transaction dài giữ lock; hỏng giữa chừng thì cuộn lại cả lượt |
| L7 | [05](./05-feed.md) | **Phân trang `nearby` vẫn là OFFSET** | Đã vá thứ tự bằng tiebreak nên không lặp/sót nữa, nhưng OFFSET sâu vẫn chậm tuyến tính |
| L8 | [10](./10-notification.md) | **Chưa có queue / retry / dead-letter** | Hiện vô hại vì `LoggingPushSender` không bao giờ hỏng. Thành vấn đề đúng ngày nối FCM |
| L9 | [23](./23-referral.md) | **Cả ba hàng đợi soát đều không có trạng thái "đã xem rồi"** — `referrals/review`, `reports/reporters`, cờ Giver Accuracy | Một ca dương tính giả hợp lệ (gia đình dùng chung wifi) hiện lại mỗi lần Admin mở màn hình, mãi mãi |
| L10 | [11](./11-point.md) | **Chưa có màn hình nào đọc `point_cap_decisions`** | Bảng đã giữ đủ bằng chứng "ai bị chặn vì trần ngày", và không ai xem được |
| L11 | [12](./12-rank.md) | **Không có thông báo khi tiến độ nhiệm vụ duy trì về đích** | Người làm đủ 2/2 giữa kỳ không biết mình đã an toàn, nên vẫn lo |
| L12 | [10](./10-notification.md) | **Không có lời nhắc nào cho hàng đợi Admin** | Bình luận chờ duyệt và báo xấu chờ xử chỉ hiện khi Admin tự mở màn hình ra xem |
| L13 | [26](./26-api-conventions.md) | **Chưa có request id / trace id** xuyên suốt | Không nối được một dòng log với một request cụ thể khi điều tra sự cố |
| L14 | [13](./13-review.md) | **Chưa có gì tổng hợp `comment` của đánh giá** | Ghi được, giới hạn 1000 ký tự, và không đường nào đọc ra ngoài từng bản ghi lẻ |
| L15 | [04](./04-post.md) | **`CHARITY` và `MERIT` không có cổng nào** — ai qua onboarding cũng đăng được | Hai loại này mang ý nghĩa tổ chức/công đức, mở cho tất cả có thể không đúng ý |
| L16 | [23](./23-referral.md) | **Không có phân trang cho `invitees`** ở cả hai đường đọc — trần cứng 50 | Đủ cho trang tóm tắt; thiếu khi có người mời vài trăm người |
| L18 | [24](./24-entitlement.md) | **Không có kiểm KHOẢNG cho `limit` của capability**, chỉ kiểm tính nhất quán | Đặt `POST_OPEN = 100000` vẫn qua được. Không làm sập gì, chỉ là một chính sách lạ không ai chặn. Đơn vị mỗi capability một khác (số bài, số yêu cầu, mét) nên một khoảng chung không có nghĩa |
| L17 | [28](./28-architecture.md) | **Chưa có đo phủ bắt buộc** — `test:cov` có script nhưng không có ngưỡng trong CI | Phủ có thể tụt dần mà không ai thấy |
| L19 | [11](./11-point.md) | **`POST /admin/points/ledger/:entryId/reversal` KHÔNG ghi `admin_audit_logs`** — phát hiện 01/10 khi thêm đường `adjust` bên cạnh | Một lần Admin đảo bút toán điểm của người khác không để lại dấu nào ở sổ audit. Đường `adjust` mới thì có ghi, nên hai đường cùng quyền `point.adjust` để lại hai mức dấu vết khác nhau |

---

## ⚪ Tính năng thêm — Bên A xếp ưu tiên

| # | Phân hệ | Mục |
| --- | --- | --- |
| T1 | [16](./16-admin.md) | **F63 Campaign & Home động, F64 Blog, F65 Từ thiện/Quảng cáo/Công đức** — chưa có dòng code nào |
| T2 | [10](./10-notification.md) | **FCM push (F44)** — hạ tầng token đã xong, chỉ thiếu nhà cung cấp. Đây là việc **còn lại duy nhất** của đẩy thật |
| T3 | [01](./01-auth.md) | **Chưa có đường cho Admin đặt lại mật khẩu hộ** |
| T4 | [01](./01-auth.md) | **Mật khẩu chỉ yêu cầu 8 ký tự** — `12345678` qua được |
| T5 | [03](./03-media.md) · [24](./24-entitlement.md) | **Chưa có giới hạn dung lượng theo người dùng**, dù F59 đã theo dõi con số. Cần Bên A cho con số theo bậc trước khi làm |
| T6 | [09](./09-chat.md) | **Chat nhóm** chưa có |
| T7 | [05](./05-feed.md) | **Feed không loại bài của chính mình**; chưa có gợi ý theo tiền tố khi đang gõ; smart match chỉ khớp danh mục + khoảng cách + từ khoá tiêu đề |
| T8 | [22](./22-category.md) | **Chưa có ảnh cho danh mục** (có `icon` dạng chuỗi tên); chưa có `GET /admin/categories/:id`; **gộp không có đường lùi** |
| T9 | [25](./25-location-privacy.md) | **Bán kính jitter là MỘT con số CHUNG** cho cả thành phố lẫn nông thôn (300 m, qua `GEO_JITTER_RADIUS_METERS`) — ở vùng thưa vẫn có thể chỉ ra đúng một nhà. Và nó là biến môi trường nên đổi phải deploy. Chuyển sang cấu hình động cần một **sàn cứng** trước — một ô số hạ được lúc chạy thì cũng nâng lên 0 được lúc chạy, tức tắt sạch lớp bảo vệ. Sàn đó là con số Bên A phải chốt |
| T10 | [26](./26-api-conventions.md) | Thông báo lỗi **chỉ có tiếng Việt**; chưa có kế hoạch cho API v2 |
| T11 | [16](./16-admin.md) | Chưa có **vai cho vận hành** ngoài bốn vai đã seed |
| T12 | [27](./27-database.md) | Chưa có **chiến lược phân vùng** cho `point_ledger` và `chat_messages` (cả hai chỉ tăng) |

---

## 🧹 Nợ dọn dẹp — có hạn chót mà chưa ai đặt

| # | Mục | Vấn đề |
| --- | --- | --- |
| C1 | **`gift_posts` và `posts` cùng tồn tại** vì lớp tương thích; `/gift-posts` **chưa có hạn chót gỡ** | Không ai nói bao giờ gỡ, nên nó sẽ không bao giờ được gỡ. [25](./25-location-privacy.md) · [27](./27-database.md) |
| C2 | **24 khoá `system_configs` có dòng, chỉ 16 sửa được qua Admin** — và đường ghi chỉ nhận `INTEGER`, nên mọi khoá hình JSON (`report.abuse`, `accuracy.giver`, `moderation.blocked_terms`…) chỉ đổi được bằng **SQL tay** | "Cấu hình động" mà phải vào database sửa thì không còn động. Phát hiện 01/10 khi làm [23](./23-referral.md) |
| C3 | **Tin nhắn đã thu hồi vẫn nằm trong database** tới kỳ dọn | Với người dùng thì nó biến mất; với người đọc được database thì không. [09](./09-chat.md) |
| C4 | **Đổi hợp đồng API chưa thông báo cho client**: `POST /posts/:postId/like` đã gỡ, `likeCount`/`isLiked` biến mất khỏi cả bốn endpoint đọc bài | Client cũ gọi vào sẽ 404 mà không có thông báo trước. [06](./06-interaction.md) |

---

## Mở rộng ngoài SRS — Bên A cần BIẾT, không cần quyết

Ba thứ đã làm mà SRS không nói. Ghi ở đây để không ai phát hiện ra chúng như một điều bất ngờ.

| Mục | Vì sao là mở rộng |
| --- | --- |
| **Trưởng nhóm sub-team** (`SUBTEAM_ADMIN`) | BR-GRP-05 chỉ chia Owner/Member; SRS nói sub-team *"chỉ để tổ chức"*. Phạm vi đã chốt 30/09: đúng thành viên tổ mình, không hơn. Bộ quyền khởi tạo vẫn là **đề xuất** |
| **Cảnh báo sắp tụt hạng** | Hệ quả bắt buộc của việc bỏ F76 |
| **Cờ kiểm duyệt chat** | SRS không nói chat đi qua bộ lọc từ ngữ. Thêm vì mọi thương lượng diễn ra ở đó — và **gắn cờ chứ không chặn**: chặn một hội thoại riêng vì một danh sách từ là quyền lớn hơn mức danh sách đó đáng được trao |

---

## Đối chiếu SRS — 16 lỗ endpoint còn lại và 15 quy tắc chưa soát

Lập 01/10 khi rà `docs/software-requirement-specification/SRS_Chan_Tam_v1.15.0.md` sang mã nguồn.
Con số đo bằng script, không ước lượng.

### Endpoint SRS đặt tên mà chưa có

SRS nêu **52** cặp `(VERB, path)`. Đối chiếu OpenAPI đang chạy: 11 khớp y nguyên, 21 **đổi tên
hoặc gộp nhưng CÓ**, và 20 thiếu thật. Bốn cái rời rạc đã làm 01/10 (xem dưới), còn **16 cái
nằm trong bốn khối chưa từng bắt đầu**:

| Khối | Số endpoint | UC | Ghi ở |
| --- | --- | --- | --- |
| Campaign & Home động | 5 | UC-ADM-03 | ⚪ phần tính năng thêm |
| Blog / Tin tức | 5 | UC-BLOG-01 | ⚪ phần tính năng thêm |
| Charity campaigns | 3 | — | ⚪ phần tính năng thêm |
| Bộ máy chia thưởng Affiliate | 3 | — | 🟡 A1–A5 phía trên |

> Bốn cái rời rạc **đã đóng 01/10**: `GET /posts/sos-urgent`, `POST /admin/points/adjust`,
> `POST /posts/{postId}/batch-accept`, `POST /posts/{wantedPostId}/offer-gift`.

### Hai hợp đồng mã lỗi không tương thích

SRS đặt tên **14 mã lỗi API** cho client khớp theo **chuỗi**. Đối chiếu cả ba catalog (103 tên):
**1** tên khớp (`VALIDATION_FAILED`). Hành vi đều có, chỉ khác tên — `AUTH_USERNAME_ALREADY_EXISTS`
→ `USERNAME_TAKEN`, `AUTH_ACCOUNT_BANNED` → `USER_BANNED`, `REQUEST_ALREADY_SUBMITTED` →
`GIFT_REQUEST_DUPLICATED`, `INSUFFICIENT_AVAILABLE_POINTS` → `REDEMPTION_INSUFFICIENT_POINTS`.

Nhưng sâu hơn tên: **[26](./26-api-conventions.md) bảo client khớp CẶP SỐ `(errorOrigin, errorCode)`
và nói thẳng "đừng bắt lỗi theo message"**. Ai dựng client Flutter từ SRS sẽ viết so chuỗi
**không bao giờ khớp**. Quyết định đổi sang mã số chưa bao giờ được ghi lại vào SRS.

🟡 **Cần Bên A chốt**: cập nhật SRS theo mã số, hay thêm một trường tên chuỗi vào response.

### 15 quy tắc nghiệp vụ chưa ai đối chiếu

SRS có **61** id BR duy nhất (19 dạng `BR_X_n` + 42 dạng `BR-X-n` — cùng một dãy bị đổi quy ước
giữa tài liệu). Sổ truy vết nay ở `core/src/srs-traceability.spec.ts`:

| Trạng thái | Nghĩa |
| --- | --- |
| `IMPLEMENTED` | Đã đối chiếu tận mã nguồn, có trỏ chỗ quyết định |
| `PARTIAL` | Có hiện thực nhưng lệch một điểm, nêu rõ trong sổ |
| `NOT_IMPLEMENTED` | Chưa làm, hầu hết vì phân hệ chưa dựng (DHARMA, CHARITY, CAMP, AFF) |
| `UNVERIFIED` | **Chưa ai đối chiếu** — không phải "chưa làm", đúng nghĩa là chưa biết |

**Con số duy nhất ghi ở đây là `UNVERIFIED`: 15**, vì nó là con số duy nhất có phép kiểm canh —
`UnverifiedBaseline` trong chính file spec, và phép kiểm đỏ nếu số đó tăng. Phân bố ba trạng thái
còn lại đọc thẳng ở file spec; chép sang đây là tự dựng một con số sẽ rữa, đúng thứ
[26](./26-api-conventions.md) vừa dọn.

Sổ cũng đỏ khi SRS lên bản mới và thêm quy tắc mà sổ chưa khai, và khi SRS bỏ một quy tắc mà sổ
còn giữ dòng chết.

15 mục chưa soát: `BR_AUTH_03`, `BR_POST_01`, `BR_POST_03`, `BR_POST_05`, `BR-GIS-03`,
`BR-GIS-04`, `BR-GIS-06`, `BR_CHAT_02`, `BR-AFF-01`, `BR-NOTI-01`, `BR-POINT-02`, `BR-POINT-03`,
`BR-POINT-04`, `BR-REP-02`, `BR-REP-04`.

### 🟡 Một chỗ hiện thực LỆCH đặc tả, cần Bên A chốt

`BR-POINT-06` nói *"Rank dùng số dư Điểm Cống hiến hiện tại, **không dùng lifetime rank point
riêng**"*. Mã nguồn mặc định đúng (`rank.points_source = BALANCE`), nhưng đó là **cấu hình động
và Admin bật được `LIFETIME`** — tức bật được đúng thứ đặc tả nói là không dùng.

Giữ hay bỏ lựa chọn đó là quyết định của Bên A. Để nguyên thì một lần Admin đổi cấu hình sẽ làm
hệ thống chạy trái đặc tả mà không ai coi đó là lỗi.

### Hai lỗi của chính SRS

1. **`BR_AUTH_04` dùng cho HAI quy tắc khác nhau** — dòng ~535 nói không cần xác thực email để
   kích hoạt tài khoản, dòng ~616 nói xoá tài khoản phải ẩn danh hoá theo NĐ 13/2023. Sổ truy vết
   giữ một dòng mang cả hai, có ghi chú.
2. **`BR-REP-01` không tồn tại** — nhóm REP đánh số từ 02. Không rõ là bỏ sót một quy tắc hay chỉ
   là lỗ số.

---

## Một chỗ tài liệu tự nói trái nhau, phát hiện khi lập sổ này

`06-interaction` mục 1 ghi *"`REPORT_UPHELD` vẫn TẮT"*, trong khi `11-point` mục 7 ghi *"đã bật
29/09"*. Đọc thẳng từ database: `version 2`, `+5` điểm, trần `5/ngày`, `is_enabled = true` —
**11 đúng, 06 lạc hậu**, đã sửa 01/10.

Đó chính là lý do file này tồn tại. Ba mươi tài liệu, mỗi cái một mục "Chỗ cần soát", thì một
mục đóng lại ở chỗ này mà đứng im ở chỗ kia là chuyện sẽ xảy ra — và khi hai tài liệu nói trái
nhau, người đọc tin cái họ mở trước.
