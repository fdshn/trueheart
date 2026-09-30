# 27 · Lược đồ database

Trạng thái: ✅ đang chạy. **Không ghi số bảng ở đây nữa** — con số đó đã lạc hậu ba lần
(25 → 28 → 44 → 52) và mỗi lần lại có người tin nó. Đếm bằng câu này:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```

Một tài liệu đếm bằng tay thì luôn chậm hơn migration mới nhất; một câu SQL thì không.

> ⚠️ `docs/DATABASE.md` còn ghi **28 bảng** — con số đó đã lạc hậu.

## 27.1 Nhóm bảng

```mermaid
flowchart TB
    subgraph U["Người dùng · 4"]
        U1[users]
        U2[user_sessions]
        U3[onboarding_tasks]
        U4[user_onboarding_task_completions]
    end
    subgraph P["Nội dung · 8"]
        P1[posts]
        P2[post_media]
        P3[categories]
        P4[gift_posts]
        P5[content_comments]
        P6[content_comment_media]
        P7[content_reactions]
        P8[content_shares]
    end
    subgraph T["Giao dịch · 4"]
        T1[gift_requests]
        T2[gift_transactions]
        T3[gift_transaction_evidence]
        T4[transaction_reviews]
    end
    subgraph C["Chat · 3"]
        C1[chat_rooms]
        C2[chat_messages]
        C3[chat_message_media]
    end
    subgraph PT["Điểm & hạng · 8"]
        PT1[point_rules]
        PT2[point_ledger]
        PT3[point_cap_decisions]
        PT4[user_point_balances]
        PT5[rank_tiers]
        PT6[rank_transitions]
        PT7[rank_maintenance_cycles]
        PT8[referrals]
    end
    subgraph A["Quản trị · 10"]
        A1[admin_roles]
        A2[admin_permissions]
        A3[admin_role_permissions]
        A4[admin_user_roles]
        A5[admin_audit_logs]
        A6[system_configs]
        A7[config_bundles]
        A8[config_revisions]
        A9[capability_policies]
        A10[capability_rank_values]
    end
    subgraph N["Thông báo & báo xấu · 4"]
        N1[notifications]
        N2[notification_channels]
        N3[notification_templates]
        N4[reports]
    end

    style U fill:#4682c821,stroke:#3d7ab8,stroke-width:1.5px
    style PT fill:#dcb42826,stroke:#c9a227,stroke-width:1.5px
```

## 27.2 Quan hệ lõi

```mermaid
erDiagram
    users ||--o{ posts : "đăng"
    users ||--o{ gift_requests : "xin"
    users ||--o{ point_ledger : "có bút toán"
    users ||--|| user_point_balances : "có số dư"
    users ||--o{ referrals : "giới thiệu"

    categories ||--o{ posts : "phân loại"
    posts ||--o{ post_media : "có ảnh"
    posts ||--o{ gift_requests : "nhận yêu cầu"
    posts ||--o{ content_comments : "có bình luận"
    posts ||--o{ content_reactions : "có cảm xúc"

    gift_requests ||--o| gift_transactions : "sinh ra"
    gift_transactions ||--o| chat_rooms : "mở phòng"
    gift_transactions ||--o{ transaction_reviews : "được đánh giá"
    gift_transactions ||--o{ gift_transaction_evidence : "có bằng chứng"

    chat_rooms ||--o{ chat_messages : "chứa"
    point_rules ||--o{ point_ledger : "sinh theo rule"
    rank_tiers ||--o{ rank_transitions : "mốc"
```

## 27.3 Bảng append-only

```mermaid
flowchart LR
    A["point_ledger"] --> T["Trigger chặn UPDATE + DELETE"]
    B["chat_messages"] --> T
    C["admin_audit_logs"] --> T
    D["transaction_reviews"] --> T

    T --> E["Sửa sai = ghi thêm bản ghi mới"]
    T --> F["Ngoại lệ DUY NHẤT: chat:purge<br/>SET LOCAL chantam.chat_purge = 'on'"]

    style T fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style F fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao chặn ở trigger chứ không ở tầng ứng dụng.** Tầng ứng dụng có thể bị bỏ qua bởi một
> script chạy tay, một migration viết vội, hay một người vào psql. Trigger thì không.

## 27.4 Các ràng buộc giữ bất biến nghiệp vụ

| Ràng buộc | Giữ điều gì |
| --- | --- |
| `CHK_gift_transactions_not_self` | `giver_id <> receiver_id` — chặn tự tặng mình để farm điểm |
| `CHK_gift_transactions_completed_at` | `COMPLETED` bắt buộc có mốc hoàn tất |
| `CHK_point_ledger_balance_is_clamped_raw` | `balance_after = GREATEST(0, raw_balance_after)` |
| `CHK_posts_ship_payer_needs_shipping` | Tự đến lấy thì không khai được bên trả ship |
| `UQ_notifications_idempotency_key` | Một sự kiện chỉ ra một thông báo |
| `UQ_reports_open_reporter_target` | Mỗi người một báo xấu đang mở cho mỗi đích |
| `UQ_point_ledger_idempotency_key` | Chạy lại không cộng điểm lần hai |

> Đây là tầng phòng thủ cuối. Kiểm ở tầng ứng dụng rồi mới ghi thì hai request song song lọt
> qua được cả hai; ràng buộc database không có kẽ đó.

## 27.5 Index cho truy vấn địa lý

```mermaid
flowchart LR
    A["posts.location — geography(Point)"] --> B["Index GiST"]
    B --> C["ST_DWithin(location, point, radius)"]
    C --> D["Nearby · Map · Geo eligibility ⛔"]

    style B fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

## Chỗ cần soát

1. ⚠️ **`docs/DATABASE.md` nói 28 bảng ở một chỗ và 25 ở chỗ khác; thực tế 52.** Đã bỏ con số
   khỏi sơ đồ này và thay bằng câu SQL để đếm — xem đầu trang. `DATABASE.md` cũng nên làm vậy.
2. `gift_posts` và `posts` **cùng tồn tại** vì lớp tương thích. Cần chốt bao giờ gỡ bảng cũ.
3. ✅ **Đã có năm bảng cho Group** (30/09): `groups`, `sub_teams`, `group_memberships`,
   `group_role_permissions`, và `chat_message_flags` cho kiểm duyệt chat. Affiliate chưa có bảng
   riêng nào — nhưng nó cũng chưa cần: điều kiện tính trực tiếp từ `groups.center_location` +
   `radius_km` + `users.last_active_at`, và bảng sự kiện chỉ cần khi có bộ máy chia thưởng.
4. ✅ **Cố ý KHÔNG có `users.last_login_at`** (chốt 30/09). Mốc dùng là `last_active_at`, ghi ở
   **mọi** lần cấp phiên chứ không riêng lúc đăng nhập — xem [17](./17-jobs.md) mục 2. Hai cột
   cho hai khái niệm gần nhau là hai nguồn sự thật, và cái ít được ghi hơn sẽ bị dùng nhầm.
5. **Chưa có chiến lược lưu trữ dài hạn / phân vùng** cho `point_ledger` và `chat_messages`,
   hai bảng chỉ tăng không giảm.
6. **Backup có, nhưng restore test chưa từng chạy** — `DEFERRED.md` liệt nó là release blocker.
