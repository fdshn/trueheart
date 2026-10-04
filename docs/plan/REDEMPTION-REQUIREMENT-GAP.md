# Handoff backend: hoàn thiện đổi vật phẩm bằng Điểm Cống Hiến

Trạng thái: **cần triển khai**. Đối chiếu `main` tại commit `0dee943` với yêu cầu khách hàng
về đổi điểm, countdown 7 ngày và bảo vệ Rank. Đây là backlog/acceptance criteria; không
khẳng định staging đang chạy cùng commit và không thay thế SRS. Quy tắc nào khác SRS phải
được Product Owner chốt trước khi sửa.

## Contract nghiệp vụ cần đạt

- Bài `OFFER` có `estimatedValue` (VNĐ). Giá đổi =
  `ceil(estimatedValue / vndPerPoint)`, tính ở backend theo tỷ lệ Admin đang áp dụng.
  `GET /posts/:postId/redemption-quote` là nguồn hiển thị cho client.
- Từ request xin nhận đầu tiên, thời gian xét tối đa 7 ngày. Người có request `PENDING`
  được chờ xét hoặc đổi bằng điểm trong khoảng này.
- Điểm khả dụng = `max(0, currentBalance - minPoints(currentRank))`. Ngưỡng lấy từ chính
  sách Rank hiện hành, không hard-code. Bạc có 1.500 điểm, ngưỡng 672, món cần 1.000
  điểm thì **không được đổi**.
- Đổi thành công phải trừ điểm `ITEM_REDEMPTION` một lần, chốt một người nhận, mở một
  transaction/chat, dừng countdown và không auto-select thêm ứng viên cho lượt đổi.

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

1. Dùng chung policy thuần tính `requiredPoints`, `spendablePoints` và lý do không đổi được
   cho quote và POST. Không dùng một `redeemable` vừa nghĩa “món có giá đổi” vừa nghĩa
   “người này có thể bấm đổi”. Server là nguồn sự thật; mobile không tự chia giá.
2. Redeem trong **một database transaction**. Khóa bài, request, balance/rank theo thứ tự
   nhất quán để tránh deadlock; đọc lại deadline, trạng thái, giá, tỷ lệ, ngưỡng Rank và
   balance dưới khóa. Tái dùng ledger append-within-transaction và idempotency key; cập
   nhật post/request/transaction/chat trong transaction đó. Không dùng balance đọc trước
   lock làm quyết định cuối. Notification phát sau commit hoặc qua outbox.
3. Lưu dấu đường chốt `REDEEMED` đủ bền để cancellation/queue không mở lại những người
   không còn được xét. `selection_deadline = NULL` chỉ nói đồng hồ dừng, không nói vì sao.
   Không xoá lịch sử request/ledger âm thầm.
4. Mở đường Admin publish `point.redemption` theo cơ chế version/audit hiện có, validate
   `vndPerPoint` là số nguyên dương trong giới hạn được chốt. Seed hiện là **2.000
   VNĐ/điểm**; 1.000 trong yêu cầu chỉ là ví dụ, không phải lệnh đổi mặc định.
5. Chốt hành vi khi Admin đổi tỷ lệ giữa quote và POST. Đề xuất POST nhận
   `quoteVersion`/`expectedPoints`, trả conflict kèm quote mới nếu giá thay đổi; không
   âm thầm trừ số điểm khác màn xác nhận. Đồng bộ contract với mobile.

## Acceptance tests bắt buộc

- Tỷ lệ 1.000 VNĐ/điểm, món 1.000.000 VNĐ cần 1.000 điểm. Admin publish tỷ lệ mới qua
  API; quote và POST dùng tỷ lệ mới không cần deploy lại.
- Bạc ngưỡng 672: balance 1.800 đổi món 1.000 được, còn 800 và giữ Bạc; balance 1.500
  bị chặn vì chỉ có 828 khả dụng, ledger/post/request không đổi.
- Quote và POST cùng kết luận ở sát ngưỡng (`spendable == required` được đổi;
  `spendable == required - 1` bị chặn), kể cả sau khi Admin đổi ngưỡng Rank.
- Hai redeem cùng bài và hai bài cùng người chạy đồng thời: không double-accept,
  double-debit, balance âm hoặc giảm dưới ngưỡng. Retry idempotent không trừ tiếp.
- Lỗi có chủ đích tại mỗi bước ghi dữ liệu rollback toàn bộ ledger, post, request,
  transaction/chat; không phát notification cho transaction rollback.
- Hết deadline: POST từ chối, job auto-select theo policy. Sau redeem: job không chọn
  thêm; test cả trường hợp transaction redeem bị huỷ và hàng đợi cũ.
- API Admin chặn thiếu `config.write` và tỷ lệ không hợp lệ; publish hợp lệ có audit/version.

## Cần PO chốt trước khi đóng MR implementation

1. `INSTANT`/`EXTENDED` có còn là ngoại lệ, hay mọi `OFFER` phải tối đa 7 ngày?
2. Nếu transaction sau redeem bị huỷ, request còn lại có được xét tiếp không? Câu khách
   hàng hiện tại nghiêng về **không**.
3. `estimatedValue` bắt buộc cho mọi `OFFER`, hay chỉ cần khi bật đổi điểm? API tạo bài
   hiện cho bỏ trống; khi đó quote trả không đổi được.

## Phạm vi và thứ tự ưu tiên tài liệu

Yêu cầu Bên A được chuyển ngày 2026-10-04 đặt lại quy tắc **bảo vệ Rank khi đổi vật phẩm**.
Nó mâu thuẫn với quyết định ngày 2026-09-24 ghi trong `FEATURES.md` F76 và
`ASSUMPTIONS.md` (tiêu tự do rồi tụt hạng). Với riêng luồng `ITEM_REDEMPTION`, tài liệu
này ghi **yêu cầu mới cần triển khai**, không coi hành vi backend hiện tại là đúng. Không
suy rộng bảo vệ Rank sang khoản phạt, điều chỉnh Admin hoặc mọi loại debit khác. PO cần xác
nhận việc thay thế quyết định cũ trước khi merge implementation; mọi chỗ còn ghi F76 “đã
huỷ” phải được đánh dấu là lịch sử, không còn là contract đích của redemption.

| Phạm vi | Đã có ở `main` | Contract đích |
| --- | --- | --- |
| Giá và quote | `estimatedValue`, `quoteRedemption`, `GET /posts/:postId/redemption-quote` | Giữ công thức làm tròn lên; quote và POST cùng policy và cùng phiên bản giá được xác nhận |
| Thời gian | `OPTIMAL` 7 ngày, `EXTENDED` 30 ngày, `INSTANT` không đếm | Quyết định về ngoại lệ mode phải được PO chốt; không âm thầm bỏ mode đã có |
| Chọn người | `acceptRequest` chốt bài, mở transaction/chat, xoá deadline | Redeem chốt một lần, lưu nguyên nhân `REDEEMED`; không auto-select người khác |
| Điểm và Rank | POST kiểm toàn balance, quote chỉ cảnh báo `wouldDemote` | POST không được vượt điểm khả dụng; quote hiển thị cùng kết luận |
| Ledger | Có debit `ITEM_REDEMPTION` và refund bù khi accept hỏng | Atomic với việc chốt; idempotent ở lần bấm/retry/concurrent |
| Admin | Seed JSON `point.redemption`, backend đọc khi quote/redeem | Admin publish được JSON hợp lệ bằng API có audit/version |

## State machine và ranh giới giao dịch

1. Bài `OFFER` đã `PUBLISHED`, chưa có request: chưa mở countdown; chưa cho redeem.
2. Request hợp lệ đầu tiên ở mode có chờ: đặt deadline đúng một lần. Các request tiếp
   theo không reset đồng hồ. Chỉ request còn `PENDING` mới được redeem.
3. Trước deadline, một ứng viên có thể chờ hoặc xác nhận đổi. Quote chỉ là bản xem trước,
   **không giữ hàng/điểm**. POST phải đọc lại toàn bộ điều kiện tại thời điểm commit.
4. Redeem thắng: ghi một debit ledger, chốt đúng một request, bài `RESERVED`/transaction
   theo FSM hiện hành, dừng deadline, mở chat và ghi nguyên nhân `REDEEMED`. Auto-select
   không được chốt người thứ hai. Sau commit mới gửi notification.
5. Không ai redeem trước deadline: job auto-select theo cấu hình candidate priority hiện
   có. Redeem và job tranh nhau phải được serialization trên cùng bài; bên thua không ghi
   bút toán hoặc phát thông báo sai.
6. Huỷ giao dịch sau khi redeem là **quy trình mới cần PO chốt**, không được suy từ việc
   `selection_deadline = NULL`. Bất kể policy hàng đợi, hoàn điểm phải là ledger reversal
   có reference tới debit gốc, có idempotency, không sửa/xoá bút toán cũ.

### Atomicity và khóa

- Một transaction Postgres bao gồm: khóa bài/request ứng viên, kiểm deadline/status,
  đọc giá/tỷ lệ/ngưỡng Rank, khóa projection balance, kiểm `spendable >= required`, ghi
  ledger, cập nhật projection, chốt request và tạo transaction/chat. Dùng thứ tự khóa cố
  định ở mọi đường accept và auto-select để hạn chế deadlock.
- `requestId`/`postId` là idempotency identity của redemption. Retry cùng request phải
  trả kết quả cũ hoặc lỗi đã chốt nhất quán, không thêm debit. Hai người khác nhau cạnh
  tranh cùng bài: một người thắng. Một người đổi hai bài cạnh tranh: balance sau cả hai
  vẫn không dưới ngưỡng Rank. Lỗi tại bất kỳ bước ghi nào rollback toàn bộ.
- Notification phát sau commit hoặc qua transactional outbox. Không phát nếu rollback.
  Nếu notification thất bại, giao dịch vẫn đã chốt và phải retry notification riêng.
- `rank_tiers.min_points`/ngưỡng có thể thay đổi bởi Admin. Quy tắc dùng snapshot cấu
  hình tại lúc POST commit; không lấy ngưỡng hard-code từ mobile hay từ quote cũ.

## API contract đề xuất cho implementation

Đây là **contract đích**, không mô tả API đang chạy. Giữ envelope hiện tại của backend
(`success`, `body`, `errorCode`) và URL hiện có.

| API | Yêu cầu |
| --- | --- |
| `GET /posts/:postId/redemption-quote` | 200 cả khi không thể đổi; trả `requiredPoints`, `balancePoints`, `protectedPoints`, `spendablePoints`, `missingPoints`, `canRedeem`, `unavailableReason`, `vndPerPoint`, `configVersion`/`quoteVersion`, deadline. Không lộ sự tồn tại bài cho người chưa xin; `NOT_AVAILABLE` gộp các trường hợp như hiện tại. `missingPoints = max(0, requiredPoints - spendablePoints)`. |
| `POST /posts/:postId/redeem` | Bearer, request `PENDING`, chỉ gọi sau thao tác xác nhận. Nhận `expectedPoints` + phiên bản quote (hoặc token quote có hạn) để phát hiện giá thay đổi. Không nhận số điểm do client tự tính làm nguồn quyết định. Thành công trả `transactionId`, `pointsSpent`, `balanceAfter`, trạng thái bài và reference ledger. |
| `POST /admin/system-configs` | Cho publish `point.redemption` dạng JSON `{vndPerPoint: integer > 0}` theo cơ chế revision/audit hiện có; chặn thiếu `config.write`, giá trị 0/âm/thập phân/ngoài giới hạn. |

Các lỗi cần ổn định: `REDEMPTION_NOT_AVAILABLE` (chưa xin, deadline, bài đã chốt),
`REDEMPTION_PRICE_UNAVAILABLE` (không có giá), `REDEMPTION_INSUFFICIENT_POINTS` (thiếu
điểm **khả dụng**, trả required/spendable nếu policy lỗi cho phép) và lỗi quote stale khi
Admin/owner sửa giá giữa xem trước và bấm đổi. Chốt mã/status cụ thể khi implement;
không tái dùng `redeemable: true` để chỉ “có thể định giá” nhưng CTA lại bị chặn.

## Ma trận kiểm thử tối thiểu

| Nhóm | Ca bắt buộc |
| --- | --- |
| Giá | 1.000.000/1.000 = 1.000; 1.500/1.000 = 2; thiếu `estimatedValue` không đổi miễn phí; Admin đổi tỷ lệ sau quote phải báo giá mới trước debit. |
| Rank | Bạc min 672: 1.800−672=1.128 đổi 1.000 được, còn 800; 1.500−672=828 bị chặn, không ghi ledger; đúng ngưỡng vừa đủ được. |
| Thời gian | Chưa có request, trước/sát/sau deadline, request không phải `PENDING`, `OPTIMAL`/`EXTENDED`/`INSTANT` theo quyết định PO. |
| Cạnh tranh | Hai người đổi cùng bài; một người đổi hai bài; redeem song song auto-select/manual accept; retry request sau timeout mạng. Kiểm DB thật, không chỉ mock. |
| Rollback | Lỗi ledger, accept, tạo transaction/chat và notification; không để debit mồ côi, không double-refund, không phát thông báo cho rollback. |
| Sau redeem | Deadline dừng, job không chọn thêm, request khác giữ lịch sử và theo policy huỷ đã chốt; audit và ledger truy nguyên được. |
| Admin | Không quyền, JSON sai, revision/audit, đổi tỷ lệ áp dụng ngay, thay ngưỡng Rank khi đang có ứng viên. |

## Điều kiện bàn giao cho Flutter

Flutter chỉ đọc quote từ backend để hiển thị số điểm và CTA, không hard-code
`vndPerPoint` hoặc ngưỡng Rank. Chưa nâng cấp API thì phải dựa vào trạng thái thực tế:
quote hiện có `points`, `balancePoints`, `missingPoints`, `redeemable`, `wouldDemote`,
`rankAfter`; POST hiện vẫn có thể trừ xuống dưới ngưỡng. Không phát hành UX “điểm được
bảo vệ” trước khi backend chặn thật. Sau khi backend cung cấp contract đích, Flutter cập
nhật model, xử lý quote stale/insufficient và kiểm bằng staging.
