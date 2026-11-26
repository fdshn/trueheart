# Yêu cầu backend: đăng ký ủng hộ tiền cho chiến dịch từ thiện

Ngày: 24/11/2026 · Gửi: backend (repo `trueheart`, core) · Từ: mobile

## 1. Vấn đề

Chiến dịch nhận tiền (`MONEY`) hiện chỉ có một con số: số tiền **thực nhận**
(`campaign_funding_needs.confirmed_amount` + `external_amount`), do chủ dự án tự nhập.
Người ủng hộ chuyển khoản ngoài app và **không để lại dấu vết nào**:

- người ủng hộ không có lịch sử ủng hộ tiền, không được ghi tên;
- trang công khai không thấy cộng đồng đang ủng hộ tới đâu cho tới khi chủ dự án cập nhật tay.

## 2. Hướng làm

Làm cơ chế **lời khai** giống Công đức (Tâm linh, `merit-units/:id/declarations`). Khác
một điểm: backend giữ **hai dòng số liệu tách nhau**, không bao giờ cộng lẫn.

| | Số tiền đăng ký đóng góp | Số tiền thực nhận |
|---|---|---|
| Ai ghi | Người ủng hộ tự khai trong app | Chủ dự án nhập tay (như hiện nay) |
| Nguồn | Bảng lời khai mới | `confirmedAmount` + `externalAmount` của nhu cầu tiền |
| Bản chất | Lời khai, hệ thống **không** xác minh | Đã đối soát với sao kê |
| Thay đổi | Mới | **Giữ nguyên** `PATCH :id/funding-needs/:fundingNeedId` |

App không giữ tiền; người ủng hộ vẫn chuyển thẳng vào tài khoản nhận của chiến dịch. Tổng
đăng ký **không** tự cộng vào số thực nhận (cùng tinh thần mục "Tiền ≠ hiện vật" ở API.md).

## 3. Dữ liệu

Bảng mới, gợi ý `campaign_money_pledges`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `global_id` | uuid | |
| `campaign_id` | uuid FK | |
| `funding_need_id` | uuid FK, nullable | Khoản tiền người ủng hộ chọn; `null` = ủng hộ chung |
| `user_id` | uuid FK | |
| `pledged_amount` | bigint | VNĐ nguyên, 1.000 → 10.000.000.000 (dùng lại `Min/MaxMeritDeclaredAmount`) |
| `status` | text | `INTENDED` (dự định chuyển) · `COMPLETED` (người ủng hộ báo đã chuyển), đúng hai trạng thái như Công đức |
| `show_name_publicly` | bool | Mặc định theo `users.show_in_public_supporter_lists` |
| `note` | text ≤ 500, nullable | |
| `bank_account_id` | uuid FK | Tài khoản nhận đang hiệu lực lúc khai (biết tiền chuyển vào đâu khi tài khoản bị thay) |
| `transfer_content` | text | Nội dung chuyển khoản backend sinh, ví dụ `CT <mã ngắn>` |
| `declared_at`, `completed_at` | timestamptz | |
| `hidden_at`, `hidden_by`, `hidden_reason` | timestamptz, uuid FK, text ≤ 500 · nullable | Chủ dự án ẩn lời khai (xem 4.2); `hidden_at` khác `null` là đang ẩn |

`COMPLETED` vẫn chỉ là **lời khai**, không phải xác minh (như `MeritDeclarationStatus`).

## 4. API

### 4.1 Người ủng hộ

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/charity-campaigns/:id/money-pledges` | Khai đăng ký ủng hộ. Body `{ pledge: { fundingNeedId?, pledgedAmount, note?, showNamePublicly? } }`. Trả `{ pledge, transfer }` (xem dưới). |
| `PATCH` | `/charity-money-pledges/:pledgeId/complete` | Báo đã chuyển: `INTENDED → COMPLETED`. Đã `COMPLETED` → 409. |
| `GET` | `/charity-money-pledges/me?campaignId=` | Lời khai của tôi (mọi chiến dịch, hoặc lọc theo chiến dịch). |
| `GET` | `/charity-campaigns/:idOrSlug/money-pledges?fundingNeedId=&status=&cursor=&limit=` | Danh sách người đăng ký ủng hộ, **công khai** (xem 4.3). |

`transfer` trả kèm khi khai, để app dựng màn chuyển khoản giống Công đức:

```json
{
  "bankName": "Vietcombank",
  "bankBin": "970436",
  "accountNo": "9999000101",
  "accountName": "TAI KHOAN THU NGHIEM STAGING",
  "amount": 500000,
  "transferContent": "CT 7K2QX",
  "vietQrUrl": "https://img.vietqr.io/image/..."
}
```

`vietQrUrl` dựng ở backend bằng `buildVietQrUrl` như Công đức. Tài khoản nhận hiện chưa có
`bankBin`; cần thêm cột này, hoặc suy ra từ `bankName`.

**Điều kiện khai:**

- Chiến dịch đã duyệt, đang công khai, chưa đóng hoặc đình chỉ.
- Chiến dịch nhận `MONEY`, không thì `409 CHARITY_CONTRIBUTION_TYPE_DISABLED`.
- Có tài khoản nhận đang hiệu lực, không thì 409 với mã mới.
- Trước `intakeEndsAt`, không thì `409 CHARITY_INTAKE_CLOSED`.
- `fundingNeedId` nếu gửi phải là nhu cầu tiền `OPEN` của chiến dịch.
- Chủ dự án và điều phối viên không tự khai cho chiến dịch của mình.

Đề xuất có giới hạn tần suất khai để tránh spam lời khai.

### 4.2 Chủ dự án

- Chủ dự án và điều phối viên xem **danh sách người đăng ký**. Danh sách giống bản công khai,
  có thêm `note`, `transferContent` và tài khoản nhận lúc khai để tiện đối chiếu sao kê. Gợi ý
  route `GET /charity-campaigns/:id/money-pledges/manage`, cùng bộ lọc với bản công khai.
- Chủ dự án **không** đổi trạng thái `INTENDED`/`COMPLETED` (giống Công đức), nhưng được
  **ẩn** những lời khai mà họ thấy vô lý, ví dụ số tiền ảo hoặc khai trêu:

  | Method | Đường dẫn | Mô tả |
  |---|---|---|
  | `PATCH` | `/charity-money-pledges/:pledgeId/hide` | Body `{ reason? }` (≤ 500). Đã ẩn → 409. |
  | `PATCH` | `/charity-money-pledges/:pledgeId/unhide` | Bỏ ẩn. Chưa ẩn → 409. |

  - Quyền: chủ dự án hoặc điều phối viên của chiến dịch; người khác nhận 403.
  - Chỉ được ẩn hoặc bỏ ẩn **trước khi dự án kết thúc**, vì lúc kết thúc điểm đã chốt.
  - Lời khai bị ẩn thì:
    - không hiện trong danh sách công khai;
    - không tính vào `pledgedAmount`/`pledgeCount` công khai;
    - không tính người đó là người đóng góp tiền;
    - **không được cộng điểm** khi dự án kết thúc.
  - Danh sách cho chủ dự án vẫn trả lời khai bị ẩn, kèm `hiddenAt` và `hiddenReason`, để họ
    bỏ ẩn được.
  - Người khai vẫn thấy lời khai của mình ở `GET /charity-money-pledges/me`, kèm `hiddenAt` và
    `hiddenReason`.
  - **Thông báo:** khi chủ dự án ẩn, gửi thông báo trong app cho người khai, gồm tên chiến dịch,
    số tiền và lý do nếu có. Bấm vào mở chiến dịch. Gợi ý loại thông báo
    `CHARITY_MONEY_PLEDGE_HIDDEN`. Bỏ ẩn thì không bắt buộc báo; nếu báo, dùng
    `CHARITY_MONEY_PLEDGE_UNHIDDEN`.
- Số thực nhận vẫn nhập tay qua `PATCH :id/funding-needs/:fundingNeedId` (`confirmedAmount`,
  `externalAmount`) như hiện nay.

### 4.3 Công khai

- `GET :idOrSlug/public`, mỗi `fundingNeeds[i]` thêm `pledgedAmount` (tổng `COMPLETED`) và
  `pledgeCount`.
- `totals.money` thêm `pledgedAmount`; giữ `confirmedAmount`, `externalAmount`,
  `totalAmount` như cũ.
- `GET :idOrSlug/members?type=CONTRIBUTOR`: người có lời khai `COMPLETED` và cho hiện tên
  được tính là người đóng góp, `contributionTypes` thêm `MONEY`. Không trả số tiền, giống
  hiện tại.
- Danh sách người đăng ký ủng hộ là **công khai** (`GET :idOrSlug/money-pledges`), ai cũng xem
  được, không cần đăng nhập.
  - Mỗi dòng gồm người ủng hộ, khoản tiền (`fundingNeedId`), `pledgedAmount`, `status` và
    `declaredAt`/`completedAt`. Không trả `note`, `transferContent`.
  - Người chọn ẩn tên (`showNamePublicly = false`) hiện là "Ẩn danh": không trả `user`, vẫn có
    số tiền.
  - Sắp xếp mới nhất trước, phân trang theo cursor như `members`.

### 4.4 Điểm

Lời khai tiền **có cộng điểm**, theo hệ số riêng so với điểm vật phẩm. Admin cấu hình được hệ số này.

- Thêm rule `CHARITY_MONEY_PLEDGE` vào `CharityPointRuleCodes`. Admin bật hoặc tắt rule qua API
  point rules hiện có.
- Hệ số là phần trăm so với mức điểm vật phẩm (`CHARITY_ITEM_VALUE`), lưu ở khoá cấu hình mới
  `charity.money_pledge.points_percent`. **Mặc định 50.**
- Công thức:
  `floor(pledgedAmount / CharityItemValueUnitVnd × điểm rule CHARITY_ITEM_VALUE × points_percent / 100)`.
  Ví dụ với mức hiện tại (1 điểm / 10.000đ), khai 500.000đ được 25 điểm.
- Thưởng điểm của chiến dịch (`pointBonusPercent`: 0/20/50/100) **có áp dụng** cho điểm này,
  giống các điểm khác của chiến dịch.
- Trần dùng khoá `charity.points_cap.charity_money_pledge.{daily,project,cycle}`, như các rule khác.
- **Chỉ cộng khi dự án kết thúc.** Dùng mốc kết thúc dự án mà backend đang dùng. Lúc đó, mỗi
  lời khai `COMPLETED` được một award qua `CharityPointsService` (`referenceType =
  CHARITY_MONEY_PLEDGE`, `referenceId = pledgeId`). Vượt trần thì hoãn như hiện nay; job
  `charity:points` vá phần còn thiếu.
- Lời khai còn `INTENDED` hoặc đang bị ẩn khi dự án kết thúc thì **không** được cộng. Sau khi dự án kết thúc,
  không cho báo đã chuyển nữa.
- Dự án bị huỷ hoặc đình chỉ, không đi tới kết thúc, thì không cộng.
- Tỷ lệ % và thưởng của chiến dịch lấy theo giá trị **tại lúc kết thúc**.

## 5. Mã lỗi mới (gợi ý)

| Mã | Khi nào |
|---|---|
| `CHARITY_MONEY_PLEDGE_NOT_FOUND` | Không có lời khai, hoặc không phải của tôi |
| `CHARITY_MONEY_PLEDGE_ALREADY_COMPLETED` | Báo đã chuyển lần hai |
| `CHARITY_RECEIVING_ACCOUNT_REQUIRED` | Chiến dịch chưa có tài khoản nhận đang hiệu lực |
| `CHARITY_MONEY_PLEDGE_SELF` | Chủ dự án hoặc điều phối viên tự khai |
| `CHARITY_MONEY_PLEDGE_ALREADY_HIDDEN` / `CHARITY_MONEY_PLEDGE_NOT_HIDDEN` | Ẩn lời khai đã ẩn / bỏ ẩn lời khai chưa ẩn |
| `CHARITY_MONEY_PLEDGE_LOCKED` | Ẩn hoặc bỏ ẩn sau khi dự án đã kết thúc |

## 6. Phía mobile sẽ làm khi có API

- Thẻ "Cần tiền": thêm nút **Ủng hộ** cho từng khoản. Màn khai gồm số tiền, ghi chú và tuỳ chọn
  hiện tên; sau đó hiện màn chuyển khoản (QR, số tài khoản, nội dung) và nút "Tôi đã chuyển",
  giống Công đức.
- Gửi lời khai xong thì app tự đăng ký tham gia chiến dịch, như khi đóng góp hiện vật. Mobile
  tự gọi `POST :id/participation`; backend không cần làm gì thêm cho bước này.
- Trang công khai hiện hai con số tách nhau: "Đã nhận (ban tổ chức xác nhận)" và
  "Đã đăng ký ủng hộ (lời khai)".
- Danh sách người đăng ký ủng hộ (công khai) trên trang chiến dịch. Chủ dự án xem bản có ghi chú
  và nội dung chuyển khoản, và có nút **Ẩn** (kèm lý do) / **Bỏ ẩn** trên từng dòng.
- Người bị ẩn nhận thông báo. Trong lịch sử của họ, lời khai đó có nhãn "Đã bị ẩn" và lý do.
- Cá nhân: lịch sử ủng hộ tiền của tôi.

## 7. Product đã chốt (25/11/2026)

1. Ủng hộ tiền có cộng điểm, mặc định bằng 50% điểm vật phẩm. Ví dụ khai 500.000đ được 25 điểm,
   còn vật phẩm trị giá 500.000đ được 50 điểm. Admin đổi được tỷ lệ % này.
2. Điểm chỉ cộng **khi dự án kết thúc**, không cộng lúc người dùng báo đã chuyển.
3. Thưởng điểm của chiến dịch áp dụng cho điểm ủng hộ tiền.
4. Chủ dự án xem được danh sách người đăng ký. Danh sách này cũng công khai.
5. Chủ dự án được ẩn lời khai vô lý. Lời khai bị ẩn không công khai, không tính tổng, không cộng
   điểm. Người bị ẩn nhận thông báo.
