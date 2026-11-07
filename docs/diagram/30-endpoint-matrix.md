# 30 · Ma trận endpoint × quyền × trạng thái

Bảng tra nhanh: mỗi endpoint cần gì, và nó đã chạy được chưa.

> **Bảng này GOM NHÓM và CHÚ THÍCH, không đầy đủ.** Danh sách route ĐẦY ĐỦ là
> [`docs/API-ROUTES.md`](../API-ROUTES.md) — sinh tự động bởi `npm run docs:routes` từ metadata
> controller, CI chạy `docs:routes:check` nên nó không thể lệch code. Mức truy cập ở đó
> (`Công khai` / `Bearer` / `perm:<mã>`) là nguồn đúng; bảng dưới đây chỉ thêm phần nó không
> nói được: cổng nghiệp vụ nào chặn và trạng thái của từng phân hệ.

> **Không ghi tổng số endpoint ở đây nữa** (30/09). Con số "62" đã lạc hậu, và bản sửa nó ghi "154" cũng lạc hậu nốt — chính câu này
> từng vừa nói "không ghi tổng số" vừa ghi một tổng số (sửa 01/10). Cùng bài học với số bảng ở [27](./27-database.md): một con số đếm tay thì
> luôn chậm hơn commit mới nhất. Lấy danh sách thật từ `GET /docs/json`, hoặc:
>
> ```bash
> grep -rhoE '@(Get|Post|Put|Patch|Delete)\(' \
>   suites/chantam.vn/chantam/core/src/infrastructure/controller/api --include=*.ts | wc -l
> ```

## 30.1 Ba mức truy cập

```mermaid
flowchart LR
    A["Công khai<br/>không cần token"] --> A1["/discovery/config<br/>/auth/register · login · refresh<br/>/auth/password-reset/*<br/>/categories · đọc bài, bình luận, hồ sơ<br/>xem đủ ở API-ROUTES.md"]
    B["Đã đăng nhập"] --> B1["Phần lớn endpoint<br/>kiểm quyền sở hữu trong use case"]
    C["Cần quyền RBAC"] --> C1["Mọi thứ dưới /admin<br/>+ /ranks/maintenance/evaluate"]

    style A fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
    style C fill:#fff9e6,stroke:#c9a227,stroke-width:1.5px,color:#3d3000
```

## 30.2 Xác thực & hồ sơ

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /auth/register` | công khai | ✅ |
| `POST /auth/login` | công khai | ✅ |
| `POST /auth/refresh` | công khai | ✅ |
| `POST /auth/logout` | token | ✅ |
| `POST /auth/password-reset/request` | công khai | ✅ 🟡 email |
| `POST /auth/password-reset/confirm` | công khai | ✅ |
| `DELETE /auth/account` | token | ✅ chặn khi còn lượt trao dở dang (`UserHasOpenTransactionsException`) |
| `GET /auth/me` | token | ✅ |
| `GET /profile/me` · `PATCH /profile/me` | token | ✅ |
| `PATCH /profile/me/avatar-upload` | token | ✅ |
| `PATCH /profile/me/phone-verification/request` · `/confirm` | token | 🟡 chưa có adapter SMS |
| `GET /profile/:username` · `/:username/posts` | công khai | ✅ |
| `GET /onboarding/tasks` · `/evaluate` · `/:key/trigger` | token | ✅ |
| `GET /me/entitlements` | token | ✅ |
| `GET /referrals/me` | token | ✅ |

## 30.3 Bài đăng & khám phá

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts` | token + quota rank | ✅ |
| `GET /posts/nearby` · `/map` · `/share/:shareCode` | công khai | ✅ |
| `GET /posts/me` | token | ✅ |
| `GET /posts/sos-urgent` | công khai | ✅ |
| `GET /check-ins/me` · `/me/history` | token | ✅ |
| `POST /check-ins` · `/check-ins/repairs` | token | ✅ |
| `GET /posts/:postId` | công khai | ✅ jitter toạ độ — trừ chính tác giả, kèm `canEdit` |
| `PATCH /posts/:postId` | chủ bài | ✅ chặn khi có giao dịch `ACCEPTED`/`DELIVERING` |
| `DELETE /posts/:postId` | chủ bài | ✅ chặn khi bài `RESERVED`/`DELIVERING` |
| `POST /posts/:postId/renew` | chủ bài | ✅ 1 lần |
| `POST /posts/:postId/media/upload` · `/media` · `/media/order` · `DELETE /media/:id` | chủ bài | ✅ cùng khoá với `PATCH` |
| `GET /posts/:postId/matches` | token | ✅ |
| `GET /requests/me` | token | ✅ yêu cầu của chính người gọi |
| `GET /transactions/:id` | hai bên trong cuộc | ✅ người ngoài nhận 404 |
| `PATCH /admin/transactions/:id/reopen` | `admin.manage` | ✅ mở lại lượt đóng nhầm |
| `DELETE /chat/rooms/:id/messages/:id` | người gửi | ✅ thu hồi trong 5 phút |
| `PATCH /chat/rooms/:id/mute` | trong phòng | ✅ tắt chuông, không chặn tin |
| `GET` · `PATCH /notifications/me/preferences` | token | ✅ tắt/bật theo nhóm |
| `GET /admin/chat/rooms/:id/messages` | `report.read` | ✅ chỉ khi có báo xấu đang mở |
| `POST /posts/:id/requests/:requestId/reject` | chủ bài | ✅ chỉ PENDING/STANDBY |
| `POST /posts/:postId/charity-transfer` · `PATCH` | chủ bài / Admin | ✅ |
| `GET /gift-posts/nearby` · `/:giftPostId` | công khai | ✅ lớp tương thích |
| `POST|PATCH|DELETE /gift-posts/*` | token | ✅ lớp tương thích |
| `GET /discovery/config` | công khai | ✅ |
| `GET /categories` | công khai | ✅ |
| `POST /categories` · `PATCH /categories/:id` | `category.manage` | ✅ |

## 30.4 Tương tác

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts/:id/comments` | `COMMENT_CONTENT` | ✅ trần 10/phút + 200/24 giờ |
| `GET /posts/:id/comments` | công khai | ✅ |
| `GET /comments/:id/replies` | công khai | ✅ |
| `PATCH` · `DELETE /comments/:id` | tác giả | ✅ |
| `POST /posts/:id/comment-media/upload-url` | token | ✅ |
| `PUT` · `DELETE /posts/:id/reactions/me` | `REACT_CONTENT` | ✅ nút thích; không trần, gửi trùng không ghi |
| `GET /posts/:id/reactions` | công khai | ✅ |
| `PUT` · `DELETE /comments/:id/reactions/me` | `REACT_CONTENT` | ✅ |
| `POST /posts/:id/shares` | token | ✅ chờ 1 giờ mỗi người mỗi bài |

## 30.5 Giao dịch & chat

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts/:id/requests` · `/withdraw` | token | ✅ xin nhận qua cổng hồ sơ F07 |
| `GET /posts/:id/requests` | chủ bài | ✅ |
| `POST /posts/:id/requests/:requestId/accept` | chủ bài | ✅ |
| `POST /posts/:id/batch-accept` | chủ bài | ✅ |
| `POST /posts/:wantedPostId/offer-gift` | token | ✅ |
| `POST /transactions/:id/evidence/upload-url` | bên liên quan | ✅ |
| `POST /transactions/:id/handover` | người tặng | ✅ |
| `POST /transactions/:id/confirm` | người nhận | ✅ điểm cộng qua đánh giá, hoặc `gift:settle-rewards` sau 7 ngày |
| `POST /transactions/:id/cancel` | bên liên quan | ✅ |
| `POST /transactions/:id/reports/ship-unpaid` | **chỉ người gửi** | ✅ |
| `GET /transactions/me` | token | ✅ |
| `POST` · `GET /transactions/:id/reviews` | bên liên quan | ✅ |
| `GET /chat/rooms` · `/messages` · `POST /messages` | thành viên phòng | ✅ gửi tin qua cổng hồ sơ F07 |
| `POST /chat/direct-post/rooms` · `/chat/direct-user/rooms` | token | ✅ mở phòng trực tiếp, cổng F07 |
| `POST /chat/rooms/:id/message-media/upload-url` | thành viên phòng | ✅ |
| `PATCH /chat/rooms/:id/read` | thành viên phòng | ✅ |
| `GET /notifications/me` · `PATCH /read` | token | ✅ |

## 30.6 Điểm, hạng, báo xấu

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `GET /points/me` · `/ledger` | token | ⚠️ chưa phản ánh mô hình rank mới |
| `GET /ranks/me` | token | ✅ khoảng cách tới hạng sau tính theo **số dư** (`balancePoints`), không theo `lifetime` |
| `POST /ranks/maintenance/evaluate` | `rank.operate` | ✅ |
| `POST /reports` | token | ✅ POST/USER/COMMENT |

## 30.7 Admin

| Endpoint | Quyền | Trạng thái |
| --- | --- | --- |
| `GET` · `POST /admin/system-configs` | `config.read` / `config.write` | ✅ |
| `GET` · `PUT /admin/candidate-selection` | `config.*` | ✅ |
| `GET /admin/audit-logs` | `audit.read` | ✅ |
| `GET /admin/system-logs` | `audit.read` | ✅ |
| `GET /admin/me` | `admin.access` | ✅ |
| `GET` · `POST /admin/roles` · `PATCH /admin/roles/:roleCode` · `GET /admin/permissions` | `admin.manage` | ✅ vai trò tuỳ biến |
| `POST` · `DELETE /admin/users/:id/roles` | `admin.manage` | ✅ |
| `GET /admin/users` · `/:id` | `admin.manage` | ✅ |
| `PATCH /admin/users/:id/status` · `DELETE` | `admin.manage` | ✅ |
| `GET` · `POST /admin/points/rules` | `config.*` | ✅ |
| `POST /admin/points/ledger/:id/reversal` | `point.adjust` | ✅ |
| `POST /admin/points/adjust` | `point.adjust` | ✅ |
| `GET|PUT /admin/check-in-policy` | `config.read`/`config.write` | ✅ |
| `GET` · `POST /admin/ranks/policy` · `POST /policy/maintenance` | `config.read` / `config.write` | ✅ |
| `GET` · `POST /admin/entitlements` | `entitlement.*` | ✅ |
| `GET` · `PUT /admin/notification-channels/:channel` | `notification.manage` | ✅ |
| `GET` · `PUT /admin/notification-templates/:type` | `notification.manage` | ✅ |
| `GET /admin/posts` · `/:id` | `post.read` | ✅ |
| `PATCH /admin/posts/:id/moderation` | `post.moderate` | ✅ |
| `GET /admin/comments/pending-count` | `post.moderate` | ✅ huy hiệu menu CMS |
| `GET /admin/comments` | `post.moderate` | ✅ hàng đợi bình luận chờ duyệt |
| `PATCH /admin/comments/:id/moderation` | `post.moderate` | ✅ |
| `GET /admin/reports` · `/:id` | `report.read` | ✅ |
| `PATCH /admin/reports/:id/review` | `report.resolve` | ✅ |
| `GET /admin/categories` | `category.read` | ✅ |
| `GET /admin/config/trust-thresholds` · `PUT /…/{giver-accuracy,report-abuse,review-rating}` | `config.read` / `config.write` | ✅ |
| `GET` · `PUT /admin/config/allocation-policy` | `config.read` / `config.write` | ✅ |
| `GET` · `PUT /admin/lunar-holidays` | `config.read` / `config.write` | ✅ |
| `GET` · `PUT /admin/affiliate-policy` · `GET /admin/affiliate-events[/:eventId/rewards]` | `config.read` / `config.write` | ✅ |
| `POST /admin/affiliate-events/:eventId/reversal` | `point.adjust` | ✅ thu hồi toàn bộ reward của sự kiện |
| `GET /admin/media` · `POST /admin/media[/upload]` | `admin.access` + một quyền soạn nội dung (`banner`/`blog`/`campaign`/`dharma`/`merit.manage`) | ✅ |
| `POST /admin/media/audio/upload` · `POST /admin/media/audio` | `admin.access` + `dharma.manage` | ✅ âm thanh Phật pháp mp3/m4a/aac ≤ 50 MB |
| `GET /admin/groups[/:groupId[/members]]` | `admin.access` | ✅ |
| `POST /admin/groups/:groupId/dissolve` · `/invite-link/rotate` | `admin.manage` | ✅ |
| `GET /admin/transactions[/:transactionId]` · `GET /admin/recipient-selections[/:transactionId]` | `post.read` | ✅ |
| `GET /admin/attribution/claims` · `GET /admin/referrals/review` | `report.read` | ✅ hàng đợi `PENDING_REVIEW` |
| `POST /admin/attribution/claims/:claimId/review` · `/revocations` | `report.resolve` | ✅ |
| `/admin/leaderboards/*` · `/admin/badges` | `leaderboard.read` / `leaderboard.moderate` | ✅ |
| `/admin/banners/*` | `banner.read` / `banner.manage` | ✅ |
| `/admin/charity-campaigns/*` · `/admin/campaigns/*` | `campaign.read` / `campaign.manage` | ✅ |
| `/admin/dharma/contents/*` | `dharma.read` / `dharma.manage` | ✅ |
| `/admin/dharma/threads[/:id/moderation]` | `post.moderate` | ✅ |
| `/admin/merit-units/*` | `merit.read` / `merit.manage` | ✅ |

## 30.7a Phân hệ người dùng khác (gom nhóm)

| Nhóm route | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /attribution/clicks` · `/resolve` | công khai | ✅ deferred attribution |
| `POST /attribution/links` · `/claim` | token | ✅ claim ≤ 7 ngày sau đăng ký, xem [23](./23-referral.md) |
| `GET` · `POST /me/blocks` · `DELETE /me/blocks/:userId` | token | ✅ chặn người dùng |
| `PUT /presence/me` | token | ✅ |
| `GET /presence/surfaces/:surface` | công khai | ✅ trả `userId` khi người gọi đã đăng nhập |
| `GET /leaderboards/monthly` · `/months` | công khai | ✅ |
| `GET /leaderboards/monthly/me` · `GET /profile/me/badges` | token | ✅ |
| `/charity-campaigns/*` · `/charity-contributions/*` · `/charity-deliveries/*` | token (quyền chủ/điều phối trong use case) | ✅ F65b |
| `GET /campaigns[/:idOrSlug[/needs]]` | công khai | ✅ |
| `GET /dharma/{hub,contents,threads,dedications,leaderboards/*}` | công khai | ✅ |
| `POST /dharma/threads` · `/recitations` · `/dedications` · bình luận/reaction | token | ✅ |
| `GET /merit-units[/:idOrSlug]` | công khai | ✅ |
| `POST /merit-units/:id/declarations` · `/declarations/*` | token | ✅ |
| `GET /banners` · `POST /banners/:id/click` | công khai | ✅ |
| `GET /config/home-layout` · `/config/lunar-today` | công khai | ✅ |

## 30.7b Nhóm — `/groups`

| Endpoint | Cổng | Có |
| --- | --- | --- |
| `POST /groups` | token + hồ sơ + onboarding + rank + có Default Location | ✅ |
| `GET /groups/me` | token | ✅ |
| `GET /groups/:groupId` | `group.overview.view` | ✅ |
| `PATCH /groups/:groupId` | `group.settings.manage` — chỉ Owner; KHÔNG sửa tâm/bán kính | ✅ |
| `GET /groups/:groupId/activities` | `group.activity.view` (cả nhóm) HOẶC `group.subteam.activity.view` (chỉ tổ mình) | ✅ |
| `GET /groups/:groupId/invite` | `group.invite.view` — chỉ Owner | ✅ |
| `GET /groups/:groupId/invite-link` | ⬆ — tên theo SRS 3.7A | ✅ |
| `GET /groups/invites/:inviteCode` | công khai — xem trước nhóm theo mã mời | ✅ |
| `GET /groups/:groupId/affiliate` | `group.affiliate.view` — chỉ Owner; trả ĐIỀU KIỆN, không phải điểm đã chia | ✅ |
| `GET /groups/:groupId/members` | `group.member.view` (cả nhóm) HOẶC `group.subteam.member.view` (chỉ tổ mình) | ✅ |
| `GET /groups/:groupId/sub-teams` | ⬆ cùng cặp quyền | ✅ |
| `POST /groups/:groupId/sub-teams` | `group.subteam.manage` — chỉ Owner | ✅ |
| `DELETE /groups/:groupId/sub-teams/:subTeamId` | ⬆ — người trong tổ Ở LẠI nhóm, trưởng tổ hạ về MEMBER | ✅ |
| `PATCH /groups/:groupId/members/:memberId` | `group.member.assign_role` — bỏ trống `subTeamId` là GIỮ tổ | ✅ |
| `GET\|PUT /admin/groups/role-permissions[/:role]` | `config.read` / `config.write` | ✅ |
| `GET\|PUT /admin/groups/radius-policy` | ⬆ — canh bất biến đơn điệu theo bậc | ✅ |
| `GET /admin/chat/flags` · `/pending-count` | `report.read` | ✅ |
| `PATCH /admin/chat/flags/:flagId/review` | `report.resolve` | ✅ |

Vào nhóm KHÔNG có endpoint riêng: `POST /auth/register` kèm `inviteCode` là đường duy nhất
(F54/BR-GRP-04). Rời nhóm và chuyển nhóm cũng không có, và đó là chủ ý (BR-GRP-06).

> **Quyền nhóm luôn mang phạm vi một nhóm.** Mọi dòng trên đi qua
> `hasGroupPermission(userId, groupId, permission)`, không phải `hasPermission` toàn cục — RBAC
> Admin không diễn đạt được "có quyền X trên nhóm nào", nên gán `group.member.assign_role` ở đó
> cho một trưởng nhóm là cho họ quyền trên **mọi** nhóm. Xem [18 §18.3](./18-group.md).
>
> Mười trên mười quyền nhóm nay đều có dòng code kiểm — `test:config-inventory` đỏ nếu ai seed
> thêm một mã mà không khai nó đọc ở đâu.

## 30.8 Còn thiếu gì

```mermaid
flowchart TD
    B["✅ Affiliate"] --> B1["GET /groups/:id/affiliate<br/>/admin/affiliate-policy · /admin/affiliate-events"]
    H["✅ Gửi thông báo hàng loạt"] --> H1["POST|GET /admin/notifications/broadcasts<br/>CLI notify:broadcast — ALL · GROUP · AREA"]
    D["✅ Dashboard KPI"] --> D1["GET /admin/dashboard — 10 khối<br/>points · completionRate · groups · affiliate · accuracy"]
    E["✅ Blog đã xong"] --> E1["GET|POST /admin/blogs · PUT|DELETE /admin/blogs/:id<br/>GET /blogs · GET /blogs/:idOrSlug — HTML lọc ở tầng ghi"]
    G["✅ Campaign & Home động"] --> G1["GET|POST /admin/campaigns · GET|PUT /admin/campaigns/:id<br/>GET /config/home-layout — đệm Redis TTL 1h"]
    F["✅ Dharma Hub"] --> F1["/dharma/* — hub · nội dung · diễn đàn · tụng niệm · hồi hướng · bảng xếp hạng"]

    A["✅ Group đã xong"] --> A1["14 endpoint người dùng + 9 Admin, xem §30.7b"]
    C["✅ Đổi điểm đã xong"] --> C1["POST /posts/:postId/redeem"]

    style A fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style C fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style B fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style D fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style E fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style F fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style G fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style H fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

## Chỗ cần soát

1. **Ba endpoint cần gắn cổng hồ sơ F07** (xin nhận, chat, tạo Group) — cả ba đã gắn.
2. ✅ **Đã sửa 25/09.** Hoàn tất lượt trao sinh điểm qua đường đánh giá, hoặc qua
   `gift:settle-rewards` sau 7 ngày nếu người nhận không đánh giá — xem
   [21 §21.4](./21-open-issues.md) mục 1.
3. ✅ **Đã phản ánh, và đã sửa lại 02/10.** Xét hạng đọc `balance` — **chỉ** `balance`.
   Câu "hoặc `lifetime` nếu Admin đổi `rank.points_source`" ở bản trước là sai: khoá đó
   không nằm trong `SupportedSystemConfigKeys` nên Admin không có đường API nào đổi, và cả
   nhánh `lifetime` đã bị gỡ ở commit `1cf6f01`. `test:rank-balance` canh đúng điều đó.
4. ✅ **Đã có `targetLabel` cho bình luận** (đợt 15-report): trích đoạn đầu `body` cùng tên tác
   giả, đủ để Admin quyết mà không phải mở từng cái.
5. ✅ **Bảng trên liệt kê theo phân hệ, không theo từng route.** Bảng đầy đủ nay là
   [`docs/API-ROUTES.md`](../API-ROUTES.md), sinh từ code và được CI canh (`docs:routes:check`).
   Bảng này giữ lại vì nó trả lời câu khác: cổng nghiệp vụ nào chặn endpoint.
