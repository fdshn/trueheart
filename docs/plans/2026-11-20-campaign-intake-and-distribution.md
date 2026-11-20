# CR chiến dịch từ thiện — cách tiếp nhận quyên góp và hình thức trao tặng

> Trạng thái: **đã chốt 3 điểm mở (§6, 20/11/2026), chờ triển khai**. Mở rộng [`CHARITY-PROJECT-LIFECYCLE.md`](../plan/CHARITY-PROJECT-LIFECYCLE.md)
> (§3.1 tiến độ 4 bước, §3.11 các nhóm nhu cầu, §3.18 nhiều đợt trao) và không thay thế tài liệu đó.

## 1. Vấn đề

Form tạo chiến dịch chưa có cấu hình cho hai câu hỏi khác nhau:

| Nhóm | Câu hỏi | Đối tượng |
| --- | --- | --- |
| **Tiếp nhận quyên góp** (intake) | Người đóng góp gửi hiện vật, tiền hoặc công sức/dịch vụ vào chiến dịch bằng cách nào? | Người đóng góp → BTC |
| **Trao tặng** (distribution) | BTC chuyển kết quả đến người thụ hưởng bằng cách nào? | BTC → người thụ hưởng |

Hai luồng này phải tách riêng ở contract. Không dùng một trường `deliveryMethod` chung để biểu
diễn cả hai.

## 2. Đối chiếu với code hiện tại (main `b339145`)

| Nhận định ban đầu | Thực tế trong code | Kết luận |
| --- | --- | --- |
| API tạo chiến dịch chưa nhận cấu hình trao/tiếp nhận | `WriteCharityCampaignDto` (`POST /charity-campaigns`) chỉ có `needs` (hiện vật), không có `distribution` hay `acceptedContributionTypes` | **Đúng** |
| Backend chỉ có `deliveryMethod` ở dữ liệu vận hành sau này | `campaign_phases.delivery_method` (`ON_SITE` \| `SHIP` \| `TRANSFER`) là dữ liệu **kế hoạch**, chỉ cho bước `DISTRIBUTION`, ghi qua `PUT /charity-campaigns/:id/phases`. Đợt trao (`/:id/rounds`) đã có `locationLabel`, `address`, `startsAt`, `endsAt` nhưng **chưa có hình thức trao** | **Đúng một phần.** Đã có trường nhưng chỉ 3 giá trị, gắn ở cấp dự án nên không biểu diễn được dự án nhiều đợt với nhiều hình thức trao |
| Model nhu cầu chỉ hợp với hiện vật, cần thêm `needType` | Ba nhóm nhu cầu **đã tách thành ba bảng**: hiện vật `campaign_need_items`, tiền `campaign_funding_needs` (`/:id/funding-needs`), dịch vụ/công sức `campaign_other_support_needs` (`/:id/other-support-needs`, `supportType` gồm `TRANSPORT`, `LABOR`, `SKILL_SERVICE`…) | **Sai.** Không thêm `needType` vào `campaign_need_items`, vì gộp ba bảng sẽ phá contract và read model đã có (§3.11). Loại nhu cầu là chính bảng chứa nó |
| Dữ liệu ngân hàng/vận đơn/địa chỉ/SĐT người thụ hưởng phải riêng tư | Đã có tách `GET :id/workspace` và `GET :id/public` (§3.12). `campaign_bank_accounts` hiện là tài khoản **nhận** của dự án, công khai để minh bạch | **Đúng.** Lưu ý tài khoản của **người thụ hưởng** khác tài khoản nhận của dự án, nên phải là dữ liệu riêng |

## 3. Quyết định đề xuất

### 3.1 Tiếp nhận quyên góp

- Thêm `campaigns.accepted_contribution_types text[]`, giá trị `MATERIAL` | `MONEY` | `SERVICE`.
  - `MATERIAL` ứng với `campaign_need_items`.
  - `MONEY` ứng với `campaign_funding_needs`. App không giữ tiền; người đóng góp chuyển vào tài
    khoản nhận đang hiệu lực của dự án.
  - `SERVICE` ứng với `campaign_other_support_needs`.
- Khi gửi duyệt (`submit`), mỗi loại đã bật phải có ít nhất một nhu cầu đang mở. Bật `MONEY`
  thì phải có ít nhất một tài khoản nhận đang hiệu lực.
- Backend chặn đóng góp vào nhóm chưa bật, gồm cả trường hợp gọi API trực tiếp.
- `POST /charity-campaigns` nhận thêm `fundingNeeds[]` và `otherSupportNeeds[]` cạnh `needs[]`
  để form tạo lưu được trong một lần gọi. Schema từng phần tử giống endpoint riêng đã có.
- Mobile/Admin hiển thị ba tab riêng: **Hiện vật**, **Tiền/chuyển khoản**, **Dịch vụ/công sức**.

### 3.2 Hình thức trao tặng

Enum mới `CharityDistributionMethods`:

| Giá trị | Ý nghĩa | Dữ liệu bắt buộc | Bằng chứng hoàn tất |
| --- | --- | --- | --- |
| `DIRECT_RECIPIENT` | Trao trực tiếp tại nơi ở người nhận | Địa chỉ người thụ hưởng, thời gian dự kiến, người phụ trách + SĐT nội bộ | Ảnh/biên nhận đã trao |
| `SHIPPING` | Chuyển phát | Người nhận, SĐT, địa chỉ nhận, đơn vị vận chuyển, bên chịu phí, phí dự kiến | Mã vận đơn (text tự do) + ảnh/xác nhận giao thành công |
| `OTHER_LOCATION` | Trao tại một địa điểm khác | Tên điểm trao, địa chỉ/GPS, khung thời gian, người phụ trách | Danh sách hoặc mã xác nhận người nhận |
| `BANK_TRANSFER` | Chuyển khoản cho người thụ hưởng | Tài khoản thụ hưởng đã xác thực, nội dung chuyển khoản chuẩn | Ảnh sao kê/chứng từ |
| `SERVICE` | Hỗ trợ phi vật thể/dịch vụ | Loại hỗ trợ, kênh (`IN_PERSON` \| `ONLINE` \| `HOTLINE` \| `APPOINTMENT`), thời gian, người/đơn vị phụ trách | Bằng chứng hoàn thành |

Khác so với bản đề xuất ban đầu:

1. **`SERVICE` thay cho `DIGITAL_SERVICE`.** Dịch vụ có thể trực tiếp (công lao động, vận
   chuyển), không chỉ online. Kênh thực hiện là trường riêng.
2. **Hình thức trao gắn với đợt trao, không gắn với dự án.** Theo §3.18, một dự án có nhiều
   đợt/địa điểm, và có thể vừa chuyển khoản tiền vừa trao hiện vật tận nơi. Thêm vào đợt trao
   (`campaign_distribution_rounds`):
   - `distribution_method`, `contribution_types text[]` (đợt này trao loại nào);
   - các trường chi tiết theo bảng trên. Trường riêng tư lưu ở bảng con
     `campaign_round_private_details` để public projection không thể đọc nhầm.
3. **Form tạo chiến dịch** nhận `distribution` như bản đề xuất, nhưng backend coi đó là **đợt
   trao đầu tiên** và tạo một round. Form tạo vẫn chỉ cần một khối nhập, đồng thời không sinh
   ra hai nguồn dữ liệu.
4. **`BANK_TRANSFER` chỉ hợp lệ khi đợt có `MONEY`.** Tài khoản người thụ hưởng lưu ở bảng riêng
   `campaign_beneficiary_bank_accounts` (gắn `campaign_parties` role `BENEFICIARY`, có
   `holder_type`, `verified_at`/`verified_by`; quy tắc ở §6.2), không trộn với
   `campaign_bank_accounts` công khai.
5. **Không tích hợp đơn vị vận chuyển.** Mã vận đơn là text, giữ nguyên quyết định CH-2 ở
   `consts/delivery.ts`.

`campaign_phases.delivery_method` cũ: giữ đọc để tương thích, **ngừng ghi** sau khi mobile
chuyển sang round. Migration ánh xạ `SHIP` → `SHIPPING`, `TRANSFER` → `BANK_TRANSFER`.
`ON_SITE` không xác định được là tận nhà hay điểm khác, nên ánh xạ sang `OTHER_LOCATION` và
gắn cờ `needs_review` để owner xác nhận.

### 3.3 Payload tạo chiến dịch

```json
{
  "campaign": {
    "acceptedContributionTypes": ["MATERIAL", "MONEY", "SERVICE"],
    "needs": [{ "itemName": "Áo ấm", "unit": "chiếc", "targetQuantity": 200 }],
    "fundingNeeds": [{ "title": "Tiền xây bếp", "targetAmount": 30000000 }],
    "otherSupportNeeds": [{ "supportType": "TRANSPORT", "title": "Xe chở hàng", "unit": "chuyến", "targetQuantity": 2 }],
    "distribution": {
      "method": "OTHER_LOCATION",
      "contributionTypes": ["MATERIAL"],
      "location": { "label": "Nhà văn hoá xã", "address": "…", "lat": 0, "lng": 0 },
      "scheduledStart": "2026-12-20T01:00:00Z",
      "scheduledEnd": "2026-12-20T09:00:00Z",
      "coordinatorName": "…",
      "coordinatorPhone": "…"
    }
  }
}
```

Validation theo `method`: mỗi hình thức có tập trường bắt buộc riêng (bảng §3.2). Thiếu trường
trả lỗi nghiệp vụ mới `CHARITY_DISTRIBUTION_FIELD_REQUIRED` kèm tên field. Sai cặp
method/loại (ví dụ `BANK_TRANSFER` không có `MONEY`) trả `CHARITY_DISTRIBUTION_METHOD_MISMATCH`.

### 3.4 Quyền xem

| Dữ liệu | Public | Participant đã duyệt | Owner/BTC/coordinator, Admin |
| --- | --- | --- | --- |
| Loại tiếp nhận, hình thức trao, khung thời gian, tên điểm trao `OTHER_LOCATION` | ✔ | ✔ | ✔ |
| Địa chỉ/GPS điểm trao `OTHER_LOCATION` | ✔ | ✔ | ✔ |
| Địa chỉ nhà, SĐT người thụ hưởng, người nhận ship | ✘ | ✘ | ✔ |
| Tài khoản người thụ hưởng, mã vận đơn, SĐT phụ trách nội bộ | ✘ | ✘ | ✔ |
| Ảnh bằng chứng đã trao (mọi hình thức, kể cả tận nhà) | ✔ (§6.3) | ✔ | ✔ |

Backend enforce ở DTO public/workspace. Client không tự ẩn field.

### 3.5 Hiển thị chi tiết và tổng kết

- Chi tiết chiến dịch: khối **Tiếp nhận** liệt kê hiện vật/tiền/dịch vụ được nhận. Khối **Trao
  tặng** liệt kê từng đợt với hình thức, thời gian và địa điểm công khai.
- Tổng kết: ba tổng riêng, gồm tổng hiện vật hoàn tất (số lượng + giá trị quy đổi), tổng tiền
  (đối soát với `campaign_financial_reports`) và tổng dịch vụ hoàn thành (theo đơn vị). Không cộng
  dồn ba nhóm thành một con số.
- Điều kiện hoàn tất đợt: thiếu bằng chứng đúng hình thức thì không chuyển được `DONE`. Ví dụ
  `SHIPPING` thiếu xác nhận giao, `BANK_TRANSFER` thiếu chứng từ.

## 4. Phạm vi theo đội

**Backend**

1. Migration: `campaigns.accepted_contribution_types`, cột hình thức trao trên round,
   `campaign_round_private_details`, `campaign_beneficiary_bank_accounts`, ánh xạ dữ liệu
   `campaign_phases.delivery_method`.
2. `POST /charity-campaigns` và `PATCH` nhận `acceptedContributionTypes`, `fundingNeeds`,
   `otherSupportNeeds`, `distribution`.
3. `POST/PATCH /:id/rounds` nhận `distributionMethod`, `contributionTypes` và chi tiết theo method.
4. Chặn đóng góp vào nhóm chưa bật. Điều kiện gửi duyệt và điều kiện `DONE` của round theo §3.1, §3.5.
5. Tách DTO public/workspace theo §3.4. Thêm error code vào catalog, Swagger, API.md, DATABASE.md.
6. Test: từng method thiếu/đủ trường, method sai loại, đóng góp vào nhóm tắt, public không lộ
   trường riêng tư, migration dữ liệu cũ, dự án nhiều đợt khác hình thức.

**Admin (FE)**

- Form tạo/sửa: tab tiếp nhận ba nhóm, khối hình thức trao (động theo method).
- Màn duyệt hiển thị đủ cả hai khối và cờ `needs_review` từ migration.
- Màn xác thực tài khoản người thụ hưởng.

**Mobile**

- Form tạo: hai khối riêng như trên. Màn chi tiết/tổng kết theo §3.5.
- Chỉ hiện nút đóng góp cho nhóm chiến dịch đã bật.

## 5. Tương thích

- Chiến dịch cũ: `accepted_contribution_types` suy từ dữ liệu, gồm `MATERIAL` nếu có
  `campaign_need_items`, `MONEY` nếu có `campaign_funding_needs` và `SERVICE` nếu có
  `campaign_other_support_needs`. Round cũ không có method trả `null`, và client hiển thị
  "chưa cập nhật".
- `deliveryMethod` trên phases vẫn trả trong một bản phát hành, đánh dấu deprecated ở Swagger.

## 6. Quyết định đã chốt (20/11/2026)

1. **Mỗi đợt trao chỉ dùng một hình thức.** Cần hình thức khác (ví dụ ship cho người không
   đến được điểm trao) thì tạo đợt riêng. Backend validate `distributionMethod` là một giá
   trị đơn.
2. **Tài khoản thụ hưởng là tài khoản của chủ dự án hoặc của chính người được từ thiện.**
   `campaign_beneficiary_bank_accounts` có `holder_type` (`OWNER` | `BENEFICIARY`):
   - `OWNER`: tên chủ tài khoản phải khớp tên đã xác minh của chủ dự án;
   - `BENEFICIARY`: tên chủ tài khoản phải khớp bên thụ hưởng (`campaign_parties` role
     `BENEFICIARY`).
   Không nhận tài khoản của bên thứ ba. Admin kiểm tra tên khớp trong bước duyệt chiến dịch
   (`verified_at`/`verified_by`). Mỗi lần đổi tài khoản phải duyệt lại.
3. **Ảnh bằng chứng trao tặng được công khai, kể cả ảnh trao tận nhà.** Thông tin dạng text
   (địa chỉ nhà, SĐT, tài khoản, mã vận đơn) vẫn riêng tư theo §3.4. Ảnh công khai dùng đồng ý
   đã thu ở bên thụ hưởng (`consent_at`); BTC chịu trách nhiệm không để lộ số nhà/giấy tờ
   trong ảnh, Admin ẩn được ảnh vi phạm qua báo cáo.

## 7. Tiêu chí nghiệm thu

- Tạo chiến dịch với đủ ba nhóm tiếp nhận và một hình thức trao trong **một** lần gọi. Đọc lại
  workspace thấy đủ dữ liệu, không mất trường nào.
- Public API không trả địa chỉ nhà, SĐT, tài khoản thụ hưởng, mã vận đơn.
- Gọi API đóng góp tiền vào chiến dịch không bật `MONEY` bị từ chối.
- Round `BANK_TRANSFER` không có `MONEY` bị từ chối. Tài khoản thụ hưởng không phải của chủ dự
  án hoặc người được từ thiện bị từ chối. Round thiếu bằng chứng đúng hình thức
  không chuyển `DONE` được.
- Tổng kết hiển thị ba tổng riêng: hiện vật, tiền, dịch vụ.
- Chiến dịch cũ sau migration vẫn mở/đọc được bình thường.
