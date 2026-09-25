# 13 · Đánh giá sau giao dịch & Giver Accuracy

Trạng thái: ✅ **đã hiện thực đầy đủ**, gồm cả CLI đối soát.

## 13.1 Hai chiều đánh giá

```mermaid
flowchart TD
    A[Lượt trao COMPLETED] --> B[Mở quyền đánh giá cho CẢ HAI]
    B --> C["Người NHẬN đánh giá người tặng<br/>rating 1-5 + accuracyPercent 0-100 ✅"]
    B --> D["Người TẶNG đánh giá người nhận<br/>rating 1-5, accuracyPercent = null ❌"]

    C --> E[Nuôi chỉ số Giver Accuracy]
    D --> F[Chỉ là đánh giá trải nghiệm]

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao chỉ người nhận chấm accuracy.** Chỉ họ mới thấy vật phẩm thật và so được với mô
> tả. Cho người tặng tự chấm độ chính xác của chính mình là hỏi một câu không ai trả lời sai.

**Vai do DATABASE giữ, không do client gửi lên.** Client gửi `role` thì ai cũng khai mình là
người nhận để chấm accuracy cho đối phương.

## 13.2 Luồng gửi đánh giá

```mermaid
sequenceDiagram
    autonumber
    actor U as Người đánh giá
    participant API as Core API
    participant DB as Postgres

    U->>API: POST /transactions/:id/reviews
    API->>DB: findReviewable(transactionId, userId)
    alt Lượt trao không tồn tại
        API-->>U: 404
    else Người ngoài cuộc
        Note over API: role = null, KHÔNG phải lỗi riêng.<br/>Phân biệt hai cái là để lộ ai trao đổi với ai
        API-->>U: 404
    else Chưa COMPLETED
        API-->>U: 400 - đánh giá chỉ mở sau khi hoàn tất
    else Hợp lệ
        API->>API: Vai GIVER mà gửi accuracyPercent thì 400
        API->>API: Mở transaction
        API->>DB: INSERT transaction_reviews
        API->>DB: Tính lại accuracy của người ĐƯỢC đánh giá TỪ TOÀN BỘ MẪU
        API->>API: Commit
        Note over API: SAU commit, và CHỈ khi vai là NGƯỜI NHẬN:<br/>cộng 56 × accuracyPercent cho người tặng (F40)
        API-->>U: review + accuracy
    end
```

> **Vì sao tính lại từ toàn bộ mẫu chứ không cộng dồn.** Cộng dồn thì một lần ghi hỏng là
> chỉ số lệch vĩnh viễn, và không ai phát hiện ra vì không còn gì để đối chiếu.

## 13.3 Tính chỉ số Giver Accuracy

```mermaid
flowchart TD
    A[Toàn bộ accuracy_percent của người này] --> B{"Số mẫu >= minSamples?"}
    B -->|Chưa đủ| C["percent = null<br/>KHÔNG công bố con số nào"]
    B -->|Đủ| D[Tính trung bình]
    D --> E{"< reviewThresholdPercent?"}
    E -->|Có| F["⚠️ accuracy_review_required = true<br/>vào hàng đợi Admin"]
    E -->|Không| G["Bình thường, GỠ cờ nếu đang có"]

    H["system_configs · accuracy.giver<br/>minSamples 5 · ngưỡng 75%<br/>Admin sửa lúc chạy ✅"] -.-> B
    H -.-> E

    style C fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style F fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style H fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
```

> **Vì sao dưới ngưỡng mẫu thì trả `null` chứ không phải một con số tạm.** Kết luận "người
> này mô tả sai 40%" từ MỘT lần đánh giá là bôi nhọ chứ không phải đo lường.
>
> **Vì sao cấu hình hỏng thì rơi về mặc định.** Gõ nhầm một ô không được biến thành "gắn cờ
> tất cả mọi người" — đó là loại sự cố không ai nối được với một ô nhập liệu.

## 13.4 Cờ chỉ đưa lên bàn Admin, KHÔNG tự phạt

```mermaid
flowchart LR
    A["accuracy dưới 75% sau khi đủ 5 mẫu"] --> B[Gắn cờ REVIEW_REQUIRED]
    B --> C[Hồ sơ vào hàng đợi Admin]
    C --> D{Admin xem}
    D --> E[Không làm gì]
    D --> F[Nhắc nhở]
    D --> G[Đình chỉ]

    H["❌ KHÔNG tự động trừ điểm<br/>❌ KHÔNG hiện cờ công khai"] -.-> B

    style H fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

## 13.5 Đối soát khi Admin đổi ngưỡng

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant C as system_configs
    participant CLI as accuracy:reconcile
    participant DB as Postgres

    A->>C: Hạ ngưỡng 75 xuống 60
    Note over DB: Người đang bị gắn cờ ở 65 VẪN mang cờ.<br/>Cờ chỉ cập nhật khi họ nhận đánh giá mới,<br/>có khi không bao giờ tới

    A->>CLI: npm run accuracy:reconcile --dry-run
    CLI->>C: Đọc ngưỡng hiện hành
    CLI->>DB: Quét mọi hồ sơ có mẫu hoặc đang mang chỉ số
    CLI->>CLI: Tính lại bằng computeGiverAccuracy
    CLI-->>A: In từng chỗ lệch, exit code 1
    A->>CLI: npm run accuracy:reconcile
    CLI->>DB: Sửa tất cả trong MỘT transaction
    CLI-->>A: Đã sửa N hồ sơ
```

## Chỗ cần soát

1. **Chưa có nhắc người nhận đánh giá.** Không nhắc thì phần lớn sẽ không đánh giá, và nhánh
   "áp mức mặc định 80% sau 7 ngày" ([11-point](./11-point.md)) sẽ là đường chạy chính chứ
   không phải ngoại lệ — tức chỉ số Giver Accuracy chỉ có mẫu của người chịu khó chấm.
2. **Chưa có hàng đợi Admin riêng cho hồ sơ bị gắn cờ.** Cờ được gắn nhưng không có màn hình
   nào liệt kê chúng — Admin phải tự biết mà đi tìm.
3. **Đánh giá không sửa được, không xoá được.** Chấm nhầm là chịu. Cần xác nhận đúng ý.
4. Ngưỡng hiện là **75%** theo CHỐT-03, đã là cấu hình động nên đổi không cần deploy.
