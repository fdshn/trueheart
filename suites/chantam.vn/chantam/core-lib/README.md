# `@chantam.vn/chantam.core-lib`

Contract dùng chung của nghiệp vụ Chân Tâm: **chỉ interface, enum và value object — không
có implementation**.

## Vì sao tách riêng

1. **Chia sẻ kiểu với frontend.** Next.js web và Admin CMS import trực tiếp package này,
   không cần sinh client hay đồng bộ kiểu thủ công.
2. **Ranh giới thật.** Service không thể vô tình phụ thuộc vào chi tiết implementation.
3. **Chuẩn bị tách service.** Khi `chat` tách ra thành service riêng, nó vẫn dùng chung
   contract ở đây.

## Export

| Đường dẫn import | Nội dung |
| --- | --- |
| `@chantam.vn/chantam.core-lib` | `CoreService` |
| `.../consts` | `ErrorCodes`, `ErrorOrigin`, `GiftPostCategories`, `GiftPostConditions`, `GiftPostStatuses`, `PostTypes` |
| `.../models` | `IGiftPost`, `IPost`, `IPostMedia` |
| `.../entities` | `IGiftPostEntity` + token DI, `IPostEntity` + token DI, `IPostMediaEntity` + token DI |
| `.../values` | `GiftPostId` |
| `.../dto` | Interface DTO theo từng resource, gồm owner point summary/ledger history và tóm tắt thứ hạng owner (`IGetOwnRankSummaryResponseDto`) |

## Quy ước DTO

Mỗi intent một file, chứa đủ bộ interface của intent đó:

```typescript
ICreateGiftPostDto          // dữ liệu bên trong
ICreateGiftPostBodyDto      // { giftPost: ICreateGiftPostDto }  ← body thực tế
ICreateGiftPostResponseDto  // { giftPost: IGiftPostEntity }
```

Body **luôn bọc dưới khoá resource**. Nhờ vậy về sau thêm trường cấp bao ngoài
(idempotency key, metadata client) không phá vỡ hợp đồng đã công bố.

## Mã lỗi

Định dạng `0x<ResourceId><ReasonId>`, kèm `ErrorOrigin = 'chantam/core'`. Client bắt lỗi
theo cặp `(errorOrigin, errorCode)`.

```typescript
import { ErrorCodes, ErrorOrigin } from '@chantam.vn/chantam.core-lib/consts';
```

## Vòng đời bài đăng

```
DRAFT ─▶ PENDING_REVIEW ─▶ PUBLISHED ─▶ RESERVED ─▶ DELIVERING ─▶ COMPLETED
                 │              │           │            │
                 ▼              ▼           ▼            ▼
             REJECTED       EXPIRED     CANCELLED    CANCELLED
                                │
                                ▼
                            ARCHIVED   (Kho Từ Thiện Chung)
```

`EXPIRED` ứng với quy định bài quá 3 tháng chưa có người nhận (được gia hạn tối đa 01 lần thêm 3 tháng theo SRS v1.15.0 - CHỐT-07).
