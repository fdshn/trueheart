# 04 · Bài đăng

Trạng thái: ✅ **đã hiện thực**. Năm loại bài đi chung **một** endpoint `POST /posts`.

## 4.1 Năm loại bài

```mermaid
flowchart TD
    P["POST /posts<br/>(một đường duy nhất)"] --> T{postType}
    T --> O["OFFER<br/>Muốn tặng"]
    T --> W["WANTED<br/>Muốn nhận / SOS"]
    T --> C["CHARITY<br/>Từ thiện, hoạt động"]
    T --> L["CLASSIFIED<br/>Rao vặt giá rẻ"]
    T --> M["MERIT<br/>Công đức"]

    O --> Q{Quota theo rank?}
    W --> S{SOS cần rank Bạc+?}
    C --> A{Kim Cương đề xuất<br/>→ Admin duyệt}
    L --> E[Tồn tại tối đa 3 tháng<br/>hết hạn → chuyển OFFER]

    style P fill:#e7f3ff
```

> **Vì sao một endpoint chứ không năm.** Năm đường riêng thì năm chỗ kiểm quyền, năm chỗ kiểm
> quota, năm chỗ kiểm media — và chỉ cần sót một chỗ là có một lối vào không được canh.

## 4.2 Quota theo rank

```mermaid
flowchart LR
    A[Đăng bài] --> B["Đếm bài đang mở<br/>của người này"]
    B --> C{"< quota của rank?"}
    C -->|Không| D[❌ 403 QUOTA_EXCEEDED<br/>kèm số hiện tại / số tối đa]
    C -->|Có| E[✅ Cho đăng]

    subgraph Cấu hình["capability_rank_values — Admin sửa lúc chạy"]
        R1["Viewer — 0"]
        R2["Thành viên — 3"]
        R3["Bạc — 10"]
        R4["Vàng — 20"]
        R5["Kim Cương — 50"]
    end
    C -.đọc.-> Cấu hình

    style D fill:#f8d7da
    style Cấu hình fill:#f0f0f0
```

> Con số là **baseline**, Admin chỉnh qua `POST /api/v1/admin/entitlements` không cần deploy.
> Viewer 0 nghĩa là **phải xong onboarding mới đăng được bài** — đó là cổng vào thật sự.

## 4.3 Vòng đời bài đăng

```mermaid
stateDiagram-v2
    [*] --> PENDING_REVIEW: MỌI bài đều tạo ở đây
    PENDING_REVIEW --> PUBLISHED: Admin duyệt (quyền post.moderate)
    PENDING_REVIEW --> REJECTED: Admin từ chối

    PUBLISHED --> RESERVED: Đã chọn người nhận
    RESERVED --> DELIVERING: Bắt đầu bàn giao
    DELIVERING --> COMPLETED: Người nhận xác nhận
    RESERVED --> PUBLISHED: Huỷ lượt trao → trả về kho

    PUBLISHED --> EXPIRED: Quá 3 tháng<br/>(CLI post:expire)
    EXPIRED --> PUBLISHED: Gia hạn 1 lần<br/>POST /posts/:postId/renew
    PUBLISHED --> CANCELLED: Người đăng gỡ
    COMPLETED --> ARCHIVED
    CANCELLED --> ARCHIVED
    REJECTED --> [*]

    note right of PENDING_REVIEW
        UC-POST-01: MỌI bài phải qua kiểm duyệt.
        Bài mới KHÔNG xuất hiện trong /nearby
        cho tới khi Admin chuyển PUBLISHED.
        author/type/status do SERVER quyết,
        không nhận từ client.
    end note

    note right of EXPIRED
        CLASSIFIED hết hạn KHÔNG thành EXPIRED
        mà tự chuyển sang OFFER (Muốn tặng).
        CHỐT-05.
    end note
```

## 4.4 Hết hạn và gia hạn

```mermaid
sequenceDiagram
    autonumber
    participant CRON as Lịch ngoài
    participant CLI as npm run post:expire
    participant DB as Postgres

    CRON->>CLI: Chạy mỗi ngày
    CLI->>DB: Quét bài PUBLISHED quá hạn
    loop Mỗi bài
        alt postType = CLASSIFIED
            CLI->>DB: Chuyển thành OFFER, đặt lại hạn
            Note over DB: CHỐT-05 — rao vặt hết hạn<br/>thành bài tặng, không biến mất
        else Loại khác
            CLI->>DB: status = EXPIRED
        end
    end
    CLI-->>CRON: "Đã đóng N bài, chuyển M tin rao vặt"
```

```mermaid
flowchart TD
    A["POST /posts/:postId/renew"] --> B{Đã gia hạn lần nào chưa?}
    B -->|Rồi| C[❌ Chỉ được 1 lần — CHỐT-07]
    B -->|Chưa| D{Đã có người nhận?}
    D -->|Có| E[❌ Không gia hạn bài đã chốt người]
    D -->|Chưa| F{Còn quota rank?}
    F -->|Hết| G[❌ Tính quota như bài mới]
    F -->|Còn| H[✅ +3 tháng, đánh dấu đã gia hạn]

    style C fill:#f8d7da
    style E fill:#f8d7da
    style G fill:#f8d7da
```

## 4.5 Chuyển bài sang từ thiện

```mermaid
sequenceDiagram
    actor U as Chủ bài
    participant API as Core API
    actor A as Admin

    U->>API: POST /posts/:postId/charity-transfer
    API->>API: Ghi REQUESTED
    A->>API: PATCH /posts/:postId/charity-transfer
    alt Duyệt
        API->>API: APPROVED — bài gắn đơn vị từ thiện
    else Từ chối
        API->>API: REJECTED — bài giữ nguyên
    end
```

## Chỗ cần soát

1. **Quota đếm "bài đang mở"** — bài `EXPIRED` và `COMPLETED` không tính. Đúng ý chưa?
2. **Gia hạn tính quota như bài mới**, nên người đang đầy quota không gia hạn được bài cũ dù
   không tạo thêm bài nào. Có thể gây khó chịu — cần xác nhận.
3. **SOS (`WANTED` gấp)** mở theo capability `POST_SOS`, mặc định Bạc trở lên. Con số này
   vẫn đang là giả định chờ Bên A xác nhận.
4. Bài `MERIT` (Công đức) hiện chỉ có chỗ đăng, **chưa có luồng nghiệp vụ riêng** — F65 nói
   Admin quản lý đơn vị Công đức nhưng chưa có gì.
