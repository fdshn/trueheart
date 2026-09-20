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

### Body luôn đi trong một khoá bọc

Mọi endpoint có body đều nhận `{ <tên tài nguyên>: { ... } }`, ví dụ
`{ "registration": { "username": "...", "password": "..." } }`.

**Thiếu khoá bọc là 400, không phải 500.** Trước đây gửi `{}` cho `/auth/register` trả
`500`: `@ValidateNested()` của class-validator bỏ qua giá trị `undefined`, nên validation cho
qua rồi use case nổ khi đọc trường bên trong. Nay mọi khoá bọc bắt buộc đều có `@IsDefined()`:

| Gửi gì | Trả về |
| --- | --- |
| `{}` | `400` — *registration should not be null or undefined* |
| `{"registration": null}` | `400` |
| `{"registration": "abc"}` | `400` — *nested property must be either object or array* |
| `{"registration": {}}` | `400` kèm lỗi từng trường bên trong |

**Body rỗng với `Content-Type: application/json` là hợp lệ.** Các endpoint không có body —
xác nhận nhận hàng, gia hạn bài, đánh dấu đã đọc, chạy đánh giá chu kỳ — nhận được cả khi
client đặt content-type JSON mà không gửi gì. Fastify mặc định trả 400 trong trường hợp đó;
server coi body rỗng là `{}`. JSON **hỏng** thì vẫn 400.

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
| `POST` | `/posts/:postId/renew` | Bearer (chủ bài) | Gia hạn thêm 3 tháng, tối đa một lần |
| `POST` | `/posts/:postId/charity-transfer` | Bearer (chủ bài) | Xin chuyển vật phẩm về điểm từ thiện |
| `PATCH` | `/posts/:postId/charity-transfer` | Bearer + allowlist | Duyệt hoặc từ chối yêu cầu chuyển |
| `PATCH` | `/posts/:postId/moderation` | Bearer + allowlist | Duyệt hoặc từ chối |
| `POST` | `/posts/:postId/media/upload` | Bearer (chủ bài) | Xin presigned URL upload ảnh |
| `POST` | `/posts/:postId/media` | Bearer (chủ bài) | Gắn ảnh đã upload |
| `PATCH` | `/posts/:postId/media/order` | Bearer (chủ bài) | Thay toàn bộ thứ tự ảnh |
| `DELETE` | `/posts/:postId/media/:mediaId` | Bearer (chủ bài) | Gỡ một ảnh |
| `POST` | `/posts/:postId/like` | Bearer | Thích hoặc bỏ thích bài đăng (toggle like) |

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

`isSos` nằm ở **thân bài**, không trong `details`, vì nó tham gia lọc và sắp xếp trên bảng
tin. Gửi `isSos: true` mà Rank chưa được phép thì trả `POST_SOS_NOT_ALLOWED` (403) — quyền
này là capability `POST_SOS`, Admin bật/tắt theo từng Rank lúc chạy, **không phải** một ô
tuỳ ý trên form.

Ranh giới giữ chặt **cả hai chiều**: `price`/`negotiable` không lọt sang bài đem tặng (biến
món quà thành món hàng ngay trên giao diện), và `estimatedValue` không lọt sang tin rao bán.
Mặc định `negotiable = false` vì hiểu im lặng thành "có thương lượng" là hứa hộ người bán
một điều họ không nói.

`totalQuantity` chỉ có nghĩa với `OFFER`; các loại khác bị ép về 1.

`selectionMode` ([F79](./FEATURES.md#f79--chế-độ-tìm-người-nhận-selection-modes)) chỉ áp dụng cho bài `OFFER`: `INSTANT` (chọn ngay người đầu tiên), `OPTIMAL` (mặc định, chờ tối đa 7 ngày), `EXTENDED` (chờ tối đa 30 ngày cho vật phẩm giá trị cao). Loại bài khác truyền lên sẽ bị từ chối.

> **Quota hiện dùng chung một rổ.** `CLASSIFIED` đang tính vào capability `POST_OFFER`, và
> bộ đếm quota đếm **mọi** bài đang mở bất kể loại. Muốn tách thì thêm capability
> `POST_CLASSIFIED` — sau đó admin tự chỉnh số, không cần deploy.

**Hình thức nhận hàng** ([F78](./FEATURES.md#f78--hình-thức-vận-chuyển), CH-2):

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `deliveryMethod` | `SELF_PICKUP` \| `GIVER_SHIPS` | Tùy chọn |
| `shipPayer` | `GIVER` \| `RECEIVER` | Chỉ hợp lệ khi `deliveryMethod = GIVER_SHIPS`, khác đi thì `400` |

Chỉ là **dấu hiệu** ghi ai lẽ ra trả phí — hệ thống không xử lý tiền ship (COD bên ngoài).
Nó là căn cứ cho `POST /transactions/:id/reports/ship-unpaid` ở §10.

> ⛔ **Chưa có trường cho cơ chế đổi điểm.** `srs/new-req.txt` còn yêu cầu bài đem tặng mang
> **giá trị tham khảo (VNĐ)** làm cơ sở quy đổi điểm. Hiện `OFFER` mới có `estimatedValue`
> — một con số hiển thị, **không** phải cơ sở tính điểm quy đổi.
> Xem [F74](./FEATURES.md#f74--giá-trị-tham-khảo--tỷ-lệ-quy-đổi-điểm).

### Vòng đời bài — hết hạn và gia hạn

Hạn 3 tháng đặt lúc **duyệt bài**, không phải lúc tạo: bài nằm chờ duyệt bao lâu cũng không
ăn vào tuổi thọ.

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts/:postId/renew` | Bearer, chủ bài | Gia hạn thêm 3 tháng, **tối đa một lần** |

Một lượt quét hết hạn (`npm run post:expire`, chạy từ lịch bên ngoài) làm hai việc khác nhau:

| Loại bài | Khi quá hạn |
| --- | --- |
| `CLASSIFIED` | **Thành `OFFER`** kèm hạn mới (CHỐT-05). `price` chuyển thành `estimatedValue`, bỏ `negotiable` |
| Còn lại | Sang `EXPIRED` |

**Những điều dễ hiểu nhầm**

- Rao vặt hết hạn **không biến mất** — nó thành bài đem tặng. Client đang mở danh sách rao
  vặt sẽ thấy bài "rơi khỏi" danh sách và xuất hiện ở tab Muốn Tặng; đó là đúng ý định.
- Vòng quét **không đụng** bài `RESERVED`/`DELIVERING`. Hết hạn ngang là cắt ngang một lượt
  trao đang diễn ra.
- `POST /posts/:postId/renew` trả **`404`** khi bài thuộc người khác, không phải `403` —
  phân biệt hai trường hợp là cho người lạ dò được id nào có thật.
- Gia hạn **tính quota như bài mới** (CHỐT-07). Bài đang hiển thị thì không tự chặn mình,
  nhưng bài đã `EXPIRED` phải giành lại chỗ trong hạn mức, nên gia hạn có thể bị từ chối
  bằng `POST_QUOTA_EXCEEDED` dù trước đó bài vẫn sống.
- Tin rao vặt **không gia hạn được** (`POST_NOT_RENEWABLE`): quy định đã định đoạt số phận
  của nó theo hướng khác.
- Yêu cầu xin nhận bị từ chối ngay khi bài quá `expires_at`, **kể cả khi trạng thái vẫn còn
  là `PUBLISHED`** vì vòng quét chưa chạy. Không có cửa sổ xin nhận trên bài đã chết.

### Chuyển vật phẩm về điểm từ thiện

Trước khi bài hết hạn, chủ bài xin chuyển vật phẩm cho điểm tập kết từ thiện; Admin duyệt
([F23](./FEATURES.md#f23--chuyển-vật-phẩm-về-điểm-từ-thiện)).

| Bước | Ai | Kết quả |
| --- | --- | --- |
| `POST /posts/:postId/charity-transfer` | Chủ bài | `charityTransferStatus = REQUESTED` |
| `PATCH` … `{ "transfer": { "status": "APPROVED" } }` | Operator | Bài sang **`ARCHIVED`** — Kho Từ Thiện Chung |
| `PATCH` … `{ "transfer": { "status": "REJECTED" } }` | Operator | Bài **giữ nguyên** trạng thái cũ |

**Những điều dễ hiểu nhầm**

- Từ chối **không lấy bài đi**. Bài về lại đúng trạng thái trước đó và chủ bài dùng bình
  thường; chỉ còn dấu `REJECTED` để họ biết đã bị từ chối chứ không tưởng là chưa gửi.
- Bị từ chối rồi **vẫn gửi lại được** — không có khoá vĩnh viễn.
- Mỗi bài chỉ có **một** yêu cầu đang chờ duyệt, ràng buộc bằng unique index có điều kiện ở
  database. Bấm gửi hai lần không thành hai việc cho Admin.
- Chỉ bài `PUBLISHED` hoặc `EXPIRED` và **còn vật phẩm** mới xin chuyển được. Bài đang chờ
  duyệt thì chưa, vì chưa ai thấy nó.

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

### `GET /posts/:postId` — Chi tiết bài đăng & Quyền riêng tư tác giả

- **Bảo mật tác giả ([F80](./FEATURES.md#f80--bảo-vệ-thông-tin-người-cho--contact-info-gating))**: `author` chỉ mang `id`, `username`, `avatarUrl`, `rank`, `joinedAt`. Tuyệt đối không trả `fullName`, `phone`, hay địa chỉ cụ thể ra kênh công khai.
- **Thông tin liên lạc (`contactInfo`)**: Chứa `phone` và `address`. CHỈ hiển thị khi caller là chính tác giả (`authorId == currentUserId`) hoặc là người nhận (receiver) đã được duyệt chính thức trong giao dịch đang ở trạng thái `DELIVERING` hoặc `COMPLETED`. Mọi đối tượng khác nhận `contactInfo: null`.
- **Thống kê tương tác**: Trả về `likeCount` (tổng lượt thích) và `isLiked` (caller đã thích chưa; `null` nếu khách chưa đăng nhập).

### `POST /posts/:postId/like` — Thích hoặc bỏ thích bài đăng ([F81](./FEATURES.md#f81--tương-tác-yêu-thích-bài-đăng))

- Yêu cầu đăng nhập (`Bearer`).
- Cơ chế **toggle**: nếu chưa thích thì thêm vào `post_likes` và `likeCount++`; nếu đã thích rồi thì xoá khỏi `post_likes` và `likeCount--`.
- Trả về `{ liked: boolean, likeCount: number }`.
- Cập nhật số đếm nguyên tử trong database, loại bỏ nhu cầu `COUNT(*)` khi hiển thị chi tiết bài.

### Xin nhận đồ — `/posts/:postId/requests`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts/:postId/requests` | Bearer | Gửi yêu cầu xin nhận, kèm lời nhắn tối đa 500 ký tự |
| `POST` | `/posts/:postId/requests/withdraw` | Bearer | Rút yêu cầu của chính mình |
| `GET` | `/posts/:postId/requests` | Bearer (chỉ tác giả) | Danh sách người xin, có phân trang |
| `POST` | `/posts/:postId/requests/:requestId/accept` | Bearer (chỉ tác giả) | Duyệt một người xin |

#### Hàng đợi dự phòng

Duyệt một người mà bài hết hàng thì những người còn lại chuyển sang **`STANDBY`**, không phải
`REJECTED` ([F33](./FEATURES.md#f33--hàng-đợi-dự-phòng)). Hai trạng thái nói hai chuyện khác
nhau: `STANDBY` là *chưa tới lượt*, `REJECTED` là *người cho đã từ chối*.

Khi lượt trao bị huỷ:

| Ai | Chuyện gì |
| --- | --- |
| Người đang `STANDBY` | Quay về `PENDING`, giữ nguyên `queueJoinedAt` nên **không mất chỗ** |
| Người vừa bị huỷ | Sang `CANCELLED`, **không** quay lại hàng đợi |
| Người đã tự rút | Giữ `WITHDRAWN`, không bị kéo trở lại |

**Hệ thống chỉ đề xuất, không tự trao.** Người cho nhận thông báo kèm số người còn trong
hàng đợi; ứng viên được đề xuất nhận thông báo *"đang được xét tiếp"* — cố ý **không** nói
"đã được chọn", vì chưa ai chọn họ. Không có giao dịch nào được tạo tự động.

**Ai được đề xuất là do Admin cấu hình** (CH-1), không cố định "ai xin trước". Xem
[§11 Quản trị](#11-quản-trị--admin) cho endpoint đổi thứ tự ưu tiên.

Người đang `STANDBY` **rút được** yêu cầu, và **không** gửi lại được yêu cầu mới (trả
`GIFT_REQUEST_DUPLICATED`): họ vẫn đang có một yêu cầu mở, và gửi lại sẽ reset thứ tự hàng
đợi, tức tự đẩy mình xuống cuối.

`requestCount` công khai **có** đếm người `STANDBY` — họ còn trong hàng đợi. Chỉ `REJECTED`,
`CANCELLED`, `WITHDRAWN` bị loại khỏi con số đó.

**Điều cần biết**

- **Mỗi người một yêu cầu đang mở trên mỗi bài.** Xin trùng bị từ chối bằng mã lỗi riêng,
  không phải 500 — ràng buộc unique một phần ở database là nơi quyết định cuối, và lỗi
  `23505` được map lại thành lỗi nghiệp vụ.
- **Rút rồi xin lại được**: bản ghi cũ được tái dùng thay vì tạo dòng mới, nên vừa hợp
  unique index vừa giữ lịch sử.
- **Không xin được bài của chính mình.**
- `GET` chỉ **tác giả bài** gọi được. Danh sách trả `username`, họ tên, avatar và hạng của
  người xin — **không** email, SĐT hay điểm.
- **Duyệt là thao tác có khoá.** Toàn bộ nằm trong một transaction, khoá theo thứ tự
  `gift_requests` → `gift_transactions` → `posts`. Thứ tự này phải khớp với
  `GiftTransactionRepository`, nếu không hai luồng duyệt chạy đồng thời sẽ khoá chéo nhau
  và Postgres huỷ một bên.
- **Bài chỉ chuyển `DELIVERING` khi hết số lượng.** Còn hàng thì vẫn `PUBLISHED` để người
  khác tiếp tục xin; chỉ khi hết hàng mới từ chối hàng loạt các yêu cầu còn lại.
- **Một lượt bàn giao chỉ trừ kho một lần.** Nếu người nhận đã có giao dịch được duyệt qua
  `/transactions`, duyệt tiếp ở đây bị từ chối thay vì trừ kho lần nữa.
- `requestCount` hiển thị công khai **không đếm** yêu cầu đã rút, huỷ hoặc bị từ chối.

---

## 6. Khám phá — `/discovery`, `/posts/nearby`, `/posts/map`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/discovery/config` | Công khai | Giới hạn bán kính, phân trang và loại bài mà khách xem được |

Khách chưa đăng nhập dùng được cả ba. `discovery/config` tồn tại để client **không hardcode**
giới hạn — đổi trần bán kính ở server là client tự theo.

`/posts/nearby` bắt buộc có `postType`; `/posts/map` nhận khung bbox và trả tối đa 200 marker,
gom cụm để client tự vẽ. Cả hai đều áp quy tắc làm nhiễu toạ độ ở §1.

### Gốc toạ độ: GPS, rồi mới tới Vị trí mặc định

`lat`/`lng` của `/posts/nearby` là **tuỳ chọn** ([F26](./FEATURES.md#f26--gps-hiện-tại--dự-phòng-default-location)):

| Gửi gì | Server làm gì | `originSource` |
| --- | --- | --- |
| Cả `lat` và `lng` | Dùng đúng toạ độ đó | `REQUEST` |
| Không gửi, đã đăng nhập, có Vị trí mặc định | Lùi về Vị trí mặc định | `DEFAULT_LOCATION` |
| Không gửi, chưa đăng nhập | `DISCOVERY_ORIGIN_UNAVAILABLE` (400) | — |
| Không gửi, đã đăng nhập, **chưa** đặt Vị trí mặc định | `DISCOVERY_ORIGIN_UNAVAILABLE` (400) | — |
| Chỉ một trong hai | `DISCOVERY_ORIGIN_UNAVAILABLE` (400) | — |

Response **luôn** trả `originSource`. Giao diện cần nó để nói "đang tìm quanh vị trí mặc định
của bạn" — lùi về một toạ độ khác mà im lặng là đổi kết quả sau lưng người dùng.

Gửi **một nửa** toạ độ là lỗi của client, không phải ý muốn lùi vị trí: bỏ qua nửa kia sẽ
quét quanh một chỗ khác hẳn chỗ client đang chỉ tới. Và khi không có gốc nào, server **không**
tự chọn một toạ độ mặc định — trả kết quả quanh một điểm người dùng không chọn là nói sai về
thứ họ đang xem.

### Marker bản đồ đủ cho thẻ xem nhanh

Mỗi marker của `/posts/map` mang `title`, `thumbnailUrl`, `isSos` và `deepLinkPath`
([F29](./FEATURES.md#f29--thẻ-xem-nhanh--deep-link)), để chạm vào là dựng được thẻ xem nhanh
mà **không cần một vòng gọi nữa cho mỗi marker**.

- `deepLinkPath` là đường dẫn **tương đối** (`/posts/<id>`). Server không ghép tên miền —
  đoán hộ client là sinh ra link chết khi đổi môi trường triển khai.
- `thumbnailUrl` là ảnh có `sortOrder` nhỏ nhất, `null` khi bài không có ảnh. Bài nhiều ảnh
  vẫn ra **đúng một** marker; nhân bản theo số ảnh sẽ thành nhiều pin trùng chỗ.
- Marker **không** mang `authorId` hay `description`: `title` đã công khai ở mọi kênh khác,
  còn định danh người đăng thì không.

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

  > ⚠️ **Đây là hành vi hiện tại của code, và nó sắp đổi.** SRS chốt hạng đọc **balance**,
  > còn `srs/new-req.txt` chốt cách bảo vệ hạng: phần điểm cần để giữ hạng bị **chặn không
  > cho tiêu** (`điểm khả dụng = balance − ngưỡng hạng hiện tại`) thay vì tách ra một loại
  > điểm riêng. Khi làm xong, `/points/me` sẽ phải trả thêm **điểm khả dụng** — con số mà
  > người dùng thực sự tiêu được, luôn nhỏ hơn `balance`.
  > Xem [F76](./FEATURES.md#f76--điểm-khả-dụng--bảo-vệ-rank) và
  > [GĐ-3](./plan/ASSUMPTIONS.md#gđ-3--cơ-chế-rank--tụt-hạng).
- Ledger là **append-only**. Không có UPDATE, không có DELETE; đảo một bút toán là ghi thêm
  bút toán âm. Trigger ở database chặn sửa/xoá.
- **Điểm có thể âm, và cột điểm không nói điều đó.** Khoản phạt (CH-2) lớn hơn số dư thì số
  tiêu được kẹp ở 0, nhưng giá trị thật vẫn được ghi. Đang có 20 mà bị phạt 50:

  | Trường | `/points/me` | Mỗi dòng `/points/me/ledger` |
  | --- | --- | --- |
  | Số tiêu được | `balance: 0` | `balanceAfter: 0` |
  | Giá trị thật | `rawBalance: -30` | `rawBalanceAfter: -30` |
  | Mức thay đổi | — | `delta: -50` |
  | Câu cho cột log | — | `note: "-50 điểm, đang âm 30 điểm"` |

  `note` dựng ở **máy chủ** để web và app không diễn đạt "đang âm" khác nhau. Client nào
  muốn tự trình bày vẫn có `delta` và `rawBalanceAfter` thô.
- `/points/me` còn trả `creditCount` và `debitCount` — đếm **từ chính ledger**, không từ một cột
  đếm riêng. Một bộ đếm riêng là con số thứ hai nói về cùng một sự thật, sớm muộn lệch.
- **Khoản phạt không trừ `lifetime`.** Lifetime là sàn của Rank; cho phạt kéo nó xuống là
  biến một lần không trả ship thành một lần tụt hạng. Cộng điểm sau đó **trả nợ trước**:
  đang âm 30 được cộng 50 thì tiêu được 20, không phải 50.
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
- ⛔ **Chưa có đường nào tiêu điểm.** Cơ chế đổi vật phẩm bằng điểm
  ([F75](./FEATURES.md#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm),
  [F77](./FEATURES.md#f77--ledger-cho-giao-dịch-đổi-điểm)) chưa có endpoint. Khi làm, bút toán
  trừ điểm phải đi qua chính ledger này với `rule_code = 'ITEM_REDEMPTION'` và
  `idempotency_key` bắt buộc — không mở một đường ghi điểm thứ hai.

---

## 8. Chat — `/chat` và Socket.io

Mỗi giao dịch đã duyệt có **đúng một** phòng chat, mở ngay trong transaction duyệt
([F34](./FEATURES.md#f34--chấp-nhận-giao-dịch--mở-chat)).

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/chat/rooms` | Bearer | Danh sách hội thoại của chính mình, phân trang |
| `GET` | `/chat/rooms/:roomId/messages` | Bearer (trong phòng) | Lịch sử, mới nhất trước, **phân trang bằng con trỏ** |
| `POST` | `/chat/rooms/:roomId/messages` | Bearer (trong phòng) | Gửi tin, tối đa 2000 ký tự |
| `PATCH` | `/chat/rooms/:roomId/read` | Bearer (trong phòng) | Đánh dấu đã đọc tới hiện tại |

### Lazy loading tin nhắn — con trỏ, không phải `page`

`GET /chat/rooms/:roomId/messages` là **endpoint duy nhất trong toàn bộ API không dùng
`page`/`pageSize`**. Có lý do.

Chat là danh sách được thêm vào **ĐẦU**. Người dùng cuộn lên xem lịch sử trong khi tin mới
vẫn đến; mỗi tin mới đẩy cửa sổ `OFFSET` xuống một dòng. Lấy 25 tin, 10 tin mới đến, rồi
lấy `OFFSET 25` → **10 tin vừa xem hiện lại lần hai**. Đây không phải lo xa: `test:chat-paging`
chạy lại đúng câu OFFSET cũ trên database thật và đếm đúng 10 tin bị lặp.

Con trỏ trỏ vào một tin **cụ thể**, nên cửa sổ không trôi.

| Tham số | Ý nghĩa |
| --- | --- |
| *(không truyền gì)* | Cửa sổ **mới nhất** — màn hình mở đầu |
| `before=<cursor>` | Tin **cũ hơn** — hướng cuộn lên xem lịch sử |
| `after=<cursor>` | Tin **mới hơn** — bắt kịp sau khi mất kết nối |
| `limit` | Mặc định 30, **trần 50** |

Phản hồi mang khối `window` thay cho `meta`:

```jsonc
{
  "messages": [ /* luôn mới-nhất-trước, bất kể lấy theo chiều nào */ ],
  "window": {
    "limit": 30,
    "oldestCursor": "...",   // truyền vào `before` để cuộn tiếp lên
    "newestCursor": "...",   // truyền vào `after` để bắt kịp
    "hasMoreBefore": true,
    "hasMoreAfter": false
  }
}
```

**Những điều dễ hiểu nhầm**

- **Không có `total`.** Đếm toàn bộ tin của một phòng là một `COUNT(*)` quét cả bảng **mỗi
  lần cuộn**, và không giao diện nào dùng đến con số đó. `hasMoreBefore` lấy được bằng cách
  hỏi dư **một dòng**.
- **Con trỏ hỏng không phải lỗi.** Chuỗi rác, bookmark cũ, client đời trước — tất cả
  được coi như không truyền con trỏ, tức trả về cửa sổ mới nhất. Ném `400` vì một link
  dán tay là chặn người dùng khỏi thứ họ luôn xem được.
- **Truyền cả `before` lẫn `after` thì `before` thắng** — cuộn lên là việc người dùng chủ
  động làm, bắt kịp chỉ là việc chạy ngầm.
- **Không có cách nào xin cả phòng.** `?limit=999999` bị chặn ở 50 tại DTO, và cũng bị
  kẹp lại lần nữa trong use case.
- Khoá sắp xếp là cặp `(created_at, id)` chứ không chỉ thời gian: hai tin cùng một
  millisecond thì thiếu `id` sẽ không phân định được bên nào trước. Truy vấn dùng row-value
  `(created_at, id) < ($2, $3)` nên vẫn đi index `IDX_chat_messages_room_created` —
  `test:chat-paging` đọc `EXPLAIN` để canh điều này, không phải tin lời.

### Hạn lưu trữ — tin nhắn bị xoá sau một thời gian

Khi lượt trao kết thúc, phòng chuyển sang chỉ đọc **và** được đặt một **hạn xoá**.

| Trường trong `room` | Ý nghĩa |
| --- | --- |
| `purgeAfter` | Ngày tin nhắn sẽ bị xoá. `null` khi phòng còn mở, hoặc khi đã gỡ hạn để giữ chứng cứ |
| `purgedAt` | Đã xoá lúc nào. Khác `null` thì lịch sử đã trống |
| `purgedMessageCount` | Đã xoá bao nhiêu tin |

**Những điều dễ hiểu nhầm**

- **Mốc đếm ngược là lúc KHOÁ phòng, không phải lúc hoàn tất.** Một lượt trao kết
  thúc theo **ba** đường: người nhận xác nhận, một trong hai bên huỷ, hoặc cron tự
  hoàn tất. Chỉ đường đầu có `completedAt` — tính theo nó thì phòng của lượt **huỷ**
  không bao giờ bị xoá, mà huỷ lại là chỗ người ta cãi nhau nhiều nhất.
- **`purgeAfter` là ảnh chụp, không phải phép tính.** Nó được chốt một lần lúc khoá
  phòng. Admin đổi cấu hình sau đó **không dịch** ngày của những phòng đã khoá —
  nếu không thì báo với người dùng "xoá sau 1 tuần" rồi đổi thành 3 tuần là lời hứa
  và thực tế lệch nhau.
- **Xoá tin nhắn, GIỮ phòng.** Mở lại lượt trao cũ không ra `404`; giao diện đọc
  `purgedAt` để nói "tin nhắn đã xoá theo chính sách lưu trữ".
- **Ảnh bằng chứng không bị xoá cùng.** Chúng nằm ở bảng riêng (§10), nên report và
  đối chất vẫn có căn cứ sau khi chat đã trống.
- **Gỡ hạn là cách giữ lại.** `purgeAfter = NULL` thì không bao giờ bị xoá — dùng khi
  cần giữ chứng cứ một vụ tranh chấp. Một cột làm cả hai việc, không cần cờ thứ hai.
- Hai bên được **báo một lần lúc khoá phòng**, kèm ngày cụ thể — không phải "sau 1
  tuần" chung chung.

Cấu hình ở `system_configs` khoá `chat.retention`, dạng
`{ "value": 2, "unit": "WEEK" }` — `unit` là `DAY` hoặc `WEEK`. Cấu hình hỏng thì rơi
về mặc định **1 tuần**: khoá phòng là hệ quả của một lượt trao vừa xong, không được
chết vì một dòng JSON gõ nhầm.

Vòng xoá chạy từ lịch **ngoài tiến trình**: `npm run chat:purge`, giống `post:expire`
và `rank:evaluate`. Core cố ý không chạy scheduler trong tiến trình vì nhiều replica sẽ
chạy trùng.

### Gửi bằng REST, nhận bằng socket

Socket **chỉ đọc và nhận**, không ghi. Gửi tin đi qua `POST` như mọi thao tác ghi khác.

Một đường ghi duy nhất nghĩa là chỉ một chỗ kiểm quyền, kiểm trạng thái phòng và sinh mã
lỗi. Mở đường ghi thứ hai qua socket là nhân đôi toàn bộ những phép kiểm đó, và bản thứ hai
sẽ lệch dần theo thời gian. Người gửi vẫn có phản hồi tức thì — chính response của `POST`;
socket lo việc đẩy tin sang máy người còn lại.

| Chiều | Sự kiện | Ghi chú |
| --- | --- | --- |
| Client → server | `room:join` `{ roomId }` | Ack `{ joined: boolean }` |
| Client → server | `room:leave` `{ roomId }` | Ack `{ left: boolean }` |
| Server → client | `message:new` | Payload **không** có `isMine` |
| Server → client | `connection:rejected` | Kèm lý do chung, rồi ngắt kết nối |

Kết nối tới namespace **`/chat`** (không có tiền tố `/api/v1` — `setGlobalPrefix` không áp
cho WebSocket). Token gửi qua `auth.token` lúc bắt tay, hoặc header `Authorization`.
Socket.io gắn vào chính HTTP server hiện có nên **không mở cổng thứ hai**; hạ tầng chỉ cần
cho phép nâng cấp WebSocket trên cổng đang dùng.

**Những điều dễ hiểu nhầm**

- Xác thực lúc bắt tay làm **đủ hai bước** như HTTP: verify chữ ký *và* tra danh sách thu
  hồi. Đổi mật khẩu hay xoá tài khoản xong thì token cũ còn hạn nhưng phải chết ngay.
- `message:new` **không** mang `isMine` — cờ đó phụ thuộc người nhận. Client tự so `senderId`
  với chính mình; gửi `isMine: true` cho tất cả là nói sai với người còn lại.
- Người ngoài phòng nhận `{ joined: false }` và `CHAT_ROOM_NOT_FOUND` (404), **không phải**
  403 — phân biệt là để lộ ai đang trao đổi với ai.
- `unreadCount` tính theo mốc đã đọc của **chính người gọi** và **không đếm tin họ tự gửi**.
- Giao dịch kết thúc thì phòng sang `READ_ONLY`: gửi tiếp trả `CHAT_ROOM_READ_ONLY` (409),
  nhưng **đọc lại lịch sử vẫn được** và đánh dấu đã đọc vẫn được
  ([F38](./FEATURES.md#f38--lưu-trữ--khoá-chỉ-đọc)). Lịch sử không bị xoá:
  `chat_messages` chỉ ghi thêm, trigger ở database chặn cả UPDATE lẫn DELETE.

---

## 9. Thông báo — `/notifications`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/notifications/me` | Bearer | Hộp thư của chính mình, lọc `unreadOnly` |
| `PATCH` | `/notifications/me/read` | Bearer | Đánh dấu đã đọc; bỏ trống id thì đánh dấu tất cả |

- `unreadCount` là **tổng** số chưa đọc, không phụ thuộc trang hay bộ lọc đang xem — mở
  trang 2 không được làm badge tụt xuống.
- Id không thuộc người gọi đơn giản không khớp dòng nào; **không báo lỗi**, vì báo lỗi là
  nói cho họ biết id đó có thật.
- Mỗi sự kiện có `idempotencyKey` UNIQUE, nên retry không làm rung điện thoại hai lần.
- ⛔ **Đẩy FCM chưa dùng được**: chưa có khoá dự án Firebase, `LoggingPushSender`
  fail-closed ở production. Thông báo **trong app** không phụ thuộc vào nó — mất đường đẩy
  không làm mất thông báo.

---

## 10. Giao dịch tặng/nhận — `/transactions`

Máy trạng thái: `REQUESTED → ACCEPTED → COMPLETED`, và có thể đóng sớm sang `CANCELLED` /
`REJECTED`.

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/transactions/me` | Bearer | Các lượt của chính mình, cả vai tặng lẫn vai nhận |
| `POST` | `/transactions` | Bearer | Xin một suất từ bài đăng |
| `POST` | `/transactions/:id/accept` | Bearer (người tặng) | Duyệt |
| `POST` | `/transactions/:id/confirm` | Bearer (người nhận) | Xác nhận đã nhận |
| `POST` | `/transactions/:id/cancel` | Bearer (cả hai vai) | Huỷ |
| `POST` | `/transactions/:id/evidence/upload-url` | Bearer (cả hai bên) | Xin đường tải ảnh bằng chứng |
| `POST` | `/transactions/:id/handover` | Bearer (**chỉ người tặng**) | Báo đã trao đồ → `DELIVERING` |
| `POST` | `/transactions/:id/reports/ship-unpaid` | Bearer (**chỉ người gửi**) | Báo người nhận không thanh toán phí ship (CH-2) |

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
- **`handover` không phải riêng cho ship.** Tự đến lấy cũng có lúc trao đồ, và tranh
  chấp "tôi chưa hề nhận được" vẫn xảy ra khi không có ship. Mốc `handedOverAt` **đẩy
  lùi đồng hồ tự hoàn tất**: trước đây đếm từ `acceptedAt`, nên ship liên tỉnh 4–5 ngày
  bị cron đóng trước khi hàng tới nơi.
- **Ảnh bằng chứng** đi qua presigned PUT như ảnh bài đăng — máy chủ không nhận file.
  Tối đa **3 tấm mỗi mốc**, và trần đó do **database** giữ (`slot` 1–3 + UNIQUE), không
  phải một phép đếm ở tầng ứng dụng vốn thua cuộc khi hai request vào cùng lúc. Gửi
  quá trần thì phần thừa bị bỏ, không báo lỗi.

  | Mốc | Ai | Bắt buộc? |
  | --- | --- | --- |
  | `HANDOVER` | người tặng | Không — nhưng thiếu thì **mất quyền report** |
  | `RECEIPT` | người nhận | Không |
  | `RETURNED` | người tặng | **Có**, gửi kèm lúc báo |

  Ảnh **không** chứng minh được nội dung gói hàng hay việc nó thật sự được gửi đi. Cái
  nó làm được là tạo thế bất đối xứng: ai có ảnh thì câu chuyện nhất quán, ai không
  có gì thì report không dựa trên gì cả.
- **Ảnh nằm ngoài chat**, nên xoá chat theo hạn lưu trữ không làm mất bằng chứng.
- `reports/ship-unpaid` **chỉ người gửi gọi được**: chỉ họ mới thấy hàng bị hoàn về. Cho người
  nhận báo là cho chính người bị phạt quyết định có bị phạt hay không. Chỉ áp dụng khi bài
  khai `shipPayer = RECEIVER`; khác đi thì `409 SHIP_PAYER_NOT_RECEIVER`.
- **Báo thì đóng luôn lượt trao** (`CANCELLED`). Không đóng thì cron tự hoàn tất đánh
  dấu `COMPLETED` sau 5 ngày — người nhận vừa bị trừ 50 điểm vì không trả ship, vừa
  được ghi công đã nhận quà, trong khi món đồ đang nằm ở nhà người tặng. Lượt huỷ tính
  cho **người nhận**, không phải người bấm báo.
- Khoản phạt đi qua chính point ledger với khoá chống trùng **theo lượt trao**, nên bấm hai
  lần hay mạng retry đều chỉ trừ một lần — lần sau trả `penaltyApplied: false` thay vì báo
  đã trừ thêm. Số điểm lấy từ point rule `SHIP_UNPAID_PENALTY` nên Admin chỉnh được.
- Hệ thống **không xử lý tiền ship** — đó là COD ngoài hệ thống. Nó chỉ đối chiếu dấu hiệu
  đã khai trên bài rồi ghi một khoản phạt.

---

## 11. Quản trị — `/admin`

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
| `GET` | `/admin/me` | `admin.access` | Role và permission đọc lại từ database cho phiên CMS |
| `POST` \| `DELETE` | `/admin/users/:userId/roles` | `admin.manage` | Cấp / thu hồi role |
| `GET` | `/admin/users` | `admin.manage` | Tìm user với bộ lọc đầy đủ |
| `GET` | `/admin/users/:userId` | `admin.manage` | Chi tiết một user |
| `PATCH` | `/admin/users/:userId/status` | `admin.manage` | Đổi trạng thái |
| `DELETE` | `/admin/users/:userId` | `admin.manage` | Xoá mềm kèm ẩn danh |
| `GET` | `/admin/posts` | `post.read` | Queue bài đăng, mặc định lọc `PENDING_REVIEW` |
| `GET` | `/admin/posts/:postId` | `post.read` | Chi tiết bài và media dành cho moderator |
| `PATCH` | `/admin/posts/:postId/moderation` | `post.moderate` | Duyệt/từ chối, reason bắt buộc, ghi audit |
| `GET` | `/admin/reports` | `report.read` | Hàng đợi report, ưu tiên target có nhiều tín hiệu mở |
| `GET` | `/admin/reports/:reportId` | `report.read` | Chi tiết report và URL bằng chứng |
| `PATCH` | `/admin/reports/:reportId/review` | `report.resolve` | Kết luận hoặc bác bỏ, ghi chú bắt buộc, ghi audit |
| `GET` | `/admin/categories` | `category.read` | Cây danh mục quản trị, gồm cả mục đã tắt |
| `POST` | `/categories` | `category.manage` | Tạo danh mục và ghi audit |
| `PATCH` | `/categories/:categoryId` | `category.manage` | Sửa, sắp thứ tự hoặc bật/tắt danh mục và ghi audit |

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
- CMS lấy capability từ `/admin/me`, không suy ra quyền từ `rank`, `status` hoặc JWT.
- Queue `/admin/posts` không trả tọa độ chính xác. Moderation chỉ chuyển bài còn ở
  `PENDING_REVIEW`; update trạng thái và audit `MODERATE_POST` nằm chung một transaction.
- `POST /reports` nhận target `POST` hoặc `USER`, mô tả và tối đa 5 URL bằng chứng. Nhiều
  report chỉ tăng độ ưu tiên; không report nào tự động phạt. Quyết định Admin và audit
  `REVIEW_REPORT` được ghi chung transaction.


### Thứ tự ưu tiên chọn người nhận (CH-1)

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/admin/candidate-selection` | `config.read` | Thứ tự đang có hiệu lực |
| `PUT` | `/admin/candidate-selection` | `config.write` | Đặt thứ tự mới, kèm `reason` |

Năm tiêu chí: `QUEUE_JOINED_EARLIEST`, `HIGHEST_RANK`, `NEAREST`, `FEWEST_RECEIVED`,
`FEWEST_CANCELLATIONS`. Phần tử đầu là tiêu chí số 1; hoà thì xét tiêu chí sau.

- **Không cần khai đủ.** Tiêu chí thiếu tự xuống cuối theo thứ tự mặc định — thiếu tiêu chí
  nghĩa là tới đoạn đó không còn gì phá thế hoà, và hai ứng viên sẽ xếp theo thứ tự ngẫu
  nhiên của database.
- **`GET` trả thứ tự ĐÃ CHUẨN HOÁ**, tức thứ tự hệ thống thật sự dùng — không phải chuỗi thô
  Admin gõ vào. `isConfigured: false` nghĩa là chưa ai đặt và đang chạy mặc định.
- **Cấu hình rác không làm chết tính năng**: mã lạ bị bỏ, và nếu không còn gì hợp lệ thì rơi
  về mặc định. Quyết định "ai được nhận quà" không được phép dừng vì một dòng config sai.
- Ai chưa đặt Vị trí mặc định thì xếp **sau cùng** ở tiêu chí `NEAREST`, không phải coi như
  0 mét — coi là 0 sẽ thưởng cho việc không khai thông tin.
- Ghi theo copy-on-write như mọi system config: `reason` bắt buộc và đi thẳng vào audit log.
---

## 12. Tương thích cũ — `/gift-posts`

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

## 13. Vận hành

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
