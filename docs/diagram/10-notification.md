# 10 · Thông báo

Trạng thái: ✅ ghi trong app đầy đủ. 🟡 **Đẩy thật (FCM) chưa nối.**

## 10.1 Kiến trúc

```mermaid
flowchart TD
    subgraph Nguồn
        A[Chat: tin nhắn mới]
        B[Giao dịch: chấp nhận / đóng / hoàn tất]
        C[Feed: bình luận / trả lời / cảm xúc]
        E2[Hạng: sắp tụt / đã tụt]
        D[Chat: sắp bị dọn]
    end

    A & B & C & D & E2 --> E["IDispatchNotificationUseCase"]
    E --> F{Có idempotency_key?}
    F -->|Trùng| G[ON CONFLICT DO NOTHING<br/>trả created = false]
    F -->|Mới| H[INSERT notifications]
    H --> I[Render nội dung từ MẪU Admin sửa được]
    I --> J[IPushSender]
    J --> K{canSend?}
    K -->|Có| L[Đẩy tới thiết bị]
    K -->|Không| M["🟡 LoggingPushSender<br/>production fail-closed"]

    style M fill:#fff3cd
```

## 10.2 Mười loại thông báo hiện có

| Mã | Khi nào | Khoá chống trùng |
| --- | --- | --- |
| `NEW_CHAT_MESSAGE` | Có tin nhắn mới | theo messageId |
| `GIFT_REQUEST_ACCEPTED` | Chủ bài chấp nhận yêu cầu | theo requestId |
| `GIFT_TRANSACTION_CLOSED` | Lượt trao bị huỷ | theo transactionId |
| `GIFT_TRANSACTION_COMPLETED` | Lượt trao hoàn tất | theo transactionId |
| `CHAT_ROOM_SCHEDULED_FOR_PURGE` | Phòng sắp bị dọn | theo roomId |
| `CONTENT_COMMENT_CREATED` | Có người bình luận bài mình | `CONTENT_COMMENT:<commentId>` |
| `CONTENT_COMMENT_REPLIED` | Có người trả lời bình luận mình | `CONTENT_COMMENT_REPLY:<commentId>` |
| `CONTENT_REACTION_FIRST_OF_DAY` | Lần đầu trong ngày có cảm xúc | `CONTENT_REACTION_FIRST:<postId>:<ngày VN>` |
| `RANK_DEMOTION_WARNING` | Điểm xuống dưới mốc cảnh báo của bậc | `RANK_DEMOTION_WARNING:<userId>:<rank>:<ngày VN>` |
| `RANK_DEMOTED` | Đã tụt hạng | `RANK_DEMOTED:<userId>:<từ>:<sang>:<ngày VN>` |

> `notifications.idempotency_key` có UNIQUE. Cùng một sự kiện chạy lại bao nhiêu lần cũng chỉ
> ra một thông báo — quan trọng vì job nền và retry mạng đều có thể gọi lại.

## 10.3 Mẫu thông báo Admin sửa lúc chạy (F62)

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as "PUT /admin/notification-templates/:type"
    participant DB as notification_templates
    participant U as Use case gửi thông báo

    A->>API: Sửa tiêu đề + nội dung, có {{biến}}
    API->>API: Kiểm quyền notification.manage
    API->>API: Kiểm mọi biến trong mẫu đều hợp lệ
    alt Có biến lạ
        API-->>A: 400 — nêu tên biến sai
    else Hợp lệ
        API->>DB: Ghi bản mới (copy-on-write, có phiên bản)
    end

    U->>DB: Lấy mẫu theo type
    alt Không có mẫu
        U->>U: Rơi về chuỗi mặc định trong code
    else Có
        U->>U: renderNotificationTemplate(mẫu, biến)
    end
```

> **Vì sao kiểm biến lúc lưu chứ không lúc gửi.** Sai một tên biến mà chỉ phát hiện lúc gửi
> thì người đầu tiên nhận được thông báo hỏng, và Admin không biết cho tới khi có người kêu.

## 10.4 Gửi sau khi ghi xong

```mermaid
flowchart LR
    A[Mở transaction] --> B[Ghi dữ liệu nghiệp vụ]
    B --> C[COMMIT]
    C --> D[Dispatch thông báo]
    D --> E{Đẩy lỗi?}
    E -->|Có| F["pushedDevices = 0<br/>KHÔNG làm hỏng việc chính"]
    E -->|Không| G[Xong]

    style C fill:#e7f3ff
    style F fill:#fff3cd
```

## Chỗ cần soát

1. 🟡 **FCM chưa nối.** `LoggingPushSender` là `IPushSender` duy nhất, và ở production
   `canSend()` trả `false`. Thông báo trong app vẫn ghi đủ, nhưng **không có gì rung máy ai**.
2. **Chưa có queue / retry / dead-letter.** Đẩy lỗi là mất, không thử lại.
3. Chưa có **tuỳ chọn tắt từng loại thông báo** cho người dùng. Hiện là tất-cả-hoặc-không.
4. ✅ **Thông báo sắp tụt hạng và đã tụt hạng đã có** (25/09). Còn thiếu: sắp hết hạn bài,
   nhắc nhiệm vụ duy trì trước 1 tháng (SRS yêu cầu), và nhắc người nhận đánh giá.
