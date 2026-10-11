# Quyết định nghiệp vụ cho–nhận, đổi điểm và đánh giá (07/10/2026)

> **Đặc tả mục tiêu, chưa phải mô tả backend đang chạy.** Tài liệu này thay thế các quy tắc
> mâu thuẫn về thời hạn bài Muốn Tặng 3 tháng/+3 tháng, `EXTENDED` chọn 30 ngày ngay khi đăng,
> đồng hồ bắt đầu từ request đầu tiên, review bất biến, tiêu điểm làm tụt Rank và công thức
> thưởng 56 × accuracy. API, schema, migration, job và app cần được cập nhật riêng.

## 1. Hai loại bài và hai chế độ

| Bài | Chủ bài | Người phản hồi | Kết quả ghép |
| --- | --- | --- | --- |
| `OFFER` (Muốn Tặng) | Người cho | Người xin nhận | Giao dịch cho–nhận |
| `WANTED` (Muốn Nhận) | Người cần đồ | Người đề nghị cho | Giao dịch cho–nhận |

Chủ bài chọn một trong hai chế độ khi đăng:

- **Bắt đầu ngay (`INSTANT`)**: phản hồi hợp lệ đầu tiên được chốt nguyên tử theo số lượng
  còn lại và tạo giao dịch ngay; không chờ hết 7 ngày để chọn. Bắt đầu giao dịch không đồng
  nghĩa `COMPLETED`. Nếu chưa có phản hồi, bài vẫn đi qua mốc 7 ngày đầu như bên dưới.
- **Chờ xét (`OPTIMAL`)**: hạn đầu tiên = `published_at + 7 ngày`, **không** tính từ phản hồi
  đầu tiên. Do đó bài không có phản hồi cũng có hạn. Trong 7 ngày, tiếp nhận ứng viên hợp lệ.

Với cả hai loại bài, trong 7 ngày chủ bài hạng **Kim Cương** được chọn tay đối tác giao dịch.
Chủ bài dưới Kim Cương không có quyền chọn tay; quyền xem danh sách và từ chối một phản hồi
không hợp lệ là quyền khác, không được dùng để lách quyền chọn. Quyền được kiểm bằng Rank
hiện tại từ database, không tin Rank trong token cũ. Hết 7 ngày, nếu còn ứng viên hợp lệ và
còn số lượng cần ghép, hệ thống tự chọn theo tiêu chí Admin cấu hình. Chọn tay, tự chọn và
chốt ngay phải dùng cùng một kiểm tra tồn kho/số lượng và chống hai giao dịch thắng một suất.

Nếu hết 7 ngày **chưa ghép được ai**, bài tự chuyển sang giai đoạn mở rộng **30 ngày**.
Đây là bước tự động, không phải option `EXTENDED` trên form. Trong giai đoạn mở rộng, bài
vẫn tiếp nhận phản hồi và áp dụng cơ chế ghép hợp lệ; bài chưa ghép được ai khi hết 30 ngày
thì `EXPIRED`, đóng các phản hồi còn mở, thông báo cho các bên và giữ lịch sử/audit. Không có
vòng đời 3 tháng hay gia hạn thủ công thêm 3 tháng cho hai loại bài này. Bài `INSTANT`
không có giai đoạn **xét ứng viên**, nhưng vẫn có mốc chờ phản hồi 7 ngày đầu tính từ
`published_at`: nếu chưa ghép được ai thì tự mở thêm 30 ngày. Vì vậy bài không có phản hồi
ở cả hai chế độ đều hết hạn sau **tối đa 37 ngày** từ lúc đăng.

Địa chỉ/số điện thoại/toạ độ chính xác không xuất hiện trên feed, chi tiết công khai hay
danh sách chờ. Chỉ hai bên đã thành đối tác giao dịch được xem thông tin cần thiết để giao
nhận, theo chính sách privacy hiện hành.

## 2. Đổi ngay bằng Điểm Cống Hiến — chỉ bài `OFFER` đang trong 7 ngày

Giá trị ước tính bằng VNĐ là **tùy chọn**; thiếu giá trị được hiểu là `0`, vẫn đăng và giao
dịch được nhưng không có giá đổi điểm. UI nói rõ việc khai giá trị có thể làm phát sinh
thưởng *sau khi hoàn tất và đánh giá*, không thưởng khi vừa nhập giá.

Người đã có yêu cầu xin nhận hợp lệ, trong 7 ngày đầu của bài `OFFER`, có thể xác nhận đổi
ngay. Giá đổi = giá trị ước tính / tỷ lệ VNĐ cho 1 điểm do Admin cấu hình. Số điểm được tiêu:

```text
available = max(0, current_point_balance - minimum_points(current_rank))
required = round_half_up(estimated_value_vnd / vnd_per_point)
```

Không được tiêu phần cần để giữ Rank hiện tại. Quote và lệnh đổi phải kiểm cùng quy tắc;
nếu giá/tỷ lệ thay đổi giữa hai bước thì bắt xác nhận lại, không âm thầm trừ giá mới. Việc
khóa suất vật phẩm, kiểm điểm khả dụng, trừ điểm, ghi `ITEM_REDEMPTION` trong Point Ledger,
chọn người nhận, tạo giao dịch và dừng countdown phải nguyên tử/idempotent. Các ứng viên còn
lại không được auto-select cho suất đã đổi; request của họ không bị xoá âm thầm. Nếu giao
dịch đổi điểm bị **huỷ**, ghi bút toán hoàn **đúng số điểm đã trừ ở ledger gốc**, chỉ một lần;
không tính lại theo giá trị hoặc tỷ lệ hiện tại. Chính sách này không áp dụng cho `WANTED`.

## 3. Hai khoản điểm người cho nhận

Phần này chỉ áp dụng cho giao dịch cho–nhận phát sinh từ bài `OFFER`/`WANTED`. Đóng góp
cho kêu gọi hoặc chiến dịch từ thiện dùng Point Rule riêng (`CHARITY_CONTRIBUTION_COMPLETED`),
không nhận `value_bonus`/accuracy của vật phẩm trong mục này.

```text
completion_points = Point Rule cho giao dịch COMPLETED
value_max_points = round_half_up(estimated_value_vnd / vnd_per_point)
value_bonus = round_half_up(value_max_points * final_accuracy_percent / 100)
giver_total = completion_points + value_bonus
```

`completion_points` cộng một lần khi giao dịch `COMPLETED`; **không nhân với accuracy**.

> **ĐÃ TRIỂN KHAI 07/10.** Cả mục này đã vào mã, ba lát. Phần dưới là những gì đo được khi
> làm, để lần sau không ai phải đoán lại.
>
> **Mốc cộng.** `completion_points` cộng trong `GiftTransactionRepository.awardCompletionPoints`,
> chạy **trong cùng transaction** đóng lượt trao, ở cả hai đường: người nhận bấm xác nhận và
> cron tự hoàn tất. Hai đường cũ (`SubmitReviewUseCase`, job `gift:settle-rewards`) **không bị
> gỡ**, vì `GIFT_COMPLETED_GIVER` có `daily_cap = 10` và lượt cộng tại `COMPLETED` nuốt ngoại
> lệ trần để việc xác nhận nhận hàng không đổ — gỡ chúng là biến trần ngày từ HOÃN thành MẤT.
> Ba đường dùng CHUNG khoá `GIFT_COMPLETED_GIVER:<deal>`, và `UQ_point_ledger_idempotency_key`
> là chốt cuối. Lượt đã `COMPLETED` trước 07/10 vẫn được job trả nốt, **không cần migration bù**.
>
> **Trần giá trị là bắt buộc, không phải tuỳ chọn.** CHỐT-14 đưa giá người TỰ KHAI vào công
> thức tính điểm — đúng thứ thiết kế cũ cố ý loại ra để chặn khai khống. Không trần thì
> 1.000.000.000đ ÷ 2.000 = **500.000 điểm**, gấp 279 lần ngưỡng Kim Cương; và 5.000.000đ cho
> một laptop cũ đã ra 2.500 điểm, tức vượt Kim Cương bằng MỘT giao dịch. Van an toàn là khoá
> `point.value_bonus_max_value_vnd`, mặc định 2.000.000đ. Nó phải là khoá cấu hình chứ không
> phải hằng trong mã, vì `appendAdjustment` — đường duy nhất `value_bonus` đi được — **không
> kiểm trần ngày nào cả**.
>
> **Phép kiểm nào đỏ.** `npm run test:gift-rewards` **xanh nguyên** — script đó gọi
> `ledger.appendByRule` trực tiếp với `multiplierPercent`, tức kiểm *cơ chế nhân của point
> ledger*, một primitive CHỐT-14 không đổi; nó có 0 tham chiếu tới `AwardGiftCompletionUseCase`.
> Chỉ **nhãn** mục 6 của nó phải sửa, vì nhãn cũ ("hoàn tất KHÔNG cộng phẳng cho người tặng")
> nay mô tả một luật đã bỏ — một nhãn như vậy tệ hơn không có nhãn, nó làm người đọc tin đã có
> ai canh chuyện đó rồi.
>
> Thật sự đỏ là: `award-gift-completion.use-case.spec.ts` (4 trong 10, đúng tập kỳ vọng
> `multiplierPercent`) và `test:gift-points` — script này khẳng định `giver.balance === 0`
> lúc hoàn tất, và khẳng định đó đúng với luật cũ. **Thứ tự bắt buộc:** sửa mã trước, phép
> kiểm sau.
>
> **Deadlock, phát hiện khi làm.** Hai lượt cộng đều lấy `pg_advisory_xact_lock(hashtext(userId))`
> và giữ tới hết transaction. Hai người tặng chéo nhau hoàn tất cùng lúc sẽ xin hai khoá theo
> hai thứ tự ngược nhau. Rủi ro này **đã có từ trước** (`awardCompletionPoints` khoá người
> nhận, rồi `accrueFromCompletedTransaction` khoá người tặng). Nay mảng được sắp theo `userId`
> tăng dần, nên cả hai khoá được xin theo một thứ tự toàn cục ngay từ đầu transaction và thứ
> tự của các chỗ gọi sau không còn quan trọng.
>
> **Hai hệ quả nghiệp vụ dễ bị bỏ sót.** Người nhận chấm 0% **không còn** làm điểm hoàn tất về
> 0 — accuracy giờ chỉ ảnh hưởng `value_bonus`. Và `GIFT_COMPLETED_GIVER` có
> `affects_lifetime = true`, nên `lifetime` của người tặng nay nhích **sớm hơn trước**, tức
> người tặng lên hạng sớm hơn với cùng một chuỗi giao dịch.

Giá trị ước tính thiếu/0 thì `value_bonus = 0`. Tỷ lệ VNĐ/điểm, Point Rule hoàn tất, thời
hạn chốt đánh giá `N` ngày và phần trăm mặc định khi không có đánh giá đều do Admin cấu hình,
không hard-code. Làm tròn số dương theo `round_half_up`: phần lẻ **≥ 0,5 lên**, `< 0,5 xuống`.
Snapshot giá trị, tỷ lệ và rule áp dụng vào giao dịch để đổi cấu hình về sau không hồi tố.

Ví dụ tỷ lệ 1 điểm/1.000 VNĐ và giá trị khai 1.000.000 VNĐ: `value_max_points = 1.000`.
Accuracy 100% thưởng thêm 1.000; 70% thưởng thêm 700, **cả hai đều ngoài điểm hoàn tất**.

## 4. Review và chốt thưởng

Sau `COMPLETED`, mỗi bên được gửi một review. Người nhận chấm sao/nhận xét và
`accuracy_percent` 0–100; người cho chấm sao/nhận xét, không tự chấm accuracy món đồ.
Mỗi người được **sửa review của chính mình tối đa một lần** trước `completed_at + N ngày`.
Lần sửa giữ audit trước/sau; sau hạn hoặc đã sửa một lần thì khoá. Giver Accuracy tổng hợp
phải phản ánh bản review cuối; giá trị mặc định khi không review **không** tính là mẫu thật.

Tại hạn N ngày, chốt phần trăm cuối của người nhận; nếu không có review thì dùng phần trăm
mặc định Admin cấu hình. Chỉ khi đó mới cộng `value_bonus` **một lần** qua Point Ledger.
Không cộng sớm tại lần gửi review đầu tiên vì review còn quyền sửa. Job chốt phải idempotent;
đánh giá gửi/sửa và job chốt cùng thời điểm phải được tuần tự hoá. Quyền đánh giá hai chiều
và các ngưỡng công bố Giver Accuracy hiện hành không bị thay đổi bởi quyết định này.

## 5. Acceptance tests tối thiểu

1. Bài chờ đăng ngày 1, không có phản hồi: ngày 8 tự vào giai đoạn 30 ngày; hết giai đoạn
   vẫn không ghép thì `EXPIRED`, không kéo sang 3 tháng.
   Bài `INSTANT` không có phản hồi cũng qua mốc 7 ngày đầu, tự mở thêm 30 ngày và hết hạn
   sau tổng cộng 37 ngày từ lúc đăng.
2. Bài có nhiều ứng viên: Kim Cương chọn tay trong 7 ngày; dưới Kim Cương bị từ chối chọn
   tay; hết 7 ngày còn ứng viên thì auto-select đúng tiêu chí.
3. Người xin đổi điểm ngày 3: chỉ một người thắng, debit/ledger/giao dịch cùng thành công,
   không auto-select lại; huỷ giao dịch hoàn đúng debit một lần dù Admin đã đổi tỷ lệ.
4. Thiếu giá trị ước tính: không đổi điểm; hoàn tất vẫn cộng `completion_points`, bonus 0.
5. Review 70% rồi sửa 100% trước hạn: chỉ tại hạn N cộng đủ bonus 100% một lần. Không
   review thì dùng % mặc định Admin cấu hình; sau hạn không sửa được.
6. Bài `WANTED`: hai chế độ, Rank chọn tay và mốc 7+30 như `OFFER`; không có CTA đổi điểm.

## 6. Khoảng cách với backend `origin/main` ngày 07/10/2026

**Mục 3 (hai khoản điểm người cho) xong 07/10** — xem khung trong mục đó.

**Mục 1 XONG, 11/10.** `EXTENDED` ra khỏi cả enum TypeScript lẫn enum Postgres
(`1799300000000`), đồng hồ 7 ngày tính từ **lúc đăng** và đặt ngay khi bài công khai (nên bài
không có phản hồi cũng có hạn), giai đoạn 30 ngày thành bước tự động, `expires_at` là 37 ngày
cho **cả** `OFFER` và `WANTED`, quyền chọn tay gắn hạng Kim Cương, và `EXPIRED` báo cho cả hai
bên.

Bài đăng TRƯỚC 11/10 giữ hạn ba tháng đã hứa: hai migration backfill chỉ **cho**
`selection_deadline`, không rút `expires_at` — hạ nó là làm hết hạn ngay mọi bài quá 37 ngày
tuổi, tức xoá bài của người ta chứ không phải di trú.

Ba việc của mục 1, nay **xong cả ba**:

1. ✅ **Áp cho `WANTED` — xong 11/10, SAU khi đảo vai.** Thứ tự đó là cả nội dung của lượt
   sửa, và lý do bản trước cố ý để `WANTED` ngoài: truy vấn tìm bài tới hạn **không lọc
   `post_type`** và lấy `SELECT post.author_id AS giver_id`, nên đặt hạn trước khi sửa là để
   job tự dựng giao dịch với hai vai ngược nhau.

   Vai nay suy từ `giftTransactionRoles` — một hàm thuần, một chỗ duy nhất biết luật — và
   `acceptRequest` **trả về** vai đã phân giải để nơi gọi khỏi đoán lại. Bốn chỗ từng đóng
   cứng giả định "tác giả là người cho" đã sửa hết: `acceptRequest`, `acceptRequestsBatch`,
   đường thông báo của auto-select, và nhánh `INSTANT`.

   Và một lỗi thứ hai tìm ra khi làm: phép chống trùng lượt trao lọc `receiver_id =
   requester_id` — đúng cho bài Muốn Tặng và **không bao giờ khớp** cho bài Muốn Nhận, nơi
   người phản hồi là `giver_id`. Nó im lặng mất tác dụng, và tồn kho bị trừ hai lần cho một
   lượt bàn giao. Nay khoá theo ĐỐI PHƯƠNG.
2. ✅ **Quyền Kim Cương chọn tay — xong 11/10.** Và chỗ thiếu nặng hơn đặc tả: tới 10/10
   **không đường nào kiểm quyền này**, nên mọi chủ bài đều chọn tay được, kể cả Người xem.

   Capability `SELECT_REQUESTER` đã seed đủ năm bậc từ `1790100000000` mà không chỗ nào đọc —
   nó nằm trong `DeclaredButUnread` của `test:entitlement-inventory` với lý do: *"hạn mức
   1/3/5/10 theo bậc nhưng không ai đọc, nên không ai biết đơn vị của nó là gì — mỗi bài được
   chọn mấy người, hay mỗi ngày?"*

   CHỐT-10 chốt điều đó theo cách làm câu hỏi biến mất: nó cấp hoặc không cấp **quyền**, không
   nói con số nào. Nên capability thành `GATE`, `1799500000000` đặt `allowed` đúng Kim Cương
   và `limit_value` về 0, và hai đường duyệt tay (`accept` + `batch-accept`) đọc `allowed`.
   Danh sách nợ của `test:entitlement-inventory` nay **rỗng**.

   `reject` và việc xem danh sách vẫn mở cho mọi bậc — đặc tả nói rõ đó là quyền khác.
3. ✅ **`EXPIRED` đóng phản hồi và báo cho cả hai bên — xong 11/10.**

   Một bản ghi trước của dòng này nói "vòng quét hiện chỉ đặt `status = 'EXPIRED'`, không chạm
   `gift_requests` và không gửi gì". **Sai** — tôi đo `post.repository.ts` rồi suy ra cả đường
   mà không đọc use case bên trên nó. `CloseOpenRequestsService` đã đóng yêu cầu về `CANCELLED`
   và gửi `GIFT_REQUEST_CLOSED` cho từng người xin từ 28/09.

   Phần thật sự thiếu là phía **chủ bài**: họ được nhắc trước 7 ngày qua `POST_EXPIRING_SOON`
   rồi không ai nói gì nữa, nên người không mở app trong tuần đó chỉ thấy bài mình biến khỏi
   feed. Nay có `POST_EXPIRED`, gửi từng bài một, nội dung nói rõ là **vẫn gia hạn được** —
   thiếu câu đó thì người ta đăng lại từ đầu và tốn thêm một suất quota.

   Lịch sử giữ nguyên: dòng yêu cầu không bị xoá, chỉ chuyển `CANCELLED`.

**Mục 2 xong phần sàn giữ hạng, 11/10 (CHỐT-13).** Chỉ tiêu được
`max(0, balance - threshold(current_rank))`, chặn ở **cả** quote và lệnh đổi — quote là xem
trước, chỗ cho phép là chỗ trừ điểm. `wouldDemote`/`rankAfter` bị gỡ: chúng là giao diện của
F76, và một lượt đổi được thì không bao giờ tụt hạng nên chúng thành hằng số. Thay bằng
`reservedForRankPoints` + `availablePoints`. Bảng bậc chưa seed thì không tiêu được
(fail-closed).

**Mục 2 xong phần hoàn điểm khi huỷ, 11/10 (CHỐT-13).** Trước đó chỉ có đường hoàn khi *bước
duyệt* hỏng (`ITEM_REDEMPTION:REFUND:<requestId>`, trong cùng use case); lượt trao bị huỷ **sau
đó** — người cho đổi ý, người nhận không đến, người gửi báo không trả ship — thì không đường nào
hoàn, và người đổi mất điểm lẫn món đồ.

Nay `RefundRedemptionOnCloseService` tra bút toán gốc theo khoá
`ITEM_REDEMPTION:<requestId>` rồi **đảo** nó. Ba điều đặc tả đòi là tính chất có sẵn của
`reverseEntry`, không phải thứ phải tự canh:

- *đúng số điểm đã trừ* — nó đọc `delta` của bút toán gốc, không nhận số từ nơi gọi, nên không
  có đường nào tính lại theo tỷ lệ hiện tại;
- *bút toán hoàn riêng* — sổ chỉ ghi thêm, có trigger chặn `UPDATE`;
- *chỉ một lần* — khoá chống trùng là `REVERSAL:<entryId>`.

Nối vào **cả hai** đường đóng lượt trao: người dùng tự huỷ và người gửi báo không trả ship.
Khoản phạt không-trả-ship là bút toán RIÊNG và vẫn giữ — nó phạt việc không trả ship, không
phải việc lượt trao bị đóng. Lỗi khi hoàn **không** ném ra: lượt huỷ đã commit, và báo "huỷ
thất bại" cho một lượt đã đóng thật là tệ hơn. Điểm chưa hoàn là một khoản nợ đọc được — bút
toán trừ còn đó mà không có `REVERSAL:<id>` đi kèm.

`IReopenedQueue.cancelledRequestId` là đường dẫn `requestId` ra khỏi `close()`: đó là chỗ duy
nhất trong đường huỷ còn biết yêu cầu nào vừa bị huỷ.

**Mục 2 xong, 11/10.** Việc cuối là **xác nhận lại khi báo giá cũ**: `POST /posts/:id/redeem`
nay đòi body `confirmedPoints` — số điểm người dùng đã thấy. Lệch với giá máy chủ tính lại thì
`409 REDEMPTION_QUOTE_STALE` và không trừ gì.

Trường này **bắt buộc**, và đó là cả điểm chính: một phép xác nhận bỏ qua được bằng cách không
gửi trường nào thì không phải phép xác nhận — hành vi cũ (tính lại theo giá mới rồi trừ luôn)
sẽ quay về nguyên vẹn chỉ bằng việc client lược một trường.

So theo **số điểm** chứ không theo giá trị và tỷ lệ riêng: điểm là con số người dùng thật sự
đồng ý trả, và là nơi hai đầu vào kia gộp lại. Giá rẻ đi cũng chặn — trừ ít hơn số đã đồng ý
nghĩa là màn hình người dùng đang nói sai về món đồ. Và `409` này đứng trước "không đủ điểm",
vì câu kia nhắc một con số người dùng chưa từng thấy.

Còn một việc **không** thuộc mục 2 nhưng đang ghi trong
[REDEMPTION-REQUIREMENT-GAP.md](./REDEMPTION-REQUIREMENT-GAP.md): `quoteRedemption` làm tròn
`Math.ceil`, còn contract đích ghi `round_half_up`. Chưa đổi, và không được coi mục 2 xong là
đã khép việc đó.

**Mục 4 xong phần sửa đánh giá, 12/10.** `PATCH /transactions/:id/reviews/mine` cho mỗi bên
sửa đánh giá của mình **đúng một lần**, trước `completed_at + review.grace.graceDays`. Hạn trả
kèm ở `myEditableUntil` của `GET .../reviews`, vì số ngày là cấu hình động.

Bảng `transaction_reviews` vốn chặn mọi `UPDATE`/`DELETE` bằng trigger, với lý do ghi thẳng
trong migration gốc: *"một đánh giá sửa được sau đó là một chỉ số không chứng minh được điều
gì."* Lý do đó vẫn đúng, nên bất biến **nới chứ không bỏ**: trigger
`TRG_transaction_reviews_edit_once` tự chụp bản cũ vào `previous_*`, tự đặt `edited_at`, chặn
lần sửa thứ hai, chặn mọi lượt xoá, và chặn đổi các cột bất biến — kể cả với một câu `UPDATE`
viết tay trên production. Audit nằm **trong hàng** vì "tối đa một lần" làm bản cũ có kích cỡ
cố định; một bảng revision cho đúng một hàng là ba câu JOIN để đọc thứ bốn cột nói xong.

Hạn `N` KHÔNG vào trigger: nó là cấu hình động Admin đổi được. Trigger giữ phần không phụ
thuộc cấu hình, use case giữ cửa sổ thời gian. Và **đúng mốc** là đã khoá, không phải "sau
mốc": job chốt thưởng lấy `completed_at <= now() - N days`, nên tại mốc ấy `value_bonus` đã
tính theo bản đánh giá cuối.

Phần còn lại của mục 4 — chốt % tại hạn, mức mặc định khi không ai chấm, cộng `value_bonus`
đúng một lần — đã có từ CHỐT-14 (`SettleGiftRewardsUseCase`, `review.grace`). Chỉ số tổng hợp
phản ánh bản cuối vì `editReview` tính lại accuracy và điểm sao trong cùng transaction.

**Mục 5 xong 12/10:** `npm run test:acceptance` (`test/acceptance-chot10.check.ts`) dựng cả
sáu tình huống trên Postgres thật, trong một database nháp riêng.

Nó KHÔNG thay các script cũ (`post-lifecycle`, `selection`, `redemption`, `gift-rewards`,
`reviews`) mà canh thứ không script nào canh được một mình: các mảnh nối lại có ra đúng câu
chuyện nghiệp vụ hay không. Ví dụ rõ nhất là tình huống 5 — `reviews` nói *"sửa được một
lần"*, `gift-rewards` nói *"bonus chốt tại hạn, một lần"*, cả hai xanh mà câu *"sửa 70% thành
100% trước hạn thì tại hạn cộng theo 100%"* vẫn có thể sai, nếu truy vấn chốt thưởng đọc một
hàng khác với hàng vừa sửa.

CI tự nhặt mọi script `test:*` trong `package.json`, nên không cần sửa workflow.

Đây là **danh sách đã triển khai**, nhưng vẫn không được coi tài liệu là bằng chứng API đã
chạy — bằng chứng là lượt chạy xanh của các script trên.
Chi tiết gap kỹ thuật, atomicity, API đích và ma trận kiểm thử nằm tại
[REDEMPTION-REQUIREMENT-GAP.md](./REDEMPTION-REQUIREMENT-GAP.md).
