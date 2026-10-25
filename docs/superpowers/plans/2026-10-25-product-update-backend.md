# Cập nhật sản phẩm 25/10 — kế hoạch triển khai backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hiện thực toàn bộ yêu cầu backend trong PR #46.

**Spec:** `docs/superpowers/specs/2026-10-25-customer-product-update-backend-requirements.md` trên branch
`codex/docs-backend-product-update-2026-10-25` (PR #46, chưa merge). Đọc bằng
`git show origin/codex/docs-backend-product-update-2026-10-25:docs/superpowers/specs/2026-10-25-customer-product-update-backend-requirements.md`.

**Tech Stack:** NestJS + Fastify, TypeORM SQL thô, Postgres 17, Redis, Jest, script kiểm `test/*.check.ts`.

## Global Constraints

- Tuân thủ `INVARIANTS.md`:
  - Contract chung đặt ở `chantam.core-lib`.
  - Body bọc resource key.
  - Lỗi khai trong error catalog.
  - `@ApiErrorResponses` với tham số mẫu cho exception có tham số.
  - Job phải idempotent.
  - Không trả raw exception.
- TDD cho mọi thay đổi hành vi. SQL mới phải có phép kiểm trên DB thật.
- Mỗi task một commit trên `main`. Trước khi báo xong phải chạy: jest, `npm run lint:check`, tất cả `test:*`.
- **Tương thích client cũ:** chỉ thêm trường, không đổi tên hay xoá trường đang có trong response.
- Migration mới bắt đầu từ `1801400000000`.

## Quyết định của người làm (chủ dự án duyệt 25/10: "hiện cả fullName", "làm full")

1. **fullName công khai:** author summary hiện `fullName`. Đảo ngược CHỐT-11 theo lời chủ dự án ngày 25/10. Email và SĐT vẫn không xuất hiện trong author summary.
2. **Clip giới thiệu:**
   - Video `video/mp4` hoặc `video/quicktime`, tối đa 50 MB.
   - Thumbnail do client tạo, upload riêng (ảnh, tối đa 2 MB). Server không transcode nên **không kiểm thời lượng**; mobile tự giới hạn 60 giây.
3. **`overallRating`:** không thêm. Spec nói chờ công thức chính thức.
4. **Bảng thời gian tụng kinh:**
   - Thời lượng tính từ `started_at` → `completed_at` của lượt tụng đã hoàn tất, đều là mốc server ghi.
   - Mỗi lượt cắt trần 2 giờ. Lượt dưới 60 giây không tính.
5. **`DHARMA_WORSHIP`:** không thêm. Phân hệ chưa được duyệt.
6. **Presence:** chỉ làm Phase 1, trả `onlineCount`. Chưa làm `showOnlineStatus` và `visibleUsers` (luôn rỗng).
7. **Rao vặt cũ:**
   - Chặn tạo yêu cầu xin nhận và giao dịch mới cho `CLASSIFIED` bằng khoá cấu hình `classified.legacy_transactions_enabled`, mặc định 0 (tắt).
   - Dữ liệu cũ giữ nguyên, đọc được.

## Tasks

- [ ] **T1 (P0)** Author summary có `fullName` ở post list/detail/nearby/smart-match/comment/Dharma; `PROFILE_INCOMPLETE` trả `body.missingFields`, câu báo lỗi đúng ngữ cảnh; mã lỗi email `INVALID_EMAIL_FORMAT`, `EMAIL_ALREADY_USED`, `EMAIL_NOT_VERIFIED`, `EMAIL_REQUIRED`.
- [ ] **T2 (P0)** Public profile mở rộng: slogan, todayThought(+updatedAt), clip giới thiệu (upload-url + key), `emailVisibility`/`phoneVisibility`, `contacts`, `monthlyStanding` (GIVERS tháng hiện tại); `GET /profile/:username/posts`.
- [ ] **T3 (P0)** Chat `DIRECT_POST` song song `TRANSACTION`: room type, `transaction_id` nullable, unique `(post, buyer, seller)`, `POST /chat/direct-post/rooms`, summary mở rộng.
- [ ] **T4 (P0)** `CLASSIFIED` không tạo request/transaction mới (`CLASSIFIED_TRANSACTION_NOT_SUPPORTED`); vòng đời ACTIVE→RESERVED→SOLD/HIDDEN do chủ bài đổi.
- [ ] **T5 (P1)** Share code: `posts.share_code` unique không tuần tự + backfill, `shareUrl` trong DTO bài, `GET /posts/share/:shareCode`.
- [ ] **T6 (P1)** Onboarding action metadata: `action {type,target,params}` theo allow-list.
- [ ] **T7 (P1)** Recipient selection: ghi audit lý do chọn của job auto-select. Kiểm lại phần idempotent và chạy song song.
- [ ] **T8 (P2)** Presence: `PUT /presence/me`, `GET /presence/surfaces/:surface`, Redis TTL 120 giây, dedupe theo user, rate limit 2 lần/phút.
- [ ] **T9 (P2)** Dharma hub sections preview.
- [ ] **T10 (P2)** Forum engagement leaderboard.
- [ ] **T11 (P2)** Recitation-time leaderboard.
- [ ] **T12 (P2)** Banner placements mới.
- [ ] **T13** Docs (`docs/API.md`), bàn giao mobile, kiểm tra toàn bộ, review cuối nhánh.
