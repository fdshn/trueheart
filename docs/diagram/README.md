# Sơ đồ luồng hệ thống Chân Tâm

Bộ sơ đồ này vẽ **toàn bộ luồng nghiệp vụ**, xếp từ đơn giản tới phức tạp. Mục đích là để
người đọc soát lại thiết kế: chỗ nào sai, chỗ nào thiếu, chỗ nào cần thay.

Sơ đồ viết bằng [Mermaid](https://mermaid.js.org) — GitHub, GitLab và VS Code đều render
trực tiếp, không cần công cụ ngoài.

## Quy ước màu và ký hiệu

Mỗi sơ đồ đều nói rõ **phần nào đã chạy được, phần nào mới là thiết kế**. Đây là thứ quan
trọng nhất khi soát: một sơ đồ đẹp mà không phân biệt hai thứ đó sẽ khiến người đọc tưởng
hệ thống đã làm xong những việc chưa ai viết một dòng code.

| Ký hiệu | Nghĩa |
| --- | --- |
| ✅ | Đã hiện thực, có test, chạy được |
| 🟡 | Có code nhưng chưa dùng được thật (thiếu provider, thiếu dữ liệu, chưa nối) |
| ⛔ | **Chưa có dòng code nào** — vẽ theo thiết kế trong SRS / tài liệu |
| ⚠️ | Đang có mâu thuẫn giữa tài liệu và code, hoặc còn chờ chốt |

## Mục lục

### Tầng 1 — Luồng cơ bản

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 01 | [Xác thực & tài khoản](./01-auth.md) | Đăng ký, đăng nhập, refresh, đăng xuất, quên mật khẩu, xoá tài khoản | ✅ |
| 02 | [Hồ sơ & xác minh](./02-profile.md) | Hoàn thiện hồ sơ, avatar, xác minh SĐT, cổng F07, onboarding | ✅ 🟡 |
| 03 | [Media & lưu trữ](./03-media.md) | Presign URL, xác minh quyền sở hữu object, gắn media vào bài | ✅ |

### Tầng 2 — Nội dung

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 04 | [Bài đăng](./04-post.md) | 5 loại bài, quota theo rank, vòng đời, hết hạn, gia hạn, chuyển từ thiện | ✅ |
| 05 | [Khám phá & feed](./05-feed.md) | Nearby, bản đồ, guest discovery, smart match | ✅ |
| 06 | [Tương tác](./06-interaction.md) | Cảm xúc, bình luận, trả lời, chia sẻ, bộ đếm | ✅ |

### Tầng 3 — Giao dịch

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 07 | [Xin nhận & chọn người](./07-request.md) | Hàng đợi, 3 chế độ chọn, countdown 7 ngày, auto-select, dự phòng | ✅ ⛔ |
| 08 | [Vòng đời lượt trao](./08-transaction.md) | Chấp nhận → bàn giao → xác nhận → hoàn tất, huỷ, tự hoàn tất | ✅ ⚠️ |
| 09 | [Chat](./09-chat.md) | Phòng chat, tin nhắn, ảnh, realtime, dọn tin quá hạn | ✅ |
| 10 | [Thông báo](./10-notification.md) | Ghi, chống trùng, đẩy, mẫu thông báo Admin sửa được | ✅ 🟡 |

### Tầng 4 — Điểm, hạng, đánh giá

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 11 | [Điểm cống hiến](./11-point.md) | Ledger append-only, rule, cap ngày, idempotency, đảo bút toán, điểm âm | ✅ ⛔ |
| 12 | [Thứ hạng](./12-rank.md) | Xét hạng, chu kỳ duy trì 3 tháng, tụt hạng, cảnh báo sắp tụt | ⚠️ ⛔ |
| 13 | [Đánh giá & Giver Accuracy](./13-review.md) | Hai chiều đánh giá, chỉ số accuracy, cờ xem xét, đối soát | ✅ |
| 14 | [Đổi vật phẩm bằng điểm](./14-redemption.md) | Định giá, trừ điểm, chốt ngay, ledger | ⛔ |

### Tầng 5 — Kiểm duyệt & vận hành

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 15 | [Báo xấu & kiểm duyệt](./15-report.md) | Báo bài/người/bình luận, hàng đợi Admin, thưởng người báo đúng | ✅ |
| 16 | [Admin CMS & RBAC](./16-admin.md) | Quyền, cấu hình động copy-on-write, audit, mẫu thông báo | ✅ |
| 17 | [Job nền & CLI](./17-jobs.md) | Mười CLI chạy một lần, lịch cron, đối soát | ✅ |

### Tầng 6 — Nhóm

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 18 | [Group & Sub-team](./18-group.md) | Tạo nhóm, snapshot vùng, link mời, RBAC nhóm, sub-team | ✅ |
| 19 | [Group Affiliate](./19-affiliate.md) | Sự kiện affiliate, điều kiện địa lý, chia thưởng | ⛔ |

### Tổng hợp

| # | Sơ đồ | Nội dung |
| --- | --- | --- |
| 20 | [Bản đồ toàn hệ thống](./20-overview.md) | Một sơ đồ gộp mọi phân hệ và quan hệ giữa chúng |
| 21 | [Những chỗ cần chốt](./21-open-issues.md) | Danh sách các điểm còn treo, có đánh dấu trên sơ đồ nào |

### Tầng 7 — Phân hệ phụ trợ

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 22 | [Danh mục](./22-category.md) | Cây danh mục, CRUD, tắt thay vì xoá | ✅ |
| 23 | [Personal Referral](./23-referral.md) | Mã mời, điều kiện hợp lệ, cap ngày | ✅ |
| 24 | [Đặc quyền theo Rank](./24-entitlement.md) | Quota, SOS, capability Admin sửa lúc chạy | ✅ |
| 25 | [Riêng tư vị trí & bài cũ](./25-location-privacy.md) | Jitter toạ độ, dự phòng vị trí, lớp tương thích `/gift-posts` | ✅ |

### Tầng 8 — Nền kỹ thuật

| # | Sơ đồ | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| 26 | [Quy ước API & lỗi](./26-api-conventions.md) | 66 mã lỗi, hai cái bẫy đã sửa, phân tầng kiểm | ✅ |
| 27 | [Lược đồ database](./27-database.md) | 44 bảng, bảng append-only, ràng buộc giữ bất biến | ✅ |
| 28 | [Kiến trúc & khởi động](./28-architecture.md) | Bốn tầng, DI bằng Symbol, ba tầng kiểm thử | ✅ |
| 29 | [CI/CD & triển khai](./29-cicd.md) | Pipeline, rollback, điều kiện production-ready | ✅ 🟡 |
| 30 | [Ma trận endpoint](./30-endpoint-matrix.md) | 62 endpoint × quyền × trạng thái, và cái chưa có | — |

## Cách soát

Đọc theo thứ tự 01 → 21. Mỗi sơ đồ có một mục **"Chỗ cần soát"** ở cuối liệt kê các quyết
định đã cắm vào thiết kế — đó là nơi dễ phát hiện sai nhất.

## Quy ước màu trong sơ đồ

Mọi khối tô màu đều **khai màu chữ tối rõ ràng**, không để mermaid tự chọn. Người xem ở giao
diện tối thì mermaid đổi chữ sang màu nhạt, và chữ nhạt trên nền pastel là thứ gần như không
đọc được — đó là lý do mọi dòng `style` ở đây đều có đủ `fill` + `stroke` + `color`.

| Ý nghĩa | Nền | Viền | Chữ |
| --- | --- | --- | --- |
| Đã xong | `#e6ffe6` | `#3f8f3f` | `#0f3d12` |
| Cảnh báo / chờ chốt | `#fff3cd` | `#b8860b` | `#3d2f00` |
| Ghi chú kỹ thuật | `#e7f3ff` | `#3d7ab8` | `#0d2a4a` |
| Chỗ sai / chưa có | `#ffe6e6` | `#c0504d` | `#4a1210` |
| Bị chặn | `#f8d7da` | `#a52834` | `#4a0d13` |
| Ngoài phạm vi | `#f0f0f0` | `#8a8a8a` | `#2b2b2b` |

Mọi cặp trên đều đạt **tương phản ≥ 11.5:1**, tức vượt mức AAA của WCAG.

**Nền `subgraph` và dải `rect` thì dùng màu TRONG SUỐT** (`#rrggbbaa` với alpha ~0.13, hoặc
`rect rgba(...)`). Lý do: mermaid **không** cho đặt màu chữ cho nhãn cụm và cho lời thoại bên
trong `rect` — chúng luôn lấy màu của theme. Tô nền đặc màu sáng là ép chữ nhạt của theme tối
nằm trên nền sáng. Tint trong suốt thì chữ giữ nguyên tương phản vốn có.

Ba thứ cú pháp cần tránh — cả ba đều từng làm sơ đồ **không hiển thị nổi**:

- `&lt;` / `&gt;` trong sequence diagram — dùng `#lt;` / `#gt;`.
- Id `subgraph` có **dấu cách** — tách id khỏi nhãn: `subgraph CauHinh["Cấu hình"]`.
- `rgba(...)` trong dòng `style` — dấu phẩy bên trong làm vỡ bộ phân tích; dùng hex 8 số.
