# Bảng tra mã lỗi API

> **Sinh tự động.** Đừng sửa tay — sửa danh mục lỗi trong mã nguồn rồi chạy
> `npm run docs:errors`. CI kiểm lại bằng `npm run docs:errors:check`.

Mọi response đều cùng một hình dạng, kể cả khi lỗi:

```json
{
  "success": false,
  "errorCode": 772,
  "errorOrigin": "chantam/core",
  "message": ["Tên đăng nhập \"an\" đã có người dùng"],
  "body": null
}
```

Client phân biệt lỗi bằng **cặp `(errorOrigin, errorCode)`** — mã trùng nhau
giữa hai `errorOrigin` khác nhau là bình thường và có chủ đích. Đừng bắt theo
`message`: câu chữ sẽ đổi.

## `kernel/common-lib`

Nền tảng — lỗi giao thức và vòng đời request

| Mã (hex) | Mã (thập phân) | HTTP | Tên | Thông điệp |
| --- | --- | --- | --- | --- |
| `0xff00` | `65280` | 500 Internal Server Error | `UNKNOWN_ERROR` | Đã có lỗi xảy ra, vui lòng thử lại |
| `0xff01` | `65281` | 400 Bad Request | `BAD_REQUEST` | Thiếu tham số bắt buộc |
| `0xff02` | `65282` | 401 Unauthorized | `UNAUTHORIZED` | Chưa xác thực |
| `0xff03` | `65283` | 403 Forbidden | `FORBIDDEN` | Không đủ quyền thực hiện thao tác này |
| `0xff04` | `65284` | 404 Not Found | `NOT_FOUND` | Không tìm thấy dữ liệu |
| `0xff05` | `65285` | 409 Conflict | `CONFLICT` | Dữ liệu đã tồn tại |
| `0xff06` | `65286` | 400 Bad Request | `VALIDATION_FAILED` | registration.password: password must be longer than or equal to 8 characters |
| `0xff07` | `65287` | 400 Bad Request | `INVALID_PAGINATION` | Tham số phân trang không hợp lệ |
| `0xff08` | `65288` | 429 Too Many Requests | `RATE_LIMITED` | Bạn thao tác quá nhanh, vui lòng thử lại sau 30 giây |
| `0xffc0` | `65472` | 501 Not Implemented | `FEATURE_NOT_SUPPORTED` | Chưa hỗ trợ: đăng nhập bằng Google |
| `0xffc1` | `65473` | 501 Not Implemented | `NOT_IMPLEMENTED` | Tính năng chưa được hiện thực: xuất báo cáo PDF |

## `system/auth-lib`

Xác thực — access token

| Mã (hex) | Mã (thập phân) | HTTP | Tên | Thông điệp |
| --- | --- | --- | --- | --- |
| `0x0101` | `257` | 401 Unauthorized | `TOKEN_MISSING` | Thiếu access token |
| `0x0102` | `258` | 401 Unauthorized | `TOKEN_INVALID` | Access token không hợp lệ |
| `0x0103` | `259` | 401 Unauthorized | `TOKEN_EXPIRED` | Access token đã hết hạn |
| `0x0104` | `260` | 401 Unauthorized | `TOKEN_REVOKED` | Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại |

## `chantam/core`

Nghiệp vụ Chân Tâm

| Mã (hex) | Mã (thập phân) | HTTP | Tên | Thông điệp |
| --- | --- | --- | --- | --- |
| `0x0101` | `257` | 404 Not Found | `GIFT_POST_NOT_FOUND` | Không tìm thấy bài đăng 4182a141-a5c5-5c25-92ab-0d4488158e8f |
| `0x0102` | `258` | 400 Bad Request | `GIFT_POST_INVALID_LOCATION` | Toạ độ bài đăng không hợp lệ |
| `0x0103` | `259` | 409 Conflict | `GIFT_POST_ALREADY_CLOSED` | Bài đăng 4182a141-a5c5-5c25-92ab-0d4488158e8f đang ở trạng thái COMPLETED, không thể chỉnh sửa |
| `0x0104` | `260` | 409 Conflict | `GIFT_POST_OUT_OF_STOCK` | Bài đăng đã hết số lượng |
| `0x0201` | `513` | 404 Not Found | `GIFT_REQUEST_NOT_FOUND` | Không tìm thấy yêu cầu 7c3e0b18-2f44-4a91-9d2e-55b0a1f6c8d3 |
| `0x0202` | `514` | 409 Conflict | `GIFT_REQUEST_DUPLICATED` | Bạn đã gửi yêu cầu cho bài đăng này rồi |
| `0x0203` | `515` | 403 Forbidden | `CANNOT_REQUEST_OWN_POST` | Bạn không thể tự gửi yêu cầu xin đồ cho bài đăng của chính mình |
| `0x0204` | `516` | 400 Bad Request | `POST_NOT_ACCEPTING_REQUESTS` | Bài đăng hiện không ở trạng thái mở nhận yêu cầu |
| `0x0301` | `769` | 404 Not Found | `USER_NOT_FOUND` | Không tìm thấy tài khoản |
| `0x0302` | `770` | 403 Forbidden | `USER_SUSPENDED` | Tài khoản đang bị tạm khoá tới 2026-10-01T00:00:00.000Z |
| `0x0303` | `771` | 403 Forbidden | `USER_BANNED` | Tài khoản đã bị khoá vĩnh viễn |
| `0x0304` | `772` | 409 Conflict | `USERNAME_TAKEN` | Tên đăng nhập "nguoidung01" đã có người dùng |
| `0x0305` | `773` | 409 Conflict | `EMAIL_TAKEN` | Email này đã được dùng cho tài khoản khác |
| `0x0306` | `774` | 409 Conflict | `PHONE_TAKEN` | Số điện thoại này đã được dùng cho tài khoản khác |
| `0x0307` | `775` | 401 Unauthorized | `INVALID_CREDENTIALS` | Tên đăng nhập hoặc mật khẩu không đúng |
| `0x0308` | `776` | 403 Forbidden | `PROFILE_INCOMPLETE` | Cần bổ sung Avatar, Số điện thoại trước khi đăng bài |
| `0x0309` | `777` | 409 Conflict | `USER_HAS_OPEN_TRANSACTIONS` | Còn 2 giao dịch chưa hoàn tất, chưa thể xoá tài khoản |
| `0x030a` | `778` | 429 Too Many Requests | `LOGIN_THROTTLED` | Sai quá nhiều lần. Thử lại sau 15 phút |
| `0x030b` | `779` | 403 Forbidden | `ONBOARDING_INCOMPLETE` | Cần hoàn tất onboarding trước khi đăng bài |
| `0x0401` | `1025` | 404 Not Found | `SESSION_NOT_FOUND` | Không tìm thấy phiên đăng nhập |
| `0x0402` | `1026` | 401 Unauthorized | `REFRESH_TOKEN_INVALID` | Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại |
| `0x0403` | `1027` | 401 Unauthorized | `REFRESH_TOKEN_EXPIRED` | Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại |
| `0x0404` | `1028` | 400 Bad Request | `OTP_INVALID` | Mã xác minh không đúng hoặc đã hết hạn |
| `0x0405` | `1029` | 400 Bad Request | `OTP_EXPIRED` | Mã xác minh đã hết hạn |
| `0x0406` | `1030` | 429 Too Many Requests | `OTP_TOO_SOON` | Vui lòng thử lại sau 42 giây |
| `0x0501` | `1281` | 404 Not Found | `CATEGORY_NOT_FOUND` | Không tìm thấy danh mục |
| `0x0502` | `1282` | 409 Conflict | `CATEGORY_SLUG_TAKEN` | Slug danh mục "sach" đã tồn tại |
| `0x0601` | `1537` | 404 Not Found | `POST_NOT_FOUND` | Không tìm thấy bài đăng 4182a141-a5c5-5c25-92ab-0d4488158e8f |
| `0x0602` | `1538` | 409 Conflict | `POST_QUOTA_EXCEEDED` | Bạn đã đạt giới hạn 3 bài đăng đang hoạt động |
| `0x0603` | `1539` | 409 Conflict | `POST_INVALID_STATE` | Trạng thái bài đăng không cho phép thao tác này |
| `0x0604` | `1540` | 409 Conflict | `POST_MEDIA_LIMIT_EXCEEDED` | Một bài đăng chỉ được có tối đa 10 ảnh |
| `0x0605` | `1541` | 400 Bad Request | `POST_MEDIA_ORDER_INVALID` | Danh sách thứ tự ảnh bài đăng không hợp lệ |
| `0x0606` | `1542` | 409 Conflict | `POST_NOT_RENEWABLE` | Bài đăng này không gia hạn được: chỉ bài đang hiển thị hoặc đã hết hạn và vẫn còn vật phẩm mới được gia hạn |
| `0x0607` | `1543` | 409 Conflict | `POST_RENEWAL_LIMIT_REACHED` | Mỗi bài đăng chỉ được gia hạn một lần |
| `0x0608` | `1544` | 403 Forbidden | `POST_SOS_NOT_ALLOWED` | Thứ hạng hiện tại của bạn chưa được dùng bài Cần gấp (SOS) |
| `0x0609` | `1545` | 409 Conflict | `POST_CHARITY_TRANSFER_INVALID_STATE` | Bài đăng này không gửi được yêu cầu chuyển về điểm từ thiện: chỉ bài đang hiển thị hoặc đã hết hạn, còn vật phẩm và chưa có yêu cầu nào đang chờ duyệt |
| `0x060a` | `1546` | 400 Bad Request | `DISCOVERY_ORIGIN_UNAVAILABLE` | Không xác định được vị trí để quét: hãy gửi toạ độ, hoặc đặt Vị trí mặc định trong hồ sơ |
| `0x0701` | `1793` | 409 Conflict | `POINT_RULE_UNAVAILABLE` | Point rule PHONE_VERIFIED_FIRST_TIME không khả dụng |
| `0x0702` | `1794` | 500 Internal Server Error | `RANK_TIER_UNAVAILABLE` | Không tìm thấy cấu hình tier cho rank SILVER |
| `0x0703` | `1795` | 409 Conflict | `POINT_DAILY_CAP_REACHED` | Đã đạt giới hạn 3 lần/ngày cho point rule REFERRAL_QUALIFIED |
| `0x0801` | `2049` | 404 Not Found | `GIFT_TRANSACTION_NOT_FOUND` | Không tìm thấy lượt tặng/nhận |
| `0x0802` | `2050` | 409 Conflict | `GIFT_TRANSACTION_INVALID_STATE` | Lượt tặng/nhận đang ở trạng thái COMPLETED nên không thực hiện được thao tác này |
| `0x0803` | `2051` | 403 Forbidden | `GIFT_TRANSACTION_NOT_PARTICIPANT` | Bạn không có quyền thao tác trên lượt tặng/nhận này |
| `0x0804` | `2052` | 409 Conflict | `GIFT_TRANSACTION_OUT_OF_STOCK` | Bài đăng đã hết số lượng để trao |
| `0x0805` | `2053` | 409 Conflict | `GIFT_TRANSACTION_DUPLICATE_REQUEST` | Bạn đã có một yêu cầu đang mở trên bài đăng này |
| `0x0806` | `2054` | 409 Conflict | `SHIP_PAYER_NOT_RECEIVER` | Bài đăng này không khai người nhận trả phí ship, nên không có khoản nào để báo chưa thanh toán |
| `0x0807` | `2055` | 409 Conflict | `GIFT_HANDOVER_EVIDENCE_REQUIRED` | Cần ảnh lúc trao đồ và ảnh hàng quay về thì mới báo được — trừ điểm người khác phải dựa trên dấu vết để lại từ trước |
| `0x0901` | `2305` | 409 Conflict | `ADMIN_LAST_SUPER_ADMIN` | Không thể thu hồi SUPER_ADMIN cuối cùng: sẽ không còn ai cấp lại quyền được |
| `0x0902` | `2306` | 403 Forbidden | `ADMIN_SELF_ROLE_CHANGE` | Không thể tự thay đổi quyền của chính mình |
| `0x0a01` | `2561` | 503 | `ENTITLEMENT_POLICY_UNAVAILABLE` | Chưa có bản chính sách quyền nào đang hiệu lực |
| `0x0a02` | `2562` | 400 Bad Request | `ENTITLEMENT_CAPABILITY_UNKNOWN` | Không có capability nào mang mã POST_TELEPATHY trong bản chính sách hiện hành |
| `0x0b01` | `2817` | 404 Not Found | `CHAT_ROOM_NOT_FOUND` | Không tìm thấy phòng chat |
| `0x0b02` | `2818` | 409 Conflict | `CHAT_ROOM_READ_ONLY` | Giao dịch đã kết thúc nên phòng chat chỉ còn đọc được, không gửi thêm tin nhắn |
| `0x0b03` | `2819` | 404 Not Found | `NOTIFICATION_NOT_FOUND` | Không tìm thấy thông báo |

---

Tổng cộng **69 mã lỗi** trên 3 tầng.
Một số mã đã khai trước cho milestone sau nên chưa endpoint nào trả về.
