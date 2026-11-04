# Lược đồ cơ sở dữ liệu

Bảng tra **schema thật đang chạy** — kết quả cộng dồn của toàn bộ migration trong
`suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations/` (thứ tự ở
`index.ts`), tới migration cuối là `1802300000000-CreateAttribution`. Migration sau có thể
xoá/sửa đối tượng của migration trước — file này mô tả **trạng thái cuối**, không phải lịch sử.
Đối chiếu lần cuối bằng `pg_dump --schema-only` trên database dựng từ đầu (03/11/2026).

Đừng nhầm với [`plan/DATA-MODEL.md`](./plan/DATA-MODEL.md): file đó là **bản thiết kế**, còn
file này mô tả các bảng **đã tồn tại** sau khi `npm run migration:run`. Bảng nào có ở thiết kế
mà không có ở đây thì chưa được dựng.

> **Cố ý không ghi tổng số bảng.** Con số đó đã lạc hậu bốn lần (25 → 28 → 44 → 52) và mỗi lần
> lại có người tin nó — `21-open-issues` từng ghi "thực tế 44" trong khi đã là 52. Một tài liệu
> đếm bằng tay thì luôn chậm hơn migration mới nhất. Đếm bằng câu này:
>
> ```sql
> SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
> ```

> Sửa schema thì luôn qua migration, không bao giờ `synchronize`. Sau khi thêm migration,
> cập nhật lại file này.

---

## 1. Nền tảng

**PostgreSQL 16 + PostGIS 3.4.** Bốn extension được migration tự tạo (`IF NOT EXISTS`,
vì database quản trị thường không cấp quyền `CREATE EXTENSION`):

| Extension | Dùng ở đâu |
| --- | --- |
| `postgis` | Cột `geography(Point,4326)` của `posts`, `gift_posts`, `users` |
| `unaccent` | Tìm kiếm tiếng Việt không dấu |
| `pg_trgm` | Tìm gần đúng theo chuỗi |
| `btree_gist` | Ràng buộc `EXCLUDE` chống chồng lấn hiệu lực cấu hình |

Hàm tự viết đáng biết: `chantam_unaccent(text)` (bọc `unaccent` thành `IMMUTABLE` để dùng
được trong index `IDX_posts_search`) và `gen_post_share_code()` (default của
`posts.share_code`). Các hàm trigger được liệt kê ở bảng tương ứng.

### Quy ước cột chung

Kế thừa từ `kernel/persistency-lib`. Không phải bảng nào cũng đủ cả bốn nhóm — cột `Có`
ở bảng dưới cho biết bảng nào mang nhóm nào.

| Nhóm | Cột | Ý nghĩa |
| --- | --- | --- |
| `PostgresBaseEntity` | `id` — `SERIAL` / `BIGSERIAL`, PK | Khoá chính nội bộ, **không lộ ra API** |
| `PostgresDistributedEntity` | `global_id` — `uuid` UNIQUE | **Danh tính công khai.** ID mà client thấy và gửi lên |
| `PostgresAuditableEntity` | `created_at`, `updated_at` — `timestamptz` | Database tự đặt, client không gửi |
| `PostgresSoftDeletableEntity` | `deleted_at` — `timestamptz` NULL | Xoá mềm |

Ba hệ quả cần nhớ:

1. **Khoá ngoại trỏ tới `global_id`, không trỏ tới `id`.** Mọi cột `*_id` kiểu `uuid`
   trong tài liệu này đều tham chiếu `global_id` của bảng đích. Cột `*_id` kiểu `bigint` (một số
   bảng nội bộ dựng về sau) thì trỏ tới `id` — xem mục 19.
2. **Mọi mốc thời gian là `timestamptz`.** Người dùng ở nhiều múi giờ; lịch âm tính ở client.
   Ngoại lệ có chủ đích: ngày thuần kiểu `date` theo giờ Việt Nam (`policy_date`, `month`, …).
3. **`deleted_at` là `@Column` thường, không phải `@DeleteDateColumn`.** Nên
   `softDelete()` / `restore()` / `withDeleted()` **không dùng được** — phải tự gán
   `deleted_at` và tự lọc. Lý do: bản ghi đã xoá mềm vẫn phải resolve được từ lịch sử
   giao dịch trỏ tới nó.

### Kiểu enum

| Enum | Giá trị |
| --- | --- |
| `users_rank_enum` | `VIEWER` · `MEMBER` · `SILVER` · `GOLD` · `DIAMOND` |
| `users_status_enum` | `ACTIVE` · `SUSPENDED` · `BANNED` |
| `posts_type_enum` | `OFFER` · `WANTED` · `CHARITY` · `CLASSIFIED` · `MERIT` |
| `gift_posts_status_enum` | `DRAFT` · ~~`PENDING_REVIEW`~~ · `REJECTED` · `PUBLISHED` · `RESERVED` · `DELIVERING` · `COMPLETED` · `CANCELLED` · `EXPIRED` · `ARCHIVED` · `SOLD` · `HIDDEN` — `PENDING_REVIEW` giữ trong enum cho dữ liệu cũ, bài mới không vào đó nữa (chốt 26/09); `SOLD`/`HIDDEN` thêm 25/10 cho Rao vặt (`1801600000000`) |
| `gift_posts_category_enum` | `HOUSEHOLD` · `CLOTHING` · `BOOKS` · `ELECTRONICS` · `FURNITURE` · `VEHICLE` · `MEDICAL` · `FOOD` · `NON_MATERIAL` · `OTHER` |
| `gift_posts_condition_enum` | `NEW` · `LIKE_NEW` · `USED` · `NOT_APPLICABLE` |
| `posts_selection_mode_enum` | `INSTANT` · `OPTIMAL` — `EXTENDED` bỏ 11/10 (`1799300000000`) |
| `posts_delivery_method_enum` | `SELF_PICKUP` · `GIVER_SHIPS` |
| `posts_ship_payer_enum` | `GIVER` · `RECEIVER` |
| `posts_charity_transfer_enum` | `REQUESTED` · `APPROVED` · `REJECTED` |
| `gift_requests_status_enum` | `PENDING` · `ACCEPTED` · `REJECTED` · `CANCELLED` · `WITHDRAWN` · `STANDBY` |
| `gift_transaction_evidence_kind_enum` | `HANDOVER` · `RECEIPT` · `RETURNED` |
| `transaction_review_role_enum` | `GIVER` · `RECEIVER` |
| `chat_rooms_room_type_enum` | `TRANSACTION` · `DIRECT_POST` · `DIRECT_USER` |
| `chat_rooms_status_enum` | `OPEN` · `READ_ONLY` |
| `chat_flag_actions_enum` | `DISMISSED` · `MESSAGE_REMOVED` · `USER_WARNED` |
| `content_subject_type_enum` | `POST` · `COMMENT` · `DHARMA_THREAD` |
| `content_reaction_kind_enum` | `LIKE` · `LOVE` · `CARE` · `WOW` · `SAD` |
| `content_comment_status_enum` | `VISIBLE` · `PENDING_REVIEW` · `HIDDEN` · `REMOVED` |
| `reports_target_type_enum` | `POST` · `USER` · `COMMENT` · `CHAT_MESSAGE` · `DHARMA_THREAD` |
| `reports_reason_enum` | `SCAM` · `PROHIBITED_ITEM` · `INAPPROPRIATE_CONTENT` · `HARASSMENT` · `MISLEADING` · `OTHER` |
| `reports_status_enum` | `PENDING` · `IN_REVIEW` · `RESOLVED` · `DISMISSED` |
| `groups_status_enum` / `group_membership_statuses_enum` | `ACTIVE` · `DISSOLVED` |
| `group_member_roles_enum` | `OWNER` · `SUBTEAM_ADMIN` · `MEMBER` |

Các bảng dựng về sau phần lớn dùng `varchar` + `CHECK ... IN (...)` thay cho enum — giá trị
được ghi ở cột tương ứng bên dưới.

`posts.status` **dùng lại** `gift_posts_status_enum` chứ không có enum riêng — tên enum
mang tiền tố lịch sử, đừng đọc nó thành "chỉ áp dụng cho `gift_posts`".

### Bản đồ quan hệ

```
users ──┬──< user_sessions · verified_phones · user_blocks (blocker/blocked)
        ├──< user_onboarding_task_completions >── onboarding_tasks
        ├──< referrals (referrer/referee, bất biến)
        ├──< attribution_links ──< attribution_clicks ──< attribution_resolutions
        │                                └──< attribution_claims ──> referrals
        │        (attribution_audit_events: nhật ký, không FK)
        ├──< user_point_balances (1–1)
        ├──< point_ledger (append-only)  ····· point_rules
        ├──< point_cap_decisions
        ├──< rank_transitions            ····· rank_tiers
        ├──< rank_maintenance_cycles
        ├──< check_in_runs ──< check_in_entries ──< check_in_milestone_awards ──> point_ledger
        ├──< repair_credit_cohorts ──< repair_transaction_progress >── gift_transactions
        ├──< repair_credit_ledger (append-only)     (policy: check_in_policy_revisions)
        ├──< admin_user_roles >── admin_roles ──< admin_role_permissions >── admin_permissions
        ├──< admin_audit_logs (append-only)
        ├──< system_configs (updated_by)
        ├──< notification_channels (updated_by)
        ├──< notifications · notification_mutes
        ├──< reports (reporter / reviewer)
        ├──< leaderboard_entries >── leaderboard_snapshots
        ├──< user_badges · leaderboard_exclusions
        │
        ├──< posts ──┬──< post_media
        │            ├──< gift_requests (+ offering_post_id → posts)
        │            └──< gift_transactions >── users (giver / receiver / closed_by)
        │            │         ├──< gift_transaction_evidence (append-only)
        │            │         ├──< transaction_reviews (sửa đúng một lần)
        │            │         ├──  recipient_selection_audits (1–1)
        │            │         └──  chat_rooms TRANSACTION (1–1)
        │  categories┘ (merged_into_id → categories)
        │
        ├──< chat_rooms (TRANSACTION · DIRECT_POST · DIRECT_USER) ──< chat_messages
        │                       chat_messages ──< chat_message_media
        │                       chat_messages ──  chat_message_flags (1–1)
        ├──< content_comments ──< content_comment_media   ┐ subject: POST · COMMENT ·
        ├──< content_reactions · content_shares           ┘ DHARMA_THREAD (đa hình, không FK)
        │
        ├──< groups (owner) ──┬──< sub_teams
        │                     ├──< group_memberships >── users
        │                     └──< affiliate_events ──< affiliate_rewards ──> point_ledger
        │                               (cả hai trỏ affiliate_policy_revisions)
        ├──< campaigns ──┬──< campaign_need_items · campaign_media · campaign_participations
        │                ├──< campaign_contributions ──< campaign_contribution_items
        │                ├──< campaign_deliveries ──< campaign_delivery_items
        │                ├──< campaign_external_contributions · campaign_coordinators
        │                ├──< campaign_schedule_changes · campaign_reviews
        │                ├──< campaign_parties (gộp bên thụ hưởng) · campaign_bank_accounts
        │                ├──< campaign_team_members · campaign_phases · campaign_stage_events
        │                ├──< campaign_funding_needs · campaign_volunteer_needs ──< campaign_volunteer_registrations
        │                └──< campaign_section_states · campaign_custom_sections ──< campaign_custom_fields
        ├──< merit_units (created_by) ──< merit_declarations
        └──< dharma_contents ──< dharma_recitations ──< dharma_dedications
             dharma_threads (author)

config_bundles ──< config_revisions ──< capability_policies ──< capability_rank_values

Nội dung vận hành, chỉ trỏ users qua created_by/updated_by: blogs · sponsor_banners ·
home_campaign_configs · lunar_holidays · media_assets · notification_templates ·
notification_broadcasts · group_role_permissions

gift_posts   (nguyên mẫu M1, giữ lại cho tương thích ngược)
```

Đường nét đứt `·····` là tham chiếu **theo mã, không có khoá ngoại**
(`point_ledger.rule_code` → `point_rules.code`, `rank_transitions.*_rank` → `rank_tiers.rank`).
`chat_rooms.post_id`, `content_*.subject_id`, `reports.target_id`, `notifications.target_id`
cũng là uuid trần không có FK.

---

## 2. Người dùng và phiên

### `users`

Hồ sơ gộp chung một bảng, không tách bảng profile riêng — monolith một database, tách ra
chỉ thêm một join cho mọi truy vấn.

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `global_id` | `uuid` UNIQUE | Danh tính công khai; **mọi FK trỏ về cột này** |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | Cả ba đều có index |
| `username` | `varchar(50)` NOT NULL | Duy nhất theo `LOWER()` |
| `password_hash` | `varchar(100)` NOT NULL | |
| `email` | `varchar(255)` NULL | Duy nhất theo `LOWER()`, chỉ khi NOT NULL |
| `phone` | `varchar(20)` NULL | Duy nhất một phần, chỉ khi NOT NULL |
| `full_name` | `varchar(100)` NULL | |
| `avatar_url` | `varchar(500)` NULL | |
| `default_location` | `geography(Point,4326)` NULL | Index GiST |
| `rank` | `users_rank_enum` | Mặc định `VIEWER`, có index |
| `status` | `users_status_enum` | Mặc định `ACTIVE`, có index |
| `phone_verified_at` | `timestamptz` NULL | Mốc cộng điểm `PHONE_VERIFIED_FIRST_TIME` |
| `suspended_until` | `timestamptz` NULL | |
| `referral_code` | `varchar(12)` NULL | UNIQUE — mã người này đi mời |
| `rank_attained_at` | `timestamptz` NULL | Mốc bắt đầu chu kỳ duy trì rank |
| `promotion_locked_until` | `timestamptz` NULL | Khoá thăng hạng tạm thời |
| `giver_accuracy_percent` / `giver_accuracy_samples` | `smallint` NULL / `integer` mặc định `0` | Giver Accuracy tổng hợp; `CHECK 0–100`, samples `>= 0` |
| `accuracy_review_required` | `boolean` mặc định `false` | Cờ đưa vào diện cần xem xét (CHỐT-03) |
| `giver_rating_average` / `receiver_rating_average` | `numeric(2,1)` NULL | `CHECK 1–5`; kèm `*_rating_samples integer` mặc định `0` (`1795400000000`) |
| `last_active_at` | `timestamptz` NOT NULL mặc định `now()` | Có index. Ghi ở mọi lần cấp phiên — dùng cho active member/affiliate (`1793200000000`) |
| `email_verified_at` | `timestamptz` NULL | (`1793900000000`) |
| `leaderboard_anonymous` | `boolean` mặc định `false` | Ẩn tên trên bảng xếp hạng tháng |
| `slogan` | `varchar(120)` NULL | Hồ sơ công khai (`1801400000000`) |
| `today_thought` / `today_thought_updated_at` | `varchar(280)` / `timestamptz` NULL | `CHK_users_today_thought_stamp`: cả hai cùng NULL hoặc cùng có |
| `intro_video_url` / `intro_video_thumbnail_url` | `varchar(500)` NULL | `CHK_users_intro_video_thumbnail`: có thumbnail thì phải có video |
| `email_visibility` / `phone_visibility` | `varchar(10)` NOT NULL mặc định `'PRIVATE'` | `CHK_users_email_visibility` / `CHK_users_phone_visibility`: `IN ('PRIVATE','PUBLIC')` |
| `show_online_status` | `boolean` NOT NULL mặc định `false` | Cho người khác thấy đang online (`1802000000000`) |
| `allow_stranger_messages` | `boolean` NOT NULL mặc định `true` | "Cho phép người lạ nhắn tin" — chặn mở phòng `DIRECT_USER` từ người lạ (`1802200000000`) |

**Chỉ mục danh tính dùng `LOWER()`**, không phải cột thô:
`UQ_users_username_lower`, `UQ_users_email_lower`. Repository so sánh bằng `LOWER()`, nên
ràng buộc DB phải cùng luật — nếu không, `An` và `an` cùng đăng ký được rồi login thành
nhập nhằng. Hai index thô ban đầu đã bị migration `NormalizeUserIdentityIndexes` gỡ bỏ.

### `user_sessions`

Một dòng cho mỗi thiết bị đăng nhập. **Không có `global_id` và không có `deleted_at`.**

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `created_at` / `updated_at` | `timestamptz` | |
| `user_id` | `uuid` NOT NULL | Có index. **Không có ràng buộc FK** |
| `refresh_token_hash` | `varchar(100)` NOT NULL | UNIQUE |
| `device_id` | `varchar(100)` NOT NULL | Index ghép `(user_id, device_id)` |
| `fcm_token` | `varchar(255)` NULL | Token đẩy thông báo |
| `expires_at` | `timestamptz` NOT NULL | Có index, để job dọn phiên hết hạn |
| `revoked_at` | `timestamptz` NULL | |

`fcm_token` nằm ở đây chứ không ở `users`: một người có nhiều thiết bị, và đăng xuất phải
thu hồi token **của đúng thiết bị đó**.

### `verified_phones` (`1794200000000`)

Số điện thoại đã xác minh, lưu **hash** (`phone_hash char(64)`) chứ không lưu số thô.
Cột: `id` SERIAL PK, `phone_hash`, `user_id` (FK → `users` CASCADE, có index), `verified_at`,
`released_at` / `released_by` (FK SET NULL) / `release_reason`. `UQ_verified_phones_active`
unique một phần trên `phone_hash WHERE released_at IS NULL` — một số chỉ gắn với **một tài
khoản đang giữ** tại một thời điểm; nhả ra (release) thì số đó dùng lại được.

### `user_blocks` (`1802100000000`)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `blocker_id` | `uuid` NOT NULL | FK → `users(global_id)` CASCADE |
| `blocked_id` | `uuid` NOT NULL | FK → `users(global_id)` CASCADE |
| `created_at` | `timestamptz` | |

PK ghép `(blocker_id, blocked_id)` — chặn lại lần nữa là idempotent. `CHK_user_blocks_not_self`
cấm tự chặn. Một dòng lưu một chiều (A chặn B), nhưng mọi phép kiểm hiệu lực xét **hai chiều**
— index `IDX_user_blocks_blocked (blocked_id, blocker_id)` để hỏi "ai đã chặn tôi" nhanh như
"tôi đã chặn ai".

---

## 3. Danh mục và bài đăng

### `categories`

Danh mục phân cấp, thay cho enum cứng `gift_posts_category_enum`.

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `global_id` | `uuid` UNIQUE | Đích của `posts.category_id` |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |
| `slug` | `varchar(100)` UNIQUE | `do-dung-gia-dinh`, `quan-ao`… |
| `name` | `varchar(100)` | Tên hiển thị tiếng Việt |
| `icon` | `varchar(100)` NULL | Tên icon (`home`, `shirt`, `book`…) |
| `sort_order` | `int` mặc định `0` | |
| `is_active` | `boolean` mặc định `true` | Có index |
| `parent_id` | `uuid` NULL | Danh mục cha. Có index, **không có FK** |
| `post_types` | `text[]` NOT NULL, mặc định cả 5 loại | Loại bài được dùng danh mục này (`1790600000000`). `CHK_categories_post_types_known` (⊆ 5 loại) và `CHK_categories_post_types_not_empty` |
| `merged_into_id` | `uuid` NULL | FK → `categories(global_id)` SET NULL (`1796600000000`). `CHK_categories_merge_not_self`; `CHK_categories_merged_is_inactive`: đã gộp thì `is_active = false` |
| `merge_reason` | `varchar(500)` NULL | |

**Seed sẵn 10 danh mục gốc** với UUID cố định `30000000-0000-4000-8000-0000000000NN`
(`01`–`09` từ `SeedBaseCategories`, `10` = "Phi vật chất" thêm ở migration canonical posts).
UUID cố định để migration backfill map được từ enum cũ sang danh mục mới. Đây là **dữ liệu
reference ổn định, không phải seed demo** — seed demo nằm ở [`seed/DEMO-DATA.md`](./seed/DEMO-DATA.md).

### `posts`

Bảng bài đăng chuẩn. **Cả 5 loại bài dùng chung một bảng**, phân biệt bằng `post_type`;
phần dữ liệu riêng của từng loại nằm trong `details` (jsonb).

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `global_id` | `uuid` UNIQUE | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |
| `post_type` | `posts_type_enum` NOT NULL | `OFFER` · `WANTED` · `CHARITY` · `CLASSIFIED` · `MERIT` |
| `author_id` | `uuid` NOT NULL | **Không có FK tới `users`** |
| `category_id` | `uuid` NOT NULL | **FK → `categories(global_id)`** |
| `title` | `varchar(200)` | |
| `description` | `text` | |
| `location` | `geography(Point,4326)` NOT NULL | Index GiST — truy vấn bán kính |
| `area_label` | `varchar(200)` | Nhãn khu vực hiển thị, làm mờ vị trí chính xác |
| `status` | `gift_posts_status_enum` NOT NULL | Không có mặc định — use case phải đặt tường minh. Từ 25/10 có thêm `SOLD`, `HIDDEN` cho Rao vặt (chủ bài tự đổi; `HIDDEN` vẫn giữ suất quota, `SOLD` là điểm cuối) |
| `total_quantity` | `integer` mặc định `1` | `CHECK > 0` |
| `remaining_quantity` | `integer` mặc định `1` | `CHECK >= 0 AND <= total_quantity` |
| `details` | `jsonb` mặc định `'{}'` | Trường riêng theo loại bài |
| `expires_at` | `timestamptz` NULL | |
| `renewed_count` | `integer` mặc định `0` | Số lần gia hạn |
| `selection_mode` | `posts_selection_mode_enum` NOT NULL | Mặc định `OPTIMAL`. Chỉ có nghĩa với `OFFER` |
| `selection_deadline` | `timestamptz` NULL | **Lúc đăng + 7 ngày**, đặt ngay khi bài công khai (CHỐT-10). Trước 11/10 chỉ set khi có request đầu tiên, nên bài không ai xin thì `NULL` vĩnh viễn. `NULL` nay nghĩa chưa công khai, hoặc đã ghép được người nên đồng hồ đã dừng. Áp cho cả `OFFER` và `WANTED` (bài `WANTED` có đồng hồ từ `1799600000000`) |
| `is_sos` | `boolean` NOT NULL mặc định `false` | Bài khẩn cấp (`1790800000000`). Index một phần `IDX_posts_sos WHERE is_sos` |
| `charity_transfer_status` | `posts_charity_transfer_enum` NULL | Đề nghị chuyển bài về kho từ thiện: `REQUESTED` · `APPROVED` · `REJECTED` |
| `charity_transfer_requested_at` / `charity_transfer_note` | `timestamptz` / `varchar(500)` NULL | `CHK_posts_charity_transfer_pairing`: status và requested_at cùng NULL hoặc cùng có. `UQ_posts_charity_transfer_open` — mỗi bài tối đa một đề nghị đang `REQUESTED` |
| `delivery_method` | `posts_delivery_method_enum` NULL | `SELF_PICKUP` · `GIVER_SHIPS` (`1791100000000`) |
| `ship_payer` | `posts_ship_payer_enum` NULL | `GIVER` · `RECEIVER`. `CHK_posts_ship_payer_needs_shipping`: chỉ khai khi `GIVER_SHIPS` |
| `reaction_count` / `comment_count` / `share_count` | `integer` mặc định `0` | Bộ đếm denormalized từ `content_reactions` / `content_comments` / `content_shares`. `CHK_posts_interaction_counters`: cả ba `>= 0`. (`like_count` cũ đã bị xoá ở `1794600000000`) |
| `share_code` | `varchar(16)` NOT NULL UNIQUE | Mã chia sẻ 10 ký tự, không tuần tự (25/10). **Postgres sinh** bằng `DEFAULT gen_post_share_code()`, nên mọi lối INSERT có mã mà không phải nêu cột; kiểu tạo bài ở ứng dụng `Omit` trường này |

Tám index, mỗi cái phục vụ một truy vấn cụ thể:

| Index | Truy vấn |
| --- | --- |
| `IDX_posts_location` (GiST) | Tìm quanh đây |
| `IDX_posts_author_status` | "Bài của tôi", lọc theo trạng thái |
| `IDX_posts_type_status_category` | Feed lọc theo loại + danh mục |
| `IDX_posts_expiry` `(status, expires_at)` | Job quét bài hết hạn |
| `IDX_posts_sos` (một phần, `WHERE is_sos`) | Lọc bài SOS |
| `IDX_posts_search` (GIN) | Tìm kiếm toàn văn không dấu: `to_tsvector('simple', chantam_unaccent(title ' ' description))` (`1794400000000`) |
| `UQ_posts_share_code` (unique) | Mở bài theo mã chia sẻ |
| `UQ_posts_charity_transfer_open` (unique một phần) | Một đề nghị chuyển từ thiện đang mở mỗi bài |

Ràng buộc số lượng đặt ở **schema** chứ không chỉ ở use case — `remaining_quantity` là chỗ
race condition đắt nhất trong nghiệp vụ nhận đồ.

Với bài `OFFER` migrate từ `gift_posts`, `details` mang
`{ "condition": "...", "estimatedValue": ... }` — chính là hai cột bị bỏ khi chuyển sang mô
hình chung.

### `post_media`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | Không có `global_id` |
| `post_id` | `uuid` NOT NULL | FK → `posts(global_id)` **ON DELETE CASCADE** |
| `r2_key` | `varchar(500)` | Khoá object trên Cloudflare R2 |
| `sort_order` | `integer` mặc định `0` | |
| `created_at` | `timestamptz` | |

Hai ràng buộc duy nhất: `(post_id, sort_order)` giữ thứ tự ảnh không đụng nhau, và
`(post_id, r2_key)` làm việc gắn ảnh **idempotent** — gọi lại API upload không sinh bản ghi trùng.

### ~~`post_likes`~~ — đã xoá

Bảng lượt thích riêng từ `1791600000000` đã được gộp vào `content_reactions` (kind `LIKE`) rồi
`DROP TABLE` ở `1792200000000-MergePostLikesIntoReactions`; cột `posts.like_count` bị xoá ở
`1794600000000-DropPostLikeCount`. Cảm xúc trên bài nay đọc từ `content_reactions` và
`posts.reaction_count` — xem [mục 11](#11-tương-tác-nội-dung-feed).

### `gift_posts` — bảng nguyên mẫu, không dùng cho code mới

Bảng M1 gốc, **cố ý giữ lại** trong cửa sổ tương thích ngược để client cũ và rollback còn
chạy được. Dữ liệu đã được backfill sang `posts` (`post_type = 'OFFER'`, enum danh mục map
sang `categories.global_id`, `condition`/`estimated_value` gói vào `details`).

Cột riêng so với `posts`: `category` (`gift_posts_category_enum`),
`condition` (`gift_posts_condition_enum`), `estimated_value` (`bigint`), `giver_id` (`uuid`,
không FK). Thiếu `post_type`, `category_id`, `details`, `expires_at`, `renewed_count`.

**Code mới luôn ghi vào `posts`.**

---

## 4. Onboarding

### `onboarding_tasks`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `global_id` | `uuid` UNIQUE | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |
| `key` | `varchar(100)` UNIQUE | Mã nghiệp vụ ổn định |
| `title` / `description` | `varchar(200)` / `text` | Hiển thị tiếng Việt |
| `evidence_type` | `varchar(100)` | Loại bằng chứng hoàn thành |
| `required` | `boolean` mặc định `true` | |
| `active` | `boolean` mặc định `true` | Index ghép `(active, sort_order)` |
| `sort_order` | `integer` mặc định `0` | |

Seed sẵn hai nhiệm vụ: `PROFILE_COMPLETE` và `PHONE_VERIFIED`
(UUID `40000000-0000-4000-8000-00000000000{1,2}`).

### `user_onboarding_task_completions`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `user_id` | `uuid` | FK → `users(global_id)` CASCADE |
| `task_id` | `uuid` | FK → `onboarding_tasks(global_id)` CASCADE |
| `completed_at` | `timestamptz` mặc định `now()` | |
| `evidence_ref` | `varchar(500)` NULL | |

UNIQUE `(user_id, task_id)` — mỗi nhiệm vụ chỉ hoàn thành một lần cho mỗi người.

---

## 5. Điểm và rank

Cụm này là phần nhạy cảm nhất về tính đúng đắn: điểm quy ra quyền lợi, nên **schema tự
cưỡng chế bất biến chứ không phó thác cho tầng nghiệp vụ**.

### `point_rules`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `code` | `varchar(100)` | UNIQUE cùng `version` |
| `points` | `integer` | `CHK_point_rules_points CHECK (points <> 0)` — luật phạt mang số âm (`1791100000000` nới từ `>= 0`) |
| `is_enabled` | `boolean` mặc định `true` | |
| `affects_lifetime` | `boolean` mặc định `true` | Có tính vào điểm tích luỹ xét rank không |
| `daily_cap` | `integer` NULL | `CHECK NULL OR >= 0`. NULL = không giới hạn |
| `version` | `integer` mặc định `1` | Đổi luật thì **thêm version mới**, không sửa dòng cũ |
| `updated_by` | `uuid` NULL | |
| `updated_at` | `timestamptz` | |

Seed ban đầu: `PHONE_VERIFIED_FIRST_TIME` = 28 điểm (không cap), `REFERRAL_QUALIFIED` = 56 điểm
(cap 3/ngày). Các migration sau thêm `GIFT_COMPLETED_GIVER` (56, cap 10), `GIFT_COMPLETED_RECEIVER`
(28, cap 5), `ONBOARDING_COMPLETED` (224), `POST_REACTED`, `POST_COMMENTED`, `REPORT_UPHELD`, hai
luật phạt `SHIP_UNPAID_PENALTY` / `CONTENT_VIOLATION_PENALTY` (−50) và
`CHARITY_CONTRIBUTION_COMPLETED` (10, **tắt**). Danh sách đúng: `SELECT code, version, points,
daily_cap, is_enabled FROM point_rules`.

### `point_ledger` — sổ cái, **chỉ ghi thêm**

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `user_id` | `uuid` | FK → `users(global_id)` **RESTRICT** |
| `rule_code` / `rule_version` | `varchar(100)` / `integer` | Chụp lại luật tại thời điểm ghi |
| `delta` | `integer` | Có thể âm |
| `balance_after` / `lifetime_after` | `integer` | `CHECK >= 0` — snapshot sau bút toán |
| `raw_balance_after` | `integer` NOT NULL | Số dư "thô" có thể âm sau luật phạt. `CHK_point_ledger_balance_is_clamped_raw`: `balance_after = GREATEST(0, raw_balance_after)` |
| `reference_type` / `reference_id` | `varchar(100)` / `varchar(200)` | Nguồn phát sinh |
| `idempotency_key` | `varchar(200)` **UNIQUE** | Chống cộng điểm hai lần |
| `actor` / `source` | `varchar(100)` | Ai/cái gì gây ra |
| `reason` | `varchar(500)` NULL | |
| `created_at` | `timestamptz` | Index `(user_id, created_at DESC)` |

**Trigger `prevent_point_ledger_mutation`** chặn mọi `UPDATE` và `DELETE` ở tầng database.
Sai sót thì ghi bút toán đảo, không sửa lịch sử. FK dùng `RESTRICT` chứ không `CASCADE`:
xoá người dùng không được phép làm bốc hơi sổ cái.

### `user_point_balances` — số dư đọc nhanh

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `user_id` | `uuid` **PK** | FK → `users(global_id)` CASCADE. Quan hệ 1–1 |
| `balance` | `integer` mặc định `0` | `CHECK >= 0` — điểm khả dụng |
| `lifetime` | `integer` mặc định `0` | `CHECK >= 0` — điểm tích luỹ, chỉ tăng, dùng để xét rank |
| `last_entry_id` | `bigint` NULL | Bút toán cuối đã áp |
| `raw_balance` | `integer` NOT NULL | Số dư thô (có thể âm), cặp với `point_ledger.raw_balance_after` |
| `updated_at` | `timestamptz` | |

Bảng dẫn xuất từ `point_ledger`. Lệch nhau thì **sổ cái đúng**, bảng này dựng lại được.

### `point_cap_decisions`

Nhật ký quyết định chạm trần điểm theo ngày — để giải thích được "vì sao lần này không
được cộng".

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `user_id` | `uuid` | FK → `users(global_id)` RESTRICT |
| `rule_code` | `varchar(100)` | |
| `policy_date` | `date` | Ngày áp trần. Index `(user_id, rule_code, policy_date)` |
| `decision` | `varchar(20)` | `CHECK IN ('APPLIED','REJECTED')` |
| `idempotency_key` | `varchar(200)` UNIQUE | |
| `created_at` | `timestamptz` | |

### Điểm danh, streak và lượt bù

**Đã dựng ở `1797100000000-CreateCheckInStreak`** (policy nháp seed ở `1797300000000`, mặc định
`enabled = false`). Chi tiết luồng và idempotency tại
[CHECK-IN-STREAK-DESIGN](./plan/CHECK-IN-STREAK-DESIGN.md). Mọi ngày là `date` theo
`Asia/Ho_Chi_Minh`, timestamp vẫn lưu `timestamptz` UTC.

| Bảng | Cột/ràng buộc chính | Mục đích |
| --- | --- | --- |
| `check_in_entries` | `id`, `user_id` FK CASCADE, `policy_date` date, `kind` `NORMAL`/`REPAIR`, `run_id` FK → `check_in_runs`, `streak_day`, `policy_version` FK, `daily_points_awarded` (`REPAIR` thì phải 0), `created_at`; UNIQUE `(user_id, policy_date)`; trigger `check_in_entries_append_only` | Một dấu điểm danh/ngày; chỉ thêm |
| `check_in_runs` | `id`, `global_id`, `user_id` FK, `start_date`, `latest_covered_date` (`>= start_date`), `current_length`, `status` `ACTIVE`/`AT_RISK`/`ENDED`, `version`; `UQ_check_in_runs_open_per_user` (một chuỗi chưa `ENDED` mỗi người) | Snapshot chuỗi; tính lại được từ entries |
| `check_in_milestone_awards` | `run_id`, `user_id`, `entry_id`, `milestone_days`, `bonus_points`, `point_ledger_id` FK, `policy_version`; UNIQUE `(run_id, milestone_days)` | Một thưởng cho mỗi mốc/chuỗi |
| `repair_transaction_progress` | `user_id`, `transaction_id` FK → `gift_transactions`, `cohort_id` FK, `role` `GIVER`/`RECEIVER`, `policy_version`, `created_at`; UNIQUE `(user_id, transaction_id)` | Một giao dịch tặng/nhận quà hoàn tất chỉ tích một lần cho mỗi bên |
| `repair_credit_cohorts` | `id`, `user_id`, `policy_version` FK, `required_transactions` (`>= 1`), `current_count`, `status` `OPEN`/`CLOSED`, `closed_at`; `UQ_repair_credit_cohorts_open_per_user` | Khóa ngưỡng của một nhóm giao dịch cho đến khi phát lượt |
| `repair_credit_ledger` | `id`, `user_id`, `event_type` `ISSUE`/`SPEND`/`REVERSE`, `delta` (`<> 0`), `balance_after` (`>= 0`), `reference_type/id`, `idempotency_key` UNIQUE, `policy_version`, `note`, `created_at`; trigger `repair_credit_ledger_append_only` | Lượt bù phát/tiêu/đảo; append-only, số dư không âm |
| `check_in_policy_revisions` | `version` PK, `enabled`, `daily_points` (0–1000), `milestones_json` (mảng), `transactions_per_repair` (0–1000), `repair_window_days` (0–365), `effective_at`, `reason`, `created_by`, `created_at` | Policy có hiệu lực và audit |

`repair_credit_cohorts` giữ version/ngưỡng tại lúc giao dịch đầu tiên của nhóm đến;
giao dịch tiếp theo hoàn thành nhóm đó rồi mới mở nhóm mới theo policy hiện hành. Khi đủ
ngưỡng, `repair_credit_ledger.ISSUE` cấp một lượt. Đổi policy không quy đổi lại tiến độ/
lượt đã cấp. Mọi ghi điểm danh/bù, award, point ledger và credit ledger
phải cùng transaction database, khoá theo user; không UPDATE/DELETE ledger. Nếu giao dịch
bị đảo sau khi lượt bù đã tiêu, giữ lịch sử và đưa vào đối soát thay vì làm số dư âm.

### `rank_tiers`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `rank` | `users_rank_enum` **PK** | Một dòng cho mỗi rank |
| `threshold_points` | `integer` | Ngưỡng điểm để đạt |
| `warning_points` | `integer` | Ngưỡng cảnh báo tụt hạng |
| `required_gifts` / `required_referrals` | `integer` | Điều kiện nhiệm vụ để **lên** hạng |
| `maintenance_gifts` / `maintenance_referrals` | `integer` | Điều kiện để **giữ** hạng mỗi chu kỳ |
| `post_quota` | `integer` | Hạn mức bài |
| `version` | `integer` mặc định `1` | |
| `maintenance_penalty_points` | `integer` mặc định `0` | Điểm trừ khi trượt nhiệm vụ duy trì; `CHECK >= 0` (`1793100000000`) |

Một `CHECK` gộp bắt mọi cột số phải `>= 0`. Giá trị seed:

| rank | threshold | warning | req. gifts | req. refs | maint. gifts | maint. refs | quota | penalty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `VIEWER` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `MEMBER` | 224 | 157 | 0 | 0 | 0 | 0 | 3 | 0 |
| `SILVER` | 672 | 470 | 1 | 1 | 2 | 2 | 10 | 224 |
| `GOLD` | 896 | 627 | 0 | 0 | 3 | 3 | 20 | 336 |
| `DIAMOND` | 1792 | 1254 | 0 | 0 | 4 | 4 | 50 | 448 |

### `rank_transitions`

Lịch sử đổi hạng: `id` (BIGSERIAL), `user_id` (FK RESTRICT), `from_rank`, `to_rank`
(`users_rank_enum`), `reason` (`varchar(100)`), `points_at_transition` (đổi tên từ
`lifetime_points` ở `1793300000000`), `cycle_id` (`bigint` NULL), `actor`, `created_at`.

### `rank_maintenance_cycles`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `user_id` | `uuid` | FK → `users(global_id)` CASCADE |
| `rank` | `users_rank_enum` | Hạng đang xét |
| `cycle_start` / `cycle_end` | `timestamptz` | `CHECK cycle_end > cycle_start` |
| `gifts_done` / `referrals_done` | `integer` mặc định `0` | `CHECK >= 0` |
| `status` | `varchar(30)` mặc định `'OPEN'` | |
| `evaluated_at` | `timestamptz` NULL | |
| `required_gifts` / `required_referrals` / `policy_version` | `integer` NOT NULL | Chụp yêu cầu duy trì lúc mở chu kỳ (`1792100000000`) — Admin đổi `rank_tiers` giữa chu kỳ không đổi luật của chu kỳ đang chạy |
| `reminded_at` | `timestamptz` NULL | Đã nhắc sắp hết chu kỳ; index một phần `IDX_rank_maintenance_cycles_reminder` |

UNIQUE `(user_id, cycle_start)`; index `(status, cycle_end)` cho job quét chu kỳ đến hạn.
Độ dài chu kỳ lấy từ `system_configs['rank.maintenance_period_months']` (mặc định 3 tháng).

### `referrals` — bản ghi bất biến

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `referrer_id` | `uuid` | FK → `users(global_id)` RESTRICT — người mời |
| `referee_id` | `uuid` **UNIQUE** | FK RESTRICT — người được mời. **Mỗi người chỉ được mời một lần** |
| `code` | `varchar(12)` | Mã đã dùng |
| `qualified_at` | `timestamptz` NULL | Mốc đủ điều kiện thưởng |
| `reward_entry_id` | `bigint` NULL | Trỏ tới bút toán `point_ledger` |
| `signup_ip_hash` / `signup_device_hash` | `varchar(128)` NULL | Hash chống farm điểm |
| `created_at` | `timestamptz` | |

`CHECK referrer_id <> referee_id` — không tự mời chính mình.

**Trigger `enforce_referral_qualification_transition`** cưỡng chế ba điều:

1. `DELETE` bị chặn hoàn toàn.
2. Danh tính (`referrer_id`, `referee_id`, `code`, hai hash, `created_at`) **bất biến**.
3. Ghi nhận đủ điều kiện **chỉ xảy ra đúng một lần**: bản ghi phải đang `NULL` cả
   `qualified_at` lẫn `reward_entry_id`, và lần cập nhật đó phải đặt **cả hai** thành NOT NULL.

Nói cách khác, không có đường nào trả thưởng giới thiệu hai lần — kể cả khi tầng nghiệp vụ có bug.

---

## 6. Cấu hình hệ thống

Ba tầng: `system_configs` cho tham số đơn lẻ (khoá–giá trị), còn
`config_bundles` → `config_revisions` → `capability_policies` → `capability_rank_values`
cho chính sách quyền/quota theo rank.

Cả hai tầng đều dùng chung một mẫu: **có phiên bản, có hiệu lực theo thời gian, và có ràng
buộc `EXCLUDE` chống chồng lấn** — tại mỗi thời điểm chỉ tồn tại đúng một bản `PUBLISHED`.

### `system_configs`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `config_key` | `varchar(150)` | UNIQUE cùng `version` |
| `value_json` | `jsonb` | Giá trị, kể cả số cũng lưu dạng JSON |
| `value_type` | `varchar(30)` | `CHECK IN ('BOOLEAN','INTEGER','DECIMAL','STRING','JSON')` |
| `version` | `integer` | |
| `status` | `varchar(20)` mặc định `'PUBLISHED'` | `CHECK IN ('DRAFT','PUBLISHED','ARCHIVED')` |
| `effective_from` / `effective_to` | `timestamptz` | `CHECK effective_to > effective_from` |
| `is_sensitive` | `boolean` mặc định `false` | Cờ che giá trị khi trả về API |
| `updated_by` | `uuid` NULL | FK → `users(global_id)` SET NULL |
| `change_reason` | `varchar(500)` NULL | |
| `created_at` | `timestamptz` | |

Ràng buộc `EX_system_configs_published_window` (GiST, cần `btree_gist`): với cùng một
`config_key`, hai dòng `PUBLISHED` **không được chồng lấn khoảng hiệu lực**. Đổi cấu hình
nghĩa là đóng `effective_to` của bản cũ và mở bản mới, không phải `UPDATE` tại chỗ.

Khoá seed qua migration (32 khoá tại `1802300000000`; một khoá có thể nhiều version). Mười khoá
đầu tiên từ `1790200000000`, hai khoá `point.referral_daily_cap` / `point.transaction_daily_cap`
đã bị gỡ ở `1796400000000-DropDuplicatePointCapKeys` (trần ngày nay nằm ở `point_rules.daily_cap`):

| Nhóm | Khoá |
| --- | --- |
| Khám phá / Group | `discovery.{default,min,max}_radius_meters` · `group.{default,min,max}_radius_meters` · `group.radius_meters.{member,silver,gold,diamond}` |
| Điểm / hạng | `rank.maintenance_period_months` · `point.redemption` · `point.value_bonus_max_value_vnd` · `affiliate.active_member_window_days` |
| Đánh giá / uy tín | `accuracy.giver` · `rating.display` · `review.grace` |
| Kiểm duyệt / báo xấu | `moderation.blocked_terms` · `report.abuse` · `referral.review_min_{qualified,cluster_size,device_clusters}` |
| Chat / thông báo | `chat.retention` · `chat.direct_user_daily_limit` · `notification.retention` |
| Bảng xếp hạng | `leaderboard.{enabled,badge_months,badge_ranks,min_givers,min_charity,min_consistency_days}` |
| Khác | `classified.legacy_transactions_enabled` |

Nguồn đúng là database: `SELECT DISTINCT config_key FROM system_configs` (CI canh bằng
`npm run test:config-inventory`).

### `config_bundles` / `config_revisions`

`config_bundles`: `id` (BIGSERIAL), `code` + `version` (UNIQUE), `status`
(`DRAFT`/`PUBLISHED`/`ARCHIVED`), `effective_from`/`effective_to`, `created_at`.

`config_revisions`: `id`, `bundle_id` (FK RESTRICT), `scope` (`varchar(50)`, ví dụ
`ENTITLEMENT`), `status`, `effective_from`/`effective_to`, `change_reason`, `created_at`.
Cùng ràng buộc `EXCLUDE` như trên, nhưng khoá theo `scope`.

Seed: bundle `M6_BASE_POLICY` v1 với một revision `scope = 'ENTITLEMENT'`. Migration sau
(`1791500000000-CreateFeedInteractions`) mở bundle v2 với revision mới và đóng revision cũ;
các migration kế tiếp bổ sung/sửa capability vào revision đang hiệu lực và giữ nguyên lịch sử.
Revision đã đóng khung thời gian mang `ARCHIVED` (`1796900000000`).

### `capability_policies` / `capability_rank_values`

`capability_policies`: `id`, `revision_id` (FK RESTRICT), `code` (`varchar(100)`),
`enabled` (mặc định `true`). UNIQUE `(revision_id, code)`.

`capability_rank_values`: `id`, `policy_id` (FK **CASCADE**), `rank` (`users_rank_enum`),
`allowed` (`boolean`), `limit_value` (`integer` NULL, `CHECK NULL OR >= 0`).
UNIQUE `(policy_id, rank)`.

Capability trong revision đang hiệu lực tại `1802300000000`, giá trị theo rank:

| Capability | VIEWER | MEMBER | SILVER | GOLD | DIAMOND |
| --- | --- | --- | --- | --- | --- |
| `POST_OPEN` (gộp `POST_OFFER`/`POST_WANTED`, `1794300000000`) | ✗ | 3 | 10 | 20 | 50 |
| `OPEN_REQUEST_QUOTA` | ✗ | 5 | 10 | 20 | 30 |
| `SELECT_REQUESTER` (`1799500000000`: cổng chỉ Kim Cương, `limit_value` = 0 không ai đọc) | ✗ | ✗ | ✗ | ✗ | ✓ |
| `POST_SOS` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `REACT_CONTENT` / `COMMENT_CONTENT` | ✗ | ✓ | ✓ | ✓ | ✓ |
| `SUBMIT_INDIVIDUAL_APPEAL` | ✗ | ✓ | ✓ | ✓ | ✓ |
| `CREATE_GROUP` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `SUBMIT_CHARITY_PROPOSAL` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `PUBLISH_CHARITY_WITHOUT_REVIEW` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `DISCOVERY_RADIUS` (mét) | 5 000 | 10 000 | 20 000 | 30 000 | 50 000 |

Số = `limit_value` (hạn mức), `✓` = cho phép không giới hạn (`limit_value` NULL),
`✗` = `allowed = false`.

### `notification_channels`

Một dòng cho mỗi kênh gửi, khoá chính là chính tên kênh.

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `channel` | `varchar(20)` **PK** | `CHECK IN ('EMAIL','SMS','ZALO')` |
| `provider` | `varchar(50)` | `SMTP`, `ZALO_ZNS`, `UNSET` |
| `enabled` | `boolean` mặc định `false` | |
| `from_address` / `from_name` | `varchar(255)` / `varchar(150)` NULL | |
| `host` / `port` / `username` | `varchar(255)` / `integer` / `varchar(255)` NULL | `CHECK port 1–65535` |
| `secret_encrypted` | `text` NULL | **Ciphertext AES-256-GCM** |
| `updated_by` | `uuid` NULL | FK → `users(global_id)` SET NULL |
| `updated_at` | `timestamptz` | |

Hai điểm đáng nhớ:

- **Database không bao giờ giữ secret bản rõ**, và API chỉ trả về trạng thái "đã cấu hình
  hay chưa" — không bao giờ trả giá trị.
- `CHECK_notification_channels_ready`: `enabled = false OR secret_encrypted IS NOT NULL`.
  Không bật được một kênh chưa đủ thông tin để gửi — nếu không, bật lên rồi mới phát hiện
  thiếu là đã lỡ hứa với người dùng.

Seed ba dòng `EMAIL`/`SMS`/`ZALO`, tất cả `enabled = false`.

---

## 7. Quản trị và audit

### `admin_roles` / `admin_permissions` / `admin_role_permissions` / `admin_user_roles`

RBAC bốn bảng kinh điển. `admin_roles`: `id`, `code` (UNIQUE), `name`, `is_active`.
`admin_permissions`: `id`, `code` (UNIQUE), `description`.
`admin_role_permissions`: PK ghép `(role_id, permission_id)`, cả hai FK CASCADE.
`admin_user_roles`: PK ghép `(user_id, role_id)`, thêm `assigned_by` (FK SET NULL) và
`assigned_at`.

Năm vai và 30 quyền seed qua migration (bảng gốc `1790200000000`; các quyền theo phân hệ
thêm dần, `1792500000000` thay allowlist cũ bằng RBAC). Ánh xạ tại `1802300000000`:

| Vai | Quyền |
| --- | --- |
| `SUPER_ADMIN` | Tất cả 30 quyền |
| `POLICY_ADMIN` | `admin.access` · `config.read/write` · `entitlement.read/write` · `point.read` · `campaign.read/manage` · `blog.read/manage` |
| `CAMPAIGN_MANAGER` | `admin.access` · `config.read` · `campaign.read/manage` · `banner.read/manage` · `blog.read/manage` · `dharma.read/manage` · `merit.read` |
| `MODERATOR` | `admin.access` · `post.read/moderate` · `report.read/resolve` · `blog.read/manage` |
| `AUDITOR` | `admin.access` · `audit.read` · `dashboard.read` · `point.read` · `banner.read` · `dharma.read` · `merit.read` |

Quyền chỉ `SUPER_ADMIN` có: `admin.manage`, `notification.manage`, `category.read/manage`,
`point.adjust`, `rank.operate`, `leaderboard.read/moderate`, `merit.manage`. Danh sách đúng:
`SELECT code FROM admin_permissions` (CI canh bằng `npm run test:permission-inventory`).

`entitlement.*` cố ý tách khỏi `config.*`: người được sửa quota bài không đương nhiên được
đọc/ghi cấu hình SMTP — hai thứ có bán kính thiệt hại khác hẳn nhau nếu bị lạm dụng.

### `admin_audit_logs` — **chỉ ghi thêm**

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `actor_user_id` | `uuid` NULL | FK → `users(global_id)` SET NULL |
| `action` | `varchar(100)` | |
| `resource_type` / `resource_id` | `varchar(100)` / `varchar(200)` NULL | |
| `before_json` / `after_json` | `jsonb` NULL | Ảnh chụp trước/sau |
| `revision_id` | `bigint` NULL | |
| `request_id` | `varchar(100)` NULL | Nối với log ứng dụng |
| `ip_hash` | `varchar(128)` NULL | Hash, không lưu IP thô |
| `reason` | `varchar(500)` NULL | |
| `created_at` | `timestamptz` | |

Index `(created_at DESC)` và `(resource_type, resource_id, created_at DESC)`.
**Trigger `prevent_admin_audit_mutation`** chặn `UPDATE`/`DELETE` — audit sửa được thì
không còn là audit. `actor_user_id` dùng `SET NULL` để xoá tài khoản không làm mất bản ghi.

---

## 8. Giao dịch tặng

### `gift_requests` (`1790700000000`)

Yêu cầu xin nhận / hàng đợi ứng viên của một bài. Chọn được người thì mới sinh `gift_transactions`.

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `SERIAL` PK | |
| `global_id` | `uuid` UNIQUE | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |
| `post_id` | `uuid` NOT NULL | FK → `posts(global_id)` CASCADE |
| `requester_id` | `uuid` NOT NULL | FK → `users(global_id)` CASCADE |
| `message` | `varchar(500)` NOT NULL | |
| `status` | `gift_requests_status_enum` mặc định `PENDING` | `PENDING` · `ACCEPTED` · `REJECTED` · `CANCELLED` · `WITHDRAWN` · `STANDBY` |
| `queue_joined_at` | `timestamptz` mặc định `now()` | Quyết định thứ tự hàng đợi |
| `withdrawn_at` | `timestamptz` NULL | |
| `offering_post_id` | `uuid` NULL | FK → `posts(global_id)` **SET NULL** — bài Muốn Tặng người kia mang tới khi đáp một bài Muốn Nhận (`1797000000000`) |

`UQ_gift_requests_post_requester` unique một phần `(post_id, requester_id) WHERE deleted_at IS NULL`
— **đây** là chỗ giữ "mỗi người một yêu cầu trên một bài". Index `(post_id, status)` và
`(requester_id, status)`, cùng điều kiện `deleted_at IS NULL`.

### `gift_transactions`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `global_id` | `uuid` UNIQUE | |
| `post_id` | `uuid` | FK → `posts(global_id)` RESTRICT |
| `giver_id` / `receiver_id` | `uuid` | FK → `users(global_id)` RESTRICT |
| `quantity` | `integer` mặc định `1` | `CHECK > 0` |
| `status` | `varchar(20)` NOT NULL, **không có mặc định** | Còn sống: `ACCEPTED` · `DELIVERING` · `COMPLETED` · `CANCELLED` |
| `requested_at` | `timestamptz` mặc định `now()` | |
| `accepted_at` / `completed_at` / `closed_at` | `timestamptz` NULL | |
| `handed_over_at` | `timestamptz` NULL | Mốc người cho xác nhận đã bàn giao (`1791300000000`) |
| `close_reason` | `varchar(200)` NULL | |
| `closed_by` | `uuid` NULL | FK → `users(global_id)` (`1791000000000`). Index một phần `(closed_by, status) WHERE closed_by IS NOT NULL` |

`1794800000000-DropDeadTransactionStatuses` đổi các dòng `REQUESTED`/`REJECTED` cũ sang
`CANCELLED`, **bỏ `DEFAULT 'REQUESTED'`** (INSERT quên `status` sẽ rơi vào trạng thái chết) và
thêm `CHK_gift_transactions_live_status`. Ràng buộc gốc `CHK_gift_transactions_status` (sáu giá
trị) vẫn còn nhưng bị ràng buộc mới bao trùm. Từ chối một **yêu cầu** là việc của `gift_requests`.

Các ràng buộc đáng chú ý, tất cả đặt ở schema chứ không chỉ ở tầng nghiệp vụ:

- `CHK_gift_transactions_not_self`: `giver_id <> receiver_id`. Tự tặng cho chính mình là
  đường farm điểm rẻ nhất.
- `CHK_gift_transactions_completed_at`: `(status = 'COMPLETED') = (completed_at IS NOT NULL)`
  — tương đương hai chiều. Bộ đếm hoạt động rank đếm theo `completed_at`; thiếu nó thì giao
  dịch **vô hình với rank**.
- `CHK_gift_transactions_live_status`: `status IN ('ACCEPTED','DELIVERING','COMPLETED','CANCELLED')`.
- `CHK_gift_transactions_closed_pairing`: `closed_by` và `closed_at` cùng NULL hoặc cùng có.
- `UQ_gift_transactions_open_request`: unique một phần trên `(post_id, receiver_id)`
  `WHERE status IN ('REQUESTED','ACCEPTED','DELIVERING')`. Tên và điều kiện còn từ thời lượt trao
  có trạng thái `REQUESTED`; vì `REQUESTED` nay bị `CHK_gift_transactions_live_status` cấm, thực
  chất nó giữ **một lượt trao đang chạy (`ACCEPTED`/`DELIVERING`) cho mỗi (bài, người nhận)**.
  Chống xin trùng nằm ở `UQ_gift_requests_post_requester`.

Index: `(post_id, status)` cho màn hình bài, `(giver_id, completed_at)` cho bộ đếm rank,
`(status, accepted_at)` cho job tự hoàn tất, `(completed_at) WHERE status = 'COMPLETED'` cho
thống kê theo tháng.

### `gift_transaction_evidence` (`1791300000000`)

Ảnh bằng chứng bàn giao/nhận/hoàn trả. `id` BIGSERIAL, `global_id` UNIQUE, `transaction_id`
(FK → `gift_transactions`), `kind` (`HANDOVER` · `RECEIPT` · `RETURNED`), `slot` (`CHECK 1–3`),
`uploaded_by` (FK → `users`), `storage_key` `varchar(500)` UNIQUE, `created_at`. UNIQUE
`(transaction_id, kind, slot)`. **Trigger `gift_transaction_evidence_append_only`** chặn mọi
`UPDATE`/`DELETE`.

### `transaction_reviews` (`1792600000000`)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` / `global_id` | `BIGSERIAL` PK / `uuid` UNIQUE | |
| `transaction_id` | `uuid` | FK → `gift_transactions(global_id)` |
| `reviewer_id` / `reviewee_id` | `uuid` | FK → `users(global_id)`; `CHK_transaction_reviews_not_self` |
| `reviewer_role` | `transaction_review_role_enum` | `GIVER` · `RECEIVER` |
| `rating` | `smallint` | `CHECK 1–5` |
| `accuracy_percent` | `smallint` NULL | `CHK_transaction_reviews_accuracy_role`: người nhận **bắt buộc** chấm 0–100, người cho **không được** chấm |
| `comment` | `varchar(1000)` NULL | |
| `created_at` | `timestamptz` | |
| `edited_at` / `previous_rating` / `previous_accuracy_percent` / `previous_comment` | NULL | Ảnh chụp bản trước lần sửa (`1799700000000`); `CHK_transaction_reviews_edit_audit`: `edited_at` và `previous_rating` cùng NULL hoặc cùng có |

UNIQUE `(transaction_id, reviewer_id)` — mỗi bên đánh giá một lần; index `(reviewee_id, created_at DESC)`.
**Trigger `transaction_reviews_edit_once`** (`1799700000000-AllowReviewEditOnce`): cấm `DELETE`;
cho `UPDATE` **đúng một lần** (dòng đã có `edited_at` thì từ chối), chỉ được đổi `rating` /
`accuracy_percent` / `comment`; chính trigger chép bản cũ vào `previous_*` và đặt `edited_at`
— một `UPDATE` viết tay cũng để lại dấu.

### `recipient_selection_audits` (25/10, `1801800000000`)

Lý do của mỗi lượt trao do job tự chọn (PR #46 §9). PK `transaction_id` → FK
`gift_transactions(global_id)` ON DELETE CASCADE, ghi **trong cùng transaction** với lượt trao —
có lượt trao tự chọn là có đúng một dòng lý do. Cột: `post_id`, `request_id`, `requester_id`
(uuid trần), `trigger` (`CHECK = 'AUTOMATIC'`), `deciding_criterion` (tiêu chí đầu tiên
tách người thắng khỏi người về nhì, hoặc `REQUEST_ORDER`/`ONLY_CANDIDATE`), `criteria_order`
đã chuẩn hoá, `winner_metrics` / `runner_up_metrics` **tại thời điểm chọn** (jsonb),
`candidate_count` (`> 0`), `created_at`. Index `(post_id, created_at)`.
`CHK_recipient_selection_audits_runner_up`: không có người về nhì ⇔ `ONLY_CANDIDATE`.

---

## 9. Chat

### `chat_rooms` (`1790900000000`, mở rộng tới `1802200000000`)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` / `global_id` | `BIGSERIAL` PK / `uuid` UNIQUE | |
| `room_type` | `chat_rooms_room_type_enum` mặc định `TRANSACTION` | `TRANSACTION` · `DIRECT_POST` (Rao vặt, `1801500000000`) · `DIRECT_USER` (`1802200000000`) |
| `transaction_id` | `uuid` NULL, UNIQUE | FK → `gift_transactions(global_id)`. Có ⇔ `TRANSACTION` |
| `post_id` | `uuid` NULL | **Không FK**. NULL ⇔ `DIRECT_USER` |
| `giver_id` / `receiver_id` | `uuid` NOT NULL | FK → `users`. `DIRECT_POST`: người bán / người mua. `DIRECT_USER`: repository lưu id nhỏ hơn ở `giver_id` |
| `created_by` | `uuid` NULL | FK → `users`. Có ⇔ `DIRECT_USER` (đếm giới hạn phòng mới mỗi ngày, `chat.direct_user_daily_limit`) |
| `status` | `chat_rooms_status_enum` mặc định `OPEN` | `OPEN` · `READ_ONLY`; `CHK_chat_rooms_locked_pairing` cặp với `locked_at` |
| `last_message_at` / `giver_read_at` / `receiver_read_at` / `locked_at` | `timestamptz` NULL | |
| `giver_muted_at` / `receiver_muted_at` | `timestamptz` NULL | Tắt thông báo phòng (`1795000000000`) |
| `purge_after` / `purged_at` / `purged_message_count` | NULL | Hạn lưu trữ (`1791400000000`); index một phần `IDX_chat_rooms_due_for_purge` |
| `created_at` / `updated_at` | `timestamptz` | |

Ràng buộc: `CHK_chat_rooms_distinct_participants` (`giver_id <> receiver_id`),
`CHK_chat_rooms_type_transaction` (`TRANSACTION` ⇔ có `transaction_id`),
`CHK_chat_rooms_type_post` (`DIRECT_USER` ⇔ `post_id IS NULL`),
`CHK_chat_rooms_direct_user_creator` (`DIRECT_USER` ⇔ có `created_by`). Unique một phần:
`UQ_chat_rooms_direct_post (post_id, receiver_id, giver_id) WHERE room_type = 'DIRECT_POST'`
và `UQ_chat_rooms_direct_user (LEAST(giver_id, receiver_id), GREATEST(giver_id, receiver_id))
WHERE room_type = 'DIRECT_USER'` — mỗi cặp người đúng một phòng. Index hộp thư
`(giver_id, last_message_at DESC)`, `(receiver_id, last_message_at DESC)` và
`IDX_chat_rooms_direct_user_creator (created_by, created_at)`.

### `chat_messages`

`id` BIGSERIAL, `global_id` UNIQUE, `room_id` (FK → `chat_rooms`), `sender_id` (FK → `users`),
`body varchar(2000)`, `media_count` (`CHECK 0–3`), `recalled_at` (thu hồi, `1794900000000`),
`created_at`. `CHK_chat_messages_body_not_blank`: đã thu hồi, hoặc có chữ, hoặc có ảnh. Index
`(room_id, created_at DESC, id DESC)` cho phân trang.

**Trigger `chat_messages_append_only`** chặn `UPDATE`/`DELETE`, trừ hai cửa đều phải khai cờ
phiên (`SET LOCAL`):

- `chantam.chat_purge = 'on'` — job dọn theo hạn lưu trữ được `DELETE`.
- `chantam.chat_recall = 'on'` — thu hồi được `UPDATE`, chỉ khi `recalled_at` đi từ NULL sang
  NOT NULL, `body = ''`, `media_count = 0`, và `global_id`/`room_id`/`sender_id`/`created_at`
  giữ nguyên.

### `chat_message_media` (`1792400000000`)

`id`, `message_id` (FK → `chat_messages` CASCADE), `room_id`, `slot` (`CHECK 1–3`),
`storage_key` UNIQUE, `created_at`. UNIQUE `(message_id, slot)`; index `(room_id)`.

### `chat_message_flags` (`1796500000000`)

Tin nhắn bị bộ lọc từ khoá gắn cờ chờ Admin xem. `id`, `global_id` UNIQUE, `message_id`
(FK CASCADE, **UNIQUE** — một cờ mỗi tin), `room_id`, `sender_id`, `severity varchar(20)`,
`matched_terms text[]` (ít nhất 1), `created_at`, `reviewed_at` / `reviewed_by` (FK SET NULL) /
`action` (`chat_flag_actions_enum`) / `review_note`. `CHK_chat_message_flags_review`:
`reviewed_at` và `action` cùng NULL hoặc cùng có. Index chờ duyệt `(severity, created_at)
WHERE reviewed_at IS NULL` và `(sender_id, created_at DESC)`.

---

## 10. Thông báo và báo xấu

### `notifications` (`1790900000000`)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` / `global_id` | `BIGSERIAL` PK / `uuid` UNIQUE | |
| `user_id` | `uuid` | FK → `users(global_id)` CASCADE |
| `type` | `varchar(64)` | Mã loại thông báo |
| `title` / `body` | `varchar(200)` / `varchar(1000)` | |
| `reference_type` / `reference_id` | `varchar(64)` / `uuid` NULL | Tham chiếu cũ |
| `target_type` / `target_id` | `varchar(32)` / `uuid` NULL | Đích điều hướng (`1801100000000`) |
| `idempotency_key` | `varchar(200)` NULL, UNIQUE | Một sự kiện chỉ ra một thông báo |
| `read_at` / `pushed_at` / `created_at` | `timestamptz` | |

`CHK_notifications_target`: không có `target_type` thì không có `target_id`; `RANK` /
`REFERRAL` / `LEADERBOARD` không mang id; `POST` / `GIFT_TRANSACTION` / `CHAT_ROOM` /
`CHARITY_CAMPAIGN` / `DHARMA_THREAD` bắt buộc có id; giá trị khác bị từ chối. Index hộp thư
`(user_id, created_at DESC)` và chưa đọc `(user_id) WHERE read_at IS NULL`.

### `notification_templates` · `notification_mutes` · `notification_broadcasts`

- **`notification_templates`** (`1792900000000`): `id`, `type varchar(64)` UNIQUE, `title`,
  `body` (cả hai không rỗng), `is_enabled` mặc định `false`, `updated_by` (FK SET NULL),
  `updated_at`. Migration seed 14 mẫu.
- **`notification_mutes`** (`1795100000000`): một dòng = người dùng **đã tắt** một nhóm thông
  báo. `user_id` (FK CASCADE), `notification_group varchar(32)`, `muted_at`; UNIQUE
  `(user_id, notification_group)`. Không có dòng nghĩa là đang bật. Nhóm mở rộng từ 4 lên 8 ở
  `1799400000000` (giá trị kiểm ở ứng dụng, không có CHECK).
- **`notification_broadcasts`** (`1798100000000`, lease `1800900000000`): Admin gửi hàng loạt.
  `audience_type` `ALL` / `GROUP` (`group_id` FK SET NULL) / `AREA` (`center_location` geography +
  `radius_meters > 0`) — `CHK_notification_broadcasts_audience` buộc đúng bộ cột theo loại;
  `notification_type`, `title`, `body`; `status` `PENDING` · `SENDING` · `COMPLETED` · `FAILED`
  (`completed_at` có ⇔ đã kết thúc); bộ đếm `audience_count` / `notified_count` /
  `already_sent_count` / `failed_count` và con trỏ `last_user_id` (đều `>= 0`);
  `lease_until`, `failure_reason`, `created_by`, `started_at`.

### `reports` (`1791900000000`)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` / `global_id` | `SERIAL` PK / `uuid` UNIQUE | |
| `created_at` / `updated_at` | `timestamptz` | |
| `reporter_user_id` | `uuid` | FK → `users(global_id)` |
| `target_type` / `target_id` | `reports_target_type_enum` / `uuid` | `POST` · `USER` · `COMMENT` · `CHAT_MESSAGE` · `DHARMA_THREAD`. **Không FK** |
| `reason` | `reports_reason_enum` | |
| `description` | `varchar(1000)` | |
| `evidence_urls` | `jsonb` mặc định `'[]'` | `CK_reports_evidence_array`: phải là mảng |
| `status` | `reports_status_enum` mặc định `PENDING` | `PENDING` · `IN_REVIEW` · `RESOLVED` · `DISMISSED` |
| `reviewed_by_user_id` / `review_note` / `reviewed_at` | NULL | FK SET NULL |

`UQ_reports_open_reporter_target`: mỗi người một báo xấu đang mở (`PENDING`/`IN_REVIEW`) cho
mỗi đích. Index `(status, created_at)` và `(target_type, target_id, status)`.

---

## 11. Tương tác nội dung (feed)

Bốn bảng `content_*` (`1791500000000`) dùng chung cho mọi "chủ thể" qua cặp
`subject_type` (`content_subject_type_enum`: `POST` · `COMMENT` · `DHARMA_THREAD`) +
`subject_id` uuid — **đa hình, không có FK tới chủ thể**. Bộ đếm denormalized nằm ở
`posts.*_count` và `content_comments.reply_count` / `reaction_count`.

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `content_reactions` | `id`, `subject_type`, `subject_id`, `user_id` (FK → `users`), `kind` (`LIKE` · `LOVE` · `CARE` · `WOW` · `SAD`), `created_at`, `updated_at`. `UQ_content_reactions_one_per_user (subject_type, subject_id, user_id)` — đổi cảm xúc là UPDATE, không thêm dòng. Index `(subject_type, subject_id, kind)` |
| `content_comments` | `id`, `global_id` UNIQUE, `subject_type`, `subject_id`, `author_id` (FK), `body varchar(1000)`, `status` (`VISIBLE` · `PENDING_REVIEW` · `HIDDEN` · `REMOVED`), `depth` (`1–2`), `parent_id` + `parent_depth`, `reply_count` / `reaction_count` / `media_count` (`0–3`), `flagged_terms`, `edited_at`, `created_at`, `updated_at`. **Tối đa hai tầng**: FK ghép `(parent_id, parent_depth)` → `content_comments(global_id, depth)` cùng `CHK_content_comments_parent_pairing` buộc trả lời chỉ gắn vào bình luận gốc. `CHK_content_comments_body_not_blank` (có chữ hoặc có ảnh). Index gốc `(subject_type, subject_id, created_at DESC, id DESC) WHERE parent_id IS NULL`, trả lời `(parent_id, created_at, id)` |
| `content_comment_media` | `id`, `comment_id` (FK CASCADE), `slot` (`1–3`), `storage_key` UNIQUE, `created_at`; UNIQUE `(comment_id, slot)` |
| `content_shares` | `id`, `subject_type`, `subject_id`, `user_id` (FK), `channel varchar(40)` NULL, `created_at`; index `(subject_type, subject_id)`. Không unique — mỗi lượt chia sẻ một dòng |

---

## 12. Group và affiliate

### `groups` · `sub_teams` · `group_memberships` · `group_role_permissions` (`1793700000000`)

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `groups` | `id`, `global_id` UNIQUE, `owner_id` (FK → `users` RESTRICT), `name`, `description`, `avatar_url`, `cover_url`, **`center_location geography(Point,4326)`** (GiST), `region_label`, `radius_km` (`CHECK 1–50`), **`invite_code varchar(32)` UNIQUE** (mã mời nằm ngay trên nhóm — không có bảng invite riêng), `status` `ACTIVE`/`DISSOLVED` (`CHK_groups_dissolved_at` cặp với `dissolved_at`), `activated_at`, timestamps, `deleted_at`. `UQ_groups_one_active_per_owner` — mỗi người sở hữu tối đa một nhóm đang hoạt động |
| `sub_teams` | `id`, `global_id` UNIQUE, `group_id` (FK CASCADE), `name`, timestamps, `deleted_at` |
| `group_memberships` | `id`, `global_id` UNIQUE, `group_id` (FK CASCADE), `user_id` (FK CASCADE), `sub_team_id` (FK SET NULL), `role` (`OWNER` · `SUBTEAM_ADMIN` · `MEMBER`), `status` `ACTIVE`/`DISSOLVED` (`1795900000000`), `joined_at`, timestamps. **`UQ_group_memberships_one_active_per_user (user_id) WHERE status = 'ACTIVE'`** — mỗi người tối đa một nhóm đang hoạt động |
| `group_role_permissions` | `id`, `role`, `permission varchar(100)`, `version` (`1796200000000`), `updated_by` (FK SET NULL), `updated_at`, `change_reason`; UNIQUE `(role, permission, version)` — có lịch sử phiên bản như cấu hình động |

### `affiliate_policy_revisions` · `affiliate_events` · `affiliate_rewards` (`1797400000000`)

- **`affiliate_policy_revisions`**: PK `version`, `enabled` (mặc định `false`),
  `distribution_mode` `SPLIT_POOL`/`PER_MEMBER`, `event_points_json` (object),
  `daily_cap_per_beneficiary` (0–100 000), `max_beneficiaries_per_event` (0–5 000),
  `effective_at`, `reason`, `created_by`, `created_at`. Migration không seed dòng nào.
- **`affiliate_events`**: một sự kiện nguồn đã xét địa lý. `id`, `global_id`, `group_id`
  (FK CASCADE), `source_user_id` (FK CASCADE), `event_type`, `reference_type` / `reference_id`,
  `geo_status` (`ELIGIBLE` · `NOT_ELIGIBLE_GEO` · `NO_LOCATION`), `location_source` (`EVENT` ·
  `TRANSACTION` · `POST` · `MEMBER_DEFAULT` · `NONE`), **`distance_meters` / `radius_meters`** chụp
  lúc xét, `beneficiary_count`, `total_points`, `policy_version` (FK), `created_at`.
  `UQ_affiliate_events_source (group_id, event_type, reference_type, reference_id)` — một nguồn
  xét một lần; `CHK_affiliate_events_geo_zero`: không `ELIGIBLE` thì `total_points = 0`.
- **`affiliate_rewards`**: một dòng cho mỗi người hưởng. `event_id` (FK → `affiliate_events.id`
  CASCADE), `group_id`, `source_user_id`, `beneficiary_user_id`, bản sao `event_type` /
  `reference_*` / `geo_status`, `reward_status` (`AWARDED` · `NOT_ELIGIBLE_GEO` · `CAPPED` ·
  `REVERSED`), `point_delta` (`>= 0`, chỉ khác 0 khi `AWARDED`/`REVERSED`), `point_ledger_id`
  (FK → `point_ledger.id`, bắt buộc khi `AWARDED`/`REVERSED`), `idempotency_key` UNIQUE,
  `policy_version` (FK), `reversed_at` (có ⇔ `REVERSED`), `created_at`. UNIQUE
  `(beneficiary_user_id, event_type, reference_type, reference_id)`.

---

## 13. Giới thiệu qua link — deferred attribution (`1802300000000`)

Link giới thiệu sống sót qua bước cài app. Bốn bảng theo bốn bước của luồng, cộng một bảng
nhật ký. IP, User-Agent và `installId` chỉ lưu dạng HMAC (`*_hash varchar(64)`); khoá attribution
là token, không phải hash. **Claim không phát thưởng**: claim `QUALIFIED` ghi một dòng
`referrals`, rồi đường thưởng giới thiệu sẵn có mới trả khi người được mời hoàn tất onboarding.

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `attribution_links` | `id` BIGSERIAL, `code varchar(16)` UNIQUE, `referrer_id` (FK → `users`), `target_type` (`POST` · `PROFILE` · `USER` · `GROUP_INVITE`) + `target_value` (cùng NULL hoặc cùng có), `campaign` / `source` / `medium`, `created_at`, `revoked_at` / `revoked_by` / `revoke_reason` (`CHK_attribution_links_revoke`). `UQ_attribution_links_live` — tạo lại đúng link đang sống thì trả link cũ (unique trên referrer + các cột đích/UTM qua `COALESCE`, `WHERE revoked_at IS NULL`) |
| `attribution_clicks` | PK `global_id`, `link_id` (FK → `attribution_links.id`), `token_jti` UNIQUE, `issued_at`, `expires_at` (`> issued_at`), `ip_hash`, `user_agent_hash`, `created_at`. Mỗi lượt mở link là một token riêng |
| `attribution_resolutions` | `id`, `click_id` (FK → `attribution_clicks`), `install_id_hash`, `platform` (`IOS`/`ANDROID`), `claim_jti` UNIQUE, `claim_expires_at`, `ip_hash`, `resolved_at`, `last_resolved_at`, `resolve_count`. UNIQUE `(click_id, install_id_hash)` — resolve idempotent |
| `attribution_claims` | PK `global_id`, `click_id` UNIQUE, `resolution_id` (FK), `claim_jti` UNIQUE, `referrer_id` / `referred_user_id` (FK → `users`, **`referred_user_id` UNIQUE**; `CHK_attribution_claims_not_self`), `referral_id` (FK → `referrals.id`), `risk_status` `QUALIFIED` · `PENDING_REVIEW` · `REJECTED`, `risk_reason`, `ip_hash`, `claimed_at`, `reviewed_at` / `reviewed_by` / `review_note`. `CHK_attribution_claims_referral`: `QUALIFIED` ⇔ có `referral_id` |
| `attribution_audit_events` | `id`, `event` (`LINK` · `CLICK` · `RESOLVE` · `CLAIM` · `REVIEW` · `REVOKE`), `outcome varchar(48)`, `click_id`, `user_id`, `install_id_hash`, `ip_hash`, `created_at` — mọi kết cục kể cả bị từ chối; không FK |

---

## 14. Chiến dịch từ thiện (F65b)

`campaigns`, `campaign_participations`, `campaign_reviews` dựng ở `1798200000000`; các bảng giao
nhận, điều phối, thụ hưởng, media và lịch gia hạn thêm từ `1799800000000` tới `1800500000000`.
Giao nhận và người thụ hưởng ở **bảng riêng**, không thêm cột vào `campaigns` (đường đọc công
khai dùng chung danh sách cột).

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `campaigns` | `id`, `global_id`, `title`, `slug` UNIQUE (kebab-case), `description` (`>= 10` ký tự), `banner_url` (`https?://`), `badge_name`, `target_items_count` (0–1 000 000), `current_items_count`, `location` geography (GiST) + `location_label`, `start_time` < `end_time`, `is_active`, `approval_status` `PENDING_APPROVAL` · `APPROVED` · `REJECTED` (cặp với `approved_at`), `approval_note`, `approved_by`, `created_by` (FK SET NULL), `campaign_type` `INDIVIDUAL_APPEAL` · `ORGANIZED_CAMPAIGN`, `beneficiary_relation` (`SELF`/`OTHER`, chỉ và bắt buộc với `INDIVIDUAL_APPEAL`), `allow_over_target`, timestamps, `deleted_at`. **Từ `1802400000000`:** `submitted_at` (NULL = nháp, mặc định `now()`; `CHK_campaigns_draft_undecided`: nháp luôn `PENDING_APPROVAL`), `operation_stage` `PLAN`·`EXECUTION`·`EVENT`·`SUMMARY` (`CHK_campaigns_stage_needs_approval`; **trigger `campaigns_operation_stage_sync`** đưa hàng đã duyệt mà còn `PLAN` sang `EXECUTION`, hàng chưa duyệt về `PLAN`), `appeal_purpose`/`appeal_audience`/`appeal_circumstance`, `call_to_actions text[]` (`LIKE`/`SUPPORT_AND_DONATE`/`JOIN`), `max_bank_accounts` (ghi đè của Admin, 1–20). `IDX_campaigns_pending` loại nháp |
| `campaign_need_items` | `global_id`, `campaign_id` (CASCADE), `category_id` (FK → `categories` SET NULL), `item_name`, `description`, `unit`, `target_quantity` (1–1 000 000), `allow_alternative`, projection `accepted_quantity` / `received_quantity` (gộp cả nhập ngoài app), `sort_order`, `is_active`; UNIQUE `(campaign_id, item_name, unit)`. **Từ `1802400000000`:** `unit_price`, `estimated_value` (VNĐ), `item_condition` `NEW`·`USED`·`ANY`·`OTHER`, `condition_note`, `supply_source` `PURCHASE`·`DONATION`·`MIXED`, `intake_deadline`, `dropoff_address`, `delivery_instruction`, `receiver_name`/`receiver_phone` (không công khai), `intake_status` `OPEN`/`CLOSED`, `surplus_explanation` |
| `campaign_contributions` | `global_id`, `campaign_id` (CASCADE), `contributor_id` (RESTRICT), `status` `PENDING_REVIEW` · `PARTIALLY_ACCEPTED` · `ACCEPTED` · `REJECTED` · `WITHDRAWN`, `note`, `contact_note`, `decided_at` / `decided_by` (có ⇔ đã quyết), `decision_key`, `withdrawn_at` (có ⇔ `WITHDRAWN`) |
| `campaign_contribution_items` | `global_id`, `contribution_id` (CASCADE), `need_item_id` (RESTRICT), `offered_quantity`, `accepted_quantity` (≤ offered), `condition_note`, `rejection_reason` (7 mã, chỉ khi nhận thiếu); UNIQUE `(contribution_id, need_item_id)` |
| `campaign_deliveries` | `global_id`, `campaign_id`, `contribution_id` **UNIQUE**, `contributor_id` ≠ `organizer_id`, `status` `ACCEPTED` · `COMPLETED` · `CANCELLED` (cặp với `completed_*` / `cancelled_*` + `cancel_reason`) |
| `campaign_delivery_items` | `delivery_id` (CASCADE), `contribution_item_id`, `need_item_id`, `accepted_quantity > 0`, `received_quantity` (≤ accepted); UNIQUE `(delivery_id, need_item_id)` |
| `campaign_external_contributions` | Đóng góp ngoài app do ban tổ chức ghi: `need_item_id`, `quantity`, `source_label`, `received_at`, `evidence_note`, `recorded_by`, `status` `ACTIVE`/`VOIDED` (+ `voided_*`, `void_reason`), `replaces_id` UNIQUE (tự tham chiếu). **Trigger `campaign_external_contributions_immutable`**: cấm DELETE, chỉ cho `ACTIVE → VOIDED` và chỉ đổi các cột huỷ |
| `campaign_participations` | `global_id`, `campaign_id`, `user_id` (CASCADE), `status` `REGISTERED`/`CANCELLED` (cặp với `cancelled_at`), `registered_at`; UNIQUE `(campaign_id, user_id)` |
| `campaign_coordinators` | `campaign_id`, `user_id`, `granted_by` (≠ `user_id`), `granted_at`, `revoked_at` / `revoked_by`; `UQ_campaign_coordinators_active` một phần `WHERE revoked_at IS NULL` |
| ~~`campaign_beneficiaries`~~ | **Đã gộp vào `campaign_parties` và xoá** ở `1802400000000` (chốt §7.5 của CHARITY-PROJECT-LIFECYCLE). Người thụ hưởng của kêu gọi cá nhân là dòng `is_appeal_subject` |
| `campaign_parties` | `global_id`, `campaign_id` (CASCADE), `role` `ORGANIZER`·`BENEFICIARY`·`LICENSING`·`MEDIA`, `name`, `address`, `phone`, `email`, `hotline`, `pic_name`/`pic_phone`/`pic_user_id`, `beneficiary_kind` `INDIVIDUAL`/`GROUP` (có ⇔ `BENEFICIARY`), `is_appeal_subject` (người thụ hưởng kêu gọi cá nhân — **riêng tư**; kèm `relation_note`, `consent_status`, `verification_note`; `UQ_campaign_parties_appeal_subject` một dòng mỗi chiến dịch), `evidence_urls` jsonb (≤ 10), `sort_order` |
| `campaign_bank_accounts` | Có phiên bản — không sửa số tại chỗ: `global_id`, `campaign_id`, `label`, `bank_name`, `account_no`, `account_name`, `valid_from`, `valid_to` (NULL = đang hiệu lực; cặp với `close_reason`), `created_by`, `closed_by`. Số tài khoản đang hiệu lực ≤ `campaigns.max_bank_accounts` hoặc `charity.max_bank_accounts_per_campaign` (đếm dưới khoá hàng dự án) |
| `campaign_team_members` | Ban tổ chức (công khai): `role` `GENERAL_LEAD`·`LIAISON_MEDIA`·`INTAKE_LOGISTICS`·`FINANCE`·`ADVANCE_TRANSPORT`·`REPORTING`, `display_name`, liên hệ, `position`, `user_id` (tài khoản Chân Tâm), `bank_account_id` |
| `campaign_phases` | PK `(campaign_id, phase)` `PLANNING`·`PREPARATION`·`DISTRIBUTION`·`REPORTING`, `starts_at` < `ends_at`, `pic_*`, `hotline`, `delivery_method` (chỉ `DISTRIBUTION`), `report_mode` (chỉ `REPORTING`). `DISTRIBUTION.starts_at`/`ends_at` là mốc sang `EVENT`/`SUMMARY` |
| `campaign_stage_events` | Nhật ký chuyển giai đoạn: `from_stage` ≠ `to_stage`, `actor_id` (NULL = hệ thống), `reason`, `created_at`. **Trigger append-only** |
| `campaign_funding_needs` | Kêu gọi tiền (app không giữ tiền): `title`, `description`, `beneficiary_party_id` → `campaign_parties`, `receiving_unit`, `bank_account_id`, `target_amount` > 0, `confirmed_amount`, `external_amount`, `deadline`, `status` `OPEN`/`CLOSED` |
| `campaign_volunteer_needs` | Tuyển người: `title`, `description`, `requirements`, `needed_count` 1–100 000, `starts_at`/`ends_at`, `location_label`, `status` `OPEN`·`CLOSED`·`STARTED` |
| `campaign_volunteer_registrations` | `volunteer_need_id`, `user_id`, `status` `REGISTERED`·`CONFIRMED`·`CANCELLED` (cặp `confirmed_at` / `cancelled_at`), `note`; `UQ_campaign_volunteer_registrations_live` một phần `WHERE status <> 'CANCELLED'` |
| `campaign_section_states` | PK `(campaign_id, section_key)` theo 4 mục, `saved_at`, `published_at` + `published_snapshot` jsonb (có cùng nhau) — bản công khai chỉ đọc bản chụp |
| `campaign_custom_sections` / `campaign_custom_fields` | Form mở: mục (`parent_section`, `title`, `visibility` `PUBLIC`·`PARTICIPANT`·`ORGANIZER_ONLY`·`ADMIN_ONLY`) và trường (`label`, `field_type` 8 loại, `visibility`, `required`, `options` jsonb, `value` jsonb) |
| `campaign_media` | `campaign_id` (CASCADE), `storage_key` UNIQUE, `public_url`, `media_type` `IMAGE`/`VIDEO`, `sort_order` 0–4 (UNIQUE theo chiến dịch), `is_cover` (chỉ ảnh; `UQ_campaign_media_one_cover`) |
| `campaign_schedule_changes` | `campaign_id`, `previous_end_time` < `new_end_time` (chỉ gia hạn), `changed_by`, `reason`, `created_at`. **Trigger append-only** |
| `campaign_reviews` | `global_id`, `campaign_id`, `reviewer_id` ≠ `reviewee_id`, `reviewer_role` `ORGANIZER`/`PARTICIPANT`, `rating` 1–5, `comment`; UNIQUE `(campaign_id, reviewer_id, reviewee_id)` |

Điểm thưởng đóng góp đi qua `point_ledger` với rule `CHARITY_CONTRIBUTION_COMPLETED` (seed **tắt**).

---

## 15. Công đức và Phật pháp

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `merit_units` (`1798700000000`) | Đơn vị nhận công đức: `global_id`, `name`, `slug` UNIQUE, `unit_type` `TEMPLE` · `FUND` · `ORGANIZATION`, `purpose` (`>= 10` ký tự), `description`, `cover_url` (`https://`), `address_label`, `location` geography, `bank_bin` (6 số), `bank_account_number`, `bank_account_name`, `bank_name`, `display_order`, `is_active`, `created_by`, timestamps, `deleted_at` |
| `merit_declarations` | `global_id`, `unit_id` (CASCADE), `user_id` (CASCADE), `declared_amount` (1 000 – 10 tỷ), `status` `INTENDED`/`COMPLETED` (cặp với `completed_at`), `is_anonymous`, `note`, `declared_at` |
| `dharma_contents` (`1798900000000`) | `global_id`, `content_type` `SUTRA` · `INFO` · `TEMPLE_INTRO`, `category`, `title`, `slug` UNIQUE, `summary`, `body_text` (bắt buộc khi publish), `audio_url` / `cover_url` (`https://`), `display_order`, `is_featured`, `is_published` (cặp với `published_at`), `view_count`, `created_by`, timestamps, `deleted_at` |
| `dharma_recitations` | Lượt tụng: `global_id`, `content_id` (CASCADE), `user_id` (CASCADE), `started_at`, `completed_at` (`>= started_at`) + `duration_seconds` |
| `dharma_dedications` (`1799100000000`) | Hồi hướng: `global_id`, `user_id`, `recitation_id` (FK SET NULL), `dedicatee_name`, `text` (`>= 5` ký tự), `is_public`, `is_anonymous`, `created_at` |
| `dharma_threads` (`1799100000000`) | Diễn đàn: `global_id`, `author_id` (SET NULL), `title` (`>= 5`), `body_text` (`>= 10`), `category`, `status` `VISIBLE` · `PENDING_REVIEW` · `HIDDEN` · `REMOVED`, `flagged_terms`, `is_locked`, `is_pinned`, `moderated_by` / `moderated_at` / `moderation_note`, timestamps. Bình luận/cảm xúc đi qua `content_*` với `subject_type = 'DHARMA_THREAD'` |

---

## 16. Bảng xếp hạng tháng (`1801200000000`)

`month` là `date` ngày 1 của tháng theo giờ Việt Nam; `board` ∈ `GIVERS` · `CHARITY` · `CONSISTENCY`.

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `leaderboard_snapshots` | `global_id`, `month` (`CHECK` ngày 1), `board`, `closed_at`, `badges_awarded`. **UNIQUE `(month, board)`** — chốt hai lần không ghi gì |
| `leaderboard_entries` | `snapshot_id` (CASCADE), `user_id`, `rank > 0`, `count > 0`, `reached_at`, `is_anonymous`; UNIQUE `(snapshot_id, rank)` và `(snapshot_id, user_id)` |
| `leaderboard_exclusions` | Admin loại một người khỏi một bảng (`board` NULL = cả ba) của một tháng: `month`, `board`, `user_id`, `reason`, `created_by`, `removed_at` / `removed_by`; unique một phần `(month, COALESCE(board,'*'), user_id) WHERE removed_at IS NULL` |
| `user_badges` | Huy hiệu top N: `user_id`, `board`, `month`, `rank`, `is_anonymous` (cờ **lúc chốt**), `awarded_at`, `expires_at`, `revoked_at` / `revoked_by` / `revoke_reason` (cùng có hoặc cùng NULL); UNIQUE `(user_id, board, month)` |

---

## 17. Nội dung vận hành (CMS)

| Bảng | Cột / ràng buộc chính |
| --- | --- |
| `blogs` (`1797700000000`) | `global_id`, `title`, `slug` UNIQUE (kebab-case), `category` `PHAT_PHAP` · `GUONG_SANG` · `CHIEN_DICH` · `SONG_XANH`, `summary`, `content_html`, `thumbnail_url`, `author_id` (FK SET NULL), `view_count`, `is_published` (cặp với `published_at`; publish thì phải có nội dung và thumbnail), timestamps, `deleted_at` |
| `sponsor_banners` (`1798500000000`) | `global_id`, `partner_name`, `partner_contact`, `title`, `image_url` (`https://`), `target_url` (`https://` · `chantam://` · `givingapp://`), `placement` (12 vị trí, từ `HOME_HERO` tới `DHARMA_MONASTERY`), `display_order`, `starts_at` < `ends_at`, `is_active`, `approval_status` (như `campaigns`), `impression_count` / `click_count`, `created_by`, timestamps, `deleted_at` |
| `home_campaign_configs` (`1797500000000`) | Home động theo chiến dịch: `global_id`, `campaign_name`, `theme_config` (object), `marquee_text`, `popup_config` / `floating_banner` (object NULL), `banners` / `sections_order` (mảng), `start_time` < `end_time`, `is_active`, `created_by` / `updated_by`. **`EXCL_home_campaign_configs_active_overlap`** (`EXCLUDE USING gist ... WHERE is_active`) — hai cấu hình đang bật không được giao nhau về thời gian |
| `lunar_holidays` (`1797900000000`) | `lunar_month` (1–12), `lunar_day` (1–30), UNIQUE `(lunar_month, lunar_day)`, `name`, `description`, `is_active`, `sort_order`, `updated_by` |
| `media_assets` (`1801000000000`) | Thư viện ảnh CMS: `global_id`, `storage_key` UNIQUE, `public_url` (`https?://`), `content_type`, `file_name`, `uploaded_by` (FK SET NULL), `created_at`. Là một nguồn "khoá còn sống" để job dọn object mồ côi không xoá ảnh CMS |

---

## 18. Bất biến rút gọn

Những điều schema tự cưỡng chế — nếu một thay đổi làm gãy một trong số này, kế hoạch sai
chứ không phải ràng buộc sai:

| # | Bất biến | Cưỡng chế bằng |
| --- | --- | --- |
| 1 | Sổ cái điểm không sửa, không xoá | Trigger `prevent_point_ledger_mutation` |
| 2 | Audit log không sửa, không xoá | Trigger `prevent_admin_audit_mutation` |
| 3 | Một người chỉ được giới thiệu một lần, thưởng đúng một lần | UNIQUE `referee_id` + trigger |
| 4 | Không tự tặng, không tự giới thiệu, không tự đánh giá, không tự chặn | `CHECK *_not_self` trên `gift_transactions`, `referrals`, `attribution_claims`, `transaction_reviews`, `campaign_reviews`, `user_blocks` |
| 5 | Một yêu cầu cho mỗi (bài, người xin); một lượt trao đang chạy cho mỗi (bài, người nhận) | `UQ_gift_requests_post_requester`, `UQ_gift_transactions_open_request` (unique một phần) |
| 6 | Tại mỗi thời điểm chỉ một bản cấu hình `PUBLISHED`; một cấu hình Home đang bật | `EXCLUDE USING gist` (cần `btree_gist`) |
| 7 | `remaining_quantity` luôn trong `[0, total_quantity]` | `CHECK` |
| 8 | Username/email duy nhất không phân biệt hoa thường | Unique index trên `LOWER()` |
| 9 | Bật kênh gửi thì phải có secret | `CHECK` trên `notification_channels` |
| 10 | Xoá người dùng không làm bốc hơi sổ cái/giao dịch | FK `RESTRICT` |
| 11 | Bằng chứng giao nhận, lịch sử điểm danh, sổ lượt bù, lịch gia hạn chiến dịch chỉ ghi thêm | Trigger `*_append_only` trên bốn bảng tương ứng |
| 12 | Tin nhắn chỉ ghi thêm, trừ thu hồi và dọn theo hạn | Trigger `chat_messages_append_only` + cờ phiên `chantam.chat_recall` / `chantam.chat_purge` |
| 13 | Đánh giá giao dịch sửa đúng một lần, không xoá, giữ bản cũ | Trigger `transaction_reviews_edit_once` |
| 14 | Đóng góp ngoài app chỉ huỷ được, không sửa/xoá | Trigger `campaign_external_contributions_immutable` |
| 15 | Một người tối đa một nhóm đang hoạt động (làm thành viên) | `UQ_group_memberships_one_active_per_user` |

---

## 19. Chỗ cần biết trước khi viết query

- **Join bằng `global_id`, không bằng `id`.** FK tới bảng nghiệp vụ trỏ tới `global_id`. Ngoại lệ
  là các bảng nội bộ không có `global_id` hoặc tham chiếu theo `id`: RBAC admin (`admin_roles.id`,
  `admin_permissions.id`), cấu hình (`config_bundles.id`, `config_revisions.id`,
  `capability_policies.id`), `affiliate_rewards.event_id`, `*.point_ledger_id`,
  `check_in_*.run_id/entry_id`, `repair_transaction_progress.cohort_id`,
  `attribution_*.link_id/resolution_id`, `attribution_claims.referral_id`,
  `leaderboard_entries.snapshot_id`, và các bảng policy khoá theo `version`.
- **Không phải quan hệ nào cũng có FK.** `posts.author_id`, `user_sessions.user_id`,
  `gift_posts.giver_id`, `categories.parent_id`, `chat_rooms.post_id`, `content_*.subject_id`,
  `reports.target_id`, `notifications.target_id`/`reference_id`, `recipient_selection_audits.post_id`
  là uuid trần, không ràng buộc. Phải tự kiểm tra tồn tại ở tầng use case.
- **`deleted_at` phải tự lọc.** `find()` của TypeORM **không** tự bỏ bản ghi đã xoá mềm.
- **`posts.status` dùng enum tên `gift_posts_status_enum`.** Tên mang tiền tố lịch sử.
- **`gift_posts` không phải nguồn sự thật nữa.** Đọc/ghi ở `posts`.
