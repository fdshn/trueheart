# Yêu cầu backend sau buổi cập nhật sản phẩm 25/10/2026

**Trạng thái:** Chờ Backend review và triển khai  
**Phạm vi:** Chỉ mô tả thay đổi backend. Các chỉnh sửa thuần UI mobile không thuộc tài liệu này.  
**Nguồn:** Yêu cầu khách hàng ngày 25/10/2026, đã đối chiếu source backend hiện tại.

## 1. Mục tiêu và nguyên tắc

Đợt cập nhật gồm bốn thay đổi chính:

1. Mở rộng public profile thành trang cá nhân có nội dung, uy tín, thứ hạng và bài đăng.
2. Tách hai luồng chat: chat giao dịch tặng đồ và chat trực tiếp theo bài Rao vặt.
3. Refactor Rao vặt theo mô hình chợ đăng tin; hệ thống hỗ trợ đăng bài/liên lạc nhưng không quản lý giao dịch mua bán.
4. Bổ sung contract cho share code, onboarding action, chọn người nhận, thống kê và Dharma Home.

Implementation phải tuân thủ `INVARIANTS.md`: contract chung ở `chantam.core-lib`, body bọc resource key, error khai qua error catalog, endpoint có `@ApiErrorResponses`, job idempotent và không trả raw framework/SQL exception.

## 2. Hiện trạng cần tái sử dụng

| Năng lực | Hiện trạng |
| --- | --- |
| Public profile | `GET /profile/:username` đã trả username, fullName, avatar, rank, số bài tặng, lifetime points, share URL, accuracy, rating hai vai và badge. |
| Rating | Đã tổng hợp `asGiver` và `asReceiver`, có ngưỡng mẫu tối thiểu. |
| Leaderboard | Đã có GIVERS, CHARITY, CONSISTENCY, snapshot, badge và ẩn danh. |
| Rao vặt | Đã có `PostTypes.CLASSIFIED`, `price`, `marketPrice`, `negotiable` và vòng đời bài. |
| Chat | Room hiện bắt buộc `transactionId` và `postId`; chưa có direct chat độc lập giao dịch. |
| Dharma | Đã có hub, contents, recitation, history và forum; hub mới trả entry/count. |
| Banner | Đã có sponsor banner, placement, lịch chạy, impression và click. |
| Onboarding | Task có key/title/description/progress, chưa có action metadata. |

Không tạo domain song song cho rating, leaderboard hoặc banner.

## 3. Public profile mở rộng

### 3.1. Dữ liệu

Mở rộng contract:

```ts
interface IExtendedPublicProfileDto extends IPublicProfileDto {
  slogan: string | null;
  todayThought: string | null;
  todayThoughtUpdatedAt: Date | null;
  introVideoUrl: string | null;
  introVideoThumbnailUrl: string | null;
  monthlyStanding: {
    month: string; // YYYY-MM
    board: 'GIVERS';
    rank: number | null;
    count: number;
  } | null;
  contacts: { email: string | null; phone: string | null };
}
```

`monthlyStanding` lấy từ leaderboard hiện có. Giữ rating theo hai vai. Chỉ thêm `overallRating` sau khi có quyết định chính thức về công thức; không tự lấy trung bình hai vai.

### 3.2. Quyền riêng tư contact

Thêm `emailVisibility` và `phoneVisibility` với enum `PRIVATE | PUBLIC`, mặc định `PRIVATE`.

- Public profile chỉ trả contact khi trường tương ứng là `PUBLIC`.
- Own profile luôn trả dữ liệu chính chủ và visibility.
- Không trả default location, số dư khả dụng hay thông tin xác minh qua public profile.
- Việc mobile không render không được xem là hàng rào bảo mật.

### 3.3. Clip giới thiệu

Thêm presigned upload theo pattern avatar/post media:

```http
POST /api/v1/profile/me/intro-video/upload-url
```

Không nhận URL tuỳ ý. Backend kiểm MIME, dung lượng, object key và ownership. Trước implementation cần chốt MIME, dung lượng/thời lượng tối đa và cơ chế tạo thumbnail.

### 3.4. Bài đăng của user

```http
GET /api/v1/profile/:username/posts?postType=&status=&page=1&pageSize=20
```

Chỉ trả bài viewer có quyền xem, dùng post DTO public canonical và pagination meta. Không nhét toàn bộ bài vào response profile.

Chuẩn hoá author summary dùng chung cho post list/detail/comment/Dharma comment:

```ts
interface IPublicAuthorSummaryDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
}
```

Không trả email/SĐT trong author summary.

## 4. Share bài bằng mã

Mỗi bài public có `shareCode` ngắn, không tuần tự, unique và `shareUrl` ổn định.

```http
GET /api/v1/posts/share/:shareCode
```

Response trả `postId`, `postType` và status để client điều hướng đúng. Không resolve bài `REMOVED` hoặc bài viewer không có quyền xem. Resolve không tự tăng share count; nếu cần đo share phải có event/endpoint riêng.

## 5. Profile gate và error contract

Khi user thiếu hồ sơ để xin nhận, trả mã máy đọc được và danh sách trường thiếu:

```json
{
  "errorCode": "PROFILE_INCOMPLETE",
  "body": { "missingFields": ["phone", "defaultLocation"] }
}
```

Điều kiện dùng cùng nguồn với `profileComplete`, không lặp ở từng use case.

Chuẩn hoá lỗi email thành `INVALID_EMAIL_FORMAT`, `EMAIL_ALREADY_USED`, `EMAIL_NOT_VERIFIED`, `EMAIL_REQUIRED`. Không đưa `DioException`, ORM exception hoặc stack trace vào response.

## 6. Action metadata cho onboarding task

Mở rộng progress DTO:

```ts
type OnboardingActionType = 'APP_ROUTE' | 'DEEP_LINK' | 'API_ACTION' | 'NONE';

interface IOnboardingTaskActionDto {
  type: OnboardingActionType;
  target: string;
  params: Record<string, string>;
}

interface IOnboardingTaskProgressDto {
  // fields hiện có
  action: IOnboardingTaskActionDto | null;
}
```

`target` phải thuộc allow-list. Không bắt mobile hardcode toàn bộ hành động theo task key. Task hoàn thành có thể trả `action = null`.

## 7. Hai loại chat độc lập

### 7.1. Room type và ràng buộc

```ts
enum ChatRoomTypes {
  TRANSACTION = 'TRANSACTION',
  DIRECT_POST = 'DIRECT_POST',
}
```

| roomType | transactionId | postId | Ngữ cảnh |
| --- | --- | --- | --- |
| `TRANSACTION` | Bắt buộc | Bắt buộc | Tặng đồ sau khi request được duyệt |
| `DIRECT_POST` | `null` | Bắt buộc | Liên hệ trực tiếp về Rao vặt |

Uniqueness:

- `TRANSACTION`: unique `transactionId`.
- `DIRECT_POST`: unique `(postId, buyerId, sellerId)`.

Cùng hai user nhưng hai bài khác nhau phải tạo hai room khác nhau.

### 7.2. Mở direct room

```http
POST /api/v1/chat/direct-post/rooms
```

Body chứa `postId`. Nếu room đã tồn tại, trả room cũ. Không cho chủ bài chat với chính mình, mở room với bài removed, hoặc người ngoài đọc/gửi tin.

### 7.3. Room summary

Mở rộng summary với:

- `roomType`.
- `transactionId: string | null`.
- `postThumbnailUrl` và `postPrice`.
- Counterpart avatar.
- `readOnly`.

Message, media upload, unread, mute, recall và realtime event phải chạy với cả hai loại. Không tự áp retention của Transaction Chat sang Direct Post Chat nếu chưa có policy.

## 8. Rao vặt không quản lý giao dịch

`CLASSIFIED` chỉ dùng đăng tin và liên hệ. Backend không tạo:

- Gift Request.
- Duyệt/từ chối người nhận.
- Gift Transaction.
- Handover/confirm/cancel transaction.
- Transaction Chat.
- Transaction review.

Client cũ gọi các endpoint trên với `CLASSIFIED` phải nhận error riêng, ví dụ `CLASSIFIED_TRANSACTION_NOT_SUPPORTED`.

Vòng đời đề xuất:

```text
ACTIVE -> RESERVED -> SOLD
   |          |
   +------> HIDDEN
   +------> EXPIRED
   +------> REMOVED
```

Chủ bài quản lý trạng thái; liên hệ dùng `DIRECT_POST`. Giữ các quyết định hiện có về `price`, `marketPrice`, `negotiable`. “Nhập theo nghìn đồng” chỉ là UI mobile; backend tiếp tục lưu số nguyên VNĐ.

Dữ liệu legacy không bị xoá. Giữ lịch sử request/transaction cũ, chặn tạo mới sau feature flag, và tài liệu hoá cách client đọc legacy data.

## 9. Chính sách chọn người nhận bài cho/nhận

Không áp dụng cho `CLASSIFIED`. Giữ nguyên contract đã triển khai cho cả `OFFER` và `WANTED`, không tạo enum mới:

```ts
enum RecipientSelectionModes {
  INSTANT = 'INSTANT',
  OPTIMAL = 'OPTIMAL',
}
```

- `INSTANT`: phản hồi hợp lệ đầu tiên được ghép ngay, tạo transaction và mở Transaction Chat. Nếu chưa có phản hồi, bài vẫn đi qua mốc 7 ngày đầu rồi tự mở thêm 30 ngày.
- `OPTIMAL`: mode mặc định. `selectionDeadline` được đặt khi bài công khai bằng `publishedAt + 7 ngày`. Hết hạn, backend tự chọn theo bộ tiêu chí Admin đã cấu hình; nếu chưa ghép được ai thì tự mở thêm 30 ngày.
- `EXTENDED` đã bị loại bỏ. Giai đoạn mở rộng 30 ngày là hành vi tự động, không phải option trên form.
- Chủ bài tự chọn người không phải một selection mode. Đây là capability `SELECT_REQUESTER`; hiện chủ bài hạng Kim Cương có thể chọn tay trong thời gian xét. Quyền xem danh sách và từ chối request không hợp lệ được kiểm tra riêng.

Job auto-selection phải idempotent, an toàn khi chạy song song, lock để không vượt `remainingQuantity`, bỏ request/user không hợp lệ, tạo transaction + notification + Transaction Chat nhất quán và lưu audit lý do chọn.

Mobile cần gửi `selectionMode` khi tạo/cập nhật bài `OFFER` hoặc `WANTED`, đồng thời đọc `selectionMode` và `selectionDeadline` trong response để hiển thị đúng trạng thái/countdown. Backend tiếp tục dùng giá trị mặc định `OPTIMAL` cho client cũ không gửi field này.

## 10. Presence theo tab và trạng thái online

### 10.1. Phạm vi và lựa chọn kiến trúc

Yêu cầu là hiển thị số người đang hoạt động tại một tab/surface, ví dụ “24 người đang hoạt động tại Diễn đàn”. Đây không phải analytics dài hạn và không cần realtime từng giây.

Không mở rộng WebSocket thành kết nối presence toàn app. WebSocket hiện tại tiếp tục dành cho chat realtime. Presence theo tab dùng REST heartbeat + Redis và chấp nhận độ trễ 1–2 phút.

Không dùng Firebase/Google Analytics làm nguồn presence vì event analytics có thể đến trễ, thiếu hoặc trùng. Firebase vẫn có thể được mobile sử dụng riêng cho product analytics như `tab_selected`, nhưng không tham gia contract nghiệp vụ này.

### 10.2. Surface allow-list

Contract dùng enum/allow-list, không nhận chuỗi màn hình tuỳ ý:

```ts
enum PresenceSurfaces {
  DISCOVERY_GIVING = 'DISCOVERY_GIVING',
  DISCOVERY_REQUEST = 'DISCOVERY_REQUEST',
  DISCOVERY_CHARITY = 'DISCOVERY_CHARITY',
  DISCOVERY_CLASSIFIED = 'DISCOVERY_CLASSIFIED',
  DHARMA_HOME = 'DHARMA_HOME',
  DHARMA_CHANTING = 'DHARMA_CHANTING',
  DHARMA_FORUM = 'DHARMA_FORUM',
  DHARMA_MONASTERY = 'DHARMA_MONASTERY',
}
```

Không gửi hoặc lưu `resourceId`, thread đang đọc, bài đang xem hay nội dung chi tiết. Product chỉ cần biết surface cấp cao.

### 10.3. Heartbeat API

Khi vào tab và mỗi 60 giây trong lúc app foreground:

```http
PUT /api/v1/presence/me
```

```json
{
  "presence": {
    "surface": "DHARMA_FORUM",
    "sessionId": "uuid"
  }
}
```

Quy tắc:

- App background thì ngừng heartbeat.
- Heartbeat mới thay surface hiện tại của cùng session; không cần gọi leave đáng tin cậy khi app bị kill.
- Rate limit mục tiêu: tối đa 2 heartbeat/phút/user/session.
- `sessionId` phân biệt nhiều thiết bị/kết nối của cùng user.
- User online nếu còn ít nhất một session chưa hết hạn.
- `onlineCount` phải deduplicate theo `userId`, không đếm hai thiết bị thành hai người.

Backend lưu Redis, không ghi PostgreSQL mỗi heartbeat. TTL mục tiêu 120 giây. Có thể dùng sorted set theo surface với score là heartbeat timestamp; khi đọc hoặc bằng job nhẹ, xoá member quá TTL.

Không lưu lịch sử user từng xem tab nào. Dữ liệu hết TTL phải biến mất và không dùng cho điểm, huy hiệu, leaderboard hoặc moderation.

### 10.4. API đọc presence

```http
GET /api/v1/presence/surfaces/:surface?limit=10
```

Phase 1 chỉ cần trả tổng số:

```json
{
  "surface": "DHARMA_FORUM",
  "onlineCount": 24,
  "visibleUsers": []
}
```

Mobile gọi khi mở tab, pull-to-refresh hoặc sau 60–120 giây nếu màn vẫn hiển thị. Không polling khi app background.

### 10.5. Privacy khi hiển thị danh tính

Khuyến nghị Phase 1 chỉ hiển thị `onlineCount`; khi đó không cần setting trạng thái online vì không công khai danh tính cụ thể.

Nếu sản phẩm muốn hiển thị avatar/danh sách người online ở phase sau, bắt buộc thêm:

```ts
showOnlineStatus: boolean; // mặc định false
```

Quy tắc:

- `onlineCount` vẫn là số user active đã deduplicate.
- `visibleUsers` chỉ chứa user đang `ACTIVE` và đã bật `showOnlineStatus`.
- Không trả chính người gọi trong `visibleUsers`.
- Tắt setting phải xoá toàn bộ presence session hiện tại của user khỏi Redis và có hiệu lực ngay.
- Public profile không hiển thị tab hiện tại hoặc lịch sử tab.
- Không có endpoint công khai để truy vấn một user cụ thể đang ở surface nào.

Chat online/last seen là phạm vi riêng: nếu triển khai, chỉ participant của phòng được xem và có thể tái sử dụng hạ tầng Redis nhưng không được làm lộ surface toàn app.

## 11. Leaderboard và thống kê

### Top user Cho tặng

Tái sử dụng board `GIVERS` hiện có và lấy top 3 qua API leaderboard. Không tạo bảng/thuật toán mới nếu contract hiện có đã đủ.

### User có bài diễn đàn nhiều tương tác nhất

Thay yêu cầu tracking thời gian sử dụng diễn đàn bằng bảng xếp hạng tác giả có bài đăng nhận nhiều tương tác nhất. Không cần thu thập screen view, foreground time hoặc heartbeat cho nghiệp vụ này.

Endpoint đề xuất:

```http
GET /api/v1/dharma/leaderboards/forum-engagement?period=MONTH&month=2026-10&limit=10
```

Quy tắc đề xuất:

- Phạm vi mặc định là tháng hiện tại theo `BusinessTimeZone`; `month` có dạng `YYYY-MM`.
- Chỉ tính thread đã publish và không bị xoá/ẩn do kiểm duyệt.
- `engagementCount = reactionCount + commentCount`; reply được tính là comment nếu repository hiện lưu reply trong cùng cây comment.
- Cộng tương tác của tất cả thread hợp lệ theo tác giả, sau đó xếp giảm dần theo `engagementCount`.
- Không tính reaction/comment do chính tác giả tạo trên thread của mình để hạn chế tự tăng hạng.
- Tie-break: thời điểm đạt tương tác cuối cùng sớm hơn, sau đó `userId` tăng dần để kết quả deterministic.
- Response không trả `userId`; chỉ trả public author summary, `position`, `engagementCount`, `threadCount` và tối đa một `topThread` để Dharma Home hiển thị.
- Tài khoản không còn `ACTIVE` và nội dung bị moderation loại khỏi kết quả live.

Nếu việc loại self-interaction làm truy vấn hiện tại quá đắt, repository phải tính từ bảng interaction/comment nguồn; không lấy các counter tổng trên thread rồi giả định toàn bộ đều hợp lệ.

### Thời gian tụng kinh

Có thể bổ sung:

```http
GET /api/v1/dharma/leaderboards/recitation-time?period=MONTH&limit=10
```

Tính từ session server-side, không nhận `durationSeconds` do client khai. Cần trần phiên và rule chống abuse.

## 12. Dharma Home dạng section preview

Mở rộng `GET /api/v1/dharma/hub` để trả các section, mỗi section tối đa 1–3 preview item cùng `viewAllTarget`. Dự kiến gồm Kinh tụng, Diễn đàn, Tự viện, nội dung nổi bật và Cúng bái nếu nghiệp vụ này được duyệt.

Backend quyết định featured item và display order; mobile không dùng fake data. Endpoint danh sách đầy đủ vẫn phân trang.

## 13. Banner placement

Tái sử dụng sponsor banner hiện có, bổ sung placement:

- `DISCOVERY_GIVING`, `DISCOVERY_REQUEST`, `DISCOVERY_CHARITY`, `DISCOVERY_CLASSIFIED`.
- `DHARMA_HOME`, `DHARMA_CHANTING`, `DHARMA_FORUM`, `DHARMA_MONASTERY`.
- `DHARMA_WORSHIP` chỉ khi phân hệ được duyệt.

Không tạo API banner thứ hai; tiếp tục dùng `GET /banners?placement=...` và endpoint click hiện có.

## 14. Ngoài phạm vi backend

Không tạo backend task cho các mục sau nếu contract hiện tại đã đủ:

- Input giá hiển thị theo nghìn đồng; backend vẫn nhận/lưu VND.
- Bỏ label “Bắt buộc” trên UI định giá, trừ khi đổi nullability.
- Helper text account name/nickname.
- Đổi nút đăng xuất thành icon.
- Chủ bài không thấy nút xin nhận.
- Hiện “Đã xin” từ `hasRequested`/`myRequestStatus`.
- Di chuyển nút xem người xin.
- Màu riêng cho tab Khám phá.
- Bấm avatar mở public profile.

## 15. Thứ tự triển khai

### P0

1. Author summary và error contract.
2. Public profile, privacy và user posts.
3. `DIRECT_POST` chat song song `TRANSACTION` chat.
4. `CLASSIFIED` không tạo request/transaction mới.

### P1

5. Share code/deep link.
6. Onboarding action metadata.
7. Recipient selection sau khi chốt scoring.

### P2

8. Presence count theo tab bằng REST heartbeat + Redis.
9. Dharma hub sections.
10. Forum engagement leaderboard.
11. Recitation leaderboard.
12. Banner placements.

## 16. Acceptance criteria

- [ ] Public profile không lộ contact `PRIVATE`, trả đúng contact `PUBLIC`.
- [ ] User posts phân trang và tuân thủ visibility.
- [ ] Share code unique, resolve đúng loại bài và không mở bài removed.
- [ ] Profile thiếu dữ liệu trả `PROFILE_INCOMPLETE` + `missingFields`.
- [ ] Onboarding action chỉ dùng target trong allow-list.
- [ ] `CLASSIFIED` không tạo Gift Request/Gift Transaction mới.
- [ ] Direct chat mở được không cần transaction.
- [ ] Cùng hai user, hai post khác nhau tạo hai direct room khác nhau.
- [ ] Cùng post và participants không tạo room trùng.
- [ ] Người ngoài không đọc/gửi hoặc suy ra room tồn tại.
- [ ] Transaction Chat cũ không regression.
- [ ] Auto-selection chạy lặp/đồng thời không tạo transaction trùng.
- [ ] Presence theo tab tự hết hạn sau TTL, deduplicate nhiều session theo user và không ghi lịch sử tab vào PostgreSQL.
- [ ] Phase 1 chỉ trả `onlineCount`; nếu trả danh tính thì chỉ gồm user bật `showOnlineStatus`.
- [ ] Forum engagement leaderboard chỉ tính thread hợp lệ, loại self-interaction và có tie-break deterministic.
- [ ] Recitation leaderboard chỉ dùng thời lượng server-side.
- [ ] Author summary nhất quán giữa list/detail/comment/Dharma comment.
- [ ] Banner placement mới chỉ trả banner đang phục vụ.
- [ ] Không response nào chứa raw exception.

## 17. Bàn giao của mỗi MR implementation

Developer backend cần ghi rõ migration, endpoint/DTO/enum/error code, authorization/privacy, compatibility với dữ liệu/client cũ, realtime event, background job/idempotency, OpenAPI, test đã chạy và mobile integration notes.
