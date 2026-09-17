# Lộ trình triển khai

72 chức năng chia 6 mốc. Thứ tự quyết bởi **phụ thuộc kỹ thuật**, không phải độ ưu tiên —
cả 72 đều là P0.

| Mốc | Nội dung | Số chức năng | Trạng thái |
| --- | --- | ---: | --- |
| M0 | Nền tảng monorepo + CI/CD | — | ✅ Xong |
| [M1](#m1--người-dùng--nội-dung-cơ-sở) | Người dùng, hồ sơ, danh mục, media | 13 | 🔵 12/13 |
| [M2](#m2--bài-đăng--bản-đồ) | Bài đăng 5 loại, bản đồ | 14 | ⬜ 0/14 |
| [M3](#m3--giao-dịch--chat) | Giao dịch, chat, thông báo | 10 | ⬜ 0/10 |
| [M4](#m4--điểm--thứ-hạng) | Điểm, đánh giá, thứ hạng | 7 | ⬜ 0/7 |
| [M5](#m5--group--affiliate) | Group, affiliate, chống gian lận | 10 | ⬜ 0/10 |
| [M6](#m6--quản-trị--bàn-giao) | Admin CMS, kiểm duyệt, bàn giao | 18 | ⬜ 0/18 |

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
- [ ] F09 Xác minh SĐT — OTP state xong, SMS provider + điểm M4 còn treo
- [x] F10 Hồ sơ công khai + deep link
- [x] F11 Vị trí mặc định
- [x] F14 Danh mục động dạng cây — tree public + seed baseline; admin mutation chờ M6
- [x] F24 Media R2 qua presigned URL — MinIO local/CI, R2 staging/production qua env

**Xong khi:** đăng ký → hoàn thiện hồ sơ → đặt vị trí mặc định → upload avatar chạy thông,
và `scripts/smoke-test.sh` phủ được luồng này.

**Chặn:** không có. Bắt đầu được ngay.

---

## M2 · Bài đăng & bản đồ

**Package:** resource `post` trong `chantam.core`

- [ ] F15 Đăng Muốn Tặng (+ quota theo Rank — dùng [MĐ-1](./ASSUMPTIONS.md#6-mặc-định-mềm))
- [ ] F16 Đăng Muốn Nhận
- [ ] F17 Smart Match + SOS (SOS từ Bạc — [MĐ-2](./ASSUMPTIONS.md#6-mặc-định-mềm))
- [ ] F18 Từ thiện / Hoạt động
- [ ] F19 Rao vặt giá rẻ ⚠️ *tự chuyển thành cho không sau 3 tháng*
- [ ] F20 Giới thiệu / Quảng cáo (chỉ Admin tạo)
- [ ] F21 Công đức / Hồi hướng
- [ ] F22 Vòng đời bài + gia hạn 1 lần
- [ ] F23 Chuyển vật phẩm về điểm từ thiện
- [ ] F25 Bản đồ toàn màn hình
- [ ] F26 GPS + dự phòng Default Location
- [ ] F27 Nạp theo khung nhìn *(đã có `applyBoundingBox()`)*
- [ ] F28 Gom cụm marker + bộ lọc
- [ ] F29 Thẻ xem nhanh + deep link

**Xong khi:** đăng đủ 5 loại bài, bài hiện trên bản đồ với toạ độ **đã làm nhiễu**, cron hết
hạn 3 tháng chạy đúng.

**Đã có sẵn:** `@GeoColumn`, `applyGeoJitter`, `bucketDistance`, `GeoQueryHelper`, và khung
resource `gift-post` làm mẫu.

---

## M3 · Giao dịch & chat

**Package:** resource `gift-request`, `transaction`, `chat` · Socket.io

- [ ] F30 Gửi yêu cầu xin nhận (UNIQUE ở tầng DB)
- [ ] F31 Danh sách ứng viên + quyền chọn theo Rank
- [ ] F32 **Trừ tồn kho nguyên tử**
- [ ] F33 Hàng đợi dự phòng
- [ ] F34 Chấp nhận giao dịch + mở chat (cùng một DB transaction)
- [ ] F35 Huỷ giao dịch + mở lại hàng đợi
- [ ] F36 Xác nhận nhận + tự hoàn tất sau 5 ngày
- [ ] F37 Chat text 1-1 theo giao dịch
- [ ] F38 Lưu bền vững + khoá chỉ đọc khi xong
- [ ] F44 Push FCM + thông báo trong app *(bản tối thiểu, đủ cho giao dịch)*

**Xong khi:** chạy trọn vòng xin → duyệt → chat → xác nhận → hoàn tất, và kiểm được **race
condition**: 50 request đồng thời trên bài có 10 món phải ra đúng 10 giao dịch.

**Đây là mốc khó nhất về đúng đắn.** Hai chỗ dễ sai: trừ tồn kho ([DATA-MODEL §1](./DATA-MODEL.md#1--trừ-tồn-kho-phải-nguyên-tử))
và mở chat phải nằm trong cùng transaction với việc duyệt.

---

## M4 · Điểm & thứ hạng

**Package:** resource `point`, `review`, `rank`, `referral`

- [ ] F39 Point Rule Engine + Ledger (`lifetime_after` tách khỏi `balance_after`)
- [ ] F40 Điểm theo giá trị vật phẩm — dùng [GĐ-1](./ASSUMPTIONS.md#gđ-1--một-giao-dịch-100-giá-trị--56-điểm)
- [ ] F41 Điểm Like/Comment/Report *(mặc định tắt)*
- [ ] F42 Đánh giá chất lượng hai chiều
- [ ] F43 Giver Accuracy (đủ 5 mẫu mới tính)
- [ ] F12 Rank 5 tầng + chu kỳ duy trì — dùng [GĐ-3](./ASSUMPTIONS.md#gđ-3--rank-điểm-là-sàn-nhiệm-vụ-là-trần), [GĐ-4](./ASSUMPTIONS.md#gđ-4--22--33--44--n-giao-dịch-cho-hoàn-tất--n-referral)
- [ ] F13 Referral cá nhân, thưởng một lần

**Xong khi:** hoàn tất một giao dịch → điểm vào ledger có idempotency → đủ 224 điểm thì lên
Member. Ghi cùng một `idempotency_key` hai lần chỉ cộng một lần.

> 🔴 **Mốc này dùng cả 4 giả định.** Nếu Bên A trả lời trước khi M4 bắt đầu thì không phải
> sửa gì. Trả lời sau khi M4 xong thì phải migrate dữ liệu.

---

## M5 · Group & affiliate

**Package:** resource `group`, `affiliate`

- [ ] F51 Quyền tạo Group theo Rank
- [ ] F52 Tạo Group từ Default Location (chụp tâm + bán kính)
- [ ] F53 Quản lý Group + Sub-team (1 tầng — [MĐ-4](./ASSUMPTIONS.md#6-mặc-định-mềm))
- [ ] F54 Link mời — chỉ tài khoản mới
- [ ] F55 Owner xoá tài khoản → Group giải tán
- [ ] F56 Affiliate Event Engine (depth = 1, recurring)
- [ ] F57 **Geo eligibility bắt buộc** (`ST_DWithin`)
- [ ] F58 Thứ tự ưu tiên vị trí + audit khoảng cách
- [ ] F50 Chống gian lận referral/điểm
- [ ] F47 Thông báo theo khu vực

**Xong khi:** sự kiện trong bán kính Group thì cộng điểm cho Active Member; sự kiện ngoài
bán kính ghi `NOT_ELIGIBLE_GEO` với `point_delta = 0`, và audit lưu đủ khoảng cách + bán kính.

> **F50 phải xong cùng M5, không được đẩy sang M6.** Cơ chế duy trì Rank đòi hỏi referral
> liên tục, nên tài khoản ảo là đường tấn công rẻ nhất. Geo là hàng rào duy nhất — thả M5 ra
> mà chưa có chống gian lận là mở cửa cho farm điểm.

---

## M6 · Quản trị & bàn giao

**Package:** `apps/admin` (React) · `system/notification-lib`

**Admin CMS**
- [ ] F59 Dashboard KPI
- [ ] F60 Kiểm duyệt + quản lý người dùng — **khoá tài khoản phải gọi `ITokenDenyList.revokeIssuedBefore()`**, nếu không người bị khoá vẫn dùng API được 15 phút
- [ ] F61 Cấu hình Rank/Point/Referral/Affiliate/Accuracy (có version)
- [ ] F62 Quản lý danh mục + mẫu thông báo
- [ ] F63 Campaign + Home động
- [ ] F64 Blog / Tin tức
- [ ] F65 Quản lý Từ thiện, Rao vặt, Quảng cáo, Công đức

**Kiểm duyệt & thông báo**
- [ ] F48 Báo cáo kèm bằng chứng
- [ ] F49 Tín hiệu kiểm duyệt + chế tài — chế tài nào đổi `status` thì cũng phải thu hồi token như F60
- [ ] F45 Phân loại + mẫu thông báo
- [ ] F46 Lịch Âm + nhắc ngày lễ

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
- [ ] **Rate limit toàn cục** — nợ kỹ thuật #3, cần trước khi mở công khai
- [x] **Host Nginx + Certbot cho staging** — vhost tách port 8080, HTTPS external health gate xanh; xem `deploy/STAGING.md`
- [ ] **Production Nginx + TLS** — chuẩn bị theo `deploy/PRODUCTION.md` khi khách cấp server thật

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 6 mốc, 72 chức năng |
