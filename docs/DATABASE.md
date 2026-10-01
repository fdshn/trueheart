# Lược đồ cơ sở dữ liệu

Bảng tra **schema thật đang chạy** — sinh từ 15 migration trong
`suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations/`.

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
   trong tài liệu này đều tham chiếu `global_id` của bảng đích.
2. **Mọi mốc thời gian là `timestamptz`.** Người dùng ở nhiều múi giờ; lịch âm tính ở client.
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
| `gift_posts_status_enum` | `DRAFT` · ~~`PENDING_REVIEW`~~ · `REJECTED` · `PUBLISHED` · `RESERVED` · `DELIVERING` · `COMPLETED` · `CANCELLED` · `EXPIRED` · `ARCHIVED` — `PENDING_REVIEW` giữ trong enum cho dữ liệu cũ, bài mới không vào đó nữa (chốt 26/09) |
| `gift_posts_category_enum` | `HOUSEHOLD` · `CLOTHING` · `BOOKS` · `ELECTRONICS` · `FURNITURE` · `VEHICLE` · `MEDICAL` · `FOOD` · `NON_MATERIAL` · `OTHER` |
| `gift_posts_condition_enum` | `NEW` · `LIKE_NEW` · `USED` · `NOT_APPLICABLE` |
| `posts_selection_mode_enum` | `INSTANT` · `OPTIMAL` · `EXTENDED` |

`posts.status` **dùng lại** `gift_posts_status_enum` chứ không có enum riêng — tên enum
mang tiền tố lịch sử, đừng đọc nó thành "chỉ áp dụng cho `gift_posts`".

### Bản đồ quan hệ

```
users ──┬──< user_sessions
        ├──< user_onboarding_task_completions >── onboarding_tasks
        ├──< referrals (referrer/referee, bất biến)
        ├──< user_point_balances (1–1)
        ├──< point_ledger (append-only)  ····· point_rules
        ├──< point_cap_decisions
        ├──< rank_transitions            ····· rank_tiers
        ├──< rank_maintenance_cycles
        ├──< admin_user_roles >── admin_roles ──< admin_role_permissions >── admin_permissions
        ├──< admin_audit_logs (append-only)
        ├──< system_configs (updated_by)
        ├──< notification_channels (updated_by)
        │
        └──< posts ──┬──< post_media
                     └──< gift_transactions >── users (giver/receiver)
                     │
           categories ┘

config_bundles ──< config_revisions ──< capability_policies ──< capability_rank_values

gift_posts   (nguyên mẫu M1, giữ lại cho tương thích ngược)
```

Đường nét đứt `·····` là tham chiếu **theo mã, không có khoá ngoại**
(`point_ledger.rule_code` → `point_rules.code`, `rank_transitions.*_rank` → `rank_tiers.rank`).

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
| `status` | `gift_posts_status_enum` NOT NULL | Không có mặc định — use case phải đặt tường minh |
| `total_quantity` | `integer` mặc định `1` | `CHECK > 0` |
| `remaining_quantity` | `integer` mặc định `1` | `CHECK >= 0 AND <= total_quantity` |
| `details` | `jsonb` mặc định `'{}'` | Trường riêng theo loại bài |
| `expires_at` | `timestamptz` NULL | |
| `renewed_count` | `integer` mặc định `0` | Số lần gia hạn |
| `selection_mode` | `posts_selection_mode_enum` NOT NULL | Mặc định `OPTIMAL` (`INSTANT` · `OPTIMAL` · `EXTENDED`) |
| `selection_deadline` | `timestamptz` NULL | Set khi có request đầu tiên |
| `like_count` | `integer` mặc định `0` | Denormalized đếm từ `post_likes` |

Bốn index, mỗi cái phục vụ một truy vấn cụ thể:

| Index | Truy vấn |
| --- | --- |
| `IDX_posts_location` (GiST) | Tìm quanh đây |
| `IDX_posts_author_status` | "Bài của tôi", lọc theo trạng thái |
| `IDX_posts_type_status_category` | Feed lọc theo loại + danh mục |
| `IDX_posts_expiry` `(status, expires_at)` | Job quét bài hết hạn |

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

### `post_likes`

Bảng lưu lượt thích bài đăng (toggle like/unlike).

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | Không có `global_id` |
| `user_id` | `uuid` NOT NULL | FK → `users(global_id)` |
| `post_id` | `uuid` NOT NULL | FK → `posts(global_id)` |
| `created_at` | `timestamptz` | |

- Ràng buộc `UNIQUE ("user_id", "post_id")` ngăn chặn việc một người dùng thích một bài đăng nhiều lần.
- Chỉ mục `INDEX ("post_id")` hỗ trợ tra cứu nhanh danh sách người thích một bài.
- Thao tác unlike thực hiện xoá cứng bản ghi khỏi bảng và giảm `posts.like_count` trong cùng transaction.

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
| `points` | `integer` | `CHECK >= 0` |
| `is_enabled` | `boolean` mặc định `true` | |
| `affects_lifetime` | `boolean` mặc định `true` | Có tính vào điểm tích luỹ xét rank không |
| `daily_cap` | `integer` NULL | `CHECK NULL OR >= 0`. NULL = không giới hạn |
| `version` | `integer` mặc định `1` | Đổi luật thì **thêm version mới**, không sửa dòng cũ |
| `updated_by` | `uuid` NULL | |
| `updated_at` | `timestamptz` | |

Seed: `PHONE_VERIFIED_FIRST_TIME` = 28 điểm (không cap), `REFERRAL_QUALIFIED` = 56 điểm
(cap 3/ngày).

### `point_ledger` — sổ cái, **chỉ ghi thêm**

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `user_id` | `uuid` | FK → `users(global_id)` **RESTRICT** |
| `rule_code` / `rule_version` | `varchar(100)` / `integer` | Chụp lại luật tại thời điểm ghi |
| `delta` | `integer` | Có thể âm |
| `balance_after` / `lifetime_after` | `integer` | `CHECK >= 0` — snapshot sau bút toán |
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

**Schema mục tiêu cho F83; chưa có migration.** Chi tiết luồng và idempotency tại
[CHECK-IN-STREAK-DESIGN](./plan/CHECK-IN-STREAK-DESIGN.md). Mọi ngày là `date` theo
`Asia/Ho_Chi_Minh`, timestamp vẫn lưu `timestamptz` UTC.

| Bảng | Cột/ràng buộc chính | Mục đích |
| --- | --- | --- |
| `check_in_entries` | `id`, `user_id` FK, `policy_date` DATE, `kind` NORMAL/REPAIR, `streak_run_id` FK, `streak_day`, `policy_version`, `created_at`; UNIQUE `(user_id,policy_date)` | Một dấu điểm danh/ngày; chỉ thêm |
| `check_in_runs` | `id`, `user_id` FK, `start_date`, `latest_covered_date`, `current_length`, `status` ACTIVE/AT_RISK/ENDED, `version` | Snapshot chuỗi; tính lại được từ entries |
| `check_in_milestone_awards` | `streak_run_id`, `milestone_days`, `point_ledger_id`, `policy_version`; UNIQUE `(streak_run_id,milestone_days)` | Một thưởng cho mỗi mốc/chuỗi |
| `repair_transaction_progress` | `user_id`, `transaction_id`, `cohort_id`, `policy_version`, `created_at`; UNIQUE `(user_id,transaction_id)` | Một giao dịch tặng/nhận quà hoàn tất chỉ tích một lần cho mỗi bên |
| `repair_credit_cohorts` | `id`, `user_id`, `policy_version`, `required_transactions`, `current_count`, `status` OPEN/CLOSED | Khóa ngưỡng của một nhóm giao dịch cho đến khi phát lượt |
| `repair_credit_ledger` | `id`, `user_id`, `event_type` ISSUE/SPEND/REVERSE, `delta`, `balance_after`, `reference_type/id`, `idempotency_key` UNIQUE, `policy_version`, `created_at` | Lượt bù phát/tiêu/đảo; append-only, số dư không âm |
| `check_in_policy_revisions` | `version` PK, `enabled`, `transactions_per_repair`, `repair_window_days`, `daily_points`, `milestones_json`, `effective_at`, `reason`, `created_by`, `created_at` | Policy có hiệu lực và audit; mốc duy nhất, tăng dần, điểm không âm |

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

Một `CHECK` gộp bắt mọi cột số phải `>= 0`. Giá trị seed:

| rank | threshold | warning | req. gifts | req. refs | maint. gifts | maint. refs | quota |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `VIEWER` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `MEMBER` | 224 | 157 | 0 | 0 | 0 | 0 | 3 |
| `SILVER` | 672 | 470 | 1 | 1 | 2 | 2 | 10 |
| `GOLD` | 896 | 627 | 0 | 0 | 3 | 3 | 20 |
| `DIAMOND` | 1792 | 1254 | 0 | 0 | 4 | 4 | 50 |

### `rank_transitions`

Lịch sử đổi hạng: `id` (BIGSERIAL), `user_id` (FK RESTRICT), `from_rank`, `to_rank`
(`users_rank_enum`), `reason` (`varchar(100)`), `lifetime_points`, `cycle_id` (`bigint` NULL),
`actor`, `created_at`.

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

Mười khoá seed sẵn:

| Khoá | Giá trị |
| --- | --- |
| `discovery.default_radius_meters` | 5 000 |
| `discovery.min_radius_meters` | 100 |
| `discovery.max_radius_meters` | 50 000 |
| `group.default_radius_meters` | 10 000 |
| `group.min_radius_meters` | 1 000 |
| `group.max_radius_meters` | 50 000 |
| `affiliate.active_member_window_days` | 90 |
| `rank.maintenance_period_months` | 3 |
| `point.referral_daily_cap` | 3 |
| `point.transaction_daily_cap` | 5 |

### `config_bundles` / `config_revisions`

`config_bundles`: `id` (BIGSERIAL), `code` + `version` (UNIQUE), `status`
(`DRAFT`/`PUBLISHED`/`ARCHIVED`), `effective_from`/`effective_to`, `created_at`.

`config_revisions`: `id`, `bundle_id` (FK RESTRICT), `scope` (`varchar(50)`, ví dụ
`ENTITLEMENT`), `status`, `effective_from`/`effective_to`, `change_reason`, `created_at`.
Cùng ràng buộc `EXCLUDE` như trên, nhưng khoá theo `scope`.

Seed: bundle `M6_BASE_POLICY` v1 với một revision `scope = 'ENTITLEMENT'`.
Migration sau đó bổ sung `DISCOVERY_RADIUS` vào revision đang hiệu lực và giữ
nguyên các revision lịch sử.

### `capability_policies` / `capability_rank_values`

`capability_policies`: `id`, `revision_id` (FK RESTRICT), `code` (`varchar(100)`),
`enabled` (mặc định `true`). UNIQUE `(revision_id, code)`.

`capability_rank_values`: `id`, `policy_id` (FK **CASCADE**), `rank` (`users_rank_enum`),
`allowed` (`boolean`), `limit_value` (`integer` NULL, `CHECK NULL OR >= 0`).
UNIQUE `(policy_id, rank)`.

Sáu capability seed sẵn, giá trị theo rank:

| Capability | VIEWER | MEMBER | SILVER | GOLD | DIAMOND |
| --- | --- | --- | --- | --- | --- |
| `POST_OFFER` | ✗ | 3 | 10 | 20 | 50 |
| `POST_WANTED` | ✗ | 3 | 10 | 20 | 50 |
| `SELECT_REQUESTER` | ✗ | 1 | 3 | 5 | 10 |
| `POST_SOS` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `CREATE_GROUP` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `SUBMIT_CHARITY_PROPOSAL` | ✗ | ✗ | ✗ | ✗ | ✓ |
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

Ba vai và tám quyền seed sẵn:

| Quyền | SUPER_ADMIN | POLICY_ADMIN | AUDITOR |
| --- | --- | --- | --- |
| `config.read` — xem cấu hình hệ thống | ✓ | ✓ | |
| `config.write` — tạo và publish cấu hình | ✓ | ✓ | |
| `entitlement.read` — xem chính sách quyền/quota theo rank | ✓ | ✓ | |
| `entitlement.write` — publish chính sách quyền/quota | ✓ | ✓ | |
| `audit.read` — xem audit log | ✓ | | ✓ |
| `admin.manage` — quản lý role và permission | ✓ | | |
| `notification.manage` — cấu hình kênh email/SMS/Zalo | ✓ | | |

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

### `gift_transactions`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `BIGSERIAL` PK | |
| `global_id` | `uuid` UNIQUE | |
| `post_id` | `uuid` | FK → `posts(global_id)` RESTRICT |
| `giver_id` / `receiver_id` | `uuid` | FK → `users(global_id)` RESTRICT |
| `quantity` | `integer` mặc định `1` | `CHECK > 0` |
| `status` | `varchar(20)` mặc định `'REQUESTED'` | `REQUESTED` · `ACCEPTED` · `DELIVERING` · `COMPLETED` · `CANCELLED` · `REJECTED` |
| `requested_at` | `timestamptz` mặc định `now()` | |
| `accepted_at` / `completed_at` / `closed_at` | `timestamptz` NULL | |
| `close_reason` | `varchar(200)` NULL | |

Ba ràng buộc đáng chú ý, tất cả đặt ở schema chứ không chỉ ở tầng nghiệp vụ:

- `CHK_gift_transactions_not_self`: `giver_id <> receiver_id`. Tự tặng cho chính mình là
  đường farm điểm rẻ nhất.
- `CHK_gift_transactions_completed_at`: `(status = 'COMPLETED') = (completed_at IS NOT NULL)`
  — tương đương hai chiều. Bộ đếm hoạt động rank đếm theo `completed_at`; thiếu nó thì giao
  dịch **vô hình với rank**.
- `UQ_gift_transactions_open_request`: unique một phần trên `(post_id, receiver_id)`
  `WHERE status IN ('REQUESTED','ACCEPTED','DELIVERING')` — một người chỉ được có **một yêu
  cầu đang mở** trên cùng một bài. Không có nó thì bấm nhiều lần là chiếm hết suất người khác.

Ba index, mỗi cái cho một truy vấn thật: `(post_id, status)` cho màn hình bài,
`(giver_id, completed_at)` cho bộ đếm rank, `(status, accepted_at)` cho job tự hoàn tất.

---

## 9. Bất biến rút gọn

Những điều schema tự cưỡng chế — nếu một thay đổi làm gãy một trong số này, kế hoạch sai
chứ không phải ràng buộc sai:

| # | Bất biến | Cưỡng chế bằng |
| --- | --- | --- |
| 1 | Sổ cái điểm không sửa, không xoá | Trigger `prevent_point_ledger_mutation` |
| 2 | Audit log không sửa, không xoá | Trigger `prevent_admin_audit_mutation` |
| 3 | Một người chỉ được giới thiệu một lần, thưởng đúng một lần | UNIQUE `referee_id` + trigger |
| 4 | Không tự tặng, không tự giới thiệu chính mình | `CHECK` trên hai bảng |
| 5 | Một yêu cầu đang mở cho mỗi (bài, người nhận) | Unique index một phần |
| 6 | Tại mỗi thời điểm chỉ một bản cấu hình `PUBLISHED` | `EXCLUDE USING gist` (cần `btree_gist`) |
| 7 | `remaining_quantity` luôn trong `[0, total_quantity]` | `CHECK` |
| 8 | Username/email duy nhất không phân biệt hoa thường | Unique index trên `LOWER()` |
| 9 | Bật kênh gửi thì phải có secret | `CHECK` trên `notification_channels` |
| 10 | Xoá người dùng không làm bốc hơi sổ cái/giao dịch | FK `RESTRICT` |

---

## 10. Chỗ cần biết trước khi viết query

- **Join bằng `global_id`, không bằng `id`.** Mọi FK trong schema này trỏ tới `global_id`.
- **Không phải quan hệ nào cũng có FK.** `posts.author_id`, `user_sessions.user_id`,
  `gift_posts.giver_id`, `categories.parent_id` là uuid trần, không ràng buộc. Phải tự
  kiểm tra tồn tại ở tầng use case.
- **`deleted_at` phải tự lọc.** `find()` của TypeORM **không** tự bỏ bản ghi đã xoá mềm.
- **`posts.status` dùng enum tên `gift_posts_status_enum`.** Tên mang tiền tố lịch sử.
- **`gift_posts` không phải nguồn sự thật nữa.** Đọc/ghi ở `posts`.
