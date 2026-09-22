# Flow cho–nhận: hiện trạng, lỗ hổng, và thiết kế trọn vẹn

> Tài liệu này đối chiếu **code đang chạy** với [F30–F38](../FEATURES.md#5-giao-dịch--hàng-đợi)
> và đề xuất một flow khép kín. Mọi khẳng định về hiện trạng đều dẫn file và dòng —
> không suy luận từ tài liệu, vì tài liệu và code đã lệch nhau ở đúng chỗ này.

---

## 1. Flow đang chạy

```
B xin          POST /transactions               ─▶ REQUESTED
A duyệt        POST /transactions/:id/accept    ─▶ ACCEPTED    trừ kho, mở chat
B xác nhận     POST /transactions/:id/confirm   ─▶ COMPLETED   khoá chat
hai bên huỷ    POST /transactions/:id/cancel    ─▶ CANCELLED   trả kho, khoá chat, mở lại hàng đợi
cron 5 ngày    npm run transaction:autocomplete ─▶ COMPLETED   khoá chat
```

Bốn đường này chạy đúng và đã có kiểm chứng trên database thật. Vấn đề nằm ở
những gì **không** có.

---

## 2. Sáu lỗ hổng

### H1 — `DELIVERING` là trạng thái chết

`DELIVERING` nằm trong enum, trong `OpenGiftTransactionStatuses`, và được chấp
nhận ở cả `confirmReceipt` lẫn `close`. Nhưng **không một câu lệnh nào chuyển
giao dịch sang nó**.

Nghĩa là hệ thống không có bước "đã gửi hàng". Với `GIVER_SHIPS` (CH-2) đây là
lỗ thật: A đã gửi, hàng đang trên đường, nhưng dữ liệu vẫn nói `ACCEPTED` —
không phân biệt được với lượt mà A còn chưa làm gì.

### H2 — Trạng thái bài không bao giờ đổi

[F34](../FEATURES.md#f34--chấp-nhận-giao-dịch--mở-chat) ghi: "*cập nhật trạng
thái bài và số lượng còn lại*". `accept()` chỉ làm vế sau — nó `UPDATE posts SET
remaining_quantity = remaining_quantity - $2` và không đụng `status`.

Bài đứng mãi ở `PUBLISHED`. `RESERVED`, `DELIVERING`, `COMPLETED` trong
`GiftPostStatuses` chưa bao giờ được dùng ở luồng bài generic.

### H3 — Bài đã cho hết vẫn chiếm quota đăng bài, vĩnh viễn

Hệ quả trực tiếp của H2, và là lỗi nặng nhất trong sáu cái.

`QuotaStatuses` gồm `PENDING_REVIEW`, `PUBLISHED`, `RESERVED`, `DELIVERING`
(`post.repository.ts`). Bài không bao giờ rời `PUBLISHED`, nên **mỗi bài đã tặng
xong vẫn ăn một suất quota của tác giả mãi mãi**.

Người càng tặng nhiều càng sớm hết chỗ đăng bài mới — ngược hoàn toàn với ý đồ
của hệ thống hạng.

### H4 — Hoàn tất một lượt trao không cộng điểm nào

Các rule đã seed: `PHONE_VERIFIED_FIRST_TIME` (28), `REFERRAL_QUALIFIED` (56),
`SHIP_UNPAID_PENALTY` (−50). **Không có rule nào cho việc tặng hoặc nhận.**
Không chỗ nào gọi `appendByRule` khi giao dịch `COMPLETED`.

[ROADMAP](./ROADMAP.md) ghi "*Xong khi: hoàn tất một giao dịch → điểm vào
ledger*" — chưa xong. `GIFT_COMPLETED_*` mới nằm ở
[ADMIN-CONFIG-DESIGN](./ADMIN-CONFIG-DESIGN.md), chưa seed, chưa gọi.

Hệ quả số học: ngưỡng `SILVER` là 672 điểm, mà đường kiếm điểm duy nhất còn lại
là giới thiệu (56/lượt). Tức **phải mời 12 người mới lên nổi Bạc**, và tặng đồ —
việc chính của nền tảng — không đóng góp gì.

### H5 — Đồng hồ 5 ngày đếm từ sai mốc

`completeDueDeliveries` quét `accepted_at <= now() - 5 days`.

Với ship liên tỉnh 4–5 ngày, hoặc hai bên hẹn gặp cuối tuần sau, cron đóng lượt
trao **trước khi hàng tới nơi**. Đồng hồ nên đếm từ lần cuối có chuyện xảy ra,
không phải từ lúc duyệt.

### H6 — Tự hoàn tất không kiểm tranh chấp, nên lượt trao đổ vẫn thành "thành công"

[F36](../FEATURES.md#f36--người-nhận-xác-nhận--tự-động-hoàn-tất-sau-5-ngày) yêu
cầu tự hoàn tất chỉ khi "*không có huỷ, **không có tranh chấp** và chưa ai xác
nhận*". Vế giữa chưa hiện thực — không có khái niệm tranh chấp.

Kịch bản CH-2 cho thấy hậu quả: B từ chối nhận, hàng về lại A, A report. Không
ai xác nhận gì, nên ngày thứ 5 cron đánh dấu `COMPLETED`. Kết quả:

- A được cộng một lượt trao hoàn tất vào bộ đếm duy trì hạng
- B được ghi là **đã nhận** món họ từ chối
- Món đồ đang nằm ở nhà A

B vừa bị trừ 50 điểm vì không trả ship, vừa được ghi công đã nhận quà. Hai bản
ghi nói ngược nhau về cùng một sự việc.

---

## 3. Flow trọn vẹn đề xuất

```
                bài PUBLISHED, còn hàng
                          │
                          │ B xin
                          ▼
                     REQUESTED ─────── B rút, hoặc A từ chối ──▶ CANCELLED
                          │
                          │ A duyệt
                          ▼
                     ACCEPTED ──────────────────────────────┐
                          │         trừ kho                 │
                          │         mở chat                 │
                          │         bài → RESERVED nếu hết  │
                          │                                 │
                          │                                 │
                          │ A bấm "đã trao" + ảnh           │ huỷ
                          │   (ship, hoặc trao tay)          │
                          ▼                                 │
                     DELIVERING ───────────────────────┤
                  (ghi handed_over_at)                  │
                          │                                 │
                          │ B xác nhận, hoặc cron quá hạn   │
                          ▼                                 ▼
                     COMPLETED                          CANCELLED
              cộng điểm cả hai bên               trả kho, khoá chat
              khoá chat                          mở lại hàng đợi
              bài → COMPLETED nếu hết            bài → PUBLISHED nếu còn hàng
```

### Mỗi bước tác động tới cái gì

| Bước | Giao dịch | Bài đăng | Chat | Điểm | Hàng đợi |
| --- | --- | --- | --- | --- | --- |
| **Xin** | `REQUESTED` | — | — | — | vào `STANDBY` |
| **Duyệt** | `ACCEPTED` | kho −n; `RESERVED` khi kho về 0 | **mở** | — | — |
| **Đã trao** *(mới)* | `DELIVERING` + `handed_over_at` | — | — | — | — |
| **Xác nhận** | `COMPLETED` + `completed_at` | `COMPLETED` khi kho = 0 và không còn lượt dở | **khoá** | **cộng cả hai bên** | — |
| **Tự hoàn tất** | `COMPLETED` | như trên | **khoá** | như trên | — |
| **Huỷ** | `CANCELLED` + `closed_by` | kho +n; về `PUBLISHED` nếu còn hàng | **khoá** | — | `STANDBY` → `PENDING` |
| **Report ship** | `CANCELLED` (xem Q3) | kho +n | **khoá** | **−50 cho B** | `STANDBY` → `PENDING` |

### Những chỗ sửa, theo thứ tự nên làm

| # | Sửa | Vá lỗ | Ghi chú |
| --- | --- | --- | --- |
| 1 | Bài đổi trạng thái theo tồn kho và lượt trao | H2, H3 | ✅ `38e4537` — `test:post-status` |
| 2 | `POST /transactions/:id/handover` → `DELIVERING` | H1 | ✅ kèm ảnh bằng chứng — `test:handover` |
| 3 | Tự hoàn tất đếm từ `COALESCE(handed_over_at, accepted_at)` | H5 | ✅ |
| 4 | Rule điểm khi `COMPLETED`, idempotent theo `transaction_id` | H4 | ✅ `fafdb88` — `test:gift-points` |
| 5 | Report ship-unpaid đóng giao dịch | H6 | ✅ kèm đòi ảnh — `test:handover` |

**Sáu lỗ hổng ở §2 đều đã vá.** Tài liệu này giữ lại phần hiện trạng làm lịch sử —
nó giải thích vì sao thiết kế bây giờ trông như thế.

**Về bước 1 — trạng thái bài suy ra từ đâu.** Không thêm cột đếm mới. Bài
`COMPLETED` khi `remaining_quantity = 0` **và** không còn lượt trao nào đang mở
trên bài đó. Hai điều kiện đều đọc được từ dữ liệu sẵn có, nên không có con số
thứ hai để lệch với sự thật — cùng nguyên tắc đã dùng cho `creditCount`/
`debitCount` của ledger.

**Về bước 4 — cộng cho ai.** Cả hai bên, hai rule khác nhau. Người tặng là bên
bỏ ra vật phẩm; người nhận hoàn tất một lượt trao tử tế thì cũng nên được ghi
nhận, nếu không thì người chỉ đi nhận sẽ không bao giờ lên hạng và không bao giờ
mở được quyền đăng bài. Hai rule tách biệt để Admin chỉnh độc lập.

---

## 4. Những chỗ cần Bên A chốt

### Q1 — Bài đã có người nhận còn hiện trên bản đồ không?

`PubliclyVisibleGiftPostStatuses` hiện gồm `PUBLISHED` và `RESERVED`, tức bài đã
được giữ chỗ **vẫn hiện**. Hai hướng:

- **Vẫn hiện** — người xem biết món đó đã có chủ, không hụt hẫng khi bài tự biến
  mất. Nhưng bản đồ đông hơn và có bài không xin được.
- **Ẩn đi** — bảng tin chỉ còn thứ xin được. Nhưng bài "rơi khỏi" danh sách
  trong lúc người ta đang xem.

Hiện tại là phương án đầu. Giữ hay đổi?

### Q2 — Đã chốt: số điểm do Admin cấu hình

Hai rule, code chỉ biết **mã**, không biết con số:

| Rule | Khởi tạo | Đẩy `lifetime`? | Trần/ngày |
| --- | --- | --- | --- |
| `GIFT_COMPLETED_GIVER` | 56 | **Có** | 10 |
| `GIFT_COMPLETED_RECEIVER` | 28 | **Không** | 5 |

Con số chỉ là giá trị khởi tạo. Rule có đánh phiên bản, nên khi đánh giá
(Accuracy) làm xong thì thêm phiên bản mới, không sửa dữ liệu cũ.

**Người tặng nhiều điểm hơn** vì họ bỏ ra một món đồ thật, còn người nhận đến lấy
và bấm xác nhận. Cho hai bên bằng nhau là xoá mất chêch lệch khuyến khích về phía
việc mà nền tảng tồn tại để làm.

**Nhận không đẩy `lifetime`** — đây là lớp chặn cày hạng. `lifetime` là sàn của Rank;
nếu nhận cũng đẩy thì hai người chuyền qua chuyền lại một món đồ là cùng lên hạng.
Nhận vẫn có điểm tiêu được — đủ để họ có lý do bấm xác nhận — nhưng **hạng chỉ đo
thứ mình cho đi**.

> ⚠️ Trần theo ngày làm chậm việc cày điểm chứ **không chặn được**. Hai người thông
> đồng vẫn gồn được điểm tiêu. Chống gian lận thật thuộc F50/M5.

**Điểm không được làm hỏng việc xác nhận.** Món đồ đã đến tay là một **sự thật**;
thưởng bao nhiêu là một **chính sách**. Đạt trần trong ngày, hoặc Admin tắt rule, thì
người nhận vẫn bấm xác nhận được — chỉ là không ai được điểm.

### Q3 — Đã chốt: có, và phải có ảnh mới báo được

Nếu **có**: hết cảnh lượt trao đổ tự thành `COMPLETED` (H6), chat khoá ngay,
đồng hồ lưu trữ bắt đầu ở mốc có nghĩa, và lượt huỷ tính cho B — chảy thẳng vào
tiêu chí `FEWEST_CANCELLATIONS` của CH-1.

"Lời một phía" được vá bằng ảnh: phải có `HANDOVER` (để lại từ bước trao đồ) **và**
`RETURNED` (gửi kèm chính lần báo) thì mới báo được; thiếu một trong hai thì
`409 GIFT_HANDOVER_EVIDENCE_REQUIRED`. Muốn trừ điểm người khác thì phải để lại dấu
vết trước, từ lúc chưa biết sẽ có tranh chấp.

Lượt huỷ tính cho **người nhận** chứ không phải người bấm báo — họ là bên làm đổ
lượt trao, và `closed_by` chảy thẳng vào tiêu chí `FEWEST_CANCELLATIONS` của CH-1.

### Q4 — Đã chốt: bước trao đồ có ảnh làm bằng chứng

Xem [§6](#6-bằng-chứng-bằng-ảnh).

---

## 6. Bằng chứng bằng ảnh

Report "không trả ship" (CH-2) hiện là **lời một phía**: A bấm là B mất 50 điểm, không
ai đối chứng. Ảnh vá đúng chỗ đó.

### Ảnh chứng minh được gì

Nói thẳng để không kỳ vọng nhầm: ảnh gói hàng **không** chứng minh đã gửi đi, không
chứng minh bên trong là gì, không chứng minh gửi tới địa chỉ của B. Ảnh có thể chụp
lại, dựng, hoặc lấy trên mạng.

Cái ảnh thực sự làm được là tạo ra **thế bất đối xứng**: A có ảnh trao thì câu chuyện
của A nhất quán; A không có ảnh nào thì report của A không dựa trên gì cả. Từ đó ra
một luật sạch:

> **Không có ảnh trao đồ → không report được.**

Muốn trừ điểm người khác thì phải để lại dấu vết trước, từ lúc chưa biết sẽ có
tranh chấp.

### Ba mốc

| Mốc | Ai | Ảnh gì | Bắt buộc? |
| --- | --- | --- | --- |
| **Đã trao** (`DELIVERING`) | người tặng | gói hàng + phiếu gửi, hoặc món đồ lúc trao tay | Không — nhưng thiếu thì mất quyền report |
| **Đã nhận** (`COMPLETED`) | người nhận | món đồ nhận được | Tuỳ chọn |
| **Report hoàn hàng** | người tặng | gói hàng quay về | **Bắt buộc** |

**Tối đa 3 ảnh mỗi mốc.** Đủ chụp gói hàng, phiếu gửi và một góc nữa; nhiều hơn chỉ
tốn dung lượng. (Bài đăng đang giới hạn 10 ảnh, nhưng đó là ảnh để người ta chọn đồ,
khác mục đích.)

### Tự đến lấy cũng có bước trao

Bước `DELIVERING` **không phải riêng cho ship**. Tự đến lấy cũng có lúc trao đồ, và cũng
cần ảnh — vì tranh chấp "tôi chưa hề nhận được đồ" vẫn xảy ra được khi không có ship.

Khác biệt duy nhất: **không report ship được** khi tự đến lấy, vì không có phí ship để
mà quọt. Ràng buộc này đã có sẵn: `ReportShipUnpaidUseCase` đòi
`post.shipPayer = RECEIVER`, mà `shipPayer` chỉ khai được khi `GIVER_SHIPS`.

### Không chụp ảnh thì sao

Lượt trao **vẫn đi tiếp bình thường**, chỉ mất quyền report. Chặn không cho chuyển
`DELIVERING` khi thiếu ảnh là phạt người tặng vì một việc họ không bắt buộc phải làm,
và đẩy lượt trao vào tự-hoàn-tất sau 5 ngày — tệ hơn.

### Lưu ở đâu

Dùng lại `IObjectStorage` đã có: presigned PUT + `confirm*Upload` kiểm `HeadObject`
và tiền tố chủ sở hữu. Thêm một đường `createTransactionEvidenceUpload` theo đúng
khuôn, key `users/{userId}/transactions/{id}/evidence/{uuid}.ext`. **Không dựng đường
tải lên thứ hai.**

Một hệ quả đáng giá: **ảnh bằng chứng nằm NGOÀI chat**, nên xoá chat theo hạn lưu trữ
không làm mất bằng chứng. Đây là lý lẽ mạnh nhất cho việc xoá chat — trước khi có
ảnh thì xoá chat đồng nghĩa với xoá chứng cứ.

---

## 5. Cái này KHÔNG bao gồm

- **Đánh giá / Accuracy** — cần cho công thức điểm cuối cùng, nhưng flow chạy
  được mà không có nó.
- **Tranh chấp có Admin xử** — [F60](../FEATURES.md#f60--kiểm-duyệt--quản-lý-người-dùng)
  dự kiến. Hiện chỉ có report ship-unpaid, tự động, không ai duyệt.
- **Nối API đơn vị vận chuyển** — ngoài phạm vi; ship là COD bên ngoài hệ thống.
- **Xoá chat theo hạn lưu trữ** — thiết kế riêng, chờ flow này chốt xong vì mốc
  đếm ngược phụ thuộc vào lúc khoá phòng.
