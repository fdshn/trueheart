# 17 · Job nền & CLI

Trạng thái: ✅ **cả bảy CLI đã chạy được** sau khi sửa hai lỗi làm chúng chết từ trước.

## 17.1 Bảy lệnh

```mermaid
flowchart TD
    C["Lịch bên ngoài (cron/systemd)"] --> A["chat:purge<br/>xoá tin nhắn quá hạn lưu trữ"]
    C --> B["point:reconcile<br/>vá thưởng xác minh SĐT bị thiếu"]
    C --> D["post:expire<br/>đóng bài quá hạn, rao vặt thành bài tặng"]
    C --> E["rank:evaluate<br/>đánh giá chu kỳ duy trì rank"]
    C --> F["transaction:autocomplete<br/>tự hoàn tất lượt trao quá hạn ⚠️"]
    C --> G["feed:reconcile-counts<br/>đối soát số đếm feed"]
    C --> H["accuracy:reconcile<br/>tính lại Giver Accuracy theo ngưỡng"]

    style C fill:#e7f3ff
    style F fill:#fff3cd
```

> Core **cố ý không dựng scheduler nào trong tiến trình**. Hai bản sao service cùng chạy
> scheduler nội bộ sẽ chạy mọi job hai lần, và không có gì ngăn được điều đó từ bên trong.

## 17.2 Khuôn chung

```mermaid
sequenceDiagram
    participant CRON as Lịch ngoài
    participant CLI as tệp *.cli.ts
    participant N as NestFactory
    participant UC as Use case
    participant DB as Postgres

    CRON->>CLI: npm run lệnh, kèm --dry-run nếu cần
    CLI->>CLI: Nạp .env.local rồi .env
    CLI->>N: createApplicationContext(CliInfrastructureModule + module nghiệp vụ)
    Note over N: KHÔNG mở cổng HTTP
    CLI->>UC: handle({ dryRun })
    UC->>DB: Quét, tính, sửa
    UC-->>CLI: Kết quả
    CLI->>N: app.close() trong finally
    CLI-->>CRON: In kết quả, exit 0 (hoặc 1 nếu dry-run có lệch)
```

## 17.3 Hai cái bẫy đã làm cả bảy CLI chết

Cả hai **chỉ lộ ra khi chạy thật**, vì unit test tiêm sẵn hàm giả vào đúng chỗ hỏng.

```mermaid
flowchart TD
    subgraph B1["Bẫy 1 — mất this"]
        A1["truyền NestFactory.createApplicationContext trần"] --> A2["mất this"]
        A2 --> A3["❌ Cannot read properties of undefined"]
        A3 --> A4["✅ Sửa: .bind(NestFactory)"]
    end
    subgraph B2["Bẫy 2 — module thiếu"]
        C1["mỗi tệp *-cli.module.ts tự đoán 4 module"] --> C2["@Global chỉ có hiệu lực<br/>SAU KHI được import ở đâu đó"]
        C2 --> C3["❌ Nest cant resolve dependencies"]
        C3 --> C4["✅ Sửa: CliInfrastructureModule dùng chung"]
    end

    style A3 fill:#ffe6e6
    style C3 fill:#ffe6e6
    style A4 fill:#e6ffe6
    style C4 fill:#e6ffe6
```

`CliInfrastructureModule` bám theo `InfrastructureModule`, **trừ**:

| Bỏ | Vì sao |
| --- | --- |
| `ControllerModule` | `DocsModule` bên trong chờ một HTTP app CLI không bao giờ dựng, nạp vào là treo tiến trình |
| `AuthModule` / `HealthModule` | Guard và endpoint sức khoẻ không có người gọi trong một lần chạy CLI |
| `RealtimeModule` | Thay bằng `NoopRealtimeModule` — dựng websocket server cho tiến trình sống vài giây là giữ cổng đủ lâu để hai lượt cron đụng nhau |

> `NoopChatRealtimePublisher` **ghi log cảnh báo** nếu thật sự bị gọi, không nuốt lặng lẽ:
> nếu có ngày một CLI gửi tin nhắn, người vận hành phải thấy ngay rằng người nhận sẽ không
> nhận được tức thì.

## 17.4 Cờ --dry-run

```mermaid
flowchart LR
    A["npm run lệnh --dry-run"] --> B[Quét và tính]
    B --> C{Có lệch?}
    C -->|Có| D["In TỪNG chỗ lệch<br/>KHÔNG sửa gì<br/>exit code 1"]
    C -->|Không| E["Báo bình thái<br/>exit code 0"]

    style D fill:#fff3cd
```

> **Vì sao in từng chỗ lệch chứ không chỉ tổng số.** Một con số "đã sửa 12 chỗ" không cho ai
> biết đường ghi nào đang hỏng.
>
> **Vì sao dry-run có lệch thì exit 1.** Để cron hay CI coi lệch là chuyện cần biết, không
> phải một lần chạy bình thường.

## Chỗ cần soát

1. ⚠️ **`transaction:autocomplete` đếm từ `accepted_at`** nên đóng lượt trao trước khi hàng
   tới nơi, và **không kiểm tranh chấp** — xem [08-transaction](./08-transaction.md).
2. ⛔ **Chưa có job kiểm Active Member** (`last_login_at` quá 90 ngày).
3. ⛔ **Chưa có job dọn object mồ côi** trong bucket.
4. ⛔ **Chưa có job nhắc nhiệm vụ duy trì trước 1 tháng.**
5. **Chưa có lịch cron thật nào được cấu hình** — bảy lệnh chạy tay được, nhưng không có tài
   liệu nói cái nào chạy lúc mấy giờ.
