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
| `.../consts` | Enum và hằng nghiệp vụ: `ErrorCodes`/`ErrorOrigin`, trạng thái bài (`GiftPostStatuses`), `PostTypes`, `PostSelectionModes`, loại/trạng thái phòng chat, hạng, thông báo, bảng thành tích, presence, attribution… — mỗi chủ đề một file trong `src/consts/` |
| `.../models` | Interface model (`IPost`, `IPostMedia`, `IGiftPost`…) và **hàm thuần** dùng chung cho cả service lẫn client: vòng đời bài (`post-lifecycle`), điểm danh, kiểm duyệt nội dung, phân bổ, deep link, Âm lịch… |
| `.../models` — charity beneficiary accounts | `CharityBeneficiaryAccountHolderTypes`/`CharityBeneficiaryAccountHolderType`, beneficiary account input/read models, and `normalizeHolderName`/`holderNameMatches` for verified payout-account holder matching. |
| `.../models` — charity intake | `CharityContributionTypes`/`CharityContributionType`, `ICharityIntakeCounts`, `charitySubmitRequirementGaps`, `deriveAcceptedContributionTypes`, và `normalizeContributionTypes` cho loại tiếp nhận và điều kiện gửi duyệt chiến dịch. |
| `.../models` — charity distribution | `CharityDistributionMethods`/`CharityDistributionMethod`, `CharityServiceChannels`/`CharityServiceChannel`, `CharityShippingFeePayers`/`CharityShippingFeePayer`, `MaxCharityRoundEvidenceUrls`, input types, và các hàm thuần `charityDistributionFieldGaps`, `charityDistributionMismatch`, `charityRoundEvidenceGaps`, `stripInapplicableDistributionFields` cho luật hình thức trao theo đợt. |
| `.../entities` | Interface entity + token DI (`IPostEntity`, `IPostMediaEntity`, `IGiftPostEntity`, `IChatRoomEntity`, `IUserEntity`…) |
| `.../values` | Value object `GiftPostId`, `UserId` |
| `.../dto` | Interface DTO theo từng resource, mỗi resource một thư mục trong `src/dto/` (post, gift-request, transaction, chat, check-in, leaderboard, presence, user-block, attribution…) |

Danh sách đầy đủ: xem `index.ts` của từng thư mục.

## Quy ước DTO

`IUpdatePostDto` supports owner content/category/quantity/SOS/delivery changes and
typed OFFER/CLASSIFIED details. Nullable deliveryMethod explicitly clears the method;
omitted fields retain their values. Status/type/author/expiry are server-owned.
`IGetPostResponseDto.canEdit` is an owner capability hint, never a substitute for
backend authorization and transaction-safe lifecycle checks at save time.

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

`ErrorCodes` gồm cả `CHARITY_CONTRIBUTION_TYPE_DISABLED` (`0x13_55`) và
`CHARITY_SUBMIT_REQUIREMENTS_UNMET` (`0x13_56`) cho các luồng tiếp nhận và gửi duyệt chiến dịch,
và `CHARITY_DISTRIBUTION_FIELD_REQUIRED` (`0x13_57`),
`CHARITY_DISTRIBUTION_METHOD_MISMATCH` (`0x13_58`),
`CHARITY_ROUND_EVIDENCE_REQUIRED` (`0x13_59`) cho luật hình thức trao theo đợt, cùng
`CHARITY_BENEFICIARY_ACCOUNT_NAME_MISMATCH` (`0x13_5a`) và
`CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED` (`0x13_5b`) cho xác thực tài khoản thụ hưởng.

## Vòng đời bài đăng

```
PUBLISHED ─▶ RESERVED ─▶ COMPLETED
    │            │
    ├─▶ EXPIRED  ▼
    │     │    CANCELLED
    │     ▼
    │   ARCHIVED   (Kho Từ Thiện Chung)
    │
    └─▶ SOLD / HIDDEN   (chỉ Rao vặt, chủ bài tự đổi; HIDDEN mở lại được)
```

Bài mới tạo **thẳng ở `PUBLISHED`** — không còn duyệt trước, Admin gỡ về sau qua hậu kiểm.
`DRAFT`, `PENDING_REVIEW`, `REJECTED` vẫn có trong enum nhưng đường tạo bài không ghi ra.
`DELIVERING` đã ngừng ghi (chốt 29/09 giữ `RESERVED`), chỉ còn được đọc như lưới hứng dòng sót.

Hạn `EXPIRED` theo `postExpiryDateFor` (`src/models/post-lifecycle.ts`): `OFFER`/`WANTED` sống
7 ngày xét ứng viên + 30 ngày mở rộng = **37 ngày** từ lúc đăng (CHỐT-10); các loại khác
**3 tháng**. Gia hạn tối đa 01 lần (CHỐT-07).
