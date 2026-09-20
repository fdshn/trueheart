# Tham chiếu API

Mô tả **62 endpoint đang chạy thật** của `@chantam.vn/chantam.core`, kèm hành vi và ràng
buộc mà chữ ký hàm không nói ra.

Ba file bổ trợ nhau, đừng nhầm:

| File | Nội dung | Cách cập nhật |
| --- | --- | --- |
| File này | Hành vi từng endpoint | Sửa tay khi thêm/đổi route |
| [`API-ERRORS.md`](./API-ERRORS.md) | Bảng tra mã lỗi | **Sinh tự động** — `npm run docs:errors` |
| `GET /docs` (Swagger) | Schema request/response chính xác | Sinh từ decorator lúc chạy |

Swagger là nguồn sự thật về **hình dạng dữ liệu**. File này giải thích **vì sao** endpoint
hành xử như vậy — thứ không nhét vừa vào một dòng `@ApiOperation`.

> **Mọi route đều khai lỗi có thể xảy ra**, không chỉ đường thành công. Client mobile phân
> biệt "không đủ quyền" với "không tìm thấy" bằng cặp `(errorOrigin, errorCode)` trong đặc
> tả, nên endpoint chỉ khai mã 200 là đẩy việc đoán mò sang client.

---

## 1. Quy ước chung

### Tiền tố và phiên bản

Mọi endpoint nằm dưới `/api/v1`. Ngoại lệ duy nhất là `GET /health` — cố ý để ngoài
versioning vì load balancer gọi nó trước khi biết API version nào đang chạy.

### Hình dạng response

Mọi response dùng chung một vỏ, **kể cả khi lỗi**:

```json
{
  "success": true,
  "errorCode": 0,
  "errorOrigin": "",
  "message": [],
  "body": { }
}
```

Client phân biệt lỗi bằng **cặp `(errorOrigin, errorCode)`**. Đừng bắt lỗi theo `message`:
câu chữ sẽ đổi, mã thì không. Mã trùng nhau giữa hai `errorOrigin` khác nhau là bình thường
và có chủ đích.

### Phân trang

Tham số tên là **`page` và `pageSize`** — không phải `limit`. Đặt sai tên thì nó bị bỏ qua
im lặng và mọi trang đều trả về đúng số mặc định.

| Tham số | Mặc định | Trần |
| --- | ---: | ---: |
| `page` | 1 | — |
| `pageSize` | 20 | **50** |

Trần 50 là cố ý giữ nhỏ. `meta` trả kèm `page`, `pageSize`, `total`, `totalPages`,
`hasNextPage`, `hasPreviousPage`.

### Xác thực

Bearer token ở header `Authorization`. Access token ngắn hạn, refresh token dài hạn.

> **JWT mang `rank` và `status` nhưng đó là ảnh chụp cũ.** Mọi quyết định phân quyền đều
> đọc lại từ database. Đừng dựa vào rank trong token để suy ra quyền.

### Ba cơ chế phân quyền song song

Đây là chỗ dễ nhầm nhất khi đọc code, vì chúng nằm ở ba tầng khác nhau:

| Cơ chế | Khai ở đâu | Dùng cho | Thấy được trong Swagger? |
| --- | --- | --- | --- |
| `@RequiresPermission('code')` | Decorator trên route | Toàn bộ `/admin/**` | ✅ |
| Allowlist username qua biến môi trường | Kiểm trong controller hoặc use case | `POST_OPERATOR_USERNAMES`, `RANK_OPERATOR_USERNAMES`, allowlist danh mục | ❌ |
| Chỉ chủ sở hữu | Kiểm trong use case | Sửa/xoá bài, media, hồ sơ | ❌ |

Hai cơ chế dưới **không lộ ra ở tầng decorator**, nên Swagger không phản ánh điều kiện truy
cập. Allowlist username là giải pháp tạm của M2, sẽ bị thay bằng RBAC ở M6.

> **Khu `/admin` là fail-closed.** `AdminPermissionGuard` chặn MỌI route dưới `/admin` không
> khai `@RequiresPermission(...)`. Thêm endpoint quản trị mà quên decorator thì nó khoá ngay
> lần gọi đầu, thay vì lặng lẽ mở một cửa quản trị.

### Quyền riêng tư vị trí

Quy tắc xuyên suốt mọi kênh công khai:

- **Toạ độ bị làm nhiễu** (`applyGeoJitter`) theo bán kính cấu hình, và nhiễu **ổn định theo
  `globalId`** — gọi lại nhiều lần không ra toạ độ khác nhau, nếu không thì lấy trung bình
  nhiều lần gọi là ra chỗ thật.
- **Khoảng cách làm tròn theo bậc** (`bucketDistance`). Trả số mét chính xác cộng toạ độ
  nhiễu vẫn đủ để tam giác đạc ra nhà người ta.
- Response có cờ `isLocationApproximate: true` để client không hiển thị nhầm là chính xác.

Chỉ hai nơi trả **toạ độ thật**: `GET /posts/me` (bài của chính mình) và vị trí mặc định
trong hồ sơ riêng.

---

## 2. Xác thực — `/auth`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Công khai | Đăng ký bằng username + mật khẩu, không cần email/SĐT. Đăng ký xong tự đăng nhập, trả luôn cặp token |
| `POST` | `/auth/login` | Công khai | Định danh là username, email hoặc SĐT đã bổ sung |
| `POST` | `/auth/refresh` | Công khai | Refresh token cũ bị thu hồi ngay, trả cặp hoàn toàn mới |
| `POST` | `/auth/logout` | Bearer | Thu hồi phiên và xoá FCM token của thiết bị đó |
| `POST` | `/auth/password-reset/request` | Công khai | Xin mã đặt lại mật khẩu |
| `POST` | `/auth/password-reset/confirm` | Công khai | Xác nhận mã và đặt mật khẩu mới |
| `DELETE` | `/auth/account` | Bearer | Xoá mềm và ẩn danh dữ liệu cá nhân |
| `GET` | `/auth/me` | Bearer | Danh tính phiên hiện tại, đọc thẳng từ token |

**Điều cần biết**

- `POST /auth/refresh` là **công khai** có chủ đích: lúc gọi nó thì access token đã hết hạn
  rồi, đòi bearer token là bế tắc.
- `POST /auth/logout` lấy `userId` từ **access token chứ không từ body**. Tin body thì ai
  cũng đăng xuất hộ người khác được.
- `POST /auth/password-reset/request`: tài khoản **không tồn tại** và tài khoản **không có
  email/SĐT** trả về **giống hệt nhau** (kênh `ADMIN_SUPPORT`). Phân biệt hai trường hợp là
  biến endpoint này thành công cụ dò username có thật.
- `POST /auth/password-reset/confirm` thu hồi **toàn bộ phiên trên mọi thiết bị**, kể cả
  access token còn hạn.
- `DELETE /auth/account` **bắt nhập lại mật khẩu** (xoá không hoàn tác được, mà access token
  có thể đang ở tay người mượn máy), **chặn khi còn giao dịch dở dang**, và **giữ nguyên
  username** để không ai đăng ký lại đúng tên đó mà mạo danh trong lịch sử cũ. Thứ tự quan
  trọng: kiểm giao dịch dở dang **trước** khi thu hồi token.
- `GET /auth/me` **không truy vấn database** — dùng để client kiểm tra token còn sống.

> ⛔ **Chưa có nhà cung cấp gửi OTP.** Ở môi trường phát triển mã được ghi ra log; ở
> production chức năng **tự tắt**, mọi yêu cầu trả về kênh `ADMIN_SUPPORT` và không mã nào
> được ghi ra log.

---

## 3. Hồ sơ — `/profile`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/profile/me` | Bearer | Hồ sơ đầy đủ của chính chủ |
| `PATCH` | `/profile/me` | Bearer | Cập nhật hồ sơ và vị trí mặc định |
| `PATCH` | `/profile/me/avatar-upload` | Bearer | Xin presigned URL upload avatar thẳng lên storage |
| `PATCH` | `/profile/me/phone-verification/request` | Bearer | Gửi OTP xác minh SĐT hiện tại |
| `PATCH` | `/profile/me/phone-verification/confirm` | Bearer | Xác nhận OTP, đánh dấu SĐT đã xác minh |
| `GET` | `/profile/:username` | Công khai | Hồ sơ công khai tối thiểu |

**Điều cần biết**

- `GET /profile/:username` chạy theo **danh sách cho phép tường minh**, không phải danh sách
  cấm. Chỉ trả: `username`, `fullName`, `avatarUrl`, `rank`, `publishedGiftPostCount`,
  `lifetimePoints`, `shareUrl`.
- Cố ý **không** trả `balance` — đó là điểm tiêu được của riêng chủ tài khoản, lộ ra kênh
  công khai là lộ sức mua của người ta. Chỉ `lifetime` (điểm tích luỹ) được công khai.
- Cũng không bao giờ trả email, SĐT, vị trí mặc định hay ledger.
- `shareUrl` chỉ có giá trị khi cấu hình `WEB_PUBLIC_BASE_URL`; chưa cấu hình thì trả `null`
  chứ không bịa tên miền.
- **Vị trí mặc định ≠ GPS hiện tại.** Vị trí mặc định là giá trị dùng khi đăng bài và là điều
  kiện bắt buộc để tạo Group; GPS chỉ dùng cho bản đồ tại thời điểm xem. Server **không tự
  ghi đè** vị trí mặc định từ GPS.
- Xác minh SĐT lần đầu thưởng điểm **đúng một lần**, đi qua Point Ledger với khoá idempotency
  `PHONE_VERIFIED_FIRST_TIME:<userId>`. Đổi SĐT rồi xác minh lại **không thưởng lại**.

---

## 4. Danh mục — `/categories`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/categories` | Công khai | Cây danh mục đang hoạt động |
| `POST` | `/categories` | Bearer + allowlist | Tạo danh mục |
| `PATCH` | `/categories/:categoryId` | Bearer + allowlist | Sửa hoặc tắt danh mục |

**Điều cần biết**

- `?postType=CLASSIFIED` lọc về đúng cây dùng được cho phân hệ đó — dùng cho form đăng tin
  và bộ lọc. Bỏ trống trả cả cây, nên client cũ không phải sửa gì.
- Mỗi danh mục mang **mảng `postTypes`**, không phải một trường scope đơn. "Đồ điện tử" vừa
  đem tặng vừa rao bán được; tách thành hai bản ghi cùng tên khác id thì thống kê theo danh
  mục bị chẻ đôi và người dùng thấy hai mục trùng tên.
- Khi lọc, **nhánh cha không khớp vẫn được giữ nếu có con khớp**, để cây không đứt. Node cha
  giữ lại vẫn mang `postTypes` thật của nó — client đọc trường đó để biết node nào thật sự
  chọn được, node nào chỉ là nhánh điều hướng.
- **Không xoá cứng** danh mục đang có bài dùng, chỉ được tắt (`isActive: false`).

---

## 5. Bài đăng — `/posts`

Một endpoint tạo bài cho **cả năm loại**, phân biệt bằng `postType`: `OFFER` (Muốn Tặng),
`WANTED` (Muốn Nhận), `CHARITY`, `CLASSIFIED` (rao vặt), `MERIT`.

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts` | Bearer | Tạo bài, luôn ở `PENDING_REVIEW` |
| `GET` | `/posts/me` | Bearer | Bài của chính mình, lọc + phân trang |
| `GET` | `/posts/nearby` | Công khai | Quét bài quanh một toạ độ theo bán kính |
| `GET` | `/posts/map` | Công khai | Marker trong khung bản đồ |
| `GET` | `/posts/:postId` | Công khai | Chi tiết một bài công khai |
| `GET` | `/posts/:postId/matches` | Bearer (chỉ tác giả) | Smart Match — gợi ý bài ghép đôi |
| `PATCH` | `/posts/:postId` | Bearer (chủ bài) | Sửa nội dung |
| `DELETE` | `/posts/:postId` | Bearer (chủ bài) | Xoá mềm |
| `PATCH` | `/posts/:postId/moderation` | Bearer + allowlist | Duyệt hoặc từ chối |
| `POST` | `/posts/:postId/media/upload` | Bearer (chủ bài) | Xin presigned URL upload ảnh |
| `POST` | `/posts/:postId/media` | Bearer (chủ bài) | Gắn ảnh đã upload |
| `PATCH` | `/posts/:postId/media/order` | Bearer (chủ bài) | Thay toàn bộ thứ tự ảnh |
| `DELETE` | `/posts/:postId/media/:mediaId` | Bearer (chủ bài) | Gỡ một ảnh |

### Tạo bài — cổng kiểm tra theo thứ tự

1. Hồ sơ phải đủ (họ tên, avatar, SĐT, email) → `ProfileIncompleteException`
2. Rank phải khác `VIEWER` → `OnboardingIncompleteException`
3. Danh mục phải tồn tại và đang bật → `CategoryNotFoundException`
4. Hợp lệ theo loại bài (xem dưới) → `ValidationFailedException`
5. Còn quota theo rank → `PostQuotaExceededException`

Tác giả và trạng thái do **server quyết định**, không nhận từ client. Bài luôn tạo ở
`PENDING_REVIEW`.

### Trường riêng theo loại bài

Lưu trong `details` (JSONB). Mỗi loại chỉ mang đúng trường của mình:

| Loại | Trường | Bắt buộc |
| --- | --- | --- |
| `OFFER` | `condition`, `estimatedValue`, `totalQuantity` | Không |
| `CLASSIFIED` | `price` (VND), `condition` | **Có** |
| `CLASSIFIED` | `negotiable` | Không — mặc định `false` |
| Còn lại | — | — |

Ranh giới giữ chặt **cả hai chiều**: `price`/`negotiable` không lọt sang bài đem tặng (biến
món quà thành món hàng ngay trên giao diện), và `estimatedValue` không lọt sang tin rao bán.
Mặc định `negotiable = false` vì hiểu im lặng thành "có thương lượng" là hứa hộ người bán
một điều họ không nói.

`totalQuantity` chỉ có nghĩa với `OFFER`; các loại khác bị ép về 1.

> **Quota hiện dùng chung một rổ.** `CLASSIFIED` đang tính vào capability `POST_OFFER`, và
> bộ đếm quota đếm **mọi** bài đang mở bất kể loại. Muốn tách thì thêm capability
> `POST_CLASSIFIED` — sau đó admin tự chỉnh số, không cần deploy.

### `GET /posts/me` — khác discovery ở hai điểm

Đây là lý do nó tồn tại tách khỏi `/posts/nearby`:

- **Không mặc định lọc về trạng thái công khai.** Chủ bài phải thấy được bài đang
  `PENDING_REVIEW` và bài `REJECTED` của mình. Truyền `?status=` để lọc hẹp lại.
- **Trả toạ độ thật, không làm nhiễu.** Chủ bài cần thấy đúng chỗ mình đã ghim để sửa cho
  khớp.

`authorId` lấy từ access token, **không nhận từ query** — tin vào query là ai cũng đọc được
bài nháp của người khác bằng cách đổi một tham số.

Bộ lọc: `postType`, `status`, `categoryId`, `page`, `pageSize`.
Ví dụ danh sách tin rao vặt của tôi: `GET /posts/me?postType=CLASSIFIED`.

### `GET /posts/:postId/matches` — Smart Match

Ghép **Muốn Nhận ↔ Muốn Tặng** theo luật, không dùng học máy.

| Tín hiệu | Trọng số |
| --- | ---: |
| Cùng danh mục | 0.5 |
| Trùng từ khoá | 0.3 |
| Khoảng cách | 0.2 |

Điểm nằm trong `[0, 1]`, đọc được như phần trăm khớp. Mỗi gợi ý kèm `reasons`
(`SAME_CATEGORY` / `KEYWORD_MATCH` / `NEARBY`) để giao diện nói được **vì sao** bài đó hiện
ra — gợi ý không giải thích được thì người dùng không có cơ sở đánh giá.

- **Chỉ gợi ý, tuyệt đối không tạo giao dịch.** Quyết định cuối thuộc về con người.
- **Chỉ tác giả bài nguồn gọi được.** Vị trí thật của bài là tâm truy vấn; mở cho người ngoài
  là biến endpoint này thành đường vòng để dò toạ độ chính xác.
- Loại bài ngoài `OFFER`/`WANTED` trả danh sách rỗng thay vì ghép bừa.
- Ứng viên phải **cùng danh mục hoặc trùng từ khoá** — chỉ gần thôi thì chưa phải gợi ý.

### Ảnh bài đăng — luồng ba bước

1. `POST /posts/:postId/media/upload` → nhận presigned URL. Key **bind cả user lẫn post**.
2. Client `PUT` thẳng file lên storage.
3. `POST /posts/:postId/media` → server `HeadObject` xác minh key, MIME, dung lượng và đúng
   namespace user/post **trước khi** lưu bản ghi.

Bước 3 là chỗ chặn: không có nó thì client khai khống một key bất kỳ là xong.

`DELETE .../media/:mediaId` chỉ xoá bản ghi và dồn lại thứ tự; dọn object trên storage theo
lifecycle riêng.

### Thứ tự khai báo route

`@Get('me')`, `@Get('nearby')`, `@Get('map')` phải đứng **trước** `@Get(':postId')`. Nếu
không, `me` bị nuốt thành một `postId` và route tĩnh không bao giờ chạy.

---

## 6. Khám phá — `/discovery`, `/posts/nearby`, `/posts/map`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/discovery/config` | Công khai | Giới hạn bán kính, phân trang và loại bài mà khách xem được |

Khách chưa đăng nhập dùng được cả ba. `discovery/config` tồn tại để client **không hardcode**
giới hạn — đổi trần bán kính ở server là client tự theo.

`/posts/nearby` bắt buộc có `postType`; `/posts/map` nhận khung bbox và trả tối đa 200 marker,
gom cụm để client tự vẽ. Cả hai đều áp quy tắc làm nhiễu toạ độ ở §1.

---

## 7. Điểm, hạng, giới thiệu, quyền

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/points/me` | Bearer | Số dư điểm của chính chủ |
| `GET` | `/points/me/ledger` | Bearer | Lịch sử ledger, phân trang |
| `GET` | `/ranks/me` | Bearer | Hạng hiện tại, hạng kế tiếp, chu kỳ duy trì |
| `POST` | `/ranks/maintenance/evaluate` | Bearer + allowlist | Chạy đánh giá chu kỳ duy trì |
| `GET` | `/referrals/me` | Bearer | Mã giới thiệu và thống kê |
| `GET` | `/me/entitlements` | Bearer | Quyền và quota theo hạng hiện tại |

**Điều cần biết**

- `/points/me` trả **hai con số khác nhau**, đừng nhầm:
  - `balance` — điểm **tiêu được**, giảm khi dùng.
  - `lifetime` — điểm **tích luỹ**, chỉ tăng. Đây là thứ quyết định hạng.

  Tiêu điểm không làm tụt hạng, vì hạng đọc `lifetime`.
- Ledger là **append-only**. Không có UPDATE, không có DELETE; đảo một bút toán là ghi thêm
  bút toán âm. Trigger ở database chặn sửa/xoá.
- `/ranks/me` trả cả chu kỳ duy trì đang mở. **Điểm là sàn, nhiệm vụ duy trì là trần**: điểm
  tích luỹ quyết định hạng cao nhất *có thể* đạt; trượt nhiệm vụ thì tụt đúng **một bậc** bất
  kể còn bao nhiêu điểm, và không bao giờ tụt dưới sàn `MEMBER` của onboarding.
- Chu kỳ đã mở **giữ ngưỡng của chính nó**, nên admin đổi số giữa chừng không làm thay đổi
  kết quả một chu kỳ đang chạy.
- `/referrals/me` trả `code`, `totalCount`, `qualifiedCount`, `rewardedCount` — ba con số
  khác nhau có chủ đích: đăng ký chưa phải là đủ điều kiện, và đủ điều kiện chưa chắc đã được
  thưởng (còn trần theo ngày). Mã giới thiệu là **bất biến**, gắn lúc đăng ký, không có
  endpoint gắn sau hay chuyển nhượng.
- `/me/entitlements` trả `used`/`remaining` đếm đúng số bài mà quota **thật sự** chặn — cùng
  một định nghĩa với chỗ chặn lúc đăng bài. Hai bên lệch nhau thì API nói một đằng, lúc đăng
  bài chặn một nẻo.
- `POST /ranks/maintenance/evaluate` dành cho **lịch chạy ngoài** (cron/CI). Core cố ý
  **không** chạy scheduler trong tiến trình vì deploy nhiều replica sẽ chạy trùng. Có CLI
  tương đương: `npm run rank:evaluate`.

---

## 8. Giao dịch tặng/nhận — `/transactions`

Máy trạng thái: `REQUESTED → ACCEPTED → COMPLETED`, và có thể đóng sớm sang `CANCELLED` /
`REJECTED`.

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/transactions/me` | Bearer | Các lượt của chính mình, cả vai tặng lẫn vai nhận |
| `POST` | `/transactions` | Bearer | Xin một suất từ bài đăng |
| `POST` | `/transactions/:id/accept` | Bearer (người tặng) | Duyệt |
| `POST` | `/transactions/:id/confirm` | Bearer (người nhận) | Xác nhận đã nhận |
| `POST` | `/transactions/:id/cancel` | Bearer (cả hai vai) | Huỷ |

**Điều cần biết**

- Người tặng **lấy từ bài đăng**, không nhận từ client.
- **Xin đồ của chính mình bị chặn** — đó là đường farm hoạt động rẻ nhất.
- Một người chỉ có **một yêu cầu đang mở** trên mỗi bài; trùng thì báo lỗi riêng chứ không
  phải lỗi hệ thống.
- `accept` trừ tồn kho **nguyên tử** bằng `UPDATE ... WHERE remaining_quantity >= n`. Đọc rồi
  mới ghi thì hai người duyệt cùng lúc sẽ phát vượt số lượng thật.
- `cancel` sau khi đã duyệt thì **trả lại tồn kho**. Không trả là hàng bốc hơi khỏi bài đăng
  mà không ai nhận được.
- `confirm` đặt `completed_at` — đây là **mốc mà bộ đếm hoạt động của rank đọc**. Thiếu nó
  thì lượt tặng này vô hình với hệ thống hạng.

---

## 9. Quản trị — `/admin`

Toàn bộ khu này fail-closed (xem §1). Mọi thao tác ghi đều ghi audit kèm lý do bắt buộc.

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/admin/system-configs` | `config.read` | Cấu hình đang hiệu lực |
| `POST` | `/admin/system-configs` | `config.write` | Publish revision cấu hình mới |
| `GET` | `/admin/entitlements` | `entitlement.read` | Bảng quyền/quota theo hạng |
| `POST` | `/admin/entitlements` | `entitlement.write` | Publish bản chính sách mới |
| `GET` | `/admin/notification-channels` | `notification.manage` | Cấu hình kênh email/SMS/Zalo |
| `PUT` | `/admin/notification-channels/:channel` | `notification.manage` | Đổi cấu hình một kênh |
| `GET` | `/admin/audit-logs` | `audit.read` | Nhật ký thao tác quản trị |
| `GET` | `/admin/system-logs` | `audit.read` | Nhật ký hệ thống theo `logType` |
| `GET` | `/admin/roles` | `admin.manage` | Role và quyền kèm theo |
| `POST` \| `DELETE` | `/admin/users/:userId/roles` | `admin.manage` | Cấp / thu hồi role |
| `GET` | `/admin/users` | `admin.manage` | Tìm user với bộ lọc đầy đủ |
| `GET` | `/admin/users/:userId` | `admin.manage` | Chi tiết một user |
| `PATCH` | `/admin/users/:userId/status` | `admin.manage` | Đổi trạng thái |
| `DELETE` | `/admin/users/:userId` | `admin.manage` | Xoá mềm kèm ẩn danh |

**Điều cần biết**

- **Secret ghi vào được, không đọc ra được.** `GET /admin/notification-channels` chỉ báo kênh
  đã có secret hay chưa (`secretConfigured: true/false`), không bao giờ trả giá trị. Secret
  được mã hoá AES-256-GCM trước khi lưu; audit ghi "đã đổi secret" chứ không ghi giá trị.
- **Publish chính sách là copy-on-write, không sửa tại chỗ.** `config_revisions` có ràng buộc
  GIST cấm hai bản `PUBLISHED` cùng scope trùng khung thời gian. Bản cũ được đóng đúng bằng
  mốc bản mới mở ra — chừa khe hở dù một mili giây là có khoảnh khắc không bản nào hiệu lực
  và mọi lần kiểm quota rơi vào đó đều hỏng.
- `POST /admin/entitlements` nhận **patch từng ô**: bỏ trống `allowed`/`limit` là **giữ
  nguyên**, không phải đặt về `false`/`null`. Sửa quota Vàng thì không được âm thầm khoá
  quyền Kim Cương. Mã capability sai bị **từ chối** chứ không bỏ qua — im lặng ở đây khiến
  admin tưởng đã đổi xong trong khi không có gì thay đổi.
- Đổi chính sách **có hiệu lực ngay, không cần deploy**: runtime đọc theo revision đang hiệu
  lực tại `now()` và lấy hạng từ database chứ không từ JWT.
- `limit: null` nghĩa là **không giới hạn**; `limit: 0` nghĩa là **cấm hẳn**. Gộp hai thứ này
  là sai nghiệp vụ.
- **Không tự sửa quyền của chính mình**, và **không thu hồi được `SUPER_ADMIN` cuối cùng** —
  mất người cuối cùng là không còn ai cấp lại quyền cho bất kỳ ai, kể cả chính mình.
- `GET /admin/users` **không bao giờ trả `password_hash`** (loại ở tầng cột được chọn, không
  phải lọc sau).
- Xoá user là **xoá mềm kèm ẩn danh**: email/SĐT/họ tên bị xoá, **giữ username** để chống mạo
  danh trong lịch sử cũ.
- Khoá hoặc cấm user sẽ **thu hồi token và phiên ngay lập tức**, không đợi token hết hạn.
- `DELETE /admin/users/:userId` và `DELETE /admin/users/:userId/roles` **nhận body** (lý do
  bắt buộc). Một số HTTP client xử lý DELETE-có-body không đồng nhất — nếu thư viện của bạn
  nuốt body, dùng `fetch` hoặc `curl -X DELETE -d`.
- `/admin/system-logs` gom bốn nguồn thật (`admin_audit_logs`, `point_ledger`,
  `rank_transitions`, `gift_transactions`) về một hình dạng chung, lọc bằng `logType`.

---

## 10. Tương thích cũ — `/gift-posts`

Năm endpoint legacy giữ nguyên hợp đồng cũ nhưng **đọc/ghi canonical `posts`**: `create` uỷ
quyền sang `CreatePostUseCase`, phần còn lại đọc `IPostRepository`, và một mapper dựng lại
hình dạng legacy cho response.

| Method | Đường dẫn |
| --- | --- |
| `POST` | `/gift-posts` |
| `GET` | `/gift-posts/nearby` |
| `GET` | `/gift-posts/:giftPostId` |
| `PATCH` | `/gift-posts/:giftPostId` |
| `DELETE` | `/gift-posts/:giftPostId` |

Bảng `gift_posts` và toàn bộ migration lịch sử vẫn còn, nhưng **không còn đường code nào đọc
nó**. Client mới nên dùng `/posts`.

`GET /gift-posts/:giftPostId` luôn trả `canViewExactLocation: false` — kênh này không có khái
niệm chủ sở hữu xem bài của mình.

---

## 11. Vận hành

| Đường dẫn | Nội dung |
| --- | --- |
| `GET /health` | Trạng thái service **và một truy vấn `SELECT 1` thật** tới database |
| `GET /docs` | Swagger UI |
| `GET /docs/json` | Đặc tả OpenAPI |

`/health` cố ý chạm database thật. Health check chỉ trả "tôi còn sống" mà không kiểm kết nối
sẽ báo xanh trong khi mọi request đều lỗi.

> **Ứng dụng không tự bảo vệ `/docs`.** Trong mã nguồn không có biến môi trường nào bật/tắt
> hay đặt Basic Auth cho Swagger — nếu staging/production cần che thì phải làm ở tầng reverse
> proxy. `scripts/smoke-test.sh` có biến `SMOKE_DOCS_POLICY` (`public` | `basic` | `hidden`)
> nhưng đó chỉ là **kỳ vọng của người chạy test**, dùng để kiểm chứng lớp proxy đó, không
> phải công tắc của server.
