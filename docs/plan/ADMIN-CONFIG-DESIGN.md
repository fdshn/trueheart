# Thiết kế điểm, thứ hạng và cấu hình vận hành Admin

**Trạng thái:** Đề xuất để chốt trước M4/M6
**Ngày:** 2026-09-19
**Phạm vi:** Toàn bộ business policy có thể cấu hình từ Admin CMS: điểm, rank, quota, quyền theo rank, bán kính/geo, referral, affiliate, accuracy, notification và SMTP/OTP.

## 1. Mục tiêu và nguyên tắc

Hệ thống cần cho phép Admin thay đổi chính sách nghiệp vụ mà không sửa code hoặc biến môi trường, nhưng vẫn phải:

- giữ `point_ledger` bất biến và truy vết được từng điểm;
- không làm thay đổi ý nghĩa dữ liệu lịch sử khi rule mới được bật;
- không để Admin chỉnh secret, trạng thái tài khoản hay dữ liệu giao dịch;
- mọi thay đổi có người thực hiện, lý do, thời điểm và bản diff;
- có thể xem trước tác động trước khi publish;
- phù hợp với monolith Clean Architecture hiện tại.

### Quyết định nền tảng

1. **Admin CMS là control plane**, còn `point`, `rank`, `referral`, `otp` và `notification` là domain modules. Admin gọi use case của từng resource, không ghi thẳng bảng nghiệp vụ.
2. **Cấu hình nghiệp vụ dùng phiên bản bất biến.** Không update đè rule đang được dùng. Publish tạo revision mới với `effective_from`; deactivate chỉ ngăn phát sinh mới.
3. **Ledger là nguồn sự thật.** `user_point_balances` là projection để đọc nhanh; reconcile chỉ phát hiện/sửa projection, không sửa lịch sử.
4. **Xét Rank theo current balance (SRS v1.15.0 - CHỐT-01).** Phase 1 xét Rank theo số dư Điểm Cống hiến hiện tại (`balance`); khi balance giảm dưới ngưỡng thì tự động đánh giá lại Rank. Cột `lifetime` vẫn được lưu ở ledger để theo dõi tổng tích luỹ và audit.
5. **SMTP là adapter hạ tầng.** DB lưu policy, sender identity, template và `secret_ref`; mật khẩu SMTP chỉ nằm ở secret manager hoặc environment secret.
6. **Không có scheduler trong process chính.** Job publish, delivery và maintenance chạy qua CLI/worker hoặc scheduler bên ngoài, giống rank evaluation hiện tại.

## 2. Ranh giới module

| Module | Trách nhiệm | Không chịu trách nhiệm |
| --- | --- | --- |
| `point` | Rule điểm, ledger idempotent, balance projection, cap | Gửi email, quyết định quyền Admin |
| `rank` | Tier, promotion, maintenance cycle, transition | Ghi điểm trực tiếp |
| `referral` | Quan hệ referral bất biến, qualification | Tự cộng cột điểm |
| `notification` | Template, delivery request, retry và trạng thái gửi | Chứa SMTP password |
| `otp`/`auth` | OTP purpose, rate limit, reset token | Tự bật channel chưa cấu hình |
| `admin-config` | Revision, publish, rollback, audit và preview | Tính nghiệp vụ thay module sở hữu |
| `admin-access` | Role/permission cho CMS | Dựa lâu dài vào username allowlist |

Mỗi resource theo mẫu hiện có: `domain/ports` → `application/contracts` + `implementations` → `infrastructure/entity`, repository, DTO và controller. Adapter SMTP nằm ở infrastructure.

### Config môi trường và config Admin

**Giữ ở environment/secret:** database, Redis, JWT secret, SMTP credential hoặc secret reference, storage credentials, encryption key và deployment URLs.

**Cho Admin chỉnh:** điểm theo sự kiện, quota theo rank, ngưỡng rank, maintenance, cap theo ngày, campaign, sender display name, template nội dung, retry policy và giới hạn gửi.

Admin không được chỉnh `DATABASE_URI`, `JWT_SECRET`, `STORAGE_SECRET_ACCESS_KEY`, `SMTP_PASSWORD`, `NODE_ENV` hoặc quyền hệ thống.

## 3. Mô hình dữ liệu

Tên dưới đây là tên logical; entity TypeORM vẫn dùng hậu tố `.entity.ts` và migration như quy ước repo.

### 3.1 Cấu hình và audit dùng chung

#### `config_revisions`

| Cột | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `id` | bigint | revision |
| `scope` | varchar | `POINT`, `RANK`, `OTP`, `SMTP`, `NOTIFICATION`, `DISCOVERY` |
| `status` | enum | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `effective_from/to` | timestamptz | khoảng hiệu lực |
| `created_by/published_by` | uuid | Admin tạo/publish |
| `published_at` | timestamptz nullable | thời điểm publish |
| `change_reason` | varchar | lý do bắt buộc |
| `created_at` | timestamptz | audit |

Ràng buộc: mỗi `scope` chỉ có một revision published tại một thời điểm; không cho khoảng hiệu lực chồng nhau. Revision đã được ledger/cycle sử dụng không được sửa hoặc xoá.

#### `admin_audit_logs`

Lưu `actor_user_id`, `action`, `resource_type`, `resource_id`, `revision_id`, `before_json`, `after_json`, `request_id`, `ip_hash`, `created_at`. Không lưu secret plaintext, OTP, password hoặc target email đầy đủ.

#### Role và permission

Các bảng `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_user_roles` dùng user/session hiện có. Permission tối thiểu:

| Permission | Phạm vi |
| --- | --- |
| `config.read` | xem cấu hình và lịch sử |
| `config.draft` | tạo draft |
| `config.publish` | publish/rollback; cần re-auth hoặc MFA |
| `point.adjust` | tạo manual adjustment |
| `notification.test` | gửi test tới địa chỉ đã xác nhận |
| `admin.manage` | role và tài khoản Admin |
| `audit.read` | xem audit |

Role phải được đọc lại từ DB trong use case; không tin rank/status snapshot trong JWT.

### 3.2 Point

#### `check_in_policy_revisions` (F83, chưa triển khai)

Policy chuyên biệt lưu `enabled`, `transactions_per_repair`, `repair_window_days`,
`daily_points`, `milestones[{streakDays,bonusPoints}]`, `effective_at`, `version`,
`created_by`, `reason`. Nó là nguồn điểm duy nhất cho `CHECK_IN_DAILY` và
`CHECK_IN_STREAK_MILESTONE`, không sao chép giá trị vào `point_rules` tổng quát. Thưởng
vẫn ghi `point_ledger` với policy version. Publish có preview, RBAC `config.write` và
`admin_audit_logs`; bản cũ không bị viết lại. Xem [đặc tả F83](./CHECK-IN-STREAK-DESIGN.md).

#### `point_rule_revisions`

Có thể mở rộng `point_rules` hiện hữu hoặc tách bảng revision. Mỗi dòng gồm `code`, `event_type`, `delta`, `affects_lifetime`, `affects_balance`, `daily_cap`, `per_user_cap`, `conditions_json`, `revision_id`, `enabled`, `created_at`.

`conditions_json` chỉ là DSL whitelist, ví dụ `post_type`, `quality_band`, `requires_verified_report`; Admin không được nhập SQL hay JavaScript.

#### `point_ledger`

Giữ các cột hiện hữu: `rule_code`, `rule_version`, `delta`, `balance_after`, `lifetime_after`, `reference_type`, `reference_id`, `idempotency_key`, `actor`, `source`, `reason`. Bổ sung index `(reference_type, reference_id)` để tra cứu nguồn.

Loại entry: `SYSTEM_EVENT`, `ADMIN_ADJUSTMENT`, `REDEMPTION`, `REVERSAL`. Transaction phải khóa balance, kiểm tra cap/điều kiện, ghi ledger và cập nhật projection cùng nhau. Retry cùng `idempotency_key` trả kết quả cũ. Không cộng điểm bằng `UPDATE users` hoặc sửa projection trực tiếp.

### 3.3 Rank và maintenance

#### `rank_policy_revisions`

Mỗi revision chứa `rank`, `threshold_lifetime_points`, `warning_lifetime_points`, `required_gifts`, `required_referrals`, `maintenance_gifts`, `maintenance_referrals`, `post_quota`, `sos_enabled`, `sort_order`.

`rank_tiers` hiện hữu có thể là projection của revision đang publish, nhưng `rank_maintenance_cycles` phải lưu `policy_revision_id` và snapshot ngưỡng đã dùng. Đổi policy hôm nay không đổi kết quả cycle đã mở hôm qua.

`rank_maintenance_cycles` bổ sung `policy_revision_id`, `demotion_policy`, `evaluated_by`, `evaluation_version`; unique `(user_id, cycle_start, cycle_end)`; trạng thái `OPEN`, `SATISFIED`, `FAILED`, `UNEVALUATED`, `CANCELLED`.

`rank_transitions` giữ bất biến; bổ sung `policy_revision_id`, `reason_code`. Không update `users.rank` để ép hạng. Hỗ trợ đặc biệt dùng use case `ADMIN_OVERRIDE` có thời hạn và audit.

### 3.4 Referral

`referrals` gồm `referrer_id`, `referred_user_id`, `referral_code`, `created_at`, `qualified_at`, `qualification_event`, `status`. Unique `referred_user_id`; không chuyển referrer sau khi tạo.

Điểm referral đi qua `PointLedgerService` với idempotency key `referral:<referralId>:qualified`, sau đó mới reconcile rank.

### 3.5 SMTP, OTP và notification

#### `notification_channels`

Lưu `channel` (`EMAIL`, sau này `SMS`), `provider` (`SMTP`, `SES`, ...), `enabled`, `secret_ref`, `from_address`, `from_name`, `reply_to`, `timeout_ms`, `max_attempts`, `backoff_seconds`, `revision_id`.

`secret_ref` chỉ là tên secret ngoài DB. API chỉ trả `configured`, `enabled`, `provider`, sender đã che và `last_test_at`.

#### `notification_templates`

Lưu `purpose`, `locale`, `subject_template`, `body_template`, `revision_id`, `enabled`. Render bằng biến whitelist (`otp_code`, `expires_in_minutes`, `display_name`); template không được thực thi code.

#### `notification_deliveries`

Lưu `purpose`, `channel`, `target_hash`, `provider_message_id`, `status` (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `EXHAUSTED`), `attempt_count`, `next_attempt_at`, `last_error_code`, `created_at`, `sent_at`. Không log target.

`IOtpSender` đổi từ `isConfigured: boolean` sang `canSend(channel): boolean` và `send(...)`. Email configured không được vô tình mở xác minh SMS. SMTP test chỉ gửi tới địa chỉ Admin đã xác nhận và luôn có audit.

## 4. Luồng nghiệp vụ

### Publish policy

1. Admin có `config.draft` tạo revision từ bản published.
2. API validate: tier tăng dần, warning không vượt threshold, cap không âm, rank liền kề hợp lệ, không trùng event/condition.
3. Admin xem preview thay đổi và dry-run tác động.
4. Admin có `config.publish` xác nhận lý do và publish với `effective_from`.
5. Hệ thống ghi audit và phát `CONFIG_REVISION_PUBLISHED` qua outbox/event nội bộ.
6. Event mới đọc revision tại thời điểm xử lý; ledger ghi `rule_version`.

Rollback là publish lại revision trước, không xoá revision mới và không đảo ledger.

### Điểm và rank

`domain event → resolve active point rule → point ledger transaction → reconcile rank dưới advisory lock → transition nếu đổi hạng`.

Khi promote lên Bạc/Vàng/Kim Cương, tạo cycle 3 tháng với policy snapshot. Job claim bằng `FOR UPDATE SKIP LOCKED`, đếm activity qua port và finalize đúng một lần. Nếu activity source unavailable, giữ `UNEVALUATED`, không demote. Mặc định fail thì tụt đúng một bậc.

### Quên mật khẩu qua email

1. Use case kiểm tra `canSend(EMAIL)` trước khi issue OTP.
2. Nếu không có email hoặc channel chưa configured, trả cùng response `ADMIN_SUPPORT` như tài khoản không tồn tại.
3. Nếu có, issue OTP hash trong Redis và tạo delivery `QUEUED`.
4. Worker gọi `EmailSender`, retry theo policy; không retry OTP đã hết hạn.
5. Thành công là `SENT`; thất bại cuối là `EXHAUSTED` và metric/alert, không làm sập API chính.

## 5. API Admin

Các endpoint yêu cầu JWT + permission; body bọc dưới khóa resource theo invariant DTO.

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/v1/admin/config/revisions?scope=` | danh sách revision |
| `POST` | `/api/v1/admin/config/revisions` | tạo draft |
| `GET` | `/api/v1/admin/config/revisions/:revisionId` | xem chi tiết |
| `POST` | `/api/v1/admin/config/revisions/:revisionId/validate` | validate + preview |
| `POST` | `/api/v1/admin/config/revisions/:revisionId/publish` | publish có lý do |
| `POST` | `/api/v1/admin/config/scopes/:scope/rollback` | publish lại revision cũ |
| `GET` | `/api/v1/admin/points/rules` | xem rule và lịch sử |
| `GET/PUT` | `/api/v1/admin/check-in-policy` | xem/publish điểm ngày, thưởng từng mốc, giao dịch/lượt bù và thời hạn bù; `config.read/write` |
| `POST` | `/api/v1/admin/points/adjustments` | tạo bút toán điều chỉnh |
| `GET` | `/api/v1/admin/ranks/policy` | xem policy hiệu lực |
| `POST` | `/api/v1/admin/notifications/channels/:channel/test` | test SMTP/provider |
| `GET` | `/api/v1/admin/notifications/deliveries` | theo dõi delivery |
| `GET` | `/api/v1/admin/audit-logs` | truy vết thay đổi |

Không cung cấp API `PATCH user.balance`, `PATCH user.rank`, `DELETE point_ledger` hoặc `GET SMTP password`.

## 6. Lộ trình

### M4.1 — Ledger

- Chuẩn hóa `point_rules` thành revision/effective time.
- Hoàn thiện transaction, idempotency và daily cap.
- Nối `PHONE_VERIFIED_FIRST_TIME`, referral và completed gift vào ledger.
- Thêm reconcile projection và invariant test.

### M4.2 — Rank

- Thêm policy revision/snapshot vào tier, transition, maintenance cycle.
- Chốt bốn giả định trong `docs/plan/ASSUMPTIONS.md` trước seed production.
- Làm dry-run maintenance và metric `UNEVALUATED`.

### M6.1 — Admin control plane

- Role/permission và audit.
- Config revision, publish/rollback và preview.
- Thay `*_OPERATOR_USERNAMES` bằng permission thật.
- Cập nhật Admin UI theo endpoint.

### M6.2 — Email delivery thật

- Chọn vendor hoặc SMTP relay, secret manager và domain verification.
- Triển khai `canSend(EMAIL|SMS)`.
- Delivery/outbox, retry, dead-letter và metric.
- Staging delivery acceptance test trước production.

## 7. Acceptance criteria

- Hai Admin publish cùng scope không tạo revision hiệu lực chồng nhau.
- Replay cùng event không tăng điểm lần hai.
- Đổi rule không thay đổi ledger hoặc cycle đã snapshot.
- `lifetime` không giảm khi redemption; `balance` không âm.
- Adjustment không sửa/xoá ledger cũ và luôn có audit reason.
- Email tắt thì OTP không issue; SMS chưa cấu hình vẫn bị tắt dù email hoạt động.
- SMTP password không xuất hiện trong response, audit, log hoặc application payload.
- Retry delivery không tạo hai OTP hợp lệ cho cùng request.
- Maintenance `FAILED/UNEVALUATED` không demote khi activity source chưa sẵn sàng.
- Rollback là publish revision cũ, không delete revision mới.

## 8. Các điểm cần Bên A chốt

1. Giá trị 100% mô tả là **56 điểm** hay số khác?
2. `Active Member` có nghĩa là tài khoản hoạt động trong 90 ngày gần nhất không?
3. Trượt maintenance thì tụt đúng một bậc, giữ hạng hay tính lại theo điểm?
4. `2+2 / 3+3 / 4+4` có đúng là giao dịch Cho hoàn tất + referral không?
5. Có cho phép đổi điểm lấy quyền lợi hay chỉ dùng `balance` cho campaign nội bộ?
6. SMTP relay do bên nào sở hữu, và secret đặt ở secret manager nào?

Nếu bốn câu đầu chưa chốt, vẫn có thể làm schema/revision/audit và UI preview, nhưng không nên seed policy production hoặc chạy job demotion thật.

## 9. Catalog business policy

Đây là danh mục chuẩn mà Admin CMS phải quản lý. Mỗi nhóm được lưu trong một revision riêng
hoặc một `config_bundle` chứa nhiều revision có cùng `effective_from`. Không dùng một bảng
key/value không kiểu hóa cho các giá trị có quan hệ và invariant.

### 9.1 Quyền và giới hạn theo rank

Bảng dưới là seed mặc định từ `ASSUMPTIONS.md`, không phải giá trị bất biến. `Viewer` là rank
khởi tạo; `Member` trở thành rank đạt được khi đủ điều kiện onboarding.

| Rank | Lifetime tối thiểu | Cảnh báo | Bài mở tối đa | SOS | Tạo Group | Bài ứng viên được xử lý |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `VIEWER` | 0 | - | 0 | Không | Không | 0 |
| `MEMBER` | 224 | 157 | 3 | Không | Không | 1 |
| `SILVER` | 672 | 470 | 10 | Có | Không | 3 |
| `GOLD` | 896 | 627 | 20 | Có | Không | 5 |
| `DIAMOND` | 1792 | 1254 | 50 | Có | Có | 10 |

Không hardcode bảng này trong controller. Mỗi capability là một policy có `value_type`,
`min_rank`, `enabled`, `scope` và `revision_id`, để sau này thêm quyền mà không đổi schema.

Các capability tối thiểu:

| Capability | Cách kiểm tra |
| --- | --- |
| `POST_OFFER` | profile complete + rank quota còn lại |
| `POST_WANTED` | profile complete + rank quota còn lại |
| `POST_SOS` | rank >= policy.min_rank + quota SOS |
| `CREATE_GROUP` | rank >= policy.min_rank + chưa sở hữu Group |
| `SELECT_REQUESTER` | rank >= policy.min_rank |
| `SUBMIT_CHARITY_PROPOSAL` | rank >= policy.min_rank |
| `PUBLISH_MERIT` | chỉ bản ghi đã Admin verify |
| `USE_AFFILIATE_LINK` | user mới + invite hợp lệ |
| `REDEEM_POINTS` | campaign đang active + balance đủ |

Mọi use case có quyền phải gọi `IAuthorizationPolicy`/`ICapabilityPolicy`, không tự đọc
`users.rank` rồi tự so sánh. Policy trả về `allowed`, `reason_code`, `current_value`,
`limit_value`, `policy_revision_id` để API có thể giải thích lỗi ổn định.

### 9.2 Radius và geo policy

Phải phân biệt ba loại bán kính, vì chúng phục vụ ba mục đích khác nhau:

| Policy | Owner | Snapshot? | Dùng ở đâu |
| --- | --- | --- | --- |
| `DISCOVERY_RADIUS` | user/request | Không | `/posts/nearby`, bản đồ |
| `GROUP_RADIUS` | Group | Có lúc tạo Group | F52/F57 affiliate eligibility |
| `NOTIFICATION_RADIUS` | notification rule | Theo event | F47 thông báo địa lý |
| `GEO_JITTER_RADIUS` | system | Theo config hiện tại | public location privacy |

`DISCOVERY_RADIUS` có min/max và default theo client policy, nhưng user được chọn trong giới
hạn; không dùng để xét điểm. `GROUP_RADIUS` lấy từ rank policy tại thời điểm tạo Group, sau đó
ghi vào `groups.radius_meters` và không đổi khi rank Owner đổi. Nếu Admin muốn thay đổi Group
đã tạo phải có migration/use case riêng, không update hàng loạt âm thầm.

| Key | Default đề xuất | Min | Max | Ghi chú |
| --- | ---: | ---: | ---: | --- |
| `discovery.default_radius_meters` | 5,000 | 100 | 50,000 | public map/nearby |
| `group.radius_meters` | 10,000 | 1,000 | 50,000 | snapshot khi tạo |
| `geo.jitter_radius_meters` | 300 | 50 | 5,000 | environment hiện có; có thể đưa vào protected config |
| `notification.max_radius_meters` | 50,000 | 100 | 100,000 | chống broadcast quá rộng |

Tất cả lọc khoảng cách dùng `GeoQueryHelper`, mọi audit eligibility lưu `distance_meters`,
`radius_meters`, nguồn location và `policy_revision_id`.

### 9.3 Point event catalog

Mỗi event có `event_code`, `subject`, `delta` hoặc `formula`, `affects_lifetime`, `affects_balance`,
`daily_cap`, `requires_status`, `requires_rank`, `enabled` và `source_type`.

| Event code | Điều kiện | Giá trị seed | Idempotency |
| --- | --- | ---: | --- |
| `GIFT_COMPLETED_100` | review 100% | 56 | `gift:<transaction>:<review>` |
| `GIFT_COMPLETED_75` | review 75–99% | 42 | như trên |
| `GIFT_COMPLETED_50` | review 50–74% | 28 | như trên |
| `GIFT_COMPLETED_25` | review 25–49% | 14 | như trên |
| `PHONE_VERIFIED_FIRST_TIME` | verified lần đầu | 28 | `phone-verification:<user>` |
| `PERSONAL_REFERRAL_QUALIFIED` | referral đủ điều kiện | 56 | `referral:<id>:qualified` |
| `REPORT_VERIFIED` | Admin xác minh report | 14 | `report:<id>:verified` |
| `LIKE_RECEIVED` | tắt mặc định | 0 | `like:<id>` |
| `COMMENT_RECEIVED` | tắt mặc định | 0 | `comment:<id>` |
| `AFFILIATE_EVENT` | geo eligible + active member | theo event rule | `affiliate:<event>:<user>` |

`GIFT_COMPLETED_*` chỉ là seed; công thức phải chốt cách làm tròn, actor nhận điểm và có
được cộng cho giver/receiver hay không. `daily_cap` được tính theo UTC policy timezone và
phải ghi kết quả cap trong quyết định ledger (`APPLIED`, `CAPPED`, `REJECTED`), không chỉ log.

### 9.4 Referral và affiliate policy

| Policy | Giá trị seed | Có thể cấu hình |
| --- | --- | --- |
| Personal referral reward | 56 | Có |
| Personal referral | một lần/user mới | Có điều kiện, không đổi quan hệ |
| Affiliate depth | 1 | Có, nhưng Phase 1 giới hạn 1 |
| Active member window | 90 ngày | Có |
| Affiliate recurring | Có | Có |
| Out-of-geo event | ghi nhận, 0 điểm | Có trạng thái, không bỏ audit |
| Referral daily cap | 3 | Có |
| Point event daily cap | 5 giao dịch | Có |
| Group owner limit | 1 Group chính | Có giới hạn nhưng không nên tăng trong Phase 1 |

Affiliate event phải tạo reward decision cho từng beneficiary, kể cả `NOT_ELIGIBLE_GEO`,
`INACTIVE_MEMBER`, `CAP_REACHED` hoặc `FRAUD_REVIEW`. Không tạo một bút toán tổng rồi chia
trong code vì sẽ mất khả năng truy vết từng user.

### 9.5 Maintenance policy

| Rank | Chu kỳ | Gifts tối thiểu | Referrals tối thiểu | Fail mặc định |
| --- | --- | ---: | ---: | --- |
| `SILVER` | 3 tháng | 2 | 2 | tụt 1 bậc |
| `GOLD` | 3 tháng | 3 | 3 | tụt 1 bậc |
| `DIAMOND` | 3 tháng | 4 | 4 | tụt 1 bậc |

Chu kỳ phải lưu snapshot, kể cả khi policy hiện tại sau đó đổi từ `2+2` thành `3+2`. Các
trạng thái `UNEVALUATED` và `FAILED` cần được Admin nhìn thấy, retry được và không được tự
động demote khi activity adapter chưa sẵn sàng.

### 9.6 Accuracy, review và moderation policy

| Policy | Seed đề xuất |
| --- | --- |
| Minimum accuracy samples | 5 |
| Review window | 14 ngày sau completed |
| Một reviewer/reviewee/transaction | 1 review |
| Report cap | 10/người/ngày |
| Report thành điểm | chỉ report đã Admin xác minh |
| Fraud decision | không kết luận từ một tín hiệu |
| Point reversal | ledger entry âm, không delete |

Các policy này phải tham chiếu `reviews`, `reports`, `moderation_actions` và ledger bằng
`reference_type/reference_id`; không lưu một bản “điểm phạt hiện tại” tách rời ledger.

## 10. Sơ đồ quan hệ đầy đủ

```text
config_bundles
	├── config_revisions
	│     ├── capability_policies ──< capability_rank_values
	│     ├── point_rule_revisions
	│     ├── rank_policy_revisions ──< rank_policy_tiers
	│     ├── geo_policies
	│     ├── referral_policies
	│     ├── affiliate_policies
	│     ├── review_accuracy_policies
	│     ├── notification_channels
	│     └── notification_templates
	└── admin_audit_logs

users ──< user_point_balances
users ──< point_ledger >── point_rule_revisions
users ──< rank_transitions >── rank_policy_revisions
users ──< rank_maintenance_cycles >── rank_policy_revisions
users ──< referrals
groups ──< group_members >── users
groups ──< affiliate_events ──< affiliate_rewards >── users
affiliate_rewards ──? point_ledger
notification_templates ──< notification_deliveries >── users?
```

### Bảng mới/điều chỉnh bắt buộc

| Bảng | Khóa/quan hệ quan trọng | Vai trò |
| --- | --- | --- |
| `config_bundles` | `id`, `name`, `status` | gom các policy publish cùng thời điểm |
| `config_revisions` | `bundle_id`, `scope`, `version`, `effective_from` | version bất biến |
| `capability_policies` | `revision_id`, `capability_code` | catalog quyền |
| `capability_rank_values` | `policy_id`, `rank` | min rank/quota/value theo rank |
| `geo_policies` | `revision_id`, `policy_code` | radius và giới hạn geo |
| `referral_policies` | `revision_id`, `event_code` | qualification/reward/cap |
| `affiliate_policies` | `revision_id`, `event_code` | recurring/depth/active/geo |
| `review_accuracy_policies` | `revision_id` | review window, samples, cap |
| `notification_deliveries` | `template_id`, `status`, `idempotency_key` | outbox/retry |
| `admin_audit_logs` | actor + resource + revision | audit immutable |

Có thể gộp các bảng policy nhỏ vào JSONB của revision khi prototype, nhưng production vẫn
phải validate bằng schema version và không được dùng JSONB tùy ý cho quan hệ user/rank.

## 11. Ma trận luồng user và policy được sử dụng

| Luồng | Policy đọc | Dữ liệu ghi | Kết quả |
| --- | --- | --- | --- |
| Đăng bài Offer/Wanted | `POST_*`, quota theo rank, profile gate | `posts`, usage counter | cho phép hoặc `QUOTA_EXCEEDED` |
| Đăng SOS | `POST_SOS`, quota/ngày | `posts` | chỉ rank đủ điều kiện |
| Xin nhận | capability + giới hạn request | `gift_requests` | request hợp lệ |
| Chọn người nhận | `SELECT_REQUESTER`, rank | `transactions`, inventory | trừ tồn kho nguyên tử |
| Hoàn tất giao dịch | point event + review policy | `reviews`, `point_ledger` | cộng điểm idempotent |
| Xác minh phone | OTP channel + point event | `phone_verified_at`, ledger | thưởng đúng một lần |
| Referral cá nhân | referral policy + fraud checks | `referrals`, ledger | quan hệ bất biến |
| Tạo Group | `CREATE_GROUP`, group radius theo rank | `groups`, `group_members` | snapshot center/radius |
| Affiliate event | active window + geo + event cap | event/reward/ledger | reward từng member |
| Gửi notification geo | notification radius + audience | delivery/outbox | gửi retryable |
| Report | report cap + evidence policy | `reports` | ticket pending |
| Admin sanction | moderation policy + permission | action, user status, token revoke | audit bắt buộc |
| Quên mật khẩu | `canSend(channel)`, OTP policy | Redis OTP, delivery | gửi hoặc Admin support |

### Quy trình kiểm tra chuẩn trong use case

```text
load current user from database
	→ load published policy bundle
	→ authorize capability
	→ validate quota/cap/geo/state transition
	→ execute domain transaction
	→ write audit/outbox if side effect
	→ return policy revision and stable reason code
```

JWT chỉ cung cấp danh tính phiên; không dùng rank/status trong JWT để quyết định quyền.

## 12. API đầy đủ

### 12.1 API cho user/mobile

| Method | Endpoint | Policy/response chính |
| --- | --- | --- |
| `GET` | `/api/v1/me/entitlements` | rank, capability, quota còn lại, `policyRevision` |
| `GET` | `/api/v1/me/points/summary` | balance, lifetime, rank progress |
| `GET` | `/api/v1/me/points/ledger` | ledger phân trang, source/reference |
| `GET` | `/api/v1/me/rank` | tier, warning, maintenance cycle |
| `GET` | `/api/v1/me/referrals` | code, qualified count, reward state |
| `GET` | `/api/v1/check-ins/me`, `/api/v1/check-ins/me/history` | trạng thái và lịch điểm danh của chính user (F83, chưa triển khai) |
| `POST` | `/api/v1/check-ins`, `/api/v1/check-ins/repairs` | điểm danh hôm nay / tiêu lượt bù (F83, chưa triển khai) |
| `GET` | `/api/v1/discovery/config` | radius min/default/max, map limits |
| `POST` | `/api/v1/posts` | capability + quota + profile gate |
| `POST` | `/api/v1/posts/:postId/requests` | request policy |
| `POST` | `/api/v1/transactions/:transactionId/reviews` | review window + accuracy |
| `GET` | `/api/v1/groups/:groupId` | group center/radius theo privacy policy |
| `GET` | `/api/v1/notifications` | in-app notifications |
| `POST` | `/api/v1/auth/forgot-password` | generic response, không enumeration |

`GET /me/entitlements` là endpoint quan trọng để mobile không tự hardcode rank/quota. Response
phải có `expiresAt` hoặc cache policy nếu entitlement được cache.

### 12.2 API Admin

| Nhóm | Endpoint |
| --- | --- |
| Bundle | `GET/POST /api/v1/admin/policy-bundles`, `POST /:id/validate`, `POST /:id/publish`, `POST /:id/rollback` |
| Capability | `GET/PUT /api/v1/admin/policies/capabilities/:code` |
| Points | `GET/POST /api/v1/admin/policies/point-rules`, `POST /points/adjustments`, `POST /points/:id/reverse` |
| Check-in | `GET/PUT /api/v1/admin/check-in-policy` — F83, chưa triển khai, `config.read/write` |
| Rank | `GET/PUT /api/v1/admin/policies/ranks`, `POST /ranks/preview`, `POST /ranks/reconcile` |
| Geo | `GET/PUT /api/v1/admin/policies/geo`, `GET /geo/eligibility-preview` |
| Referral | `GET/PUT /api/v1/admin/policies/referral`, `GET /referrals/fraud-signals` |
| Affiliate | `GET/PUT /api/v1/admin/policies/affiliate`, `POST /affiliate-events/reprocess` |
| Review | `GET/PUT /api/v1/admin/policies/reviews`, `POST /reports/:id/verify` |
| Notification | `GET/POST /api/v1/admin/notification-templates`, `GET /deliveries`, `POST /channels/:channel/test` |
| User/moderation | `POST /users/:id/suspend`, `POST /users/:id/unsuspend`, `POST /moderation-actions` |
| Audit | `GET /api/v1/admin/audit-logs`, `GET /api/v1/admin/policy-changes` |

Không cho API sửa trực tiếp `users.rank`, `users.balance`, `point_ledger`, `groups.radius_meters`
hoặc xóa delivery/audit. Các hành động đặc biệt tạo command/transition/bút toán mới.

### 12.3 API contract chung

Mỗi mutation cần:

- DTO body bọc dưới resource key;
- permission cụ thể;
- `reason` bắt buộc với adjustment, publish, rollback, sanction;
- `Idempotency-Key` với command có side effect;
- response trả `policyRevisionId` và `auditId` khi phù hợp;
- khai báo error catalog: `POLICY_NOT_FOUND`, `POLICY_INVALID`, `CAPABILITY_DENIED`,
	`QUOTA_EXCEEDED`, `POINT_CAP_REACHED`, `GEO_NOT_ELIGIBLE`, `REVISION_CONFLICT`.

## 13. Cấu hình nào không đưa vào DB

| Giá trị | Nơi lưu | Lý do |
| --- | --- | --- |
| `DATABASE_URI`, `REDIS_URI` | environment/secret | hạ tầng |
| `JWT_SECRET` | secret manager | khóa bảo mật |
| SMTP password/API key | secret manager | credential |
| R2 access/secret key | secret manager | credential |
| `GEO_JITTER_RADIUS_METERS` | protected deployment config | privacy boundary |
| `PORT`, `NODE_ENV` | deployment | vòng đời process |
| vendor endpoint nội bộ | environment hoặc secret reference | hạ tầng |

DB có thể lưu `secret_ref`, trạng thái configured và metadata test; không lưu bản thân secret.

## 14. Thứ tự triển khai cập nhật

1. Chốt 4 blocker trong `ASSUMPTIONS.md` và contract `GET /me/entitlements`.
2. Dựng `config_bundle/revision`, capability và audit, chưa mở mutation production.
3. Hoàn thiện Point Ledger + event catalog + cap/idempotency.
4. Hoàn thiện Rank/maintenance snapshot và policy evaluator.
5. Nối transaction/review/referral/affiliate vào event catalog.
6. Nối các use case user vào capability/quota/radius evaluator.
7. Dựng Admin API preview/publish/rollback và thay allowlist username.
8. Dựng notification delivery + SMTP adapter + staging acceptance.
9. Tạo Admin UI theo dashboard/policy groups; chạy dry-run trước khi publish thật.

Không nên làm form Admin trước bước 2–4: khi đó UI sẽ vô tình phản chiếu các cột hiện tại,
khó bổ sung version, snapshot và audit mà không breaking API.
