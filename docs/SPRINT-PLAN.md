# Kế hoạch sprint chức năng

> Nguồn: `srs/sprint.txt`. Tài liệu này chuẩn hoá backlog thành Markdown để theo dõi
> phạm vi chức năng; không thay thế [`ROADMAP.md`](./plan/ROADMAP.md) hay
> [`DEFERRED.md`](./plan/DEFERRED.md).

## Tổng quan

| Sprint | Thời gian dự kiến | Trọng tâm | Đầu ra chính |
| --- | ---: | --- | --- |
| Sprint 1 | Ngày 1–12 | Nền tảng, account, profile, đăng tin nền | Service chạy staging, người dùng tạo được bài cơ bản |
| Sprint 2 | Ngày 13–25 | Nội dung, bản đồ, giao dịch, chat | Luồng tặng/nhận và bản đồ hoạt động end-to-end |
| Sprint 3 | Ngày 26–38 | Group, affiliate, point, nội dung đặc thù, CMS | Cộng đồng/điểm và vận hành cơ bản |
| Sprint 4 | Ngày 39–50 | Admin, anti-fraud, thông báo, hardening, UAT | Production-ready và bàn giao |

Tổng effort nguồn: **60 man-days / 50 ngày / 4 sprint**.

## Tiến độ hiện tại

| Phạm vi | Trạng thái thực tế | Ghi chú |
| --- | --- | --- |
| Sprint 1 – hạ tầng, auth, profile, category, avatar storage | ✅ Đã có nền code | Email/SMS provider, R2 staging/prod acceptance và point ledger còn deferred |
| Sprint 1 – canonical OFFER foundation | 🟡 Đang làm trong M2.1 | `posts` migration/backfill, OFFER/WANTED create, detail/map/moderation/quota, owner update/delete và post-media ownership đã có; legacy adapter còn thiếu |
| Sprint 2 – map discovery | 🟡 Đang làm | `GET /api/posts/map` marker bbox, jitter và client-side clustering đã có local/commit chờ push |
| Sprint 2–4 còn lại | ⬜ Chưa triển khai | Không đánh dấu xong khi chỉ có contract/mock |

---

## Sprint 1 · Nền tảng người dùng và đăng tin

### Mục tiêu

Có môi trường chạy được, account an toàn, profile đủ điều kiện đăng tin và nền canonical post.

| # | Epic | Hạng mục | Mapping roadmap | Trạng thái |
| ---: | --- | --- | --- | --- |
| 1 | Hạ tầng & bảo mật | VPS, Docker, PostgreSQL/PostGIS, Redis, Nginx SSL; dev/staging | M0 | ✅ Nền CI/CD/staging đã có |
| 2 | Xác thực & tài khoản | Register, login, refresh/logout, chống brute-force | F01–F04 | ✅ |
| 3 | Xác thực & tài khoản | Password recovery, Admin Support fallback, account deletion | F05–F06 | 🟡 Logic có; provider/quy trình vận hành deferred |
| 4 | Hồ sơ | Profile completion, xác minh SĐT, public profile, default location | F07–F11 | 🟡 Profile có; SMS/Zalo và point reward deferred |
| 5 | Rank & referral | Current balance, duy trì rank, referral cá nhân | F12–F13 | ⬜ Chờ M4 ledger/rule |
| 6 | Đăng tin & nội dung | Category + OFFER/WANTED + Media/Post Location | F14–F17, F24 | 🟡 Category/OFFER/location/post-media ownership có; WANTED và legacy compatibility adapter còn thiếu |
| 7 | QA | Smoke/integration Sprint 1 |  | 🟡 Unit/build/smoke nền có; acceptance provider còn thiếu |

### Điều kiện kết thúc Sprint 1

- Auth/profile/category/post nền qua unit/build/lint/format.
- Canonical post không lộ toạ độ chính xác trên API public.
- Không gọi Sprint 1 production-ready khi thiếu email/SMS provider, R2 acceptance, backup restore.

---

## Sprint 2 · Nội dung, bản đồ, giao dịch và chat

### Mục tiêu

Hoàn thiện discovery/lifecycle bài đăng rồi mới xây giao dịch, chat và UAT liên kết.

| # | Epic | Hạng mục | Mapping roadmap | Trạng thái |
| ---: | --- | --- | --- | --- |
| 8 | Đăng tin & nội dung | Smart Match, SOS, lifecycle OFFER, gia hạn, chuyển Admin | F15–F19, F23 | 🟡 OFFER moderation/quota đã có; Smart Match/SOS/renewal/transfer chưa có |
| 9 | Quanh đây & bản đồ | Map discovery, GPS fallback, viewport, clustering, preview/deep-link | F25–F29 | 🟡 Map bbox marker có; GPS fallback/client preview/deep-link chưa có |
| 10 | Giao dịch & FSM | Gift request, candidate selection, batch allocation, queue | M3 transaction | ⬜ |
| 11 | Giao dịch & FSM | Accepted/cancel/receiver confirm/auto-complete 5 ngày | M3 transaction | ⬜ |
| 12 | Chat | Chat text WSS, persistence, lifecycle read-only | M3 chat | ⬜ |
| 13 | QA | Regression/UAT Sprint 2 |  | ⬜ |

### Thứ tự bắt buộc trong Sprint 2

1. Hoàn thành M2.1: post media ownership, owner delete, legacy `/api/gift-posts` compatibility adapter,
   migration fixture/CI assertion.
2. Hoàn thành M2 map/discovery + WANTED/Smart Match/SOS theo roadmap.
3. Chỉ mở transaction khi post lifecycle/public visibility đã ổn định.
4. Chat không được tự tạo transaction state; chỉ phản ánh transaction lifecycle từ server.

---

## Sprint 3 · Group, affiliate, point và CMS nền

| # | Epic | Hạng mục | Mapping roadmap | Trạng thái |
| ---: | --- | --- | --- | --- |
| 14 | Group & affiliate | Create group, default-location snapshot, management/sub-team | M5 | ⬜ |
| 15 | Group & affiliate | Invite account mới, dissolve group khi owner xoá | M5 + F06 | ⬜ |
| 16 | Group & affiliate | Affiliate recurring, reward active member, idempotency/reversal | M5 | ⬜ |
| 17 | Group & affiliate | Geo eligibility và audit mọi event | M5 | ⬜ |
| 18 | Point & review | Point rule/ledger, review quality, giver accuracy | M4 | ⬜ Ledger là prerequisite |
| 19 | Nội dung đặc thù | Charity/Event, Classified, ads, Merit | M2 extension | ⬜ |
| 20 | Admin CMS | Rule config, moderation cơ bản | M6 | ⬜ |
| 21 | QA | Integration/UAT Sprint 3 |  | ⬜ |

### Điều kiện mở Sprint 3

- M4 point ledger idempotent phải tồn tại trước mọi award/penalty.
- M5 affiliate cần geo eligibility/audit và anti-fraud trước khi mở cho người dùng.
- Không dùng temporary username allowlist làm Admin CMS thay thế lâu dài.

---

## Sprint 4 · Vận hành, anti-fraud, UAT và bàn giao

| # | Epic | Hạng mục | Mapping roadmap | Trạng thái |
| ---: | --- | --- | --- | --- |
| 22 | Admin CMS | KPI, category/notification, campaign, dynamic home, blog | M6 | ⬜ |
| 23 | Báo cáo & anti-fraud | Report/moderation/referral-point anti-fraud/reversal | M5–M6 | ⬜ |
| 24 | Thông báo & lịch âm | FCM/in-app, regional, lunar calendar, rank/cycle notification | M3/M4 | ⬜ |
| 25 | Hạ tầng & bảo mật | Backup/restore, logging, monitoring, security hardening | M6 | ⬜ |
| 26 | QA & UAT | End-to-end regression, RTM/UAT, fix/retest | M6 | ⬜ |
| 27 | Triển khai & bàn giao | Store build, production deploy, source/DB/config/docs handover | M6 | ⬜ |
| 28 | QA & nghiệm thu | Checklist, demo, acceptance support | M6 | ⬜ |

### Definition of done Sprint 4

- Backup **và restore test** đã chạy.
- Monitoring/alerting/global rate limit có hiệu lực.
- Email/SMS và R2 staging/prod có delivery/upload acceptance thật.
- Regression/UAT, production deploy và handover có biên bản/checklist.

---

## Nguyên tắc theo dõi

1. Cập nhật trạng thái tại tài liệu này **và** `docs/plan/ROADMAP.md` khi hoàn thành scope.
2. Capability chỉ có mock/contract ghi là 🟡; không ghi ✅ production-ready.
3. Release blocker chi tiết xem [`plan/DEFERRED.md`](./plan/DEFERRED.md).
4. Chức năng chi tiết xem [`FEATURES.md`](./FEATURES.md); cấu trúc dữ liệu và thứ tự milestone xem
   [`plan/DATA-MODEL.md`](./plan/DATA-MODEL.md), [`plan/ROADMAP.md`](./plan/ROADMAP.md).
