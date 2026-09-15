# INVARIANTS.md

Các quy tắc kiến trúc **bắt buộc** của monorepo Chân Tâm. Mỗi mục dưới đây tương ứng một
lỗi thiết kế có thật đã từng phải sửa lại. Không được vi phạm.

Trước khi viết bất kỳ dòng code nào cho một tính năng mới: đọc file này, rồi đọc ít nhất
**một resource đã có** (`suites/chantam.vn/chantam/core/src/**/gift-post`) làm mẫu. Không tự
phát minh pattern mới.

---

## 1. Ranh giới Clean Architecture

```
domain/  ->  application/  ->  infrastructure/
(trong cùng)                   (ngoài cùng)
```

**Quy tắc phụ thuộc:** lớp trong KHÔNG BAO GIỜ import từ lớp ngoài.

- **`domain/`** định nghĩa port (interface). Không đặt tên port theo implementation:
  `IGiftPostRepository`, không phải `IGiftPostRepositoryAdapter`. "Adapter" là chi tiết
  của infrastructure.
- **`application/`** chỉ chứa use case và contract. Không gọi HTTP, không tích hợp API
  ngoài, không import module framework của infrastructure.
- **`infrastructure/`** hiện thực hoá port: TypeORM, controller, HTTP client, worker,
  tích hợp nhà cung cấp.

## 2. Cấu trúc module

- **Một module cho một resource**, không phải một module cho một use case. Gom toàn bộ use
  case của resource (CRUD + custom) vào một module: `GiftPostModule`, `RequestModule`.
- Module chi tiết hạ tầng (adapter nhà cung cấp) được import bởi module infrastructure,
  không phải bởi module application.
- **`ApplicationModule`** chỉ import các feature module cấp resource. Không import module
  hạ tầng.

## 3. Đặt tên

- **Không hậu tố `Impl`.** Class bỏ tiền tố `I` của interface: `IGiftPostRepository` →
  `GiftPostRepository`.
- **Không viết tắt, không tên một chữ cái.** `giftPost`, `existing`, `repository` — không
  bao giờ `p`, `gp`, `repo` trong tham số công khai.
- **Method của controller** đặt theo `<hành động><Resource>`: `createGiftPost`,
  `getGiftPost`, `getNearbyGiftPosts`. Không phải `create`, `get`, `list`.
- **Use case được inject** mang hậu tố `UseCase`:
  `private readonly createGiftPostUseCase: ICreateGiftPostUseCase`.
- **File**: kebab-case kèm hậu tố (`gift-post.entity.ts`, `create-gift-post.use-case.ts`).
- **Enum**: tên PascalCase số nhiều, thành viên UPPER_SNAKE_CASE (`GiftPostStatuses.PUBLISHED`).

## 4. Dependency Injection

Token là Symbol trùng tên với interface:

```typescript
export interface IGiftPostRepository { /* ... */ }
export const IGiftPostRepository = Symbol('IGiftPostRepository');
```

KHÔNG dùng: `const GIFT_POST_REPOSITORY = 'GIFT_POST_REPOSITORY';`

## 5. Use case

Mọi use case implement `IUseCase<Command, Result>` từ `common-lib` và dùng method
**`handle()`** (không phải `execute()`).

- **Một file cho một contract**: `create-gift-post.use-case.ts` chứa `ICreateGiftPostCommand`,
  `ICreateGiftPostResult`, `ICreateGiftPostUseCase` + Symbol.
- Barrel `index.ts` re-export toàn bộ contract của resource.
- **Command kế thừa BodyDto** (bản đã bọc khoá resource), không phải DTO bên trong.
  Use case nhận `{ giftPost: { title, ... } }`, không phải `{ title, ... }`.

## 6. DTO

### Gom nhóm
Một file cho một intent, không phải một file cho một class. `get-gift-post.dto.ts` chứa cả
`GetGiftPostParamsDto` lẫn `GetGiftPostResponseDto`.

### Body DTO luôn bọc dưới khoá resource

```typescript
export class CreateGiftPostBodyDto implements ICreateGiftPostBodyDto {
  @ApiProperty({ type: () => CreateGiftPostDto })
  @ValidateNested()
  @Type(() => CreateGiftPostDto)
  giftPost: ICreateGiftPostDto;
}
```

Body là `{ "giftPost": { ... } }`, KHÔNG phẳng `{ "title": ... }`.

### Params DTO
Mọi path param có DTO riêng với validate cụ thể. Controller dùng
`@Param() params: GetGiftPostParamsDto`, KHÔNG dùng `@Param('id', ParseUUIDPipe)`.

### Response DTO
Mọi response có class cụ thể với `@ApiProperty({ type: () => Entity })` để Swagger sinh
schema đúng.

### Đầy đủ
Nếu interface DTO tồn tại trong `-lib` thì service BẮT BUỘC có đủ: DTO cụ thể + contract
use case + implementation + endpoint. Không bỏ sót cái nào.

## 7. Package `-lib`

Interface DTO, interface entity, model, value object, enum và **ErrorCodes** thuộc về
`<product>-lib`, không nằm trong service. Đây là contract dùng chung — sau này Next.js
web/admin import trực tiếp để chia sẻ kiểu dữ liệu với backend.

## 8. Exception

- **Không bao giờ** `throw new Error(...)` trong luồng nghiệp vụ. Luôn dùng class con của
  `Exception` kèm một `ErrorCode`.
- `Error` trần chỉ được chấp nhận trong code vòng đời ứng dụng (lỗi chí mạng làm dừng app).
- Mã lỗi định dạng `0x<ResourceId><ReasonId>` (2 byte hex). ResourceId đếm lại từ `0x01`
  trong mỗi package sở hữu mã; ReasonId đếm lại từ `0x01` trong mỗi nhóm resource.
- Mỗi package sở hữu mã khai báo `export const ErrorOrigin = '<layer>/<package>'` cạnh
  enum `ErrorCodes`, và truyền vào tham số thứ 4 của `super(...)`. Cặp `(origin, code)`
  là duy nhất trên toàn hệ thống. Consumer **import hằng số**, không hardcode chuỗi.
- `common-lib` chỉ giữ mã cấp nền tảng (`VALIDATION_FAILED`, `UNAUTHORIZED`, ...). Không
  thêm mã nghiệp vụ vào đây.

## 9. Persistence

- Dùng `PersistencyModule.forPostgresAsync()` từ `persistency-lib`, KHÔNG dùng
  `TypeOrmModule` trực tiếp.
- Repository không có method tuỳ biến thì khai báo qua `Repositories.create([...])`.
  Repository có method tuỳ biến thì viết class riêng `extends Repository<IXEntity>`.
- `synchronize` chỉ được bật ở `development`. Production dùng migration.

## 10. Dữ liệu không gian (PostGIS) — riêng của Chân Tâm

- Cột toạ độ luôn là `geography(Point, 4326)` khai báo qua `@GeoColumn()` của
  `persistency-lib`, kèm index GiST. Không lưu lat/lng thành 2 cột `float` rời rạc.
- Truy vấn bán kính luôn đi qua `GeoQueryHelper.applyRadiusFilter()` (`ST_DWithin`), không
  tự viết công thức Haversine trong TypeScript.
- **Không trả khoảng cách chính xác tới mét ra kênh công khai.** Dùng
  `bucketDistance()` để làm tròn thô. Khoảng cách chính xác cho phép truy vấn từ ba
  điểm rồi giải tam giác, tìm ra đúng vị trí đã bị làm nhiễu — jitter khi đó vô nghĩa.
- **Không bao giờ trả toạ độ chính xác của người cho ra API công khai.** Tài liệu yêu cầu
  mục 1.3 quy định chỉ người đã được duyệt nhận mới biết địa chỉ thật. Mọi response cho
  người chưa được duyệt phải đi qua `applyGeoJitter()` — làm nhiễu ổn định theo `globalId`
  để pin không nhảy loạn giữa các lần gọi.

## 11. Bảo mật & dữ liệu cá nhân

- Không log số CCCD, số điện thoại đầy đủ, toạ độ chính xác hay `credentials`. Bộ redact
  của `logger-lib` là lớp phòng vệ cuối, không phải lý do để log bừa.
- Không lưu ảnh CCCD trong hệ thống. Chỉ lưu `verification_id` + kết quả trả về từ nhà
  cung cấp eKYC (xem `docs/ARCHITECTURE.md`).
- **Endpoint nào nhận định danh của người chưa đăng nhập thì không được để lộ định danh đó
  có thật hay không.** Đăng nhập sai, quên mật khẩu, xác nhận mã — tài khoản lạ và tài
  khoản thật phải trả lời giống hệt nhau, cả nội dung lẫn thời gian đáp ứng.
- **Đổi mật khẩu, xoá tài khoản hay khoá tài khoản thì phải thu hồi cả access token**, chứ
  không chỉ refresh token trong database. Access token là JWT nên tự nó còn hiệu lực tới
  lúc hết hạn — dùng `ITokenDenyList` (`system/auth-lib`).
- **Thu hồi access token và thu hồi phiên trong database luôn đi cùng nhau.** Thiếu vế đầu
  thì token cũ sống tới lúc hết hạn; thiếu vế sau thì nạn nhân gọi `/refresh` là có token
  mới. Làm cả hai **trước** khi ghi thay đổi, để tiến trình chết giữa chừng thì chưa đổi gì
  — Redis và Postgres không chung transaction nên thứ tự là thứ duy nhất bảo vệ được.
- **`rank` và `status` trong access token là ảnh chụp lúc phát hành, không phải sự thật hiện
  tại.** Không phân quyền dựa trên chúng: hạng có thể đã đổi, tài khoản có thể đã bị khoá,
  và token vẫn nói điều cũ trong tối đa 15 phút. Cần quyết định theo hạng hay trạng thái thì
  đọc lại từ database trong use case.

## 12. Tài liệu

Khi thêm endpoint, export hoặc tính năng đáng kể vào một package, cập nhật `README.md` của
chính package đó trong cùng lần thay đổi.
