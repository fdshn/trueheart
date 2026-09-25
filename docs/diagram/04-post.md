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

    style P fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
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

    subgraph CauHinh["capability_rank_values — Admin sửa lúc chạy"]
        R1["Viewer — 0"]
        R2["Thành viên — 3"]
        R3["Bạc — 10"]
        R4["Vàng — 20"]
        R5["Kim Cương — 50"]
        %% Nối vô hình để năm bậc xếp ĐÚNG THỨ TỰ; bỏ ra thì mermaid tự dàn và
        %% cái thang hiện lên lộn xộn.
        R1 ~~~ R2 ~~~ R3 ~~~ R4 ~~~ R5
    end
    C -.đọc.-> CauHinh

    style D fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style CauHinh fill:#8c8c8c24,stroke:#8a8a8a,stroke-width:1.5px
```

> Con số là **baseline**, Admin chỉnh qua `POST /api/v1/admin/entitlements` không cần deploy.
> Viewer 0 nghĩa là **phải xong onboarding mới đăng được bài** — đó là cổng vào thật sự.

## 4.3 Vòng đời bài đăng

> **Chốt 26/09: bỏ duyệt TRƯỚC, chuyển sang hậu kiểm.** Bài lên thẳng. Admin vẫn gỡ được bất
> cứ lúc nào qua `PATCH /admin/posts/:postId/moderation`, nhưng **không** chạm được vào bài
> đang có giao dịch sống (`RESERVED`/`DELIVERING`) hay đã đóng — gỡ ngang một lượt trao đang
> diễn ra để lại hai người đã hẹn nhau mà bài thì biến mất.

```mermaid
stateDiagram-v2
    [*] --> PUBLISHED: MỌI bài lên thẳng<br/>KHÔNG chờ duyệt (chốt 26/09)

    PUBLISHED --> RESERVED: Đã chọn người nhận
    RESERVED --> DELIVERING: Bắt đầu bàn giao
    DELIVERING --> COMPLETED: Người nhận xác nhận
    RESERVED --> PUBLISHED: Huỷ lượt trao → trả về kho

    PUBLISHED --> REJECTED: Admin HẬU KIỂM gỡ<br/>(quyền post.moderate)
    REJECTED --> PUBLISHED: Admin trả lại<br/>giữ nguyên hạn cũ

    PUBLISHED --> EXPIRED: Quá 3 tháng<br/>(CLI post:expire)
    EXPIRED --> PUBLISHED: Gia hạn 1 lần<br/>POST /posts/:postId/renew
    PUBLISHED --> CANCELLED: Người đăng gỡ
    COMPLETED --> ARCHIVED
    CANCELLED --> ARCHIVED

    note right of PUBLISHED
        Bài hiện trong /nearby NGAY khi đăng,
        và đồng hồ ba tháng bắt đầu từ đó.
        author/type/status vẫn do SERVER quyết,
        không nhận từ client.
    end note

    note right of REJECTED
        Tác giả SỬA bài đã bị gỡ thì bài
        VẪN là REJECTED. Cho nó tự hiện lại
        là để tác giả gỡ quyết định của Admin
        bằng cách sửa một dấu phẩy.
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

    style C fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style E fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style G fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
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
