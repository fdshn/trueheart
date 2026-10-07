# Thiết kế Kêu gọi và Đóng góp Vật phẩm Từ thiện

> Trạng thái: **đã chốt nghiệp vụ, chưa triển khai backend**. Tài liệu này thay thế cách
> hiểu cũ rằng một `campaign` chỉ là sự kiện để user đăng ký tham dự. Phần đăng ký sự kiện
> hiện hữu được giữ tương thích, còn đóng góp vật phẩm là một luồng riêng có transaction.

## 1. Mục tiêu và phạm vi

Phân hệ Từ thiện có hai loại dùng chung một engine:

| Loại | Mã | Đối tượng thụ hưởng |
| --- | --- | --- |
| Kêu gọi cho cá nhân | `INDIVIDUAL_APPEAL` | Chính người đăng hoặc một cá nhân/gia đình khác |
| Tổ chức hoạt động từ thiện | `ORGANIZED_CAMPAIGN` | Một nhóm người, cộng đồng hoặc chương trình có tổ chức |

Cả hai loại đều cho người tạo khai báo một bảng nhu cầu vật phẩm, người dùng chọn một hoặc
nhiều dòng và số lượng muốn tặng, người quản lý chấp nhận/từ chối từng phần, rồi hệ thống
tạo transaction giao nhận. Nguồn sự thật là số thực nhận theo **từng dòng nhu cầu** từ
transaction hoàn tất và đóng góp ngoài app có audit; không dùng
`target_items_count/current_items_count` tổng hợp làm nguồn sự thật cho luồng này.

Luồng tiền, cúng dường và VietQR không thuộc thiết kế này.

## 2. Vai trò và quyền

- **Organizer**: người tạo kêu gọi/chiến dịch; xem toàn bộ đề nghị, chấp nhận một phần hoặc
  toàn bộ, từ chối có lý do, đóng/gia hạn chiến dịch và xác nhận số lượng thực nhận.
- **Coordinator**: thành viên được organizer giao quyền ở `ORGANIZED_CAMPAIGN`; có quyền
  điều phối nhưng không được đổi chủ sở hữu hoặc xoá audit.
- **Contributor**: người đề nghị tặng vật phẩm; sửa/rút đề nghị khi chưa được chấp nhận,
  theo dõi transaction và xác nhận bàn giao theo FSM hiện hành.
- **Beneficiary**: người thụ hưởng. Có thể không có tài khoản và không mặc nhiên có quyền
  quản trị chiến dịch.
- **Admin**: duyệt nội dung, đình chỉ và xem audit; không sửa lịch sử đóng góp đã hoàn tất.

`INDIVIDUAL_APPEAL` phải khai `beneficiaryRelation = SELF | OTHER`. Với `OTHER`, organizer
phải khai quan hệ và trạng thái đồng ý/xác minh trước khi public. Địa chỉ, số điện thoại và
tài liệu xác minh của beneficiary luôn là dữ liệu riêng tư.

### Quyền tạo và trạng thái ban đầu

| Loại | Member/Bạc/Vàng | Kim Cương | Admin |
| --- | --- | --- | --- |
| `INDIVIDUAL_APPEAL` | Được tạo, vào `PENDING_APPROVAL` | Được tạo và vào thẳng `ACTIVE` | Tạo trực tiếp `ACTIVE` |
| `ORGANIZED_CAMPAIGN` | Không được tạo | Được tạo và vào thẳng `ACTIVE` | Tạo trực tiếp `ACTIVE` |

`ACTIVE` ở bảng trên là **trạng thái nghiệp vụ**, lưu bằng `approval_status = 'APPROVED'` kèm
`is_active = true`. Xem [ánh xạ sang schema](#ánh-xạ-trạng-thái-nghiệp-vụ-sang-schema-hiện-có)
— tuyệt đối không ghi chữ `ACTIVE` vào `approval_status`.

Không hardcode phép so Rank trong controller. Rank Config dùng ba capability:

- `SUBMIT_INDIVIDUAL_APPEAL`: baseline bật từ Member trở lên;
- `SUBMIT_CHARITY_PROPOSAL`: baseline chỉ Kim Cương, dùng cho `ORGANIZED_CAMPAIGN`;
- `PUBLISH_CHARITY_WITHOUT_REVIEW`: baseline chỉ Kim Cương, quyết định được public ngay
  (`approval_status = 'APPROVED'`, `is_active = true`).

Backend đọc Rank hiện tại từ database, không tin rank trong JWT. User có quyền submit nhưng
không có quyền publish trực tiếp thì campaign luôn `PENDING_APPROVAL`; không cho client tự
gửi `approvalStatus`. Admin vẫn có quyền đình chỉ nội dung đã public trực tiếp và toàn bộ
quyết định phải có audit.

## 3. Bảng nhu cầu vật phẩm

Mỗi chiến dịch có nhiều `campaign_need_items`:

- `category_id`, `item_name`, `description`, `unit`;
- `target_quantity` là số lượng cần;
- `allow_alternative` cho phép vật phẩm tương đương;
- `accepted_quantity` và `received_quantity` là projection do hệ thống cập nhật;
- `sort_order`, `is_active`, timestamps.

Các số hiển thị:

```text
pendingQuantity  = tổng số lượng trên đề nghị PENDING_REVIEW
activeQuantity   = tổng số lượng đã chấp nhận nhưng transaction chưa COMPLETED/CANCELLED
receivedQuantity = tổng số lượng thực nhận từ transaction COMPLETED
                 + tổng số lượng đóng góp ngoài app còn hiệu lực
remainingQuantity = max(targetQuantity - activeQuantity - receivedQuantity, 0)
```

`pendingQuantity` chỉ để organizer biết tải điều phối, **không giữ chỗ** và không trừ khỏi
`remainingQuantity`. Nếu giữ chỗ ngay lúc gửi đề nghị, một số đề nghị không thực hiện có thể
làm chiến dịch trông như đã đủ và chặn người tặng thật.

Không được hạ `targetQuantity` thấp hơn `activeQuantity + receivedQuantity`. Không xoá cứng
dòng đã có đề nghị; chỉ `is_active = false`.

Mỗi dòng giữ nguyên `unit` của nó. Backend không cộng `kg + cái + hộp` thành một tổng vì kết
quả đó không có ý nghĩa. API công khai trả tiến độ từng dòng. Nếu UI cần một progress bar
chung, backend trả `overallProgressPercent` bằng trung bình tỷ lệ hoàn thành đã kẹp ở 100%
của các dòng đang active; đây chỉ là chỉ số trình bày, không phải số lượng hay nguồn sự thật.

## 4. Đề nghị đóng góp

Contributor gửi một `campaign_contribution` gồm một hoặc nhiều
`campaign_contribution_items`. Mỗi dòng có `need_item_id`, `offered_quantity`, tình trạng,
ghi chú và số lượng organizer chấp nhận.

FSM của đề nghị:

```text
DRAFT -> PENDING_REVIEW -> PARTIALLY_ACCEPTED -> ACCEPTED
                       \-> REJECTED
                       \-> WITHDRAWN
```

- Contributor chỉ sửa/rút khi chưa có phần nào được chấp nhận.
- Organizer có thể chấp nhận toàn bộ, chấp nhận ít hơn số đề nghị hoặc từ chối từng dòng.
- Một đề nghị có cả dòng được nhận và bị từ chối là `PARTIALLY_ACCEPTED`.
- Từ chối bắt buộc có mã lý do: `TARGET_REACHED`, `NOT_MATCH_REQUIREMENT`,
  `DELIVERY_NOT_AGREED`, `CANNOT_CONTACT`, `QUALITY_NOT_ACCEPTABLE`, `OTHER`.
- Sau khi đã tạo transaction, thay đổi phải đi qua huỷ transaction; không sửa ngược lịch sử
  của đề nghị.

## 5. Chấp nhận nguyên tử và chống vượt nhu cầu

Khi chấp nhận, backend mở transaction database và khoá theo thứ tự cố định:

1. `campaigns`;
2. các `campaign_need_items` theo id tăng dần;
3. `campaign_contributions` và item tương ứng;
4. tạo `gift_transactions` cùng các dòng vật phẩm.

Trong cùng transaction, tính lại `remainingQuantity`. Nếu số organizer chọn vượt phần còn
thiếu và chiến dịch không cho vượt mục tiêu, trả `409` kèm số lượng còn lại mới nhất. Không
âm thầm cắt số lượng vì organizer phải biết chính xác mình vừa chấp nhận bao nhiêu.

Idempotency key bắt buộc cho thao tác accept để double tap/retry không tạo hai transaction.

## 6. Transaction giao nhận

Chỉ tạo transaction cho phần đã được chấp nhận. Các đề nghị chờ/từ chối không tạo
transaction rác.

Transaction tái sử dụng FSM cho–tặng hiện hành và bổ sung quan hệ:

- `campaign_id`;
- `campaign_contribution_id`;
- các dòng `campaign_transaction_items` gồm `need_item_id`, `accepted_quantity`,
  `received_quantity`;
- receiver là organizer/coordinator hoặc điểm tiếp nhận, không mặc nhiên là beneficiary;
- địa chỉ chi tiết chỉ trả cho hai bên của transaction sau khi chấp nhận.

Một transaction có thể chứa nhiều dòng khi cùng contributor, điểm nhận và phương thức giao.
Nếu khác điểm nhận/phương thức/thời gian thì tách transaction.

Khi hoàn tất, organizer xác nhận `received_quantity` thực tế cho từng dòng. Projection tiến
độ chỉ phát sinh từ số thực nhận. Chính sách điểm contributor được chốt riêng, không được suy
ra trực tiếp từ số lượng. Huỷ transaction phải trả phần `activeQuantity` về nhu cầu, không
cộng `receivedQuantity`.

## 7. Đóng góp ngoài app

Vật phẩm nhận trực tiếp từ người không có tài khoản vẫn phải tạo
`campaign_external_contributions`, gồm `need_item_id`, số lượng thực nhận, nhãn nguồn, thời
điểm nhận, người ghi nhận và bằng chứng tùy chính sách. Bản ghi có audit, không gắn contributor
user và không tự sinh điểm.

Organizer không được gõ trực tiếp một tổng `current_items_count`. Sửa sai bằng cách điều
chỉnh/hủy bản ghi external contribution có lý do, không ghi đè lịch sử. Chỉ bản ghi còn hiệu
lực mới tham gia `receivedQuantity`.

### Điểm Cống Hiến cho contributor

- Point Rule mới: `CHARITY_CONTRIBUTION_COMPLETED` với mức cố định `X` do Admin cấu hình,
  đánh version và có thời điểm hiệu lực như các Point Rule khác.
- Thưởng đúng **một lần cho mỗi `campaign_contribution`**, khi contribution có ít nhất một
  transaction `COMPLETED`; không thưởng theo từng dòng, số lượng hay số transaction con.
- Không áp dụng `value_bonus`, `estimated_value_vnd` hoặc accuracy của OFFER/WANTED cho luồng
  từ thiện.
- Ledger dùng `campaign_contribution_id` làm reference/idempotency; retry hoặc việc hệ thống
  tách một contribution thành nhiều chuyến giao không được cộng lặp.
- Contribution bị từ chối/rút hoặc chỉ có transaction bị huỷ không được thưởng. Nếu kết quả
  hoàn tất bị đảo hợp lệ, thu hồi bằng ledger reversal thay vì sửa/xóa bút toán cũ.
- External contribution không gắn user nên không sinh điểm.

## 8. Vòng đời chiến dịch

Các tên dưới đây là **trạng thái nghiệp vụ**, không phải giá trị cột. Lưu trữ dùng đúng
schema hiện có — xem bảng ánh xạ ngay sau sơ đồ.

```text
PENDING_APPROVAL -> ACTIVE -> CLOSED
                \-> REJECTED
ACTIVE -> SUSPENDED -> ACTIVE | CLOSED
```

### Ánh xạ trạng thái nghiệp vụ sang schema hiện có

Bảng `campaigns` đã có `approval_status` với ràng buộc:

```sql
CONSTRAINT "CHK_campaigns_approval_status"
  CHECK ("approval_status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'))
```

cộng một cột `is_active BOOLEAN` và `start_time`/`end_time` riêng. Nên FSM trên **không**
được ghi thẳng vào `approval_status`: `ACTIVE`, `SUSPENDED` và `CLOSED` không nằm trong CHECK
và sẽ bị database từ chối ngay lúc INSERT/UPDATE.

| Trạng thái nghiệp vụ | `approval_status` | `is_active` | Dấu hiệu phân biệt |
| --- | --- | :-: | --- |
| `PENDING_APPROVAL` | `PENDING_APPROVAL` | *không xét* | chờ Admin duyệt |
| `REJECTED` | `REJECTED` | *không xét* | `approval_note` ghi lý do |
| `ACTIVE` | `APPROVED` | `true` | đang nhận đề nghị |
| `SUSPENDED` | `APPROVED` | `false` | `end_time` còn ở tương lai hoặc `NULL` |
| `CLOSED` | `APPROVED` | `false` | `end_time <= now()` |

Hai hàng đầu ghi *không xét* là có lý do đo được: `campaigns.is_active` khai
`NOT NULL DEFAULT true` và lệnh `INSERT` hiện **không** đặt cột này, nên mọi campaign mới đều
`is_active = true` kể cả khi còn chờ duyệt. Điều đó vô hại vì bộ lọc công khai đòi **cả hai**
điều kiện:

```sql
-- PublicFilter, charity-campaign.repository.ts
campaigns.approval_status = 'APPROVED'
  AND campaigns.is_active
  AND campaigns.deleted_at IS NULL
```

Nên một hàng `PENDING_APPROVAL` vẫn bị ẩn bất kể `is_active`. Đòi ghi `is_active = false` lúc
tạo chỉ thêm một lượt ghi không mua được gì, và trái với mặc định đang có.

`SUSPENDED` và `CLOSED` cùng cặp `(APPROVED, false)`, nên **`end_time` là thứ phân biệt chúng**:
đình chỉ thì không đụng `end_time`, còn đóng thì đặt `end_time`. Đọc trạng thái nghiệp vụ luôn
phải đọc cả hai cột cộng `end_time`, không suy từ một cột.

> **Hướng này KHÔNG phải cách lách schema — nó là thiết kế đã có.** `PublicFilter` ở trên là
> mã đang chạy trên staging, kèm chú thích *"Hoạt động hiện được ra ngoài: đã duyệt, còn bật,
> chưa xoá"*. Tức cặp `APPROVED + is_active` vốn **đã** là định nghĩa của "đang hoạt động"
> trong hệ thống này; tài liệu chỉ đang gọi đúng tên nó.

> **Một việc endpoint duyệt phải làm.** `UPDATE ... SET approval_status = 'APPROVED'` hiện
> **không** đụng `is_active`. Vì mặc định là `true` nên duyệt xong campaign hoạt động ngay —
> đúng ý. Nhưng nếu sau này có đường nào đặt `is_active = false` trước khi duyệt, thì lượt duyệt
> phải đặt lại `true`, nếu không campaign được duyệt mà vẫn ẩn và không ai hiểu vì sao.

> **Vì sao không thêm giá trị vào CHECK.** Thêm `ACTIVE`/`CLOSED`/`SUSPENDED` vào
> `approval_status` thì cột đó và `is_active` cùng mã hoá một phần trạng thái, và sẽ có hàng
> `approval_status = 'CLOSED'` nhưng `is_active = true`. Hai cột nói trái nhau là loại lỗi dữ
> liệu không ai phát hiện tới khi báo cáo ra số sai. Giữ một cột cho **quyết định duyệt** và
> một cột cho **đang mở hay không** là tách đúng hai câu hỏi khác nhau.

> **`DRAFT` đã bỏ khỏi FSM.** Không có endpoint lưu nháp, và schema không có chỗ phân biệt
> nháp với chờ duyệt — cả hai đều là `(PENDING_APPROVAL, false)`. Nếu sản phẩm thật cần nháp
> thì đó là một thay đổi schema riêng, không nên để lẫn vào bản này.

Chiến dịch đóng khi đã đủ nhu cầu, hết hạn, organizer chủ động đóng hoặc Admin đình chỉ.
Khi đóng:

- ghi `is_active = false` và đặt `end_time`; **không** đụng `approval_status` (giữ `APPROVED`);
- chặn đề nghị mới;
- giữ nguyên các transaction đang chạy;
- từ chối hàng loạt đề nghị `PENDING_REVIEW` với lý do `CAMPAIGN_CLOSED`;
- không tự huỷ transaction đã chấp nhận;
- cho phép gia hạn trước khi đóng và lưu audit thay đổi thời hạn.

Admin **đình chỉ** thì cũng `is_active = false` nhưng **giữ nguyên `end_time`** — đó là dấu
hiệu duy nhất phân biệt đình chỉ với đã đóng. Mở lại là đặt `is_active = true`; không cần đổi
`approval_status` vì quyết định duyệt không thay đổi khi đình chỉ.

## 9. API mục tiêu

Các endpoint đọc công khai tiếp tục dùng `/campaigns`. Endpoint ghi dùng namespace
`/charity-campaigns` hiện hữu:

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `POST` | `/charity-campaigns` | Tạo appeal/campaign kèm bảng nhu cầu |
| `GET` | `/campaigns/:idOrSlug/needs` | Bảng nhu cầu và projection tiến độ |
| `POST` | `/charity-campaigns/:id/contributions` | Gửi đề nghị nhiều vật phẩm |
| `GET` | `/charity-campaigns/:id/contributions` | Organizer/coordinator xem danh sách |
| `GET` | `/charity-contributions/me` | Contributor xem đề nghị của mình |
| `PATCH` | `/charity-contributions/:id` | Sửa/rút đề nghị chưa được nhận |
| `POST` | `/charity-contributions/:id/decision` | Chấp nhận/từ chối từng dòng, nguyên tử |
| `POST` | `/charity-campaigns/:id/external-contributions` | Ghi nhận đóng góp ngoài app có audit |
| `PATCH` | `/charity-external-contributions/:id` | Điều chỉnh/hủy bản ghi ngoài app có lý do |
| `POST` | `/charity-campaigns/:id/close` | Đóng chiến dịch và xử lý hàng chờ |

Response public không trả beneficiary contact, địa chỉ chính xác, tài liệu xác minh hoặc
danh tính contributor ẩn danh.

## 10. Tương thích dữ liệu hiện tại

- Thêm `campaign_type`; dữ liệu cũ backfill `ORGANIZED_CAMPAIGN`.
- `target_items_count/current_items_count` cũ được đánh dấu deprecated. Với campaign chưa có
  bảng nhu cầu, backend giữ nguyên hành vi legacy. Ngay khi campaign có ít nhất một dòng nhu
  cầu, hai cột không còn được ghi tay và API mới không dùng chúng.
- Không dựng một `current_items_count` mới bằng cách cộng các đơn vị khác nhau. Client mới
  đọc `needs[]` và `overallProgressPercent`; endpoint legacy có thể trả hai trường cũ trong
  thời gian chuyển đổi nhưng phải kèm cờ `progressSource = LEGACY_DECLARED | NEED_ITEMS`.
- `campaign_participations` hiện tại tiếp tục biểu diễn đăng ký tham dự sự kiện; **không**
  dùng nó thay cho đề nghị tặng vật phẩm.
- Không tự sinh bảng nhu cầu giả từ hai cột tổng hợp cũ vì không biết tên vật phẩm/đơn vị.

## 11. Acceptance criteria bắt buộc

1. Hai organizer chấp nhận đồng thời không làm tổng active/received vượt mục tiêu.
2. Từ chối một contributor không ảnh hưởng đề nghị của người khác.
3. Chấp nhận một phần sinh transaction đúng số lượng; phần còn lại giữ lịch sử rõ ràng.
4. Huỷ transaction trả lại đúng capacity và không xoá đề nghị/audit.
5. Đóng chiến dịch không huỷ transaction đang chạy nhưng chặn đề nghị mới.
6. Người ngoài không đọc được danh tính, contact hay địa chỉ riêng của beneficiary.
7. Retry cùng idempotency key chỉ tạo một transaction.
8. Tiến độ công khai được tính từ transaction, không tin số client gửi lên.
9. Không có phép cộng số lượng giữa hai dòng khác đơn vị.
10. Đóng góp ngoài app có audit và không tự cộng điểm cho bất kỳ tài khoản nào.
11. Member/Bạc/Vàng tạo individual appeal chỉ nhận `PENDING_APPROVAL`; Kim Cương tạo hai loại
    đều public ngay mà không cần Admin duyệt trước. Lưu bằng
    `approval_status = 'APPROVED'` + `is_active = true`; không ghi chữ `ACTIVE` vào
    `approval_status` vì CHECK hiện tại từ chối giá trị đó.
12. Một contribution dù có nhiều item/nhiều transaction hoàn tất cũng chỉ sinh một bút toán
    `CHARITY_CONTRIBUTION_COMPLETED` theo version Point Rule tại thời điểm đủ điều kiện.
