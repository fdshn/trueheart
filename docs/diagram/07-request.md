# 07 · Xin nhận & chọn người nhận

Trạng thái: ✅ **hàng đợi, countdown và auto-select đã chạy** (25/09). Có script kiểm trên
Postgres thật: `npm run test:selection`.

## 7.1 Ba chế độ chọn người nhận

```mermaid
flowchart TD
    P[Bài Muốn Tặng] --> M{selectionMode}
    M --> I["INSTANT ✅<br/>Ai xin trước được luôn"]
    M --> O["OPTIMAL ✅ (mặc định)<br/>Countdown 7 ngày rồi auto-select"]
    M --> E["EXTENDED ✅<br/>Countdown 30 ngày"]

    style I fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style O fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style E fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

## 7.2 Hàng đợi xin nhận

```mermaid
sequenceDiagram
    autonumber
    actor R as Người xin
    participant API as Core API
    participant DB as Postgres
    actor G as Chủ bài

    R->>API: POST /posts/:postId/requests
    API->>API: Cổng hồ sơ F07 ⚠️ chưa gắn
    API->>DB: Bài còn mở? Đã xin rồi chưa?
    alt Đã xin
        API-->>R: 409 — mỗi người một yêu cầu
    else Chưa
        API->>DB: INSERT gift_requests (PENDING, queue_joined_at = now())
        API-->>R: 201
    end

    G->>API: GET /posts/:postId/requests
    API-->>G: Danh sách ứng viên, kèm rank + khoảng cách

    G->>API: POST /posts/:postId/requests/:requestId/accept
    API->>DB: request → ACCEPTED
    API->>DB: Các request khác → STANDBY
    Note over DB: STANDBY chứ không REJECTED —<br/>huỷ lượt trao thì họ vẫn còn trong hàng đợi
    API->>DB: Tạo gift_transaction (REQUESTED)
    API->>DB: Bài → RESERVED
```

> **Vì sao ứng viên trượt thành `STANDBY` chứ không `REJECTED`.** Lượt trao đầu tiên đổ vỡ
> là chuyện thường. `REJECTED` là đóng cửa với họ và buộc chủ bài phải đăng lại từ đầu;
> `STANDBY` giữ nguyên hàng đợi để chọn người kế tiếp ngay.

## 7.3 Countdown 7 ngày (F75) — ✅ đã hiện thực

```mermaid
stateDiagram-v2
    [*] --> Mở: Bài PUBLISHED
    Mở --> ĐangĐếm: Yêu cầu đầu tiên<br/>selection_deadline = now + 7 ngày

    state ĐangĐếm {
        [*] --> ChờThêmỨngViên
        ChờThêmỨngViên --> ChờThêmỨngViên: Người khác xin
    }

    ĐangĐếm --> ChốtNgay: Có người dùng ĐIỂM đổi thẳng ✅
    ĐangĐếm --> TựChọn: Hết 7 ngày ✅
    ĐangĐếm --> ChủBàiChọn: Chủ bài chọn tay ✅ (chốt sớm được)

    ChốtNgay --> ĐãChọn: Dừng đếm, KHÔNG auto-select
    TựChọn --> ĐãChọn: Xếp theo bộ tiêu chí Admin
    ChủBàiChọn --> ĐãChọn
    ĐãChọn --> [*]

    note right of ChốtNgay
        Phải trọn vẹn trong MỘT lần:
        trừ điểm + ghi ledger + dừng đếm
        + chọn người + không auto-select.
        Nửa vời là mất điểm mà không được đồ.
    end note
```

## 7.4 Bộ tiêu chí auto-select (CH-1) — ✅ đã chốt và đã nối

```mermaid
sequenceDiagram
    autonumber
    participant CLI as selection:auto-select (mỗi giờ)
    participant DB as Postgres
    participant M as rankCandidates (hàm thuần)

    CLI->>DB: Bài nào selection_deadline <= now(),<br/>còn PUBLISHED, còn ứng viên?
    CLI->>DB: Đọc thứ tự ưu tiên MỘT lần cho cả vòng
    Note over CLI: Đọc lại mỗi bài thì hai bài cùng lượt chạy<br/>xếp theo hai thứ tự khác nhau nếu Admin<br/>đổi cấu hình giữa chừng
    loop Mỗi bài
        CLI->>DB: listCandidateMetrics — MỘT truy vấn, đủ 5 tiêu chí
        DB-->>M: số đo thô
        M-->>CLI: người thắng
        CLI->>DB: acceptRequest — đi qua CHÍNH đường duyệt của chủ bài
        Note over DB: Nó đã lo khoá hàng, trừ tồn kho, chuyển<br/>ứng viên còn lại sang STANDBY, mở phòng chat,<br/>và xoá selection_deadline
    end
```

> **Một bài hỏng không làm dừng cả vòng** — những bài còn lại cũng đang để người xin chờ một
> đồng hồ đã reo. CLI thoát khác 0 và in từng bài hỏng.
>
> **Người chưa đặt vị trí ra `distanceMeters = null`, không phải 0 mét.** Coi là 0 thì người
> lười đặt vị trí luôn thắng tiêu chí NEAREST.
>
> **Cả hai đường báo cho người được chọn qua MỘT chỗ.** Hai đường tự gửi là hai đường có thể
> quên — và đúng chuyện đó đã xảy ra với đường duyệt tay.


```mermaid
flowchart TD
    A[Hết 7 ngày, còn N ứng viên] --> B["Đọc system_configs<br/>khoá selection.candidate_priority"]
    B --> C{Admin đã xếp thứ tự?}
    C -->|Chưa| D["Mặc định: QUEUE_JOINED_EARLIEST<br/>ai xin trước"]
    C -->|Rồi| E[Xếp theo thứ tự Admin đặt]

    E --> F1["1. QUEUE_JOINED_EARLIEST<br/>gift_requests.queue_joined_at"]
    F1 --> F2["2. HIGHEST_RANK<br/>users.rank"]
    F2 --> F3["3. NEAREST<br/>ST_Distance"]
    F3 --> F4["4. FEWEST_RECEIVED<br/>đếm giao dịch COMPLETED làm người nhận"]
    F4 --> F5["5. FEWEST_CANCELLATIONS<br/>đếm closed_by"]

    style D fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **Vì sao mặc định là "ai xin trước".** Đây là tiêu chí **duy nhất người dùng tự kiểm chứng
> được** — họ biết mình bấm lúc nào. Mọi tiêu chí còn lại dựa vào dữ liệu họ không nhìn thấy,
> nên khi trượt họ không có cách nào biết mình trượt vì lý do thật hay vì hệ thống sai.

Cấu hình đọc/ghi qua `GET|PUT /api/v1/admin/candidate-selection`, dùng **chung** cho cả
[F33 hàng đợi dự phòng](#75-hàng-đợi-dự-phòng) và F75. Hai chỗ xếp hai kiểu thì cùng một bài
sẽ đề xuất hai người khác nhau tuỳ đường nào chạy trước.

## 7.5 Hàng đợi dự phòng

```mermaid
sequenceDiagram
    participant T as Lượt trao đang chạy
    participant API as Core API
    participant Q as Hàng đợi STANDBY
    actor G as Chủ bài

    T->>API: Huỷ (bên nào đó không tiếp tục)
    API->>API: Bài RESERVED → PUBLISHED, trả lại tồn kho
    API->>Q: Còn ai STANDBY không?
    alt Còn
        Q-->>API: Danh sách
        API->>API: Xếp theo BỘ TIÊU CHÍ ADMIN (giống F75)
        API-->>G: Gợi ý người kế tiếp
    else Hết
        API-->>G: Bài mở lại, chờ người xin mới
    end
```

## Chỗ cần soát

1. ✅ **Cả ba chế độ đã chạy.** `OPTIMAL` 7 ngày, `EXTENDED` 30 ngày, `INSTANT` chốt ngay.
   Chủ bài vẫn duyệt tay được bất cứ lúc nào trong lúc đếm.
2. ✅ **Nhánh "dùng điểm chốt ngay" đã có** (26/09) — `POST /posts/:postId/redeem`, xem
   [14-redemption](./14-redemption.md).
3. ✅ Cổng hồ sơ F07 **đã gắn** vào luồng xin nhận (25/09).
4. ✅ **Đã có giới hạn số yêu cầu đang mở** (25/09) — capability `OPEN_REQUEST_QUOTA`, theo bậc:
   Thành viên 5 · Bạc 10 · Vàng 20 · Kim Cương 30. Đếm cả `STANDBY` vì đó vẫn là yêu cầu đang
   mở; bỏ nó ra là mở đúng cái cửa giới hạn này sinh ra để đóng.
5. ✅ **Đã báo cho người thắng** (25/09) — và phát hiện ra **đường duyệt TAY cũng chưa từng
   báo**: mẫu `GIFT_REQUEST_ACCEPTED` có từ migration `1792900000000` nhưng không đường nào gửi.
   Nay cả hai đường đi qua một `AcceptedRequestNotifier`.
