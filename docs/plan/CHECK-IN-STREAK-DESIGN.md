# Thiết kế điểm danh, streak và điểm danh bù

Trạng thái: **đặc tả đề xuất, chưa triển khai** · Ngày: 30/09/2026. Nguồn yêu cầu:
SRS mục 3.7 và xác nhận của Product Owner ngày 30/09/2026: streak tính theo **ngày liên
tiếp**, lượt điểm danh bù chỉ sinh từ **giao dịch tặng/nhận quà hoàn tất**. Tài liệu này
định nghĩa contract mục tiêu; `docs/API.md` chỉ liệt kê endpoint đã chạy.

## 1. Quy tắc nghiệp vụ

- Ngày nghiệp vụ là ngày lịch ở `Asia/Ho_Chi_Minh` (00:00–23:59:59.999). Không dùng múi
  giờ thiết bị. Một user chỉ có một bản ghi điểm danh cho mỗi ngày, kể cả retry đồng thời.
- `POST /check-ins` điểm danh **ngày hiện tại**. Một ngày đã điểm danh trả lại kết quả cũ,
  không tăng streak hoặc cộng điểm lần hai. `GET /check-ins/me` trả trạng thái hiện tại,
  và `GET /check-ins/me/history` trả lịch sử phân trang để app dựng lịch.
- Streak là chuỗi ngày liên tiếp có điểm danh thường hoặc điểm danh bù. Hôm nay chưa điểm
  danh thì chuỗi kết thúc hôm qua vẫn được hiển thị. Khi có ngày thiếu còn trong cửa sổ
  bù, run giữ trạng thái `AT_RISK`: các ngày điểm danh mới vẫn được ghi vào run tạm, nhưng
  `currentStreak` chỉ đếm đoạn liên tiếp hiện tại sau lỗ hổng; `recoverableStreak` cho
  biết độ dài nếu bù hết các `pendingGapDates`. **Không phát thưởng mốc qua lỗ hổng**.
  Bù đủ lỗ hổng thì tính lại chiều dài, phát mốc mới đúng một lần. Khi lỗ hổng hết hạn,
  run cũ chốt `ENDED`, đoạn sau lỗ hổng trở thành run mới và được xét mốc của chính nó;
  không backdate hoặc thu hồi thưởng đã phát. Tuần ở UI là nhóm 7 ngày liên tiếp, không
  reset vào thứ Hai. Các mốc khởi đầu là **7, 14, 30, 50 ngày**; Admin có thể thêm/sửa mốc.
- Mỗi lần điểm danh thường được cộng điểm cơ bản theo policy chuyên biệt
  `CHECK_IN_DAILY`; đạt đúng mốc thì cộng **thêm** thưởng `CHECK_IN_STREAK_MILESTONE`
  theo mức của mốc đang có hiệu lực. Hai mã được ghi vào `point_ledger` cùng
  `check_in_policy_revisions.version` làm rule version; không tạo bản sao số điểm ở
  `point_rules` tổng quát. Thưởng
  mốc chỉ một lần cho mỗi lần chinh phục mốc trong một chuỗi; lập chuỗi mới có thể nhận lại.
  Điểm danh bù không cộng điểm cơ bản của ngày bỏ lỡ nhưng có thể khôi phục chuỗi và mở
  thưởng mốc chưa từng được trả trong chuỗi đó. Mọi điểm đi qua `point_ledger` append-only.
- Chỉ `gift_transactions` của luồng tặng/nhận quà chuyển sang `COMPLETED` hợp lệ mới tích
  lượt. **Cả người tặng và người nhận**, nếu là hai tài khoản khác nhau, mỗi người nhận
  một giao dịch đủ điều kiện; mỗi `(transaction_id, beneficiary_id)` chỉ tính một lần.
  Giao dịch rao vặt, thanh toán, referral, giao dịch huỷ hoặc bị xác định gian lận không
  được tính. Tích đủ `transactions_per_repair` giao dịch thành công tạo **một lượt bù**;
  phần dư được giữ. Giao dịch được tính từ ngày tính năng có hiệu lực, không backfill ngầm.
- `POST /check-ins/repairs` nhận `date` bị lỡ với hiệu hai ngày lịch
  `(businessDate - missedDate) <= repair_window_days`, phải trước hôm nay và chưa từng
  điểm danh/bù. Bù từng ngày thiếu theo thứ
  tự cũ đến mới, tiêu đúng một lượt bù cho mỗi ngày. Nếu không còn lượt, ngoài cửa sổ hoặc
  ngày đã có bản ghi thì từ chối bằng mã lỗi ổn định. Không cho sửa/xoá một ngày đã bù.
- Admin có thể bật/tắt cơ chế, cấu hình `transactions_per_repair`, `repair_window_days`,
  điểm cơ bản và danh sách cặp `{streakDays, bonusPoints}`. Mốc phải nguyên dương, duy nhất,
  tăng dần; điểm không âm; `transactions_per_repair >= 1`, `repair_window_days >= 1`.
  Cấu hình được version hoá, có thời điểm hiệu lực, lý do và audit. Thay đổi chỉ áp dụng
  cho sự kiện tương lai: nếu Admin thêm mốc thấp hơn streak đã đạt, không tự phát thưởng
  hồi tố; các mốc chỉ xét khi một lần điểm danh/bù mới đi qua chúng. Không tính lại
  bút toán/lượt bù quá khứ.

## 2. Trạng thái và tính nhất quán

`check_in_entries`: `(user_id, policy_date)` duy nhất; `kind = NORMAL|REPAIR`,
`streak_run_id`, `streak_day`, `policy_version`, `created_at`. Bản ghi chỉ thêm; nếu cần
điều chỉnh phải có event đảo riêng và audit, không sửa lịch sử im lặng.

`check_in_runs`: id, user_id, start_date, latest_covered_date, current_length,
status (`ACTIVE|AT_RISK|ENDED`), version. Khoá hàng user/run trong transaction khi điểm
danh hoặc bù; tính lại từ entries khi cần đối soát. `streak_run_id` ổn định trong cả chuỗi,
kể cả sau khi bù.

`repair_transaction_progress`: một dòng cho mỗi `(user_id, transaction_id)` đủ điều kiện.
Mỗi user có một **cohort tích lượt** giữ version/ngưỡng khi giao dịch đầu tiên của cohort
đến. Đủ `transactions_per_repair` thì phát một lượt và đóng cohort; giao dịch tiếp theo
mở cohort mới theo policy đang hiệu lực. Khi Admin đổi ngưỡng giữa cohort, giao dịch mới
vẫn hoàn thành cohort cũ trước; không quy đổi lại tiến độ đã tích. App trả số giao dịch
đã có, ngưỡng và version của cohort đang mở.

`repair_credit_ledger`: append-only `(user_id, event_type, delta, balance_after,
reference_type/id, idempotency_key, policy_version, created_at)`; `ISSUE` phát một lượt,
`SPEND` tiêu một lượt khi bù, `REVERSE` xử lý giao dịch bị đảo trước khi lượt được tiêu.
Không bao giờ cho số dư lượt bù âm. Nếu giao dịch đã dùng để cấp lượt rồi bị đảo, đánh
dấu cần đối soát thủ công và không phát lại từ giao dịch đó; không xoá ngày bù đã có.

`check_in_milestone_awards`: `(streak_run_id, milestone_days)` duy nhất, tham chiếu
`point_ledger.id` và `policy_version`. Dùng cùng transaction database để ghi điểm danh,
tiêu lượt bù, cập nhật streak, bút toán điểm và award; nếu policy/ledger không khả dụng,
toàn bộ thao tác thất bại để không có lịch đã đánh dấu mà thiếu điểm. Mọi API ghi nhận
`Idempotency-Key`; khoá nghiệp vụ theo user/ngày và run/mốc vẫn chặn trùng khi client
không gửi hoặc gửi khoá khác.
Sau commit điểm, chạy luồng reconcile Rank hiện hữu từ balance và gửi thông báo nếu đổi
hạng; lỗi gửi notification không đảo bút toán đã commit.

## 3. API mục tiêu

Tiền tố `/api/v1`, Bearer token; body theo quy ước `{ resource: {...} }`, response theo
vỏ chuẩn `success/errorCode/errorOrigin/message/body`. Các route sau **chưa có trong code**:

| Route | Ý nghĩa / trường chính |
| --- | --- |
| `GET /check-ins/me` | `enabled`, `policyVersion`, `todayStatus`, `streakStatus`, `currentStreak`, `recoverableStreak`, `pendingGapDates`, `longestStreak`, `nextMilestone`, `repairCredits`, `transactionProgress` (đã có/ngưỡng/version của cohort), `repairWindowDays`, `businessDate`, `timezone` |
| `GET /check-ins/me/history?page=&pageSize=` | Ngày, `kind`, `streakDay`, `pointsAwarded`, `milestoneAwarded`, `canRepair`; chỉ dữ liệu của chính user |
| `POST /check-ins` | `{checkIn:{}}`; trả entry, streak mới, điểm ngày và thưởng mốc; retry trả cùng kết quả |
| `POST /check-ins/repairs` | `{repair:{date:"YYYY-MM-DD"}}`; trả entry, streak được phục hồi, lượt còn lại, thưởng mốc nếu có |
| `GET /admin/check-in-policy` | Policy active/draft và version; yêu cầu `config.read` |
| `PUT /admin/check-in-policy` | `{checkInPolicy:{expectedVersion,transactionsPerRepair,repairWindowDays,dailyPoints,milestones,enabled,effectiveAt,reason}}`; yêu cầu `config.write`, audit và version mới; version cũ trả conflict để tránh ghi đè |

Ví dụ policy publish (các điểm dưới đây **chỉ minh hoạ format, không phải mức thưởng
được duyệt**):

```json
{
  "checkInPolicy": {
    "expectedVersion": 3,
    "transactionsPerRepair": 4,
    "repairWindowDays": 7,
    "dailyPoints": 2,
    "milestones": [
      { "streakDays": 7, "bonusPoints": 10 },
      { "streakDays": 14, "bonusPoints": 25 },
      { "streakDays": 30, "bonusPoints": 60 },
      { "streakDays": 50, "bonusPoints": 120 }
    ],
    "enabled": false,
    "effectiveAt": "2026-10-01T00:00:00+07:00",
    "reason": "Chuẩn bị nghiệm thu chính sách điểm danh"
  }
}
```

`GET /check-ins/me/history` trả `canRepair` theo policy tại thời điểm đọc, để app ẩn
nút bù khi đã quá hạn/không đủ lượt. Backend vẫn kiểm tra lại khi `POST` vì trạng thái
có thể thay đổi giữa hai request. `POST /check-ins`/`repairs` trả cả `dailyPointsAwarded`
và `milestonePointsAwarded`; nếu điểm bù không đạt mốc, cả hai bằng 0. Không nhận user id
trong body. `enabled=false` thì route đọc vẫn cho xem lịch sử, route ghi trả lỗi policy.

Lỗi miền cần thêm vào `core-lib`/catalog khi implement: `CHECK_IN_ALREADY_RECORDED`
(nếu chọn trả 409 thay cho replay), `CHECK_IN_REPAIR_UNAVAILABLE`,
`CHECK_IN_REPAIR_DATE_INVALID`, `CHECK_IN_REPAIR_CREDIT_INSUFFICIENT`,
`CHECK_IN_POLICY_UNAVAILABLE`. Chưa gán mã hex trong tài liệu vì `API-ERRORS.md` sinh từ
code. Client dựa vào `(errorOrigin, errorCode)` sau khi endpoint được triển khai.

## 4. Quyền, vận hành và nghiệm thu

- Chỉ chủ tài khoản xem lịch và dùng lượt bù; user id lấy từ token, không từ path/query.
  Các route Admin dùng RBAC `config.read/write`, ghi `admin_audit_logs` với lý do,
  actor, version cũ/mới. Không cho Admin sửa tay lịch điểm danh qua các route này.
- Không cấp lượt từ trạng thái `ACCEPTED`, `DELIVERING` hoặc một webhook lặp. Giao dịch
  tự hoàn tất sau 5 ngày đủ điều kiện như hoàn tất thủ công; reversal phải được đối soát.
- UAT tối thiểu: đổi ngày quanh nửa đêm VN; hai request điểm danh đồng thời; ngày 7/14/
  30/50; bỏ một ngày rồi bù; bù nhiều ngày theo thứ tự; hết hạn bù; hai phía cùng nhận
  giao dịch nhưng không nhận trùng; đổi `transactions_per_repair` giữa kỳ; retry, rollback
  khi ledger lỗi; không cộng điểm ngày bỏ lỡ; đổi policy không viết lại ledger cũ.

## 5. Giá trị cần chốt trước khi bật production

Product Owner đã chốt **đơn vị streak là ngày liên tiếp** và **nguồn lượt bù là giao dịch
tặng/nhận quà thành công**. Các con số sau chưa được cung cấp: điểm cơ bản/ngày, điểm ở
từng mốc, số giao dịch cho một lượt bù, thời hạn được bù và có/không giới hạn lượt bù
tích trữ. Admin phải nhập và publish policy hợp lệ trước khi bật tính năng; không hard-code
một giá trị mặc định có tác dụng phát điểm.
