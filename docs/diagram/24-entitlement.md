# 24 · Đặc quyền theo Rank (Entitlements)

Trạng thái: ✅ **đã hiện thực**. Đây là cơ chế thay cho việc hard-code `if (rank === 'SILVER')`.

## 24.1 Mô hình

```mermaid
erDiagram
    capability_policies ||--o{ capability_rank_values : "có giá trị theo rank"
    capability_policies {
        string code "POST_QUOTA, POST_SOS, CREATE_GROUP..."
        string value_type "NUMBER hoặc BOOLEAN"
    }
    capability_rank_values {
        string capability_code
        string rank "VIEWER..DIAMOND"
        string value
    }
```

## 24.2 Vì sao không hard-code

```mermaid
flowchart LR
    subgraph X["❌ Cách không dùng"]
        A1["if (rank === 'SILVER') quota = 10"]
        A2["Đổi một con số = sửa code + deploy"]
        A3["Con số nằm rải rác nhiều chỗ"]
    end
    subgraph Y["✅ Cách đang dùng"]
        B1["capability_rank_values"]
        B2["POST /admin/entitlements — đổi lúc chạy"]
        B3["MỘT chỗ duy nhất, có audit"]
    end

    style X fill:#d2464621,stroke:#c0504d,stroke-width:1.5px
    style Y fill:#3ca05021,stroke:#3f8f3f,stroke-width:1.5px
```

## 24.3 Bảng giá trị hiện tại

| Capability | Viewer | Thành viên | Bạc | Vàng | Kim Cương |
| --- | ---: | ---: | ---: | ---: | ---: |
| `POST_QUOTA` — bài đang mở | 0 | 3 | 10 | 20 | 50 |
| `POST_SOS` — đăng SOS | ✗ | ✗ | ✓ | ✓ | ✓ |
| `CREATE_GROUP` ⛔ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `OPEN_REQUEST_QUOTA` — yêu cầu đang mở | 0 | 5 | 10 | 20 | 30 |

> ⚠️ Toàn bộ con số này là **baseline giả định**, chờ Bên A xác nhận.

## 24.4 Luồng kiểm quyền

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant UC as Use case
    participant E as Entitlement
    participant DB as Postgres

    U->>UC: Đăng bài
    UC->>E: getNumber('POST_QUOTA', user.rank)
    E->>DB: Tra capability_rank_values
    E-->>UC: 10
    UC->>DB: Đếm bài đang mở của user
    alt Đã đủ 10
        UC-->>U: 403 QUOTA_EXCEEDED (hiện tại 10 / tối đa 10)
    else Còn chỗ
        UC-->>U: ✅
    end

    Note over UC,E: Bài KHÔNG bật SOS thì KHÔNG hỏi POST_SOS.<br/>Chỉ kiểm khi người dùng thật sự bật nó —<br/>tiết kiệm một truy vấn cho đường đi phổ biến nhất
```

## 24.5 Admin đổi lúc chạy

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as POST /admin/entitlements
    participant DB as capability_rank_values
    participant AU as admin_audit_logs

    A->>API: capability, rank, value, reason
    API->>API: Kiểm quyền entitlement.write
    API->>API: value hợp kiểu đã khai chưa?
    API->>DB: Ghi giá trị mới
    API->>AU: Ghi before/after/reason/actor
    Note over DB: Có hiệu lực NGAY, không cần deploy
```

## 24.6 Người dùng xem quyền của mình

```mermaid
flowchart LR
    A["GET /me/entitlements"] --> B["Trả toàn bộ capability<br/>ứng với rank hiện tại"]
    B --> C["App dùng để ẩn/hiện nút<br/>thay vì đoán theo tên rank"]

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao app không tự suy từ tên rank.** Admin đổi ngưỡng SOS xuống Thành viên thì app cũ
> vẫn ẩn nút vì nó hard-code "Bạc trở lên". Hỏi server là cách duy nhất để hai bên không lệch.

## Chỗ cần soát

1. ⚠️ **Mọi con số là giả định chờ Bên A.**
2. ✅ **`OPEN_REQUEST_QUOTA` đã có** (25/09) — giới hạn số yêu cầu xin nhận đang mở, cần từ khi
   mỗi yêu cầu đầu tiên mở một đồng hồ 7 ngày.
3. **Chưa có capability cho chat và tạo Group** — cổng F07 và quyền tạo Group chưa đi qua cơ
   chế này.
4. **Không có lịch sử phiên bản** như `system_configs` — chỉ có audit log. Khi một bài bị từ
   chối vì quota, không tra được lúc đó quota là bao nhiêu.
5. Chưa có capability cho **giới hạn dung lượng lưu trữ** theo rank, dù F59 có theo dõi
   dung lượng.
