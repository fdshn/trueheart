# `@chantam/service.common-lib`

Thư viện nền tảng dùng chung cho mọi service. Không chứa nghiệp vụ, không phụ thuộc
database — có thể tái sử dụng nguyên vẹn cho sản phẩm khác.

## Export chính

| Đường dẫn import | Nội dung |
| --- | --- |
| `@chantam/service.common-lib` | `IUseCase`, `IGenericUseCase` |
| `@chantam/service.common-lib/dto` | `ResponseDto`, `PaginationQueryDto`, `PaginationMetaDto`, `toSkipTake()` |
| `@chantam/service.common-lib/exception` | `Exception`, `ApplicationExceptionFilter`, các exception nền tảng |
| `@chantam/service.common-lib/consts` | `ErrorCodes`, `ErrorOrigin`, `AppId` |
| `@chantam/service.common-lib/modules` | `AppContextModule`, `BaseControllerModule`, `DocsModule` |
| `@chantam/service.common-lib/utils` | `makeGlobalId()`, `definedProps()`, kiểu tiện ích |

## Use case

```typescript
export interface ICreateGiftPostUseCase
  extends IUseCase<ICreateGiftPostCommand, ICreateGiftPostResult> {}
export const ICreateGiftPostUseCase = Symbol('ICreateGiftPostUseCase');
```

Method là `handle()`, không phải `execute()`.

## ResponseDto

Mọi endpoint trả về đúng một hình dạng, kể cả khi lỗi:

```jsonc
// thành công
{ "success": true, "errorCode": 0, "message": [], "body": { "giftPost": { } } }

// lỗi
{ "success": false, "errorCode": 513, "errorOrigin": "chantam/core",
  "message": ["Không tìm thấy bài đăng ..."], "body": null }
```

```typescript
return ResponseDto.create<IGetGiftPostResponseDto>().succeed().attach(result).build();
```

## Exception

```typescript
export class GiftPostNotFoundException extends Exception {
  public static readonly httpStatus = HttpStatus.NOT_FOUND;

  public constructor(globalId: string) {
    super(ErrorCodes.GIFT_POST_NOT_FOUND, `Không tìm thấy bài đăng ${globalId}`,
      undefined, ErrorOrigin);
  }
}
```

`ApplicationExceptionFilter` đọc `httpStatus` tĩnh của class để chọn mã HTTP.

## BaseControllerModule

`BaseControllerModule.forRoot()` gắn một lần cho cả service:

- `ValidationPipe` — `whitelist` loại field lạ, lỗi validate quy về `VALIDATION_FAILED`
- `ClassSerializerInterceptor` — tôn trọng `@Exclude()` trên entity
- `ApplicationExceptionFilter` — quy mọi lỗi về `ResponseDto`

## Build

`npm run build` (`nest build && tsc-alias`) emit `.js` + `.d.ts` ra **thư mục gốc package**,
nhờ đó import subpath (`.../dto`, `.../modules`) hoạt động mà không cần khai báo `exports`.
Sau khi sửa lib, phải build lại thì service phụ thuộc mới thấy thay đổi.
