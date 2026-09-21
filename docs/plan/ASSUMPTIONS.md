# Giả định & Quyết định nghiệp vụ đã chốt

Tài liệu này ghi nhận hiện trạng các giả định ban đầu và **đối chiếu với các quyết định nghiệp vụ đã chốt chính thức** từ Bên A trong [`../../SRS_Chan_Tam_v1.15.0.md`](../../SRS_Chan_Tam_v1.15.0.md) (Mục 1.7 - CHỐT-01 đến CHỐT-07).

- **4 câu hỏi lớn trước đây:** ĐÃ ĐƯỢC BÊN A CHỐT CHÍNH THỨC trong SRS v1.15.0 (v1.14.2).
- **6 mặc định mềm:** Admin chỉnh được qua CMS, cấu hình mặc định vẫn áp dụng.

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

  Xem [FEATURES.md F76](../FEATURES.md#f76--điểm-khả-dụng--bảo-vệ-rank).

- **⛔ CHƯA HIỆN THỰC.** Code hiện tại vẫn chạy theo *giả định ban đầu*: `rank-policy.ts`
  đọc `lifetimePoints`, `user_point_balances` vẫn tách `lifetime` khỏi `balance`, và
  `rank_maintenance_cycles` vẫn quyết việc tụt đúng một bậc. Chưa có khái niệm *điểm khả
  dụng*, cũng chưa có đường nào tiêu điểm.

  Khối việc còn lại, giờ đã đủ dữ kiện để làm:

  | Việc | Đụng vào |
  | --- | --- |
  | Rank đọc `balance` thay vì `lifetime` | `rank-policy`, `rank.repository` |
  | Tính *điểm khả dụng* và chặn tiêu dưới ngưỡng | `point-ledger.repository`, use case đổi điểm |
  | Quyết số phận `rank_maintenance_cycles` | Migration + `rank.repository` |

  Cho tới khi làm xong, đây là **mâu thuẫn đã biết giữa tài liệu và code** — ghi ra đây để
  không ai đọc mục trên rồi tưởng hệ thống đang hành xử như vậy.

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

## Câu hỏi mới, chưa có câu trả lời (từ `srs/new-req.txt`)

Yêu cầu đổi vật phẩm bằng điểm giải quyết được cơ chế bảo vệ Rank ([GĐ-3](#gđ-3--cơ-chế-rank--tụt-hạng)),
nhưng mở ra hai chỗ **chưa đủ dữ kiện để code**. Ghi ra đây để không ai tự suy diễn rồi cài cứng:

| # | Câu hỏi | Vì sao không đoán được | Chặn việc gì |
| --- | --- | --- | --- |
| CH-1 | Hết countdown 7 ngày mà không ai đổi điểm, hệ thống chọn người nhận **theo tiêu chí nào**? | Yêu cầu chỉ nói "tự động chọn". Ai đến trước? Ai gần nhất? Ai hạng cao nhất? Mỗi lựa chọn là một chính sách công bằng khác nhau, chọn sai thì người dùng thấy ngay. | [F75](../FEATURES.md#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm) |
| CH-2 | Chọn "người cho gửi hàng" thì **ai trả phí vận chuyển**? | Người cho đang cho không món đồ; bắt họ trả thêm phí ship là một khoản chi phí không ai nói đến. Nhưng bắt người nhận trả thì cần đường thanh toán — thứ Phase 1 chưa có. | [F78](../FEATURES.md#f78--hình-thức-vận-chuyển) |

Đề xuất tạm cho CH-1: **ai xin trước người đó nhận** — `gift_requests` đã có `queue_joined_at`,
không cần thêm dữ liệu, và là tiêu chí duy nhất người dùng tự kiểm chứng được. Nhưng đây là
**đề xuất**, chưa phải quyết định; chưa cài cho tới khi Bên A xác nhận.

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 4 giả định + 6 mặc định |
| 2026-09-20 | Cập nhật toàn diện theo đặc tả chính thức `SRS_Chan_Tam_v1.15.0.md` (Mục 1.7 - CHỐT-01 đến CHỐT-07) |
| 2026-09-21 | Bổ sung `srs/new-req.txt`: cơ chế bảo vệ Rank bằng *điểm khả dụng* (GĐ-3), thêm 2 câu hỏi chưa chốt |
