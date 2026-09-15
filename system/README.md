# `system/`

Nơi đặt các **thư viện và dịch vụ xuyên suốt** — dùng chung cho mọi sản phẩm nghiệp vụ,
nhưng không đủ trung lập để nằm ở `kernel/`.

Hiện chưa có package nào. Theo lộ trình MVP, các package dự kiến thuộc về đây:

| Package | Vai trò |
| --- | --- |
| ~~`auth-lib`~~ | **Đã có.** Xác thực JWT, guard toàn cục, `@Public()`, `@CurrentUser()` — xem [auth-lib/README.md](./auth-lib/README.md) |
| `ekyc-lib` | Bọc nhà cung cấp eKYC (FPT.AI / VNPT). **Chỉ lưu `verification_id`, không lưu ảnh CCCD** |
| `otp-lib` | Gửi OTP qua Zalo ZNS (kênh chính) + SMS brandname (dự phòng) |
| `storage-lib` | Upload/presign Cloudflare R2 |
| `notification-lib` | Firebase Cloud Messaging + thông báo trong ứng dụng |
| `background-job-lib` | Lớp bọc BullMQ: worker cơ sở, retry, dead-letter |

Quy ước đặt tên package: `@chantam/service.<tên>`.
