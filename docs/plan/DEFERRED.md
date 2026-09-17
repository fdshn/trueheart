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
| F09 Xác minh SĐT | OTP purpose riêng + `phone_verified_at` | 🟡 SMS/Zalo provider; email provider **không** giải quyết SMS verification; point award chờ M4 ledger |
| F14 Danh mục | Tree, baseline seed, read/create/update/deactivate | 🟡 `CATEGORY_ADMIN_USERNAMES` allowlist tạm thời; M6 thay bằng Admin CMS role |
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

## M3 · Giao dịch, chat, thông báo

- [ ] F44 push FCM + notification in-app tối thiểu cho giao dịch.
- [ ] Queue/retry/dead-letter thực tế cho delivery notification.
- [ ] Gắn F06 check “còn giao dịch dở dang” khi `transactions` đã tồn tại.

## M4 · Điểm và thứ hạng

- [ ] Point ledger idempotent là prerequisite cho mọi award/penalty.
- [ ] Gắn `PHONE_VERIFIED_FIRST_TIME` vào ledger, không cộng cột users trực tiếp.
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
