# 09 · Chat

Trạng thái: ✅ **đã hiện thực** gồm realtime, ảnh, và dọn tin quá hạn.

## 9.1 Phòng chat sinh từ lượt trao

```mermaid
flowchart LR
    A[Chủ bài chấp nhận yêu cầu] --> B[Tạo gift_transaction]
    B --> C[Mở phòng chat<br/>đúng hai người]
    C --> D{Trạng thái phòng}
    D --> E["OPEN — gửi được"]
    D --> F["READ_ONLY — đọc được, không gửi<br/>(lượt trao đã đóng)"]

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao phòng khoá lại thay vì xoá khi lượt trao đóng.** Lịch sử trao đổi là bằng chứng
> khi có tranh chấp. Xoá đi thì hai bên chỉ còn lời khai.

## 9.2 Gửi tin nhắn

```mermaid
sequenceDiagram
    autonumber
    actor A as Người gửi
    participant API as Core API
    participant DB as Postgres
    participant WS as Socket.io Gateway
    participant N as Thông báo
    actor B as Người nhận

    A->>API: POST /chat/rooms/:roomId/messages
    API->>API: Cổng hồ sơ F07 ⚠️ chưa gắn
    API->>DB: Người này có trong phòng không?
    API->>DB: Phòng còn OPEN không?
    API->>API: Mở transaction
    API->>DB: INSERT chat_messages
    API->>DB: Cập nhật last_message_at
    API->>API: COMMIT
    Note over API,WS: Chỉ phát SAU KHI commit
    API->>WS: publishMessage(roomId, message)
    WS-->>A: Đẩy tới cả người gửi
    WS-->>B: Đẩy tới người nhận
    API->>N: Ghi NEW_CHAT_MESSAGE
```

> **Vì sao phát tin chỉ sau khi commit.** Phát từ trong transaction rồi rollback là nói với
> client về một tin nhắn không tồn tại — và không có cách nào rút lại lời đó.
>
> **Vì sao người gửi cũng nhận.** Họ có thể đang mở phòng trên hai thiết bị; bỏ qua họ sẽ
> làm thiết bị thứ hai thiếu tin.

## 9.3 Ảnh trong chat

```mermaid
sequenceDiagram
    actor A as Người gửi
    participant API as Core API
    participant S3 as MinIO / R2

    A->>API: POST /chat/rooms/:roomId/message-media/upload-url
    API->>API: Kiểm là thành viên phòng
    API->>S3: Presign PUT
    API-->>A: uploadUrl + objectKey
    A->>S3: PUT ảnh
    A->>API: POST /chat/rooms/:roomId/messages { mediaKeys }
    API->>S3: HEAD từng key
    API->>API: Gửi như tin thường
```

## 9.4 Dọn tin quá hạn lưu trữ

```mermaid
flowchart TD
    A[CLI chat:purge<br/>chạy hằng ngày] --> B[Quét phòng quá hạn lưu trữ]
    B --> C[Báo trước<br/>CHAT_ROOM_SCHEDULED_FOR_PURGE]
    C --> D["SET LOCAL chantam.chat_purge = 'on'"]
    D --> E[Xoá tin nhắn]
    E --> F[Giữ lại phòng + metadata]

    G["Trigger append-only chặn mọi<br/>DELETE trên chat_messages"] -.gỡ tạm bởi.-> D

    style D fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style G fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
```

> **Vì sao cần một cái cổng riêng để xoá.** Bảng tin nhắn có trigger chặn sửa/xoá để không ai
> âm thầm đổi lịch sử trao đổi. Job dọn định kỳ là ngoại lệ **duy nhất** được phép, và nó phải
> khai báo rõ ràng bằng một biến phiên thay vì được miễn trừ ngầm.

## Chỗ cần soát

1. Cổng hồ sơ F07 **chưa gắn vào chat** dù đã chốt ngày 2026-09-24.
2. **Thời hạn lưu trữ tin nhắn** hiện là hằng trong code, chưa đưa ra cấu hình Admin.
3. Chưa có **chặn/báo xấu người dùng ngay trong phòng chat** — phải sang `POST /reports`.
4. Chưa có giới hạn tốc độ gửi tin. Một người spam 1.000 tin trong một phút là làm được.
5. Smart Match và chat nhóm chưa có (DEFERRED M3 ghi "Chat và Smart Match" chưa xong, nhưng
   chat 1-1 thì đã chạy).
