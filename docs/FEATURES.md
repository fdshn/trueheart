# Đặc tả chức năng — Chân Tâm MVP Phase 1

Tổng hợp từ ba bảng của Bên A: bảng bóc tách chức năng, bảng chức năng không giá, và bảng
ngưỡng điểm/cống hiến. **72 chức năng, toàn bộ P0, toàn bộ thuộc MVP Phase 1.**

## Cách đọc

- Mã **F01–F72** khớp cột `STT` của bảng gốc — dùng để đối chiếu hợp đồng khi nghiệm thu.
- **⚠️** đánh dấu chỗ **chưa chốt và đang chặn implement**. Tổng hợp ở [§15](#15-giá-trị-cấu-hình-còn-thiếu).
- **⛔** đánh dấu **mâu thuẫn nội tại** cần Bên A quyết trước khi code.
- Mỗi mục chỉ ghi thứ làm thay đổi cách hiện thực. Phần hiển nhiên (form, nút bấm) lược bỏ.

## Nền tảng kỹ thuật

Flutter (Android + iOS) · NestJS + PostgreSQL 16 + PostGIS · Redis · Socket.io · Cloudflare R2
· Firebase FCM · React (Admin CMS) · Nginx + Docker trên VPS.

## Bảng tra nhanh

| # | Phân hệ | Mã | Ghi chú |
|---|---|---|---|
| 1 | [Xác thực & Tài khoản](#1-xác-thực--tài-khoản) | F01–F06 | Không có eKYC/CCCD |
| 2 | [Hồ sơ, Rank & Referral](#2-hồ-sơ-rank--referral) | F07–F13 | ⛔ Rank có 2 cơ chế xung đột |
| 3 | [Đăng tin & Nội dung](#3-đăng-tin--nội-dung) | F14–F24 | 5 loại bài khác nhau |
| 4 | [Quanh Đây & Bản đồ GIS](#4-quanh-đây--bản-đồ-gis) | F25–F29 | Chỉ bản đồ, không có feed |
| 5 | [Giao dịch & FSM](#5-giao-dịch--fsm) | F30–F36 | Lõi nghiệp vụ |
| 6 | [Chat Realtime 1-1](#6-chat-realtime-1-1) | F37–F38 | Chỉ text |
| 7 | [Điểm, Review & Accuracy](#7-điểm-review--accuracy) | F39–F43 | Point Ledger là nguồn sự thật |
| 8 | [Thông báo & Lịch Âm](#8-thông-báo--lịch-âm) | F44–F47 | |
| 9 | [Báo cáo & Chống gian lận](#9-báo-cáo--chống-gian-lận) | F48–F50 | |
| 10 | [Group, Affiliate & Geo](#10-group-affiliate--geo) | F51–F58 | Phần phức tạp nhất |
| 11 | [Admin CMS](#11-admin-cms-campaign--blog) | F59–F65 | |
| 12 | [Hạ tầng & Bảo mật](#12-hạ-tầng--bảo-mật) | F66–F68 | |
| 13 | [QA & UAT](#13-qa--uat) | F69–F70 | |
| 14 | [Triển khai & Bàn giao](#14-triển-khai--bàn-giao) | F71–F72 | |

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

> ⚠️ **Quy trình Admin hỗ trợ chưa được định nghĩa.** Admin đặt lại mật khẩu theo yêu cầu
> qua chat là lỗ hổng chiếm tài khoản — cần quy định bằng chứng sở hữu tài khoản trước khi
> reset.
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

> ⚠️ Cổng này chặn chính xác những hành vi nào? Chỉ đăng bài, hay cả xin nhận / chat / tạo
> group? Tài liệu chỉ nói "trước khi đăng bài".

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

> ⛔ **Đường cong thăng hạng bị gãy.** Bước Bạc → Vàng (224) chỉ bằng **một nửa** bước
> Member → Bạc (448) — tức leo lên Vàng dễ hơn leo lên Bạc. Mọi ngưỡng đều là bội của 224
> (×1, ×3, ×4, ×8) nên trông có chủ đích, nhưng ×4 nằm sai chỗ. Cần xác nhận trước khi code.

**Điều kiện lên Bạc:** 1 giao dịch Cho hoàn tất + 1 referral (áp dụng cho Member).

**Nhiệm vụ duy trì mỗi 3 tháng** — chỉ Bạc/Vàng/Kim Cương, nhắc trước 1 tháng:

| Rank | Mỗi quý | Quy ra một năm |
|---|---|---:|
| Bạc | 2 Cho hoàn tất + 2 referral | 8 referral |
| Vàng | 3 + 3 | 12 referral |
| Kim Cương | 4 + 4 | 16 referral |

> ⚠️ Ký hiệu "2+2 / 3+3 / 4+4" đang được suy ra là *N giao dịch Cho + N referral*, dựa theo
> điều kiện lên Bạc. Cần Bên A xác nhận.
>
> ℹ️ Code hiện đọc các con số này từ bảng `rank_tiers`, không hardcode. Chu kỳ đã mở giữ
> **ngưỡng của chính nó** (`policy` theo hạng ghi trên cycle), nên đổi số giữa chừng không
> làm thay đổi kết quả một chu kỳ đang chạy.

> ⛔ **Rank có hai cơ chế quyết định mâu thuẫn nhau.** Một mặt "xét theo số dư điểm hiện
> tại, tự nâng/hạ theo balance"; mặt khác "không đạt nhiệm vụ duy trì → xét lại Rank theo
> balance/rule". Nếu user có 1792 điểm nhưng trượt nhiệm vụ 4+4, xét lại theo balance thì
> vẫn đủ Kim Cương → nhiệm vụ duy trì **không có tác dụng gì**. Phải chọn một trong hai làm
> cơ chế chính.
>
> ✅ **Code đã chốt: điểm là SÀN, nhiệm vụ duy trì là TRẦN.** Điểm tích luỹ quyết định
> hạng cao nhất *có thể* đạt; trượt nhiệm vụ duy trì thì tụt đúng **một bậc** bất kể còn
> bao nhiêu điểm, và không bao giờ tụt dưới sàn Member của onboarding. Nhờ vậy nhiệm vụ
> duy trì có tác dụng thật. Xem [GĐ-3](./plan/ASSUMPTIONS.md#gđ-3--rank-điểm-là-sàn-nhiệm-vụ-là-trần).
> **Các con số** (ngưỡng và 2+2/3+3/4+4) vẫn chờ Bên A xác nhận — đổi số là đổi dữ liệu
> trong `rank_tiers`, không phải sửa code.

**Điểm dư:** không tự trừ khi lên hạng. Chỉ trừ khi có chương trình đổi điểm cụ thể **và
người dùng xác nhận**. Mặc định **không quy đổi ra tiền mặt**.

> ⛔ **Điểm vừa là thước đo Rank vừa là tiền tiêu được** ⟹ tiêu điểm là tụt hạng.
> Cách xử lý chuẩn, rất rẻ nếu làm ngay: tách `lifetime_points` (chỉ tăng, quyết định Rank)
> khỏi `spendable_balance` (tiêu được). Ledger đã có `balance_after`, chỉ cần thêm
> `lifetime_after`. Làm sau khi có dữ liệu thật thì phải migrate và tính lại toàn bộ lịch sử.
>
> ✅ **Đã tách.** `point_ledger` ghi cả `balance_after` lẫn `lifetime_after`, và
> `user_point_balances` giữ hai cột riêng. Hạng đọc `lifetime`; tiêu điểm chỉ giảm
> `balance` nên không kéo hạng xuống. Kênh công khai chỉ thấy `lifetime`.

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

### F15 — Đăng Muốn Tặng
Ảnh, thông tin vật phẩm, tình trạng, mô tả, vị trí. Kiểm tra **quota theo Rank** trước khi
cho đăng. Quota nằm trong `capability_rank_values` và Admin sửa được lúc chạy qua
`POST /api/v1/admin/entitlements` — mặc định Viewer 0, Thành viên 3, Bạc 10, Vàng 20,
Kim Cương 50. ⚠️ *Các con số này là giả định, chờ Bên A xác nhận.*

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

> ⚠️ Người bán bị chuyển món hàng đang rao bán thành cho không. Cần xác nhận đây là chủ ý và
> người dùng được cảnh báo trước lúc đăng.

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

### F32 — Phân bổ số lượng lớn & khoá tồn kho
Bài có nhiều vật phẩm thì `remaining_quantity` phải **giảm nguyên tử**.

> Phải dùng một câu lệnh dạng `UPDATE ... WHERE remaining_quantity > 0 RETURNING`, **không
> đọc-rồi-ghi ở tầng ứng dụng**. Một nghìn người xin cùng lúc sẽ phát vượt kho.

### F33 — Hàng đợi dự phòng
Ứng viên chưa được chọn nằm trong hàng đợi. Khi giao dịch bị huỷ, hệ thống **đề xuất và
thông báo** người kế tiếp — **không tự trao** khi chưa có xác nhận của người cho.

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

Phase 1 **chỉ tin nhắn text**: không file đính kèm, không ảnh, không chia sẻ vị trí. Màn chat
hiển thị bối cảnh giao dịch và các hành động hợp lệ theo trạng thái.

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

> ⚠️ **X chưa có, và mọi giá trị điểm khác cũng chưa có.** Không có X thì không biết 224 điểm
> (mốc Member) tương đương 2 giao dịch hay 22 giao dịch — chênh nhau mười lần. Không seed được
> bảng rule, không viết được test, không nghiệm thu được.

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

> ⚠️ Bán kính lấy từ đâu: cố định, Admin cấu hình, hay theo Rank?

### F53 — Quản lý Group & Sub-team
Owner quản lý: tổng quan, thành viên, sub-team, link mời, hoạt động, affiliate/điểm, cài đặt.
**Thành viên thường không có dashboard của Owner.**

> ⚠️ Sub-team sâu mấy tầng và có quyền gì thì chưa nêu.

### F54 — Link mời — chỉ dành cho tài khoản mới
Membership và quan hệ affiliate **chỉ tạo cho tài khoản đăng ký mới qua link mời**. Tài khoản
cũ không join được. Phase 1 người dùng **không rời và không chuyển Group**.

> ⚠️ Vào nhầm Group là kẹt vĩnh viễn, không có đường thoát. Cần xác nhận chủ ý.

### F55 — Owner xoá tài khoản → Group giải tán
Group chuyển `DISSOLVED/CLOSED`, link mời vô hiệu, dừng nhận thành viên/sự kiện/affiliate
mới. **Lịch sử membership, ledger và audit giữ nguyên.**

### F56 — Affiliate Event Engine
- **Phase 1 depth = 1** — chỉ một tầng, không phân tầng sâu.
- Sự kiện hợp lệ **có thể phát sinh nhiều lần** (recurring), khác với referral cá nhân chỉ
  thưởng một lần.
- Mỗi sự kiện nguồn sinh bản ghi thưởng cho **toàn bộ Active Member** của Group.
- Có chống cộng lặp và có cơ chế thu hồi.

> ⚠️ **Định nghĩa "Active Member" chưa có** — mà nó quyết định ai được nhận thưởng.

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

## 11. Admin CMS, Campaign & Blog

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

## 12. Hạ tầng & Bảo mật

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

## 13. QA & UAT

### F69 — Kiểm thử hồi quy & UAT
Kiểm thử đầu-cuối trên Mobile, Backend và Admin. Bao phủ: Auth, Profile, Post, Map,
Transaction, Chat, Point, Group, Affiliate, Geo, Accuracy, Admin.

### F70 — Sửa lỗi UAT & nghiệm thu theo Sprint
Sửa lỗi thuộc phạm vi, kiểm thử lại, lập danh sách hạng mục từng Sprint. Nghiệm thu
**theo hành vi nghiệp vụ kiểm chứng được**, không theo cảm tính.

---

## 14. Triển khai & Bàn giao

### F71 — Build & phát hành Store
Build Android APK/AAB, cấu hình TestFlight cho iOS, hỗ trợ submit. **Thời gian xét duyệt của
Apple/Google không tính vào tiến độ** nếu không phải do lỗi kỹ thuật.

### F72 — Bàn giao mã nguồn & quyền quản trị
Bàn giao source Mobile/Backend/Admin, script và dump database, cấu hình Docker/Nginx, tài
liệu vận hành. Chuyển quyền quản trị và **thu hồi mọi quyền truy cập tạm**.

---

## 15. Giá trị cấu hình còn thiếu

Mười mục dưới đây **chưa có trong bất kỳ tài liệu nào** và cần Bên A trả lời. Bốn mục đầu là
**blocker cứng** — thiếu chúng thì không viết được bảng dữ liệu lẫn tiêu chí nghiệm thu.

| # | Thiếu | Chặn |
|---|---|---|
| 1 | **X điểm cho mức 100% giá trị**, và bảng mapping các mức % khác | 🔴 Toàn bộ phân hệ 7 và mọi thứ phụ thuộc Rank |
| 2 | **Định nghĩa "Active Member"** | 🔴 [F56](#f56--affiliate-event-engine) — ai được nhận thưởng |
| 3 | **Rank quyết bởi balance hay bởi nhiệm vụ duy trì** | 🔴 [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) — máy trạng thái Rank |
| 4 | Xác nhận **"2+2 / 3+3 / 4+4"** = *N giao dịch Cho + N referral* | 🔴 [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) |
| 5 | Quota đăng bài của từng Rank | [F15](#f15--đăng-muốn-tặng), [F16](#f16--đăng-muốn-nhận) — không chặn phát hành: đã có mặc định và Admin sửa được lúc chạy |
| 6 | Rank nào được dùng SOS | [F17](#f17--smart-match--sos) — không chặn phát hành: đã có mặc định và Admin sửa được lúc chạy |
| 7 | Bán kính Group lấy từ đâu | [F52](#f52--tạo-group-từ-default-location) |
| 8 | Sub-team sâu mấy tầng, có quyền gì | [F53](#f53--quản-lý-group--sub-team) |
| 9 | Giá trị cap theo ngày | [F61](#f61--cấu-hình-rank--point--referral--affiliate--accuracy) |
| 10 | Cap số lần report — tài liệu **tự nhận chưa chốt** | [F41](#f41--điểm-cho-like--comment--report), [F49](#f49--tín-hiệu-kiểm-duyệt--chế-tài) |

## 16. Mâu thuẫn cần quyết trước khi code

| Mục | Mâu thuẫn |
|---|---|
| [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) | Đường cong thăng hạng gãy: bước Bạc→Vàng (224) bằng nửa bước Member→Bạc (448) |
| [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) | Rank có hai cơ chế quyết định loại trừ nhau (balance vs nhiệm vụ duy trì) |
| [F12](#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng) | Điểm vừa là thước đo Rank vừa là tiền tiêu được ⟹ tiêu điểm là tụt hạng |
| [F19](#f19--rao-vặt-giá-rẻ) | Hàng đang rao bán tự chuyển thành cho không sau 3 tháng |
| [F54](#f54--link-mời--chỉ-dành-cho-tài-khoản-mới) | Vào nhầm Group là kẹt vĩnh viễn |
| [F05](#f05--quên-mật-khẩu--kênh-admin-dự-phòng) | Quy trình Admin đặt lại mật khẩu chưa định nghĩa — nguy cơ chiếm tài khoản |
