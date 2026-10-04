# Handoff backend: hoàn thiện đổi vật phẩm bằng Điểm Cống Hiến

Trạng thái: **cần triển khai**. Đối chiếu `main` tại commit `0dee943` với yêu cầu khách hàng về đổi điểm, countdown 7 ngày và bảo vệ Rank. Đây là backlog/acceptance criteria; không khẳng định staging đang chạy cùng commit và không thay thế SRS. Quy tắc nào khác SRS phải được Product Owner chốt trước khi sửa.

## Contract nghiệp vụ cần đạt

- Bài `OFFER` có `estimatedValue` (VNĐ). Giá đổi = `ceil(estimatedValue / vndPerPoint)`, tính ở backend theo tỷ lệ Admin đang áp dụng. `GET /posts/:postId/redemption-quote` là nguồn hiển thị cho client.
- Từ request xin nhận đầu tiên, thời gian xét tối đa 7 ngày. Người có request `PENDING` được chờ xét hoặc đổi bằng điểm trong khoảng này.
- Điểm khả dụng = `max(0, currentBalance - minPoints(currentRank))`. Ngưỡng lấy từ chính sách Rank hiện hành, không hard-code. Bạc có 1.500 điểm, ngưỡng 672, món cần 1.000 điểm thì **không được đổi**.
- Đổi thành công phải trừ điểm `ITEM_REDEMPTION` một lần, chốt một người nhận, mở một transaction/chat, dừng countdown và không auto-select thêm ứng viên cho lượt đổi.

## Gap trong code hiện tại

| Mức | Hiện trạng | Cần thay đổi |
| --- | --- | --- |
| P0 | `redeem-post-with-points.use-case.ts` chỉ kiểm `balance.balance < quote.points`; unit test còn cho phép tiêu đúng toàn bộ balance. | Kiểm điểm khả dụng theo Rank dưới khóa trong transaction; không cho balance sau đổi dưới ngưỡng giữ Rank. |
| P0 | `redemption-quote.use-case.ts` tính `missingPoints` từ toàn bộ balance, trả `redeemable: true` kể cả khi thiếu điểm. | Trả rõ điểm khả dụng, ngưỡng bảo vệ, số thiếu và trạng thái CTA nhất quán với POST. |
| P0 | Debit ledger và `acceptRequest` mở hai transaction riêng; lỗi duyệt thì ghi bút toán hoàn. Balance được kiểm trước transaction ghi sổ. | Một transaction CSDL cho kiểm điều kiện, trừ điểm và chốt người nhận; không có trạng thái đã trừ điểm nhưng chưa chốt bài khi tiến trình chết. |
| P1 | `point.redemption` có seed và được đọc động, nhưng không thuộc `SupportedSystemConfigKeys`; `POST /admin/system-configs` chỉ nhận `INTEGER`, không nhận JSON `{vndPerPoint}`. | API Admin publish tỷ lệ có validation, version/audit và quyền `config.write`; quote/POST dùng tỷ lệ mới ngay. |
| P1 | `acceptRequest` chuyển người xin còn lại sang `STANDBY`; sau huỷ transaction, hàng đợi có thể mở lại. | Chốt với PO: yêu cầu khách hàng nói ứng viên khác không tiếp tục được xét sau redeem. Phân biệt bền vững đường `REDEEMED` với `MANUAL`/`AUTOMATIC` trong cancellation/queue. |
| P1 | `selectionMode` cho phép `INSTANT` và `EXTENDED` (30 ngày); `OPTIMAL` mặc định 7 ngày. | Nếu “tối đa 7 ngày” áp dụng mọi `OFFER`, giới hạn/bỏ mode khác; nếu ngoại lệ có chủ đích, cập nhật SRS/UI. |

Đường code chính (từ `suites/chantam.vn/chantam/`):

- `core/src/application/implementations/gift-request/{redemption-quote,redeem-post-with-points,create-gift-request,auto-select-due-recipients}.use-case.ts`
- `core/src/infrastructure/repository/{gift-request,point-ledger}.repository.ts`
- `core/src/application/contracts/admin-config/admin-config.use-cases.ts`
- `core-lib/src/models/point-economy.ts`

## Hướng triển khai đề xuất

1. Dùng chung policy thuần tính `requiredPoints`, `spendablePoints` và lý do không đổi được cho quote và POST. Không dùng một `redeemable` vừa nghĩa “món có giá đổi” vừa nghĩa “người này có thể bấm đổi”. Server là nguồn sự thật; mobile không tự chia giá.
2. Redeem trong **một database transaction**. Khóa bài, request, balance/rank theo thứ tự nhất quán để tránh deadlock; đọc lại deadline, trạng thái, giá, tỷ lệ, ngưỡng Rank và balance dưới khóa. Tái dùng ledger append-within-transaction và idempotency key; cập nhật post/request/transaction/chat trong transaction đó. Không dùng balance đọc trước lock làm quyết định cuối. Notification phát sau commit hoặc qua outbox.
3. Lưu dấu đường chốt `REDEEMED` đủ bền để cancellation/queue không mở lại những người không còn được xét. `selection_deadline = NULL` chỉ nói đồng hồ dừng, không nói vì sao. Không xoá lịch sử request/ledger âm thầm.
4. Mở đường Admin publish `point.redemption` theo cơ chế version/audit hiện có, validate `vndPerPoint` là số nguyên dương trong giới hạn được chốt. Seed hiện là **2.000 VNĐ/điểm**; 1.000 trong yêu cầu chỉ là ví dụ, không phải lệnh đổi mặc định.
5. Chốt hành vi khi Admin đổi tỷ lệ giữa quote và POST. Đề xuất POST nhận `quoteVersion`/`expectedPoints`, trả conflict kèm quote mới nếu giá thay đổi; không âm thầm trừ số điểm khác màn xác nhận. Đồng bộ contract với mobile.

## Acceptance tests bắt buộc

- Tỷ lệ 1.000 VNĐ/điểm, món 1.000.000 VNĐ cần 1.000 điểm. Admin publish tỷ lệ mới qua API; quote và POST dùng tỷ lệ mới không cần deploy lại.
- Bạc ngưỡng 672: balance 1.800 đổi món 1.000 được, còn 800 và giữ Bạc; balance 1.500 bị chặn vì chỉ có 828 khả dụng, ledger/post/request không đổi.
- Quote và POST cùng kết luận ở sát ngưỡng (`spendable == required` được đổi; `spendable == required - 1` bị chặn), kể cả sau khi Admin đổi ngưỡng Rank.
- Hai redeem cùng bài và hai bài cùng người chạy đồng thời: không double-accept, double-debit, balance âm hoặc giảm dưới ngưỡng. Retry idempotent không trừ tiếp.
- Lỗi có chủ đích tại mỗi bước ghi dữ liệu rollback toàn bộ ledger, post, request, transaction/chat; không phát notification cho transaction rollback.
- Hết deadline: POST từ chối, job auto-select theo policy. Sau redeem: job không chọn thêm; test cả trường hợp transaction redeem bị huỷ và hàng đợi cũ.
- API Admin chặn thiếu `config.write` và tỷ lệ không hợp lệ; publish hợp lệ có audit/version.

## Cần PO chốt trước khi đóng MR implementation

1. `INSTANT`/`EXTENDED` có còn là ngoại lệ, hay mọi `OFFER` phải tối đa 7 ngày?
2. Nếu transaction sau redeem bị huỷ, request còn lại có được xét tiếp không? Câu khách hàng hiện tại nghiêng về **không**.
3. `estimatedValue` bắt buộc cho mọi `OFFER`, hay chỉ cần khi bật đổi điểm? API tạo bài hiện cho bỏ trống; khi đó quote trả không đổi được.
