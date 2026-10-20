# Tham chiếu API

> **Lưu ý 07/10/2026:** Tài liệu này mô tả **API hiện đang có**, không phải hợp đồng đã
> triển khai cho [nghiệp vụ cho–nhận/đổi điểm/review mới](./plan/GIVE-RECEIVE-2026-10-07.md).
> **Đã triển khai:** thưởng người cho theo CHỐT-14 (hai khoản rời, xong 07/10); `EXTENDED`
> đã bỏ và countdown tính từ **lúc đăng** (CHỐT-10, xong 11/10).
> **Mục 1 của CHỐT-10 xong cả ba việc 11/10:** `selectionMode` nay áp cho **cả** `OFFER` và
> `WANTED` (vai tặng/nhận đảo đúng), quyền chọn tay gắn hạng Kim Cương, và `EXPIRED` báo cho
> cả hai bên.
> **Mục 2 và mục 4 xong 11–12/10:** đổi điểm đòi xác nhận lại khi giá đã đổi, huỷ lượt trao
> đổi-bằng-điểm thì hoàn đúng số đã trừ, và mỗi bên **sửa đánh giá của mình được một lần**
> trong hạn chờ.
> **CHỐT-10 xong cả năm mục** (mục 5 là `npm run test:acceptance`). Không dùng trang này làm
> bằng chứng tính năng mới đã có; bằng chứng là lượt chạy xanh của script đó.

Mô tả **các endpoint đang chạy thật** của `@chantam.vn/chantam.core`, kèm hành vi và ràng
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

### Điểm thưởng trong header response

**Mọi** API — hiện tại và về sau — mà khi xử lý xong có **cộng** điểm cho người gọi đều trả
thêm hai header:

```http
X-Points-Awarded: 28
X-Points-Message: X%C3%A1c%20minh%20s%E1%BB%91%20%C4%91i%E1%BB%87n%20tho%E1%BA%A1i%20l%E1%BA%A7n%20%C4%91%E1%BA%A7u
```

- `X-Points-Message` được **percent-encode** (`encodeURIComponent`). Giải bằng
  `decodeURIComponent(h)` → `"Xác minh số điện thoại lần đầu"`. Lý do: header HTTP chỉ chở
  được Latin-1; chữ như "Đ" ghi thẳng làm server lỗi.
- Một request cộng nhiều khoản thì `X-Points-Awarded` là **tổng**, còn `X-Points-Message` ghép
  các tiêu đề (không lặp) bằng `"; "`. Tiêu đề chính là `ruleTitle` của lịch sử điểm.
- **Chỉ điểm của chính người gọi.** Người nhận xác nhận giao dịch thì người tặng cũng được
  điểm, nhưng header của request đó chỉ nói phần người nhận.
- **Chỉ điểm đã thật sự ghi**: server đọc lại sổ điểm trước khi trả, nên lượt bị rollback
  không lọt ra header.
- Không cộng điểm (hoặc chỉ bị trừ) thì **không có** hai header này — client kiểm có mặt hay
  không, đừng mặc định là 0.
- Điểm cộng sau khi response đã đi (cron, việc nền) không đi kèm request nào nên không có
  header; xem `GET /points/me/ledger`.
- Server gửi kèm `Access-Control-Expose-Headers: X-Points-Awarded, X-Points-Message` để web
  đọc được nếu sau này bật CORS khác tên miền.

### Xác thực

Bearer token ở header `Authorization`. Access token ngắn hạn, refresh token dài hạn.

> **JWT mang `rank` và `status` nhưng đó là ảnh chụp cũ.** Mọi quyết định phân quyền đều
> đọc lại từ database. Đừng dựa vào rank trong token để suy ra quyền.

### Ba cơ chế phân quyền song song

Đây là chỗ dễ nhầm nhất khi đọc code, vì chúng nằm ở ba tầng khác nhau:

| Cơ chế | Khai ở đâu | Dùng cho | Thấy được trong Swagger? |
| --- | --- | --- | --- |
| `@RequiresPermission('code')` | Decorator trên route | Toàn bộ `/admin/**` | ✅ |
| ~~Allowlist username qua biến môi trường~~ | Đã gỡ — mọi đường quản trị nay đọc `admin_permissions` | — | ✅ |
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

Chỉ ba nơi trả **toạ độ thật**: `GET /posts/me` (bài của chính mình), `GET /posts/{postId}`
**khi người gọi chính là tác giả** (chốt 28/09), và vị trí mặc định trong hồ sơ riêng. Ở hai
nơi đầu, `isLocationApproximate` trả `false` để client biết đây là toạ độ chuẩn — chủ bài cần
thấy đúng chỗ mình đã ghim thì mới sửa cho khớp được.

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
| `PATCH` | `/auth/password` | Bearer | **Đổi mật khẩu khi đang đăng nhập** |
| `DELETE` | `/auth/account` | Bearer | Xoá mềm và ẩn danh dữ liệu cá nhân |
| `GET` | `/auth/me` | Bearer | Danh tính phiên hiện tại, đọc thẳng từ token |

**Điều cần biết**

- `POST /auth/refresh` là **công khai** có chủ đích: lúc gọi nó thì access token đã hết hạn
  rồi, đòi bearer token là bế tắc.
- `POST /auth/logout` lấy `userId` từ **access token chứ không từ body**. Tin body thì ai
  cũng đăng xuất hộ người khác được. Nó thu hồi phiên **và** ghi mốc vô hiệu access token —
  thiếu vế sau thì bấm "Đăng xuất" xong token cũ vẫn gọi API được tới 15 phút. Mốc ghi theo
  **tài khoản** chứ không theo thiết bị, nên máy khác của cùng người nhận một lần 401 rồi tự
  lấy token mới bằng refresh token của nó — phiên của họ không mất.
- `POST /auth/login` và `POST /auth/register` có **trần theo địa chỉ IP**, bù cho trần theo
  tài khoản. Trần tài khoản (5 lần sai / 15 phút) không chặn được người rải một mật khẩu phổ
  biến qua hàng nghìn username. Xem `MAX_LOGIN_ATTEMPTS_PER_IP` và `MAX_REGISTRATIONS_PER_IP`
  trong [CONFIG-INVENTORY](./CONFIG-INVENTORY.md). Trần đăng nhập **chỉ đếm khi sai**; trần
  đăng ký **chỉ đếm khi tạo được tài khoản**.
- `POST /auth/login` trả **401** cho sai mật khẩu và **403** cho tài khoản bị treo/khoá —
  nhưng chỉ sau khi đã so khớp mật khẩu. Trả trạng thái trước đó là biến màn đăng nhập thành
  công cụ dò xem username nào có thật và đang ở trạng thái gì.
- `POST /auth/refresh` chặn cả tài khoản **đang bị treo**, không chỉ bị khoá vĩnh viễn.
- `PATCH /auth/password` cần mật khẩu hiện tại, **không** cần OTP. Thu hồi toàn bộ phiên trên
  mọi thiết bị rồi **trả về cặp token mới** cho thiết bị đang gọi — không trả lại thì người
  dùng vừa làm đúng một việc nên làm đã bị đá ra khỏi app. Đặt lại đúng mật khẩu cũ bị từ
  chối. Đây là đường **duy nhất** đổi mật khẩu cho tài khoản chưa có kênh khôi phục đã xác
  minh.
- `POST /auth/password-reset/request`: bốn trường hợp trả về **giống hệt nhau** (kênh
  `ADMIN_SUPPORT`) — không có tài khoản, không có email/SĐT, **kênh chưa xác minh**, và tài
  khoản đã bị khoá vĩnh viễn. Phân biệt là biến endpoint này thành công cụ dò username có
  thật.
- **Chỉ kênh ĐÃ XÁC MINH mới nhận được mã.** Email vào hồ sơ chỉ bằng cách gõ vào; gõ nhầm
  một ký tự mà vẫn gửi mã tới đó là trao đường chiếm tài khoản cho người lạ. Muốn dùng email
  để khôi phục thì phải qua `PATCH /profile/me/email-verification/*` trước.
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
| `PATCH` | `/profile/me/email-verification/request` | Bearer | **Gửi OTP xác minh email hiện tại** |
| `PATCH` | `/profile/me/email-verification/confirm` | Bearer | **Xác nhận OTP, đánh dấu email đã xác minh** |
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
- **SĐT được nắn về E.164 trước khi lưu và trước khi so trùng.** `0912345678`,
  `+84912345678` và `091 234 5678` đều thành `+84912345678`. Không nắn thì index UNIQUE (so
  chuỗi) cho cả ba cùng lọt, và một SIM thành ba tài khoản.
- **Một SĐT chỉ xác minh được cho MỘT tài khoản, vĩnh viễn.** Bảng `verified_phones` giữ băm
  của số đã xác minh và sống lâu hơn tài khoản. Gỡ số khỏi hồ sơ hay xoá tài khoản **không**
  trả số lại — nếu trả thì một SIM quay vòng vô hạn để ăn 28đ + 224đ + thưởng giới thiệu. Thử
  xác minh lại bằng số của người khác trả `PHONE_ALREADY_VERIFIED` (409). Admin giải phóng số
  qua cột `released_at`; ⛔ chưa có endpoint cho việc đó.
- **Vị trí mặc định ≠ GPS hiện tại.** Vị trí mặc định là giá trị dùng khi đăng bài và là điều
  kiện bắt buộc để tạo Group; GPS chỉ dùng cho bản đồ tại thời điểm xem. Server **không tự
  ghi đè** vị trí mặc định từ GPS.
- Xác minh SĐT lần đầu thưởng điểm **đúng một lần**, đi qua Point Ledger với khoá idempotency
  `PHONE_VERIFIED_FIRST_TIME:<userId>`. Đổi SĐT rồi xác minh lại **không thưởng lại**.
- Xác minh **email** thì **không thưởng điểm** — nó không nằm trong danh sách onboarding đã
  chốt. Nó chỉ quyết định một việc: email đó có dùng làm kênh khôi phục mật khẩu được không.
- Cả hai luồng xác minh đều gửi tới giá trị **đang có trong hồ sơ**, không nhận địa chỉ hay số
  từ body. Khoá OTP của email gắn cả địa chỉ, nên đổi email giữa chừng thì mã cũ vô hiệu.
- **Đổi email hoặc SĐT thì mất dấu xác minh tương ứng.** Giữ lại là để dấu của giá trị cũ
  chứng thực cho giá trị mới — mà đó chính là cửa mở đường đặt lại mật khẩu.
- `emailVerified` và `phoneVerified` có trong `GET /profile/me` và trong `user` của mọi phản
  hồi đăng nhập/đăng ký.
- `GET /profile/me` trả thêm `accuracy` — độ chính xác mô tả khi tặng (F43) của **chính chủ**,
  gồm `percent`, `samples` và `minSamples`. **Không** có cờ `reviewRequired`: cờ đó là tín
  hiệu để Admin nhìn qua, không phải phán quyết. Hồ sơ **công khai** không có gì về accuracy.
- `avatarKey` không hợp lệ (không thuộc tài khoản, không phải ảnh, quá nặng) trả **400**, không
  còn là 500.

### Onboarding — `/onboarding`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/onboarding/tasks` | Bearer | Danh sách nhiệm vụ và tiến độ của chính chủ |
| `POST` | `/onboarding/tasks/evaluate` | Bearer | Chấm lại toàn bộ tiến độ |
| `POST` | `/onboarding/tasks/:key/trigger` | Bearer | Cũng chấm lại toàn bộ; `key` chỉ để client nói vừa làm xong việc gì |

- **Hai nhiệm vụ, cả hai đều BẮT BUỘC** (chốt 26/09): `PROFILE_COMPLETE` và `PHONE_VERIFIED`.
  Trước đó chỉ nhiệm vụ đầu bắt buộc, mà nó chỉ đòi bốn trường **có mặt** — nên tạo tài khoản
  ảo chỉ tốn công gõ, và mỗi tài khoản tự động nhận 224đ + lên hạng Thành viên + kích hoạt 56đ
  cho người mời.
- ⚠️ **Hệ quả:** không có adapter SMS thì **không ai hoàn tất được onboarding**.
- **Không cần gọi hai endpoint chấm điểm.** `PATCH /profile/me` và
  `PATCH /profile/me/phone-verification/confirm` đều tự ghi bằng chứng, và bằng chứng cuối
  cùng tự kích hoạt phần thưởng. Hai endpoint kia để client xem và chấm lại khi nghi lệch.
- `trigger` **kiểm `key`**: gõ sai tên nhiệm vụ trả 400. Trước 26/09 nó bỏ qua `key` hoàn
  toàn và vẫn trả 200.

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
| `POST` | `/posts` | Bearer | Tạo bài — lên thẳng `PUBLISHED`, không chờ duyệt |
| `GET` | `/posts/me` | Bearer | Bài của chính mình, lọc + phân trang |
| `GET` | `/posts/nearby` | Công khai | Quét bài quanh một toạ độ — lọc loại, danh mục, và **tìm theo từ khoá** |
| `GET` | `/posts/sos-urgent` | Công khai | Danh sách cứu trợ SOS — đúng truy vấn của `/posts/nearby` với `isSos` ghim `true` (SRS §19) |
| `GET` | `/posts/map` | Công khai | Marker trong khung bản đồ |
| `GET` | `/posts/:postId` | Công khai | Chi tiết một bài công khai |
| `GET` | `/posts/:postId/matches` | Bearer (chỉ tác giả) | Smart Match — gợi ý bài ghép đôi |
| `PATCH` | `/posts/:postId` | Bearer (chủ bài) | Sửa nội dung, danh mục, số lượng, giao nhận, SOS — **cấm khi có giao dịch sống** |
| `DELETE` | `/posts/:postId` | Bearer (chủ bài) | Xoá mềm — **cấm khi bài đang có lượt trao** |
| `POST` | `/posts/:postId/renew` | Bearer (chủ bài) | Gia hạn thêm 3 tháng, tối đa một lần |
| `POST` | `/posts/:postId/charity-transfer` | Bearer (chủ bài) | Xin chuyển vật phẩm về điểm từ thiện |
| `PATCH` | `/posts/:postId/charity-transfer` | `post.moderate` | Duyệt hoặc từ chối yêu cầu chuyển |
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

> **Quota là MỘT hạn mức `POST_OPEN` cho mọi loại bài** (chốt 26/09). Trước đó có
> `POST_OFFER` và `POST_WANTED` riêng, nhưng phép đếm vẫn là mọi bài đang mở bất kể loại —
> hai cái thước đo cùng một rổ, và đặt lệch nhau cho ra hành vi không giải thích được.
>
> **Không loại bài nào có cổng riêng** — kể cả `CHARITY`. Ai qua onboarding cũng đăng được
> cả năm loại.

Tác giả và trạng thái do **server quyết định**, không nhận từ client. Bài tạo ra ở
`PUBLISHED` và **hiện ngay** trên bảng tin; đồng hồ ba tháng cũng bắt đầu từ lúc đăng.

> **Chốt 26/09: không có duyệt trước.** Trước đó mọi bài đứng ở `PENDING_REVIEW` chờ một
> moderator. Nay đổi sang **hậu kiểm** — Admin gỡ bài qua `PATCH /admin/posts/:postId/moderation`
> khi có báo xấu hoặc tự rà. Đổi lại, một bài sai luật có mặt trên bảng tin cho tới khi có
> người gỡ; hàng đợi báo xấu vì thế là đường phát hiện chính, không còn là đường phụ.

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

`selectionMode` ([F79](./FEATURES.md#f79--chế-độ-tìm-người-nhận-selection-modes)) nhận `INSTANT` (chốt ngay phản hồi đầu tiên) hoặc `OPTIMAL` (mặc định, xét tới hết hạn rồi chọn). `EXTENDED` **đã bỏ** 11/10 (CHỐT-10) — 30 ngày mở rộng nay là bước TỰ ĐỘNG cho mọi bài chưa ghép được ai, không còn là ô trên form.

Hạn xét = **lúc đăng + 7 ngày**, đặt ngay khi bài lên công khai và cho cả `INSTANT`. Trước 11/10 nó chỉ được đặt khi có phản hồi đầu tiên, nên bài không ai xin thì không bao giờ tới hạn. Bài `OFFER` vì thế sống **37 ngày** (7 + 30) thay vì ba tháng.

**Áp cho cả `OFFER` và `WANTED` từ 11/10.** Với bài Muốn Nhận hai vai **đảo lại**: tác giả là người **nhận**, người phản hồi là người **cho** — một lời tặng cho bài `WANTED` chính là một hàng `gift_requests` mà `requester_id` là người sẽ đưa món đồ.

Vai do backend phân giải từ loại bài (`giftTransactionRoles`), không nhận từ client. `GET /transactions` vì thế luôn hiện đúng ai cho ai nhận, và điểm hoàn tất trả đúng người.

Bài `WANTED` đăng TRƯỚC 11/10 giữ hạn sống ba tháng đã hứa; chúng được cho một hạn xét nhưng không bị rút hạn sống.

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

> `OFFER.estimatedValue` là trường **tùy chọn**; bỏ trống được hiểu là 0 nên bài vẫn hoạt
> động nhưng không đổi điểm và bonus theo giá trị bằng 0. Backend hiện tính quote bằng
> `ceil`; contract đích dùng `round_half_up`, vì vậy implementation phải đồng bộ quote và
> POST trước khi app dựa vào kết quả. Xem
> [F74](./FEATURES.md#f74--giá-trị-tham-khảo--tỷ-lệ-quy-đổi-điểm).

### Sửa và gỡ bài — chặn khi đang có lượt trao

Cả hai trả **409 `POST_HAS_LIVE_TRANSACTION`**, nhưng từ 28/09 **hai đường dùng hai luật khác
nhau** — đọc kỹ chỗ này:

| Đường | Chặn theo | Nghĩa là |
| --- | --- | --- |
| `PATCH /posts/:postId`, `POST /media`, `DELETE /media/:id`, `PATCH /media/order` | **Giao dịch thật** trên bài: có `gift_transactions` nào ở `ACCEPTED`/`DELIVERING` | Bài chia lô còn hàng, vẫn `PUBLISHED`, nhưng đã duyệt một người → **vẫn chặn** |
| `DELETE /posts/:postId` | **Trạng thái bài** là `RESERVED`/`DELIVERING` | Giữ nguyên như 26/09 |

Vì sao `PATCH` phải siết hơn: bài `totalQuantity: 5` đã duyệt một người vẫn còn 4 suất nên
trạng thái vẫn là `PUBLISHED`. Luật cũ nhìn trạng thái nên cho sửa — người đã được duyệt đồng
ý "tủ lạnh còn tốt" rồi mở lại thấy "quạt cũ", với `CLASSIFIED` thì đổi được cả `price` sau
khi đã chốt người. Không bản ghi nào nói nội dung từng khác.

- **Yêu cầu ở `REQUESTED` KHÔNG chặn sửa.** Người mới bấm xin chưa được hứa hẹn gì; chặn ở đó
  là khoá bài chỉ vì có người ngó tới. Các yêu cầu đang chờ **được giữ nguyên** qua lượt sửa,
  kể cả mốc thời gian xếp hàng — xoá rồi tạo lại là đẩy họ xuống cuối hàng.
- **Kiểm dưới row lock.** `lockEditablePost` khoá `pessimistic_write` đúng hàng post rồi mới
  hỏi giao dịch — cùng khoá mà cấp phát kho đang dùng. Không có nó thì duyệt-và-sửa chạy song
  song vẫn lọt qua khe.
- **Trạng thái kết thúc và bài hết hạn** trả `POST_INVALID_STATE`. Chỉ `DRAFT`,
  `PENDING_REVIEW`, `PUBLISHED` và còn hạn mới sửa được.
- **`POST /posts/:postId/media/upload` chỉ kiểm trạng thái bài**, không khoá hàng và không hỏi
  giao dịch — nó mới chỉ cấp presigned URL. Cổng thật là bước gắn ảnh; xin được URL mà không
  gắn được thì cùng lắm sinh một object mồ côi, và `media:sweep-orphans` đã lo phần đó.

**Những gì chủ bài sửa được** (chốt 28/09): nội dung (`title`, `description`, `areaLabel`, vị
trí), `categoryId`, `totalQuantity`, `isSos`, `deliveryMethod`, `shipPayer`, và trường riêng
theo loại. `postType`, `status`, `authorId` và hạn đăng vẫn do server giữ.

| Trường | Chỉ áp dụng cho | Kiểm thêm |
| --- | --- | --- |
| `price`, `negotiable` | `CLASSIFIED` | — |
| `estimatedValue` | `OFFER` | — |
| `condition` | `OFFER` và `CLASSIFIED` | — |
| `categoryId` | mọi loại | Danh mục phải tồn tại và đang bật, nếu không `CATEGORY_NOT_FOUND` |
| `isSos` | mọi loại | Bật lên cần quyền `POST_SOS`, nếu không `POST_SOS_NOT_ALLOWED` |

Sửa nội dung được **ghi audit**.

Hai trạng thái `RESERVED`/`DELIVERING` trùng đúng danh sách mà xoá tài khoản và hậu kiểm của
Admin đã chặn.

Gỡ bài thành công thì **mọi yêu cầu còn ở `REQUESTED` được đóng** (`CANCELLED`, kèm lý do) và
người xin nhận thông báo `GIFT_TRANSACTION_CLOSED`. Không đóng thì họ không bao giờ nhận được
câu trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần "yêu cầu đang mở" của họ.

### Vòng đời bài — hết hạn và gia hạn

Hạn 3 tháng đặt **lúc đăng** — từ 26/09 bài lên thẳng nên không còn khoảng chờ duyệt để mà
tách hai mốc ra.

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

- **Không mặc định lọc về trạng thái công khai.** Chủ bài phải thấy được bài bị Admin gỡ
  (`REJECTED`) và bài đã `EXPIRED` của mình. Truyền `?status=` để lọc hẹp lại.
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
- Mỗi gợi ý kèm `media[]` cùng hình dạng với `/posts/nearby` (chốt 27/09). Ảnh chỉ nạp cho các
  bài **đã lọt vào kết quả sau khi xếp hạng và cắt** — nạp cho cả rổ ứng viên rồi vứt phần lớn
  là kéo về đúng thứ vừa quyết không trả.
- Mỗi gợi ý cũng kèm `author` cùng bộ trường với `/posts/nearby` (chốt 28/09), nạp theo đúng
  quy tắc trên: sau khi cắt, và khử trùng id.

### Ảnh bài đăng — luồng ba bước

> **Presigned URL ký cả `Content-Length`.** Khai 1 KB rồi PUT 500 MB sẽ nhận **403** và object
> không hề được tạo — trước 26/09 con số khai lên chỉ là lời khai, nên bất kỳ tài khoản nào
> cũng bơm được dung lượng tuỳ ý. Client phải gửi đúng số byte đã khai.
>
> **Xác nhận thất bại thì object bị xoá** — trừ khi key không thuộc người gọi, lúc đó tuyệt
> đối không xoá: object đó của người khác.
>
> Object mồ côi (xin URL rồi bỏ ngang) do `media:sweep-orphans` dọn, mặc định chạy khô.

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
- **Thống kê tương tác**: Trả về `reactionCount` (tổng người đã bày tỏ, mọi loại), `myReaction` (loại của caller, `null` khi chưa bày tỏ hoặc chưa đăng nhập) và `reactionBreakdown` (số lượt từng loại, đủ để hiện mấy biểu tượng dẫn đầu như Facebook).
- **Toạ độ cho chính chủ (chốt 28/09)**: Khi `currentUserId == authorId`, response trả **toạ độ
  THẬT** và `isLocationApproximate: false`. Mọi người khác vẫn nhận toạ độ đã làm nhiễu. Chủ bài
  không thấy đúng chỗ mình ghim thì không sửa cho khớp được.
- **`canEdit` (chốt 28/09)**: `true` khi người gọi là tác giả, bài ở `DRAFT`/`PENDING_REVIEW`/
  `PUBLISHED`, chưa hết hạn, và **không có giao dịch `ACCEPTED`/`DELIVERING`** nào. Đây chỉ là
  gợi ý để client ẩn nút Sửa — **lúc lưu server vẫn kiểm lại dưới row lock**, vì giữa lúc mở
  màn hình và lúc bấm Lưu có thể đã có người được duyệt.

### Tương tác — cảm xúc, bình luận, chia sẻ

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `PUT` | `/posts/:subjectId/reactions/me` | `REACT_CONTENT` | Đặt hoặc đổi cảm xúc: `LIKE`/`LOVE`/`CARE`/`WOW`/`SAD` — **đây cũng là nút thích**. Không có trần |
| `DELETE` | `/posts/:subjectId/reactions/me` | `REACT_CONTENT` | Gỡ cảm xúc của chính mình |
| `GET` | `/posts/:subjectId/reactions` | Công khai | Ai đã bày tỏ, phân trang, lọc theo `kind` |
| `PUT` | `/comments/:subjectId/reactions/me` | `REACT_CONTENT` | Cảm xúc trên **bình luận** |
| `DELETE` | `/comments/:subjectId/reactions/me` | `REACT_CONTENT` | Gỡ cảm xúc trên bình luận |
| `POST` | `/posts/:subjectId/comment-media/upload-url` | `COMMENT_CONTENT` | Xin presigned URL cho ảnh đính kèm bình luận |
| `POST` | `/posts/:subjectId/comments` | `COMMENT_CONTENT` | Bình luận hoặc trả lời (`parentId`) — **tối đa 10 lượt/phút và 200 lượt/24 giờ** |
| `GET` | `/posts/:subjectId/comments` | Công khai | Cây bình luận gốc, phân trang |
| `GET` | `/comments/:commentId/replies` | Công khai | Trả lời của một bình luận |
| `PATCH` | `/comments/:commentId` | Bearer (chủ bình luận) | Sửa trong **cửa sổ 15 phút** |
| `DELETE` | `/comments/:commentId` | Bearer (chủ bình luận) | Gỡ — giữ chỗ trong cây, không trả nội dung lẫn ảnh |
| `POST` | `/posts/:subjectId/shares` | Bearer | Ghi một lượt chia sẻ — **chờ 1 giờ cho mỗi bài** |

**Điều cần biết**

- ⚠️ **Không còn `POST /posts/:postId/like`, `likeCount` hay `isLiked`** (đổi 26/09). Giao diện
  chỉ có MỘT nút — chạm là `LIKE`, giữ thì chọn loại khác — nên nó cũng chỉ cần một đường ghi
  và một con số. Chạm nút gọi `PUT …/reactions/me` với `kind: "LIKE"`; chạm lần nữa để bỏ thì
  gọi `DELETE …/reactions/me`. `isLiked` cũ nay là `myReaction === "LIKE"`.
- **`content_reactions` là nguồn sự thật duy nhất**, và `posts.reaction_count` là con số duy
  nhất: tổng người đã bày tỏ, **bất kể loại**. Đổi `LIKE → LOVE` KHÔNG làm nó nhúc nhích — vẫn
  là một người, chỉ đổi cách bày tỏ. Cột `posts.like_count` đã bị gỡ.
- **Muốn hiện mấy biểu tượng dẫn đầu** thì dùng `reactionBreakdown` trong `GET /posts/:postId`
  (`{"LIKE": 8, "LOVE": 4}`). Bảng tin chỉ trả `reactionCount` + `myReaction` — nhóm theo loại
  cho từng bài trong một trang 20 bài là 20 lần GROUP BY cho một thứ không ai nhìn kỹ.
- **Bộ lọc từ ngữ có hai mức.** Mức `BLOCK` trả 400 và **không ghi gì**; mức `REVIEW` vẫn ghi
  nhưng đặt `PENDING_REVIEW`, ẩn khỏi công khai và đẩy vào hàng đợi Admin. Danh sách từ là
  **cấu hình động** (`system_configs`, khoá `moderation.blocked_terms`), không phải hằng số
  trong mã — Admin sửa được mà không cần deploy.
- **Tác giả thấy bình luận `PENDING_REVIEW` của chính mình**, người khác không thấy. Ẩn cả với
  tác giả thì họ tưởng hệ thống nuốt mất và gõ lại lần nữa.
- **Sửa bình luận đi lại đúng bộ lọc đó**, và `comment_count` / `reply_count` đi theo trạng
  thái mới — không thì con số nói dối cho tới lần Admin xử.
- **Hai trần cho bình luận** (26/09): **10 lượt/phút** chặn TỐC ĐỘ, **200 lượt/24 giờ** chặn
  TỔNG. Cổng quyền `COMMENT_CONTENT` là boolean, không mang hạn mức, nên trước đó không gì chặn
  một người gõ liên tục. Thiếu trần ngày thì gõ đều mười cái mỗi phút suốt ngày vẫn ra 14.400
  bình luận. Vượt trần nào cũng trả **429** kèm số giây phải chờ; trần ngày được hỏi **trước**
  để con số giây trả về là thật. Cửa sổ 24 giờ tính từ bình luận đầu tiên của đợt, không phải
  từ 0 giờ. Suất chỉ bị trừ **sau khi** bình luận ghi xong — bình luận bị bộ lọc chặn thẳng
  không tiêu mất một suất.
- **Trần ngày của rule điểm là chuyện khác.** `POST_COMMENTED` chỉ thưởng 10 lượt/ngày, nhưng
  bình luận thứ 11 vẫn đăng được — nó chỉ không có điểm. Làm bẩn bảng tin và farm điểm là hai
  vấn đề, cần hai cái trần.
- **`share_count` đếm theo LƯỢT, không theo người** (chốt 26/09) — một người chia sẻ hai lần ở
  hai thời điểm là hai lượt thật. Vì thế phải có **khoảng chờ 1 giờ**, khoá theo **cả người lẫn
  bài**: không có gì khác tự chặn việc gọi endpoint một nghìn lần. Khoá theo mình người thì
  chia sẻ mười bài khác nhau trong một phút cũng bị chặn, mà đó là hành vi bình thường.
- **Chia sẻ trả đường dẫn tương đối.** `share.deepLinkPath` luôn có; `share.shareUrl` tuyệt đối
  chỉ có khi `WEB_PUBLIC_BASE_URL` đã cấu hình, còn không thì `null` — ghép tên miền hộ client
  là sinh ra link chết khi đổi môi trường. `share.shareCount` là tổng sau lần ghi này.
- **Thông báo:** bình luận gốc báo chủ bài, trả lời báo tác giả bình luận cha (người đó cũng là
  chủ bài thì **chỉ một** thông báo), không bao giờ tự báo chính mình, và bình luận
  `PENDING_REVIEW` **không** báo. Cảm xúc chỉ báo **lần đầu trong ngày** theo giờ
  `Asia/Ho_Chi_Minh` — một bài 200 lượt mà báo 200 lần thì tác giả tắt thông báo, và mất luôn
  thông báo về lượt xin nhận.
- **Điểm F41 đã BẬT** (26/09): `POST_COMMENTED` +2đ trần 10 lượt/ngày, `POST_REACTED` +1đ trần
  20 lượt/ngày — tối đa 40đ/người/ngày vào `balance`. `affects_lifetime = false` nên **không đẩy
  hạng**: `lifetime` là sàn của Rank, và cho bình luận đẩy hạng thì gõ 300 dòng "hay quá ạ" là
  lên Bạc trong khi tặng một món đồ thật được 56 điểm. Không thưởng khi tương tác với bài của
  chính mình. Chạm trần **không** làm hỏng việc bình luận: việc người đó vừa viết một câu là sự
  thật, thưởng bao nhiêu chỉ là chính sách.
- **Cảm xúc KHÔNG có trần gọi**, và đó là chủ ý. Điểm đã an toàn sẵn: khoá chống trùng của
  `POST_REACTED` là `(bài, người)` nên gỡ rồi thả lại không được thưởng lần hai; thông báo cũng
  chỉ một lần mỗi ngày mỗi bài. Chỗ duy nhất còn tốn là ghi database, và nó được xử bằng cách
  **không ghi**: gửi đúng loại người đó đang để thì câu upsert mang
  `WHERE kind IS DISTINCT FROM EXCLUDED.kind`, nên Postgres không sinh phiên bản dòng mới, không
  sinh WAL, không để lại dòng chết. Client gửi trùng — chạm hai lần, retry khi mạng chập chờn,
  hai thiết bị cùng đồng bộ — nay là miễn phí, và **không ai bị trả về 429**.
- **Báo xấu một bình luận** đi chung `POST /reports` với `targetType: COMMENT`, không có
  endpoint riêng.

### Xin nhận đồ — `/posts/:postId/requests`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts/:postId/requests` | Bearer | Gửi yêu cầu xin nhận, kèm lời nhắn tối đa 500 ký tự |
| `POST` | `/posts/:postId/requests/withdraw` | Bearer | Rút yêu cầu của chính mình — được cả khi đang `STANDBY` |
| `GET` | `/requests/me` | Bearer | **Yêu cầu của chính tôi**, kèm tiêu đề + ảnh + trạng thái bài |
| `GET` | `/posts/:postId/requests` | Bearer (chỉ tác giả) | Danh sách người xin, có phân trang |
| `POST` | `/posts/:postId/requests/:requestId/reject` | Bearer (chỉ tác giả) | **Từ chối** một yêu cầu đang `PENDING`/`STANDBY` |
| `POST` | `/posts/:postId/requests/:requestId/accept` | Bearer (chỉ tác giả **và** đủ hạng) | Duyệt một người xin — xem khung dưới |
| `POST` | `/posts/:postId/batch-accept` | Bearer (chỉ tác giả **và** đủ hạng) | Duyệt **nhiều** người trong MỘT transaction — hoặc hết, hoặc không ai |

> **Chọn tay đòi quyền `SELECT_REQUESTER`, từ 11/10 (CHỐT-10).** Mặc định chỉ **Kim Cương**
> được tự chọn người nhận; bậc dưới nhận `SELECT_REQUESTER_NOT_ALLOWED` (403) và hệ thống tự
> chọn khi hết hạn xét.
>
> Tới 10/10 **không đường nào kiểm quyền này**: capability đã seed đủ năm bậc mà không chỗ nào
> đọc, nên mọi chủ bài đều chọn tay được, kể cả Người xem.
>
> Ba điều client cần biết:
>
> - Cổng áp cho **cả hai** endpoint. Chọn một người qua `batch-accept` với lô một phần tử cũng
>   bị chặn — nếu không thì cổng ở `accept` thành vô nghĩa.
> - **Từ chối thì không bị chặn.** `POST /posts/:postId/requests/:requestId/reject` và việc xem
>   danh sách ứng viên vẫn mở cho mọi bậc: đặc tả nói rõ đó là quyền khác, và không được dùng
>   để lách quyền chọn.
> - Quyền kiểm bằng **hạng hiện tại trong database**, không đọc hạng trong token — token sống
>   tới hạn refresh, nên người vừa tụt hạng vẫn mang hạng cũ trong tay.
>
> Bên A đổi được ngưỡng qua bảng quyền theo bậc mà không cần deploy.
| `POST` | `/posts/:wantedPostId/offer-gift` | Bearer | Chủ động tặng cho một bài Muốn Nhận, kèm được một bài Muốn Tặng của chính mình |
| `GET` | `/posts/:postId/redemption-quote` | Bearer (người xin) | Xem giá đổi và lý do không đổi được; hiện luôn 200, không giữ hàng/điểm |
| `POST` | `/posts/:postId/redeem` | Bearer (người xin) | Dùng điểm chốt ngay. Body đòi `confirmedPoints` — số điểm đã thấy ở báo giá. Trừ điểm và chốt người nhận trong **một** transaction; có sàn giữ hạng, xác nhận lại khi giá đổi, và hoàn điểm nếu lượt trao bị huỷ |

#### Đổi vật phẩm bằng điểm — contract hiện tại và đích

Chỉ người đã gửi request mới được đổi khi bài `PUBLISHED` và
`selection_deadline > now()`. Bài không tồn tại/chưa xin/đồng hồ không chạy được gộp
`NOT_AVAILABLE` để tránh lộ sự tồn tại của bài. Thiếu `estimatedValue` là
`NO_ESTIMATED_VALUE`. Quote trả `points`, `estimatedValueVnd`, `vndPerPoint`, `redeemable`,
`unavailableReason`, `balancePoints`, `reservedForRankPoints`, `availablePoints`,
`missingPoints` trong `body.quote`. Hiện `redeemable` có thể `true` dù
`unavailableReason=INSUFFICIENT_POINTS`; client không được chỉ nhìn `redeemable` để bật CTA.
POST thành công trả `postId`, `transactionId`, `pointsSpent`, `balanceAfter`.

> ✅ **Làm tròn NỬA-LÊN, đổi 12/10.** SRS CHỐT-13: *"Số điểm làm tròn với phần lẻ từ 0,5 trở
> lên làm tròn lên, dưới 0,5 làm tròn xuống."* Tới 11/10 giá đổi dùng `Math.ceil`, nên 1.001
> VNĐ ở tỷ lệ 1.000 ra **2** điểm; nay ra **1**.
>
> Lý do đổi không chỉ là chữ trong đặc tả: `value_bonus` đã làm tròn nửa-lên từ CHỐT-14, nên
> hai luật khác nhau làm một món 1.001 VNĐ **tốn 2 điểm để đổi mà chỉ sinh 1 điểm thưởng** —
> một khoảng lệch không chỗ nào giải thích được. Có một phép kiểm canh hai công thức nói cùng
> một con số.
>
> **Hệ quả cho client:** `PRICE_BELOW_ONE_POINT` từ chỗ gần như không xảy ra trở thành đường
> chạy thật. Một món 500 VNĐ ở tỷ lệ 2.000 ra 0 điểm và **không đổi được** — đổi được mà không
> mất gì là một lỗ hổng, không phải một ưu đãi. Client đừng tự chia để đoán giá.

> ✅ **Giá đổi giữa lúc xem và lúc bấm thì phải XÁC NHẬN LẠI, từ 11/10 (CHỐT-10 mục 2).**
>
> `POST /posts/:postId/redeem` nay có **body bắt buộc**:
>
> ```json
> { "confirmedPoints": 500 }
> ```
>
> Chép nguyên `quote.points` vừa đọc, **không tự tính**. Lệch với giá máy chủ tính lại thì
> `409 REDEMPTION_QUOTE_STALE`, kèm cả hai con số trong thông điệp, và **không trừ điểm**.
> Client đọc lại báo giá, hiện giá mới, rồi để người dùng quyết lần nữa.
>
> **Đây là một thay đổi phá vỡ**: lệnh đổi không gửi body sẽ nhận `400 VALIDATION_FAILED`.
> Trường này bắt buộc chứ không tuỳ chọn — một phép xác nhận bỏ qua được bằng cách không gửi
> trường nào thì không phải phép xác nhận, và hành vi cũ (tính lại theo giá mới rồi trừ luôn)
> lại quay về nguyên vẹn.
>
> Hai thứ làm giá đổi, và **cả hai đều ngoài tay người đổi**: chủ bài sửa `estimatedValue`,
> hoặc Admin đổi `point.redemption.vndPerPoint` — lần sau áp cho mọi bài cùng lúc.
>
> So theo **số điểm**, không theo giá trị và tỷ lệ riêng: điểm là con số người dùng thật sự
> đồng ý trả, và là nơi hai đầu vào kia gộp lại. Giá tăng 1 đồng mà số điểm không đổi thì
> không có gì cần xem lại, và chặn lúc đó chỉ dạy người ta bấm lại mà không đọc.
>
> Giá **rẻ đi** cũng bị chặn. Trừ ít hơn số đã đồng ý nghe như một món quà, nhưng nó nghĩa là
> màn hình người dùng đang nói sai về món đồ — và lần sau giá có thể đi hướng kia.
>
> `409` này đứng **trước** `REDEMPTION_INSUFFICIENT_POINTS`: báo "cần 1.000 điểm, bạn có 300"
> là nhắc một con số người dùng chưa từng thấy, và đẩy họ đi nạp điểm cho một cái giá họ có
> thể sẽ không đồng ý.

> ✅ **Trừ điểm và chốt người nhận NGUYÊN TỬ, từ 12/10.** SRS CHỐT-13: *"Debit/ledger/chốt
> người/giao dịch/dừng xét phải nguyên tử và chống trùng."*
>
> Tới 11/10 đây là hai transaction: trừ trước, duyệt sau, và duyệt hỏng thì ghi một bút toán
> hoàn bù `ITEM_REDEMPTION:REFUND:<requestId>`. Khoản bù ấy đúng về **số** nhưng không đúng về
> **trạng thái**, và hai điều cụ thể: giữa hai transaction có một khoảng người đổi đã mất điểm
> mà chưa có suất — `GET /points/me/ledger` của họ nói một điều sai trong khoảng ấy; và nếu
> tiến trình chết đúng khoảng ấy (deploy, OOM, mất kết nối) thì khoản bù **không bao giờ** được
> ghi và không có job nào quét lại.
>
> Nay khoản trừ ghi trong chính transaction mà lượt duyệt mở, **sau** mọi phép kiểm của nó. Hết
> hàng hay bị xen ngang thì ném trước khi có bút toán nào, nên đường hoàn bù biến mất cùng lý
> do tồn tại của nó — khoá `ITEM_REDEMPTION:REFUND:<requestId>` **không còn được ghi nữa**
> (bút toán cũ của dữ liệu cũ vẫn nằm đó, vô hại). Khoản hoàn khi **huỷ** lượt trao là chuyện
> khác và vẫn còn: nó đi qua `REVERSAL:<entryId>`.
>
> Hệ quả cho client: không có. Phản hồi và mã lỗi y nguyên; chỉ những trạng thái nửa vời biến
> mất.

> ✅ **Sàn giữ hạng đã CHẶN, từ 11/10 (CHỐT-13).** Chỉ tiêu được
> `availablePoints = max(0, balancePoints - reservedForRankPoints)`, với
> `reservedForRankPoints` là ngưỡng của bậc đang giữ, đọc từ `rank_tiers`. Phép chặn nằm ở
> **cả** quote và `POST .../redeem` — quote là xem trước, chỗ cho phép là chỗ trừ điểm.
>
> `missingPoints` so với `availablePoints`, **không** với `balancePoints`. Client nên hiện cả
> hai con số: *"bạn có 1.000 điểm, dùng được 104 — 896 điểm giữ hạng Vàng"*. Hiện mỗi số dư
> rồi báo không đủ điểm là một câu người dùng không giải thích được.
>
> **`wouldDemote` và `rankAfter` đã bị GỠ.** Hai trường đó là giao diện của F76: client được
> cảnh báo rồi tự quyết. CHỐT-13 bỏ quyền quyết đó, nên một lượt đổi được thì không bao giờ
> tụt hạng — hai trường thành hằng số, và một trường hằng trong contract là một trường client
> phải đọc tài liệu để biết là bỏ qua được.
>
> Bảng bậc chưa seed thì `availablePoints` là **0** (fail-closed): "không biết ngưỡng" mà vẫn
> cho tiêu là âm thầm bỏ đúng cái bảo vệ này.

> **Huỷ lượt trao đổi-bằng-điểm thì điểm được hoàn (CHỐT-13, 11/10).** Không có endpoint mới:
> cả `POST /transactions/:id/cancel` và `POST /transactions/:id/reports/ship-unpaid` đều tự hoàn khi
> lượt trao được đóng đến từ đổi điểm. Số hoàn là **đúng `delta` của bút toán trừ gốc**, không
> tính lại theo tỷ lệ hiện tại, và chỉ hoàn một lần dù hai đường gọi cùng lúc.
>
> Khoản phạt không-trả-ship là bút toán RIÊNG và vẫn giữ: nó phạt việc không trả ship, không
> phải việc lượt trao bị đóng. Lượt trao đi đường duyệt thường (không qua đổi điểm) thì không
> có gì để hoàn, và đó là đường phổ biến nhất nên nó im lặng.
>
> Phản hồi của hai endpoint **không đổi**: nó không báo số điểm đã hoàn. Client đọc số dư mới
> qua `GET /points/summary` hoặc sổ điểm. Thêm trường vào đây sẽ buộc nó phải chờ một bút toán
> ở transaction khác, và một lỗi khi hoàn sẽ làm lượt huỷ trông như thất bại.

**Còn lại của mục 2:** quote stale do đổi giá/tỷ lệ phải bắt xác nhận lại, không âm thầm trừ
giá mới. Xem [handoff và acceptance tests](./plan/REDEMPTION-REQUIREMENT-GAP.md).

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
- **Một lượt bàn giao chỉ trừ kho một lần.** Người nhận đã có lượt trao đang mở trên bài này thì
  duyệt tiếp bị từ chối, thay vì trừ kho lần nữa.
- `requestCount` hiển thị công khai **không đếm** yêu cầu đã rút, huỷ hoặc bị từ chối.

---

## 6. Khám phá — `/discovery`, `/posts/nearby`, `/posts/map`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/discovery/config` | Công khai | Giới hạn bán kính, phân trang và loại bài mà khách xem được |

Khách chưa đăng nhập dùng được cả ba. `discovery/config` tồn tại để client **không hardcode**
giới hạn — đổi trần bán kính ở server là client tự theo.

`/posts/nearby` nhận `postType` **tuỳ chọn** — bỏ trống thì trả feed trộn cả năm loại (chốt
26/09; trước đó bắt buộc, nên client muốn feed trộn phải gọi năm lần rồi tự ghép mà mỗi lần
phân trang riêng nên ghép xong thứ tự vô nghĩa).

`/posts/nearby` trả kèm `media[]` cho từng bài (chốt 27/09) — đúng hình dạng đã dùng ở
`/posts/me` và `/posts/{postId}`: `{ id, url, sortOrder }`, sắp sẵn theo `sortOrder`, và **luôn
là mảng** (bài chưa có ảnh trả `[]`, không bỏ trống trường). Ảnh của cả trang lấy trong **một
truy vấn** gộp theo `postId` rồi chia về từng bài; hỏi từng bài là 20 lượt đi database mỗi lần
cuộn feed.

`/posts/nearby` trả kèm `author` cho từng bài (chốt 28/09) — đúng bộ trường công khai của
`IPostAuthorDto`, cùng khuôn với `/posts/{postId}`:

```json
"author": { "id": "...", "username": "sondeptrai", "avatarUrl": "https://...",
            "rank": "MEMBER", "joinedAt": "2026-09-17T17:59:10.190Z" }
```

- **Không bao giờ có `fullName`, `phone` hay `address`.** Feed là kênh công khai, khách chưa
  đăng nhập cũng quét được — lộ ở đây là lộ cho cả internet. Thông tin liên lạc chỉ đi qua
  `contactInfo` của `/posts/{postId}`, và chỉ cho receiver đã được chọn.
- Tác giả **đã xoá tài khoản vẫn hiện username**; `avatarUrl` về `null`. Xoá tài khoản là xoá
  mềm có ẩn danh, cố ý giữ username để không ai đăng ký đúng tên đó rồi mạo danh trong lịch sử
  giao dịch cũ.
- `null` chỉ khi hàng user không còn tồn tại — trả `null` còn hơn làm vỡ cả trang feed.
- Một truy vấn cho cả trang, và **id tác giả được khử trùng trước khi hỏi**: một người đăng năm
  bài trên cùng trang vẫn chỉ là một hàng trong bảng `users`.

`/posts/map` nhận khung bbox và trả **CỤM theo ô lưới** (chốt 26/09):

- `clusters[]` — mỗi ô có `cellKey`, `count`, `location`, và `marker` (chỉ khi `count === 1`).
- `total` — **số bài thật** trong khung nhìn, đếm trước khi cắt.
- `cellSizeDegrees` — cỡ ô đang dùng, client cần để vẽ vùng cụm.
- `truncated` — `true` khi số ô vượt trần 500.

Cỡ ô = bề ngang khung nhìn chia 16, **lượng tử về luỹ thừa của 2** và lưới neo vào gốc toạ độ
— nhờ vậy kéo bản đồ ngang thì cụm đứng yên, chỉ khi phóng to/thu nhỏ mới đổi cỡ ô. Chia đều
theo khung nhìn sẽ khiến cụm nhảy chỗ mỗi lần kéo dù không bài nào đổi.

Ô nhiều bài vẽ ở **tâm ô**, không phải trọng tâm các bài: trọng tâm của hai bài cùng một địa
chỉ chính là địa chỉ đó. Ô một bài dùng toạ độ đã làm nhiễu như mọi chỗ khác.

> ⚠️ **Đổi hợp đồng API.** Trước 26/09 response là `markers[]` — từng bài, **cắt cứng ở 200**,
> không `total`, không cờ báo. Khu đông bài thì client nhận 200 marker "nào đó" và người dùng
> zoom ra thấy bản đồ thưa hơn lúc zoom vào. Client phải sửa theo hình dạng mới.

Cả hai đều áp quy tắc làm nhiễu toạ độ ở §1.

### Tìm kiếm — tham số của feed, không phải endpoint riêng

`GET /posts/nearby?keyword=nồi cơm điện`

- **Không phân biệt dấu**: gõ `noi com dien` vẫn ra `Nồi cơm điện`. Dùng `unaccent` bọc trong
  một hàm IMMUTABLE để index được, và có index GIN `IDX_posts_search` trên đúng biểu thức đó.
- **Luôn trong bán kính đang xem.** Đây là sàn cho–nhận: tìm ra một món cách 800 km là tìm ra
  một món không ai tới lấy được.
- **Chồng được với mọi bộ lọc khác** — loại bài, danh mục, bán kính, phân trang.
- **Mọi từ phải cùng xuất hiện**, và khớp theo **từ trọn vẹn**: `nồi cơ` không ra `nồi cơm`.
- Tìm trong **tiêu đề và mô tả**. Độ dài 2–100 ký tự; ký tự lạ không làm vỡ truy vấn.

### Thứ tự và phân trang

`ORDER BY` khoảng cách, rồi **`post.id`** làm tiebreak. Thiếu tiebreak thì hai bài cùng khoảng
cách không có thứ tự đảm bảo giữa hai lần chạy, và lật trang bằng `OFFSET` sẽ **lặp bài hoặc
bỏ sót bài**.

### Gốc toạ độ: toạ độ gửi lên, hoặc Vị trí mặc định khi được YÊU CẦU

`lat`/`lng` của `/posts/nearby` là **tuỳ chọn** ([F26](./FEATURES.md#f26--gps-hiện-tại--dự-phòng-default-location)):

| Gửi gì | Server làm gì | `originSource` |
| --- | --- | --- |
| Cả `lat` và `lng` (kèm `radiusMeters`) | Dùng đúng toạ độ đó (kể cả khi kèm `useDefaultLocation`) | `REQUEST` |
| `useDefaultLocation=true`, đã đăng nhập, có Vị trí mặc định | Lọc quanh Vị trí mặc định; `radiusMeters` tuỳ chọn | `DEFAULT_LOCATION` |
| `useDefaultLocation=true`, chưa đăng nhập hoặc **chưa** đặt Vị trí mặc định | `DISCOVERY_ORIGIN_UNAVAILABLE` (400) | — |
| Không gửi toạ độ, không gửi `useDefaultLocation` | **Trả toàn bộ**, không đọc hồ sơ, không lọc bán kính | `ALL` |
| Chỉ một trong hai toạ độ | `DISCOVERY_ORIGIN_UNAVAILABLE` (400) | — |
| Có toạ độ nhưng thiếu `radiusMeters` | `VALIDATION_FAILED` (400) | — |

> ⚠️ **Đổi hợp đồng API (21/10).** Trước đây server **tự** lùi về Vị trí mặc định khi người
> đăng nhập không gửi toạ độ, nên cùng một lời gọi trả khác nhau tuỳ hồ sơ có đặt vị trí hay
> chưa, và client không gửi gì vẫn bị lọc quanh một điểm nó không hề chọn. Giờ lọc quanh Vị
> trí mặc định phải được **yêu cầu** bằng `useDefaultLocation=true`. Client đang dựa vào việc
> tự lùi thì thêm cờ này; không thêm thì nhận `ALL`.

Ở nhánh `ALL`:

- `radiusMeters` **tuỳ chọn** và bị bỏ qua. Có toạ độ thì nó vẫn bắt buộc.
- `distanceMeters` của mọi bài là **`null`**, không phải `0` — `0` đọc ra là "cách bạn 0 mét".
- Thứ tự là **`created_at DESC`, rồi `id ASC`** thay cho khoảng cách. Vẫn phải có tiebreak
  bằng khoá chính, nếu không lật trang bằng `OFFSET` sẽ lặp bài hoặc bỏ sót bài.
- Toạ độ vẫn bị làm nhiễu và `isLocationApproximate` vẫn `true`.

> ⚠️ **Đổi hợp đồng API.** Trước 27/09 hai dòng `ALL` ở trên là **400**. Client đang bắt lỗi
> `DISCOVERY_ORIGIN_UNAVAILABLE` để hiện màn "hãy bật GPS" sẽ không còn nhận được lỗi đó —
> giờ nhận 200 kèm danh sách. Kiểu của `distanceMeters` cũng nới thành `number | null`.

Response **luôn** trả `originSource`. Giao diện cần nó để nói "đang tìm quanh vị trí mặc định
của bạn", hoặc "đang xem tất cả, bật GPS để tìm quanh đây" — lùi sang một phạm vi khác mà im
lặng là đổi kết quả sau lưng người dùng.

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

### Điểm danh và streak (F83) — ĐANG CHẠY từ 02/10

Contract của [F83](./FEATURES.md#f83--điểm-danh-ngày-streak-và-điểm-danh-bù-bổ-sung-30092026),
hiện thực 02/10. Swagger và mã lỗi sinh từ code như mọi endpoint khác.

**Tính năng ship ở trạng thái TẮT.** Chưa Admin nào publish policy thì
`GET /check-ins/me` trả `enabled: false` và mọi đường ghi trả
`CHECK_IN_POLICY_UNAVAILABLE` — **không có mặc định nào phát điểm**, theo đúng
yêu cầu của đặc tả. Bên A chốt năm con số (điểm ngày, điểm từng mốc, số giao dịch
đổi một lượt bù, cửa sổ bù, có/không giới hạn lượt tích trữ) rồi Admin publish
qua `PUT /admin/check-in-policy` thì tính năng mới chạy.

| Method | Đường dẫn | Quyền | Kết quả chính |
| --- | --- | --- | --- |
| `GET` | `/check-ins/me` | Bearer | Ngày nghiệp vụ, trạng thái hôm nay, streak, mốc tới, lượt bù và tiến độ giao dịch |
| `GET` | `/check-ins/me/history?page=&pageSize=` | Bearer | Lịch phân trang của chính user, ngày thường/bù, điểm và khả năng bù |
| `POST` | `/check-ins` | Bearer | Body `{ "checkIn": {} }`; điểm danh hôm nay, điểm ngày và thưởng mốc nếu đạt |
| `POST` | `/check-ins/repairs` | Bearer | Body `{ "repair": { "date": "YYYY-MM-DD" } }`; tiêu một lượt và nối streak |
| `GET` | `/admin/check-in-policy` | `config.read` | Policy/version hiện hành |
| `PUT` | `/admin/check-in-policy` | `config.write` | Body `{ "checkInPolicy": { ... } }`; publish version mới và audit |

Một user/ngày chỉ có một điểm danh. Mốc 7/14/30/50 là **ngày liên tiếp**. Lượt bù
được tích từ giao dịch tặng/nhận quà hoàn tất theo ngưỡng Admin cấu hình. Điểm mốc
cộng thêm điểm ngày; ngày bù không nhận điểm ngày. `Idempotency-Key` và unique key
nghiệp vụ bảo vệ retry/đồng thời. Xem [quy tắc và trường response đầy đủ](./plan/CHECK-IN-STREAK-DESIGN.md).

### API hiện có

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

  > ⚠️ **Dòng "tiêu điểm không làm tụt hạng, vì hạng đọc `lifetime`" đã SAI.** Bên A chốt
  > 24/09: hạng đọc **balance hiện tại**, nên tiêu điểm có làm tụt hạng.
  >
  > Và từ 11/10 (CHỐT-13) **luồng đổi vật phẩm không cho tiêu vào phần giữ hạng nữa** — chặn
  > thật, không chỉ cảnh báo như bản tới 10/10. Các đường tiêu điểm khác
  > (`SHIP_UNPAID_PENALTY`…) vẫn làm tụt hạng được; CHỐT-13 chỉ nói về đổi vật phẩm.
  > Xem [Mô hình Rank chốt 2026-09-24](./plan/ASSUMPTIONS.md#mô-hình-rank--chốt-ngày-2026-09-24).
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
- Mỗi dòng `/points/me/ledger` có `ruleTitle` — tiêu đề tiếng Việt của `ruleCode`, ví dụ
  `GIFT_COMPLETED_GIVER` → `"Tặng quà thành công"`, `REVERSAL` → `"Hoàn điểm"`. Cũng dựng ở
  máy chủ, cùng lý do với `note`. Mã chưa có tên thì `ruleTitle` là chính `ruleCode`; một phép
  kiểm quét mã nguồn đỏ ngay khi có rule mới ghi vào sổ mà quên đặt tên.
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
- ✅ **Đã có đường tiêu điểm** qua `POST /posts/:postId/redeem`, ghi
  `ITEM_REDEMPTION` vào ledger với idempotency key theo request. Bảo vệ Rank (CHỐT-13),
  xác nhận lại khi báo giá cũ (CHỐT-10 mục 2), hoàn đúng số đã trừ nếu lượt trao bị huỷ
  về sau, và từ 12/10 **debit cùng accept nằm trong một transaction** — đúng yêu cầu
  nguyên tử của SRS CHỐT-13. Xem [handoff](./plan/REDEMPTION-REQUIREMENT-GAP.md).

---

## 8. Chat — `/chat` và Socket.io

Mỗi giao dịch đã duyệt có **đúng một** phòng chat, mở ngay trong transaction duyệt
([F34](./FEATURES.md#f34--chấp-nhận-giao-dịch--mở-chat)).

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/chat/rooms` | Bearer | Danh sách hội thoại của chính mình, phân trang |
| `GET` | `/chat/rooms/:roomId/messages` | Bearer (trong phòng) | Lịch sử, mới nhất trước, **phân trang bằng con trỏ** |
| `POST` | `/chat/rooms/:roomId/messages` | Bearer (trong phòng) | Gửi tin, tối đa 2000 ký tự — **30/phút và 500/24 giờ** |
| `POST` | `/chat/rooms/:roomId/message-media/upload-url` | Bearer (trong phòng) | Xin presigned URL cho ảnh đính kèm |
| `DELETE` | `/chat/rooms/:roomId/messages/:messageId` | Bearer (**người gửi**) | **Thu hồi** tin trong vòng 5 phút |
| `PATCH` | `/chat/rooms/:roomId/mute` | Bearer (trong phòng) | **Tắt/bật thông báo** phòng này, chỉ cho chính mình |
| `PATCH` | `/chat/rooms/:roomId/read` | Bearer (trong phòng) | Đánh dấu đã đọc tới hiện tại |
| `GET` | `/admin/chat/rooms/:roomId/messages` | `report.read` | **Đọc phòng để điều tra** — chỉ khi có báo xấu đang mở |

**Điều cần biết**

- **Cổng hồ sơ F07 đặt ở đường GỬI, không ở đường ĐỌC.** Người hồ sơ chưa đủ vẫn phải đọc được
  tin nhắn gửi cho mình, nếu không họ mất luôn lời nhắn đang chờ.
- **Trần gửi tin: 30/phút + 500/24 giờ** (28/09). Nặng hơn trần bình luận ở một điểm: mỗi tin
  bắn MỘT thông báo `NEW_CHAT_MESSAGE`, khoá chống trùng theo id tin nên không gộp — một nghìn
  tin là một nghìn lần rung máy. Suất chỉ bị trừ **sau khi** tin đã lưu.
- **Thu hồi KHÔNG xoá dòng.** Bảng tin nhắn cấm sửa/xoá để không ai âm thầm viết lại lịch sử, và
  chính lịch sử đó là bằng chứng khi tranh chấp. Thu hồi chỉ làm rỗng nội dung và đặt
  `recalledAt`; dòng vẫn giữ chỗ, và ảnh đính kèm bị xoá khỏi storage. Quá 5 phút trả **409**.
- **Admin đọc phòng CHỈ khi có báo xấu đang mở** trỏ vào phòng đó. Báo xấu một *người* chỉ mở
  phòng mà **cả người bị báo lẫn người báo** cùng có mặt — chỉ cần người bị báo có mặt là một
  báo xấu duy nhất mở toang mọi cuộc trò chuyện của họ. Không đủ điều kiện thì trả **404** y như
  phòng không tồn tại. Mỗi lần mở ghi audit `READ_CHAT_ROOM`.
- **Admin đọc phòng theo cửa sổ (lazy loading).** `GET /admin/chat/rooms/:roomId/messages` mặc
  định trả 50 tin **mới nhất**, sắp **cũ nhất trước**, kèm `window { limit, oldestCursor,
  newestCursor, hasMoreBefore, hasMoreAfter }`. Trần `limit` là 200 (trước là 500).
  - Cuộn lên: `?before=<oldestCursor>`. Cuộn xuống: `?after=<newestCursor>`. Ưu tiên `before` >
    `after` > `aroundMessageId`. Con trỏ hỏng coi như không truyền.
  - `?aroundMessageId=<uuid>` mở cửa sổ quanh đúng tin bị báo: nửa trước gồm chính tin đó, nửa
    sau là các tin tiếp theo. Tin không thuộc phòng thì trả cửa sổ mới nhất.
  - **Mỗi trang** ghi một dòng `READ_CHAT_ROOM`, có `after.direction` (`LATEST | BEFORE | AFTER |
    AROUND`). Con trỏ tự dựng được, nên chỉ audit trang đầu là chừa đường đọc lén.
  - Trước đây response là 200 tin **cũ nhất**. CMS cũ không truyền tham số sẽ thấy cửa sổ mới
    nhất thay vì đầu phòng.
- **Tắt thông báo KHÔNG phải chặn tin.** Tin vẫn tới nơi và vẫn vào danh sách hội thoại, chỉ là
  không kêu — với người vẫn muốn nhận món đồ thì đó đúng là thứ họ cần. Hai cột riêng cho hai
  phía: người tặng tắt không kéo theo người nhận.
- **Huỷ để TỰ VỆ không bị tính vào `FEWEST_CANCELLATIONS`.** Huỷ lượt trao khoá phòng ngay, nên
  đó là cửa thoát khi bị quấy rối — nhưng lượt huỷ vốn tính vào đầu người bấm huỷ, tức nạn nhân
  phải tự hạ thứ hạng để thoát. Nay lượt huỷ đó được bỏ qua **khi báo xấu của họ nhắm vào bên
  kia đã được Admin xác minh** (`RESOLVED`). Chỉ khi xác minh, không phải khi vừa gửi — nếu
  không thì ai cũng gửi một báo xấu vu vơ để né hình phạt. Con số tính sống nên nó tự sửa lúc
  Admin kết luận, và tự quay lại nếu báo xấu bị bác.
- **Báo xấu một tin nhắn** dùng `POST /reports` với `targetType: CHAT_MESSAGE`; hàng đợi Admin
  hiện đoạn đầu nội dung kèm tên người gửi, và nói rõ khi tin đã bị thu hồi. Mỗi báo xấu có
  `targetRoomId` (phòng chứa tin; `null` với đích khác hoặc tin đã bị dọn). Mở hội thoại bằng
  `GET /admin/chat/rooms/:targetRoomId/messages?aroundMessageId=<targetId>`.

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

### Bộ lọc từ ngữ trên chat: GẮN CỜ, không CHẶN

Tới 30/09 `screenText` chỉ chạy trên **bình luận** — một kênh công khai — trong khi mọi thương
lượng diễn ra ở chat. Nên 14 mục dấu hiệu lừa đảo và 8 mục kéo ra ngoài nền tảng đang canh đúng
chỗ không cần canh.

Nay chat cũng đi qua bộ lọc, nhưng **không chặn** (chốt Bên A): tin vẫn tới nơi, Admin xem sau.

| | |
| --- | --- |
| `GET /admin/chat/flags` | hàng đợi, `BLOCK` trước `REVIEW` rồi cũ trước mới |
| `GET /admin/chat/flags/pending-count` | badge |
| `PATCH /admin/chat/flags/:flagId/review` | ghi quyết định: `DISMISSED` / `MESSAGE_REMOVED` / `USER_WARNED` |

Quyền là `report.read` / `report.resolve` — cùng việc với xử báo xấu, và hai mã đó đã thuộc
`MODERATOR`.

- **Không chặn** vì chat là hội thoại riêng giữa người tặng và người nhận đang bàn giao món đồ, và
  một dương tính giả ở đó làm đứng cả việc: "đặt cọc" trong câu *"mình không cần đặt cọc gì đâu"*
  khớp y như trong câu của kẻ lừa. Máy không phân biệt được, người thì được — nên việc của máy là
  đưa nó tới người. `severity` được lưu lại nhưng CHỈ để xếp thứ tự hàng đợi, kể cả mức `BLOCK`.
- **Cờ ghi trong cùng transaction với tin nhắn.** Ghi ở lượt riêng sau đó là mở một cửa: lượt thứ
  hai thất bại thì tin nhắn đã vào nhưng cờ mất, và không ai biết mình vừa mất một tín hiệu.
- **Bảng riêng, không thêm cột vào `chat_messages`.** Bảng đó có trigger chặn mọi UPDATE/DELETE —
  cố ý, vì lịch sử chat là bằng chứng cho tranh chấp. Đặt cờ vào đó thì thao tác "Admin đã xem"
  phải mở cửa hậu bằng session variable, tức nới một bất biến đang bảo vệ đúng thứ cần bảo vệ.
- **Không ghi lại được lên cờ đã xử.** Hai Admin bấm cùng lúc thì người thứ hai nhận `409
  CHAT_FLAG_ALREADY_REVIEWED` (cờ không tồn tại vẫn là `404`). `MESSAGE_REMOVED` GỠ LUÔN tin
  trong cùng transaction với việc đóng cờ — cùng đường `SET LOCAL chantam.chat_recall` mà
  `DELETE /admin/chat/messages/:messageId` dùng; ảnh và realtime chạy sau commit.
- **Hàng đợi chỉ hiện tin ĐÃ KHỚP một mục**, không phải cả phòng. Cấu hình rỗng hoặc hỏng thì
  `screenText` trả `ALLOW`, tức không cờ nào — fail OPEN là cố ý: một dòng JSON gõ nhầm không được
  biến thành "mọi tin nhắn đều vào hàng đợi Admin".

---

## 9. Thông báo — `/notifications`

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/notifications/me` | Bearer | Hộp thư của chính mình, lọc `unreadOnly` |
| `PATCH` | `/notifications/me/read` | Bearer | Đánh dấu đã đọc; bỏ trống id thì đánh dấu tất cả |
| `GET` | `/notifications/me/preferences` | Bearer | **Cài đặt theo nhóm** — luôn trả đủ tám nhóm, kể cả nhóm chưa có loại nào |
| `PATCH` | `/notifications/me/preferences` | Bearer | **Tắt/bật tiếng** một nhóm |

- **Điều hướng khi bấm: đọc `targetType` / `targetId`, KHÔNG đoán từ `type`** (20/10).
  `referenceType`/`referenceId` là đối tượng SINH RA sự kiện; `targetType`/`targetId` là
  màn phải mở. Mỗi `targetType` ứng với một endpoint chi tiết:

  | `targetType` | Mở | `targetId` |
  | --- | --- | --- |
  | `POST` | `GET /posts/:targetId` | id bài |
  | `GIFT_TRANSACTION` | `GET /transactions/:targetId` | id lượt trao |
  | `CHAT_ROOM` | `GET /chat/rooms/:targetId/messages` | id phòng |
  | `CHARITY_CAMPAIGN` | `GET /campaigns/:targetId` | id hoạt động |
  | `DHARMA_THREAD` | `GET /dharma/threads/:targetId` | id chủ đề |
  | `RANK` | `GET /ranks/me` | luôn `null` |
  | `REFERRAL` | `GET /referrals/me` | luôn `null` |
  | `null` | hộp thư | `null` |

  Đích theo từng loại thông báo nằm ở `NotificationTargetsByType` (core-lib). Những chỗ
  `reference` KHÁC `target`:
  - `GIFT_REQUEST_CREATED/REJECTED/CLOSED`: reference là yêu cầu, đích là **bài**.
  - `CHARITY_CONTRIBUTION_*`, `CHARITY_DELIVERY_*`: reference là lượt đóng góp / giao nhận,
    đích là **hoạt động** — dùng `referenceId` để tô sáng đúng lượt.
  - `REPORT_REVIEWED`, `CONTENT_MODERATED`: đích là **nội dung bị báo** (bình luận mở bài
    hoặc chủ đề chứa nó, tin nhắn mở phòng); báo xấu một người thì `null`.
    `REPORT_REVIEWED` nay mang `referenceId` = id **báo xấu** (trước 20/10 là id nội dung).
  - `GIFT_TRANSACTION_CLOSED`: người tặng mở lượt trao; người kế tiếp trong hàng đợi mở bài.
  - `LUNAR_OBSERVANCE`, `SYSTEM_BROADCAST`: không có đích.

  `targetId` luôn là id công khai. Đích đã bị xoá hoặc người xem không còn quyền thì
  endpoint chi tiết trả **404**. Thông báo cũ được backfill theo đúng luật trên; dòng không
  suy ra được (đối tượng đã biến mất) để `null`.
- Hai endpoint chi tiết thêm cùng đợt:
  - `GET /requests/:requestId` — chỉ người xin và chủ bài; trả `postId`, `ownerId`,
    `requesterId`, `status`, `transactionId` (lượt trao gần nhất giữa hai người trên bài,
    `null` khi chưa được chấp nhận). Người khác nhận `404 GIFT_REQUEST_NOT_FOUND`.
  - `GET /charity-contributions/:id` — người đóng góp và người điều phối hoạt động; trả
    `campaignId`, `contributorId`, `status`, `items`. Người khác nhận
    `404 CHARITY_CONTRIBUTION_NOT_FOUND`.
- `unreadCount` là **tổng** số chưa đọc, không phụ thuộc trang hay bộ lọc đang xem — mở
  trang 2 không được làm badge tụt xuống.
- Id không thuộc người gọi đơn giản không khớp dòng nào; **không báo lỗi**, vì báo lỗi là
  nói cho họ biết id đó có thật.
- Mỗi sự kiện có `idempotencyKey` UNIQUE, nên retry không làm rung điện thoại hai lần.
- **Tám nhóm để tắt/bật** (`BR-NOTI-01`, chốt 11/10): `GUIDE`, `POINT`, `EVENT`, `STATUS`,
  `REWARD`, `WARNING`, `CONTACT`, `CONDITION`. Vẫn là nhóm chứ không phải từng loại — hai
  mươi lăm công tắc là một màn hình không ai đọc, và người đang bị làm phiền cần tắt nhanh
  chứ không cần chính xác. Mỗi nhóm trả kèm `types` để client khỏi tự đoán và khỏi lệch khi
  backend thêm loại mới.

  Tới 10/10 đây là **bốn** nhóm (`TRANSACTION`/`CHAT`/`FEED`/`SYSTEM`); Bên A chốt theo SRS.
  Hai điều client cần biết:

  - `GUIDE` hiện **không có loại nào** — nhóm vẫn trả về để người dùng đặt trước, vì SRS đặt
    tên nó. Đọc `types` rỗng là bình thường, không phải lỗi.
  - `CHAT` và `FEED` cũ **gộp** vào `CONTACT`, nên không còn tắt riêng tin nhắn với bình luận
    được nữa. Phân loại của SRS không có chỗ nào khác cho "có người bình luận vào bài của
    bạn" ngoài *Liên lạc*. Lượt di trú chọn phía im lặng: ai đã tắt một trong hai thì
    `CONTACT` tắt — ping bất ngờ là thứ làm người ta tắt thông báo ở mức hệ điều hành.
- **Tắt tiếng KHÔNG phải tắt bản ghi.** Thông báo vẫn vào hộp thư để người dùng tự vào xem; chỉ
  `pushedDevices` về 0. Bỏ luôn bản ghi thì họ mất hẳn thông tin, chứ không phải được yên tĩnh.
- **Hộp thư được dọn theo hạn lưu trữ** (`notification.retention`, mặc định 90 ngày, sàn 7). Cần
  vì thông báo mang tiêu đề bài, tên người và **đoạn đầu tin nhắn chat** — giữ mãi thì xoá lịch
  sử chat theo hạn xong, một bản sao của chính những câu đó vẫn nằm trong hộp thư.
- 🟡 **Đẩy FCM: backend xong, chưa có đích để đẩy.** Dòng này tới 06/10 ghi "chưa có khoá dự
  án Firebase" — **sai từ 05/10**: khoá đã cắm trên staging và `FcmPushSender` đã gọi THẬT tới
  Google bằng chính class đó (Google cấp access token; chỉ từ chối cái token thiết bị rác dùng
  để thử). Việc còn lại **không phải việc backend**:
  `SELECT count(*) FROM user_sessions WHERE fcm_token IS NOT NULL AND revoked_at IS NULL` đang
  trả **0** — client mobile phải đăng nhập và gửi `fcmToken` lên thì mới có máy nào để đẩy tới.
  Khi `FCM_SERVICE_ACCOUNT_BASE64` trống thì `LoggingPushSender` fail-closed ở production,
  không bao giờ giả vờ đã gửi. Thông báo **trong app** không phụ thuộc vào đường đẩy.

---

## 10. Giao dịch tặng/nhận — `/transactions`

Máy trạng thái: `ACCEPTED → DELIVERING → COMPLETED`, và có thể đóng sớm sang `CANCELLED`.

Lượt trao **bắt đầu ở `ACCEPTED`**: duyệt một yêu cầu ở §5 chèn thẳng trạng thái đó. `REQUESTED`
và `REJECTED` là hai giá trị enum không còn đường nào ghi — giữ cho dữ liệu cũ (xem
[08-transaction §8.6](./diagram/08-transaction.md)).

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/transactions/me` | Bearer | Các lượt của chính mình, cả vai tặng lẫn vai nhận |
| `GET` | `/transactions/:id` | Bearer (hai bên trong cuộc) | **Xem một lượt trao**, kèm `evidence[]` ảnh của cả hai bên — người ngoài nhận 404 |
| `PATCH` | `/admin/transactions/:id/reopen` | `admin.manage` | **Mở lại lượt đóng nhầm**, reason bắt buộc, ghi audit |
| `POST` | `/transactions/:id/confirm` | Bearer (người nhận) | Xác nhận đã nhận; body **tuỳ chọn** `{ receipt: { evidenceKeys } }` kèm ảnh lúc nhận |
| `POST` | `/transactions/:id/cancel` | Bearer (cả hai vai) | Huỷ |
| `POST` | `/transactions/:id/evidence/upload-url` | Bearer (cả hai bên) | Xin đường tải ảnh bằng chứng |
| `POST` | `/transactions/:id/handover` | Bearer (**chỉ người tặng**) | Báo đã trao đồ → `DELIVERING` |
| `POST` | `/transactions/:id/reports/ship-unpaid` | Bearer (**chỉ người gửi**) | Báo người nhận không thanh toán phí ship (CH-2) |
| `POST` | `/transactions/:id/reviews` | Bearer (hai bên trong cuộc) | Đánh giá sau khi `COMPLETED`, mỗi người một lần (F42) |
| `PATCH` | `/transactions/:id/reviews/mine` | Bearer (hai bên trong cuộc) | **Sửa đánh giá của chính mình, ĐÚNG một lần**, trong hạn chờ (CHỐT-10 mục 4) |
| `GET` | `/transactions/:id/reviews` | Bearer (hai bên trong cuộc) | Đánh giá của cả hai, kèm `myEditableUntil` |

**Điều cần biết**

- Người tặng **lấy từ bài đăng**, không nhận từ client.
- **Xin đồ của chính mình bị chặn** — đó là đường farm hoạt động rẻ nhất.
- Một người chỉ có **một yêu cầu đang mở** trên mỗi bài; trùng thì báo lỗi riêng chứ không
  phải lỗi hệ thống.
- `accept` trừ tồn kho **nguyên tử** bằng `UPDATE ... WHERE remaining_quantity >= n`. Đọc rồi
  mới ghi thì hai người duyệt cùng lúc sẽ phát vượt số lượng thật.
- `cancel` sau khi đã duyệt thì **trả lại tồn kho**. Không trả là hàng bốc hơi khỏi bài đăng
  mà không ai nhận được. Nếu lượt trao đến từ **đổi-bằng-điểm** thì điểm cũng được hoàn — đúng
  số đã trừ, một lần (CHỐT-13, xem §6).
- `confirm` đặt `completed_at` — đây là **mốc mà bộ đếm hoạt động của rank đọc**. Thiếu nó
  thì lượt tặng này vô hình với hệ thống hạng.
- **Đánh giá sửa được ĐÚNG một lần**, trước `completed_at + review.grace.graceDays` (CHỐT-10
  mục 4, 12/10). Đọc hạn ở `myEditableUntil` của `GET .../reviews` — số ngày là cấu hình
  động, nên client không tự tính.

  Body của `PATCH` là một bản đánh giá **đầy đủ**, không phải bản vá từng trường: bỏ trống
  `comment` là **xoá** bình luận. Nếu bỏ trống nghĩa là "giữ nguyên" thì việc xoá không diễn
  đạt được.

  Bản trước lần sửa do **trigger ở database** chụp vào `previous_*` và **không** trả ra API —
  nó là dấu vết đối soát, không phải nội dung của ai. Lần sửa thứ hai và mọi lượt xoá bị
  database từ chối, kể cả `UPDATE` viết tay.

  Hạn này đúng là mốc chốt `value_bonus` của người tặng, và đó là chủ ý: sau mốc đó thưởng đã
  tính theo bản đánh giá cuối, nên cho sửa tiếp là trả thưởng theo một con số rồi mới đổi nó.
  Vì vậy **đúng mốc** là đã khoá, không phải "sau mốc".

  Luật vai không nới ở đường sửa: chỉ bên NHẬN chấm `accuracyPercent`. Nới ở đây là cho người
  tặng tự chấm mô tả của chính mình qua cửa sau.
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

  Gửi ảnh ở đâu (20/10): `HANDOVER` trong `POST .../handover` (`handover.evidenceKeys`),
  `RECEIPT` trong `POST .../confirm` (`receipt.evidenceKeys`, tuỳ chọn — gọi không body vẫn
  chạy như trước), `RETURNED` trong `POST .../reports/ship-unpaid`. Ở cả ba chỗ mỗi key phải
  thuộc CHÍNH người gửi và đúng lượt trao, đã PUT xong; sai thì **400 và không ghi gì** —
  với `confirm` là lượt trao KHÔNG hoàn tất. Trước 20/10 `confirm` không nhận body nên mốc
  `RECEIPT` không có đường nào ghi được.

  **Xem lại ảnh:** `GET /transactions/:id` trả `evidence[]` (`kind`, `slot`, `url`,
  `uploadedBy`, `createdAt`) của **cả hai bên** — người nhận phải thấy được ảnh lúc trao thì
  thế bất đối xứng mới có nghĩa. Cùng hình dạng với `GET /admin/transactions/:id`. URL là
  `storage.publicBaseUrl` + key (bucket công khai, không phải URL ký có hạn).

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
- Đóng lượt trao cũng **hoàn điểm** nếu nó đến từ đổi-bằng-điểm (CHỐT-13) — khoản phạt
  không-trả-ship là bút toán riêng và vẫn giữ. Xem §6.
- Khoản phạt đi qua chính point ledger với khoá chống trùng **theo lượt trao**, nên bấm hai
  lần hay mạng retry đều chỉ trừ một lần — lần sau trả `penaltyApplied: false` thay vì báo
  đã trừ thêm. Số điểm lấy từ point rule `SHIP_UNPAID_PENALTY` nên Admin chỉnh được.
- Hệ thống **không xử lý tiền ship** — đó là COD ngoài hệ thống. Nó chỉ đối chiếu dấu hiệu
  đã khai trên bài rồi ghi một khoản phạt.

---

## 11. Nhóm — `/groups`

| Endpoint | Việc |
| --- | --- |
| `POST /groups` | Tạo nhóm |
| `GET /groups/me` | Nhóm của tôi |
| `GET /groups/:groupId` | Trang tổng quan nhóm |
| `PATCH /groups/:groupId` | Sửa tên, mô tả, ảnh |
| `GET /groups/:groupId/activities` | Dòng hoạt động |
| `GET /groups/:groupId/invite` | Link mời + số người đã vào |
| `GET /groups/:groupId/invite-link` | Như `/invite` — tên theo SRS 3.7A |
| `GET /groups/invites/:inviteCode` | **Công khai**, không cần đăng nhập — xem trước nhóm cho trang `/invite/:code`: `name, regionLabel, description, avatarUrl, coverUrl, memberCount, ownerUsername`. Không có toạ độ hay id. Mã sai và nhóm đã giải tán cùng trả `400 GROUP_INVITE_INVALID` |
| `GET /groups/:groupId/affiliate` | Điều kiện affiliate của nhóm |
| `GET /groups/:groupId/members` | Danh sách thành viên |
| `GET /groups/:groupId/sub-teams` | Danh sách tổ |
| `POST /groups/:groupId/sub-teams` | Tạo tổ |
| `DELETE /groups/:groupId/sub-teams/:subTeamId` | Xoá tổ |
| `PATCH /groups/:groupId/members/:memberId` | Xếp vào tổ / đổi vai |

Và các endpoint Admin: `GET /admin/groups/role-permissions`,
`PUT /admin/groups/role-permissions/:role`, `GET /admin/groups/radius-policy`,
`PUT /admin/groups/radius-policy`, `GET /admin/groups`, `GET /admin/groups/:groupId`,
`GET /admin/groups/:groupId/members`, `POST /admin/groups/:groupId/dissolve`,
`POST /admin/groups/:groupId/invite-link/rotate`.

### SRS 3.7A — thay đổi ngày 16/10/2026

- **`groupCreation: { canCreateGroup, reasonCode }`** ở `GET /groups/me` và `GET /me/entitlements`.
  Cùng một lớp (`GroupCreationEligibility`) quyết định cho cả `POST /groups`, nên `reasonCode`
  luôn là ĐÚNG mã lỗi `POST` sẽ trả: `PROFILE_INCOMPLETE` → `ONBOARDING_INCOMPLETE` →
  `GROUP_CREATE_NOT_ALLOWED` → `GROUP_ALREADY_MEMBER` → `GROUP_DEFAULT_LOCATION_REQUIRED`.
  Tên mã giữ nguyên (không đổi sang tên trong SRS) để không phá app đang chạy.
- **Mã mời sai khi đăng ký** → `400 GROUP_INVITE_INVALID`, không tạo tài khoản (trước đó vẫn
  đăng ký và bỏ nhóm). Xem mục dưới.
- **Link mời:** Owner chỉ ĐỌC (`/invite` hoặc `/invite-link`); Phase 1 không có đường cho user
  xoay link. Chỉ Admin đổi mã khi link bị lộ — `POST /admin/groups/:groupId/invite-link/rotate`
  (`admin.manage`, lý do bắt buộc, audit `ROTATE_GROUP_INVITE` ghi cả mã cũ lẫn mã mới).
- **Link mời đầy đủ:** `/invite`, `/invite-link` và chi tiết nhóm phía Admin (`GET`, `dissolve`,
  `invite-link/rotate`) trả thêm `invitePath` = `/invite/<mã>` và `inviteUrl` =
  `WEB_PUBLIC_BASE_URL` + `invitePath`. `inviteUrl` là `null` khi môi trường chưa cấu hình web
  công khai — cùng lối `shareUrl` của bài đăng; client hiện `inviteCode` thay thế. **Web phải
  phục vụ trang `/invite/:code`** (đọc mã rồi đưa vào form đăng ký `registration.inviteCode`), và
  app nên bắt cùng đường này làm deep link.
- **Admin giải tán nhóm** — `POST /admin/groups/:groupId/dissolve` (`admin.manage`, lý do bắt
  buộc, audit `DISSOLVE_GROUP`): cùng hiệu ứng với Owner xoá tài khoản; nhóm đã giải tán →
  `409 GROUP_ALREADY_DISSOLVED`.
- **Affiliate ngoài vùng / không toạ độ** ghi một dòng `affiliate_rewards` với
  `reward_status = NOT_ELIGIBLE_GEO`, `point_delta = 0`, không bút toán, cho mỗi người lẽ ra
  được chia (chặn bởi `maxBeneficiariesPerEvent`).
- **`SUBTEAM_ADMIN` giữ nguyên** (mở rộng Bên A 24/09) — mặc định chỉ OWNER có quyền quản lý,
  Admin hệ thống cấp thêm qua `/admin/groups/role-permissions`.
- Acceptance của SRS 3.7A chạy ở `npm run test:group-acceptance` (use case + repository thật)
  và `npm run test:affiliate` (bốn ca geo).

### Tâm và bán kính KHÔNG nhận từ body

`POST /groups` chỉ nhận tên, mô tả, ảnh. Tâm vùng chụp từ `default_location` của người tạo,
bán kính từ `group.radius_meters.<bậc>` của **bậc người tạo** (đơn vị **mét**), thiếu thì rơi về
`group.default_radius_meters` — cả hai đứng yên sau đó
([BR-GRP-03](./FEATURES.md#f52--tạo-group-từ-default-location)). Bậc dùng để tính là bậc tại
thời điểm tạo: tụt bậc về sau không làm vùng co lại, lên bậc cũng không làm nó rộng ra.
Cho Owner sửa là cho họ dời vùng theo nơi đang có nhiều sự kiện để gom điểm affiliate. Owner
đổi Vị trí mặc định về sau thì vùng nhóm cũng không nhúc nhích.

### Vào nhóm chỉ qua `POST /auth/register`

Không có `POST /groups/:id/join`. `RegisterDto.inviteCode` là **đường duy nhất** sinh
membership ([F54](./FEATURES.md#f54--link-mời--chỉ-dành-cho-tài-khoản-mới)). Mã sai hoặc nhóm
đã giải tán thì **đăng ký thất bại** với `400 GROUP_INVITE_INVALID` và không tài khoản nào được
tạo (quyết định 16/10/2026 — trước đó đăng ký vẫn thành công và bỏ nhóm). Kiểm mã và tạo
membership nằm trong CÙNG transaction với tài khoản, có `FOR SHARE` trên dòng nhóm.

Cũng không có endpoint rời nhóm hay chuyển nhóm (BR-GRP-06), và ràng buộc UNIQUE đặt trên
**`user_id` một mình** — một người một nhóm, database chặn chứ không chỉ tầng ứng dụng.

Chính xác hơn: `UQ_group_memberships_one_active_per_user` là index **một phần** trên `user_id`
`WHERE status = 'ACTIVE'`. Dòng của một nhóm đã giải tán mang `status = 'DISSOLVED'` — ở lại làm
lịch sử nhưng không tính, nên thành viên cũ lập được nhóm mới. Ràng buộc UNIQUE trần trước đó
khoá họ ngoài hệ thống nhóm vĩnh viễn.

### `inviteCode` chỉ trả cho Owner

`GET /groups/me` trả `inviteCode: null` cho thành viên thường. Link mời là cửa vào nhóm; lộ
cho thành viên thường là cho họ mời người khác thay Owner.

### Quyền nhóm luôn mang `groupId`

Bốn endpoint quản lý đi qua `hasGroupPermission(userId, groupId, permission)` chứ không phải
`hasPermission` toàn cục. RBAC Admin không có cột nào diễn đạt phạm vi, nên gán
`group.member.assign_role` ở đó cho một trưởng nhóm là cho họ quyền trên **mọi** nhóm.

| Vai | Quyền seed sẵn |
| --- | --- |
| `OWNER` | `group.overview.view`, `group.member.view`, `group.member.assign_role`, `group.subteam.manage`, `group.invite.view`, `group.activity.view`, `group.affiliate.view`, `group.settings.manage` |
| `SUBTEAM_ADMIN` | `group.subteam.member.view` ✅, `group.subteam.activity.view` |
| `MEMBER` | `group.overview.view` |

✅ = có dòng code thật sự kiểm. **Bốn trong mười quyền** ở trạng thái đó; sáu quyền còn lại canh
những endpoint chưa tồn tại và `test:config-inventory` khai từng cái kèm lý do. Tới 30/09 cả hai
quyền của `SUBTEAM_ADMIN` đều không ai đọc, nên phong vai đó cho ai cũng không đổi một thứ gì.

Bảng `group_role_permissions` **không** hard-code trong code, nhưng cũng **chưa có endpoint
Admin**: đổi bộ quyền hiện phải chạy SQL tay, bảng không có cột `version`, và `updated_by` chưa
bao giờ được ghi.

### `GET …/members` — hai quyền, hai phạm vi

| Quyền của người gọi | Trả về |
| --- | --- |
| `group.member.view` | **cả nhóm** |
| chỉ `group.subteam.member.view` | **chỉ tổ của chính họ** |
| không quyền nào | `403` |

Quyền toàn nhóm xét **trước**, vì Owner cũng có thể được xếp vào một tổ và xét ngược thì Owner ở
trong tổ tự thu hẹp tầm nhìn của mình. Trưởng tổ **chưa** được xếp vào tổ nào thì `403` — trả cả
nhóm ở đó là leo thang quyền bằng một trường bỏ trống. `GET …/sub-teams` theo cùng quy tắc.

### `PATCH …/members/:memberId` — ba ca cùng một câu trả lời

Trả `GroupNotFound` khi người đó không thuộc nhóm, khi họ là `OWNER`, và khi `subTeamId` trỏ
sang tổ của nhóm khác. Phân biệt ba ca là để lộ cơ cấu nhóm người khác cho ai vừa đoán một id.

- **`subTeamId` bỏ trống = GIỮ tổ hiện tại. `null` tường minh = gỡ khỏi tổ.** `role` bỏ trống
  thì giữ nguyên vai. Hai thứ này phải khác nhau: gộp lại thì không có cách nào đổi vai mà giữ
  tổ, và phong `SUBTEAM_ADMIN` cho ai sẽ gỡ họ khỏi đúng cái tổ họ sắp quản.
- **Không gửi trường nào thì `422`**, không phải `200`. Một `PATCH` không nói gì là lượt gọi sai;
  cho qua thì client gửi thiếu trường vẫn nhận `200` và tin là đã đổi.
- **Không gán được `OWNER`.** Hai Owner trên một nhóm thì `groups.owner_id` và bảng membership
  nói hai chuyện khác nhau, và không có quy tắc nào phân xử.
- Không hạ được vai Owner hiện tại — làm thế là để lại một nhóm không ai quản trị được.

### `DELETE …/sub-teams/:subTeamId` — người trong tổ Ở LẠI nhóm

Cùng quyền `group.subteam.manage` với tạo tổ: ai lập được tổ thì dẹp được tổ, và trưởng tổ
không xoá được tổ của chính mình vì họ không tạo ra nó.

- **Người trong tổ vẫn là thành viên nhóm**, chỉ rời tổ. Tổ là cách tổ chức, không phải điều
  kiện ở lại (BR-GRP-05).
- **Trưởng tổ của tổ bị xoá hạ về `MEMBER`.** Phạm vi của vai đó đọc từ `sub_team_id`, nên giữ
  vai là để lại một người mang danh trưởng mà mọi endpoint đều từ chối.
- Xoá MỀM, và gọi lần thứ hai trả `GroupNotFound` chứ không đè mốc xoá cũ — mốc bị đè là mất
  dấu thời điểm tổ thật sự biến mất.

### `GET /groups/:groupId` và `/activities` — hai cặp quyền khác nhau

| Endpoint | Quyền | Phạm vi |
| --- | --- | --- |
| `GET /groups/:groupId` | `group.overview.view` | trang nhóm; `inviteCode` chỉ Owner thấy |
| `GET /groups/:groupId/activities` | `group.activity.view` | hoạt động CẢ nhóm |
| ⬆ | chỉ `group.subteam.activity.view` | hoạt động của người trong tổ mình |

Cặp quyền hoạt động tách khỏi cặp quyền xem thành viên: hai cặp là hai quyết định độc lập, và
gộp lại thì sửa phạm vi xem thành viên sẽ âm thầm đổi cả phạm vi xem hoạt động. `scopedToSubTeamId`
trong kết quả nói rõ đang xem phạm vi nào — thiếu nó thì trưởng tổ thấy danh sách ngắn và tưởng
nhóm ít hoạt động.

Ba loại sự kiện, **dựng từ dữ liệu đã có** chứ không từ bảng sự kiện riêng: `MEMBER_JOINED`,
`POST_PUBLISHED` (chỉ bài công khai — hoạt động nhóm không phải đường xem bài nháp hay bài đã gỡ
của người khác), `GIFT_COMPLETED` (tính cho phía người tặng).

`GET /groups/:groupId` trả 404 cho cả hai ca "nhóm không tồn tại" và "bạn không thuộc nhóm này":
phân biệt là cho người lạ dò xem id nào là một nhóm thật.

### `GET …/invite`, `GET …/affiliate`, `PATCH /groups/:groupId`

| Endpoint | Quyền | |
| --- | --- | --- |
| `GET /groups/:id/invite` | `group.invite.view` | chỉ Owner; link không hết hạn, không giới hạn lượt |
| `GET /groups/:id/affiliate` | `group.affiliate.view` | chỉ Owner; trưởng tổ KHÔNG xem affiliate toàn nhóm |
| `PATCH /groups/:id` | `group.settings.manage` | tên, mô tả, ảnh — **không** tâm và bán kính |

`GET …/affiliate` trả **điều kiện**, không phải điểm đã chia: `rewardEngineReady: false` nói
thẳng rằng bộ máy chia thưởng chưa có, thay cho việc im lặng trả 0 điểm — Owner sẽ tưởng nhóm
mình chưa làm được gì. Ba con số tách riêng (`activeMemberCount`, `insideRadiusCount`,
`eligibleCount`) vì chúng trả lời ba câu khác nhau khi Owner hỏi "sao nhóm tôi ít người đủ điều
kiện": vắng mặt, ngoài vùng, hay cả hai. Cửa sổ đọc từ
`affiliate.active_member_window_days`, và tính từ `users.status` + `users.last_active_at` trực
tiếp — không có cột cờ `is_active` nào, vì một job quét rồi ghi cờ sẽ tạo con số thứ hai nói về
cùng một sự thật.

`PATCH /groups/:id` cố ý không nhận tâm và bán kính (BR-GRP-03). Bỏ trống một trường là **giữ
nguyên**; `null` tường minh mới xoá mô tả hoặc ảnh. Không gửi trường nào thì `422`. Nhóm đã giải
tán không sửa được gì.

### `GET|PUT /admin/groups/radius-policy` — cả thang một lượt

Bốn khoá `group.radius_meters.<bậc>` vốn đã sửa được bằng `POST /admin/system-configs`. Endpoint
này ghi trên **cùng bốn khoá đó**, nên hai đường ra cùng một chỗ. Nó tồn tại vì ba chỗ hụt của
việc ghi từng khoá:

1. **Không nguyên tử.** Hạ Kim Cương rồi mới nâng Vàng là có một khoảng thời gian Vàng rộng hơn
   Kim Cương, và nhóm nào tạo trong khoảng đó mang bán kính sai **vĩnh viễn** — bán kính là
   snapshot lúc tạo (BR-GRP-03).
2. **Không kiểm được ràng buộc giữa các bậc.** "Đơn điệu tăng theo bậc" là bất biến của cả thang;
   một lượt ghi thấy đúng một khoá thì không có gì để so. Phép kiểm chạy trên thang **đã trộn**
   với giá trị đang có, nên sửa một bậc vẫn thấy quan hệ với ba bậc kia — kể cả khi chỉ đổi
   `defaultMeters`, vì nó kéo theo mọi bậc đang thừa hưởng.
3. **Admin thấy bốn dòng rời rạc** lẫn giữa mười mấy khoá khác, không thấy hình của cái thang.

`GET` trả kèm `inherited` (bậc chưa có số riêng) và `canCreateGroup` (bậc THẬT SỰ tạo được nhóm —
hôm nay chỉ Kim Cương, nên ba bậc dưới là số chờ sẵn chứ không phải vùng đang hoạt động), cùng
`columnBoundsMeters` là cận tuyệt đối của cột, không nới bằng cấu hình.

### `GET|PUT /admin/groups/role-permissions` — bộ quyền vai, có phiên bản

`config.read` để đọc, `config.write` để ghi. Đây là bảng cấu hình và hai mã đó đã thuộc
`POLICY_ADMIN`/`SUPER_ADMIN`; thêm một mã riêng nghĩa là seed một quyền chưa chắc vai nào được
gán, tức tự tạo đúng loại "quyền seed mà không ai có".

- **`PUT` thay CẢ TẬP**, không thêm từng cái — nên mảng rỗng là thu hồi hết.
- Mỗi lần sửa ghi thành **phiên bản mới**; dòng cũ ở lại, và bộ đang hiệu lực là `MAX(version)`
  tính riêng từng vai. `admin_audit_logs` giữ cả trước lẫn sau — chỉ ghi "sau" thì đọc lại không
  biết Admin vừa thêm hay vừa thu hồi, mà thu hồi mới là thứ cần tra.
- **`OWNER` không cấu hình được**: thu hồi `group.member.assign_role` của chủ nhóm để lại một
  nhóm không ai xếp được người vào tổ, mà cũng không lấy lại được vì đường duy nhất để lấy lại
  là chính endpoint này.
- **Mã quyền lạ bị từ chối**, không lưu im lặng. `GET` trả kèm `knownPermissions` và cờ
  `effective` — một bộ quyền toàn mã mà code chưa kiểm thì gán vai đó không đổi một thứ gì, và
  hôm nay `MEMBER` đúng ở trạng thái ấy.

### Nhóm đã giải tán thì mọi quyền tắt theo

`hasGroupPermission` lọc `groups.status = 'ACTIVE'` **và** `group_memberships.status = 'ACTIVE'`,
nên sau khi Owner xoá tài khoản
([F55](./FEATURES.md#f55--owner-xoá-tài-khoản--group-giải-tán)) không ai còn thao tác được —
nhưng membership, ledger và audit **giữ nguyên** để tra lại.

`GET /groups/me` trả `null` sau khi nhóm giải tán, nên màn hình Nhóm của tôi hiện lại nút Tạo
nhóm. Giữ nguyên nhóm đã chết ở đó là ẩn nút Tạo nhóm vĩnh viễn cho một nhóm không còn làm gì.

---

## 12. Quản trị — `/admin`

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
| `GET` | `/admin/permissions` | `admin.manage` | Danh mục permission (cột của ma trận phân quyền) |
| `POST` | `/admin/roles` | `admin.manage` | Tạo role mới kèm bộ quyền ban đầu |
| `PATCH` | `/admin/roles/:roleCode` | `admin.manage` | Sửa tên, bật/tắt, thay trọn bộ quyền của role |
| `GET` | `/admin/me` | `admin.access` | Role và permission đọc lại từ database cho phiên CMS |
| `POST` \| `DELETE` | `/admin/users/:userId/roles` | `admin.manage` | Cấp / thu hồi role |
| `GET` | `/admin/users` | `admin.manage` | Tìm user với bộ lọc đầy đủ, gồm **hàng đợi cờ độ chính xác** |
| `GET` | `/admin/users/:userId` | `admin.manage` | Chi tiết một user |
| `PATCH` | `/admin/users/:userId/status` | `admin.manage` | Đổi trạng thái |
| `DELETE` | `/admin/users/:userId` | `admin.manage` | Xoá mềm kèm ẩn danh |
| `POST` | `/admin/users/verified-phones/release` | `admin.manage` | **Giải phóng một SĐT đã xác minh** |
| `GET` | `/admin/posts` | `post.read` | Danh sách bài, **không lọc sẵn** trạng thái nào |
| `GET` | `/admin/posts/:postId` | `post.read` | Chi tiết bài và media dành cho moderator |
| `PATCH` | `/admin/posts/:postId/moderation` | `post.moderate` | **Hậu kiểm**: gỡ bài đang hiện hoặc trả lại, reason bắt buộc, ghi audit |
| `GET` | `/admin/comments/pending-count` | `post.moderate` | **Số bình luận đang chờ** — một con số cho huy hiệu trên menu CMS |
| `GET` | `/admin/comments` | `post.moderate` | **Hàng đợi bình luận**, lọc `status=PENDING_REVIEW`, mỗi dòng kèm tiêu đề bài và từ bị bắt |
| `PATCH` | `/admin/comments/:commentId/moderation` | `post.moderate` | Cho hiện lại (`VISIBLE`) hoặc gỡ hẳn (`REMOVED`), reason bắt buộc, ghi audit |
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
- `POST /admin/users/verified-phones/release` là **van xả** cho khoá một-SIM-một-tài-khoản.
  Nhận số ở bất kỳ cách gõ nào (server tự nắn về E.164) — Admin **không cần biết tài khoản nào
  đang giữ**, vì sổ lưu băm và tài khoản cũ có thể đã xoá. **Từ chối** khi người giữ còn sống
  và vẫn mang dấu xác minh: lúc đó là tranh chấp giữa hai người thật, phải xử lý tài khoản kia
  trước, nếu không hệ thống có hai tài khoản cùng "đã xác minh" một SIM. Lý do bắt buộc, ghi
  audit `RELEASE_VERIFIED_PHONE`. Hàng cũ trong sổ **giữ lại**, chỉ đánh dấu đã giải phóng —
  xoá đi là mất dấu vết duy nhất tra lại được khi có tranh chấp.
- `GET /admin/users?accuracyReviewRequired=true` là **hàng đợi Giver Accuracy** (F43). Mỗi
  dòng mang sẵn `giverAccuracyPercent`, `giverAccuracySamples` và `accuracyReviewRequired`,
  đủ để quyết mà không phải mở từng hồ sơ. Cờ này **chỉ Admin thấy** — nó là tín hiệu để
  người thật nhìn qua, không phải phán quyết, nên không bao giờ hiện trên hồ sơ công khai và
  cũng không hiện cho chính chủ. Cũng có `emailVerified` để lọc.
- `/admin/system-logs` gom bốn nguồn thật (`admin_audit_logs`, `point_ledger`,
  `rank_transitions`, `gift_transactions`) về một hình dạng chung, lọc bằng `logType`.
- CMS lấy capability từ `/admin/me`, không suy ra quyền từ `rank`, `status` hoặc JWT.
- **Ma trận phân quyền sửa được.** `POST /admin/roles` body `{ role: { code, name, permissions, reason } }`;
  `PATCH /admin/roles/:roleCode` body `{ role: { name?, isActive?, permissions?, reason } }`. Cả hai
  trả lại toàn bộ `{ roles }` như `GET /admin/roles` để CMS vẽ lại bảng.
  - `permissions` là **trọn bộ quyền mới** (thay thế), không phải phần thêm/bớt. Bỏ trường là giữ
    nguyên, gửi `[]` là gỡ hết.
  - `code` chỉ gồm `A-Z`, `0-9`, `_`, bắt đầu bằng chữ cái, và **không đổi được** sau khi tạo.
    Role không xoá được — tắt bằng `isActive: false`: người giữ role mất quyền ngay, việc gán vẫn
    còn nên bật lại là có lại.
  - Permission **không tạo được từ CMS** — mỗi permission cần code kiểm tra nó, nên do migration
    khai báo. Mã lạ trả `ADMIN_PERMISSION_UNKNOWN` (400) kèm danh sách mã lạ.
  - `SUPER_ADMIN` **không sửa được** (`ADMIN_ROLE_PROTECTED`, 409): quyền mới được migration gắn
    cho nó lúc deploy.
  - Thay đổi làm **chính người sửa mất `admin.manage`** bị từ chối (`ADMIN_ROLE_SELF_LOCKOUT`,
    409) và cuộn lại toàn bộ. Kiểm trên trạng thái sau thay đổi, nên người giữ `admin.manage`
    qua một role khác vẫn sửa được.
  - Audit `CREATE_ROLE` / `UPDATE_ROLE`, `resourceType = ADMIN_ROLE_DEFINITION`, `resourceId` là
    mã role, kèm before/after. Gửi lại đúng trạng thái đang có thì không ghi.
- `/admin/posts` không trả tọa độ chính xác, và **không lọc sẵn** trạng thái nào — từ 26/09
  bài lên thẳng nên không còn hàng đợi duyệt để mặc định vào.
- Hậu kiểm chạm được vào `PUBLISHED`, `REJECTED` và `PENDING_REVIEW` còn sót từ trước.
  **Không** chạm vào `RESERVED`/`DELIVERING` (đang có lượt trao sống) hay `COMPLETED` /
  `CANCELLED` / `EXPIRED` (đã đóng) — trả 409. Bấm lại đúng quyết định cũ cũng trả 409 thay vì
  ghi thêm một dòng audit nói rằng có gì đó vừa đổi.
- Trả lại một bài gỡ nhầm **giữ nguyên hạn cũ**; đặt lại đồng hồ là thưởng thêm ba tháng cho
  một bài đã sống gần hết. Chỉ bài chưa có hạn mới được cấp hạn mới.
- **Hàng đợi bình luận dùng chung quyền `post.moderate` với hậu kiểm bài** — gỡ một bình luận
  và gỡ một bài là cùng một loại quyết định về nội dung; tách thành hai quyền chỉ tạo thêm một
  tổ hợp để Admin cấp sót. Bấm lại đúng quyết định cũ trả **400**, và bình luận đã `REMOVED`
  coi như không còn. Mỗi lần xử, `comment_count` và `reply_count` đi theo trạng thái mới.
- **`pending-count` là chuông, không phải thông báo.** Hàng đợi có cửa nhưng Admin không mở màn
  hình ra thì một câu chửi nằm chờ ba ngày cũng không ai hay. Bắn thông báo cho từng bình luận
  thì ngược lại: nội dung bẩn đến theo đợt, và Admin sẽ tắt thông báo ngay sau đợt đầu tiên —
  rồi mất luôn những thông báo thật sự quan trọng. Một con số trên menu là thứ họ thấy mỗi lần
  mở CMS mà không phải trả giá gì.
- Tác giả **sửa** bài đã bị gỡ thì bài vẫn `REJECTED`. Cho nó tự hiện lại là để tác giả gỡ
  quyết định của Admin bằng cách sửa một dấu phẩy. Chỉ Admin trả lại được.
- `POST /reports` nhận target `POST`, `USER` hoặc `COMMENT`, mô tả và tối đa 5 URL bằng
  chứng. Nhiều report chỉ tăng độ ưu tiên; việc gửi report không tự động phạt. Khi Admin
  xác nhận report nhắm vào bài đăng, bài công khai bị chuyển sang `REJECTED`, chủ bài bị
  trừ điểm theo rule `CONTENT_VIOLATION_PENALTY` (mặc định −50, không giảm lifetime), và
  audit `MODERATE_POST` + `REVIEW_REPORT` được ghi chung transaction. Một bài chỉ bị trừ
  một lần dù có nhiều report cùng đích.


### Vòng đời một yêu cầu xin nhận

- **`GET /requests/me` là màn hình phía NGƯỜI XIN** (thêm 28/09). Trước đó không có endpoint nào
  liệt kê yêu cầu theo người xin, nên người dùng không có cách nào biết mình đang xin những gì.
  Mỗi dòng kèm `postTitle`, `postThumbnailUrl`, `postStatus` và cờ `postClosed` — **server tự
  tính** `postClosed` để mỗi client không phải cài lại danh sách trạng thái, vì chỗ nào cài sót
  sẽ hiện nút "rút yêu cầu" cho một bài không còn tồn tại. Mặc định trả **mọi** trạng thái, kể
  cả đã rút và đã đóng: người dùng mở màn này chính là để biết chuyện gì đã xảy ra.
- ⚠️ **Yêu cầu treo từng khoá tài khoản vĩnh viễn.** Trước 28/09 không đường nào đóng
  `gift_requests` khi bài đóng lại — kể cả đường tác giả tự gỡ, vốn chỉ đóng `gift_transactions`
  (yêu cầu `PENDING`/`STANDBY` chưa có lượt trao nào nên không rơi vào đó). Yêu cầu treo vẫn
  tính vào `OPEN_REQUEST_QUOTA`, nên một Thành viên (trần 5) xin 5 món mà cả 5 bài hết hạn sẽ
  đứng ở trần mãi mãi. Nay **cả ba** đường — tác giả gỡ, `post:expire`, Admin hậu kiểm — đều
  đóng yêu cầu treo và bắn `GIFT_REQUEST_CLOSED` cho từng người xin.
- **Hai lớp bảo vệ, không phải một.** Ngoài đường đóng ở trên, `countOpenByRequester` nay JOIN
  sang `posts` và bỏ qua yêu cầu dưới bài `EXPIRED`/`CANCELLED`/`REJECTED`/`COMPLETED`/`ARCHIVED`.
  Mai này thêm một đường đóng bài mà quên gọi thì tệ nhất là con số hơi lệch, chứ không phải một
  người bị khoá mà không hiểu vì sao. `RESERVED`/`DELIVERING` **vẫn tính**: lượt trao đang chạy,
  và người đứng `STANDBY` dưới nó vẫn được xét tiếp nếu nó đổ.
- **Chủ bài nay được báo khi có người xin** (`GIFT_REQUEST_CREATED`, thêm 28/09). Trước đó không
  có loại thông báo nào cho việc này, trong khi cả cơ chế đồng hồ 7 ngày giả định chủ bài BIẾT
  có ứng viên để mà chốt sớm. Ở chế độ `INSTANT` thì không gửi: người đầu tiên được chốt luôn,
  nên chủ bài nhận thẳng `GIFT_REQUEST_ACCEPTED`.
- **`POST …/requests/:requestId/reject` chỉ đụng `PENDING` và `STANDBY`.** Từ chối một yêu cầu
  đã `ACCEPTED` là huỷ một lượt trao đang sống — việc đó thuộc luồng `/transactions`, nơi tồn
  kho và phòng chat phải dọn theo. Trước 28/09 `REJECTED` là trạng thái **chết**: khai trong
  enum, lọc ra khỏi bộ đếm, nhưng không đường nào ghi — nên chủ bài thấy một yêu cầu rõ ràng
  không ổn cũng không gạt ra được, và auto-select có thể trao đúng cho người đó khi hết đồng hồ.
- ⚠️ **`POST /transactions` và `POST /transactions/:id/accept` đã GỠ** (28/09). Chúng tạo thẳng
  `gift_transactions` mà không tạo `gift_requests`, nên đi vòng qua **mọi** cổng của luồng này:
  hồ sơ F07, trần `OPEN_REQUEST_QUOTA`, đồng hồ chọn người, thông báo cho chủ bài, và hàng đợi
  ứng viên. Đường duy nhất tạo ra một lượt trao nay là duyệt một yêu cầu. Gỡ được vì không client
  nào dùng: lớp tương thích `/gift-posts`, smoke test và các script kiểm đều không gọi tới.
- **Bốn thông báo của luồng này:** `GIFT_REQUEST_CREATED` (tới chủ bài), `GIFT_REQUEST_ACCEPTED`
  (tới người thắng), `GIFT_REQUEST_REJECTED` (chủ bài chủ động từ chối) và `GIFT_REQUEST_CLOSED`
  (bài đóng lại). Hai cái cuối tách nhau vì lý do khác hẳn: một bên có người từ chối họ, bên kia
  chỉ là món đồ không còn nữa.

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

## 13. Từ thiện — bảng nhu cầu và đề nghị đóng góp

> **Mọi dòng dưới đây đã CHẠY từ 12/10**, đo bằng `npm run test:charity-contribution`. Tiến độ từng lát ở
> [`CHARITY-CONTRIBUTION-DESIGN.md` §12](./plan/CHARITY-CONTRIBUTION-DESIGN.md#12-tiến-độ-triển-khai)
> — đó là nguồn duy nhất, bảng này không kể lại. Endpoint nào chưa tick ở đó thì client không
> được giả lập thành công.
>
> Không được coi một participation là một cam kết tặng vật phẩm: `campaign_participations` vẫn
> chỉ là đăng ký tham dự sự kiện.
>
> **Phân hệ ship ở trạng thái TẮT phần điểm.** Point Rule `CHARITY_CONTRIBUTION_COMPLETED` đã
> seed nhưng `is_enabled = false` và mức là `0` — mọi đường nghiệp vụ chạy, chỉ bút toán điểm
> không phát. Bên A chốt mức rồi bật bằng một lượt publish, không cần deploy. Cùng lối F83
> (điểm danh) và F56 (affiliate).

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/charity-campaigns` | Bearer + capability theo loại | ✅ **Đã chạy.** Tạo campaign kèm bảng nhu cầu; server tự quyết định chờ duyệt hay public ngay (`approval_status` + `is_active`) |
| `GET` | `/campaigns/:idOrSlug/needs` | Công khai | ✅ **Đã chạy.** Nhu cầu, số đã chấp nhận/đã nhận/còn thiếu theo từng dòng; không trả PII beneficiary |
| `POST` | `/charity-campaigns/:id/contributions` | Bearer | ✅ **Đã chạy.** Gửi đề nghị gồm nhiều vật phẩm và số lượng; đề nghị KHÔNG giữ chỗ |
| `GET` | `/charity-campaigns/:id/contributions` | Organizer | ✅ **Đã chạy.** Danh sách đề nghị, lọc được theo trạng thái. Coordinator chưa có — xem lát C |
| `GET` | `/charity-contributions/me` | Bearer | ✅ **Đã chạy.** Đề nghị của chính mình, mọi hoạt động |
| `PATCH` | `/charity-contributions/:id` | Bearer (chủ đề nghị) | ✅ **Đã chạy.** `action: REPLACE` thay trọn bộ dòng, `WITHDRAW` rút — chỉ khi chưa có phần nào được chấp nhận |
| `POST` | `/charity-contributions/:id/decision` | Organizer | ✅ **Đã chạy.** Quyết **mọi** dòng trong một lượt, nguyên tử; chống vượt nhu cầu khi hai lượt cùng lúc; `decisionKey` chống trùng |
| `POST` | `/charity-campaigns/:id/external-contributions` | Organizer | ✅ **Đã chạy.** Ghi nhận vật phẩm nhận ngoài app; không gắn tài khoản nên không sinh điểm |
| `GET` | `/charity-campaigns/:id/external-contributions` | Organizer | ✅ **Đã chạy.** Lịch sử, gồm cả bản đã huỷ |
| `PATCH` | `/charity-external-contributions/:id` | Organizer | ✅ **Đã chạy.** `VOID` huỷ, `ADJUST` huỷ + tạo bản thay thế; luôn kèm lý do, không sửa tại chỗ |
| `POST` | `/charity-campaigns/:id/close` | Organizer/Admin | ✅ **Đã chạy.** Chặn đề nghị mới, từ chối hàng đợi với `CAMPAIGN_CLOSED`, giữ lượt giao đang chạy |
| `POST` | `/charity-campaigns/:id/extend` | Organizer/Admin | ✅ **Đã chạy.** Gia hạn hoạt động đang mở, chỉ dời ra sau, mỗi lần một hàng audit |
| `POST` | `/charity-campaigns/:id/coordinators` | Organizer | ✅ **Đã chạy.** Giao quyền điều phối (chỉ hoạt động có tổ chức) |
| `GET` | `/charity-campaigns/:id/coordinators` | Organizer/coordinator | ✅ **Đã chạy.** Coordinator đang có hiệu lực |
| `DELETE` | `/charity-campaigns/:id/coordinators/:userId` | Organizer | ✅ **Đã chạy.** Thu quyền — đặt mốc, không xoá |
| `GET` | `/charity-campaigns/:id/beneficiary` | Organizer/Admin | ✅ **Đã chạy.** Người thụ hưởng — RIÊNG TƯ |
| `PUT` | `/charity-campaigns/:id/beneficiary` | Organizer | ✅ **Đã chạy.** Ghi người thụ hưởng; rút đồng ý thì hoạt động tự ẩn |
| `POST` | `/charity-campaigns/media/upload` | Bearer | ✅ **Đã chạy.** Xin URL tải ảnh/video (ảnh 5 MB, video 25 MB); key dùng trong lượt tạo hoặc thay media |
| `PUT` | `/charity-campaigns/:id/media` | Người tạo | ✅ **Đã chạy.** Thay cả bộ 1–5 media + ảnh bìa, chỉ khi hồ sơ chờ duyệt |
| `GET` | `/charity-deliveries/:id` | Hai bên | ✅ **Đã chạy.** Một lượt giao nhận; người ngoài nhận cùng lỗi với không tồn tại |
| `POST` | `/charity-deliveries/:id/complete` | Organizer | ✅ **Đã chạy.** Xác nhận số THỰC NHẬN từng dòng; phần thiếu trở về nhu cầu |
| `POST` | `/charity-deliveries/:id/cancel` | Hai bên | ✅ **Đã chạy.** Trả phần đã nhận về nhu cầu, không xoá đề nghị |
| `GET` | `/admin/charity-campaigns/:id` | `campaign.read` | ✅ **Đã chạy (15/10).** Một hoạt động, mọi trạng thái duyệt |
| `GET` | `/admin/charity-campaigns/:id/needs` | `campaign.read` | ✅ **Đã chạy (16/10).** Bảng nhu cầu vật phẩm, **mọi trạng thái duyệt** — Admin xem trước khi duyệt. Cùng hình dạng với `GET /charity-campaigns/:idOrSlug/needs` |
| `PATCH` | `/admin/charity-campaigns/:id` | `campaign.manage` | ✅ **Đã chạy (16/10).** Sửa nội dung (tiêu đề, mô tả, huy hiệu, mục tiêu, vị trí); không đụng slug/thời gian/loại/duyệt/media; lý do bắt buộc, audit trường đổi |
| `DELETE` | `/admin/charity-campaigns/:id` | `campaign.manage` | ✅ **Đã chạy (16/10).** Xoá MỀM, chỉ khi chưa ai đăng ký/đóng góp/giao nhận/đánh giá — có thì `409 CHARITY_CAMPAIGN_HAS_ACTIVITY` (đóng hoặc tắt thay vì xoá) |

Giao diện trang chủ (`/admin/campaigns`) có thêm `DELETE /admin/campaigns/:campaignId` (16/10, `campaign.manage`): xoá CỨNG, nhưng bản đang phục vụ (`isLive`) → `409 HOME_CAMPAIGN_LIVE` — tắt bằng `PUT … isActive: false` trước.

- `POST /charity-campaigns` và `POST /admin/charity-campaigns` **không còn nhận `bannerUrl`**; gửi `media` (1–5 key) và `coverKey`. Response có thêm `media[]`; `bannerUrl` do server ghi từ ảnh bìa.
- Luồng "tải trước, tạo sau":
  1. `POST /charity-campaigns/media/upload` — body `{ "upload": { "contentType": "image/webp", "contentLength": 512000 } }` → `{ "upload": { "key", "uploadUrl", "expiresInSeconds", "publicUrl" } }`.
  2. `PUT` file lên `uploadUrl` đúng `Content-Type` và đúng số byte đã khai — lệch là hỏng chữ ký.
  3. Gửi `key` trong `campaign.media` + `campaign.coverKey` khi tạo, hoặc trong `PUT /charity-campaigns/:id/media` với body `{ "media": { "keys": ["…"], "coverKey": "…" } }` → `{ "campaign" }`. Body thay media bọc dưới khoá `media` theo quy ước bọc body; key chưa tải lên thật trả `400 VALIDATION_FAILED`.

**Hai endpoint đã chạy — điều client cần biết**

- `POST /charity-campaigns` nay đòi `campaignType`: `INDIVIDUAL_APPEAL` hay `ORGANIZED_CAMPAIGN`.
  Hai loại hai quyền khác nhau, và quyền đọc từ **Rank Config** chứ không phải một phép so hạng
  trong mã: `SUBMIT_INDIVIDUAL_APPEAL` (baseline Thành viên trở lên) và
  `SUBMIT_CHARITY_PROPOSAL` (baseline chỉ Kim Cương). Bên A đổi baseline mà không cần deploy.

  `beneficiaryRelation` (`SELF` | `OTHER`) **bắt buộc** với `INDIVIDUAL_APPEAL` và phải **bỏ
  trống** với `ORGANIZED_CAMPAIGN` — database canh bằng một CHECK nối hai cột.

  Trạng thái ban đầu do **server** quyết, không nhận từ body: có
  `PUBLISH_CHARITY_WITHOUT_REVIEW` (baseline chỉ Kim Cương) thì `APPROVED` ngay, không thì
  `PENDING_APPROVAL`. Quyền *tạo* và quyền *public ngay* là hai câu hỏi khác nhau — gộp chúng là
  cho mọi người tạo được cũng đẩy nội dung ra ngoài không qua ai đọc.

  `needs[]` ghi trong **cùng transaction** với campaign: hai lượt ghi rời sẽ để lại một kêu gọi
  công khai không nói cần gì, nếu lượt thứ hai hỏng. Bỏ trống `needs` là hợp lệ. Thứ tự hiển thị
  do server đặt theo thứ tự trong mảng; không nhận `sortOrder` từ client.

- `GET /campaigns/:idOrSlug/needs` trả **từng dòng**, mỗi dòng giữ `unit` của nó. Backend không
  bao giờ cộng số lượng giữa hai đơn vị — `kg + cái + hộp` là con số không có nghĩa.
  `overallProgressPercent` là trung bình **tỷ lệ** của các dòng đang bật, mỗi tỷ lệ kẹp ở 100%;
  nó chỉ để trình bày, nguồn sự thật là từng dòng. `null` nghĩa là chưa khai nhu cầu nào — khác
  `0` nghĩa là chưa nhận được gì.

  `remainingQuantity = max(0, target - accepted - received)`. Đề nghị **chưa** được chấp nhận
  không trừ vào đây: giữ chỗ theo đề nghị thì một loạt đề nghị không thực hiện sẽ làm chiến dịch
  trông như đã đủ và chặn người tặng thật.

  `pendingQuantity` **chưa có** trong phản hồi và sẽ xuất hiện cùng lát B, khi bảng đề nghị tồn
  tại. Trả `0` bây giờ là đặt một con số không phải phép đo giữa những con số có thật.

  Dòng `isActive = false` vẫn trả về (nó là lịch sử của những đề nghị đã gửi) nhưng không vào
  phép tính tiến độ.

- `POST /charity-campaigns/:id/contributions` — một đề nghị, nhiều dòng, mỗi dòng trỏ một dòng
  nhu cầu. **Đề nghị không giữ chỗ:** nó không trừ vào `remainingQuantity` cho tới khi người tổ
  chức chấp nhận.

  Hoạt động chưa duyệt trả cùng lỗi với hoạt động không tồn tại. Đã đóng hoặc đang đình chỉ thì
  `409 CHARITY_NOT_ACCEPTING_CONTRIBUTIONS` — **một mã cho cả ba**, vì phân biệt chúng là cho
  người ngoài dò được trạng thái kiểm duyệt. Trạng thái đó đọc từ **ba** thứ
  (`approval_status`, `is_active`, `end_time`), không suy từ một cột: `approval_status` không
  bao giờ mang chữ `ACTIVE`/`CLOSED`/`SUSPENDED`.

  `needItemId` phải thuộc đúng hoạt động đó và còn bật, và một dòng nhu cầu chỉ xuất hiện một
  lần trong mảng — cả hai ra `400 CHARITY_NEED_ITEM_INVALID`.

- `acceptedQuantity` của mỗi dòng: `null` là **chưa xét**, `0` là **đã xét và không nhận**. Đừng
  gộp hai cái ở client — `pendingQuantity` của bảng nhu cầu đếm theo đúng khác biệt đó.
  `rejectionReason` chỉ có khi nhận ít hơn số đề nghị.

- `contactNote` chỉ ra ở hai đường có token: `GET /charity-campaigns/:id/contributions` (người
  tổ chức) và `GET /charity-contributions/me` (chính người tặng). Không đường công khai nào trả
  nó.

- `PATCH /charity-contributions/:id` chỉ làm được khi **chưa có phần nào được chấp nhận**. Sau
  đó mọi thay đổi phải đi qua huỷ lượt giao nhận — sửa ngược một đề nghị đã sinh lượt giao nhận
  là để hai bên nói khác nhau về cùng một cam kết.

  `REPLACE` thay **trọn bộ** dòng: bỏ một dòng khỏi mảng là xoá dòng đó. `WITHDRAW` đổi trạng
  thái, **không xoá** bản ghi — người tổ chức đã đọc đề nghị đó và cần biết nó từng tồn tại.
  Đề nghị của người khác trả cùng lỗi với đề nghị không tồn tại.

- **Lượt giao nhận từ thiện KHÔNG nằm ở `/transactions/*`.** Nó ở bảng riêng
  (`campaign_deliveries`), vì `gift_transactions` và `chat_rooms` đều bắt buộc gắn một bài
  đăng. Hệ quả cho app: không có phòng chat, ảnh bàn giao, cron tự hoàn tất hay review cho
  lượt giao nhận từ thiện; mỗi đề nghị có tối đa một lượt giao, đọc qua `deliveryId` của đề
  nghị.

- `POST /charity-contributions/:id/decision` quyết **mọi** dòng trong một lượt — bỏ sót một
  dòng là `400 CHARITY_LINES_INVALID`. Nhận ít hơn đề nghị thì **phải** có `rejectionReason`;
  nhận đủ thì **không** được có. Phần còn thiếu được tính lại **sau khi đã khoá** các dòng nhu
  cầu, nên hai lượt quyết cùng lúc vào một nhu cầu thì lượt sau thấy con số lượt trước để lại;
  vượt thì `409 CHARITY_NEED_EXCEEDED` kèm phần còn lại mới nhất. Không âm thầm cắt số.

  `decisionKey` do client sinh cho **mỗi lần bấm**. Gửi lại cùng khoá → nhận lại đúng kết quả
  cũ với `replayed: true`, không ghi gì. Khoá khác trên đề nghị đã quyết →
  `409 CHARITY_CONTRIBUTION_ALREADY_DECIDED`.

- `POST /charity-deliveries/:id/complete` nhận số **thực nhận** từng dòng (0 tới số đã chấp
  nhận). Tiến độ công khai chỉ tăng theo số thực nhận; phần thiếu trở về nhu cầu. Hoàn tất
  xong thì người tặng được cộng `CHARITY_CONTRIBUTION_COMPLETED` **một lần cho mỗi đề nghị**,
  nếu thực nhận được ít nhất một thứ — rule đó đang **TẮT** nên hiện chưa phát điểm.

- Người tổ chức **không** gửi đề nghị vào chính hoạt động của mình
  (`409 CHARITY_SELF_CONTRIBUTION`).

- **Ngoài app** (`POST .../external-contributions`): cộng ngay vào số đã nhận. Không chặn
  vượt mục tiêu — đó là vật phẩm đã ở trong kho thật. Ngày nhận không được ở tương lai. Sửa
  sai **chỉ** qua `PATCH /charity-external-contributions/:id`: `VOID` huỷ, `ADJUST` huỷ bản cũ
  và tạo bản thay thế (`replacesId` trỏ về bản cũ). Một trigger ở database từ chối mọi đường
  sửa tại chỗ và mọi lượt xoá, nên lịch sử của một con số luôn đọc lại được.

- **`allowOverTarget`** (body tạo, mặc định `false`): cho lượt chấp nhận vượt mục tiêu từng
  dòng; `remainingQuantity` vẫn kẹp ở 0. **Gia hạn** (`POST .../extend`): chỉ dời mốc kết thúc
  ra sau, chỉ khi đang mở, mỗi lần ghi một hàng audit không sửa được.

- **Đóng chiến dịch** (`POST .../close`): người tổ chức hoặc Admin có `campaign.manage`.
  `approval_status` **giữ** `APPROVED`; "đã đóng" là `is_active = false` cộng `end_time` đã
  qua — đó cũng là thứ phân biệt nó với "đình chỉ". Đề nghị đang chờ bị từ chối với
  `CAMPAIGN_CLOSED`; lượt giao nhận đang chạy **không** bị huỷ và vẫn hoàn tất được.

- **Thông báo** (nhóm `STATUS`, tắt được cùng vòng đời yêu cầu xin đồ): người tổ chức nhận
  `CHARITY_CONTRIBUTION_SUBMITTED`; người tặng nhận `CHARITY_CONTRIBUTION_DECIDED` (kể cả khi
  hoạt động đóng) và `CHARITY_DELIVERY_COMPLETED`; huỷ lượt giao thì `CHARITY_DELIVERY_CANCELLED`
  đi tới bên KIA.

- **Coordinator**: mọi đường ghi "Organizer" ở trên (trừ đóng, gia hạn, giao quyền) nhận cả
  coordinator còn hiệu lực. Quyền đọc lại trong transaction, nên thu quyền có hiệu lực ngay ở
  lượt bấm kế tiếp. Người điều phối không gửi đề nghị vào hoạt động mình điều phối.

- **Người thụ hưởng** (chỉ kêu gọi cá nhân cho NGƯỜI KHÁC): `beneficiary` gửi kèm lúc tạo hoặc
  qua `PUT .../beneficiary`. Dữ liệu này RIÊNG TƯ — không response công khai nào mang nó. Chưa
  có đồng ý `CONFIRMED` thì hoạt động **không** public, kể cả với quyền public ngay, và Admin
  duyệt thì `409 CHARITY_BENEFICIARY_CONSENT_REQUIRED`. Chuyển đồng ý về `PENDING` lúc đang
  public thì hoạt động tự ẩn (`hidden: true`).

- Còn lại: không có việc backend nào. Point Rule `CHARITY_CONTRIBUTION_COMPLETED` đang TẮT với
  `10` là số GIỮ CHỖ — Bên A chốt mức, Admin sửa rồi mới bật. Xem
  [§12](./plan/CHARITY-CONTRIBUTION-DESIGN.md#12-tiến-độ-triển-khai).

Body tạo đề nghị luôn bọc khoá `contribution`:

```json
{
  "contribution": {
    "items": [
      { "needItemId": "uuid", "offeredQuantity": 20, "condition": "NEW" },
      { "needItemId": "uuid", "offeredQuantity": 5, "condition": "LIKE_NEW" }
    ],
    "deliveryMethod": "MEETUP",
    "note": "Có thể giao chiều thứ bảy"
  }
}
```

Body quyết định cho phép chấp nhận một phần và từ chối các dòng còn lại:

```json
{
  "decision": {
    "idempotencyKey": "uuid",
    "items": [
      { "contributionItemId": "uuid-1", "acceptedQuantity": 15 },
      {
        "contributionItemId": "uuid-2",
        "acceptedQuantity": 0,
        "rejectionReason": "TARGET_REACHED"
      }
    ]
  }
}
```

Accept phải khoá và kiểm tra capacity trong cùng database transaction. Nếu capacity thay đổi,
trả `409` kèm `needItemId`, `requestedQuantity` và `remainingQuantity`; không tự cắt số lượng.
Địa chỉ giao nhận chính xác chỉ xuất hiện sau khi phần đóng góp được chấp nhận và chỉ trả cho
hai bên transaction. Chi tiết tại
[CHARITY-CONTRIBUTION-DESIGN](./plan/CHARITY-CONTRIBUTION-DESIGN.md).

`needs[]` là nguồn tiến độ và luôn giữ riêng từng `unit`; backend không cộng `kg`, `cái`,
`hộp` thành một số lượng tổng. `overallProgressPercent` nếu có chỉ là trung bình phần trăm
hoàn thành của từng dòng active để vẽ UI. `targetItemsCount/currentItemsCount` cũ là legacy;
response phải kèm `progressSource` để client không trộn số khai tay với projection mới.

Quyền tạo mặc định:

- `INDIVIDUAL_APPEAL`: Member/Bạc/Vàng tạo ở `PENDING_APPROVAL`; Kim Cương public ngay.
- `ORGANIZED_CAMPAIGN`: chỉ Kim Cương được tạo và public ngay.
- Admin tạo và public ngay cho cả hai loại.

"Public ngay" lưu bằng `approval_status = 'APPROVED'` **và** `is_active = true`, không phải
một giá trị `ACTIVE` trong `approval_status` — CHECK hiện tại chỉ nhận `PENDING_APPROVAL`,
`APPROVED`, `REJECTED`. Bảng ánh xạ đầy đủ các trạng thái nghiệp vụ (gồm `SUSPENDED` và
`CLOSED`) nằm ở [thiết kế đóng góp từ thiện](./plan/CHARITY-CONTRIBUTION-DESIGN.md#ánh-xạ-trạng-thái-nghiệp-vụ-sang-schema-hiện-có).

Client không gửi `approvalStatus`. Backend kiểm tra `SUBMIT_INDIVIDUAL_APPEAL` hoặc
`SUBMIT_CHARITY_PROPOSAL`, sau đó kiểm tra `PUBLISH_CHARITY_WITHOUT_REVIEW` bằng Rank hiện
tại đọc từ database.

Điểm contributor dùng Point Rule `CHARITY_CONTRIBUTION_COMPLETED`: một mức `X` cố định do
Admin cấu hình và thưởng đúng một lần cho mỗi contribution khi có transaction hoàn tất.
Reference ledger là `campaignContributionId`; không nhân theo số lượng, số item, số chuyến
giao, giá trị ước tính hay accuracy. External contribution không sinh điểm.

## 14. Tương thích cũ — `/gift-posts`

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

## 15. Vận hành

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
