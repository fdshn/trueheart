# Giả định & Quyết định nghiệp vụ đã chốt

Tài liệu này ghi nhận hiện trạng các giả định ban đầu và **đối chiếu với các quyết định nghiệp vụ đã chốt chính thức** từ Bên A trong [`../../SRS_Chan_Tam_v1.15.0.md`](../../SRS_Chan_Tam_v1.15.0.md) (Mục 1.7 - CHỐT-01 đến CHỐT-07).

- **4 câu hỏi lớn trước đây:** ĐÃ ĐƯỢC BÊN A CHỐT CHÍNH THỨC trong SRS v1.15.0 (v1.14.2).
- **6 mặc định mềm:** Admin chỉnh được qua CMS, cấu hình mặc định vẫn áp dụng.

## F83 — điểm danh/streak: đã chốt và còn chờ số cụ thể (30/09/2026)

Product Owner đã xác nhận streak theo **ngày liên tiếp**; lượt điểm danh bù chỉ tích
từ giao dịch **tặng/nhận quà hoàn tất**. Mốc ban đầu là 7/14/30/50 ngày, Admin có thể
cấu hình điểm thưởng ở từng mốc và số giao dịch đổi một lượt bù. Thiết kế chọn mỗi
giao dịch hợp lệ tính một lần cho **mỗi bên**; cần xác nhận nếu chỉ muốn tính cho một
bên. Các số chưa chốt: điểm ngày, điểm từng mốc, giao dịch/lượt bù, số ngày được bù,
giới hạn lượt bù tích trữ. Không bật phát điểm khi policy chưa đủ các giá trị này.
Xem [đặc tả F83](./CHECK-IN-STREAK-DESIGN.md).

---

## Đối chiếu 4 giả định với quyết định chính thức của Bên A

### GĐ-1 · Đánh giá & Giver Accuracy
- **Giả định ban đầu:** Tạm dùng 56 điểm cho 100% giá trị, lập bảng thang điểm cố định.
- **Quyết định chính thức (SRS v1.15.0 - CHỐT-03):**
  - Người nhận đánh giá Accuracy theo tỷ lệ phần trăm (0–100%).
  - Chỉ sau khi Giver có tối thiểu **05 giao dịch/đánh giá Accuracy hợp lệ** hệ thống mới tính chỉ số tổng hợp.
  - Ngưỡng cảnh báo là **dưới 75%**; khi dưới ngưỡng sau khi đủ mẫu thì đưa vào `REVIEW_REQUIRED` (Admin review), **không tự động xử phạt**.

---

### GĐ-2 · Active Member & Group Affiliate Geo
- **Giả định ban đầu:** Active Member = có hoạt động trong 90 ngày.
- **Quyết định chính thức (SRS v1.15.0 - CHỐT-06):**
  - **TOÀN BỘ Group Affiliate Event** chỉ được cộng điểm khi event xảy ra **trong bán kính của Group** (Geo Eligibility). Bán kính lấy theo cấu hình Group lúc tạo.
  - Phân bổ thưởng chia đều cho toàn bộ Active Member của Group (depth = 1).
  - Vẫn duy trì điều kiện `status = 'ACTIVE'` và kiểm tra hoạt động để tránh gian lận tài khoản ảo.

---

### GĐ-3 · Cơ chế Rank & Tụt hạng
- **Giả định ban đầu:** "Điểm là sàn, nhiệm vụ là trần"; trượt nhiệm vụ duy trì thì tụt đúng 1 bậc, không rơi theo điểm; cần phân tách `lifetime_after` và `balance_after`.
- **Quyết định chính thức (SRS v1.15.0 - CHỐT-01, BR-PROF-RANK-04, BR-PROF-RANK-06):**
  - **Rank được xác định theo số Điểm Cống hiến hiện tại (current point balance)** của user.
  - Khi số điểm hiện tại giảm xuống dưới ngưỡng của Rank đang có, hệ thống **tự xác định lại Rank theo ngưỡng hiện tại** (ví dụ: Vàng 600, Bạc 400; đang Vàng mà tụt còn 450 thì xuống Bạc).
  - Khi trượt nhiệm vụ chu kỳ 3 tháng hoặc điểm giảm, hệ thống đánh giá lại theo điểm hiện tại, **không bắt buộc chỉ tụt đúng 1 bậc**.
  - **Phase 1 không dùng một `lifetime rank point` riêng** để giữ hạng. Mọi biến động balance sẽ trigger re-evaluation.
- **Bổ sung quan trọng (`srs/new-req.txt`) — cơ chế bảo vệ Rank đã rõ:** Rank không tụt vì
  tiêu điểm, bởi vì **phần điểm cần để giữ Rank bị chặn không cho tiêu**:

  ```
  Điểm khả dụng = Current Point Balance − Minimum Point của Rank hiện tại
  ```

  Người Bạc có 1.500 điểm (ngưỡng 672) chỉ tiêu được 828 — không đổi nổi vật phẩm giá
  1.000 điểm, dù tổng balance lớn hơn. Nhờ vậy **không cần tạo thêm một loại Rank Point
  riêng**: vẫn một loại Điểm Cống Hiến, chỉ chia thành *protected* và *spendable*.

  Xem [FEATURES.md F76 — đã huỷ](../FEATURES.md#f76--điểm-khả-dụng--bảo-vệ-rank-đã-huỷ).

- **⚠️ ĐÃ ĐƯỢC THAY THẾ ngày 2026-09-24.** Cơ chế *điểm khả dụng* (F76) và mọi
  cách hiểu cũ về `lifetime` không còn hiệu lực. Xem
  [Mô hình Rank chốt ngày 2026-09-24](#mô-hình-rank--chốt-ngày-2026-09-24) bên dưới.

---

### GĐ-4 · Ký hiệu "2+2 / 3+3 / 4+4"
- **Giả định ban đầu:** Suy đoán là N giao dịch Cho hoàn tất + N referral.
- **Quyết định chính thức (SRS v1.15.0 - BR-PROF-RANK-03):**
  - **Xác nhận chính xác:** Trong chu kỳ 3 tháng:
    - TV Bạc: 2 lần Cho hoàn tất + 2 Personal Referral hợp lệ.
    - TV Vàng: 3 lần Cho + 3 Referral.
    - TV Kim Cương: 4 lần Cho + 4 Referral.
  - Thành viên Member: Nhiệm vụ 1 lần Cho hoàn tất + 1 Referral là điều kiện nhiệm vụ để nâng hạng lên TV Bạc.

---

## 6 mặc định mềm

Admin chỉnh được qua CMS. Sai chỉ tốn một dòng cấu hình.

| # | Hạng mục | Mặc định | Nguồn SRS v1.15.0 |
| --- | --- | --- | --- |
| MĐ-1 | Quota bài đang mở / Rank | Viewer 0 · Member 3 · Bạc 10 · Vàng 20 · Kim Cương 50 | UC-POST-01, BR-PROF-RANK-01 |
| MĐ-2 | Rank được dùng SOS | Từ **Bạc** trở lên | UI-WANTED-01 |
| MĐ-3 | Bán kính Group | **10 km**, Admin chỉnh trong khoảng 1–50 km | Group Management |
| MĐ-4 | Độ sâu Sub-team | **1 tầng** (Group → Sub-team), Phase 1 không sâu hơn | BR-GRP |
| MĐ-5 | Cap theo ngày | 5 giao dịch tính điểm · 3 referral | Point Rule Admin Config |
| MĐ-6 | Cap report | 10 report/người/ngày; chỉ report đã xác minh mới được điểm | BR-REP |

---

## Các điểm đã chốt bổ sung khác từ SRS v1.15.0

- **CHỐT-02 (Owner xóa tài khoản):** Group do user sở hữu bị giải tán. Invite link hết hiệu lực, Group ngừng nhận member/event mới, affiliate dừng phát sinh; lịch sử được giữ để audit.
- **CHỐT-04 (Password Recovery không có Email/SĐT):** User tự liên hệ Admin support; app chỉ hiển thị hướng dẫn/kênh liên hệ, quy trình xác minh thuộc vận hành của Admin.
- **CHỐT-05 (Rao vặt giá rẻ):** Giá thị trường là tự khai, hệ thống không xác minh giá trị thực và không ép mức giảm tối thiểu. Bài tồn tại tối đa 3 tháng, hết hạn tự động chuyển sang Muốn Tặng.
- **CHỐT-07 (Gia hạn bài Muốn Tặng):** Bài chưa có người nhận được gia hạn tối đa 01 lần, reset thêm 03 tháng và tính quota như bài mới.

---

## Hai quyết định bổ sung từ Bên A (CH-1, CH-2)

Yêu cầu đổi vật phẩm bằng điểm ([GĐ-3](#gđ-3--cơ-chế-rank--tụt-hạng)) mở ra hai chỗ thiếu dữ
kiện. Bên A đã chốt cả hai:

**Cả hai đã được Bên A chốt.**

### CH-1 — Thứ tự ưu tiên chọn người nhận: Admin cấu hình

Không hard-code một tiêu chí nào. Hệ thống cung cấp một bộ tiêu chí; **Admin xếp cái nào số
1, cái nào số 2**, đổi lúc chạy không cần deploy.

| Mã | Ý nghĩa | Lấy từ đâu |
| --- | --- | --- |
| `QUEUE_JOINED_EARLIEST` | Ai gửi yêu cầu sớm nhất | `gift_requests.queue_joined_at` |
| `HIGHEST_RANK` | Thứ hạng cao hơn | `users.rank` |
| `NEAREST` | Gần điểm hẹn hơn | `ST_Distance(users.default_location, posts.location)` |
| `FEWEST_RECEIVED` | Đã nhận ít quà hơn | Đếm `gift_transactions` COMPLETED làm người nhận |
| `FEWEST_CANCELLATIONS` | Ít huỷ lượt trao hơn | Đếm `gift_transactions.closed_by` |

Cấu hình nằm ở `system_configs` khoá `selection.candidate_priority`, đọc/ghi qua
`GET|PUT /api/v1/admin/candidate-selection`. Ghi theo copy-on-write như mọi system config nên
luôn trả lời được ai đổi, lúc nào, vì sao.

**Mặc định khi chưa cấu hình:** ai xin trước. Đây là tiêu chí *duy nhất người dùng tự kiểm
chứng được* — họ biết mình bấm lúc nào; mọi tiêu chí còn lại dựa vào dữ liệu họ không thấy.

Dùng CHUNG cho cả [F33](../FEATURES.md#f33--hàng-đợi-dự-phòng) (gợi ý người kế tiếp khi huỷ)
và [F75](../FEATURES.md#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm) (tự chọn khi hết
countdown). Hai chỗ mà xếp hai kiểu thì cùng một bài sẽ đề xuất hai người khác nhau tuỳ đường
nào chạy trước.

### CH-2 — Phí vận chuyển: đánh dấu bên trả, trừ điểm khi không thanh toán

Có một trường đánh dấu **"người nhận trả ship"** — chỉ để ghi bên nào chịu phí, không xử lý
thanh toán trong hệ thống (đây là ship COD bên ngoài). Người nhận không thanh toán thì **bị
trừ điểm**, thực hiện qua **API report**: người gửi thấy hàng bị hoàn và không được thanh
toán thì báo, và khoản trừ đi qua chính `point_ledger`.

**Đã hiện thực.** Bài mang hai trường `deliveryMethod` (`SELF_PICKUP` | `GIVER_SHIPS`) và
`shipPayer` (`GIVER` | `RECEIVER`). Chỉ khai được bên trả khi có ship — tự đến lấy thì không
có phí nào để mà trả, và ràng buộc `CHK_posts_ship_payer_needs_shipping` chặn ở tầng
database chứ không chỉ kiểm ở tầng ứng dụng.

Báo qua `POST /transactions/:transactionId/reports/ship-unpaid`, **chỉ người gửi báo
được**: chỉ họ mới thấy hàng bị hoàn về, và cho người nhận báo là cho chính người bị
phạt quyết định có bị phạt hay không. Khoá chống trùng theo lượt trao nên báo hai lần
chỉ trừ một lần (lần sau trả `penaltyApplied: false`). Số điểm lấy từ point rule
`SHIP_UNPAID_PENALTY` (khởi tạo −50) nên Admin chỉnh được, không hard-code.

#### Điểm âm: cột điểm và cột log nói hai chuyện khác nhau

Phạt 50 một người đang có 20 không được làm vỡ ràng buộc `balance >= 0`, nhưng cũng
không được âm thầm lặng thành "về 0" — lúc đó không ai biết người đó hụt 30 hay hụt 300.
Nên ghi cả hai:

| Cột | Giá trị | Ý nghĩa |
| --- | --- | --- |
| `balance` / `balanceAfter` | `0` | Số **tiêu được**. Kẹp ở 0, không bao giờ âm |
| `rawBalance` / `rawBalanceAfter` | `-30` | Giá trị **thật**, dùng để hiển thị và đối soát |
| `note` | `-50 điểm, đang âm 30 điểm` | Câu dựng sẵn ở máy chủ cho cột log |

Ràng buộc `CHK_point_ledger_balance_is_clamped_raw` giữ `balance_after = GREATEST(0,
raw_balance_after)`, nên hai cột không trôi khỏi nhau dù chỗ nào đó quên cập nhật một trong
hai. `note` dựng ở máy chủ để web và app không diễn đạt "đang âm" khác nhau; client nào
muốn tự trình bày vẫn có `delta` và `rawBalanceAfter` thô bên cạnh.

Hai hệ quả có chủ ý:

- **`lifetime` không bị khoản phạt trừ.** Lifetime là sàn của Rank; cho phạt kéo nó xuống
  là biến một lần không trả ship thành một lần tụt hạng.
- **Cộng điểm sau đó trả nợ trước.** Đang âm 30 mà được cộng 50 thì giá trị thật về 20 và
  tiêu được 20 — không phải 50. Khoản phạt là một món nợ, không phải một lần xóa sạch.

---

## Quyết định Bên A chốt ngày 2026-09-24

Một đợt chốt gom, giải quyết gần hết các điểm còn treo. Ghi theo đúng thứ tự đã
trao đổi, kèm hệ quả kỹ thuật để không ai phải suy lại.

### Mô hình Rank — chốt ngày 2026-09-24

Năm bậc: **Viewer → Thành viên → Bạc → Vàng → Kim Cương**.

| Quy tắc | Nội dung |
| --- | --- |
| Căn cứ xét hạng | **Point balance hiện tại**. Một cơ chế duy nhất, không có con số thứ hai |
| Tiêu điểm | **Tụt hạng nếu balance rơi dưới ngưỡng.** Không có điểm nào được bảo vệ |
| Mức tụt | Xét lại theo ngưỡng hiện tại, **không ép đúng một bậc** |
| Chu kỳ duy trì | Bạc / Vàng / Kim Cương có chu kỳ **3 tháng** với nhiệm vụ 2+2 / 3+3 / 4+4 |
| Trượt nhiệm vụ | **Bị trừ N điểm** (Admin cấu hình), rồi rank tự xét lại theo balance mới |

**Vì sao trượt nhiệm vụ lại đi đường trừ điểm.** Nếu nhiệm vụ trực tiếp hạ hạng
trong khi hạng do balance quyết, hai cơ chế sẽ đá nhau: hệ thống tụt người ta
xuống Bạc, rồi lần xét kế tiếp thấy balance vẫn ở mức Vàng và đẩy ngược lên.
Cho nhiệm vụ tác động **gián tiếp qua điểm** giữ được đúng một nguồn sự thật, mà
vẫn khiến việc trượt có hậu quả thật.

**F76 (điểm khả dụng / bảo vệ Rank) bị huỷ.** Cơ chế đó chặn không cho tiêu phần
điểm cần để giữ hạng. Quyết định mới đi hướng ngược lại: tiêu tự do, tụt thì
tụt. Hai cái không cùng tồn tại được.

**Hệ quả kèm theo, đã xác nhận:**

- **Điểm phạt cũng làm tụt hạng.** `SHIP_UNPAID_PENALTY` (−50) trước đây cố ý
  không đụng tới `lifetime` để một lần không trả ship không biến thành một lần
  tụt hạng. Nay hạng do balance quyết nên khoản phạt có hiệu lực đầy đủ.
- **`lifetime` mất vai trò quyết định hạng**, chỉ còn là số thống kê "tổng điểm
  từng kiếm được" để hiển thị trên hồ sơ.
- **Cần cảnh báo trước khi tụt.** Balance rơi xuống một tỷ lệ nhất định của
  ngưỡng đang giữ thì báo cho người dùng. Không có nó, người ta đổi một vật phẩm
  rồi sáng hôm sau phát hiện mình đã xuống Bạc mà không ai báo. Tỷ lệ cảnh báo
  là cấu hình động.

> **Còn nợ:** code hiện xét hạng theo `balance.lifetime`
> (`rank.repository.ts:387`). Đây là **mâu thuẫn đã biết giữa tài liệu và code**
> cho tới khi khối việc Rank được làm.

### Điểm cho một lượt trao hoàn tất

```
Có đánh giá    → điểm cấu hình × x%   (x do người nhận chấm, 0–100)
Không đánh giá → sau N ngày áp mức mặc định (Admin cấu hình cả N lẫn mức %)
```

Toàn bộ bốn con số — điểm gốc, `N` ngày, mức mặc định, và ngưỡng accuracy — đều
là cấu hình Admin, không hard-code.

**Mức áp mặc định không tính vào mẫu Giver Accuracy.** Nó là giá trị hệ thống tự
điền, không phải ý kiến của người thật; trộn vào thì chỉ số accuracy chỉ còn
phản ánh có bao nhiêu người lười đánh giá.

**Vì sao cần nhánh "không đánh giá".** Phần lớn người nhận sẽ nhận đồ rồi biến
mất. Cho 0 điểm là phạt người tặng vì việc của người khác; cho thẳng 100% thì
người nhận có động cơ *không* đánh giá để giúp người tặng, và chỉ số accuracy
mất nghĩa. Một mức mặc định áp sau thời hạn tránh được cả hai.

### Cap theo ngày cho phần thưởng trao tặng

**Chốt 2026-09-25:** `GIFT_COMPLETED_GIVER` cap **10 lượt/ngày**. Chạm trần là
**mất thưởng vĩnh viễn** — không có hàng đợi trả bù hôm sau.

Cap không phải trang trí: hai tài khoản trao qua trao lại cả ngày là một cỗ máy
in điểm, và ràng buộc `giver_id <> receiver_id` không chặn được vòng ba người.

Đánh đổi đã biết và đã chấp nhận: người tặng 11 món trong một ngày không được
điểm cho món thứ mười một. Chống gian lận được ưu tiên hơn công bằng ở đuôi phân
phối.

### Định nghĩa "Active Member"

`users.last_login_at` **quá 90 ngày** thì coi như không hoạt động, kiểm bằng job
nền. Dùng cho việc chia thưởng Group Affiliate (F56).

Mốc này **cập nhật mỗi lần refresh token**, không chỉ lúc nhập mật khẩu: app
mobile giữ refresh token nên người mở app hằng ngày vẫn có thể không "đăng nhập"
lần nào suốt 90 ngày, và hiểu `last_login_at` theo nghĩa đen sẽ đánh nhầm người
đang dùng đều thành không hoạt động.

### Cổng hoàn thiện hồ sơ (F07)

Chặn **đăng bài, xin nhận, chat và tạo Group** — không chỉ riêng đăng bài như
tài liệu cũ ghi.

### Rời Group

**Không rời, không chuyển** — giữ nguyên BR-GRP-06. Muốn sang nhóm khác thì tạo
tài khoản mới và vào bằng link mời như thường.

Đây là **chủ ý**, không phải sót: membership chỉ sinh ra từ link mời dành cho
tài khoản mới đăng ký, và chính ràng buộc đó là hàng rào chặn việc một người
nhảy vòng quanh các nhóm để gom affiliate.

### RBAC cho Group và Sub-team

Sub-team **có trưởng nhóm**. Quyền của cả hai vai do Admin hệ thống cấu hình lúc
chạy, không hard-code.

| Vai | Phạm vi | Ai gán |
| --- | --- | --- |
| `GROUP_ADMIN` | Một Group | Owner của Group đó |
| `SUBTEAM_ADMIN` | Một sub-team | Owner của Group |

**Phải tách khỏi `admin_permissions`.** RBAC Admin hiện tại là **toàn cục**:
`admin_user_roles(user_id, role_id)` không có cột nào chỉ phạm vi, và
`hasPermission(userId, 'x')` trả lời "người này có quyền X không" chứ không trả
lời được "có quyền X **trên nhóm nào**". Nhét `group.member.remove` vào đó rồi
gán cho một trưởng nhóm là cho họ quyền trên **mọi nhóm trong hệ thống**.

Nên quyền nhóm đi bảng riêng, và phép kiểm luôn mang theo phạm vi:

```
group_memberships      (group_id, user_id, sub_team_id, role, status, joined_at)
group_role_permissions (role, permission)     ← Admin cấu hình, có audit + phiên bản

hasGroupPermission(userId, groupId, permission)
```

> **Lưu ý với Bên A:** SRS không có khái niệm trưởng nhóm — BR-GRP-05 chỉ chia
> Owner với Member và nói sub-team *"chỉ để tổ chức"*. Thêm vai này là **mở rộng
> SRS**, không phải làm rõ.

### Tự hoàn tất lượt trao

Đồng hồ 5 ngày hiện đếm từ `accepted_at`, nên ship liên tỉnh 4–5 ngày là cron
đóng lượt trao **trước khi hàng tới nơi**. Hướng xử lý: tìm API tính thời gian
vận chuyển thật, hoặc đổi mốc đếm sang **lần cuối có chuyện xảy ra** kèm nút gia
hạn cho hai bên.

Và tự hoàn tất **phải kiểm tranh chấp trước** — đang có báo xấu hoặc yêu cầu mở
lại thì không được đóng thành "thành công".

### X = 56, và các con số còn lại đều vào cấu hình động

**Chốt 2026-09-25.** Toàn bộ hệ điểm đã chốt vốn là bội số của 56 — giới thiệu
56, xác minh SĐT 28 (= 56/2), onboarding 224 (= 56×4), và các ngưỡng rank
224 / 672 / 896 / 1792 lần lượt là 56 × 4 / 12 / 16 / 32. Không một con số nào
lệch. Nên **một lượt trao hoàn tất đánh giá 100% đáng bằng một lượt giới thiệu
hợp lệ: 56 điểm.**

Bốn con số, tất cả **Admin sửa được lúc chạy**, có audit và có phiên bản:

| Con số | Giá trị khởi tạo | Ở đâu |
| --- | --- | --- |
| Điểm cho lượt trao hoàn tất | **56**, cap 5/ngày | `point_rules.GIFT_COMPLETED` |
| Tỷ lệ quy đổi khi đổi vật phẩm (F74) | **2.000 VNĐ/điểm** | `system_configs.point.redemption` |
| Chờ rồi áp mức mặc định khi không đánh giá | **7 ngày, 80%** | `system_configs.review.grace` |
| Phạt trượt nhiệm vụ duy trì | **Bạc 224 · Vàng 336 · KC 448** | `rank_tiers.maintenance_penalty_points` |

**Vì sao 2.000 VNĐ/điểm.** Câu "1 điểm bằng bao nhiêu VNĐ" không ai có trực giác
để trả lời; câu tương đương trả lời được là *"tặng bao nhiêu món thì đổi được
một món giá trị tương đương"*. Với 2.000, một món khai 1.000.000 VNĐ cần 500
điểm — khoảng **9 lượt trao ở mức 100%**.

> Ví dụ `1 điểm = 1.000 VNĐ` từng nằm trong `FEATURES.md` chỉ minh hoạ cú pháp,
> nhưng nó ngụ ý phải tặng **18 món** mới đổi được một món tương đương.

**Vì sao 7 ngày / 80%.** 7 ngày khớp nhịp countdown chọn người nhận đã có trong
sản phẩm, nên người dùng chỉ phải nhớ một khoảng thời gian. 80% nằm giữa hai
cực: thấp hơn 100 nên không thưởng cho việc im lặng, và **cao hơn ngưỡng gắn cờ
75** nên một lượt không được đánh giá không bao giờ tự nó kéo ai vào diện Admin
xem xét.

**Vì sao phạt theo từng bậc chứ không một mức chung.** Nhiệm vụ vốn đã khác nhau
theo bậc (2+2 / 3+3 / 4+4), nên một mức phạt chung sẽ hoặc quá nhẹ với Kim Cương
hoặc quá nặng với Bạc. Giá trị đặt đúng bằng **số điểm đáng lẽ kiếm được nếu làm
đủ nhiệm vụ quý đó** — trượt thì mất đúng phần mình không làm, không hơn.

> **Còn nợ:** các con số đã nằm trong cấu hình, nhưng **chưa có đường nào gọi
> tới chúng**. `GIFT_COMPLETED` chưa được cộng khi lượt trao hoàn tất, chưa có
> job áp mức mặc định sau 7 ngày, chưa có đường trừ điểm khi trượt nhiệm vụ, và
> chưa có gì tiêu điểm. Đó là khối M4 còn lại.

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 4 giả định + 6 mặc định |
| 2026-09-20 | Cập nhật toàn diện theo đặc tả chính thức `SRS_Chan_Tam_v1.15.0.md` (Mục 1.7 - CHỐT-01 đến CHỐT-07) |
| 2026-09-21 | Bổ sung `srs/new-req.txt`: cơ chế bảo vệ Rank bằng *điểm khả dụng* (GĐ-3), thêm 2 câu hỏi chưa chốt |
| 2026-09-22 | Bên A chốt CH-1 (thứ tự ưu tiên do Admin cấu hình) và CH-2 (đánh dấu bên trả ship, trừ điểm qua report) — **cả hai đã hiện thực** |
| 2026-09-22 | CH-2 bổ sung: điểm âm ghi được — cột điểm kẹp ở 0, cột log giữ giá trị thật kèm câu "−50 điểm, đang âm 30 điểm" |
| 2026-09-24 | Bên A chốt gom: mô hình Rank theo balance (**huỷ F76**), trượt nhiệm vụ trừ điểm, điểm trao nhận × x% kèm mức mặc định khi không đánh giá, Active Member = `last_login_at` 90 ngày, cổng hồ sơ mở rộng, không rời Group, RBAC `GROUP_ADMIN`/`SUBTEAM_ADMIN` có phạm vi |
| 2026-09-25 | Chốt **X = 56** cho một lượt trao hoàn tất, và đưa nốt bốn con số vòng đời điểm vào cấu hình động: tỷ lệ quy đổi 2.000 VNĐ/điểm, chờ 7 ngày áp mặc định 80%, phạt trượt nhiệm vụ 224/336/448 theo bậc |
