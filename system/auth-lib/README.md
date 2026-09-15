# `@chantam/service.auth-lib`

Xác thực JWT: cấp và kiểm token, băm mật khẩu, guard toàn cục, decorator.

Thư viện này **không biết gì về nghiệp vụ Chân Tâm** — nó chỉ làm việc với
`IAuthPrincipal` gồm bốn trường chuỗi. Mọi thứ liên quan tới người dùng (bảng `users`,
đăng ký, đăng nhập) nằm ở service, không ở đây.

## Gắn vào service

```typescript
AuthModule.forRootAsync({
  inject: [IConfig],
  useFactory: (config: IConfig) => ({
    jwtSecret: config.auth.jwtSecret,      // bắt buộc, tối thiểu 32 ký tự
    accessTtlSeconds: 900,                 // mặc định 15 phút
    refreshTtlSeconds: 2_592_000,          // mặc định 30 ngày
    bcryptRounds: 12,                      // mặc định 12
  }),
  // Xem "Thu hồi access token" bên dưới. Bỏ trống thì thu hồi KHÔNG hoạt động.
  denyList: {
    inject: [IRedisClient, IConfig],
    useFactory: (redis: Redis, config: IConfig) =>
      new RedisTokenDenyList(redis, config.auth.accessTtlSeconds),
  },
})
```

Module là `global` và tự gắn `JwtAuthGuard` qua `APP_GUARD`.

## Mặc định là KHOÁ

Guard gắn toàn cục nên **mọi endpoint đều yêu cầu token**. Muốn mở thì đánh dấu:

```typescript
@Public()
@Post('register')
public async register(@Body() body: RegisterBodyDto) { }
```

Hướng mặc định này là cố ý. Quên `@Public()` làm endpoint bị khoá — lỗi lộ ra ngay lần gọi
đầu tiên. Hướng ngược lại (mặc định mở, phải nhớ khoá) thì quên một chỗ là **lộ dữ liệu mà
không ai biết**.

Endpoint `@Public()` vẫn đọc token nếu client có gửi, vì nhiều màn hình đổi nội dung theo
việc người xem đã đăng nhập hay chưa — ví dụ có được thấy toạ độ thật không. Token hỏng ở
endpoint công khai thì bỏ qua, không chặn.

## Lấy danh tính người gọi

```typescript
@Get('me')
public async getMe(@CurrentUser() user: IAuthPrincipal) {
  return this.getProfileUseCase.handle({ userId: user.userId });
}
```

Ở endpoint `@Public()`, `@CurrentUser()` trả `undefined` — kiểu trả về nói rõ điều đó nên
bên gọi buộc phải xử lý.

## Hai loại token, hai cơ chế khác nhau

| | Access token | Refresh token |
| --- | --- | --- |
| Dạng | JWT có chữ ký | Chuỗi ngẫu nhiên 32 byte |
| Tuổi thọ | 15 phút | 30 ngày |
| Lưu ở server | Không | Có — chỉ lưu bản băm SHA-256 |
| Thu hồi được | Có, qua `ITokenDenyList` | Có, ngay lập tức |

**Vì sao refresh token không phải JWT:** nó phải thu hồi được ngay. JWT chỉ hết hiệu lực khi
hết hạn, nên muốn thu hồi vẫn phải tra một bảng — mà đã tra bảng thì JWT không còn đem lại
lợi ích nào, chỉ thêm kích thước và thêm chỗ sai.

**Vì sao băm refresh token bằng SHA-256 chứ không phải bcrypt:** token đã là 256 bit ngẫu
nhiên nên không có gì để dò từ điển, và mỗi lần refresh đều phải tra bảng — bcrypt sẽ biến
thao tác tra cứu thành hàng trăm mili giây vô ích.

## Thu hồi access token

Access token là JWT nên **tự nó có hiệu lực tới lúc hết hạn**. Không có gì thêm thì đổi mật
khẩu hay xoá tài khoản xong, token cũ vẫn gọi API được tới 15 phút — với chức năng đặt lại
mật khẩu, thứ người dùng bấm vào *vì* nghi bị chiếm tài khoản, 15 phút đó phá hỏng đúng mục
đích của tính năng.

`ITokenDenyList` ghi **một mốc thời gian cho mỗi tài khoản**: "mọi token phát trước lúc này
đều hỏng". Ghi mốc thay vì liệt kê từng token vì ta không giữ danh sách token đã phát — và
cũng không nên giữ.

```typescript
await this.denyList.revokeIssuedBefore(userId);
```

Gọi nó ở mọi chỗ làm mất hiệu lực phiên: đổi mật khẩu, xoá tài khoản, khoá tài khoản. Gọi
**trước** khi đổi dữ liệu, để kho lưu chết thì dừng lại chứ đừng đổi nửa vời.

Guard tra danh sách này sau khi kiểm chữ ký, và ném `TOKEN_REVOKED` nếu trúng.

**Độ phân giải giây.** `iat` của JWT chỉ có đơn vị giây, nên so sánh cũng theo giây. Hệ quả:
token phát ra trong *cùng giây* với lệnh thu hồi vẫn sống. Khe hở dưới 1 giây đó là chủ ý —
đổi lấy việc người dùng đổi mật khẩu xong đăng nhập lại ngay **không bị chính lệnh thu hồi
của mình đá ra**.

**Không dùng cho đăng xuất.** Đăng xuất chỉ thu hồi một thiết bị, mà danh sách chặn lại theo
tài khoản — dùng nó sẽ đá người dùng ra khỏi mọi máy. Muốn thu hồi đúng một phiên thì phải
nhét `sessionId` vào token; chưa làm vì chưa có nhu cầu.

**Không khai `denyList`** thì module chạy bản rỗng và **kêu cảnh báo lúc khởi động**. Thu hồi
hỏng mà im lặng là kiểu hỏng nguy hiểm nhất: nhìn từ ngoài mọi thứ vẫn xanh.

## Mật khẩu

Dùng **bcryptjs** (thuần JavaScript) chứ không phải `bcrypt` (module native). Lý do: máy lập
trình viên chạy Windows, và module native thường xuyên vỡ khi cài đặt hoặc khi image builder
và runner khác nhau. Chậm hơn khoảng 30% ở thao tác băm — không đáng kể so với một lần đăng
nhập.

`verify()` đọc số vòng từ chính chuỗi hash, nên nâng `bcryptRounds` không làm hỏng mật khẩu
của người dùng cũ.

## Mã lỗi

| Mã | Khi nào | HTTP |
| --- | --- | --- |
| `TOKEN_MISSING` | Không có header `Authorization` | 401 |
| `TOKEN_INVALID` | Sai chữ ký, sai định dạng, hoặc payload thiếu trường | 401 |
| `TOKEN_EXPIRED` | Hết hạn | 401 |
| `TOKEN_REVOKED` | Còn hạn nhưng đã bị thu hồi (đổi mật khẩu, xoá tài khoản) | 401 |

`TOKEN_EXPIRED` tách riêng khỏi `TOKEN_INVALID` để client biết khi nào nên **tự refresh** thay
vì đá người dùng ra màn đăng nhập.

`TOKEN_REVOKED` tách riêng khỏi `TOKEN_EXPIRED` vì refresh cũng vô ích — client phải đưa
người dùng về màn đăng nhập.

`TOKEN_INVALID` cố ý **không nói rõ sai ở đâu** — thông báo chi tiết giúp kẻ tấn công dò
nhanh hơn.

`ErrorOrigin` là `system/auth-lib`.
