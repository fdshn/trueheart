# Các phần deferred và release blocker

Tài liệu này là **danh sách vận hành còn thiếu theo milestone**. `ROADMAP.md` là nguồn thứ tự
thực hiện; file này trả lời câu hỏi khác: “Code/state đã có, nhưng còn gì để gọi là usable/release
ready?” Không tick `[x]` khi chỉ có contract/mock mà không có provider hoặc acceptance test thật.

Ký hiệu:

```text
🟡 State/contract xong, capability production chưa usable
⛔ Release blocker — không tuyên bố production-ready cho luồng đó
```

## M1 · Người dùng, hồ sơ, danh mục, media

| Hạng mục | Đã có | Còn deferred / blocker |
| --- | --- | --- |
| F05 Quên mật khẩu | OTP Redis, chống enumeration, reset/revoke token, Admin fallback | 🟡 Email delivery adapter/vendor credential/domain verify/template/delivery test; ⛔ quy trình Admin chứng minh sở hữu tài khoản |
| F09 Xác minh SĐT | OTP purpose riêng + `phone_verified_at`; thưởng lần đầu đã đi qua ledger với khoá idempotency, kèm job đối soát `point:reconcile` vá lại khi tiến trình chết giữa hai bước | 🟡 SMS/Zalo provider; email provider **không** giải quyết SMS verification |
| F14 Danh mục | Tree, baseline seed, read/create/update/deactivate | ✅ đã chuyển sang RBAC quyền `category.manage` |
| F24 Media | S3 presign, object ownership verify, MinIO local/CI | 🟡 R2 bucket/key/CORS/public domain riêng staging/prod; delivery acceptance test |

### Quyết định email đã chốt

Kênh OTP đầu tiên là **email**. Ticket config chỉ khai sender identity:

```text
OTP_EMAIL_FROM_ADDRESS
OTP_EMAIL_FROM_NAME
```

Nó **không** bật gửi thư, không chọn vendor và không chứa credential. Trước adapter email thật
phải chốt: vendor, credential Environment secret, sender-domain verification, template, retry/error
policy, monitoring và staging delivery acceptance.

Trước khi thêm `EmailOtpSender`, `IOtpSender.isConfigured` phải thay thành capability theo channel
(`canSend(EMAIL|SMS)`): email availability không được vô tình mở F09 SMS verification.

> ✅ **Đã làm.** `IOtpSender.canSend(channel)` đã thay cờ chung, và năng lực gửi
> nay đọc từ cấu hình Admin trong `notification_channels` chứ không phải biến
> môi trường. Adapter SMTP thật đã có, nên đổi SMTP từ CMS là có hiệu lực ngay.
> SMS và Zalo bật được trong CMS nhưng `canSend` vẫn trả `false` ở production vì
> **chưa có adapter nào gửi nổi hai kênh đó** — danh sách kênh đã hiện thực là
> nơi duy nhất quyết định, nên bật nhầm trong CMS không biến thành lời hứa gửi.

## M3 · Giao dịch, chat, thông báo

- [x] Vòng đời giao dịch tặng/nhận: request → accept → confirm, huỷ trả lại tồn
      kho, tự hoàn tất sau 5 ngày qua CLI `transaction:autocomplete`.
- [x] Nguồn "lượt tặng hoàn tất" cho rank — đây là thứ mở khoá F12.
- [~] F44 push FCM: **mã đã xong, chỉ còn CHỜ KHOÁ.** `FcmPushSender` gọi FCM
      HTTP v1 (tự ký JWT RS256, tự đổi access token, gộp token trùng, bỏ token
      chết mà không làm sập lượt gửi) và `notification.module.ts` chọn nó khi có
      `FCM_SERVICE_ACCOUNT_BASE64`.

      **Việc còn lại là của Bên A, không phải việc code:** tạo dự án Firebase,
      tải service account JSON, rồi đặt một biến:

      ```bash
      FCM_SERVICE_ACCOUNT_BASE64=$(base64 -w0 service-account.json)
      ```

      Dán vào `.env` của host là push chạy — **không sửa một dòng mã nào**. Khi
      trống, hệ dùng `LoggingPushSender`: fail-closed ở production, không bao giờ
      giả vờ đã gửi. Thông báo trong app không phụ thuộc đường đẩy.

      Giới hạn đã biết: 18 phép kiểm phủ hình payload HTTP v1, chữ ký JWT (ký
      thật rồi xác thực lại bằng khoá công khai) và mọi nhánh lỗi — nhưng **chưa
      có lượt gọi THẬT tới Google**, vì chưa có khoá. Lượt đó vẫn là một bước
      phải làm sau khi nhận khoá.
- [ ] Queue/retry/dead-letter thực tế cho delivery notification.
- [ ] Chat và Smart Match.
- [ ] Gắn F06 check “còn giao dịch dở dang” khi xoá tài khoản (bảng đã có, phép
      kiểm chưa gắn).

## M4 · Điểm và thứ hạng

- [x] Point ledger idempotent, append-only kèm trigger chặn sửa/xoá.
- [x] Gắn `PHONE_VERIFIED_FIRST_TIME` vào ledger, không cộng cột users trực tiếp.
- [x] Tách `lifetime` (quyết định hạng) khỏi `balance` (tiêu được).
- [ ] Xác nhận 4 giả định point/rank/referral trong `ASSUMPTIONS.md` trước migration dữ liệu thật.

## M5 · Group, affiliate, chống gian lận

- [ ] Owner xoá account giải tán Group (TODO đã cắm F06).
- [ ] Geo eligibility/audit và anti-fraud trước khi mở affiliate.

## M6 · Admin, vận hành, bàn giao

- [ ] Thay category allowlist M1 bằng role/permission Admin CMS thật.
- [ ] Backup database **và restore test**.
- [ ] Monitoring/alerting, global rate limit trước public launch.
- [ ] Regression/UAT, store release, handover.

## Trước khi gọi production-ready

```text
[ ] Email/SMS delivery thật đã thử trên staging
[ ] R2 staging/prod bucket/key/CORS/CDN đã thử upload thật
[ ] Backup restore đã thử
[ ] Global rate limit + monitoring có hiệu lực
[ ] M3 transaction guard cho delete account
[ ] M4 ledger cho mọi point award
```
