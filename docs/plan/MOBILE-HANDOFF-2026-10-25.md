# Bàn giao mobile — cập nhật sản phẩm 25/10/2026 (PR #46)

Tóm tắt những gì app phải đổi theo đợt backend 25/10. Chi tiết contract ở
[API.md mục 16](../API.md#16-cập-nhật-sản-phẩm-25102026-pr-46); schema chính xác ở Swagger
(`/docs`); bảng mã lỗi ở [API-ERRORS.md](../API-ERRORS.md).

## Bắt buộc sửa — hành vi cũ sẽ hỏng

| Việc | Vì sao |
| --- | --- |
| **Rao vặt: bỏ nút "Xin nhận"**, thay bằng "Nhắn người bán" → `POST /chat/direct-post/rooms` | `POST /posts/:id/requests` với bài `CLASSIFIED` nay trả `CLASSIFIED_TRANSACTION_NOT_SUPPORTED` (409) |
| **Rao vặt: màn quản lý tin của chủ bài** dùng `PATCH /posts/:id/classified-status` (`ACTIVE`/`RESERVED`/`SOLD`/`HIDDEN`) | Không còn lượt trao nào kéo trạng thái tin Rao vặt |
| **Rao vặt: hiện nút Sửa/Gỡ theo `canEdit`**, kể cả khi tin đang "Đã giữ chỗ" hoặc "Tạm ẩn" | Hai trạng thái này nay sửa/gỡ được; app không được tự ẩn nút theo `status` |
| **Hiểu hai trạng thái bài mới** `SOLD`, `HIDDEN` ở mọi chỗ hiện `post.status` (Bài của tôi, chi tiết, bộ lọc) | Enum `GiftPostStatuses` có thêm hai giá trị — `switch` không có nhánh mặc định sẽ vỡ |
| **Danh sách chat phân biệt `roomType`** (`TRANSACTION` / `DIRECT_POST`); `transactionId` nay **nullable** | Phòng trực tiếp không có lượt trao; mở màn "giao dịch" từ phòng này là 404 |
| **Đổi tên mã lỗi** `EMAIL_TAKEN` → `EMAIL_ALREADY_USED` (cùng số 0x0305) | Client so theo tên sẽ không khớp |
| **Rao vặt hết hạn là `EXPIRED`**, không còn thành bài Muốn Tặng; nút **Gia hạn** hiện cho tin Rao vặt hết hạn | Chủ dự án bỏ CHỐT-05 cho Rao vặt (26/10) — app từng ẩn nút gia hạn với Rao vặt |

## Nên dùng — có sẵn, thay cho hardcode

- **Họ tên công khai:** `author.fullName` có ở bài, bảng tin, bản đồ, Smart Match, bình luận và
  chủ đề Phật Pháp. Bình luận và chủ đề có thêm object `author`; các trường phẳng cũ vẫn còn.
- **`PROFILE_INCOMPLETE` có `body.missingFields`** (mã trường như `PATCH /profile/me`). Mở
  thẳng form hồ sơ ở đúng trường thiếu, thay vì hiện thông báo chung.
- **Onboarding `action`:** mở màn theo `action.target` (`PROFILE_EDIT`, `PHONE_VERIFICATION`)
  thay cho bảng ánh xạ theo `key` trong app. Task đã xong thì `action` là `null`.
- **Chia sẻ bài:** dùng `share.shareUrl` (hoặc `share.sharePath`) của `GET /posts/:id`. Deep link
  `/p/<mã>` → gọi `GET /posts/share/:shareCode` → điều hướng theo `postType`. Mở link không
  tăng lượt chia sẻ; vẫn gọi `POST /posts/:id/shares` khi người dùng bấm Chia sẻ.

## Tính năng mới

- **Hồ sơ công khai:**
  - Hiện slogan, "suy nghĩ hôm nay", clip giới thiệu và ảnh bìa, vị trí tháng trên bảng Người
    cho (`monthlyStanding`), liên hệ công khai (`contacts`).
  - Tab bài của người đó: `GET /profile/:username/posts`.
  - Form sửa hồ sơ thêm `slogan`, `todayThought`, `emailVisibility`/`phoneVisibility` (mặc định
    `PRIVATE`).
  - Upload clip: `POST /profile/me/intro-video/upload-url`, gọi hai lần — `VIDEO` (mp4/mov,
    ≤ 50 MB) và `THUMBNAIL` (≤ 2 MB, app tự chụp khung hình).
  - ⚠️ **Server không kiểm thời lượng clip** — app phải tự giới hạn 60 giây.
- **Presence theo tab:**
  - Khi vào một tab trong allow-list và mỗi 60 giây lúc foreground: `PUT /presence/me` với
    `{ presence: { surface, sessionId } }`.
  - `sessionId` là UUID sinh một lần mỗi lần mở app.
  - Background thì ngừng gửi. `refreshed: false` không phải lỗi.
  - Hiện "N người đang hoạt động" từ `GET /presence/surfaces/:surface`; gọi khi mở tab, kéo làm
    mới, hoặc 60–120 giây một lần khi màn còn hiện.
- **Dharma Home:** dựng các section từ `GET /dharma/hub` → `sections`.
  - Thẻ chung cho mọi mục; `kind` quyết định mở màn nội dung hay chủ đề, `target` là đường chi
    tiết.
  - Nút "Xem tất cả" theo `viewAllTarget`.
  - Section rỗng không có trong mảng. Không dùng dữ liệu giả.
- **Bảng xếp hạng Phật Pháp:** `GET /dharma/leaderboards/forum-engagement` và
  `GET /dharma/leaderboards/recitation-time`.
  - Dòng `isAnonymous: true` không có tên: hiện "Người ẩn danh"; ở bảng diễn đàn thì cũng không
    có chủ đề.
  - Thời gian tụng trả theo **giây** — app tự đổi ra giờ/phút.
- **Vì sao hệ thống chọn người nhận:** màn lượt trao gọi
  `GET /transactions/:transactionId/selection-reason`. Có `selection` thì hiện `reasonLabel`
  (câu dựng sẵn) kèm "trong N người xin"; `null` thì chủ bài tự chọn — không hiện gì.
- **Dải người xin trên bảng tin:** mỗi bài của `GET /posts/nearby` có `requesters` (tối đa 5:
  `username`, `avatarUrl`, người xin gần nhất trước — **không có `userId`**). Hiện "A, B và N
  người khác đã xin" với N = `requestCount` − số phần tử. Chạm vào một người thì mở
  `GET /profile/:username`.
- **Hiện trạng thái online (thêm 29/10):**
  - Màn cài đặt: công tắc đọc `profile.showOnlineStatus` từ `GET /profile/me`, ghi bằng
    `PATCH /profile/me` với `{ profile: { showOnlineStatus } }`. Mặc định tắt.
  - Dải avatar "đang ở đây": `GET /presence/surfaces/:surface?limit=10` → `visibleUsers`
    (`username`, `fullName`, `avatarUrl`, `rank`). Gửi kèm token để không thấy chính mình. Chạm
    vào một người thì mở `GET /profile/:username`.
  - Con số "N người đang hoạt động" vẫn là `onlineCount` (đếm cả người không bật cờ).
- **Banner:** tám vị trí mới cho bốn tab Khám phá và bốn màn Phật Pháp. Cùng
  `GET /banners?placement=` và đường click cũ.

## Còn chờ quyết định

- **Cúng bái** (`DHARMA_WORSHIP`) — chưa có section, surface hay vị trí banner, vì phân hệ chưa
  được duyệt.
