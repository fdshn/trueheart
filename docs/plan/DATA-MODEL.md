# Mô hình dữ liệu

~25 bảng, một database PostgreSQL + PostGIS. Đây là bản thiết kế để thống nhất trước khi
code — DDL thật nằm trong migration.

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
        │      └──< gift_requests ──┐
        │                            │
        ├──< transactions >──────────┘──< chat_rooms ──< chat_messages
        │         │
        │         └──< reviews
        │
        ├──< point_ledger >── point_rules
        ├──< referrals
        ├──< rank_maintenance_cycles
        ├──< notifications
        ├──< reports
        │
        └──< group_members >── groups ──< sub_teams
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
| `rank_maintenance_cycles` | `user_id` · `rank` · `cycle_start` · `cycle_end` · `gifts_done` · `referrals_done` · `passed` |

**Gộp hồ sơ vào `users`, không tách bảng riêng.** Đây là monolith một database; tách ra chỉ
thêm một join cho mọi truy vấn mà không đổi được gì.

`fcm_token` nằm ở `user_sessions` chứ không ở `users`: một người có nhiều thiết bị, và đăng
xuất phải xoá token **của đúng thiết bị đó** ([F04](../FEATURES.md#f04--đăng-xuất--thu-hồi-phiên)).

`rank_maintenance_cycles` theo dõi tiến độ nhiệm vụ chu kỳ 3 tháng (Bạc 2+2, Vàng 3+3, Kim Cương 4+4) theo BR-PROF-RANK-03. Theo CHỐT-01, khi không đạt nhiệm vụ hoặc balance giảm dưới ngưỡng, hệ thống tự đánh giá lại theo current balance (không bắt buộc chỉ tụt 1 bậc).

`email` và `phone` dùng **index duy nhất một phần** (`WHERE ... IS NOT NULL`). Đăng ký chỉ
cần username (F01) nên phần lớn tài khoản bỏ trống hai cột này — ràng buộc duy nhất thường
sẽ chặn tài khoản thứ hai có `NULL`.

`accuracy_percent` và `accuracy_samples` **hoãn sang M4** cùng với Giver Accuracy — thêm cột
chưa ai dùng chỉ làm migration dài ra.

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
| `gift_requests` | `post_id` · `requester_id` · `message` · `status` — **UNIQUE(post_id, requester_id)** |
| `transactions` | `global_id` · `post_id` · `giver_id` · `receiver_id` · `request_id` · `status` · `accepted_at` · **`auto_complete_at`** · `cancel_reason` |

Ràng buộc UNIQUE đặt ở **tầng database**, không chỉ kiểm trong code — hai request gửi cùng
lúc sẽ lọt qua mọi phép kiểm ở tầng ứng dụng ([F30](../FEATURES.md#f30--gửi-yêu-cầu-xin-nhận)).

`auto_complete_at` = `accepted_at + 5 ngày`, lưu sẵn để cron chỉ cần quét
`WHERE auto_complete_at < now()` — không phải tính lại mỗi lần.

---

## 4. Chat

| Bảng | Cột đáng chú ý |
| --- | --- |
| `chat_rooms` | `transaction_id` **UNIQUE** · `is_readonly` |
| `chat_messages` | `room_id` · `sender_id` · `body` · `created_at` |

Phòng chat gắn 1-1 với giao dịch, **chỉ tạo khi giao dịch đạt `ACCEPTED`**. Không có chat với
ứng viên trong hàng đợi.

---

## 5. Điểm & đánh giá

| Bảng | Cột đáng chú ý |
| --- | --- |
| `point_rules` | `code` · `points` · `is_enabled` · `daily_cap` · **`version`** · `updated_by` |
| `point_ledger` | `user_id` · `rule_code` · `delta` · `balance_after` · **`lifetime_after`** · `reference_type` · `reference_id` · **`idempotency_key` UNIQUE** · `actor` · `source` |
| `reviews` | `transaction_id` · `reviewer_id` · `reviewee_id` · `quality_rating` · `value_percent` · `accuracy_percent` |

**Quy tắc xét Rank theo điểm (SRS v1.15.0 - CHỐT-01 & BR-PROF-RANK-06):**
- Điểm dùng để xét Rank là **số dư Điểm Cống hiến hiện tại (`balance_after`)**. Phase 1 không dùng một `lifetime rank point` riêng để giữ hạng; khi balance giảm thì hệ thống tự động xác định lại Rank.
- Cột `lifetime_after` (tổng điểm luỹ kế đã tích luỹ) vẫn được lưu trong ledger để phục vụ thống kê, báo cáo và audit, nhưng không dùng để khóa cố định rank khi người dùng đã giảm điểm.

`version` trên `point_rules` là bắt buộc: khi Admin đổi rule, bút toán cũ phải tra được nó ra
đời dưới phiên bản nào.

Giver Accuracy: Người nhận chấm theo % (0–100%). Lưu vào bảng `reviews.accuracy_percent` và tính tổng hợp vào `users.accuracy_percent` (kèm `users.accuracy_samples`). Chỉ hiển thị và xét cảnh báo khi `accuracy_samples >= 5`; dưới 75% đưa vào `REVIEW_REQUIRED` (CHỐT-03).

---

## 6. Group & affiliate

| Bảng | Cột đáng chú ý |
| --- | --- |
| `groups` | `owner_id` · `name` · **`center` geography** · **`radius_meters`** · `status` |
| `group_members` | `group_id` · `user_id` **UNIQUE toàn cục** · `sub_team_id?` · `joined_at` · **`last_activity_at`** · `status` |
| `sub_teams` | `group_id` · `name` · `lead_id` |
| `group_invites` | `group_id` · `token` · `created_by` · `expires_at` · `revoked_at` |
| `affiliate_events` | `source_type` · `source_id` · `group_id` · `actor_id` · **`event_location`** · `geo_eligible` · **`distance_meters`** · **`radius_meters`** |
| `affiliate_rewards` | `affiliate_event_id` · `beneficiary_id` · `point_ledger_id?` · `status` · `point_delta` |

`user_id` UNIQUE **toàn cục** (không phải unique theo group): mỗi người tối đa 1 Group
([F51](../FEATURES.md#f51--quyền-tạo-group)).

`center` và `radius_meters` là **bản chụp lúc tạo Group**, Owner không sửa được — nếu sửa
được, người ta sẽ dời vùng theo nơi đang có nhiều sự kiện.

`affiliate_events` lưu cả `distance_meters` lẫn `radius_meters` tại thời điểm xét. Không lưu
thì tranh chấp về sau không có cách nào tra lại ([F58](../FEATURES.md#f58--thứ-tự-ưu-tiên-vị-trí--audit)).

`last_activity_at` phục vụ [GĐ-2](./ASSUMPTIONS.md#gđ-2--active-member--chưa-bị-khoá-và-có-hoạt-động-trong-90-ngày).

---

## 7. Thông báo, báo cáo, quản trị

| Bảng | Cột đáng chú ý |
| --- | --- |
| `notification_templates` | `code` · `title` · `body` · `audience_rule` jsonb |
| `notifications` | `user_id` · `template_code` · `payload` · `read_at` |
| `reports` | `reporter_id` · `target_type` · `target_id` · `reason` · `evidence_keys` · `status` |
| `moderation_actions` | `admin_id` · `target_type` · `target_id` · `action` · `reason` |
| `audit_logs` | `actor_id` · `action` · `entity_type` · `entity_id` · `before` · `after` |
| `campaigns` | `banner_r2_key` · `cta` · `deep_link` · `section_order` · `starts_at` · `ends_at` |
| `blog_posts` | `title` · `slug` · `cover_r2_key` · `body` · `published_at` |

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

### Giao dịch

```
ACCEPTED ──┬──▶ COMPLETED   (người nhận xác nhận, HOẶC tự động sau 5 ngày)
           └──▶ CANCELLED   (người cho huỷ → mở lại hàng đợi)
```

### Thứ hạng — theo [GĐ-3](./ASSUMPTIONS.md#gđ-3--rank-điểm-là-sàn-nhiệm-vụ-là-trần)

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
