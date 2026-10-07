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

> **Phép kiểm nào đỏ khi implement — bản đã sửa 07/10.**
>
> Ghi chú đầu của mục này nói `npm run test:gift-rewards` sẽ đỏ. **Sai.** Script đó gọi
> `ledger.appendByRule` **trực tiếp** với `multiplierPercent`, tức nó kiểm *cơ chế nhân của
> point ledger* — một primitive mà CHỐT-14 KHÔNG đổi, và các rule khác vẫn dùng. Nó có 0 tham
> chiếu tới `AwardGiftCompletionUseCase`, nên nó **xanh nguyên**. Đừng sửa nó.
>
> Phép kiểm thật sự canh quy tắc này là unit spec
> `award-gift-completion.use-case.spec.ts`. Đo được khi thực hiện: **4 trong 10 phép kiểm đỏ**,
> tất cả ở kỳ vọng `multiplierPercent`, còn 6 phép kiểm khác (chống trùng, nuốt ngoại lệ vận
> hành, rơi về mặc định khi cấu hình hỏng) xanh nguyên — đúng tập đỏ mong đợi.
>
> **Thứ tự bắt buộc:** sửa `AwardGiftCompletionUseCase` trước, phép kiểm sau. Sửa test cho
> xanh trước là cách làm spec và mã nói trái nhau mà không còn gì báo.
>
> Và một hệ quả nghiệp vụ dễ bị bỏ sót: **người nhận chấm 0% không còn làm điểm hoàn tất về
> 0.** Accuracy giờ chỉ ảnh hưởng `value_bonus`. Bút toán 0% vẫn được ghi để chiếm khoá chống
> trùng, nên job hết hạn chờ không trả thêm mức mặc định cho lượt đã bị chấm.

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

Backend hiện có `INSTANT`/`OPTIMAL`/`EXTENDED` cho `OFFER`, đồng hồ 7/30 ngày khởi động từ
request đầu tiên; chưa áp chế độ này cho `WANTED`. Review hiện bất biến tại database và
thưởng người cho đang lấy Point Rule × accuracy; F76 hiện ghi cho phép tiêu điểm tụt Rank.
Đây là **danh sách phải triển khai**, không được coi tài liệu mới là bằng chứng API đã chạy.
Chi tiết gap kỹ thuật, atomicity, API đích và ma trận kiểm thử nằm tại
[REDEMPTION-REQUIREMENT-GAP.md](./REDEMPTION-REQUIREMENT-GAP.md).
