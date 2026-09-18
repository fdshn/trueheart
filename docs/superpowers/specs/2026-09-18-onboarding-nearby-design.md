# Thiết kế onboarding và type filter

## Mục tiêu

1. Người mới là `VIEWER`; chỉ được tạo OFFER/WANTED sau khi là `MEMBER` và hoàn thành onboarding một lần.
2. Admin quản lý danh sách nhiệm vụ onboarding; client chỉ đọc tiến độ, **không** tự đánh dấu hoàn thành.
3. API nearby/map phân biệt rõ `OFFER` và `WANTED`; legacy `/api/gift-posts/nearby` luôn chỉ OFFER.
4. Audit log toàn hệ thống để deferred cuối, không làm trong scope này.

## Quyết định

### Onboarding một lần

Dùng hai bảng additive:

```text
onboarding_task_templates
- global_id, key, title, description, evidence_type
- required, active, sort_order, created/updated/deleted

user_onboarding_task_completions
- user_id, task_id, completed_at, evidence_ref
- UNIQUE(user_id, task_id)
```

Default tasks được seed:

| Key | Evidence server |
| --- | --- |
| `PROFILE_COMPLETE` | `isProfileComplete(user)` — fullName, avatar đã HeadObject xác minh, email, phone |
| `PHONE_VERIFIED` | `users.phone_verified_at` chỉ set sau OTP verify |

Không dùng `FIRST_OFFER_CREATED`: Viewer quota hiện là 0 nên không thể là điều kiện lên Member.

### Hoàn thành và promotion

- Không có endpoint client `complete task`.
- `UpdateOwnProfileUseCase` và `ConfirmPhoneVerificationUseCase` gọi evaluator server-side sau action thành công.
- Evaluator chạy transaction: tìm task active/required có evidence, insert completion idempotent, kiểm tra đủ tất cả required task rồi chỉ promote `VIEWER → MEMBER`.
- Không dựa rank/status trong JWT. Không demote Member khi Admin thêm task sau này.
- Không cộng điểm, không sửa ledger; M4 vẫn là nơi quản lý điểm/rank cycle chính thức.

### Admin và client APIs

Temporary admin policy: `ONBOARDING_TASK_ADMIN_USERNAMES`, parse/normalize giống category/post operator allowlist.

```text
GET    /api/onboarding/tasks                  # JWT: active tasks + completion progress của chính chủ
POST   /api/onboarding/tasks                  # allowlist admin
PATCH  /api/onboarding/tasks/:taskId          # allowlist admin, deactivate thay vì xoá cứng
```

Task key/evidence type là immutable sau khi seed để không đổi nghĩa completion lịch sử. CRUD chỉ thay title/description/order/required/active.

### Type filter nearby

```text
GET /api/posts/nearby?lat&lng&radiusMeters&postType=OFFER|WANTED&categoryId?
```

- Canonical nearby bắt buộc `postType`; query canonical `posts`, status public, PostGIS radius, pagination, jitter/bucket distance.
- Legacy `/api/gift-posts/nearby` giữ tương thích và server luôn query `OFFER`.
- Map endpoint hiện đã có optional `postType`; không cần thay contract.

## Thay đổi chính

- `core-lib`: task enum/model/entity/DTO, nearby DTO type.
- `core`: onboarding entity/repository/module/controller, migration + seed, trusted-event evaluator, post gate, canonical nearby endpoint.
- Config: temporary onboarding admin allowlist.
- Docs: `SPRINT-PLAN.md`, `DEFERRED.md`, `ROADMAP.md` nêu audit log deferred cuối.

## Verification

- Unit: completion idempotent; only required active tasks gate promotion; profile/OTP events complete the right tasks; Viewer blocked before member promotion; Member not demoted; admin denied outside allowlist.
- Nearby: canonical OFFER vs WANTED filter; legacy gift nearby remains OFFER-only.
- DB smoke: seed tasks → profile/OTP → rank Member → post creation allowed; audit log explicitly absent/deferred.
