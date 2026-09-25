# 15 · Báo xấu & kiểm duyệt

Trạng thái: ✅ **đã hiện thực**, gồm cả việc gộp hai bảng báo xấu trùng nhau.

## 15.1 Ba loại đích

```mermaid
flowchart LR
    A["POST /reports"] --> B{targetType}
    B --> C["POST — bài đăng ✅"]
    B --> D["USER — người dùng ✅"]
    B --> E["COMMENT — bình luận ✅"]

    C & D & E --> F[(reports<br/>MỘT bảng duy nhất)]

    G["❌ content_reports đã DROP<br/>bảng chết, không code nào chạm"] -.-> F

    style F fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style G fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

Lý do báo: `SCAM` · `PROHIBITED_ITEM` · `INAPPROPRIATE_CONTENT` · `HARASSMENT` ·
`MISLEADING` · `OTHER`.

## 15.2 Luồng gửi báo

```mermaid
sequenceDiagram
    autonumber
    actor U as Người báo
    participant API as POST /reports
    participant DB as Postgres

    U->>API: targetType, targetId, reason, description
    API->>DB: targetExists? (bài còn, người còn, bình luận chưa REMOVED)
    alt Không tồn tại
        API-->>U: 404
    else Tồn tại
        API->>DB: UQ_reports_open_reporter_target
        alt Đã có báo ĐANG MỞ của người này cho đích này
            API-->>U: 409 — mỗi người một báo đang mở
        else Chưa
            API->>DB: INSERT reports (PENDING)
            API-->>U: 201
        end
    end
```

> **Vì sao chặn báo trùng ở tầng ràng buộc database.** Kiểm ở tầng ứng dụng rồi mới ghi thì
> hai request song song lọt qua được cả hai. Ràng buộc UNIQUE không có kẽ đó.
>
> Ràng buộc chỉ tính báo **đang mở** — báo đã xử lý xong không chặn người đó báo lại lần sau
> khi có vi phạm mới.

## 15.3 Hàng đợi Admin

```mermaid
stateDiagram-v2
    [*] --> PENDING: Người dùng gửi báo
    PENDING --> IN_REVIEW: Admin nhận xử lý
    IN_REVIEW --> RESOLVED: Xác minh ĐÚNG
    IN_REVIEW --> DISMISSED: Xác minh SAI
    PENDING --> DISMISSED: Bác thẳng

    RESOLVED --> [*]
    DISMISSED --> [*]

    note right of RESOLVED
        CHỈ Ở ĐÂY mới thưởng điểm người báo:
        REPORT_UPHELD +5đ, cap 5 lần/ngày.
        Thưởng ngay lúc gửi là trả tiền cho
        việc bấm nút, không phải cho việc đúng.
    end note
```

## 15.4 Thưởng người báo đúng (F41)

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as PATCH /admin/reports/:id/review
    participant L as Point Ledger

    A->>API: status = RESOLVED, kèm ghi chú
    API->>API: Kiểm quyền report.resolve
    API->>API: Mở transaction
    API->>API: Ghi kết quả xử lý + hành động lên đích
    API->>L: appendByRule('REPORT_UPHELD', +5đ)
    Note over L: idempotency_key theo reportId.<br/>Admin đổi trạng thái qua lại không cộng nhiều lần
    API->>API: Commit
```

> Nếu rule tắt hoặc đã chạm cap ngày, use case **nuốt đúng hai ngoại lệ đó** và vẫn xử lý
> xong báo xấu. Không thưởng được điểm không được làm hỏng việc kiểm duyệt.

## 15.5 Hành động lên nội dung vi phạm

```mermaid
flowchart TD
    A[Admin xác minh đúng] --> B{Đích là gì}
    B --> C["Bài — PATCH /admin/posts/:id/moderation<br/>gỡ xuống REJECTED"]
    B --> D["Bình luận — chuyển REMOVED"]
    B --> E["Người dùng — PATCH /admin/users/:id/status<br/>SUSPENDED hoặc BANNED"]

    C & D & E --> F[Ghi admin_audit_logs]

    style F fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

## Chỗ cần soát

1. ✅ **Đã có 25/09.** Người báo luôn nhận `REPORT_REVIEWED` kèm kết luận — cả khi bị bác, vì
   không báo thì lần sau họ báo lại y như vậy.
2. ✅ Người bị xử lý nhận `CONTENT_MODERATED` kèm lý do, **chỉ khi báo xấu được XÁC MINH**. Báo
   xấu bị bác thì không báo: họ chưa làm gì sai, và nói "có người báo bạn" là mời một cuộc cãi
   vã. Thông báo lỗi không bao giờ làm hỏng kết luận của Admin — kết luận đã ghi rồi.
3. **Cap 10 report/người/ngày** là baseline trong tài liệu nhưng rule `REPORT_UPHELD` đang
   cap ở 5 — hai con số khác nhau, cần soát.
4. Chưa có cơ chế **chống báo xấu ác ý**: một người báo sai 50 lần không bị gì.
5. Bình luận `PENDING_REVIEW` (do bộ lọc từ ngữ) **không nằm trong hàng đợi này** — xem
   [06-interaction](./06-interaction.md).
