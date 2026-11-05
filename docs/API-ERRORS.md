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
| `0x0205` | `517` | 403 Forbidden | `OPEN_REQUEST_QUOTA_EXCEEDED` | Bạn đang có 0/0 yêu cầu chưa ngã ngũ. Hãy rút bớt hoặc chờ người tặng trả lời trước khi xin thêm. |
| `0x0206` | `518` | 400 Bad Request | `REDEMPTION_NOT_AVAILABLE` | Vật phẩm này hiện không đổi được bằng điểm. Đồng hồ chọn người nhận đã kết thúc hoặc bài đã có chủ. |
| `0x0207` | `519` | 400 Bad Request | `REDEMPTION_PRICE_UNAVAILABLE` | Người tặng chưa khai giá trị tham khảo cho vật phẩm này, nên không quy ra điểm được. |
| `0x0208` | `520` | 400 Bad Request | `REDEMPTION_INSUFFICIENT_POINTS` | Vật phẩm này cần 0 điểm, bạn đang có 0. |
| `0x0209` | `521` | 400 Bad Request | `OFFER_GIFT_TARGET_NOT_WANTED` | Chỉ gửi lời tặng được cho bài Muốn Nhận. Với bài Muốn Tặng, hãy gửi yêu cầu xin nhận. |
| `0x020a` | `522` | 400 Bad Request | `OFFER_GIFT_SOURCE_INVALID` | Bài mang ra tặng phải là bài Muốn Tặng của chính bạn và đang còn công khai |
| `0x020b` | `523` | 409 Conflict | `CHECK_IN_ALREADY_RECORDED` | Ngày đã có dấu điểm danh, không cần bù |
| `0x020c` | `524` | 409 Conflict | `CHECK_IN_POLICY_UNAVAILABLE` | Tính năng điểm danh chưa được bật |
| `0x020d` | `525` | 400 Bad Request | `CHECK_IN_REPAIR_DATE_INVALID` | Chỉ bù được những ngày trong 0 ngày gần nhất, và không bù cho hôm nay |
| `0x020e` | `526` | 409 Conflict | `CHECK_IN_REPAIR_CREDIT_INSUFFICIENT` | Bạn không còn lượt điểm danh bù. Hoàn tất thêm 0 lượt tặng/nhận quà để có một lượt |
| `0x020f` | `527` | 409 Conflict | `CHECK_IN_REPAIR_UNAVAILABLE` | Ngày này không nối lại được chuỗi nào, nên bù vào cũng không thay đổi gì |
| `0x0210` | `528` | 409 Conflict | `REDEMPTION_QUOTE_STALE` | Giá đã đổi từ 0 điểm thành 0 điểm. Xem lại rồi xác nhận giúp mình nhé. |
| `0x0211` | `529` | 409 Conflict | `CHECK_IN_POLICY_VERSION_CONFLICT` | Policy điểm danh vừa được người khác publish: bản hiện tại là 2, không phải 1. Tải lại rồi sửa trên bản mới |
| `0x0301` | `769` | 404 Not Found | `USER_NOT_FOUND` | Không tìm thấy tài khoản |
| `0x0302` | `770` | 403 Forbidden | `USER_SUSPENDED` | Tài khoản đang bị tạm khoá tới 2026-10-01T00:00:00.000Z |
| `0x0303` | `771` | 403 Forbidden | `USER_BANNED` | Tài khoản đã bị khoá vĩnh viễn |
| `0x0304` | `772` | 409 Conflict | `USERNAME_TAKEN` | Tên đăng nhập "nguoidung01" đã có người dùng |
| `0x0305` | `773` | 409 Conflict | `EMAIL_ALREADY_USED` | Email này đã được dùng cho tài khoản khác |
| `0x0306` | `774` | 409 Conflict | `PHONE_TAKEN` | Số điện thoại này đã được dùng cho tài khoản khác |
| `0x0307` | `775` | 401 Unauthorized | `INVALID_CREDENTIALS` | Tên đăng nhập hoặc mật khẩu không đúng |
| `0x0308` | `776` | 403 Forbidden | `PROFILE_INCOMPLETE` | Cần bổ sung Avatar, SĐT để tiếp tục |
| `0x0309` | `777` | 409 Conflict | `USER_HAS_OPEN_TRANSACTIONS` | Còn 2 giao dịch chưa hoàn tất, chưa thể xoá tài khoản |
| `0x030a` | `778` | 429 Too Many Requests | `LOGIN_THROTTLED` | Sai quá nhiều lần. Thử lại sau 15 phút |
| `0x030b` | `779` | 403 Forbidden | `ONBOARDING_INCOMPLETE` | Cần hoàn tất onboarding trước khi đăng bài |
| `0x030c` | `780` | 409 Conflict | `PHONE_ALREADY_VERIFIED` | Số điện thoại này đã từng được xác minh cho một tài khoản khác. Dùng số khác, hoặc liên hệ hỗ trợ nếu đây đúng là số của bạn. |
| `0x030d` | `781` | 404 Not Found | `VERIFIED_PHONE_NOT_FOUND` | Số này chưa từng được xác minh cho tài khoản nào |
| `0x030e` | `782` | 409 Conflict | `VERIFIED_PHONE_IN_USE` | Số này đang do tài khoản "nguoidung01" giữ và vẫn còn hiệu lực xác minh. Xử lý tài khoản đó trước — đổi số hoặc khoá — rồi mới giải phóng. |
| `0x030f` | `783` | 400 Bad Request | `INVALID_EMAIL_FORMAT` | Email không đúng định dạng |
| `0x0310` | `784` | 409 Conflict | `EMAIL_NOT_VERIFIED` | Email chưa được xác minh |
| `0x0311` | `785` | 409 Conflict | `EMAIL_REQUIRED` | Hồ sơ chưa có email — thêm email trước khi xác minh |
| `0x0312` | `786` | 400 Bad Request | `USER_BLOCK_SELF` | Không thể chặn chính mình |
| `0x0401` | `1025` | 404 Not Found | `SESSION_NOT_FOUND` | Không tìm thấy phiên đăng nhập |
| `0x0402` | `1026` | 401 Unauthorized | `REFRESH_TOKEN_INVALID` | Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại |
| `0x0403` | `1027` | 401 Unauthorized | `REFRESH_TOKEN_EXPIRED` | Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại |
| `0x0404` | `1028` | 400 Bad Request | `OTP_INVALID` | Mã xác minh không đúng hoặc đã hết hạn |
| `0x0405` | `1029` | 400 Bad Request | `OTP_EXPIRED` | Mã xác minh đã hết hạn |
| `0x0406` | `1030` | 429 Too Many Requests | `OTP_TOO_SOON` | Vui lòng thử lại sau 42 giây |
| `0x0407` | `1031` | 429 Too Many Requests | `TOO_MANY_REQUESTS` | Bạn thao tác quá nhanh. Thử lại sau 60 giây |
| `0x0501` | `1281` | 404 Not Found | `CATEGORY_NOT_FOUND` | Không tìm thấy danh mục |
| `0x0502` | `1282` | 409 Conflict | `CATEGORY_SLUG_TAKEN` | Slug danh mục "sach" đã tồn tại |
| `0x0503` | `1283` | 409 Conflict | `CATEGORY_PARENT_CYCLE` | Không đặt "Điện thoại" làm cha được: nó nằm trong nhánh con của danh mục đang sửa, và làm vậy sẽ tạo vòng khiến cả nhánh biến mất khỏi cây |
| `0x0504` | `1284` | 409 Conflict | `CATEGORY_IN_USE` | Không tắt được: còn 34 bài đang dùng danh mục này hoặc nhánh con của nó. Chuyển bài sang danh mục khác trước |
| `0x0505` | `1285` | 422 | `CATEGORY_DEPTH_EXCEEDED` | Cây danh mục sâu tối đa 4 tầng. Sâu hơn thì màn hình chọn danh mục không dùng được |
| `0x0506` | `1286` | 422 | `CATEGORY_POST_TYPE_NOT_ALLOWED` | Danh mục này không nhận bài loại WANTED. Loại được nhận: OFFER, CLASSIFIED |
| `0x0507` | `1287` | 422 | `CATEGORY_MERGE_INVALID` | Không gộp được: không gộp một danh mục vào chính nó |
| `0x0508` | `1288` | 409 Conflict | `CATEGORY_MERGED_CANNOT_REOPEN` | "Đồ gia dụng" đã được gộp vào "Gia dụng" nên không bật lại được. Tạo danh mục mới nếu cần tách lại. |
| `0x0509` | `1289` | 409 Conflict | `CATEGORY_POST_TYPE_IN_USE` | Không bỏ được loại WANTED: còn 3 bài loại đó trong danh mục này. Chuyển bài sang danh mục khác trước |
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
| `0x060b` | `1547` | 400 Bad Request | `POST_SELECTION_MODE_INVALID` | Chế độ chọn người nhận không hợp lệ |
| `0x060e` | `1550` | 403 Forbidden | `POST_CONTACT_INFO_RESTRICTED` | Thông tin liên hệ chỉ hiển thị với người nhận được chọn trong giai đoạn giao nhận |
| `0x060f` | `1551` | 409 Conflict | `POST_HAS_LIVE_TRANSACTION` | Bài này đang có lượt trao chưa xong. Đóng lượt trao đó trước rồi mới sửa hoặc gỡ bài được. |
| `0x0610` | `1552` | 403 Forbidden | `SELECT_REQUESTER_NOT_ALLOWED` | Thứ hạng hiện tại của bạn chưa được tự chọn người nhận. Hết hạn xét, hệ thống sẽ tự chọn theo tiêu chí Ban quản trị cấu hình; bạn vẫn xem được danh sách và từ chối yêu cầu không hợp lệ |
| `0x0611` | `1553` | 409 Conflict | `CLASSIFIED_TRANSACTION_NOT_SUPPORTED` | Rao vặt không dùng xin nhận hay giao dịch — hãy nhắn tin trực tiếp cho người bán |
| `0x0701` | `1793` | 409 Conflict | `POINT_RULE_UNAVAILABLE` | Point rule PHONE_VERIFIED_FIRST_TIME không khả dụng |
| `0x0702` | `1794` | 500 Internal Server Error | `RANK_TIER_UNAVAILABLE` | Không tìm thấy cấu hình tier cho rank SILVER |
| `0x0703` | `1795` | 409 Conflict | `POINT_DAILY_CAP_REACHED` | Đã đạt giới hạn 3 lần/ngày cho point rule REFERRAL_QUALIFIED |
| `0x0704` | `1796` | 409 Conflict | `POINT_ENTRY_NOT_REVERSIBLE` | Bút toán này không hoàn được: không tồn tại, đã hoàn rồi, hoặc chính nó là một bút toán hoàn |
| `0x0801` | `2049` | 404 Not Found | `GIFT_TRANSACTION_NOT_FOUND` | Không tìm thấy lượt tặng/nhận |
| `0x0802` | `2050` | 409 Conflict | `GIFT_TRANSACTION_INVALID_STATE` | Lượt tặng/nhận đang ở trạng thái COMPLETED nên không thực hiện được thao tác này |
| `0x0803` | `2051` | 403 Forbidden | `GIFT_TRANSACTION_NOT_PARTICIPANT` | Bạn không có quyền thao tác trên lượt tặng/nhận này |
| `0x0804` | `2052` | 409 Conflict | `GIFT_TRANSACTION_OUT_OF_STOCK` | Bài đăng đã hết số lượng để trao |
| `0x0805` | `2053` | 409 Conflict | `GIFT_TRANSACTION_DUPLICATE_REQUEST` | Bạn đã có một yêu cầu đang mở trên bài đăng này |
| `0x0806` | `2054` | 409 Conflict | `SHIP_PAYER_NOT_RECEIVER` | Bài đăng này không khai người nhận trả phí ship, nên không có khoản nào để báo chưa thanh toán |
| `0x0807` | `2055` | 409 Conflict | `GIFT_HANDOVER_EVIDENCE_REQUIRED` | Cần ảnh lúc trao đồ và ảnh hàng quay về thì mới báo được — trừ điểm người khác phải dựa trên dấu vết để lại từ trước |
| `0x0808` | `2056` | 409 Conflict | `REVIEW_TRANSACTION_NOT_COMPLETED` | Lượt trao chưa hoàn tất nên chưa đánh giá được |
| `0x0809` | `2057` | 409 Conflict | `REVIEW_ALREADY_SUBMITTED` | Bạn đã đánh giá lượt trao này rồi |
| `0x080a` | `2058` | 404 Not Found | `REVIEW_NOT_FOUND` | Bạn chưa đánh giá lượt trao này, nên chưa có gì để sửa |
| `0x080b` | `2059` | 409 Conflict | `REVIEW_ALREADY_EDITED` | Mỗi đánh giá chỉ sửa được một lần, và bạn đã sửa rồi |
| `0x080c` | `2060` | 409 Conflict | `REVIEW_EDIT_WINDOW_CLOSED` | Hết hạn sửa đánh giá: chỉ sửa được trong 0 ngày sau khi lượt trao hoàn tất |
| `0x0901` | `2305` | 409 Conflict | `ADMIN_LAST_SUPER_ADMIN` | Không thể thu hồi SUPER_ADMIN cuối cùng: sẽ không còn ai cấp lại quyền được |
| `0x0902` | `2306` | 403 Forbidden | `ADMIN_SELF_ROLE_CHANGE` | Không thể tự thay đổi quyền của chính mình |
| `0x0903` | `2307` | 404 Not Found | `NOTIFICATION_TEMPLATE_NOT_FOUND` | Không có mẫu thông báo cho loại này |
| `0x0904` | `2308` | 404 Not Found | `ADMIN_ROLE_NOT_FOUND` | Không tìm thấy role CONTENT_EDITOR |
| `0x0905` | `2309` | 409 Conflict | `ADMIN_ROLE_CODE_CONFLICT` | Mã role MODERATOR đã tồn tại |
| `0x0906` | `2310` | 409 Conflict | `ADMIN_ROLE_PROTECTED` | Role SUPER_ADMIN do hệ thống quản lý, không sửa được từ CMS |
| `0x0907` | `2311` | 400 Bad Request | `ADMIN_PERMISSION_UNKNOWN` | Permission không tồn tại: post.fly |
| `0x0908` | `2312` | 409 Conflict | `ADMIN_ROLE_SELF_LOCKOUT` | Thay đổi này làm chính bạn mất quyền admin.manage. Nhờ một quản trị viên khác thực hiện |
| `0x0a01` | `2561` | 503 | `ENTITLEMENT_POLICY_UNAVAILABLE` | Chưa có bản chính sách quyền nào đang hiệu lực |
| `0x0a02` | `2562` | 400 Bad Request | `ENTITLEMENT_CAPABILITY_UNKNOWN` | Không có capability nào mang mã POST_TELEPATHY trong bản chính sách hiện hành |
| `0x0a03` | `2563` | 422 | `ENTITLEMENT_LIMIT_INVALID` | Hạn mức của POST_OPEN ở bậc SILVER không dùng được: đã cho phép thì phải có hạn mức lớn hơn 0 — ô trống bị đọc thành 0 nên sẽ khoá cả bậc này |
| `0x0b01` | `2817` | 404 Not Found | `CHAT_ROOM_NOT_FOUND` | Không tìm thấy phòng chat |
| `0x0b02` | `2818` | 409 Conflict | `CHAT_ROOM_READ_ONLY` | Giao dịch đã kết thúc nên phòng chat chỉ còn đọc được, không gửi thêm tin nhắn |
| `0x0b03` | `2819` | 404 Not Found | `NOTIFICATION_NOT_FOUND` | Không tìm thấy thông báo |
| `0x0b04` | `2820` | 404 Not Found | `CHAT_MESSAGE_NOT_FOUND` | Không tìm thấy tin nhắn |
| `0x0b05` | `2821` | 409 Conflict | `CHAT_RECALL_WINDOW_CLOSED` | Chỉ thu hồi được tin nhắn trong vòng 5 phút sau khi gửi |
| `0x0b06` | `2822` | 409 Conflict | `CHAT_FLAG_ALREADY_REVIEWED` | Cờ này đã có người xử trước. Tải lại hàng đợi để xem quyết định đã chọn |
| `0x0b07` | `2823` | 404 Not Found | `NOTIFICATION_BROADCAST_NOT_FOUND` | Không tìm thấy lượt gửi thông báo hàng loạt |
| `0x0b08` | `2824` | 409 Conflict | `NOTIFICATION_BROADCAST_ALREADY_COMPLETED` | Lượt gửi này đã xong. Muốn gửi lại nội dung đó thì tạo một lượt gửi mới |
| `0x0b09` | `2825` | 409 Conflict | `NOTIFICATION_BROADCAST_IN_PROGRESS` | Lượt gửi này đang được gửi. Theo dõi tiến độ trong danh sách lượt gửi |
| `0x0b0a` | `2826` | 409 Conflict | `CHAT_DIRECT_POST_NOT_SUPPORTED` | Chỉ nhắn trực tiếp được với bài Rao vặt. Bài cho/nhận dùng nút xin nhận |
| `0x0b0b` | `2827` | 409 Conflict | `CHAT_DIRECT_POST_SELF` | Không thể nhắn tin với bài của chính mình |
| `0x0b0c` | `2828` | 409 Conflict | `CHAT_DIRECT_USER_SELF` | Không thể nhắn tin với chính mình |
| `0x0b0d` | `2829` | 403 Forbidden | `CHAT_RECIPIENT_UNAVAILABLE` | Không thể nhắn tin cho người này |
| `0x0e01` | `3585` | 422 | `CONTENT_BLOCKED_TERMS` | Nội dung có từ ngữ không được phép. Vui lòng viết lại |
| `0x0e02` | `3586` | 404 Not Found | `CONTENT_COMMENT_NOT_FOUND` | Không tìm thấy bình luận |
| `0x0e03` | `3587` | 409 Conflict | `CONTENT_EDIT_WINDOW_CLOSED` | Chỉ sửa được bình luận trong 15 phút đầu |
| `0x0f01` | `3841` | 404 Not Found | `REPORT_NOT_FOUND` | Không tìm thấy báo cáo vi phạm |
| `0x0f02` | `3842` | 409 Conflict | `REPORT_DUPLICATED` | Bạn đã có một báo cáo đang chờ xử lý cho đối tượng này |
| `0x0f03` | `3843` | 409 Conflict | `REPORT_INVALID_STATE` | Báo cáo đã được xử lý và không thể thay đổi quyết định |
| `0x1001` | `4097` | 400 Bad Request | `GROUP_DEFAULT_LOCATION_REQUIRED` | Hãy đặt Vị trí mặc định trước khi tạo nhóm — tâm vùng của nhóm chụp từ đó và không đổi được về sau. |
| `0x1002` | `4098` | 409 Conflict | `GROUP_ALREADY_MEMBER` | Bạn đã thuộc một nhóm. Mỗi người chỉ thuộc tối đa một nhóm, và không chuyển nhóm được. |
| `0x1003` | `4099` | 403 Forbidden | `GROUP_CREATE_NOT_ALLOWED` | Thứ hạng của bạn chưa đủ điều kiện tạo nhóm. |
| `0x1004` | `4100` | 400 Bad Request | `GROUP_INVITE_INVALID` | Link mời không dùng được. |
| `0x1005` | `4101` | 404 Not Found | `GROUP_NOT_FOUND` | Không tìm thấy nhóm |
| `0x1006` | `4102` | 409 Conflict | `AFFILIATE_POLICY_VERSION_CONFLICT` | Policy Affiliate vừa được người khác publish: bản hiện tại là 2, không phải 1. Tải lại rồi sửa trên bản mới |
| `0x1007` | `4103` | 409 Conflict | `GROUP_ALREADY_DISSOLVED` | Nhóm đã giải tán từ trước |
| `0x1101` | `4353` | 404 Not Found | `HOME_CAMPAIGN_NOT_FOUND` | Không tìm thấy chiến dịch |
| `0x1102` | `4354` | 409 Conflict | `HOME_CAMPAIGN_SCHEDULE_CONFLICT` | Đã có giao diện trang chủ khác đang bật trùng khung thời gian này — tắt bản kia hoặc đổi thời gian |
| `0x1103` | `4355` | 409 Conflict | `HOME_CAMPAIGN_LIVE` | Giao diện này đang hiển thị trên trang chủ — tắt (isActive: false) rồi mới xoá được |
| `0x1201` | `4609` | 404 Not Found | `BLOG_NOT_FOUND` | Không tìm thấy bài viết |
| `0x1202` | `4610` | 409 Conflict | `BLOG_SLUG_CONFLICT` | slug đã có bài khác dùng (kể cả bài đã xoá) — đổi tiêu đề hoặc gửi slug riêng |
| `0x1301` | `4865` | 404 Not Found | `CHARITY_CAMPAIGN_NOT_FOUND` | Không tìm thấy hoạt động từ thiện |
| `0x1302` | `4866` | 403 Forbidden | `CHARITY_CAMPAIGN_CREATE_NOT_ALLOWED` | Hạng của bạn chưa được tạo hoạt động từ thiện |
| `0x1303` | `4867` | 409 Conflict | `CHARITY_PARTICIPATION_CLOSED` | Hoạt động đã đóng đăng ký |
| `0x1304` | `4868` | 409 Conflict | `CHARITY_ALREADY_REGISTERED` | Bạn đã đăng ký hoạt động này |
| `0x1305` | `4869` | 409 Conflict | `CHARITY_NOT_REGISTERED` | Bạn chưa đăng ký hoạt động này |
| `0x1306` | `4870` | 409 Conflict | `CHARITY_CANCEL_TOO_LATE` | Hoạt động đã kết thúc, không huỷ đăng ký được nữa |
| `0x1307` | `4871` | 409 Conflict | `CHARITY_REVIEW_TOO_EARLY` | Chỉ đánh giá được sau khi hoạt động kết thúc |
| `0x1308` | `4872` | 403 Forbidden | `CHARITY_REVIEW_NOT_PERMITTED` | Bạn không Ở trong hoạt động này nên không đánh giá được |
| `0x1309` | `4873` | 409 Conflict | `CHARITY_REVIEW_DUPLICATE` | Bạn đã đánh giá người này trong hoạt động này |
| `0x130a` | `4874` | 403 Forbidden | `CHARITY_NOT_ORGANIZER` | Chỉ người tổ chức cập nhật được tiến độ |
| `0x130b` | `4875` | 409 Conflict | `CHARITY_APPROVAL_ALREADY_DECIDED` | Hồ sơ này đã được xử lý |
| `0x130c` | `4876` | 409 Conflict | `CHARITY_NOT_ACCEPTING_CONTRIBUTIONS` | Hoạt động này hiện không nhận đề nghị đóng góp |
| `0x130d` | `4877` | 400 Bad Request | `CHARITY_NEED_ITEM_INVALID` | Có vật phẩm không thuộc danh sách nhu cầu của hoạt động này, hoặc đã được rút |
| `0x130e` | `4878` | 404 Not Found | `CHARITY_CONTRIBUTION_NOT_FOUND` | Không tìm thấy đề nghị đóng góp |
| `0x130f` | `4879` | 409 Conflict | `CHARITY_CONTRIBUTION_NOT_EDITABLE` | Đề nghị đã được xét nên không sửa hay rút được nữa; thay đổi phải đi qua huỷ lượt giao nhận |
| `0x1310` | `4880` | 409 Conflict | `CHARITY_CONTRIBUTION_ALREADY_DECIDED` | Đề nghị này không còn chờ xét — đã được xét hoặc đã rút |
| `0x1311` | `4881` | 400 Bad Request | `CHARITY_LINES_INVALID` | Các dòng gửi lên không hợp lệ |
| `0x1312` | `4882` | 409 Conflict | `CHARITY_NEED_EXCEEDED` | Vật phẩm: bạn chọn nhận 0 nhưng chỉ còn thiếu 0 |
| `0x1313` | `4883` | 404 Not Found | `CHARITY_DELIVERY_NOT_FOUND` | Không tìm thấy lượt giao nhận |
| `0x1314` | `4884` | 409 Conflict | `CHARITY_DELIVERY_INVALID_STATE` | Lượt giao nhận đang ở trạng thái khác, không thực hiện được thao tác này |
| `0x1315` | `4885` | 409 Conflict | `CHARITY_SELF_CONTRIBUTION` | Bạn đang tổ chức hoạt động này nên không gửi đề nghị đóng góp vào nó được |
| `0x1316` | `4886` | 409 Conflict | `CHARITY_CAMPAIGN_NOT_CLOSABLE` | Hoạt động này chưa được duyệt hoặc đã đóng rồi |
| `0x1317` | `4887` | 404 Not Found | `CHARITY_EXTERNAL_CONTRIBUTION_NOT_FOUND` | Không tìm thấy bản ghi đóng góp ngoài app |
| `0x1318` | `4888` | 409 Conflict | `CHARITY_EXTERNAL_CONTRIBUTION_VOIDED` | Bản ghi này đã bị huỷ hoặc đã được thay bằng bản điều chỉnh — hãy thao tác trên bản đang có hiệu lực |
| `0x1319` | `4889` | 409 Conflict | `CHARITY_CAMPAIGN_NOT_EXTENDABLE` | Chỉ gia hạn được hoạt động đang mở, và mốc kết thúc mới phải sau mốc hiện tại |
| `0x131a` | `4890` | 409 Conflict | `CHARITY_COORDINATOR_NOT_ALLOWED` | Chỉ hoạt động có tổ chức mới có coordinator, và không giao được cho chính mình |
| `0x131b` | `4891` | 409 Conflict | `CHARITY_BENEFICIARY_NOT_APPLICABLE` | Thông tin người thụ hưởng chỉ dành cho kêu gọi cá nhân giúp một người khác |
| `0x131c` | `4892` | 409 Conflict | `CHARITY_BENEFICIARY_CONSENT_REQUIRED` | Kêu gọi giúp người khác cần xác nhận người thụ hưởng đã đồng ý trước khi công khai |
| `0x131d` | `4893` | 400 Bad Request | `CHARITY_MEDIA_INVALID` | Bộ ảnh/video gửi lên không hợp lệ |
| `0x131e` | `4894` | 409 Conflict | `CHARITY_MEDIA_NOT_EDITABLE` | Chỉ sửa ảnh/video được khi hồ sơ còn đang chờ duyệt |
| `0x131f` | `4895` | 409 Conflict | `CHARITY_CAMPAIGN_HAS_ACTIVITY` | Hoạt động đã có người đăng ký, đóng góp, giao nhận hoặc đánh giá — hãy đóng hoặc tắt thay vì xoá |
| `0x1320` | `4896` | 409 Conflict | `CHARITY_PROJECT_NOT_DRAFT` | Dự án đã được gửi duyệt — không còn là bản nháp |
| `0x1321` | `4897` | 409 Conflict | `CHARITY_STAGE_TRANSITION_INVALID` | Không chuyển được giai đoạn: chỉ được tiến một bước |
| `0x1322` | `4898` | 409 Conflict | `CHARITY_STAGE_SCHEDULE_CONFLICT` | Theo lịch tiến độ hiện tại, dự án sẽ lập tức vượt qua giai đoạn này — hãy sửa thời gian bước trao trước |
| `0x1323` | `4899` | 409 Conflict | `CHARITY_BANK_ACCOUNT_LIMIT` | Dự án đã có đủ 2 tài khoản nhận đang hiệu lực — đóng bớt hoặc thay tài khoản cũ |
| `0x1324` | `4900` | 404 Not Found | `CHARITY_BANK_ACCOUNT_NOT_FOUND` | Không tìm thấy tài khoản nhận đang hiệu lực |
| `0x1325` | `4901` | 404 Not Found | `CHARITY_FUNDING_NEED_NOT_FOUND` | Không tìm thấy hạng mục kêu gọi tiền |
| `0x1326` | `4902` | 404 Not Found | `CHARITY_VOLUNTEER_NEED_NOT_FOUND` | Không tìm thấy vị trí tuyển người |
| `0x1328` | `4904` | 409 Conflict | `CHARITY_VOLUNTEER_CLOSED` | Vị trí này không còn nhận đăng ký |
| `0x1329` | `4905` | 404 Not Found | `CHARITY_VOLUNTEER_REGISTRATION_NOT_FOUND` | Không tìm thấy đăng ký tham gia |
| `0x132a` | `4906` | 409 Conflict | `CHARITY_SECTION_EMPTY` | Mục này chưa có nội dung để công khai |
| `0x132b` | `4907` | 409 Conflict | `CHARITY_PROJECT_INACTIVE` | Dự án đang bị đình chỉ — không nhận thao tác mới |
| `0x132c` | `4908` | 403 Forbidden | `CHARITY_PROJECT_FORBIDDEN` | Bạn không có quyền với mục này của dự án |
| `0x132d` | `4909` | 409 Conflict | `CHARITY_PROJECT_NOT_APPROVED` | Dự án chưa được duyệt — chưa có việc triển khai để cập nhật |
| `0x132e` | `4910` | 404 Not Found | `CHARITY_TASK_NOT_FOUND` | Không tìm thấy việc trong checklist triển khai |
| `0x132f` | `4911` | 404 Not Found | `CHARITY_EXPORT_NOT_FOUND` | Không tìm thấy bản in |
| `0x1330` | `4912` | 409 Conflict | `CHARITY_SECTION_NOT_PUBLISHED` | Mục này chưa được công khai nên chưa chia sẻ được |
| `0x1331` | `4913` | 404 Not Found | `CHARITY_EVENT_STEP_NOT_FOUND` | Không tìm thấy bước trong timeline sự kiện |
| `0x1332` | `4914` | 404 Not Found | `CHARITY_POST_NOT_FOUND` | Không tìm thấy bài đăng của dự án |
| `0x1333` | `4915` | 403 Forbidden | `CHARITY_POST_FORBIDDEN` | Bạn chưa được đăng ảnh/clip vào dự án này — cần là ban tổ chức, hoặc cộng tác viên sự kiện trong lúc sự kiện trao diễn ra |
| `0x1334` | `4916` | 429 Too Many Requests | `CHARITY_POST_QUOTA_EXCEEDED` | Hôm nay bạn đã dùng hết 5 lượt clip cho dự án này — thử lại vào ngày mai |
| `0x1335` | `4917` | 400 Bad Request | `CHARITY_POST_MEDIA_INVALID` | Ảnh/clip không hợp lệ — phải là tệp bạn vừa tải lên cho dự án này và chưa dùng ở bài khác |
| `0x1337` | `4919` | 409 Conflict | `CHARITY_SUMMARY_NOT_OPEN` | Tổng kết mở khi dự án sang giai đoạn Tổng kết |
| `0x1338` | `4920` | 409 Conflict | `CHARITY_SUMMARY_FINANCIAL_REQUIRED` | Dự án có nhận tiền — cần ít nhất một báo cáo tài chính kèm sao kê trước khi công khai tổng kết |
| `0x1339` | `4921` | 409 Conflict | `CHARITY_SUMMARY_EMPTY` | Tổng kết chưa có nội dung để công khai |
| `0x133a` | `4922` | 404 Not Found | `CHARITY_FINANCIAL_REPORT_NOT_FOUND` | Không tìm thấy báo cáo tài chính |
| `0x133b` | `4923` | 409 Conflict | `CHARITY_EVALUATION_TARGET_INVALID` | Người này không tham gia dự án nên không chấm được mức hoàn thành |
| `0x133c` | `4924` | 404 Not Found | `CHARITY_APPEAL_NOT_FOUND` | Không tìm thấy khiếu nại |
| `0x133d` | `4925` | 403 Forbidden | `CHARITY_APPEAL_NOT_ALLOWED` | Chỉ chính người được đánh giá mới khiếu nại được đánh giá của mình |
| `0x133e` | `4926` | 409 Conflict | `CHARITY_APPEAL_DUPLICATED` | Lần đánh giá này đã có khiếu nại — mỗi lần đánh giá chỉ khiếu nại một lần |
| `0x133f` | `4927` | 409 Conflict | `CHARITY_APPEAL_INVALID_STATE` | Khiếu nại đang ở trạng thái CLOSED, không thực hiện được bước này |
| `0x1340` | `4928` | 403 Forbidden | `CHARITY_APPEAL_CONFLICT_OF_INTEREST` | Người đã chấm không tự xét khiếu nại khi ban tổ chức còn người khác |
| `0x1341` | `4929` | 409 Conflict | `CHARITY_APPEAL_WINDOW_CLOSED` | Đã quá 7 ngày kể từ lúc đánh giá — hết hạn khiếu nại |
| `0x1342` | `4930` | 429 Too Many Requests | `CHARITY_APPEAL_RATE_LIMITED` | Bạn gửi quá nhiều khiếu nại trong 24 giờ — thử lại sau |
| `0x1343` | `4931` | 404 Not Found | `CHARITY_PARTICIPATION_NOT_FOUND` | Không tìm thấy lượt đăng ký tham gia |
| `0x1344` | `4932` | 409 Conflict | `CHARITY_PARTICIPATION_INVALID_STATE` | Lượt tham gia đang ở trạng thái WAITLISTED, không thực hiện được bước này |
| `0x1345` | `4933` | 404 Not Found | `CHARITY_SUPPORT_NEED_NOT_FOUND` | Không tìm thấy hạng mục hỗ trợ |
| `0x1346` | `4934` | 409 Conflict | `CHARITY_SUPPORT_NEED_CLOSED` | Hạng mục hỗ trợ đã đóng hoặc dự án không còn nhận hỗ trợ |
| `0x1347` | `4935` | 409 Conflict | `CHARITY_SUPPORT_NEED_IN_USE` | Hạng mục đã có người nhận hỗ trợ — không xoá được, hãy đóng hạng mục |
| `0x1348` | `4936` | 404 Not Found | `CHARITY_SUPPORT_OFFER_NOT_FOUND` | Không tìm thấy đề nghị hỗ trợ |
| `0x1349` | `4937` | 409 Conflict | `CHARITY_SUPPORT_OFFER_INVALID_STATE` | Đề nghị hỗ trợ đang ở trạng thái COMPLETED, không thực hiện được bước này |
| `0x134a` | `4938` | 404 Not Found | `CHARITY_ROUND_NOT_FOUND` | Không tìm thấy đợt trao |
| `0x134b` | `4939` | 409 Conflict | `CHARITY_ROUND_INVALID_STATE` | Đợt trao đang ở trạng thái CANCELLED, không sửa được nữa |
| `0x134c` | `4940` | 409 Conflict | `CHARITY_PROJECT_COMPLETION_BLOCKED` | Chưa hoàn tất được dự án: còn hạng mục nhu cầu đang mở, còn khiếu nại chưa đóng |
| `0x134d` | `4941` | 409 Conflict | `CHARITY_EXTERNAL_SOURCE_DUPLICATED` | Mã chứng từ nguồn ngoài này đã được ghi nhận trong dự án — tránh đếm trùng |
| `0x134e` | `4942` | 404 Not Found | `CHARITY_DISPUTE_NOT_FOUND` | Không tìm thấy tranh chấp |
| `0x134f` | `4943` | 403 Forbidden | `CHARITY_DISPUTE_NOT_ALLOWED` | Không thực hiện được: chỉ đóng góp đã được chấp nhận mới mở tranh chấp được |
| `0x1350` | `4944` | 409 Conflict | `CHARITY_DISPUTE_ALREADY_OPEN` | Đóng góp này đang có tranh chấp chưa giải quyết |
| `0x1351` | `4945` | 409 Conflict | `CHARITY_DISPUTE_INVALID_STATE` | Tranh chấp đang ở trạng thái RESOLVED, không thực hiện được bước này |
| `0x1352` | `4946` | 400 Bad Request | `CHARITY_POST_VIDEO_TOO_LONG` | Clip dài tối đa 60 giây — cắt ngắn rồi tải lại |
| `0x1401` | `5121` | 404 Not Found | `SPONSOR_BANNER_NOT_FOUND` | Không tìm thấy banner |
| `0x1402` | `5122` | 409 Conflict | `SPONSOR_BANNER_APPROVAL_ALREADY_DECIDED` | Banner này đã được xử lý |
| `0x1403` | `5123` | 409 Conflict | `SPONSOR_BANNER_NOT_SERVING` | Banner này không còn được hiển thị |
| `0x1501` | `5377` | 404 Not Found | `MERIT_UNIT_NOT_FOUND` | Không tìm thấy đơn vị công đức |
| `0x1502` | `5378` | 404 Not Found | `MERIT_DECLARATION_NOT_FOUND` | Không tìm thấy lời khai công đức |
| `0x1503` | `5379` | 409 Conflict | `MERIT_DECLARATION_ALREADY_COMPLETED` | Lời khai này đã được đánh dấu hoàn tất |
| `0x1601` | `5633` | 404 Not Found | `DHARMA_CONTENT_NOT_FOUND` | Không tìm thấy nội dung Phật Pháp |
| `0x1602` | `5634` | 409 Conflict | `DHARMA_CONTENT_NOT_RECITABLE` | Nội dung này không phải kinh để tụng |
| `0x1603` | `5635` | 404 Not Found | `DHARMA_RECITATION_NOT_FOUND` | Không tìm thấy lượt tụng |
| `0x1604` | `5636` | 409 Conflict | `DHARMA_RECITATION_ALREADY_COMPLETED` | Lượt tụng này đã được đánh dấu hoàn tất |
| `0x1605` | `5637` | 404 Not Found | `DHARMA_THREAD_NOT_FOUND` | Không tìm thấy chủ đề |
| `0x1606` | `5638` | 409 Conflict | `DHARMA_THREAD_LOCKED` | Chủ đề này đã khoá bình luận |
| `0x1701` | `5889` | 409 Conflict | `LEADERBOARD_MONTH_CLOSED` | Tháng này đã chốt sổ — không loại người được nữa; gỡ huy hiệu nếu cần |
| `0x1702` | `5890` | 409 Conflict | `LEADERBOARD_EXCLUSION_EXISTS` | Người này đã bị loại khỏi bảng này trong tháng này |
| `0x1703` | `5891` | 404 Not Found | `LEADERBOARD_EXCLUSION_NOT_FOUND` | Không tìm thấy lượt loại đang hiệu lực |
| `0x1704` | `5892` | 404 Not Found | `LEADERBOARD_BADGE_NOT_FOUND` | Không tìm thấy huy hiệu đang hiệu lực |
| `0x1801` | `6145` | 503 | `ATTRIBUTION_NOT_CONFIGURED` | Tính năng liên kết giới thiệu chưa được cấu hình |
| `0x1802` | `6146` | 400 Bad Request | `ATTRIBUTION_TOKEN_INVALID` | Liên kết giới thiệu không hợp lệ |
| `0x1803` | `6147` | 410 | `ATTRIBUTION_TOKEN_EXPIRED` | Liên kết giới thiệu đã hết hạn |
| `0x1804` | `6148` | 410 | `ATTRIBUTION_TOKEN_REVOKED` | Liên kết giới thiệu đã bị thu hồi |
| `0x1805` | `6149` | 409 Conflict | `ATTRIBUTION_ALREADY_CLAIMED` | Liên kết giới thiệu này đã được dùng cho tài khoản khác |
| `0x1806` | `6150` | 409 Conflict | `ATTRIBUTION_REFERRER_EXISTS` | Tài khoản đã có người giới thiệu |
| `0x1807` | `6151` | 409 Conflict | `ATTRIBUTION_SELF_REFERRAL` | Không thể nhận giới thiệu từ chính mình hoặc từ người mình đã giới thiệu |
| `0x1808` | `6152` | 409 Conflict | `ATTRIBUTION_NOT_ELIGIBLE` | Chỉ tài khoản mới đăng ký mới nhận được liên kết giới thiệu |
| `0x1809` | `6153` | 404 Not Found | `ATTRIBUTION_LINK_NOT_FOUND` | Không tìm thấy liên kết giới thiệu |
| `0x180a` | `6154` | 404 Not Found | `ATTRIBUTION_TARGET_NOT_FOUND` | Không tìm thấy nội dung muốn chia sẻ |
| `0x180b` | `6155` | 404 Not Found | `ATTRIBUTION_CLAIM_NOT_FOUND` | Không tìm thấy lượt ghi nhận giới thiệu |
| `0x180c` | `6156` | 409 Conflict | `ATTRIBUTION_CLAIM_ALREADY_REVIEWED` | Lượt ghi nhận này đã được xử lý |

---

Tổng cộng **251 mã lỗi** trên 3 tầng.
Một số mã đã khai trước cho milestone sau nên chưa endpoint nào trả về.
