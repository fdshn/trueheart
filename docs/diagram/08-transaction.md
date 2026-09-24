# 08 · Vòng đời lượt trao

Trạng thái: ✅ đã hiện thực. ⚠️ **Hoàn tất lượt trao hiện KHÔNG cộng điểm nào** — xem
[Chỗ cần soát](#chỗ-cần-soát).

## 8.1 Máy trạng thái

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: Chủ bài chấp nhận yêu cầu
    REQUESTED --> ACCEPTED: POST /transactions/:id/accept
    ACCEPTED --> DELIVERING: POST /transactions/:id/handover<br/>(người tặng bàn giao)
    DELIVERING --> COMPLETED: POST /transactions/:id/confirm<br/>(người NHẬN xác nhận)

    ACCEPTED --> COMPLETED: Tự hoàn tất sau 5 ngày ⚠️
    DELIVERING --> COMPLETED: Tự hoàn tất sau 5 ngày ⚠️

    REQUESTED --> CANCELLED: Bên nào cũng huỷ được
    ACCEPTED --> CANCELLED
    DELIVERING --> CANCELLED
    REQUESTED --> REJECTED: Chủ bài từ chối

    COMPLETED --> [*]
    CANCELLED --> [*]
    REJECTED --> [*]

    note right of COMPLETED
        RÀNG BUỘC DATABASE:
        (status = COMPLETED) = (completed_at IS NOT NULL)
        Thiếu mốc là giao dịch vô hình với rank.
    end note
```

Ràng buộc ở tầng schema, không chỉ ở tầng ứng dụng:

| Ràng buộc | Chặn điều gì |
| --- | --- |
| `CHK_gift_transactions_not_self` | `giver_id <> receiver_id` — tự tặng mình là đường farm điểm rẻ nhất |
| `CHK_gift_transactions_completed_at` | `COMPLETED` bắt buộc có `completed_at` |
| `CHK_gift_transactions_quantity` | `quantity > 0` |

## 8.2 Luồng đầy đủ

```mermaid
sequenceDiagram
    autonumber
    actor G as Người tặng
    actor R as Người nhận
    participant API as Core API
    participant DB as Postgres
    participant N as Thông báo
    participant C as Chat

    G->>API: POST /posts/:postId/requests/:requestId/accept
    API->>DB: Tạo transaction REQUESTED, bài → RESERVED
    API->>C: Mở phòng chat giữa hai bên
    API->>N: Báo người nhận (GIFT_REQUEST_ACCEPTED)

    G->>API: POST /transactions/:id/evidence/upload-url
    G->>API: POST /transactions/:id/handover { ảnh bằng chứng }
    API->>DB: → DELIVERING, ghi handed_over_at

    R->>API: POST /transactions/:id/confirm
    API->>API: Mở transaction
    API->>DB: → COMPLETED, completed_at = now()
    API->>DB: Bài → COMPLETED, trừ tồn kho
    API->>DB: ⛔ CỘNG ĐIỂM — CHƯA CÓ
    API->>API: Commit
    API->>N: Báo hai bên (GIFT_TRANSACTION_COMPLETED)
    API->>API: Mở quyền đánh giá cho cả hai
```

## 8.3 Tự hoàn tất sau 5 ngày — ⚠️ hai vấn đề

```mermaid
flowchart TD
    A[CLI transaction:autocomplete<br/>chạy hằng ngày] --> B["Quét: accepted_at <= now() − 5 ngày"]
    B --> C{⚠️ Đếm từ accepted_at}
    C --> D["Ship liên tỉnh 4–5 ngày<br/>→ cron đóng TRƯỚC KHI hàng tới"]
    B --> E{⚠️ Không kiểm tranh chấp}
    E --> F["Lượt trao đang có báo xấu<br/>vẫn bị đánh là 'thành công'"]

    style C fill:#f8d7da
    style E fill:#f8d7da
    style D fill:#f8d7da
    style F fill:#f8d7da
```

**Hướng xử lý đã ghi nhận (2026-09-24):**

```mermaid
flowchart LR
    A[Đồng hồ] -->|thay vì| B["accepted_at + 5 ngày"]
    A -->|đổi thành| C["lần cuối có chuyện xảy ra<br/>+ 5 ngày"]
    C --> D["tin nhắn cuối / đổi trạng thái cuối"]
    A --> E["+ nút gia hạn cho cả hai bên"]
    A --> F["+ tìm API tính thời gian vận chuyển thật"]
    G[Trước khi đóng] --> H{Đang có tranh chấp?}
    H -->|Có| I[KHÔNG đóng]
    H -->|Không| J[Đóng thành COMPLETED]

    style C fill:#e6ffe6
    style I fill:#e6ffe6
```

## 8.4 Huỷ lượt trao

```mermaid
sequenceDiagram
    actor X as Bên huỷ
    participant API as "POST /transactions/:id/cancel"
    participant DB as Postgres
    participant N as Thông báo

    X->>API: Huỷ, kèm lý do
    API->>DB: status → CANCELLED, ghi closed_by
    Note over DB: closed_by nuôi tiêu chí<br/>FEWEST_CANCELLATIONS khi auto-select
    API->>DB: Trả lại tồn kho, bài RESERVED → PUBLISHED
    API->>DB: Ứng viên STANDBY vẫn còn nguyên
    API->>N: Báo bên kia (GIFT_TRANSACTION_CLOSED)
```

## 8.5 Phí ship và khoản phạt (CH-2)

```mermaid
flowchart TD
    A[Bài đăng] --> B{deliveryMethod}
    B --> C["SELF_PICKUP<br/>tự đến lấy"]
    B --> D["GIVER_SHIPS<br/>người tặng gửi"]
    D --> E{shipPayer}
    E --> F["GIVER — người tặng trả"]
    E --> G["RECEIVER — người nhận trả (COD)"]

    C -.-> H["❌ Không khai được shipPayer<br/>CHK_posts_ship_payer_needs_shipping<br/>chặn ở DATABASE"]

    G --> I{Người nhận không thanh toán?}
    I -->|Có| J["POST /transactions/:id/reports/ship-unpaid<br/>CHỈ người GỬI báo được"]
    J --> K["Point rule SHIP_UNPAID_PENALTY (−50)<br/>Admin chỉnh được"]
    K --> L["Khoá chống trùng theo lượt trao<br/>báo hai lần chỉ trừ một lần"]

    style H fill:#fff3cd
```

> **Vì sao chỉ người gửi báo được.** Chỉ họ mới thấy hàng bị hoàn về. Cho người nhận báo là
> cho chính người bị phạt quyết định có bị phạt hay không.

### Điểm âm — hai cột nói hai chuyện

Phạt 50 một người đang có 20:

| Cột | Giá trị | Ý nghĩa |
| --- | ---: | --- |
| `balance` | `0` | Số **tiêu được**, kẹp ở 0 |
| `raw_balance` | `−30` | Giá trị **thật**, để hiển thị và đối soát |
| `note` | | `−50 điểm, đang âm 30 điểm` — dựng ở máy chủ |

Ràng buộc `CHK_point_ledger_balance_is_clamped_raw` giữ `balance_after = GREATEST(0, raw_balance_after)`.

> **Vì sao không chỉ kẹp về 0 rồi thôi.** Lúc đó không ai biết người đó hụt 30 hay hụt 300,
> và lần cộng điểm sau sẽ trả hết nợ một cách vô hình. Cộng 50 khi đang âm 30 phải ra 20,
> không phải 50 — khoản phạt là một món nợ, không phải một lần xoá sạch.

## Chỗ cần soát

1. ⛔ **Hoàn tất lượt trao KHÔNG cộng điểm nào.** Không có rule `GIFT_COMPLETED` nào được
   seed hay gọi. Đây là lỗ hổng lớn nhất hiện tại: việc chính của nền tảng không sinh điểm,
   nên đường duy nhất lên Bạc là mời 12 người. Chờ X = 56 vào cấu hình.
2. ⚠️ **Đồng hồ 5 ngày đếm từ sai mốc** và **không kiểm tranh chấp** — mục 8.3.
3. Khoản phạt ship giờ **cũng làm tụt hạng** (do rank đọc `balance` theo quyết định
   2026-09-24). Trước đây cố ý không đụng `lifetime` để tránh đúng chuyện này.
4. Chưa có cơ chế **mở lại** một lượt trao đã đóng nhầm.
