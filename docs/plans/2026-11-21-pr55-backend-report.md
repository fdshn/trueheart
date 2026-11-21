# Báo cáo backend: tiếp nhận quyên góp và hình thức trao tặng (PR #55)

Ngày: 21/11/2026. Nguồn yêu cầu: `docs/plans/2026-11-20-campaign-intake-and-distribution.md`
(PR #55, merge `17f7463d`). Code trên `main`: 22 commit, `7a6199e7` → `10d7e57d`.
Chi tiết API đầy đủ xem `docs/API.md`, bảng và cột xem `docs/DATABASE.md`.

## 1. Tóm tắt cho mobile/FE

Yêu cầu PR #55 trông như "thêm vài trường vào body tạo chiến dịch và vài API GET". Thực tế
backend phải thêm 3 migration, 2 bảng mới, 7 mã lỗi, 3 route mới và đổi luật ở nhiều route có
sẵn. Ba điều client cần nắm trước tiên:

1. **Tiền ≠ hiện vật.** App không giữ tiền và **không có API để người dùng góp tiền**. Tiền chỉ
   do BTC ghi qua `PATCH /charity-campaigns/:id/funding-needs/:fundingNeedId`
   (`confirmedAmount`, `externalAmount`). `POST /charity-deliveries/:id/complete` và
   `confirmedValue` là **giá trị quy đổi của hiện vật**, không bao giờ dùng để xác nhận tiền.
   Cách hiểu "xác nhận đã nhận tiền dùng chung API xác nhận đã nhận đồ" là **sai**.
2. **Mỗi người xem nhận dữ liệu khác nhau.** Public không có địa chỉ nhà, SĐT người nhận, mã vận
   đơn, tài khoản thụ hưởng; workspace của BTC thì có.
3. **Có điều kiện mới ở các bước chuyển trạng thái:** gửi duyệt, đóng góp, chuyển đợt sang
   `DONE`. Client cần xử lý các mã lỗi mới ở mục 5.

## 2. Thay đổi theo từng đợt

### Đợt A: loại tiếp nhận (`acceptedContributionTypes`)

- Cột mới `campaigns.accepted_contribution_types` nhận các giá trị `MATERIAL`, `MONEY`,
  `SERVICE`. Migration `1803700000000` suy giá trị cho chiến dịch cũ từ dữ liệu sẵn có:
  - `MATERIAL` nếu có nhu cầu hiện vật;
  - `MONEY` nếu có nhu cầu tiền **hoặc** có tài khoản nhận còn hiệu lực;
  - `SERVICE` nếu có nhu cầu dịch vụ.
- `POST /charity-campaigns` nhận thêm `acceptedContributionTypes`, `fundingNeeds[]`,
  `otherSupportNeeds[]`. Không gửi `acceptedContributionTypes` thì backend suy từ các mảng nhu
  cầu có phần tử. Ví dụ chỉ gửi `needs` thì được `['MATERIAL']`.
- Sửa loại tiếp nhận: chủ dự án qua `PUT :id/profile`, Admin qua
  `PATCH /admin/charity-campaigns/:id`.
- **Chặn theo loại:**
  - Loại chưa bật thì không đóng góp, không nhận hỗ trợ dịch vụ được.
  - `MONEY` tắt thì không tạo được nhu cầu tiền, không thêm được tài khoản nhận hay tài khoản
    thụ hưởng, và public ẩn tài khoản nhận, nhu cầu tiền, phần tiền trong `public-stats` và
    trong file PDF xuất ra.
  - Rút đề nghị đóng góp, đóng tài khoản và nhu cầu tình nguyện viên không bị chặn.
- **Điều kiện gửi duyệt** áp ở cả ba đường: `POST :id/submit`, tạo kèm `submit`, Admin tạo.
  Mỗi loại đã bật cần một điều kiện:
  - `MATERIAL`: ít nhất một nhu cầu hiện vật đang mở.
  - `MONEY`: ít nhất một nhu cầu tiền đang mở **và** một tài khoản nhận đang hiệu lực.
  - `SERVICE`: ít nhất một nhu cầu dịch vụ đang mở.

### Đợt B: hình thức trao trên từng đợt

- Đợt trao (`campaign_distribution_rounds`) có thêm `distributionMethod`, `contributionTypes`,
  `evidenceUrls` (https, tối đa 20, không trùng), `needsReview`, `serviceType`,
  `serviceChannel`, `lat`/`lng`.
- Bảng mới `campaign_round_private_details` chứa người nhận, SĐT, địa chỉ nhà, người phụ trách,
  hãng vận chuyển, phí ship, mã vận đơn, nội dung chuyển khoản. **Chỉ workspace đọc bảng này.**
- 5 hình thức (`DIRECT_RECIPIENT`, `SHIPPING`, `OTHER_LOCATION`, `BANK_TRANSFER`, `SERVICE`),
  mỗi hình thức có tập trường bắt buộc riêng. Thiếu trường trả `0x13_57`. `BANK_TRANSFER` khi
  chiến dịch chưa bật `MONEY` trả `0x13_58`.
- Địa chỉ chỉ công khai với `OTHER_LOCATION`. Với `DIRECT_RECIPIENT`/`SHIPPING`, backend tự
  chuyển `address` vào `recipientAddress` (riêng tư), và public trả `null`.
- **`DONE` cần bằng chứng:** ít nhất một ảnh. `SHIPPING` cần thêm mã vận đơn. Thiếu thì trả
  `0x13_59`.
- Khối `distribution` trong body tạo chiến dịch được backend tách thành **đợt trao đầu tiên** và
  khung giờ của phase `DISTRIBUTION`, ghi trong cùng một transaction.
- Migration `1803800000000` ánh xạ `delivery_method` cũ sang hình thức mới (`SHIP→SHIPPING`,
  `TRANSFER→BANK_TRANSFER`, `ON_SITE→OTHER_LOCATION` kèm `needsReview = true`), chỉ khi chiến
  dịch có đúng một đợt.
- Job dọn ảnh mồ côi đã được dạy **không xoá ảnh bằng chứng** của đợt trao.

### Đợt C: tài khoản thụ hưởng

- Bảng mới `campaign_beneficiary_bank_accounts`, có phiên bản như tài khoản nhận: thay tài khoản
  là tạo bản mới và đóng bản cũ.
- Route mới:
  - `POST /charity-campaigns/:id/beneficiary-bank-accounts`: thêm hoặc thay tài khoản.
  - `POST /charity-campaigns/:id/beneficiary-bank-accounts/:accountId/close`: đóng tài khoản.
  - `POST /admin/charity-campaigns/:id/beneficiary-bank-accounts/:accountId/verify`: Admin
    xác thực, cần quyền `campaign.manage`.
- **So tên chủ tài khoản:** bỏ dấu, không phân biệt hoa thường, gộp khoảng trắng, xử lý cả
  `đ`/`Đ`. Tên được so với `users.full_name` của chủ dự án (`OWNER`) hoặc tên bên thụ hưởng
  (`BENEFICIARY`). Lệch thì trả `0x13_5a`.
- Tài khoản mới hoặc bản thay thế **luôn chưa xác thực**, Admin phải xác thực lại.
- Đợt `BANK_TRANSFER` chỉ chuyển `DONE` được khi gắn tài khoản còn hiệu lực, cùng chiến dịch và
  đã xác thực; nếu không thì trả `0x13_5b`.
- Không xoá được bên thụ hưởng còn tài khoản đang hiệu lực (400).
- Coordinator không thấy tài khoản của người được kêu gọi cá nhân.

### Đợt D: tổng kết ba tổng

- Bảng tổng kết và trang dự án công khai trả `totals { material, money, service }`.
  **Không có tổng chung**, vì ba đơn vị đo khác nhau.
- Public: `totals = null` cho đến khi tổng kết được công khai. Nếu `MONEY` tắt thì
  `totals.money = null`.

## 3. Những chỗ khó và cách xử lý

| Vấn đề | Vì sao khó | Cách xử lý |
| --- | --- | --- |
| Lộ dữ liệu riêng tư ra public | Một đợt trao có cả trường công khai lẫn SĐT, địa chỉ nhà, mã vận đơn; chỉ cần một đường đọc lỡ trả cả object là lộ | Tách bảng riêng tư; view public chọn từng trường một (allowlist), không spread object; có kiểm tra trên DB thật rằng JSON public không chứa SĐT và địa chỉ |
| Lách điều kiện `DONE` | Lúc đầu PATCH đợt mà không gửi hình thức sẽ đưa đợt về `null`, mà đợt `null` thì không cần bằng chứng, nên ai cũng chuyển `DONE` được | PATCH bỏ trống `distributionMethod` thì giữ nguyên toàn bộ trường trao tặng; gửi `null` cho đợt đã có hình thức thì trả 400 |
| Client cũ mất dữ liệu | App cũ chỉ sửa tiêu đề hay giờ nhưng body thiếu trường mới, nên PATCH ghi đè rỗng | Cùng cách trên: client cũ không gửi `distributionMethod` thì dữ liệu được giữ |
| Admin tạo chiến dịch có tiền bị kẹt | Admin tạo là gửi duyệt luôn, nhưng lúc tạo thì chưa thể có tài khoản nhận | Admin tạo được bỏ riêng điều kiện "MONEY phải có tài khoản nhận" |
| Tắt MONEY làm kẹt hoàn thành dự án | Nhu cầu tiền còn mở chặn hoàn thành, mà tắt MONEY lại chặn sửa nhu cầu tiền | Khi MONEY tắt vẫn cho **đóng** nhu cầu tiền và ghi số tiền đã nhận; tạo mới hay sửa khác vẫn bị chặn |
| So tên tiếng Việt | NFD không tách được `đ`/`Đ`; tên ngân hàng viết hoa không dấu; khoảng trắng thừa; `full_name` rỗng | Đổi `đ→d` trước khi chuẩn hoá, bỏ dấu, gộp khoảng trắng; `full_name` rỗng thì tính là lệch |
| Chiến dịch cũ và seed | Cột mới mặc định rỗng sẽ làm mọi chiến dịch cũ từ chối đóng góp | Mặc định cả 3 loại, migration suy giá trị từ dữ liệu; seed không ghi cột mới (vẫn chạy được trên schema cũ) |
| Ảnh bằng chứng bị dọn nhầm | Job dọn ảnh không biết cột `evidence_urls` mới | Thêm nguồn ảnh này vào danh sách ảnh đang dùng, có test giữ chặt |
| DTO lỏng hơn cột DB | Ví dụ mã vận đơn cho 200 ký tự nhưng cột chỉ 100, nên nhập dài gây lỗi 500 | Cho giới hạn DTO khớp đúng độ rộng cột |
| Hai luật mâu thuẫn | Cho phép tạo đợt `BANK_TRANSFER` khi chưa bật MONEY, nhưng lại chặn thêm tài khoản thụ hưởng khi chưa bật MONEY, nên đợt không bao giờ `DONE` được | Chặn ngay từ lúc lưu đợt `BANK_TRANSFER` nếu chiến dịch chưa bật MONEY |

## 4. Thay đổi hành vi client cần chú ý

- **PATCH đợt trao:** gửi `distributionMethod` thì là **thay toàn bộ** trường trao tặng, kể cả
  chi tiết riêng tư, nên phải gửi lại đủ. Không gửi `distributionMethod` thì backend giữ nguyên
  các trường đó.
- **Bật MONEY để nhận tiền:** chiến dịch tạo mà không có nhu cầu tiền sẽ không có `MONEY`.
  Muốn thêm tài khoản nhận hay nhu cầu tiền thì bật trước qua `PUT :id/profile`.
- **Gửi duyệt chiến dịch có MONEY:** lưu nháp (`submit: false`), thêm tài khoản nhận, rồi gọi
  `POST :id/submit`.
- **`GET :idOrSlug/public-stats`:** `funding` có thể là `null` khi chiến dịch tắt MONEY.
- **`PUT :id/phases`:** vẫn nhận `deliveryMethod` cũ trong một bản phát hành, đã đánh dấu
  deprecated.

## 5. Mã lỗi mới

| Mã | Tên | HTTP | Khi nào |
| --- | --- | --- | --- |
| `0x13_55` | `CHARITY_CONTRIBUTION_TYPE_DISABLED` | 409 | Thao tác thuộc loại tiếp nhận chưa bật |
| `0x13_56` | `CHARITY_SUBMIT_REQUIREMENTS_UNMET` | 409 | Gửi duyệt khi thiếu điều kiện (thông báo nêu thiếu gì) |
| `0x13_57` | `CHARITY_DISTRIBUTION_FIELD_REQUIRED` | 400 | Thiếu trường bắt buộc của hình thức trao (nêu tên trường) |
| `0x13_58` | `CHARITY_DISTRIBUTION_METHOD_MISMATCH` | 400 | `BANK_TRANSFER` khi đợt hoặc chiến dịch không có `MONEY` |
| `0x13_59` | `CHARITY_ROUND_EVIDENCE_REQUIRED` | 409 | Chuyển `DONE` khi thiếu bằng chứng đúng hình thức |
| `0x13_5a` | `CHARITY_BENEFICIARY_ACCOUNT_NAME_MISMATCH` | 400 | Tên chủ tài khoản thụ hưởng không khớp |
| `0x13_5b` | `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED` | 409 | Đợt `BANK_TRANSFER` chuyển `DONE` khi tài khoản chưa xác thực, đã bị thay hoặc thuộc dự án khác |

## 6. Cơ sở dữ liệu

| Migration | Nội dung |
| --- | --- |
| `1803700000000` | Cột `campaigns.accepted_contribution_types` + suy giá trị cho chiến dịch cũ |
| `1803800000000` | Cột hình thức trao trên `campaign_distribution_rounds`, bảng `campaign_round_private_details`, ánh xạ phase cũ |
| `1803900000000` | Bảng `campaign_beneficiary_bank_accounts`, cột `beneficiary_bank_account_id` trên chi tiết riêng tư |

Cột mới đều nullable hoặc có giá trị mặc định. Mỗi migration có `down()` đầy đủ.

## 7. Kiểm thử

- Unit test: core 2456/2456, core-lib 727/727.
- Script chạy trên Postgres thật: 75/76 qua. `test:chat-e2e` cần service đang chạy ở
  `localhost:3000`, chưa chạy trong đợt kiểm này.
- Lint, format, `docs:routes`, `docs:errors` đều khớp.
- Mỗi task có review riêng, sau đó review cuối toàn bộ thay đổi. Review cuối tìm ra 7 lỗi
  quan trọng; cả 7 đã sửa và review lại sạch.

## 8. Việc để sau

- Seed chưa có dữ liệu cho hai bảng mới, nên staging chưa có sẵn đợt `BANK_TRANSFER`/`SHIPPING`
  hay tài khoản thụ hưởng để QA thử.
- Chưa chặn đổi vai trò (khỏi `BENEFICIARY`) của bên đang giữ tài khoản thụ hưởng.
- Kiểm tra tài khoản lúc chuyển `DONE` còn một khoảng hở rất ngắn: tài khoản bị đóng đúng lúc đó
  thì vẫn có thể lọt.
- Tổng hiện vật đang gộp theo đơn vị, chưa tách theo từng món.
- Admin xác thực tài khoản chưa ghi dòng audit riêng; người xác thực vẫn lưu trên bản ghi.
