# Đặc tả chức năng — Chân Tâm MVP Phase 1

Tổng hợp từ ba bảng của Bên A: bảng bóc tách chức năng, bảng chức năng không giá, và bảng
ngưỡng điểm/cống hiến. **72 chức năng, toàn bộ P0, toàn bộ thuộc MVP Phase 1.**

## Cách đọc

- Mã **F01–F72** khớp cột `STT` của bảng gốc — dùng để đối chiếu hợp đồng khi nghiệm thu.
- **⚠️** đánh dấu chỗ **chưa chốt và đang chặn implement**. Tổng hợp ở [§17](#17-đối-chiếu-giá-trị-cấu-hình--quyết-định-chính-thức-từ-srs-v1150).
- **⛔** đánh dấu **mâu thuẫn nội tại** cần Bên A quyết trước khi code.
- Mỗi mục chỉ ghi thứ làm thay đổi cách hiện thực. Phần hiển nhiên (form, nút bấm) lược bỏ.

## Nền tảng kỹ thuật

Flutter (Android + iOS) · NestJS + PostgreSQL 16 + PostGIS · Redis · Socket.io · Cloudflare R2
· Firebase FCM · React (Admin CMS) · Nginx + Docker trên VPS.

## Bảng tra nhanh

| # | Phân hệ | Mã | Ghi chú |
|---|---|---|---|
| 1 | [Xác thực & Tài khoản](#1-xác-thực--tài-khoản) | F01–F06 | Không có eKYC/CCCD |
| 2 | [Hồ sơ, Rank & Referral](#2-hồ-sơ-rank--referral) | F07–F13 | Rank xét theo current balance (CHỐT-01) |
| 3 | [Đăng tin & Nội dung](#3-đăng-tin--nội-dung) | F14–F24 | 5 loại bài khác nhau; vòng đời 3 tháng |
| 4 | [Quanh Đây & Bản đồ GIS](#4-quanh-đây--bản-đồ-gis) | F25–F29 | Chỉ bản đồ toàn màn hình, không có feed |
| 5 | [Giao dịch & FSM](#5-giao-dịch--fsm) | F30–F36 | Lõi nghiệp vụ |
| 6 | [Chat Realtime 1-1](#6-chat-realtime-1-1) | F37–F38 | Text + ảnh (tối đa 3/tin) |
| 7 | [Điểm, Review & Accuracy](#7-điểm-review--accuracy) | F39–F43 | Accuracy dùng % (CHỐT-03) |
| 8 | [Thông báo & Lịch Âm](#8-thông-báo--lịch-âm) | F44–F47 | |
| 9 | [Báo cáo & Chống gian lận](#9-báo-cáo--chống-gian-lận) | F48–F50 | |
| 10 | [Group, Affiliate & Geo](#10-group-affiliate--geo) | F51–F58 | Toàn bộ event cần Geo Group (CHỐT-06) |
| 11 | [Phật Pháp – Dharma Hub](#11-phật-pháp--dharma-hub--community) | F73 | Main Tab 3 trong Bottom Navigation |
| 12 | [Đổi vật phẩm bằng điểm, Vận chuyển & Tương tác](#12-đổi-vật-phẩm-bằng-điểm--vận-chuyển) | F74–F81 | Điểm khả dụng, chế độ chọn, like, bảo vệ thông tin |
| 13 | [Admin CMS](#13-admin-cms-campaign--blog) | F59–F65 | |
| 14 | [Hạ tầng & Bảo mật](#14-hạ-tầng--bảo-mật) | F66–F68 | |
| 15 | [QA & UAT](#15-qa--uat) | F69–F70 | |
| 16 | [Triển khai & Bàn giao](#16-triển-khai--bàn-giao) | F71–F72 | |

---

## 1. Xác thực & Tài khoản

> Đăng ký **không cần CCCD, không cần cả email lẫn số điện thoại**. Đây là khác biệt lớn
> nhất so với tài liệu định hướng ban đầu, và nó loại bỏ phần lớn nghĩa vụ pháp lý về dữ
> liệu cá nhân.

### F01 — Đăng ký tài khoản tối thiểu
Username + password + xác nhận mật khẩu. Không yêu cầu email/SĐT, không xác minh email.
Đăng ký xong tự đăng nhập luôn.

### F02 — Đăng nhập đa định danh & chống dò mật khẩu
Đăng nhập bằng username, hoặc bằng email/SĐT nếu người dùng đã bổ sung sau. Kiểm tra trạng
thái ban trước khi cấp token. Sai nhiều lần thì rate-limit rồi khoá tạm.

### F03 — Vòng đời Refresh Token
Access token ngắn hạn, refresh token lưu trong secure storage của thiết bị. Client tự refresh
và chạy lại request đã hỏng. Token hết hạn thì thu hồi.

### F04 — Đăng xuất & thu hồi phiên
Thu hồi token và refresh session, **đồng thời xoá FCM token của thiết bị** để máy đã đăng
xuất không còn nhận push.

### F05 — Quên mật khẩu & kênh Admin dự phòng
Có email/SĐT thì khôi phục qua OTP. Không có thì hiển thị kênh liên hệ Admin.

> ✅ **Đã chốt theo SRS v1.15.0 (CHỐT-04):** Khi không có Email/SĐT, user tự liên hệ Admin support để được hỗ trợ. Ứng dụng chỉ hiển thị hướng dẫn và kênh liên hệ support; quy trình xác minh hỗ trợ thực hiện theo vận hành ngoài của Admin.
>
> 🟡 **Đã chốt email là kênh OTP đầu tiên, nhưng chưa có adapter/vendor credential gửi thật.**
>
> ⛔ **Chưa có nhà cung cấp gửi mã.** Hợp đồng không nêu dịch vụ email/SMS/Zalo ZNS nào.
> Hiện chạy `LoggingOtpSender`: ở môi trường phát triển thì ghi mã ra log, còn ở production
> thì **tự tắt chức năng** — mọi yêu cầu đặt lại mật khẩu trả về kênh `ADMIN_SUPPORT` và
> không mã nào được ghi ra log.

Đã làm: tài khoản không tồn tại và tài khoản không có email/SĐT trả lời **giống hệt nhau**,
nếu không thì endpoint này thành công cụ dò username có thật. Đổi mật khẩu xong thu hồi
toàn bộ phiên, **kể cả access token còn hạn** (xem `docs/plan/M1.md`, lát 3).

### F06 — Xoá tài khoản & ẩn danh hoá
- **Chặn xoá** khi còn giao dịch dở dang.
- Xoá xong thì ẩn danh dữ liệu cá nhân, **giữ nguyên lịch sử giao dịch và ledger**.
- Nếu người xoá là Owner của một Group → Group giải tán (xem [F55](#f55--owner-xoá-tài-khoản--group-giải-tán)).
- Bắt **nhập lại mật khẩu**: xoá không hoàn tác được, mà access token có thể đang ở tay
  người mượn máy.
- **Giữ nguyên username.** Nó là biệt danh tự chọn, không phải dữ liệu định danh bắt buộc,
  và giữ lại thì không ai đăng ký đúng tên đó để mạo danh trong lịch sử giao dịch cũ.

> ⚠️ Chặn "còn giao dịch dở dang" chờ bảng `transactions` ở M3.

---

## 2. Hồ sơ, Rank & Referral

### F07 — Cổng hoàn thiện hồ sơ
Trước khi **đăng bài**, hồ sơ phải đủ: Họ tên, Avatar, SĐT, Email. Kiểm tra định dạng và
trùng lặp khi bổ sung.

> ✅ **Chốt 2026-09-24:** cổng chặn **đăng bài, xin nhận, chat và tạo Group** — không chỉ
> riêng đăng bài.

### F08 — Hồ sơ cá nhân & thống kê
Avatar, Rank, điểm hiện tại, tiến độ tới mốc kế tiếp, hoạt động Cho/Nhận, quyền đang có,
lịch sử liên quan.

### F09 — Xác minh SĐT & thưởng lần đầu
Sự kiện `PHONE_VERIFIED_FIRST_TIME` **chỉ thưởng đúng một lần**, đi qua Point Ledger với
khoá idempotency. Đổi SĐT về sau không thưởng lại.

### F10 — Hồ sơ công khai & chia sẻ
Trang công khai hiển thị rank, điểm, thành tích, các mục đang Cho / Muốn nhận. Có deep link
để chia sẻ. **Dữ liệu nhạy cảm bị che theo policy.**

### F11 — Vị trí mặc định
Người dùng chọn trên bản đồ hoặc lấy GPS, rồi **xác nhận** mới lưu.

**Default Location ≠ Current GPS.** Đây là hai khái niệm tách biệt và cả hệ thống phụ thuộc
vào sự tách biệt đó: Default Location là giá trị mặc định khi đăng bài và là **điều kiện bắt
buộc để tạo Group** ([F52](#f52--tạo-group-từ-default-location)), còn Current GPS chỉ dùng
cho bản đồ tại thời điểm xem.

### F12 — Rank 5 tầng & chu kỳ duy trì 3 tháng

**Năm bậc:** Viewer → Member → Bạc → Vàng → Kim Cương.

| Rank | Ngưỡng điểm | Bước nhảy | Cảnh báo tại 70% |
|---|---:|---:|---:|
| Viewer | 0 | — | — |
| Member | 224 | +224 | 157 |
| Bạc | 672 | +448 | 470 |
| Vàng | 896 | **+224** | 627 |
| Kim Cương | 1792 | +896 | 1254 |

> ✅ **Đã chốt chính thức theo SRS v1.15.0 (BR-PROF-RANK-02):** Ngưỡng tham chiếu: Member 224, Bạc 672, Vàng 896, Kim Cương 1792. Ngưỡng được lưu dạng cấu hình để Admin có thể điều chỉnh qua CMS.

> ✅ **Chốt 2026-09-24 — căn cứ xét hạng:** **point balance hiện tại**, một cơ chế duy nhất.
> Tiêu điểm thì tụt hạng; mức tụt xét lại theo ngưỡng hiện tại, **không ép đúng một bậc**.
> Trượt nhiệm vụ duy trì **bị trừ N điểm** (Admin cấu hình) rồi rank tự xét lại theo balance
> mới — nhiệm vụ tác động gián tiếp qua điểm để không có hai cơ chế cùng quyết một thứ.
> [F76](#f76--điểm-khả-dụng--bảo-vệ-rank-đã-huỷ) đã huỷ.
>
> ⚠️ **Chưa hiện thực.** Code hiện xét hạng theo `lifetime` (`rank.repository.ts:387`), và cột
> *Cảnh báo tại 70%* chưa có đường nào gửi. Đây là mâu thuẫn đã biết giữa tài liệu và code.

**Điều kiện lên Bạc:** 1 giao dịch Cho hoàn tất + 1 Personal Referral hợp lệ (áp dụng cho Member).

**Nhiệm vụ duy trì mỗi 3 tháng** — áp dụng cho Bạc, Vàng và Kim Cương, nhắc trước 1 tháng (SRS v1.15.0 - BR-PROF-RANK-03):

| Rank | Mỗi quý (chu kỳ 3 tháng) | Ghi chú |
|---|---|---|
| Bạc | 2 Cho hoàn tất + 2 referral hợp lệ | Viewer/Member không có cơ chế tụt theo chu kỳ |
| Vàng | 3 Cho hoàn tất + 3 referral hợp lệ | Nhắc cảnh báo trước 1 tháng |
| Kim Cương | 4 Cho hoàn tất + 4 referral hợp lệ | Nhắc cảnh báo trước 1 tháng |

> ✅ **Cơ chế Rank đã chốt chính thức (SRS v1.15.0 - CHỐT-01, BR-PROF-RANK-04/06):**
> 1. **Rank được xác định theo số Điểm Cống hiến hiện tại (current point balance)** của user.
> 2. Khi số điểm hiện tại giảm xuống dưới ngưỡng của Rank đang có, hệ thống **tự xác định lại Rank theo ngưỡng điểm hiện tại** (ví dụ: Vàng 600, Bạc 400; đang Vàng mà điểm giảm còn 450 thì tự xuống Bạc).
> 3. Khi Bạc/Vàng/Kim Cương không đạt nhiệm vụ duy trì chu kỳ 3 tháng hoặc điểm giảm, hệ thống xác định lại Rank theo số điểm hiện tại và điều kiện Rank tương ứng; **không bắt buộc chỉ tụt đúng một bậc**.
> 4. **Phase 1 không dùng một `lifetime rank point` riêng** để giữ hạng. Mọi biến động tăng/giảm balance đều trigger đánh giá lại Rank. Owner Group vẫn giữ quyền quản lý Group nếu chỉ tụt Rank (Group chỉ giải tán khi Owner xoá tài khoản).
>
> ℹ️ Code hiện đọc các con số này từ bảng `rank_tiers`, không hardcode. Chu kỳ đã mở giữ **ngưỡng của chính nó** (`policy` theo hạng ghi trên cycle), nên đổi số giữa chừng không làm thay đổi kết quả một chu kỳ đang chạy.

**Điểm dư:** không tự trừ khi lên hạng. Chỉ trừ khi có chương trình đổi điểm cụ thể **và người dùng xác nhận**. Mặc định **không quy đổi ra tiền mặt**.

### F13 — Referral cá nhân, thưởng một lần
Mã/link cá nhân **chỉ áp dụng cho tài khoản mới**. Thưởng đúng một lần khi người mới đăng ký
thành công. Quan hệ referral là **bất biến** sau khi tạo — không sửa, không chuyển.

---

## 3. Đăng tin & Nội dung

Năm loại nội dung dùng chung khung đăng bài: **Muốn Tặng**, **Muốn Nhận**, **Từ thiện/Hoạt
động**, **Rao vặt**, **Công đức/Hồi hướng**.

### F14 — Danh mục động dạng cây
Mỗi bài có `category_id`. Admin quản lý `name / slug / icon / order / active / parent`.
**Không xoá cứng** danh mục đang có bài dùng — chỉ được tắt.

Mỗi danh mục khai báo `postTypes` — dùng được cho những loại bài nào. `GET /api/v1/categories?postType=CLASSIFIED`
trả đúng cây cho form đăng tin rao vặt; bỏ trống trả cả cây. Nhánh cha không khớp vẫn
được giữ nếu có con khớp, để cây không đứt.

### F15 — Đăng Muốn Tặng
Ảnh, thông tin vật phẩm, tình trạng, mô tả, vị trí. Kiểm tra **quota theo Rank** trước khi
cho đăng. Quota nằm trong `capability_rank_values` và Admin sửa được lúc chạy qua
`POST /api/v1/admin/entitlements` — mặc định Viewer 0, Thành viên 3, Bạc 10, Vàng 20,
Kim Cương 50. ⚠️ *Các con số này là giả định, chờ Bên A xác nhận.*

Form đăng bài còn có thêm hai trường:

- **Giá trị tham khảo (VNĐ)** — cơ sở tính số điểm cần để đổi vật phẩm, xem [F74](#f74--giá-trị-tham-khảo--tỷ-lệ-quy-đổi-điểm).
- **Hình thức nhận đồ** — tự đến lấy hoặc người cho hỗ trợ ship, xem [F78](#f78--hình-thức-vận-chuyển).

### F16 — Đăng Muốn Nhận
Nhu cầu nhận vật phẩm hoặc hỗ trợ, kèm danh mục và vị trí/phạm vi. Cũng có quota theo Rank.
Được ghép với bài Muốn Tặng qua Smart Match.

### F17 — Smart Match & SOS
Gợi ý theo **danh mục + khoảng cách + từ khoá**. Phase 1 chỉ dùng rule, không dùng học máy.

**Smart Match chỉ gợi ý — tuyệt đối không tự tạo giao dịch.** Quyết định cuối luôn thuộc về
con người.

Đã có: `GET /api/v1/posts/:postId/matches` ghép Muốn Nhận ↔ Muốn Tặng. Điểm khớp trong
[0, 1] gồm cùng danh mục 0.5, trùng từ khoá 0.3, khoảng cách 0.2; mỗi gợi ý kèm `reasons`
để giao diện nói được vì sao bài đó hiện ra. Chỉ tác giả bài nguồn gọi được, vì vị trí thật
của bài được dùng làm tâm tìm kiếm — toạ độ bài gợi ý vẫn bị làm nhiễu và khoảng cách làm
tròn theo bậc như mọi kênh công khai khác.

SOS / Cần gấp mở theo quyền Rank. Quyền này là capability `POST_SOS` trong
`capability_rank_values`, Admin bật/tắt theo từng Rank lúc chạy qua
`POST /api/v1/admin/entitlements` — mặc định Bạc trở lên được dùng, Viewer và Thành viên
không. ⚠️ *Ngưỡng này là giả định, chờ Bên A xác nhận.*

### F18 — Từ thiện / Hoạt động
Admin tạo trực tiếp. **Thành viên Kim Cương** được tạo đề xuất, chờ Admin duyệt. Người dùng
đăng ký hoặc huỷ trước khi sự kiện bắt đầu; đánh giá sau khi kết thúc.

### F19 — Rao vặt giá rẻ
Người bán tự khai **giá tham khảo** và **giá bán**. Hệ thống chỉ tính tỷ lệ chênh lệch;
**không xác minh giá thật và không ép mức giảm tối thiểu**.

Hết 3 tháng → **tự chuyển thành bài Muốn Tặng** kèm thông báo.

> ✅ **Đã chốt chính thức (SRS v1.15.0 - CHỐT-05 & Mục 3.3.6):** Hệ thống không xác minh giá trị thực và không ép mức giảm tối thiểu; UI chỉ hiển thị giá tham khảo, giá bán và % chênh lệch. Nếu hết 3 tháng người dùng không huỷ/đóng bài, hệ thống **tự động chuyển sang Muốn Tặng** và gửi notification (không đòi hỏi xác nhận lại tại thời điểm chuyển). Thời hạn có thể được Admin cấu hình theo Rank.

### F20 — Giới thiệu / Quảng cáo (Phase 1)
**Chỉ Admin tạo từ CMS** — người dùng không tự đăng quảng cáo. Gồm banner, nội dung, CTA và
deep link, đặt ở các vị trí app đã hỗ trợ sẵn.

### F21 — Công đức / Hồi hướng
Hiển thị đối tượng/đơn vị **đã được Admin xác minh**, kèm liên kết hoặc QR.

**Ứng dụng không giữ tiền và không làm trung gian thanh toán.** Quyết định này tránh cho dự
án rơi vào phạm vi điều chỉnh về vận động và phân phối nguồn đóng góp tự nguyện.

### F22 — Vòng đời bài Muốn Tặng & gia hạn

```
Draft ──▶ Published ──▶ Matched / In Transaction ──▶ Completed
              │
              └── quá 3 tháng chưa có người nhận ──▶ hết hạn
```

- Bài chưa có người nhận tồn tại **tối đa 3 tháng**.
- **Gia hạn tối đa 1 lần**, reset thêm 3 tháng, và **tính quota như một bài mới**.

### F23 — Chuyển vật phẩm về điểm từ thiện
Trước khi bài hết hạn, người đăng có thể **yêu cầu chuyển** vật phẩm cho điểm từ thiện hoặc
Admin. Admin duyệt. Quá thời hạn chờ thì bài bị loại khỏi danh sách hoạt động nhưng
**lịch sử và audit vẫn giữ**.

### F24 — Media R2, vị trí bài & quyền riêng tư
- Ảnh lưu **Cloudflare R2 qua presigned URL** — client upload thẳng, không đi qua server.
- Vị trí bài do người dùng **xác nhận**, không lấy ngầm.
- Dữ liệu nhạy cảm trong hồ sơ **không tự công khai**; chỉ mở theo policy hoặc theo trạng
  thái giao dịch.

---

## 4. Quanh Đây & Bản đồ GIS

> **"Quanh Đây" là bản đồ, không phải danh sách.** Tab này không có feed riêng, không phải
> một loại bài đăng, và không có màn chi tiết riêng — nó chỉ khám phá theo không gian rồi
> điều hướng sang module nguồn.

### F25 — Bản đồ toàn màn hình
Hiển thị marker từ nhiều nguồn dữ liệu hợp lệ trên cùng một bản đồ.

### F26 — GPS hiện tại & dự phòng Default Location
Ưu tiên GPS khi được cấp quyền. Không có quyền thì lùi về Default Location ([F11](#f11--vị-trí-mặc-định)).
Không có cả hai thì xử lý theo trạng thái rỗng.

### F27 — Nạp dữ liệu theo khung nhìn
Nạp theo vùng bản đồ đang xem (bounding box), có thao tác **"Tìm trong khu vực này"** và
kiểm soát tần suất gọi API khi người dùng kéo/zoom liên tục.

### F28 — Gom cụm marker & bộ lọc
Gom cụm khi thu nhỏ. Lọc theo loại nội dung, danh mục, khoảng cách, layer.

### F29 — Thẻ xem nhanh & deep link
Chạm marker mở thẻ xem nhanh. Xem đầy đủ thì **điều hướng sang màn Detail của module nguồn**
— Quanh Đây không tự duy trì màn chi tiết.

---

## 5. Giao dịch & FSM

Đây là lõi nghiệp vụ. Máy trạng thái:

```
                     ┌──────────── huỷ ────────────┐
                     ▼                              │
Request ──duyệt──▶ ACCEPTED ──xác nhận──▶ COMPLETED │
   │                  │                             │
   │                  └── 5 ngày không động ─────────┘
   │                            ▼
   └──▶ Standby Queue      (tự COMPLETED)
```

### F30 — Gửi yêu cầu xin nhận
**Một người chỉ có một yêu cầu hợp lệ trên cùng một bài** (ràng buộc unique ở tầng database,
không chỉ kiểm ở tầng ứng dụng). Kèm lời nhắn và metadata. Có chống spam và idempotency.

### F31 — Danh sách ứng viên & quyền chọn
Người cho xem và duyệt ứng viên, phạm vi quyền theo Rank. Gợi ý xếp hạng và duyệt hàng loạt
**chỉ là gợi ý** — quyết định cuối thuộc về người cho hoặc Admin.

Việc xét người nhận chạy trong **countdown 7 ngày**, và có thể bị cắt ngắn nếu một ứng viên
dùng điểm đổi thẳng vật phẩm — xem [F75](#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm).

### F32 — Phân bổ số lượng lớn & khoá tồn kho
Bài có nhiều vật phẩm thì `remaining_quantity` phải **giảm nguyên tử**.

> Phải dùng một câu lệnh dạng `UPDATE ... WHERE remaining_quantity > 0 RETURNING`, **không
> đọc-rồi-ghi ở tầng ứng dụng**. Một nghìn người xin cùng lúc sẽ phát vượt kho.

### F33 — Hàng đợi dự phòng
Ứng viên chưa được chọn nằm trong hàng đợi (`STANDBY`). Khi giao dịch bị huỷ, hệ thống **đề
xuất và thông báo** người kế tiếp — **không tự trao** khi chưa có xác nhận của người cho.

Thứ tự đề xuất theo **thứ tự ưu tiên Admin cấu hình** (CH-1), không cố định: `QUEUE_JOINED_EARLIEST`,
`HIGHEST_RANK`, `NEAREST`, `FEWEST_RECEIVED`, `FEWEST_CANCELLATIONS`. Cùng một chính sách
dùng cho [F75](#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm). Xem
[ASSUMPTIONS · CH-1](./plan/ASSUMPTIONS.md#ch-1--thứ-tự-ưu-tiên-chọn-người-nhận-admin-cấu-hình).

### F34 — Chấp nhận giao dịch & mở chat
Khi duyệt người nhận, **trong cùng một transaction database**: tạo Transaction trạng thái
`ACCEPTED`, cập nhật trạng thái bài và số lượng còn lại, mở phòng chat 1-1.

### F35 — Huỷ giao dịch
Người cho được huỷ theo rule. **Ghi lại số lần huỷ** để phục vụ đánh giá về sau. Huỷ thì giải
phóng tài nguyên và chuyển gợi ý sang ứng viên kế tiếp trong hàng đợi.

### F36 — Người nhận xác nhận & tự động hoàn tất sau 5 ngày
Người nhận xác nhận đã nhận → `COMPLETED`.

Nếu **5 ngày** sau `ACCEPTED` mà không có huỷ, không có tranh chấp và chưa ai xác nhận →
**tự động COMPLETED**. Chat chuyển sang chỉ đọc.

---

## 6. Chat Realtime 1-1

### F37 — Chat text theo giao dịch
**Chỉ tạo phòng chat khi giao dịch đạt `ACCEPTED`** — không có chat trước đó, kể cả với ứng
viên trong hàng đợi.

Phase 1 là **text và ảnh**: tối đa 3 ảnh mỗi tin nhắn, không file đính kèm khác, không chia
sẻ vị trí. Màn chat hiển thị bối cảnh giao dịch và các hành động hợp lệ theo trạng thái.

> **Đảo quyết định cũ.** Mục này trước ghi "chỉ tin nhắn text: không file đính kèm, không
> ảnh". Bên A chốt bổ sung ảnh — xem §9 của `docs/plan/FEED-INTERACTIONS.md`.
>
> Ba hệ quả đã hiện thực: ràng buộc "nội dung không rỗng" đổi thành *có chữ HOẶC có ảnh* dựa
> trên cột `media_count` ngay trên tin nhắn; ảnh đính trong **cùng lần ghi** vì chat chỉ ghi
> thêm và trigger chặn `UPDATE`; và **xoá chat theo hạn xoá cả ảnh** trên storage — nếu không
> thì lời hứa "tin nhắn sẽ được xoá" chỉ đúng một nửa.
>
> Ảnh bằng chứng lượt trao **không** bị đụng tới: chúng ở bảng riêng và phải sống lâu hơn
> phòng chat.

### F38 — Lưu trữ & khoá chỉ đọc
Tin nhắn **lưu bền vững trước hoặc đồng thời** với lúc phát realtime — không được phát đi rồi
mới lưu. Khi giao dịch `COMPLETED`, lịch sử vẫn xem được nhưng ô soạn tin bị khoá.

---

## 7. Điểm, Review & Accuracy

### F39 — Rule Engine & Point Ledger

**Point Ledger là nguồn sự thật duy nhất của số dư điểm.**

- Mọi cộng/trừ đều **theo rule do Admin cấu hình**. Cấm hard-code các mức `+1 / +2 / +50 / +100`.
- Mỗi bút toán có: `reference`, khoá idempotency, `delta`, `balance_after`, `actor`, `source`,
  `created_at`.
- **Không bao giờ sửa balance trực tiếp.** Sửa sai bằng bút toán âm (reversal), không bằng
  UPDATE.

### F40 — Điểm theo giá trị vật phẩm
**Người nhận** đánh giá vật phẩm đạt bao nhiêu phần trăm giá trị thực tế. 100% ứng với X điểm
do Admin cấu hình; các mức khác theo bảng mapping.

**Giá do người tặng khai chỉ mang tính tham khảo** — đây là điểm then chốt chặn việc khai
khống để cày điểm.

**Chốt 2026-09-24 — cách tính:**

```
Có đánh giá    → điểm cấu hình × x%   (x do người nhận chấm, 0–100)
Không đánh giá → sau N ngày áp mức mặc định (Admin cấu hình cả N lẫn mức %)
```

Mức áp mặc định **không tính vào mẫu Giver Accuracy** — nó là giá trị hệ thống tự điền, không
phải ý kiến người thật.

> ✅ **Chốt 2026-09-25: X = 56** (`point_rules.GIFT_COMPLETED`, cap 5/ngày, Admin sửa lúc chạy).
> Suy ra từ chính các con số đã chốt — toàn bộ hệ điểm là bội số của 56: giới thiệu 56, xác minh
> SĐT 28, onboarding 224, ngưỡng rank 224/672/896/1792 = 56 × 4/12/16/32.
>
> Mức mặc định khi người nhận không đánh giá: **80% sau 7 ngày**
> (`system_configs.review.grace`).
>
> ⛔ **Chưa có đường nào gọi tới rule này** — hoàn tất lượt trao vẫn chưa cộng điểm.

### F41 — Điểm cho Like / Comment / Report
Chỉ phát sinh điểm **khi Admin bật rule**. Có cap, idempotency và chống spam.
Report **chỉ được thưởng sau khi Admin xác minh**, không thưởng ngay lúc gửi.

> ⚠️ Tài liệu tự ghi "hiện không chốt cap số lần cố định" cho report.

### F42 — Đánh giá chất lượng sau giao dịch
Sau `COMPLETED`, **hai bên cùng đánh giá** trải nghiệm. Review Quality **tách khỏi Point
Ledger**, trừ khi có Point Rule gắn riêng.

### F43 — Chỉ số Giver Accuracy (0–100%)
Người nhận chấm mức chính xác của mô tả so với thực tế.

- Chỉ tính chỉ số tổng hợp **khi đã có đủ 5 mẫu hợp lệ** — tránh kết luận từ một lần đánh giá.
- Dưới 75% → chuyển trạng thái `REVIEW_REQUIRED`, **không tự động phạt**. Admin xem xét.

---

## 8. Thông báo & Lịch Âm

### F44 — Push FCM & thông báo trong ứng dụng
Thông báo quan trọng **vừa push vừa lưu in-app** — người dùng tắt push vẫn không mất thông
tin. Có trạng thái đã đọc/chưa đọc. Nguồn kích hoạt: giao dịch, chat, kiểm duyệt, điểm, rank.

### F45 — Phân loại & mẫu thông báo
Tám nhóm: hướng dẫn, điểm, sự kiện, trạng thái, thưởng, cảnh báo, liên lạc, điều kiện. Mẫu
nội dung, đối tượng nhận và điều kiện gửi đều do Admin quản lý.

### F46 — Lịch Âm & nhắc ngày lễ
Lịch Âm Việt Nam, thông báo ngày rằm, mùng một và các đại lễ Phật giáo theo cấu hình. Tính
toán chạy **ngay trên thiết bị**, không cần mạng.

### F47 — Thông báo theo khu vực
Một số thông báo về Group và sự kiện có điều kiện địa lý. **Rule geo của thông báo độc lập
với quy tắc thành viên và với phần thưởng affiliate** — ba thứ khác nhau, không dùng chung
logic.

---

## 9. Báo cáo & Chống gian lận

### F48 — Báo cáo kèm bằng chứng
Người dùng báo cáo bài hoặc người dùng khác theo nhóm vi phạm, kèm mô tả và ảnh bằng chứng.
Tạo ticket trạng thái `PENDING`.

### F49 — Tín hiệu kiểm duyệt & chế tài

**Nhiều report chỉ là tín hiệu ưu tiên xử lý, không mặc định là bằng chứng.** Nguyên tắc này
chặn việc dùng report làm vũ khí tấn công người khác.

Admin có thể: nhắc nhở, ẩn bài, trừ điểm, hạn chế quyền, treo hoặc khoá tài khoản. **Mọi thao
tác đều phải ghi audit.**

### F50 — Chống gian lận referral & điểm
Theo dõi tín hiệu bất thường về referral, điểm và giao dịch. **Không dùng một tín hiệu đơn lẻ
để kết luận.** Thu hồi điểm bằng bút toán âm trong ledger.

> Không được đẩy mục này sang sau. Cơ chế duy trì Rank đòi hỏi referral liên tục (xem
> [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng)), nên tài khoản ảo là đường tấn công rẻ
> nhất. Phải làm cùng lúc với Affiliate Engine.

---

## 10. Group, Affiliate & Geo

> Phân hệ phức tạp nhất và hoàn toàn mới so với tài liệu định hướng ban đầu.

### F51 — Quyền tạo Group
Mặc định chỉ **Kim Cương** được tạo Group; Admin có thể đổi Rank yêu cầu. **Mỗi người tối đa
1 Group** và sở hữu tối đa 1 Group chính.

### F52 — Tạo Group từ Default Location
Đường đi: Hồ sơ → Nhóm của tôi → Tạo nhóm. **Bắt buộc phải có Default Location trước.**

Tâm và bán kính được **chụp lại (snapshot) tại thời điểm tạo**, và **Owner không tự đổi được
về sau** — nếu không, người ta sẽ dời vùng theo nơi có nhiều sự kiện để gom điểm.

> ✅ Bán kính snapshot từ **Rank Config** lúc tạo (BR-GRP-03) — mặc định 10km, Admin chỉnh
> trong khoảng 1–50km.

### F53 — Quản lý Group & Sub-team
Owner quản lý: tổng quan, thành viên, sub-team, link mời, hoạt động, affiliate/điểm, cài đặt.
**Thành viên thường không có dashboard của Owner.**

> ✅ **Đã chạy 26/09:** `GET /groups/:groupId/members`, `GET|POST /groups/:groupId/sub-teams`,
> `PATCH /groups/:groupId/members/:memberId` (xếp vào tổ / đổi vai). Phép kiểm quyền mang
> `groupId`, tổ phải thuộc chính nhóm đó, và **không gán được vai `OWNER`**.

> ✅ **Chốt 2026-09-24:** sâu **1 tầng** (Group → Sub-team). Sub-team **có trưởng nhóm**, vai
> `SUBTEAM_ADMIN`, quyền do Admin hệ thống cấu hình lúc chạy.
>
> Quyền nhóm đi **bảng riêng, không dùng chung `admin_permissions`**: RBAC Admin là toàn cục
> nên gán `group.member.remove` cho một trưởng nhóm là cho họ quyền trên *mọi* nhóm. Phép kiểm
> luôn mang phạm vi — `hasGroupPermission(userId, groupId, permission)`. Xem
> [ASSUMPTIONS.md](./plan/ASSUMPTIONS.md#rbac-cho-group-và-sub-team).
>
> ⚠️ SRS không có khái niệm trưởng nhóm (BR-GRP-05 chỉ chia Owner/Member) — đây là **mở rộng
> SRS**, không phải làm rõ.

### F54 — Link mời — chỉ dành cho tài khoản mới
Membership và quan hệ affiliate **chỉ tạo cho tài khoản đăng ký mới qua link mời**. Tài khoản
cũ không join được. Phase 1 người dùng **không rời và không chuyển Group**.

> ✅ **Chốt 2026-09-24: đúng là chủ ý.** Không rời, không chuyển (BR-GRP-06). Muốn sang nhóm
> khác thì tạo tài khoản mới và vào bằng link mời. Chính ràng buộc "link chỉ dành cho tài khoản
> mới" là hàng rào chặn việc nhảy vòng quanh các nhóm để gom affiliate.
>
> ✅ **Đã chạy 26/09:** `POST /auth/register` nhận thêm `inviteCode` — đường **duy nhất** sinh
> membership. Mã sai hoặc nhóm đã giải tán thì **đăng ký vẫn thành công**, chỉ là không vào
> nhóm nào. `UQ_group_memberships_user` ràng trên `user_id` một mình nên database chặn luôn
> việc thuộc hai nhóm, không chỉ tầng ứng dụng.

### F55 — Owner xoá tài khoản → Group giải tán
Group chuyển `DISSOLVED/CLOSED`, link mời vô hiệu, dừng nhận thành viên/sự kiện/affiliate
mới. **Lịch sử membership, ledger và audit giữ nguyên.**

### F56 — Affiliate Event Engine
- **Phase 1 depth = 1** — chỉ một tầng, không phân tầng sâu.
- Sự kiện hợp lệ **có thể phát sinh nhiều lần** (recurring), khác với referral cá nhân chỉ
  thưởng một lần.
- Mỗi sự kiện nguồn sinh bản ghi thưởng cho **toàn bộ Active Member** của Group.
- Có chống cộng lặp và có cơ chế thu hồi.

> ✅ **Chốt 2026-09-24:** `users.last_login_at` quá **90 ngày** thì coi như không hoạt động,
> kiểm bằng job nền. Mốc này cập nhật **mỗi lần refresh token**, không chỉ lúc nhập mật khẩu —
> app mobile giữ refresh token nên hiểu theo nghĩa đen sẽ đánh nhầm người đang dùng đều thành
> không hoạt động.

### F57 — Điều kiện địa lý bắt buộc

**Toàn bộ Affiliate Event phải nằm trong bán kính Group thì mới được cộng điểm.** Ngoài vùng
thì vẫn ghi nhận nhưng gắn `NOT_ELIGIBLE_GEO` và `point_delta = 0`.

Đây là hàng rào chính chống việc lập nhóm ảo rải khắp nơi để gom điểm. Dùng `ST_DWithin` với
index GiST.

### F58 — Thứ tự ưu tiên vị trí & audit
Thứ tự lấy vị trí để xét: **vị trí sự kiện → vị trí giao dịch → vị trí bài đăng → Default
Location**. Không có vị trí hợp lệ nào thì **chưa đủ điều kiện**, không mặc định cho qua.

Khi ghi audit phải **lưu cả khoảng cách đo được và bán kính đã áp dụng** — nếu không, tranh
chấp về sau không có cách nào tra lại.

---

## 11. Phật Pháp – Dharma Hub & Community

### F73 — Phật Pháp (Dharma Hub)
Main Tab thứ 3 trong Bottom Navigation Bar (5 entry points: Khám phá, Quanh đây, Phật Pháp, Hoạt động, Cá nhân).

Layer 1 là Dharma Hub, hiển thị các lối vào:
- **Kinh sách**: Đọc và tra cứu kinh sách Phật giáo theo chuyên mục.
- **Tụng kinh**: Nghi thức và nội dung tụng kinh hằng ngày/ngày lễ.
- **Hồi hướng**: Nhập lời hồi hướng (mặc định public, có tuỳ chọn ẩn danh), kết nối công đức.
- **Cúng / Công đức**: Thông tin cúng dường các đơn vị/chùa đã được Admin xác minh qua VietQR/ngân hàng.
- **Diễn đàn Phật Pháp**: Thảo luận, chia sẻ Phật pháp cộng đồng (dùng chung Post/Comment/Moderation).
- **Thông tin & Giới thiệu chùa**: Dữ liệu và hình ảnh giới thiệu các ngôi chùa, tự viện (dùng chung CMS Content Engine).

Tận dụng hạ tầng hiện có: CMS Content Engine, Post/Comment, Media R2, Moderation và In-App Notification.

---

## 12. Đổi vật phẩm bằng điểm & Vận chuyển

> Nguồn: yêu cầu bổ sung của Bên A (`srs/new-req.txt`). Cơ chế này **chốt luôn** cách
> Điểm Cống Hiến được tiêu, và qua đó chốt cả cách bảo vệ Rank — xem [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng).

### F74 — Giá trị tham khảo & tỷ lệ quy đổi điểm

Khi đăng bài Muốn Tặng, người cho khai **giá trị tham khảo** của vật phẩm bằng VNĐ. Hệ thống
lấy giá trị đó chia cho tỷ lệ quy đổi để ra số điểm cần có nếu muốn đổi thẳng vật phẩm.

**Tỷ lệ quy đổi do Admin cấu hình, tuyệt đối không hard-code.** Ví dụ Admin đặt
`1 điểm = 1.000 VNĐ`, thì vật phẩm khai 1.000.000 VNĐ cần 1.000 điểm. Admin đổi tỷ lệ thì hệ
thống áp theo cấu hình mới.

> Tỷ lệ này thuộc nhóm cấu hình động, đi cùng đường với quota theo rank: sửa được lúc chạy,
> có phiên bản, có audit. Xem [ADMIN-CONFIG-DESIGN.md](./plan/ADMIN-CONFIG-DESIGN.md).

> ✅ **Chốt 2026-09-25: 2.000 VNĐ/điểm** (`system_configs.point.redemption`). Món khai
> 1.000.000 VNĐ cần **500 điểm** — khoảng 9 lượt trao ở mức 100%. Chọn theo câu trả lời được
> — *"tặng bao nhiêu món thì đổi được một món tương đương"* — chứ không theo cảm giác về giá
> trị một điểm. Ví dụ `1 điểm = 1.000 VNĐ` ở trên chỉ minh hoạ cú pháp; nó ngụ ý phải tặng 18
> món, nhiều khả năng không ai chủ ý vậy.

> ⚠️ **Không nhầm với [F40](#f40--điểm-theo-giá-trị-vật-phẩm).** F40 là *người nhận chấm điểm*
> sau giao dịch để **sinh** điểm cho người cho — giá người cho khai ở đó chỉ mang tính tham
> khảo và cố ý không được tin. F74 là chiều ngược lại: giá khai dùng để **định giá** vật phẩm
> cho người muốn tiêu điểm. Khai khống ở F74 chỉ làm vật phẩm đắt hơn, không tự sinh ra điểm.

### F75 — Countdown 7 ngày & đổi vật phẩm bằng điểm

Khi một bài có người gửi yêu cầu xin nhận, hệ thống mở **countdown tối đa 7 ngày** để xác
định người được nhận. Trong 7 ngày đó, người xin có hai đường:

1. Chờ hệ thống xét theo quy trình thường.
2. Nếu đủ **điểm khả dụng**, xác nhận dùng điểm để đổi thẳng vật phẩm.

**Có người dùng điểm thì chốt ngay.** Giao dịch đổi điểm thành công phải làm trọn vẹn trong
một lần, không được nửa vời:

- Trừ điểm của người xin
- Ghi biến động vào Point Ledger (xem [F77](#f77--ledger-cho-giao-dịch-đổi-điểm))
- **Dừng countdown**
- Chọn người đó làm người nhận chính thức
- **Không** chạy auto-select cho các ứng viên còn lại

Hết 7 ngày mà không ai dùng điểm thì hệ thống tự chọn người nhận theo bộ tiêu chí.

> ✅ **Đã chốt ở [CH-1](./plan/ASSUMPTIONS.md#ch-1--thứ-tự-ưu-tiên-chọn-người-nhận-admin-cấu-hình)
> và đã hiện thực.** Admin xếp thứ tự bộ tiêu chí qua `GET|PUT /api/v1/admin/candidate-selection`;
> mặc định khi chưa cấu hình là **ai xin trước**. Dùng chung với [F33](#f33--hàng-đợi-dự-phòng).

**Ví dụ.** Vật phẩm khai 1.000.000 VNĐ, tỷ lệ 1 điểm = 1.000 VNĐ → cần 1.000 điểm. 10 người
xin, countdown bắt đầu. Ngày thứ 3, User A dùng đủ 1.000 điểm → A được chọn ngay, countdown
kết thúc ở ngày 3, 9 người còn lại không được xét cho vật phẩm đó nữa.

### F76 — ~~Điểm khả dụng & bảo vệ Rank~~ (ĐÃ HUỶ)

> ❌ **Huỷ ngày 2026-09-24 theo quyết định của Bên A.** Giữ mục này để người đọc tài liệu cũ
> không tưởng hệ thống đang hành xử như vậy.

Cơ chế cũ chặn không cho tiêu phần điểm cần để giữ Rank (`Điểm khả dụng = Balance − Ngưỡng
Rank hiện tại`), nên Rank không bao giờ tụt vì tiêu điểm.

**Quyết định mới đi hướng ngược lại:** Rank xét theo **point balance hiện tại**, tiêu điểm tự
do, và **tụt hạng nếu balance rơi dưới ngưỡng**. Không có điểm nào được bảo vệ.

Đổi lại, người dùng phải được **cảnh báo trước khi tụt** — xem cột *Cảnh báo tại 70%* ở
[bảng Rank](#f10--hệ-thống-rank-5-bậc). Không có cảnh báo thì người ta đổi một vật phẩm rồi
sáng hôm sau phát hiện mình đã xuống Bạc mà không ai báo.

Chi tiết và hệ quả: [Mô hình Rank chốt ngày 2026-09-24](./plan/ASSUMPTIONS.md#mô-hình-rank--chốt-ngày-2026-09-24).

### F77 — Ledger cho giao dịch đổi điểm

Mọi lần đổi vật phẩm bằng điểm **phải** được ghi vào Point Ledger. Ledger vẫn là nguồn sự
thật cho mọi biến động cộng/trừ. Tối thiểu phải lưu:

| Trường | Vì sao cần |
| --- | --- |
| Người tiêu điểm | Biết ai trừ |
| Số điểm bị trừ | Số tiền thật của giao dịch |
| Vật phẩm liên quan | Truy ngược về bài đăng |
| Loại transaction | `ITEM_REDEMPTION` |
| Thời gian | Dựng lại dòng thời gian |
| **Reference chống trùng** | Bấm hai lần, retry mạng, hoặc job chạy lại **không được trừ hai lần** |

> Ledger là append-only: đảo một giao dịch là ghi thêm bút toán âm, không sửa và không xoá
> bút toán cũ. Xem [F39](#f39--rule-engine--point-ledger).

### F78 — Hình thức vận chuyển

Luồng tạo bài Muốn Tặng bổ sung trường **hình thức nhận đồ**, người cho chọn ít nhất một
trong hai:

- Người nhận **tự đến lấy**
- Người cho **hỗ trợ ship / gửi vận chuyển**

Bên A đã chốt phần phí (CH-2): bài mang thêm trường **bên trả ship**.

| Trường | Giá trị | Ghi chú |
| --- | --- | --- |
| `deliveryMethod` | `SELF_PICKUP` \| `GIVER_SHIPS` | Hình thức nhận đồ |
| `shipPayer` | `GIVER` \| `RECEIVER` | Chỉ khai được khi `deliveryMethod = GIVER_SHIPS` |

Tự đến lấy thì không có phí nào để mà trả, nên khai bên trả trong trường hợp đó là mở
đường cho một khoản phạt vô nghĩa — chặn ở cả DTO lẫn ràng buộc database.

**Hệ thống không xử lý tiền ship.** Đây là ship COD bên ngoài; trường này chỉ là **dấu
hiệu** ghi ai lẽ ra phải trả. Khi hàng bị hoàn mà người nhận không thanh toán, người gửi
báo qua `POST /transactions/:id/reports/ship-unpaid` và khoản trừ điểm đi qua chính
[point ledger](#f39--rule-engine--point-ledger) với rule `SHIP_UNPAID_PENALTY`.

> Điểm có thể âm. Cột điểm kẹp ở 0 (số **tiêu được**), cột log giữ giá trị **thật** kèm câu
> `-50 điểm, đang âm 30 điểm`. Xem
> [ASSUMPTIONS · CH-2](./plan/ASSUMPTIONS.md#ch-2--phí-vận-chuyển-đánh-dấu-bên-trả-trừ-điểm-khi-không-thanh-toán).

### F79 — Chế độ tìm người nhận bài Muốn Tặng (Selection Modes)

Khi người cho tạo bài đăng Muốn Tặng (`OFFER`), hệ thống hỗ trợ 03 chế độ lựa chọn người nhận (CHỐT-10):

1. **`INSTANT` (Trao ngay lập tức):** Khi người đầu tiên gửi yêu cầu xin nhận hợp lệ, hệ thống tự động chấp nhận (atomic accept) ngay lập tức, chuyển bài sang trạng thái `DELIVERING`, tạo giao dịch và mở phòng chat trực tiếp. Không áp dụng countdown 7 ngày.
2. **`OPTIMAL` (Tìm người nhận tối ưu — Mặc định):** Khi có yêu cầu hợp lệ đầu tiên, hệ thống kích hoạt đồng hồ đếm ngược (countdown) tối đa 7 ngày (`selection_deadline = NOW() + 7 days`). Trong thời gian này, các ứng viên khác có thể tiếp tục gửi yêu cầu hoặc dùng Điểm Cống Hiến để đổi trực tiếp vật phẩm (theo [F75](#f75--dùng-điểm-chốt-ngay-vật-phẩm)). Hết 7 ngày, hệ thống auto-select theo cấu hình của Admin.
3. **`EXTENDED` (Thời gian mở rộng):** Kích hoạt thời gian chờ tối đa 30 ngày (`selection_deadline = NOW() + 30 days`) kể từ yêu cầu đầu tiên. Phù hợp cho các vật phẩm có giá trị cao, cần thêm thời gian xem xét hoặc thẩm định người nhận phù hợp nhất.

### F80 — Quyền riêng tư & Bảo vệ thông tin người cho

Để bảo vệ an toàn thông tin cá nhân và tránh bị làm phiền (CHỐT-11):

- **Kênh đọc công khai:** (Feed danh sách, Quanh đây, Marker bản đồ, Chi tiết bài đăng public) thông tin tác giả bài đăng (`author`) chỉ hiển thị: `id`, `username`, `avatar_url`, `rank`, `joined_at`. Tuyệt đối không trả ra `full_name`, `phone`, và địa chỉ chi tiết (`address`).
- **Gating thông tin liên lạc nhạy cảm (`contact_info`):** Số điện thoại (`phone`) và địa chỉ chi tiết (`address`) **chỉ được phép** trả về khi người gọi (caller) là chính người đăng bài (Giver) hoặc là người nhận (Receiver) **đã được duyệt chọn chính thức** trong giao dịch ở trạng thái `DELIVERING` hoặc `COMPLETED`. Khách vãng lai, người xem thông thường, hoặc người gửi yêu cầu ở trạng thái `PENDING`/`REJECTED`/`STANDBY` đều nhận `null`.

### F81 — Tương tác Yêu thích bài đăng (Post Like / Unlike)

Người dùng đã đăng nhập có quyền Thích hoặc Bỏ thích bài đăng (CHỐT-12):

- **Endpoint toggle:** `POST /api/v1/posts/:postId/like`. Nếu chưa thích thì thêm lượt thích; nếu đã thích thì huỷ thích.
- **Ràng buộc duy nhất:** Lưu trữ tại bảng `post_likes` với cặp khoá `(user_id, post_id)` kèm UNIQUE constraint chống trùng lặp.
- **Denormalized counter:** Cột `like_count` trên bảng `posts` được cập nhật nguyên tử (+1 khi like, -1 khi unlike) trong cùng transaction với `post_likes`.
- **Response chi tiết bài đăng:** Bổ sung `like_count` (tổng lượt thích) và `is_liked` (true nếu caller đã thích, false nếu chưa, null nếu chưa đăng nhập).

---

## 13. Admin CMS, Campaign & Blog

### F59 — Dashboard KPI
Người dùng mới, bài theo danh mục và loại, giao dịch hoàn tất, dung lượng lưu trữ, phân bổ
Rank/Point, và KPI của Group/Affiliate/Accuracy.

### F60 — Kiểm duyệt & quản lý người dùng
Quản lý người dùng, report, nội dung vi phạm, xử phạt, xem audit. Phân quyền theo RBAC.

### F61 — Cấu hình Rank / Point / Referral / Affiliate / Accuracy
CRUD toàn bộ: bậc Rank, nhiệm vụ 3 tháng, cap theo ngày, Point Rule, Personal Referral,
Affiliate event và geo, Accuracy. Có điều chỉnh thủ công, thu hồi, tạm dừng — **kèm audit và
đánh phiên bản cấu hình**.

> Đánh phiên bản là bắt buộc: khi Admin đổi rule, các bút toán đã phát sinh phải tra được là
> chúng ra đời dưới phiên bản nào. ⚠️ *Giá trị cap theo ngày chưa có.*

### F62 — Quản lý danh mục & mẫu thông báo
CRUD danh mục động và mẫu thông báo (nội dung, đối tượng, điều kiện, lịch gửi). Kiểm soát
không cho xoá danh mục đang được dùng.

### F63 — Campaign & Home động
Quản lý campaign, banner, CTA, mục nổi bật, thứ tự các khối trên Home.

**Chỉ trong phạm vi component app đã hỗ trợ** — Admin không điều khiển tuỳ ý toàn bộ layout
hay theme. Cấu hình được cache bằng Redis.

### F64 — Blog / Tin tức
Soạn thảo rich text/markdown, ảnh bìa trên R2, phân chuyên mục, publish. Người dùng đọc và
chia sẻ trên mobile.

### F65 — Quản lý Từ thiện, Rao vặt, Quảng cáo, Công đức
Duyệt sự kiện do Kim Cương đề xuất; quản lý nội dung quảng cáo, đơn vị Công đức, và dữ liệu
tham chiếu của Rao vặt.

---

## 14. Hạ tầng & Bảo mật

### F66 — VPS, Docker, PostgreSQL, Redis, Nginx SSL
Docker Compose, host Nginx + Certbot, TLS và staging/production tách path, database, Redis,
volume, network, secret và GitHub Environment. Runbook: `deploy/STAGING.md`,
`deploy/PRODUCTION.md`.

### F67 — Sao lưu & phục hồi
Sao lưu database định kỳ, lưu trữ theo chính sách, và **kiểm tra quy trình restore** — bản
backup chưa từng restore thử thì chưa phải là backup. Chi phí hạ tầng bên thứ ba tách riêng.

### F68 — Bảo mật, log và giám sát cơ bản
Rate limit, validation, quản lý secret, audit log, health check và log phục vụ vận hành.

---

## 15. QA & UAT

### F69 — Kiểm thử hồi quy & UAT
Kiểm thử đầu-cuối trên Mobile, Backend và Admin. Bao phủ: Auth, Profile, Post, Map,
Transaction, Chat, Point, Group, Affiliate, Geo, Accuracy, Admin.

### F70 — Sửa lỗi UAT & nghiệm thu theo Sprint
Sửa lỗi thuộc phạm vi, kiểm thử lại, lập danh sách hạng mục từng Sprint. Nghiệm thu
**theo hành vi nghiệp vụ kiểm chứng được**, không theo cảm tính.

---

## 16. Triển khai & Bàn giao

### F71 — Build & phát hành Store
Build Android APK/AAB, cấu hình TestFlight cho iOS, hỗ trợ submit. **Thời gian xét duyệt của
Apple/Google không tính vào tiến độ** nếu không phải do lỗi kỹ thuật.

### F72 — Bàn giao mã nguồn & quyền quản trị
Bàn giao source Mobile/Backend/Admin, script và dump database, cấu hình Docker/Nginx, tài
liệu vận hành. Chuyển quyền quản trị và **thu hồi mọi quyền truy cập tạm**.

---

## 17. Đối chiếu giá trị cấu hình & Quyết định chính thức từ SRS v1.15.0

Toàn bộ các điểm blocker trước đây đã được Bên A làm rõ và quy định chính thức trong [`../../SRS_Chan_Tam_v1.15.0.md`](../SRS_Chan_Tam_v1.15.0.md) (Mục 1.7 - CHỐT-01 đến CHỐT-07):

| # | Hạng mục | Trạng thái / Quyết định chính thức trong SRS v1.15.0 |
|---|---|---|
| 1 | **Giver Accuracy & Đánh giá** | ✅ **CHỐT-03**: Dùng tỷ lệ % (0–100%), chỉ tính tổng hợp sau ≥ 5 giao dịch. Ngưỡng cảnh báo < 75% đưa vào `REVIEW_REQUIRED`, không tự động phạt. |
| 2 | **Định nghĩa "Active Member"** | ✅ **CHỐT-06** + **chốt 2026-09-24**: `users.last_login_at` quá **90 ngày** thì coi như không hoạt động (mốc cập nhật mỗi lần refresh token). Toàn bộ Group Affiliate Event bắt buộc nằm trong bán kính Group; phân bổ cho toàn bộ Active Member. |
| 3 | **Cơ chế Rank & Tụt hạng** | ✅ **CHỐT-01 & BR-PROF-RANK-04/06** + **chốt 2026-09-24**: quyết định bởi `current point balance`, tiêu điểm thì tụt, xét lại theo ngưỡng hiện tại (không ép 1 bậc). Trượt nhiệm vụ duy trì **bị trừ N điểm** rồi xét lại. Không dùng `lifetime rank point` riêng; **F76 đã huỷ**. |
| 4 | **Nhiệm vụ "2+2 / 3+3 / 4+4"** | ✅ **BR-PROF-RANK-03**: Xác nhận chính thức là N giao dịch Cho hoàn tất + N Personal Referral hợp lệ trong chu kỳ 3 tháng. |
| 5 | Quota bài đăng theo Rank | ✅ Baseline: Viewer 0, Member 3, Bạc 10, Vàng 20, Kim Cương 50 (Admin chỉnh qua CMS). |
| 6 | Rank được dùng SOS | ✅ Từ hạng **Bạc** trở lên (UI-WANTED-01). |
| 7 | Bán kính Group | ✅ Lấy theo Group config lúc tạo (mặc định 10km, giới hạn 1–50km). |
| 8 | Độ sâu Sub-team | ✅ 1 tầng (Group → Sub-team) trong Phase 1. |
| 9 | Cap theo ngày | ✅ Baseline: 5 giao dịch tính điểm, 3 referral/ngày (Admin cấu hình). |
| 10 | Cap report | ✅ Baseline: 10 report/người/ngày; chỉ report đã xác minh mới được tính điểm. |

---

## 18. Các mâu thuẫn trước đây đã được giải quyết

| Mục | Mâu thuẫn cũ | Quyết định chính thức từ SRS v1.15.0 |
|---|---|---|
| [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) | Đường cong thăng hạng & 2 cơ chế xung đột | **CHỐT-01 & BR-PROF-RANK-02/04/06**: Bảng ngưỡng điểm là chuẩn tham chiếu cấu hình được. Rank căn cứ theo current balance; khi điểm giảm hoặc trượt nhiệm vụ quý thì tự động tính lại rank theo ngưỡng điểm hiện tại. |
| [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) | Tiêu điểm là tụt hạng | **CHỐT-01 & BR-PROF-RANK-06**: Hệ thống chấp nhận re-evaluate rank theo current point balance khi điểm giảm. Phase 1 không dùng `lifetime rank point` riêng. |
| [F19](#f19--rao-vặt-giá-rẻ) | Rao bán tự chuyển thành cho không sau 3 tháng | **CHỐT-05 & Mục 3.3.6**: Xác nhận chính thức: bài Rao vặt tối đa 3 tháng, hết hạn tự chuyển thành Muốn Tặng và thông báo cho người bán. Không ép mức giảm giá tối thiểu. |
| [F06](#f06--xoá-tài-khoản--ẩn-danh-hoá) / [F55](#f55--owner-xoá-tài-khoản--group-giải-tán) | Owner xoá tài khoản | **CHỐT-02**: Group giải tán, invite link hết hiệu lực, dừng affiliate và thành viên mới; dữ liệu giữ nguyên để audit. |
| [F05](#f05--quên-mật-khẩu--kênh-admin-dự-phòng) | Quên mật khẩu không có email/SĐT | **CHỐT-04**: User tự liên hệ Admin support, app hiển thị hướng dẫn/liên hệ; quy trình xác minh thực hiện theo vận hành ngoài. |
| [F22](#f22--vòng-đời-bài-muốn-tặng--gia-hạn) | Thời hạn và gia hạn bài | **CHỐT-07**: Bài tồn tại 3 tháng, được gia hạn tối đa 01 lần (+3 tháng) và tính quota như bài mới. |
