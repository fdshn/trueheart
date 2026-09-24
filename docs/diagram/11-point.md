# 11 · Điểm Cống Hiến

Trạng thái: ✅ sổ cái đã vững. ⛔ **Chưa có rule nào cộng điểm cho việc trao tặng.**

## 11.1 Sổ cái append-only

```mermaid
flowchart TD
    A[Mọi biến động điểm] --> B[(point_ledger)]
    B --> C["Trigger database chặn<br/>UPDATE và DELETE"]
    C --> D[Sửa sai = ghi thêm bút toán ÂM<br/>không bao giờ UPDATE]

    B --> E[idempotency_key UNIQUE]
    E --> F[Bấm hai lần / retry mạng / job chạy lại<br/>→ chỉ một bút toán]

    style C fill:#fff3cd
    style E fill:#fff3cd
```

Mỗi dòng ghi: `user_id` · `rule_code` · `delta` · `balance_after` · `raw_balance_after` ·
`lifetime_after` · `reference_type/id` · `idempotency_key` · `actor` · `source` · `created_at`.

## 11.2 Cộng điểm theo rule

```mermaid
sequenceDiagram
    autonumber
    participant UC as Use case nghiệp vụ
    participant P as appendByRule
    participant DB as Postgres

    UC->>P: appendByRule(code, userId, idempotencyKey, reference)
    P->>DB: Lấy point_rule theo code
    alt Rule không tồn tại / is_enabled = false
        P-->>UC: ném PointRuleUnavailableException
        Note over UC: Use case NUỐT lỗi này —<br/>rule tắt không được làm hỏng việc chính
    else Rule bật
        P->>DB: Đếm số lần hôm nay
        alt Đã chạm daily_cap
            P-->>UC: ném PointDailyCapReachedException
            Note over UC: Cũng NUỐT — chạm trần là bình thái
        else Còn quota
            P->>DB: INSERT point_ledger (ON CONFLICT DO NOTHING)
            P->>DB: Cập nhật user_point_balances
            P-->>UC: bút toán
        end
    end
```

> **Chỉ nuốt đúng hai loại lỗi đó.** Mọi lỗi khác phải ném tiếp. Bắt `catch (e) {}` trống là
> biến một sự cố database thành "hôm nay không ai được điểm" mà không ai biết.

## 11.3 Các rule đã seed

| Mã | Điểm | Cap ngày | Trạng thái |
| --- | ---: | ---: | --- |
| `PHONE_VERIFIED_FIRST_TIME` | 28 | — | ✅ đã gọi |
| `REFERRAL_QUALIFIED` | 56 | 3 | ✅ đã gọi |
| `ONBOARDING_COMPLETED` | 224 | — | ✅ đã gọi |
| `REPORT_UPHELD` | 5 | 5 | ✅ đã gọi |
| `SHIP_UNPAID_PENALTY` | −50 | — | ✅ đã gọi |
| `POST_REACTED` | 1 | — | ✅ đã gọi |
| `POST_COMMENTED` | 2 | — | ✅ đã gọi |
| **`GIFT_COMPLETED`** | **56** | **5** | ✅ đã seed · ⛔ **chưa ai gọi** |
| `MAINTENANCE_FAILED` | −224/−336/−448 theo bậc | — | ✅ đã seed ở `rank_tiers` · ⛔ chưa gọi |
| `ITEM_REDEMPTION` | âm, theo giá món | — | ⛔ chưa có |

> **`ITEM_REDEMPTION` không vừa khuôn `point_rules`.** Mọi rule khác có một số điểm cố định;
> đổi vật phẩm thì số điểm tính từ giá trị món chia tỷ lệ quy đổi, khác nhau mỗi lần. Nó cần
> một đường ghi ledger nhận số điểm làm tham số, không phải `appendByRule`.

### Toàn bộ hệ điểm là bội số của 56

```mermaid
flowchart LR
    U["56 = đơn vị nguyên tử"] --> A["28 = 56 × 0,5<br/>xác minh SĐT"]
    U --> B["56 × 1<br/>giới thiệu / 1 lượt trao 100%"]
    U --> C["224 = 56 × 4<br/>onboarding · ngưỡng Thành viên"]
    U --> D["672 = 56 × 12<br/>ngưỡng Bạc"]
    U --> E["896 = 56 × 16<br/>ngưỡng Vàng"]
    U --> F["1792 = 56 × 32<br/>ngưỡng Kim Cương"]

    style U fill:#e7f3ff
```

**Chốt 2026-09-25: X = 56** — một lượt trao hoàn tất đánh giá 100% đáng bằng một lượt giới
thiệu hợp lệ. Đã seed vào `point_rules` mã `GIFT_COMPLETED` với cap 5/ngày, Admin sửa lúc chạy.

> Cap ngày không phải trang trí: hai tài khoản trao qua trao lại cả ngày là một cỗ máy in
> điểm, và ràng buộc `giver_id <> receiver_id` không chặn được vòng ba người.

## 11.4 Điểm cho một lượt trao (F40) — ⛔ chưa có code

```mermaid
flowchart TD
    A[Lượt trao COMPLETED] --> B{Người nhận đã đánh giá?}
    B -->|Rồi| C["điểm = 56 × x%<br/>x do người nhận chấm"]
    B -->|Chưa| D[Chờ N ngày]
    D --> E{Vẫn chưa đánh giá?}
    E -->|Đã đánh giá| C
    E -->|Vẫn chưa| F["điểm = 56 × mức mặc định<br/>(Admin cấu hình, ~70–80%)"]
    F --> G["⚠️ KHÔNG tính vào mẫu Giver Accuracy"]

    C --> H[appendByRule GIFT_COMPLETED]
    F --> H

    style G fill:#fff3cd
```

> **Vì sao cần nhánh "không đánh giá".** Phần lớn người nhận sẽ nhận đồ rồi biến mất. Cho 0
> điểm là phạt người tặng vì việc của người khác; cho thẳng 100% thì người nhận có động cơ
> *không* đánh giá để giúp người tặng, và chỉ số accuracy mất nghĩa.
>
> **Vì sao mức mặc định không vào mẫu accuracy.** Nó là số hệ thống tự điền, không phải ý
> kiến người thật. Trộn vào thì accuracy chỉ còn phản ánh có bao nhiêu người lười đánh giá.

## 11.5 Đảo bút toán (F39)

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as "POST /admin/points/ledger/:entryId/reversal"
    participant DB as point_ledger

    A->>API: Đảo bút toán sai, kèm lý do
    API->>API: Kiểm quyền point.adjust
    API->>DB: Bút toán này đã bị đảo chưa?
    alt Đã đảo
        API-->>A: 409 — không đảo hai lần
    else Chưa
        API->>DB: INSERT bút toán ngược (delta = −delta gốc)
        Note over DB: TRỪ CẢ lifetime — khác với khoản phạt
        API->>DB: Ghi admin_audit_logs
    end
```

> **Vì sao đảo phải trừ cả `lifetime` còn phạt thì không.** Đảo là nói "bút toán này chưa
> từng nên tồn tại"; để `lifetime` giữ nguyên là để một lần cộng nhầm vĩnh viễn nâng sàn rank
> của người đó. Phạt thì khác — nó là một sự kiện có thật, chỉ trừ số tiêu được.
>
> ⚠️ **Sau quyết định 2026-09-24**, `lifetime` không còn quyết định hạng nên phân biệt này
> mất ý nghĩa thực tiễn. Cần soát lại khi làm khối M4.

## 11.6 Cap theo ngày

```mermaid
flowchart LR
    A[Mỗi rule có daily_cap] --> B{Đã dùng hết hôm nay?}
    B -->|Rồi| C[Không cộng, KHÔNG báo lỗi ra ngoài]
    B -->|Chưa| D[Cộng bình thường]

    E["Baseline: 5 giao dịch tính điểm<br/>3 referral · 10 report"] -.-> A
```

## Chỗ cần soát

1. ⛔ **Con số đã có, đường gọi thì chưa.** `GIFT_COMPLETED` nằm trong `point_rules` nhưng
   không use case nào gọi nó khi lượt trao `COMPLETED`. Đây là việc chặn nặng nhất còn lại.
2. ⛔ **Chưa có job áp mức mặc định 80% sau 7 ngày** cho lượt trao người nhận không đánh giá.
3. ⛔ **Chưa có đường trừ điểm khi trượt nhiệm vụ duy trì.**
4. ⛔ **`ITEM_REDEMPTION` cần một khuôn khác `appendByRule`** — số điểm thay đổi theo món.
5. Phân biệt `lifetime` / `balance` cần soát lại sau khi rank chuyển sang đọc `balance`.
