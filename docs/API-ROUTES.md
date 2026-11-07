# Danh sách route API

> **File sinh tự động** bởi `npm run docs:routes` từ metadata của controller đã biên dịch.
> Đừng sửa tay — sửa controller rồi chạy lại lệnh. CI chạy `docs:routes:check`.

Tiền tố chung: `/api/v1` (riêng `/health` nằm ngoài tiền tố). Tổng **434** route:
59 công khai, 141 cần quyền Admin, 234 cần access token.

Mức truy cập: `Công khai` = không cần token; `Bearer` = cần access token (một số route còn
kiểm chủ sở hữu hoặc quyền RBAC trong use case — xem `docs/API.md`); `perm:<mã>` = quyền Admin
kiểm bởi guard. Chi tiết request/response ở Swagger (`/docs`) và `docs/API.md`.

## `/admin/affiliate-events`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/affiliate-events` | perm:config.read | Audit sự kiện affiliate |
| `POST` | `/admin/affiliate-events/:eventId/reversal` | perm:point.adjust | Thu hồi toàn bộ reward của một sự kiện |
| `GET` | `/admin/affiliate-events/:eventId/rewards` | perm:config.read | Các dòng reward của một sự kiện |

## `/admin/affiliate-policy`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/affiliate-policy` | perm:config.read | Chính sách affiliate đang hiệu lực, kèm lịch sử |
| `PUT` | `/admin/affiliate-policy` | perm:config.write | Publish chính sách affiliate mới |

## `/admin/attribution`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/attribution/claims` | perm:report.read | Các lượt claim link giới thiệu |
| `POST` | `/admin/attribution/claims/:claimId/review` | perm:report.resolve | Duyệt một claim đang chờ |
| `POST` | `/admin/attribution/revocations` | perm:report.resolve | Thu hồi link giới thiệu |

## `/admin/audit-logs`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/audit-logs` | perm:audit.read | Xem audit log Admin |

## `/admin/badges`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/badges` | perm:leaderboard.read | Huy hiệu đã trao |
| `PATCH` | `/admin/badges/:badgeId/revoke` | perm:leaderboard.moderate | Gỡ một huy hiệu |

## `/admin/banners`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/banners` | perm:banner.read | Danh sách banner, kèm số liệu |
| `POST` | `/admin/banners` | perm:banner.manage | Tạo banner |
| `PATCH` | `/admin/banners/:id` | perm:banner.manage | Sửa banner |
| `DELETE` | `/admin/banners/:id` | perm:banner.manage | Xoá banner |
| `PATCH` | `/admin/banners/:id/active` | perm:banner.manage | Bật hoặc tắt banner |
| `PATCH` | `/admin/banners/:id/approval` | perm:banner.manage | Duyệt hoặc từ chối banner |

## `/admin/blogs`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/blogs` | perm:blog.read | Danh sách bài viết, gồm cả bản nháp |
| `POST` | `/admin/blogs` | perm:blog.manage | Soạn bài viết mới |
| `GET` | `/admin/blogs/:blogId` | perm:blog.read | Một bài viết cho CMS, gồm bản nháp và `contentHtml` |
| `PUT` | `/admin/blogs/:blogId` | perm:blog.manage | Sửa bài viết |
| `DELETE` | `/admin/blogs/:blogId` | perm:blog.manage | Xoá bài viết |

## `/admin/campaigns`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/campaigns` | perm:campaign.read | Danh sách chiến dịch & cấu hình Home |
| `POST` | `/admin/campaigns` | perm:campaign.manage | Tạo chiến dịch & bố cục Home mới |
| `GET` | `/admin/campaigns/:campaignId` | perm:campaign.read | Một chiến dịch, để mở ra sửa |
| `PUT` | `/admin/campaigns/:campaignId` | perm:campaign.manage | Sửa chiến dịch & bố cục Home |
| `DELETE` | `/admin/campaigns/:campaignId` | perm:campaign.manage | Xoá một giao diện trang chủ |

## `/admin/candidate-selection`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/candidate-selection` | perm:config.read | Thứ tự ưu tiên chọn người nhận |
| `PUT` | `/admin/candidate-selection` | perm:config.write | Đặt thứ tự ưu tiên chọn người nhận |

## `/admin/categories`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/categories` | perm:category.read | Cây danh mục gồm cả mục đã tắt |

## `/admin/charity-appeals`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/charity-appeals` | perm:report.read | Hàng đợi khiếu nại dự án từ thiện |
| `PATCH` | `/admin/charity-appeals/:appealId` | perm:report.resolve | Quyết định tầng 2 / mở lại |

## `/admin/charity-campaigns`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/charity-campaigns` | perm:campaign.read | Danh sách hoạt động (mọi trạng thái) |
| `POST` | `/admin/charity-campaigns` | perm:campaign.manage | Admin tạo hoạt động trực tiếp |
| `GET` | `/admin/charity-campaigns/:id` | perm:campaign.read | Một hoạt động cho CMS, mọi trạng thái duyệt |
| `PATCH` | `/admin/charity-campaigns/:id` | perm:campaign.manage | Admin sửa nội dung một hoạt động |
| `DELETE` | `/admin/charity-campaigns/:id` | perm:campaign.manage | Xoá một hoạt động từ thiện |
| `PATCH` | `/admin/charity-campaigns/:id/active` | perm:campaign.manage | Bật hoặc tắt một hoạt động |
| `PATCH` | `/admin/charity-campaigns/:id/approval` | perm:campaign.manage | Duyệt hoặc từ chối hồ sơ |
| `PATCH` | `/admin/charity-campaigns/:id/limits` | perm:campaign.manage | Ghi đè giới hạn của một dự án |
| `GET` | `/admin/charity-campaigns/:id/needs` | perm:campaign.read | Bảng nhu cầu vật phẩm cho CMS, mọi trạng thái duyệt |
| `PATCH` | `/admin/charity-campaigns/:id/progress` | perm:campaign.manage | Admin cập nhật số phần quà đã trao |
| `GET` | `/admin/charity-campaigns/:id/promotion` | perm:campaign.read | Trạng thái card Home của một dự án |
| `PATCH` | `/admin/charity-campaigns/:id/promotion` | perm:campaign.manage | Bật / tắt card Home của một dự án |

## `/admin/chat`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/chat/flags` | perm:report.read | Hàng đợi cờ kiểm duyệt chat |
| `PATCH` | `/admin/chat/flags/:flagId/review` | perm:report.resolve | Xử một cờ |
| `GET` | `/admin/chat/flags/pending-count` | perm:report.read | Số cờ chat chưa xem |
| `DELETE` | `/admin/chat/messages/:messageId` | perm:report.resolve | Gỡ một tin nhắn bị báo xấu |
| `GET` | `/admin/chat/rooms/:roomId/messages` | perm:report.read | Đọc một phòng chat để điều tra báo xấu |

## `/admin/check-in-policy`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/check-in-policy` | perm:config.read | Policy điểm danh đang hiệu lực, kèm lịch sử |
| `PUT` | `/admin/check-in-policy` | perm:config.write | Publish bản policy điểm danh mới |

## `/admin/comments`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/comments` | perm:post.moderate | Hàng đợi bình luận chờ duyệt |
| `PATCH` | `/admin/comments/:commentId/moderation` | perm:post.moderate | Cho hiện lại hoặc gỡ hẳn một bình luận |
| `GET` | `/admin/comments/pending-count` | perm:post.moderate | Số bình luận đang chờ duyệt |

## `/admin/config`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/config/allocation-policy` | perm:config.read | Chính sách phân bổ & ghép nối đang hiệu lực |
| `PUT` | `/admin/config/allocation-policy` | perm:config.write | Publish chính sách phân bổ & ghép nối |
| `GET` | `/admin/config/trust-thresholds` | perm:config.read | Ba ngưỡng tin cậy: mô tả đúng, điểm sao, báo xấu ác ý |
| `PUT` | `/admin/config/trust-thresholds/giver-accuracy` | perm:config.write | Publish ngưỡng chỉ số mô tả đúng (`accuracy.giver`) |
| `PUT` | `/admin/config/trust-thresholds/report-abuse` | perm:config.write | Publish ngưỡng nhận diện báo xấu ác ý (`report.abuse`) |
| `PUT` | `/admin/config/trust-thresholds/review-rating` | perm:config.write | Publish ngưỡng công bố điểm sao (`rating.display`) |

## `/admin/dashboard`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/dashboard` | perm:dashboard.read | Bảng số liệu điều hành (F59) |

## `/admin/dharma`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/dharma/contents` | perm:dharma.read | Danh sách nội dung, gồm cả bản nháp |
| `POST` | `/admin/dharma/contents` | perm:dharma.manage | Soạn nội dung mới |
| `GET` | `/admin/dharma/contents/:id` | perm:dharma.read | Một nội dung cho CMS, gồm bản nháp và `bodyText` |
| `PATCH` | `/admin/dharma/contents/:id` | perm:dharma.manage | Sửa nội dung |
| `DELETE` | `/admin/dharma/contents/:id` | perm:dharma.manage | Xoá nội dung |
| `GET` | `/admin/dharma/threads` | perm:post.moderate | Danh sách chủ đề, mọi trạng thái |
| `PATCH` | `/admin/dharma/threads/:id/moderation` | perm:post.moderate | Duyệt, ẩn, khoá bình luận, ghim |

## `/admin/entitlements`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/entitlements` | perm:entitlement.read | Bản chính sách quyền/quota đang hiệu lực |
| `POST` | `/admin/entitlements` | perm:entitlement.write | Publish bản chính sách mới |
| `GET` | `/admin/entitlements/history` | perm:entitlement.read | Lịch sử các bản chính sách quyền/quota |

## `/admin/groups`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/groups` | perm:admin.access | Tìm nhóm để chọn |
| `GET` | `/admin/groups/:groupId` | perm:admin.access | Một nhóm cho CMS, mọi trạng thái |
| `POST` | `/admin/groups/:groupId/dissolve` | perm:admin.manage | Giải tán một nhóm |
| `POST` | `/admin/groups/:groupId/invite-link/rotate` | perm:admin.manage | Đổi mã mời của một nhóm (khi link bị lộ) |
| `GET` | `/admin/groups/:groupId/members` | perm:admin.access | Thành viên đang hiệu lực của một nhóm |
| `GET` | `/admin/groups/radius-policy` | perm:config.read | Thang bán kính vùng nhóm theo bậc |
| `PUT` | `/admin/groups/radius-policy` | perm:config.write | Đặt thang bán kính |
| `GET` | `/admin/groups/role-permissions` | perm:config.read | Bộ quyền của từng vai trong nhóm |
| `PUT` | `/admin/groups/role-permissions/:role` | perm:config.write | Thay bộ quyền của một vai |

## `/admin/leaderboards`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/leaderboards/exclusions` | perm:leaderboard.read | Danh sách lượt loại khỏi bảng |
| `POST` | `/admin/leaderboards/exclusions` | perm:leaderboard.moderate | Loại một người khỏi bảng của một tháng |
| `DELETE` | `/admin/leaderboards/exclusions/:exclusionId` | perm:leaderboard.moderate | Bỏ một lượt loại |
| `GET` | `/admin/leaderboards/monthly` | perm:leaderboard.read | Bảng thành tích với danh tính thật |

## `/admin/lunar-holidays`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/lunar-holidays` | perm:config.read | Danh mục Ngày lễ Phật giáo, gồm cả dòng đã tắt |
| `PUT` | `/admin/lunar-holidays` | perm:config.write | Thay toàn bộ danh mục Ngày lễ |

## `/admin/me`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/me` | perm:admin.access | Role và permission của phiên Admin hiện tại |

## `/admin/media`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/media` | perm:admin.access | Thư viện ảnh dùng chung của CMS |
| `POST` | `/admin/media` | perm:admin.access | Bước 3: xác nhận ảnh đã tải và đưa vào thư viện |
| `POST` | `/admin/media/audio` | perm:admin.access | Xác nhận âm thanh đã tải |
| `POST` | `/admin/media/audio/upload` | perm:admin.access | Xin URL tải âm thanh (Phật pháp) |
| `POST` | `/admin/media/upload` | perm:admin.access | Bước 1: xin URL tải ảnh lên thư viện |

## `/admin/merit-units`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/merit-units` | perm:merit.read | Danh sách đơn vị Công đức |
| `POST` | `/admin/merit-units` | perm:merit.manage | Tạo đơn vị Công đức |
| `GET` | `/admin/merit-units/:id` | perm:merit.read | Một đơn vị Công đức cho CMS |
| `PATCH` | `/admin/merit-units/:id` | perm:merit.manage | Sửa đơn vị Công đức |
| `DELETE` | `/admin/merit-units/:id` | perm:merit.manage | Xoá đơn vị |
| `PATCH` | `/admin/merit-units/:id/active` | perm:merit.manage | Bật hoặc tắt đơn vị |
| `GET` | `/admin/merit-units/declarations` | perm:merit.read | Danh sách lời khai công đức (đối soát) |

## `/admin/notification-channels`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/notification-channels` | perm:notification.manage | Cấu hình các kênh gửi email/SMS/Zalo |
| `PUT` | `/admin/notification-channels/:channel` | perm:notification.manage | Đổi cấu hình một kênh gửi |

## `/admin/notification-templates`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/notification-templates` | perm:notification.manage | Danh sách mẫu thông báo |
| `PUT` | `/admin/notification-templates/:type` | perm:notification.manage | Sửa nội dung hoặc bật/tắt một mẫu |

## `/admin/notifications`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/notifications/broadcasts` | perm:notification.manage | Lịch sử các lượt gửi hàng loạt |
| `POST` | `/admin/notifications/broadcasts` | perm:notification.manage | Xếp một lượt gửi thông báo hàng loạt |
| `POST` | `/admin/notifications/broadcasts/:broadcastId/send` | perm:notification.manage | Gửi ngay một lượt gửi hàng loạt |

## `/admin/permissions`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/permissions` | perm:admin.manage | Danh mục permission |

## `/admin/points`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/admin/points/adjust` | perm:point.adjust | Cộng/trừ điểm cho một người, kèm lý do |
| `POST` | `/admin/points/ledger/:entryId/reversal` | perm:point.adjust | Hoàn một bút toán điểm |
| `GET` | `/admin/points/rules` | perm:config.read | Danh sách point rule đang hiệu lực |
| `POST` | `/admin/points/rules` | perm:config.write | Publish version mới cho một point rule |

## `/admin/posts`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/posts` | perm:post.read | Hàng đợi bài đăng cho CMS |
| `GET` | `/admin/posts/:postId` | perm:post.read | Chi tiết bài đăng dành cho moderator |
| `PATCH` | `/admin/posts/:postId/moderation` | perm:post.moderate | Duyệt hoặc từ chối bài đăng |

## `/admin/ranks`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/ranks/policy` | perm:config.read | Đọc chính sách thăng hạng hiện tại |
| `POST` | `/admin/ranks/policy` | perm:config.write | Cập nhật chính sách thăng hạng |
| `POST` | `/admin/ranks/policy/maintenance` | perm:config.write | Cập nhật chỉ tiêu duy trì hạng |

## `/admin/recipient-selections`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/recipient-selections` | perm:post.read | Danh sách lượt trao do hệ thống tự chọn người nhận |
| `GET` | `/admin/recipient-selections/:transactionId` | perm:post.read | Vì sao hệ thống chọn người này cho một lượt trao |

## `/admin/referrals`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/referrals/review` | perm:report.read | Ai đang có dấu hiệu tự tạo nhiều tài khoản để nhận thưởng giới thiệu |

## `/admin/reports`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/reports` | perm:report.read | Hàng đợi báo cáo vi phạm |
| `GET` | `/admin/reports/:reportId` | perm:report.read | Chi tiết report và bằng chứng |
| `PATCH` | `/admin/reports/:reportId/review` | perm:report.resolve | Kết luận hoặc bác bỏ report, có audit — và áp chế tài cùng lúc |
| `GET` | `/admin/reports/reporters` | perm:report.read | Ai đang báo xấu bừa |

## `/admin/roles`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/roles` | perm:admin.manage | Danh sách role và quyền kèm theo |
| `POST` | `/admin/roles` | perm:admin.manage | Tạo role mới |
| `PATCH` | `/admin/roles/:roleCode` | perm:admin.manage | Sửa role: tên, bật/tắt, bộ quyền |

## `/admin/system-configs`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/system-configs` | perm:config.read | Danh sách system config đang hiệu lực |
| `POST` | `/admin/system-configs` | perm:config.write | Publish system config revision mới |

## `/admin/system-logs`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/system-logs` | perm:audit.read | Nhật ký hệ thống theo từng loại |

## `/admin/transactions`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/transactions` | perm:post.read | Danh sách lượt trao, có bộ lọc |
| `GET` | `/admin/transactions/:transactionId` | perm:post.read | Một lượt trao, kèm ảnh bằng chứng |
| `PATCH` | `/admin/transactions/:transactionId/reopen` | perm:admin.manage | Mở lại một lượt trao đã đóng nhầm |

## `/admin/users`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/admin/users` | perm:admin.manage | Tìm người dùng |
| `GET` | `/admin/users/:userId` | perm:admin.manage | Chi tiết một người dùng |
| `DELETE` | `/admin/users/:userId` | perm:admin.manage | Xoá mềm tài khoản |
| `GET` | `/admin/users/:userId/points/ledger` | perm:point.read | Sổ điểm của một người dùng |
| `POST` | `/admin/users/:userId/roles` | perm:admin.manage | Cấp role cho một tài khoản |
| `DELETE` | `/admin/users/:userId/roles` | perm:admin.manage | Thu hồi role của một tài khoản |
| `PATCH` | `/admin/users/:userId/status` | perm:admin.manage | Đổi trạng thái tài khoản |
| `POST` | `/admin/users/verified-phones/release` | perm:admin.manage | Giải phóng một số điện thoại đã xác minh |

## `/attribution`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/attribution/claim` | Bearer | Gắn người giới thiệu cho tài khoản vừa đăng ký |
| `POST` | `/attribution/clicks` | Công khai | Landing ghi lượt mở link, nhận token |
| `POST` | `/attribution/links` | Bearer | Tạo link giới thiệu |
| `POST` | `/attribution/resolve` | Công khai | App mới cài resolve token từ clipboard |

## `/auth`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `DELETE` | `/auth/account` | Bearer | Xoá tài khoản |
| `POST` | `/auth/login` | Công khai | Đăng nhập |
| `POST` | `/auth/logout` | Bearer | Đăng xuất |
| `GET` | `/auth/me` | Bearer | Danh tính của phiên hiện tại |
| `PATCH` | `/auth/password` | Bearer | Đổi mật khẩu khi đang đăng nhập |
| `POST` | `/auth/password-reset/confirm` | Công khai | Xác nhận mã và đặt mật khẩu mới |
| `POST` | `/auth/password-reset/request` | Công khai | Xin mã đặt lại mật khẩu |
| `POST` | `/auth/password-reset/verify-otp` | Công khai | Xác thực mã OTP đặt lại mật khẩu |
| `POST` | `/auth/refresh` | Công khai | Làm mới phiên |
| `POST` | `/auth/register` | Công khai | Đăng ký tài khoản |

## `/banners`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/banners` | Công khai | Banner đang chạy ở một vị trí |
| `POST` | `/banners/:id/click` | Công khai | Ghi một lượt bấm và lấy đích để mở |

## `/blogs`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/blogs` | Công khai | Danh sách bài viết đã xuất bản |
| `GET` | `/blogs/:idOrSlug` | Công khai | Một bài viết, theo slug hoặc id |

## `/campaigns`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/campaigns` | Công khai | Danh sách hoạt động từ thiện đã duyệt |
| `GET` | `/campaigns/:idOrSlug` | Công khai | Một hoạt động, theo slug hoặc id |
| `GET` | `/campaigns/:idOrSlug/needs` | Công khai | Bảng nhu cầu vật phẩm và tiến độ từng dòng (F65b) |

## `/categories`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/categories` | Công khai | Cây danh mục đang hoạt động |
| `POST` | `/categories` | Bearer | Tạo danh mục |
| `PATCH` | `/categories/:categoryId` | Bearer | Sửa hoặc tắt danh mục |
| `POST` | `/categories/:categoryId/merge` | Bearer | Gộp danh mục này vào danh mục khác |

## `/charity-appeals`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/charity-appeals/:appealId` | Bearer | Chi tiết khiếu nại và nhật ký từng bước |
| `PATCH` | `/charity-appeals/:appealId` | Bearer | Xử khiếu nại tầng 1 |

## `/charity-campaigns`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/charity-campaigns` | Bearer | Gửi hồ sơ hoạt động từ thiện |
| `GET` | `/charity-campaigns/:id/appeals` | Bearer | Khiếu nại của dự án (ban tổ chức) |
| `POST` | `/charity-campaigns/:id/appeals` | Bearer | Khiếu nại mức hoàn thành / giá trị xác nhận |
| `POST` | `/charity-campaigns/:id/bank-accounts` | Bearer | Thêm (hoặc thay) tài khoản nhận |
| `POST` | `/charity-campaigns/:id/bank-accounts/:accountId/close` | Bearer | Đóng tài khoản nhận |
| `GET` | `/charity-campaigns/:id/beneficiary` | Bearer | Thông tin người thụ hưởng — RIÊNG TƯ (F65b §2) |
| `PUT` | `/charity-campaigns/:id/beneficiary` | Bearer | Ghi thông tin người thụ hưởng (chỉ người tổ chức) |
| `POST` | `/charity-campaigns/:id/close` | Bearer | Đóng hoạt động (người tổ chức hoặc Admin) — F65b §8 |
| `POST` | `/charity-campaigns/:id/comment-media/upload-url` | Bearer | Đường tải ảnh cho bình luận trong dự án |
| `GET` | `/charity-campaigns/:id/comments` | Công khai | Bình luận gốc của dự án |
| `POST` | `/charity-campaigns/:id/comments` | Bearer | Bình luận vào dự án |
| `GET` | `/charity-campaigns/:id/completion-check` | Bearer | Điều kiện hoàn tất dự án |
| `GET` | `/charity-campaigns/:id/contributions` | Bearer | Danh sách đề nghị của một hoạt động (người tổ chức) |
| `POST` | `/charity-campaigns/:id/contributions` | Bearer | Gửi đề nghị đóng góp vật phẩm (F65b §4) |
| `PATCH` | `/charity-campaigns/:id/contributions/:contributionId/public-name` | Bearer | Hiện / ẩn tên tôi trong danh sách người ủng hộ (một đóng góp) |
| `GET` | `/charity-campaigns/:id/coordinators` | Bearer | Danh sách coordinator đang có hiệu lực |
| `POST` | `/charity-campaigns/:id/coordinators` | Bearer | Giao quyền coordinator (chỉ người tổ chức) |
| `DELETE` | `/charity-campaigns/:id/coordinators/:userId` | Bearer | Thu quyền coordinator (chỉ người tổ chức) |
| `PUT` | `/charity-campaigns/:id/custom-sections` | Bearer | Thay form mở (mục và trường tuỳ biến) |
| `GET` | `/charity-campaigns/:id/disputes` | Bearer | Tranh chấp đóng góp của dự án |
| `GET` | `/charity-campaigns/:id/evaluations` | Bearer | Mức hoàn thành của người tham gia (nội bộ) |
| `PUT` | `/charity-campaigns/:id/evaluations/:userId` | Bearer | Chấm mức hoàn thành 0–100 |
| `GET` | `/charity-campaigns/:id/evaluations/me` | Bearer | Mức hoàn thành của tôi |
| `PATCH` | `/charity-campaigns/:id/event-steps/:stepId` | Bearer | Cập nhật một bước của timeline |
| `GET` | `/charity-campaigns/:id/exports` | Bearer | Các bản in đã tạo (50 bản mới nhất) |
| `POST` | `/charity-campaigns/:id/exports` | Bearer | Tạo bản in PDF |
| `GET` | `/charity-campaigns/:id/exports/:exportId/pdf` | Bearer | Tải bản in PDF |
| `POST` | `/charity-campaigns/:id/extend` | Bearer | Gia hạn hoạt động đang mở (người tổ chức hoặc Admin) — F65b §8 |
| `GET` | `/charity-campaigns/:id/external-contributions` | Bearer | Lịch sử đóng góp ngoài app (người tổ chức) |
| `POST` | `/charity-campaigns/:id/external-contributions` | Bearer | Ghi nhận vật phẩm nhận NGOÀI APP (F65b §7) |
| `POST` | `/charity-campaigns/:id/financial-reports` | Bearer | Thêm báo cáo tài chính |
| `PUT` | `/charity-campaigns/:id/financial-reports/:reportId` | Bearer | Sửa báo cáo tài chính |
| `POST` | `/charity-campaigns/:id/funding-needs` | Bearer | Thêm hạng mục kêu gọi tiền |
| `PATCH` | `/charity-campaigns/:id/funding-needs/:fundingNeedId` | Bearer | Sửa hạng mục kêu gọi tiền, ghi số đã nhận, đóng/mở |
| `GET` | `/charity-campaigns/:id/internal-stats` | Bearer | Thống kê nội bộ |
| `PATCH` | `/charity-campaigns/:id/item-needs/:needItemId` | Bearer | Đơn giá, tình trạng, nguồn cung, tiếp nhận của một dòng hiện vật |
| `PUT` | `/charity-campaigns/:id/media` | Bearer | Thay cả bộ ảnh/video của hồ sơ đang chờ duyệt |
| `POST` | `/charity-campaigns/:id/other-support-needs` | Bearer | Thêm hạng mục hỗ trợ mở |
| `PATCH` | `/charity-campaigns/:id/other-support-needs/:supportNeedId` | Bearer | Sửa hạng mục hỗ trợ mở, ghi nguồn ngoài app, đóng/mở |
| `DELETE` | `/charity-campaigns/:id/other-support-needs/:supportNeedId` | Bearer | Xoá hạng mục hỗ trợ mở |
| `POST` | `/charity-campaigns/:id/other-support-needs/:supportNeedId/offers` | Bearer | Nhận hỗ trợ (một phần, nhiều lần được) |
| `GET` | `/charity-campaigns/:id/other-support-needs/manage` | Bearer | Hạng mục hỗ trợ mở (ban tổ chức) |
| `GET` | `/charity-campaigns/:id/participation` | Bearer | Lượt tham gia của tôi |
| `POST` | `/charity-campaigns/:id/participation` | Bearer | Đăng ký tham gia |
| `POST` | `/charity-campaigns/:id/participation/cancel` | Bearer | Huỷ đăng ký |
| `PATCH` | `/charity-campaigns/:id/participation/public-name` | Bearer | Hiện / ẩn tên tôi trong danh sách người tham gia |
| `GET` | `/charity-campaigns/:id/participations` | Bearer | Danh sách participant (ban tổ chức) |
| `PATCH` | `/charity-campaigns/:id/participations/:participationId` | Bearer | Duyệt / danh sách chờ / từ chối / vắng mặt / hoàn thành |
| `POST` | `/charity-campaigns/:id/participations/:participationId/check-in` | Bearer | Check-in participant tại sự kiện |
| `PUT` | `/charity-campaigns/:id/parties` | Bearer | Thay danh sách đơn vị liên quan |
| `PUT` | `/charity-campaigns/:id/phases` | Bearer | Thay tiến độ 4 bước |
| `POST` | `/charity-campaigns/:id/posts` | Bearer | Đăng bài ảnh/clip vào dự án |
| `DELETE` | `/charity-campaigns/:id/posts/:postId` | Bearer | Gỡ bài |
| `POST` | `/charity-campaigns/:id/posts/:postId/comment-media/upload-url` | Bearer | Đường tải ảnh cho bình luận trong một bài |
| `GET` | `/charity-campaigns/:id/posts/:postId/comments` | Công khai | Bình luận gốc của một bài |
| `POST` | `/charity-campaigns/:id/posts/:postId/comments` | Bearer | Bình luận vào một bài |
| `GET` | `/charity-campaigns/:id/posts/:postId/reactions` | Công khai | Ai đã bày tỏ cảm xúc với một bài |
| `PUT` | `/charity-campaigns/:id/posts/:postId/reactions/me` | Bearer | Bày tỏ cảm xúc với một bài |
| `DELETE` | `/charity-campaigns/:id/posts/:postId/reactions/me` | Bearer | Gỡ cảm xúc của mình khỏi một bài |
| `POST` | `/charity-campaigns/:id/posts/media/upload` | Bearer | Ký đường tải ảnh/clip cho bài |
| `GET` | `/charity-campaigns/:id/posts/quota` | Bearer | Quyền đăng và quota ảnh/clip hôm nay của tôi |
| `PUT` | `/charity-campaigns/:id/profile` | Bearer | Lời kêu gọi và loại kêu gọi tham gia |
| `PATCH` | `/charity-campaigns/:id/progress` | Bearer | Cập nhật số phần quà đã trao |
| `POST` | `/charity-campaigns/:id/promotion-request` | Bearer | Đề xuất lên card Home |
| `GET` | `/charity-campaigns/:id/reactions` | Công khai | Ai đã bày tỏ cảm xúc với dự án |
| `PUT` | `/charity-campaigns/:id/reactions/me` | Bearer | Thích / bày tỏ cảm xúc với dự án |
| `DELETE` | `/charity-campaigns/:id/reactions/me` | Bearer | Gỡ cảm xúc của mình khỏi dự án |
| `POST` | `/charity-campaigns/:id/reviews` | Bearer | Đánh giá sau hoạt động |
| `PUT` | `/charity-campaigns/:id/round-assignments` | Bearer | Gắn participant / lượt giao nhận vào đợt trao |
| `POST` | `/charity-campaigns/:id/rounds` | Bearer | Thêm đợt trao |
| `PATCH` | `/charity-campaigns/:id/rounds/:roundId` | Bearer | Sửa / hoãn đợt trao |
| `PUT` | `/charity-campaigns/:id/rounds/:roundId/readiness` | Bearer | Checklist trước 48 giờ và xác nhận sẵn sàng của đợt |
| `POST` | `/charity-campaigns/:id/rounds/:roundId/status` | Bearer | Ghi nhận xong / huỷ đợt trao |
| `GET` | `/charity-campaigns/:id/rounds/manage` | Bearer | Các đợt trao (ban tổ chức) |
| `PUT` | `/charity-campaigns/:id/sections/:sectionKey` | Bearer | Lưu một mục (A/B/C/D) |
| `POST` | `/charity-campaigns/:id/sections/:sectionKey/publish` | Bearer | Công khai một mục |
| `POST` | `/charity-campaigns/:id/stage` | Bearer | Chuyển giai đoạn |
| `POST` | `/charity-campaigns/:id/stage/postpone` | Bearer | Hoãn bước trao |
| `POST` | `/charity-campaigns/:id/submit` | Bearer | Gửi duyệt bản nháp |
| `GET` | `/charity-campaigns/:id/summary` | Bearer | Tổng kết + báo cáo tài chính (workspace) |
| `PUT` | `/charity-campaigns/:id/summary` | Bearer | Lưu tổng kết (tab D) |
| `POST` | `/charity-campaigns/:id/summary/publish` | Bearer | Công khai tổng kết |
| `GET` | `/charity-campaigns/:id/support-offers` | Bearer | Đề nghị hỗ trợ mở |
| `PATCH` | `/charity-campaigns/:id/support-offers/:offerId` | Bearer | Nhận / từ chối / ghi hoàn thành đề nghị hỗ trợ |
| `POST` | `/charity-campaigns/:id/support-offers/:offerId/withdraw` | Bearer | Rút đề nghị hỗ trợ của tôi |
| `GET` | `/charity-campaigns/:id/tasks` | Bearer | Checklist triển khai (tab B) |
| `PATCH` | `/charity-campaigns/:id/tasks/:taskId` | Bearer | Cập nhật một việc trong checklist |
| `PUT` | `/charity-campaigns/:id/team` | Bearer | Thay ban tổ chức (6 vai trò) |
| `POST` | `/charity-campaigns/:id/volunteer-needs` | Bearer | Thêm vị trí tuyển người |
| `PATCH` | `/charity-campaigns/:id/volunteer-needs/:volunteerNeedId` | Bearer | Sửa vị trí tuyển người, đổi trạng thái OPEN/CLOSED/STARTED |
| `POST` | `/charity-campaigns/:id/volunteer-needs/:volunteerNeedId/registrations` | Bearer | Đăng ký tham gia một vị trí |
| `POST` | `/charity-campaigns/:id/volunteer-needs/:volunteerNeedId/registrations/:userId/confirm` | Bearer | Ban tổ chức xác nhận người tham gia |
| `DELETE` | `/charity-campaigns/:id/volunteer-needs/:volunteerNeedId/registrations/me` | Bearer | Huỷ đăng ký của chính mình |
| `GET` | `/charity-campaigns/:id/workspace` | Bearer | Workspace ban tổ chức |
| `GET` | `/charity-campaigns/:id/workspace/revisions` | Bearer | Lịch sử sửa đầy đủ (workspace) |
| `GET` | `/charity-campaigns/:idOrSlug/event-steps` | Công khai | Timeline sự kiện trao (SỐNG) |
| `POST` | `/charity-campaigns/:idOrSlug/follow` | Bearer | Quan tâm dự án |
| `DELETE` | `/charity-campaigns/:idOrSlug/follow` | Bearer | Bỏ quan tâm dự án |
| `GET` | `/charity-campaigns/:idOrSlug/other-support-needs` | Công khai | Hạng mục hỗ trợ mở (công khai) |
| `GET` | `/charity-campaigns/:idOrSlug/posts` | Công khai | Bài ảnh/clip của dự án |
| `GET` | `/charity-campaigns/:idOrSlug/public` | Công khai | Bản công khai của dự án |
| `GET` | `/charity-campaigns/:idOrSlug/public-stats` | Công khai | Thống kê công khai |
| `GET` | `/charity-campaigns/:idOrSlug/revisions` | Công khai | Changelog công khai |
| `GET` | `/charity-campaigns/:idOrSlug/rounds` | Công khai | Các đợt trao (công khai) |
| `POST` | `/charity-campaigns/:idOrSlug/share-links` | Bearer | Tạo link chia sẻ công khai |
| `GET` | `/charity-campaigns/joined` | Bearer | Hoạt động tôi đã đăng ký |
| `POST` | `/charity-campaigns/media/upload` | Bearer | Xin URL tải ảnh/video cho hoạt động từ thiện |
| `GET` | `/charity-campaigns/mine` | Bearer | Hồ sơ hoạt động tôi đã gửi |

## `/charity-contributions`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/charity-contributions/:id` | Bearer | Một đề nghị đóng góp (đích của thông báo CHARITY_CONTRIBUTION_*) |
| `PATCH` | `/charity-contributions/:id` | Bearer | Sửa hoặc rút đề nghị đóng góp |
| `POST` | `/charity-contributions/:id/decision` | Bearer | Người tổ chức quyết mọi dòng của một đề nghị (F65b §5) |
| `GET` | `/charity-contributions/:id/disputes` | Bearer | Tranh chấp của một đóng góp |
| `POST` | `/charity-contributions/:id/disputes` | Bearer | Mở tranh chấp về một đóng góp |
| `GET` | `/charity-contributions/me` | Bearer | Đề nghị đóng góp của chính tôi |

## `/charity-deliveries`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/charity-deliveries/:id` | Bearer | Một lượt giao nhận từ thiện |
| `POST` | `/charity-deliveries/:id/cancel` | Bearer | Huỷ lượt giao nhận (người tặng hoặc người tổ chức) |
| `POST` | `/charity-deliveries/:id/complete` | Bearer | Người tổ chức xác nhận đã nhận, kèm số thực nhận từng dòng |

## `/charity-disputes`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `PATCH` | `/charity-disputes/:disputeId` | Bearer | Giải quyết / rút tranh chấp |

## `/charity-external-contributions`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `PATCH` | `/charity-external-contributions/:id` | Bearer | Huỷ hoặc điều chỉnh một bản ghi ngoài app — luôn kèm lý do |

## `/chat`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/chat/direct-post/rooms` | Bearer | Mở phòng chat trực tiếp về một bài Rao vặt |
| `POST` | `/chat/direct-user/rooms` | Bearer | Mở phòng chat trực tiếp với một người dùng |
| `GET` | `/chat/rooms` | Bearer | Danh sách hội thoại của chính mình |
| `POST` | `/chat/rooms/:roomId/message-media/upload-url` | Bearer | Đường tải ảnh cho tin nhắn chat |
| `GET` | `/chat/rooms/:roomId/messages` | Bearer | Lịch sử tin nhắn của một phòng |
| `POST` | `/chat/rooms/:roomId/messages` | Bearer | Gửi tin nhắn |
| `DELETE` | `/chat/rooms/:roomId/messages/:messageId` | Bearer | Thu hồi một tin nhắn vừa gửi |
| `PATCH` | `/chat/rooms/:roomId/mute` | Bearer | Tắt hoặc bật lại thông báo của một phòng |
| `PATCH` | `/chat/rooms/:roomId/read` | Bearer | Đánh dấu đã đọc tới hiện tại |

## `/check-ins`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/check-ins` | Bearer | Điểm danh hôm nay |
| `GET` | `/check-ins/me` | Bearer | Trạng thái điểm danh của chính mình |
| `GET` | `/check-ins/me/history` | Bearer | Lịch điểm danh của chính mình, phân trang |
| `POST` | `/check-ins/repairs` | Bearer | Bù một ngày đã bỏ lỡ để nối lại chuỗi |

## `/comments`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `PATCH` | `/comments/:commentId` | Bearer | Sửa bình luận của chính mình |
| `DELETE` | `/comments/:commentId` | Bearer | Gỡ bình luận |
| `GET` | `/comments/:commentId/replies` | Công khai | Trả lời của một bình luận |
| `PUT` | `/comments/:subjectId/reactions/me` | Bearer | Đặt hoặc đổi cảm xúc cho một bình luận |
| `DELETE` | `/comments/:subjectId/reactions/me` | Bearer | Gỡ cảm xúc của mình khỏi một bình luận |

## `/config`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/config/home-layout` | Công khai | Bố cục Home đang hoạt động |
| `GET` | `/config/lunar-today` | Công khai | Ngày âm lịch hôm nay, can chi, mốc Rằm/Mùng Một và ngày lễ |

## `/dharma`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/dharma/contents` | Công khai | Danh sách nội dung Phật Pháp đã xuất bản |
| `POST` | `/dharma/contents/:id/recitations` | Bearer | Bắt đầu một lượt tụng |
| `GET` | `/dharma/contents/:idOrSlug` | Công khai | Một nội dung, theo slug hoặc id |
| `GET` | `/dharma/dedications` | Công khai | Danh sách hồi hướng công khai |
| `POST` | `/dharma/dedications` | Bearer | Viết lời hồi hướng |
| `GET` | `/dharma/dedications/mine` | Bearer | Lời hồi hướng của tôi |
| `GET` | `/dharma/hub` | Công khai | Dharma Hub — bảy entry của Layer 1 và các section xem trước |
| `GET` | `/dharma/leaderboards/forum-engagement` | Công khai | Tác giả có chủ đề diễn đàn được tương tác nhiều nhất trong tháng |
| `GET` | `/dharma/leaderboards/recitation-time` | Công khai | Người dành nhiều thời gian tụng kinh nhất trong tháng |
| `PATCH` | `/dharma/recitations/:recitationId/complete` | Bearer | Đánh dấu đã tụng xong |
| `GET` | `/dharma/recitations/mine` | Bearer | Lịch sử tụng kinh của tôi |
| `GET` | `/dharma/threads` | Công khai | Danh sách chủ đề |
| `POST` | `/dharma/threads` | Bearer | Tạo chủ đề |
| `GET` | `/dharma/threads/:id` | Công khai | Một chủ đề |
| `POST` | `/dharma/threads/:subjectId/comment-media/upload-url` | Bearer | Đường tải ảnh cho bình luận trong chủ đề |
| `GET` | `/dharma/threads/:subjectId/comments` | Công khai | Bình luận gốc của một chủ đề |
| `POST` | `/dharma/threads/:subjectId/comments` | Bearer | Bình luận vào một chủ đề |
| `GET` | `/dharma/threads/:subjectId/reactions` | Công khai | Ai đã bày tỏ cảm xúc với chủ đề |
| `PUT` | `/dharma/threads/:subjectId/reactions/me` | Bearer | Đặt hoặc đổi cảm xúc cho một chủ đề |
| `DELETE` | `/dharma/threads/:subjectId/reactions/me` | Bearer | Gỡ cảm xúc của mình khỏi một chủ đề |

## `/discovery`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/discovery/config` | Công khai | Chính sách truy vấn public cho ứng dụng guest |

## `/gift-posts`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/gift-posts` | Bearer | Đăng một bài cho tặng mới |
| `GET` | `/gift-posts/:giftPostId` | Công khai | Chi tiết một bài đăng |
| `PATCH` | `/gift-posts/:giftPostId` | Bearer | Cập nhật bài đăng |
| `DELETE` | `/gift-posts/:giftPostId` | Bearer | Gỡ bài đăng (xoá mềm) |
| `GET` | `/gift-posts/nearby` | Công khai | Danh sách bài đăng quanh đây, sắp xếp gần → xa |

## `/groups`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/groups` | Bearer | Tạo nhóm |
| `GET` | `/groups/:groupId` | Bearer | Trang tổng quan nhóm |
| `PATCH` | `/groups/:groupId` | Bearer | Sửa thông tin nhóm |
| `GET` | `/groups/:groupId/activities` | Bearer | Dòng hoạt động của nhóm |
| `GET` | `/groups/:groupId/affiliate` | Bearer | Điều kiện affiliate của nhóm |
| `GET` | `/groups/:groupId/invite` | Bearer | Link mời của nhóm |
| `GET` | `/groups/:groupId/invite-link` | Bearer | Link mời của nhóm (tên theo SRS 3.7A) |
| `GET` | `/groups/:groupId/members` | Bearer | Danh sách thành viên nhóm |
| `PATCH` | `/groups/:groupId/members/:memberId` | Bearer | Xếp thành viên vào tổ, hoặc đổi vai |
| `GET` | `/groups/:groupId/sub-teams` | Bearer | Danh sách tổ trong nhóm |
| `POST` | `/groups/:groupId/sub-teams` | Bearer | Tạo tổ |
| `DELETE` | `/groups/:groupId/sub-teams/:subTeamId` | Bearer | Xoá tổ |
| `GET` | `/groups/invites/:inviteCode` | Công khai | Xem trước nhóm theo mã mời (trang /invite/:code) |
| `GET` | `/groups/me` | Bearer | Nhóm của tôi |

## `/home`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/home/charity-cards` | Công khai | Card quảng bá dự án từ thiện trên Home |

## `/leaderboards`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/leaderboards/monthly` | Công khai | Một bảng thành tích của một tháng |
| `GET` | `/leaderboards/monthly/me` | Bearer | Vị trí của tôi trên cả ba bảng |
| `GET` | `/leaderboards/months` | Công khai | Các tháng đã chốt |

## `/me`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/me/blocks` | Bearer | Những người tôi đã chặn |
| `POST` | `/me/blocks` | Bearer | Chặn một người |
| `DELETE` | `/me/blocks/:userId` | Bearer | Bỏ chặn |
| `GET` | `/me/charity-appeals` | Bearer | Khiếu nại tôi đã gửi |
| `GET` | `/me/entitlements` | Bearer | Quyền và giới hạn hiện tại của chính chủ |

## `/merit-units`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/merit-units` | Công khai | Danh sách đơn vị nhận công đức |
| `POST` | `/merit-units/:id/declarations` | Bearer | Khai số tiền công đức |
| `GET` | `/merit-units/:idOrSlug` | Công khai | Một đơn vị, theo slug hoặc id, kèm Sổ vàng |
| `PATCH` | `/merit-units/declarations/:declarationId/complete` | Bearer | Đánh dấu đã chuyển |
| `GET` | `/merit-units/declarations/mine` | Bearer | Lời khai công đức của tôi |

## `/notifications`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/notifications/me` | Bearer | Hộp thư thông báo của chính mình |
| `GET` | `/notifications/me/preferences` | Bearer | Cài đặt thông báo theo nhóm |
| `PATCH` | `/notifications/me/preferences` | Bearer | Tắt hoặc bật tiếng một nhóm thông báo |
| `PATCH` | `/notifications/me/read` | Bearer | Đánh dấu thông báo đã đọc |

## `/onboarding`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/onboarding/tasks` | Bearer | Lấy danh sách nhiệm vụ onboarding và tiến độ của chính chủ |
| `POST` | `/onboarding/tasks/:key/trigger` | Bearer | Chấm lại tiến độ sau khi vừa làm xong một nhiệm vụ |
| `POST` | `/onboarding/tasks/evaluate` | Bearer | Đánh giá lại toàn bộ tiến độ nhiệm vụ onboarding của chính chủ |

## `/points`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/points/me` | Bearer | Số dư điểm của chính chủ |
| `GET` | `/points/me/ledger` | Bearer | Lịch sử điểm của chính chủ |

## `/posts`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/posts` | Bearer | Tạo canonical post Generic MVP |
| `GET` | `/posts/:postId` | Công khai | Chi tiết một canonical post công khai |
| `PATCH` | `/posts/:postId` | Bearer | Cập nhật nội dung bài |
| `DELETE` | `/posts/:postId` | Bearer | Gỡ bài |
| `POST` | `/posts/:postId/batch-accept` | Bearer | Duyệt nhiều người xin nhận trong một lượt |
| `POST` | `/posts/:postId/charity-transfer` | Bearer | Xin chuyển vật phẩm về điểm từ thiện |
| `PATCH` | `/posts/:postId/charity-transfer` | Bearer | Duyệt hoặc từ chối yêu cầu chuyển về điểm từ thiện |
| `PATCH` | `/posts/:postId/classified-status` | Bearer | Chủ bài đổi trạng thái tin Rao vặt |
| `GET` | `/posts/:postId/matches` | Bearer | Gợi ý bài ghép đôi cho bài của chính mình (Smart Match) |
| `POST` | `/posts/:postId/media` | Bearer | Gắn ảnh đã upload vào canonical post |
| `DELETE` | `/posts/:postId/media/:mediaId` | Bearer | Gỡ ảnh khỏi canonical post |
| `PATCH` | `/posts/:postId/media/order` | Bearer | Thay thứ tự toàn bộ ảnh canonical post |
| `POST` | `/posts/:postId/media/upload` | Bearer | Xin presigned URL upload ảnh cho canonical post |
| `POST` | `/posts/:postId/redeem` | Bearer | Dùng điểm đổi thẳng vật phẩm (F75) |
| `GET` | `/posts/:postId/redemption-quote` | Bearer | Xem trước một lượt đổi vật phẩm bằng điểm |
| `POST` | `/posts/:postId/renew` | Bearer | Gia hạn bài đăng thêm 3 tháng |
| `GET` | `/posts/:postId/requests` | Bearer | Danh sách người xin nhận đồ |
| `POST` | `/posts/:postId/requests` | Bearer | Gửi yêu cầu xin nhận đồ |
| `POST` | `/posts/:postId/requests/:requestId/accept` | Bearer | Duyệt người xin nhận đồ (Chọn ứng viên) |
| `POST` | `/posts/:postId/requests/:requestId/reject` | Bearer | Từ chối một yêu cầu xin nhận |
| `POST` | `/posts/:postId/requests/withdraw` | Bearer | Rút yêu cầu xin nhận đồ |
| `POST` | `/posts/:subjectId/comment-media/upload-url` | Bearer | Đường tải ảnh cho bình luận |
| `GET` | `/posts/:subjectId/comments` | Công khai | Bình luận gốc của một bài đăng |
| `POST` | `/posts/:subjectId/comments` | Bearer | Bình luận vào một bài đăng |
| `GET` | `/posts/:subjectId/reactions` | Công khai | Ai đã bày tỏ cảm xúc với bài đăng |
| `PUT` | `/posts/:subjectId/reactions/me` | Bearer | Đặt hoặc đổi cảm xúc cho một bài đăng |
| `DELETE` | `/posts/:subjectId/reactions/me` | Bearer | Gỡ cảm xúc của mình khỏi một bài đăng |
| `POST` | `/posts/:subjectId/shares` | Bearer | Ghi nhận một lượt chia sẻ bài đăng |
| `POST` | `/posts/:wantedPostId/offer-gift` | Bearer | Chủ động tặng đồ cho một bài Muốn Nhận |
| `GET` | `/posts/map` | Công khai | Marker canonical post trong khung bản đồ |
| `GET` | `/posts/me` | Bearer | Bài đăng của chính mình |
| `GET` | `/posts/nearby` | Công khai | Quét canonical post quanh đây theo loại bài |
| `GET` | `/posts/share/:shareCode` | Công khai | Mở bài từ mã chia sẻ |
| `GET` | `/posts/sos-urgent` | Công khai | Danh sách cứu trợ SOS quanh đây |

## `/presence`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `PUT` | `/presence/me` | Bearer | Heartbeat: tôi đang ở tab nào |
| `GET` | `/presence/surfaces/:surface` | Công khai | Số người đang ở một tab |

## `/profile`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/profile/:username` | Công khai | Hồ sơ công khai tối thiểu |
| `GET` | `/profile/:username/posts` | Công khai | Bài đăng trên hồ sơ của một người |
| `GET` | `/profile/me` | Bearer | Hồ sơ đầy đủ của chính chủ |
| `PATCH` | `/profile/me` | Bearer | Cập nhật hồ sơ và vị trí mặc định |
| `PATCH` | `/profile/me/avatar-upload` | Bearer | Xin presigned URL upload avatar trực tiếp lên storage |
| `GET` | `/profile/me/badges` | Bearer | Toàn bộ huy hiệu bảng thành tích của tôi |
| `PATCH` | `/profile/me/email-verification/confirm` | Bearer | Xác nhận OTP, đánh dấu email đã xác minh |
| `PATCH` | `/profile/me/email-verification/request` | Bearer | Gửi OTP xác minh email hiện tại |
| `POST` | `/profile/me/intro-video/upload-url` | Bearer | Xin presigned URL tải clip giới thiệu hoặc ảnh bìa của nó |
| `PATCH` | `/profile/me/phone-verification/confirm` | Bearer | Xác nhận OTP, đánh dấu SĐT đã xác minh |
| `PATCH` | `/profile/me/phone-verification/request` | Bearer | Gửi OTP xác minh SĐT hiện tại |

## `/ranks`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/ranks/maintenance/evaluate` | Bearer | Đánh giá các chu kỳ duy trì rank đến hạn |
| `GET` | `/ranks/me` | Bearer | Tóm tắt thứ hạng của chính chủ |

## `/referrals`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/referrals/me` | Bearer | Mã và thống kê giới thiệu của chính chủ |

## `/reports`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `POST` | `/reports` | Bearer | Báo cáo bài đăng hoặc người dùng |

## `/requests`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/requests/:requestId` | Bearer | Một yêu cầu xin nhận (đích phụ của thông báo GIFT_REQUEST_*) |
| `GET` | `/requests/me` | Bearer | Những yêu cầu xin nhận của chính tôi |

## `/transactions`

| Method | Đường dẫn | Truy cập | Tóm tắt |
| --- | --- | --- | --- |
| `GET` | `/transactions/:transactionId` | Bearer | Xem một lượt trao |
| `POST` | `/transactions/:transactionId/cancel` | Bearer | Huỷ lượt tặng/nhận |
| `POST` | `/transactions/:transactionId/confirm` | Bearer | Người nhận xác nhận đã nhận |
| `POST` | `/transactions/:transactionId/evidence/upload-url` | Bearer | Đường tải ảnh bằng chứng |
| `POST` | `/transactions/:transactionId/handover` | Bearer | Người tặng báo đã trao đồ |
| `POST` | `/transactions/:transactionId/reports/ship-unpaid` | Bearer | Báo người nhận không thanh toán phí ship |
| `GET` | `/transactions/:transactionId/reviews` | Bearer | Đánh giá của một lượt trao |
| `POST` | `/transactions/:transactionId/reviews` | Bearer | Đánh giá sau khi lượt trao hoàn tất |
| `PATCH` | `/transactions/:transactionId/reviews/mine` | Bearer | Sửa đánh giá của chính mình (CHỐT-10 mục 4) |
| `GET` | `/transactions/:transactionId/selection-reason` | Bearer | Vì sao hệ thống chọn người nhận này |
| `GET` | `/transactions/me` | Bearer | Các lượt tặng/nhận của chính mình |
