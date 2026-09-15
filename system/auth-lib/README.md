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
| Thu hồi được | Không | Có, ngay lập tức |

**Vì sao refresh token không phải JWT:** nó phải thu hồi được ngay. JWT chỉ hết hiệu lực khi
hết hạn, nên muốn thu hồi vẫn phải tra một bảng — mà đã tra bảng thì JWT không còn đem lại
lợi ích nào, chỉ thêm kích thước và thêm chỗ sai.

**Vì sao băm refresh token bằng SHA-256 chứ không phải bcrypt:** token đã là 256 bit ngẫu
nhiên nên không có gì để dò từ điển, và mỗi lần refresh đều phải tra bảng — bcrypt sẽ biến
thao tác tra cứu thành hàng trăm mili giây vô ích.

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

`TOKEN_EXPIRED` tách riêng khỏi `TOKEN_INVALID` để client biết khi nào nên **tự refresh** thay
vì đá người dùng ra màn đăng nhập.

`TOKEN_INVALID` cố ý **không nói rõ sai ở đâu** — thông báo chi tiết giúp kẻ tấn công dò
nhanh hơn.

`ErrorOrigin` là `system/auth-lib`.
