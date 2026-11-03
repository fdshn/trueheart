# Mô hình dữ liệu

Một database PostgreSQL + PostGIS. Bản thiết kế đầu (15/09) dự kiến khoảng 25 bảng; schema
thật nay đã lớn hơn nhiều (chat trực tiếp, feed, chiến dịch từ thiện, công đức, bảng xếp hạng,
attribution…) — **không ghi số bảng ở đây**, đếm bằng câu SQL trong
[`../DATABASE.md`](../DATABASE.md). Đây là bản thiết kế để thống nhất trước khi code — DDL thật
nằm trong migration. Tên bảng/cột dưới đây đã được đối chiếu lại với migration tới
`1802300000000-CreateAttribution` (03/11/2026).

> Muốn biết **thật sự đang có bảng gì** sau khi migrate, xem
> [`../DATABASE.md`](../DATABASE.md). File này là thiết kế, file kia là schema đang chạy.

**Đổi bảng thì luôn qua migration**, không bao giờ `synchronize`:

```bash
cd suites/chantam.vn/chantam/core
npm run migration:generate -- TenKieuPascalCase   # tự cập nhật barrel
npm run migration:run
```

Đọc lại file sinh ra trước khi commit — TypeORM sinh `DROP COLUMN` / `ALTER TYPE` mà không
cảnh báo gì.

## Sơ đồ quan hệ chính

```
users ──┬──< posts ──< post_media
        │      │
        │      ├──< gift_requests          (chọn được người → use case tạo lượt trao)
        │      │
        │      └──< gift_transactions ──┬──< chat_rooms ──< chat_messages
        │              │                 │   (TRANSACTION; thêm DIRECT_POST/DIRECT_USER không lượt trao)
        │              ├──< transaction_reviews
        │              └──  recipient_selection_audits (1–1)
        │
        ├──< point_ledger >── point_rules
        ├──< referrals ──< attribution_claims
        ├──< attribution_links ──< attribution_clicks ──< attribution_resolutions
        ├──< rank_maintenance_cycles
        ├──< notifications
        ├──< reports
        │
        └──< group_memberships >── groups ──< sub_teams
                                     │
                                     └──< affiliate_events ──< affiliate_rewards
```

---

## 1. Người dùng

| Bảng | Cột đáng chú ý |
| --- | --- |
| `users` | `global_id` · `username` · `password_hash` · `email?` · `phone?` · `full_name?` · `avatar_url?` · **`default_location` geography** · `rank` · `status` · `phone_verified_at` · `suspended_until` · `deleted_at` |
| `user_sessions` | `refresh_token_hash` · `device_id` · **`fcm_token`** · `expires_at` · `revoked_at` |
| `referrals` | `referrer_id` · `referee_id` **UNIQUE** · `code` — bản ghi **bất biến**, không sửa không xoá |
| `rank_maintenance_cycles` | `user_id` · `rank` · `cycle_start` · `cycle_end` · `gifts_done` · `referrals_done` · `status` · `required_gifts` · `required_referrals` · `policy_version` |
| `attribution_links` · `attribution_clicks` · `attribution_resolutions` · `attribution_claims` · `attribution_audit_events` | Deferred attribution (`1802300000000`): link → lượt mở (token riêng) → resolve theo bản cài → claim gắn người giới thiệu. `attribution_claims.referred_user_id` **UNIQUE**; claim `QUALIFIED` ghi một dòng `referrals` chứ không tự phát thưởng. IP/UA/installId chỉ lưu dạng hash |

**Gộp hồ sơ vào `users`, không tách bảng riêng.** Đây là monolith một database; tách ra chỉ
thêm một join cho mọi truy vấn mà không đổi được gì.

`fcm_token` nằm ở `user_sessions` chứ không ở `users`: một người có nhiều thiết bị, và đăng
xuất phải xoá token **của đúng thiết bị đó** ([F04](../FEATURES.md#f04--đăng-xuất--thu-hồi-phiên)).

`rank_maintenance_cycles` theo dõi tiến độ nhiệm vụ chu kỳ 3 tháng (Bạc 2+2, Vàng 3+3, Kim Cương 4+4) theo BR-PROF-RANK-03. Theo CHỐT-01, khi không đạt nhiệm vụ hoặc balance giảm dưới ngưỡng, hệ thống tự đánh giá lại theo current balance (không bắt buộc chỉ tụt 1 bậc).

`email` và `phone` dùng **index duy nhất một phần** (`WHERE ... IS NOT NULL`). Đăng ký chỉ
cần username (F01) nên phần lớn tài khoản bỏ trống hai cột này — ràng buộc duy nhất thường
sẽ chặn tài khoản thứ hai có `NULL`.

`accuracy_percent` và `accuracy_samples` từng **hoãn sang M4** cùng với Giver Accuracy — thêm cột
chưa ai dùng chỉ làm migration dài ra. Nay đã có, tên thật là `users.giver_accuracy_percent` /
`giver_accuracy_samples` / `accuracy_review_required` (thêm cùng `transaction_reviews`,
`1792600000000`).

---

## 2. Nội dung

| Bảng | Cột đáng chú ý |
| --- | --- |
| `categories` | `parent_id` (cây) · `slug` · `icon` · `sort_order` · `is_active` — **không xoá cứng**, chỉ tắt |
| `posts` | `post_type` · `author_id` · `category_id` · `title` · `description` · **`location` geography** · `area_label` · `status` · `expires_at` · `renewed_count` · `total_quantity` · `remaining_quantity` · `details` jsonb |
| `post_media` | `post_id` · `r2_key` · `sort_order` |

### Một bảng `posts` cho cả 5 loại nội dung

`post_type` ∈ `OFFER` · `WANTED` · `CHARITY` · `CLASSIFIED` · `MERIT`

**Vì sao không tách 5 bảng:** cả 5 dùng chung vòng đời, danh mục, vị trí, ảnh, kiểm duyệt,
quota và cách hiển thị trên bản đồ. Tách ra sẽ thành 5 máy trạng thái gần giống hệt nhau và
5 truy vấn bản đồ phải `UNION` — nhiều việc hơn mà không rõ ràng hơn.

Phần riêng của từng loại để trong `details` jsonb:

| Loại | `details` chứa |
| --- | --- |
| `OFFER` | `condition`, `estimated_value` |
| `CLASSIFIED` | `reference_price`, `sale_price` |
| `CHARITY` | `event_start`, `event_end`, `approved_by` |
| `MERIT` | `verified_org_id`, `qr_url` |

---

## 3. Giao dịch

| Bảng | Cột đáng chú ý |
| --- | --- |
| `gift_requests` | `post_id` · `requester_id` · `message` · `status` · `queue_joined_at` · `offering_post_id?` — **UNIQUE(post_id, requester_id) WHERE deleted_at IS NULL** |
| `gift_transactions` | `global_id` · `post_id` · `giver_id` · `receiver_id` · `quantity` · `status` · `accepted_at` · `handed_over_at` · `completed_at` · `closed_at` · `closed_by` · `close_reason` |
| `recipient_selection_audits` | PK `transaction_id` (1–1 với lượt trao do job tự chọn) · `deciding_criterion` · `criteria_order` · `winner_metrics` · `runner_up_metrics` · `candidate_count` — lý do chọn, ghi cùng transaction với lượt trao |

> Bản thiết kế gọi bảng lượt trao là `transactions` với `request_id`, `auto_complete_at`,
> `cancel_reason`. Bảng thật là `gift_transactions`: **không** có `request_id` (không FK tới
> `gift_requests`), **không** có `auto_complete_at` (job tự hoàn tất quét index
> `(status, accepted_at)`), lý do đóng là `close_reason` + `closed_by`.

**Bản thiết kế lịch sử và hiện trạng cần đối chiếu** ([F75](../FEATURES.md#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm)):

| Cột dự kiến | Ở đâu | Vì sao |
| --- | --- | --- |
| `selection_deadline_at` | `posts` | Mốc hết countdown 7 ngày; cron quét `WHERE selection_deadline_at < now()` thay vì tính lại |
| `reference_value_vnd` | `posts` | Giá trị tham khảo người cho khai, cơ sở tính số điểm cần |
| `delivery_method` | `posts` | `SELF_PICKUP` hoặc `GIVER_SHIPS` |
| `redeemed_by` · `redeemed_at` | `posts` hoặc `gift_transactions` | Đánh dấu bài đã bị chốt bằng điểm, để auto-select **không** chạy nữa |

> Tới `main` commit `0dee943`, `posts.selection_deadline` đã có (không phải
> `selection_deadline_at`), giá nằm ở `posts.details ->> 'estimatedValue'` (bảng `posts` không có
> cột `estimated_value`; cột đó chỉ còn ở bảng cũ `gift_posts`), và `delivery_method` đã có.
> `redeemed_by`/`redeemed_at` **chưa có**; `selection_deadline = NULL` sau accept chỉ chứng
> minh đồng hồ dừng, không ghi lý do chốt. Không tạo thêm các cột tên dự kiến ở bảng trên
> một cách máy móc. Thiết kế dấu `REDEEMED` bền vững và cancellation policy trong
> [handoff backend](./REDEMPTION-REQUIREMENT-GAP.md).

> Dừng countdown phải là **trạng thái ghi xuống database**, không phải việc huỷ một timer
> trong tiến trình. Deploy nhiều replica thì timer trong bộ nhớ chết theo tiến trình, còn
> cron của replica khác vẫn chạy auto-select trên bài đã có người đổi điểm.

Ràng buộc UNIQUE đặt ở **tầng database**, không chỉ kiểm trong code — hai request gửi cùng
lúc sẽ lọt qua mọi phép kiểm ở tầng ứng dụng ([F30](../FEATURES.md#f30--gửi-yêu-cầu-xin-nhận)).

Thiết kế ban đầu: `auto_complete_at` = `accepted_at + 5 ngày`, lưu sẵn để cron chỉ cần quét
`WHERE auto_complete_at < now()`. Bản dựng thật không có cột này — job tính hạn từ
`accepted_at` và dựa vào index `(status, accepted_at)`.

---

## 4. Chat

| Bảng | Cột đáng chú ý |
| --- | --- |
| `chat_rooms` | `room_type` (`TRANSACTION` · `DIRECT_POST` · `DIRECT_USER`) · `transaction_id` **UNIQUE**, NULL với hai loại trực tiếp · `post_id` NULL với `DIRECT_USER` · `created_by` (chỉ `DIRECT_USER`) · `UQ_chat_rooms_direct_post (post_id, receiver_id, giver_id)` · `UQ_chat_rooms_direct_user (LEAST, GREATEST)` · `status` (`OPEN` · `READ_ONLY`) |
| `user_blocks` | PK `(blocker_id, blocked_id)` · `CHK_user_blocks_not_self` · hiệu lực xét hai chiều |
| `chat_messages` | `room_id` · `sender_id` · `body` · `media_count` · `recalled_at` · `created_at` — append-only bằng trigger, trừ thu hồi và dọn theo hạn |
| `chat_message_media` · `chat_message_flags` | Ảnh đính kèm (tối đa 3); cờ kiểm duyệt từ khoá chờ Admin xem |

Phòng `TRANSACTION` gắn 1-1 với giao dịch, **chỉ tạo khi giao dịch đạt `ACCEPTED`**. Không có
chat với ứng viên trong hàng đợi.

Từ 25/10 (PR #46) có thêm phòng `DIRECT_POST` cho Rao vặt: không có giao dịch, mỗi bộ (bài,
người mua, người bán) đúng một phòng; `giver_id` là người bán, `receiver_id` là người mua.
`CHK_chat_rooms_type_transaction` buộc `TRANSACTION` có `transaction_id` và `DIRECT_POST` thì
không.

Từ 30/10 có thêm phòng `DIRECT_USER`: hai người nhắn thẳng, không giao dịch, không bài. Mỗi cặp
người đúng một phòng (unique index trên `LEAST(giver_id, receiver_id)`,
`GREATEST(giver_id, receiver_id)`); repository lưu id nhỏ ở `giver_id`. `CHK_chat_rooms_type_post`
buộc `DIRECT_USER` không có `post_id` và loại khác thì có; `CHK_chat_rooms_direct_user_creator`
buộc `created_by` có đúng ở `DIRECT_USER` — cột đếm giới hạn phòng mới mỗi ngày
(`chat.direct_user_daily_limit`). `users.allow_stranger_messages` (mặc định `true`) là cài đặt
"Cho phép người lạ nhắn tin".

---

## 5. Điểm & đánh giá

| Bảng | Cột đáng chú ý |
| --- | --- |
| `point_rules` | `code` · `points` · `is_enabled` · `daily_cap` · **`version`** · `updated_by` |
| `point_ledger` | `user_id` · `rule_code` · `delta` · `balance_after` · **`lifetime_after`** · `reference_type` · `reference_id` · **`idempotency_key` UNIQUE** · `actor` · `source` |
| `transaction_reviews` | `transaction_id` · `reviewer_id` · `reviewee_id` · `reviewer_role` · `rating` (1–5) · `accuracy_percent` (chỉ người nhận) · `comment` · `edited_at` + `previous_*` (sửa đúng một lần) |

**Đổi vật phẩm bằng điểm** ([F75](../FEATURES.md#f75--countdown-7-ngày--đổi-vật-phẩm-bằng-điểm),
[F77](../FEATURES.md#f77--ledger-cho-giao-dịch-đổi-điểm)):

- Giao dịch đổi điểm là một bút toán `point_ledger` với `rule_code = 'ITEM_REDEMPTION'`,
  `delta` âm, `reference_type/reference_id` trỏ về bài đăng.
- `idempotency_key` **bắt buộc** — bấm hai lần, retry mạng hay job chạy lại đều không được
  trừ điểm hai lần.
- **Điểm khả dụng là giá trị dẫn xuất, không phải cột mới**:
  `balance − minimum_point(rank hiện tại)`. Ngưỡng lấy từ `rank_tiers`, nên Admin đổi ngưỡng
  là điểm khả dụng đổi theo, không cần backfill.
- Tỷ lệ quy đổi điểm ↔ VNĐ nằm trong cấu hình động của Admin, **không hard-code**.

> Công thức điểm khả dụng trên là **yêu cầu đích ngày 2026-10-04**, chưa được POST
> kiểm. Ledger debit và chốt request hiện nằm trong hai transaction khác nhau, có bút
> toán hoàn bù khi chốt lỗi. Implementation mới cần cùng một transaction và kiểm balance
> sau khóa; không chỉ thêm cột hay sửa quote. Xem [handoff](./REDEMPTION-REQUIREMENT-GAP.md).

**Quy tắc xét Rank theo điểm (SRS v1.15.0 - CHỐT-01 & BR-PROF-RANK-06):**
- Điểm dùng để xét Rank là **số dư Điểm Cống hiến hiện tại (`balance_after`)**. Phase 1 không dùng một `lifetime rank point` riêng để giữ hạng; khi balance giảm thì hệ thống tự động xác định lại Rank.
- Cột `lifetime_after` (tổng điểm luỹ kế đã tích luỹ) vẫn được lưu trong ledger để phục vụ thống kê, báo cáo và audit, nhưng không dùng để khóa cố định rank khi người dùng đã giảm điểm.

`version` trên `point_rules` là bắt buộc: khi Admin đổi rule, bút toán cũ phải tra được nó ra
đời dưới phiên bản nào.

**F83 — điểm danh/streak (đã dựng ở `1797100000000`):** `check_in_entries` (UNIQUE
`user_id,policy_date`), `check_in_runs`, `check_in_milestone_awards` (UNIQUE
`run_id,milestone_days`), `repair_transaction_progress` (UNIQUE
`user_id,transaction_id`), `repair_credit_cohorts`, `repair_credit_ledger` append-only và
`check_in_policy_revisions`. `point_ledger` vẫn là nguồn sự thật cho điểm ngày/thưởng
mốc; credit ledger chỉ theo dõi lượt bù. Xem [schema mục tiêu](../DATABASE.md#điểm-danh-streak-và-lượt-bù).

Giver Accuracy: Người nhận chấm theo % (0–100%). Lưu vào `transaction_reviews.accuracy_percent` và tính tổng hợp vào `users.giver_accuracy_percent` (kèm `users.giver_accuracy_samples`). Chỉ hiển thị và xét cảnh báo khi số mẫu `>= 5`; dưới 75% bật cờ `users.accuracy_review_required` (CHỐT-03).

---

## 6. Group & affiliate

| Bảng | Cột đáng chú ý |
| --- | --- |
| `groups` | `owner_id` · `name` · **`center_location` geography** · **`radius_km`** (1–50) · **`invite_code` UNIQUE** · `status` |
| `group_memberships` | `group_id` · `user_id` — **một dòng `ACTIVE` mỗi người** · `sub_team_id?` · `role` · `joined_at` · `status` |
| `sub_teams` | `group_id` · `name` |
| `group_role_permissions` | `role` · `permission` · `version` — quyền theo vai, có phiên bản |
| `affiliate_policy_revisions` | `version` · `enabled` · `distribution_mode` · `event_points_json` · trần/ngày · trần người hưởng |
| `affiliate_events` | `group_id` · `source_user_id` · `event_type` · `reference_type` · `reference_id` · `geo_status` · `location_source` · **`distance_meters`** · **`radius_meters`** · `policy_version` |
| `affiliate_rewards` | `event_id` · `beneficiary_user_id` · `point_ledger_id?` · `reward_status` · `point_delta` · `idempotency_key` |

> Thiết kế đầu có bảng `group_invites` riêng; bản dựng thật **không có** — mã mời là cột
> `groups.invite_code`. `group_members` dựng thành `group_memberships`; `sub_teams` không có
> `lead_id` (vai `SUBTEAM_ADMIN` nằm ở `group_memberships.role`). `affiliate_events` không lưu
> toạ độ sự kiện mà lưu nguồn vị trí đã dùng (`location_source`) cùng khoảng cách/bán kính.

`user_id` unique **toàn cục** (không phải unique theo group) trên các dòng `ACTIVE`
(`UQ_group_memberships_one_active_per_user`): mỗi người tối đa 1 Group
([F51](../FEATURES.md#f51--quyền-tạo-group)).

`center_location` và `radius_km` là **bản chụp lúc tạo Group**, Owner không sửa được — nếu sửa
được, người ta sẽ dời vùng theo nơi đang có nhiều sự kiện.

`affiliate_events` lưu cả `distance_meters` lẫn `radius_meters` tại thời điểm xét. Không lưu
thì tranh chấp về sau không có cách nào tra lại ([F58](../FEATURES.md#f58--thứ-tự-ưu-tiên-vị-trí--audit)).

Mốc hoạt động phục vụ [GĐ-2](./ASSUMPTIONS.md#gđ-2--active-member--group-affiliate-geo) là
`users.last_active_at` (một cột cho mọi nơi), không phải `last_activity_at` trên thành viên nhóm.

---

## 7. Thông báo, báo cáo, quản trị

| Bảng | Cột đáng chú ý |
| --- | --- |
| `notification_templates` | `type` UNIQUE · `title` · `body` · `is_enabled` |
| `notifications` | `user_id` · `type` · `title` · `body` · `target_type` · `target_id` · `idempotency_key` · `read_at` |
| `notification_mutes` · `notification_broadcasts` | Nhóm thông báo người dùng đã tắt; Admin gửi hàng loạt (`ALL`/`GROUP`/`AREA`) |
| `reports` | `reporter_user_id` · `target_type` · `target_id` · `reason` · `evidence_urls` · `status` · `reviewed_by_user_id` |
| `admin_audit_logs` | `actor_user_id` · `action` · `resource_type` · `resource_id` · `before_json` · `after_json` · `reason` — append-only, gánh cả vai `moderation_actions`/`audit_logs` của thiết kế đầu |
| `home_campaign_configs` | `campaign_name` · `theme_config` · `marquee_text` · `popup_config` · `floating_banner` · `banners` · `sections_order` · `start_time` · `end_time` · `is_active` |
| `campaigns` | `campaign_type` (`INDIVIDUAL_APPEAL`/`ORGANIZED_CAMPAIGN`) · `beneficiary_relation` · `created_by` (organizer) · `approval_status` · `start_time`/`end_time` · `allow_over_target` |
| `campaign_beneficiaries` | 1–1 với chiến dịch — thông tin người thụ hưởng **riêng tư**, bảng riêng để đường đọc công khai không lộ |
| `campaign_need_items` | `campaign_id` · `category_id` · `item_name` · `unit` · `target_quantity` · projection `accepted_quantity`/`received_quantity` · `allow_alternative` |
| `campaign_contributions` | `campaign_id` · `contributor_id` · `status` · giao nhận · ghi chú · timestamps |
| `campaign_contribution_items` | `contribution_id` · `need_item_id` · `offered_quantity` · `accepted_quantity` · quyết định/lý do |
| `campaign_deliveries` | `campaign_id` · `contribution_id` UNIQUE · `contributor_id` · `organizer_id` · `status` (`ACCEPTED`/`COMPLETED`/`CANCELLED`) |
| `campaign_delivery_items` | `delivery_id` · `contribution_item_id` · `need_item_id` · `accepted_quantity` · `received_quantity` — thay cho `campaign_transaction_items` của thiết kế đầu (giao nhận chiến dịch **không** đi qua `gift_transactions`) |
| `campaign_external_contributions` | `campaign_id` · `need_item_id` · `quantity` · `source_label` · `evidence_note` · `received_at` · `recorded_by` · `status` (`ACTIVE`/`VOIDED`) · `replaces_id` |
| `campaign_media` · `campaign_participations` · `campaign_coordinators` · `campaign_schedule_changes` · `campaign_reviews` | Ảnh/video chiến dịch · đăng ký tham gia · người điều phối · lịch sử gia hạn (append-only) · đánh giá sau chiến dịch |
| `point_ledger` (charity) | event `CHARITY_CONTRIBUTION_COMPLETED` · reference `campaign_contribution_id` UNIQUE theo user/event · rule version · delta cố định do Admin cấu hình |
| `blogs` | `title` · `slug` · `category` · `thumbnail_url` · `content_html` · `is_published` · `published_at` |

---

## Máy trạng thái

### Bài đăng

```
DRAFT ──▶ PENDING_REVIEW ──┬──▶ REJECTED
                            │
                            └──▶ PUBLISHED ──┬──▶ RESERVED ──▶ COMPLETED
                                              │
                                              ├──▶ EXPIRED ──▶ ARCHIVED
                                              └──▶ CANCELLED
```

- `PUBLISHED → RESERVED` khi `remaining_quantity = 0`
- `→ EXPIRED` sau 3 tháng không có người nhận; gia hạn **tối đa 1 lần**
- `EXPIRED → ARCHIVED` khi chuyển về kho từ thiện ([F23](../FEATURES.md#f23--chuyển-vật-phẩm-về-điểm-từ-thiện))

### Yêu cầu xin nhận

```
PENDING ──┬──▶ SELECTED  (được chọn → sinh transaction)
          ├──▶ STANDBY   (người khác được chọn) ──▶ SELECTED (khi giao dịch trước bị huỷ)
          └──▶ WITHDRAWN (người xin tự rút)
```

`STANDBY → SELECTED` **cần người cho xác nhận**, hệ thống chỉ gợi ý
([F33](../FEATURES.md#f33--hàng-đợi-dự-phòng)).

> Enum thật `gift_requests_status_enum`: `PENDING` · `ACCEPTED` · `REJECTED` · `CANCELLED` ·
> `WITHDRAWN` · `STANDBY` — "được chọn" ghi là `ACCEPTED`, không phải `SELECTED`.

### Giao dịch

```
ACCEPTED ──┬──▶ COMPLETED   (người nhận xác nhận, HOẶC tự động sau 5 ngày)
           └──▶ CANCELLED   (người cho huỷ → mở lại hàng đợi)
```

> Bảng thật `gift_transactions` còn trạng thái trung gian `DELIVERING`; `CHK_gift_transactions_live_status`
> chỉ cho `ACCEPTED` · `DELIVERING` · `COMPLETED` · `CANCELLED`.

### Thứ hạng — theo [GĐ-3](./ASSUMPTIONS.md#gđ-3--cơ-chế-rank--tụt-hạng)

```
đủ điểm mốc kế tiếp ────────▶ lên hạng
đạt nhiệm vụ duy trì quý ───▶ giữ hạng
trượt nhiệm vụ duy trì ─────▶ tụt đúng 1 bậc
```

---

## Bốn chỗ dễ làm sai

### 1 · Trừ tồn kho phải nguyên tử

```sql
UPDATE posts SET remaining_quantity = remaining_quantity - 1
WHERE id = :id AND remaining_quantity > 0
RETURNING remaining_quantity;
```

**Không đọc-rồi-ghi ở tầng ứng dụng.** Một nghìn người xin cùng lúc sẽ phát vượt kho.

### 2 · Không bao giờ `UPDATE` số dư điểm

Sai thì ghi bút toán âm (reversal). `point_ledger` là nguồn sự thật duy nhất; mọi cách khác
đều làm số dư và lịch sử lệch nhau, và không có cách nào phát hiện.

Mọi lần ghi phải có `idempotency_key` — retry của client không được cộng điểm hai lần.

### 3 · Thứ tự ưu tiên vị trí khi xét affiliate

```
vị trí sự kiện → vị trí giao dịch → vị trí bài đăng → Default Location
```

Không có cái nào hợp lệ thì **chưa đủ điều kiện** — không mặc định cho qua.

### 4 · Toạ độ ra kênh công khai

Đã có sẵn trong `kernel/persistency-lib/geo`, dùng lại chứ đừng viết mới:

| Hàm | Dùng khi |
| --- | --- |
| `applyGeoJitter(point, globalId)` | Mọi toạ độ trả cho người chưa được duyệt nhận |
| `bucketDistance(meters)` | Mọi khoảng cách trả ra công khai — chặn giải tam giác |
| `GeoQueryHelper.applyRadiusFilter()` | Truy vấn bán kính (`ST_DWithin`) |
| `GeoQueryHelper.applyBoundingBox()` | Khung nhìn bản đồ |

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 25 bảng, 4 máy trạng thái |
| 2026-11-03 | Đối chiếu tên bảng/cột với migration tới `1802300000000`: `transactions` → `gift_transactions`, `reviews` → `transaction_reviews`, `group_members` → `group_memberships`, bỏ `group_invites` (mã mời ở `groups.invite_code`), `moderation_actions`/`audit_logs` → `admin_audit_logs`, `blog_posts` → `blogs`, `campaign_transaction_items` → `campaign_deliveries` + `campaign_delivery_items`; thêm `attribution_*`, `recipient_selection_audits`; bỏ con số tổng bảng |
