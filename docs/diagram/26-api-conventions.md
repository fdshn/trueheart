# 26 · Quy ước API & xử lý lỗi

Trạng thái: ✅ **đã hiện thực**, gồm hai cái bẫy đã sửa và có test canh.

## 26.1 Hình dạng một lỗi

```mermaid
flowchart LR
    A[Exception nghiệp vụ] --> B["ErrorCodes<br/>0x#lt;Resource#gt;#lt;Reason#gt;"]
    B --> C["ErrorOrigin<br/>phân biệt package nào ném"]
    C --> D["Response chuẩn:<br/>code · message · origin · details"]
    D --> E["docs/API-ERRORS.md<br/>sinh TỰ ĐỘNG từ catalog"]

    style E fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

66 mã lỗi, chia 9 nhóm:

| Nhóm | Phạm vi |
| --- | --- |
| `0x01` | Bài đăng cho tặng |
| `0x02` | Yêu cầu xin đồ |
| `0x03` | Người dùng |
| `0x04` | Phiên đăng nhập, OTP, đặt lại mật khẩu |
| `0x05` | Danh mục |
| `0x06` | Canonical bài đăng M2 |
| `0x07` | Point / Rank / Referral M4 |
| `0x08` | Giao dịch tặng/nhận M3 |
| `0x09` | Quản trị RBAC |

> **Vì sao tài liệu lỗi sinh tự động.** Viết tay thì nó lạc hậu ngay lần thêm mã thứ hai, và
> không ai phát hiện cho tới khi một client bắt nhầm mã.
>
> **Vì sao trùng số với package khác là bình thường.** `ErrorOrigin` mới là thứ phân biệt.
> Bắt mọi package trong monorepo phải đánh số toàn cục là tạo một sổ đăng ký mà ai cũng phải
> hỏi trước khi thêm một mã.

## 26.2 Trùng mã bị chặn ngay lúc chạy migration

```mermaid
flowchart TD
    A[Thêm mã lỗi mới] --> B{Trùng số với mã đã có?}
    B -->|Có| C["❌ Migration TỪ CHỐI chạy<br/>kèm thông báo nêu rõ hai mã nào đụng"]
    B -->|Không| D[✅ Chạy bình thường]

    E["Đã bắt được thật:<br/>ADMIN_SELF_ROLE_CHANGE và<br/>NOTIFICATION_TEMPLATE_NOT_FOUND<br/>cùng nhận 0x09_02"] -.-> C

    style C fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

## 26.3 Bẫy 1 — body rỗng với `Content-Type: application/json`

```mermaid
sequenceDiagram
    participant C as Client
    participant F as Fastify
    participant H as Handler

    rect rgba(210, 70, 70, 0.13)
    Note over C,H: ❌ Trước khi sửa
    C->>F: POST, header JSON, body RỖNG
    F-->>C: 400 - Fastify từ chối trước khi tới handler
    C->>F: POST, body { } không có khoá bọc
    F->>H: Qua được
    H-->>C: 500 - vỡ ở tầng trong
    end

    rect rgba(60, 160, 80, 0.13)
    Note over C,H: ✅ Sau khi sửa
    C->>F: POST, header JSON, body RỖNG
    F->>H: Coi như object rỗng
    H-->>C: 400 có cấu trúc, nêu rõ thiếu trường nào
    end
```

> Hai lỗi khác nhau: một cái Fastify chặn trước khi code chạy, một cái lọt vào rồi vỡ ở tầng
> trong thành 500. Cả hai đều trả về thứ client không hành động được. Đã sửa, có test canh.

## 26.4 Bẫy 2 — `UPDATE ... RETURNING` bị TypeORM bọc

```mermaid
flowchart TD
    A["manager.query('INSERT ... RETURNING')"] --> B["trả rows[]"]
    C["manager.query('UPDATE ... RETURNING')"] --> D["trả [rows[], affected]<br/>⚠️ KHÁC hình dạng"]
    E["manager.query('DELETE ... RETURNING')"] --> D

    D --> F["rows.length === 0 KHÔNG BAO GIỜ đúng<br/>vì rows là một mảng 2 phần tử"]
    F --> G["→ code tưởng luôn có kết quả"]

    H["✅ updateReturning() bóc đúng hình dạng"] --> I["update-returning-guard.spec.ts<br/>quét TOÀN BỘ repository,<br/>fail nếu mẫu cũ quay lại"]

    style D fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style G fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style I fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

Kiểm trên database thật: `npm run test:returning`.

## 26.5 Thứ tự khai route

```mermaid
flowchart LR
    A["@Get('nearby')"] --> C["PHẢI đứng TRƯỚC"]
    B["@Get('map')"] --> C
    C --> D["@Get(':postId')"]

    E["❌ Ngược lại: Fastify khớp 'nearby' thành một UUID<br/>và trả lỗi validate"] -.-> D

    style E fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

## 26.6 Phân tầng kiểm

```mermaid
flowchart TD
    A[Request] --> B["1. Fastify schema — hình dạng body"]
    B --> C["2. Guard — xác thực + quyền"]
    C --> D["3. Use case — quy tắc nghiệp vụ"]
    D --> E["4. Ràng buộc DATABASE — bất biến"]

    F["Mỗi tầng canh thứ tầng dưới KHÔNG canh được:<br/>schema không biết nghiệp vụ,<br/>nghiệp vụ không chặn được request song song"] -.-> E

    style E fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

## Chỗ cần soát

1. ⛔ **Vẫn chưa có** (kiểm lại 30/09): không có `ThrottlerModule` hay plugin rate-limit nào
   ở tầng ứng dụng. `DEFERRED.md` liệt nó là điều kiện trước public launch.

   Lưu ý cái ĐÃ có để không ai tưởng là đủ: `IRequestThrottle` (Redis) chặn theo **hành vi** —
   chat, báo xấu, đăng ký theo IP — nhưng nó áp từng chỗ gọi, không phải một lớp chặn chung. Một
   endpoint mới quên gọi nó thì không có gì đỡ.
2. **Chưa có request id / trace id** xuyên suốt để nối log với một request cụ thể.
3. Thông báo lỗi hiện **chỉ có tiếng Việt**, chưa có cơ chế đa ngữ.
4. **Chưa có versioning API** ngoài tiền tố `/api/v1` — chưa có kế hoạch cho v2.
