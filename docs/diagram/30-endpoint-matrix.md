# 30 · Ma trận endpoint × quyền × trạng thái

Bảng tra nhanh: mỗi endpoint cần gì, và nó đã chạy được chưa. 62 endpoint đang có.

## 30.1 Ba mức truy cập

```mermaid
flowchart LR
    A["Công khai<br/>không cần token"] --> A1["/discovery/config<br/>/auth/register · login · refresh<br/>/auth/password-reset/*<br/>/categories"]
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
| `DELETE /auth/account` | token | ⚠️ chưa chặn lượt trao dở dang |
| `GET /auth/me` | token | ✅ |
| `GET /profile/me` · `PATCH /profile/me` | token | ✅ |
| `PATCH /profile/me/avatar-upload` | token | ✅ |
| `PATCH /profile/me/phone-verification/request` · `/confirm` | token | 🟡 chưa có adapter SMS |
| `GET /profile/:username` | token | ✅ |
| `GET /onboarding/tasks` · `/evaluate` · `/:key/trigger` | token | ✅ |
| `GET /me/entitlements` | token | ✅ |
| `GET /referrals/me` | token | ✅ |

## 30.3 Bài đăng & khám phá

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts` | token + quota rank | ✅ |
| `GET /posts/nearby` · `/map` · `/me` | token | ✅ |
| `GET /posts/:postId` | token | ✅ jitter toạ độ |
| `PATCH /posts/:postId` · `DELETE` | chủ bài | ✅ |
| `POST /posts/:postId/renew` | chủ bài | ✅ 1 lần |
| `POST /posts/:postId/media/upload` · `/media` · `/media/order` · `DELETE /media/:id` | chủ bài | ✅ |
| `GET /posts/:postId/matches` | token | ✅ |
| `GET /requests/me` | token | ✅ yêu cầu của chính người gọi |
| `GET /transactions/:id` | hai bên trong cuộc | ✅ người ngoài nhận 404 |
| `PATCH /admin/transactions/:id/reopen` | `admin.manage` | ✅ mở lại lượt đóng nhầm |
| `POST /posts/:id/requests/:requestId/reject` | chủ bài | ✅ chỉ PENDING/STANDBY |
| `POST /posts/:postId/charity-transfer` · `PATCH` | chủ bài / Admin | ✅ |
| `POST|GET|PATCH|DELETE /gift-posts/*` | token | ✅ lớp tương thích |
| `GET /discovery/config` | công khai | ✅ |
| `GET /categories` | công khai | ✅ |
| `POST /categories` · `PATCH /categories/:id` | `category.manage` | ✅ |

## 30.4 Tương tác

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts/:id/comments` · `GET` | `COMMENT_CONTENT` | ✅ trần 10/phút + 200/24 giờ |
| `GET /comments/:id/replies` | token | ✅ |
| `PATCH` · `DELETE /comments/:id` | tác giả | ✅ |
| `POST /posts/:id/comment-media/upload-url` | token | ✅ |
| `PUT` · `DELETE /posts/:id/reactions/me` | `REACT_CONTENT` | ✅ nút thích; không trần, gửi trùng không ghi |
| `GET /posts/:id/reactions` | token | ✅ |
| `PUT` · `DELETE /comments/:id/reactions/me` | `REACT_CONTENT` | ✅ |
| `POST /posts/:id/shares` | token | ✅ chờ 1 giờ mỗi người mỗi bài |

## 30.5 Giao dịch & chat

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `POST /posts/:id/requests` · `/withdraw` | token | ⚠️ chưa gắn cổng F07 |
| `GET /posts/:id/requests` | chủ bài | ✅ |
| `POST /posts/:id/requests/:requestId/accept` | chủ bài | ✅ |
| `POST /transactions` · `/accept` | bên liên quan | ✅ |
| `POST /transactions/:id/evidence/upload-url` | bên liên quan | ✅ |
| `POST /transactions/:id/handover` | người tặng | ✅ |
| `POST /transactions/:id/confirm` | người nhận | ⛔ chưa cộng điểm |
| `POST /transactions/:id/cancel` | bên liên quan | ✅ |
| `POST /transactions/:id/reports/ship-unpaid` | **chỉ người gửi** | ✅ |
| `GET /transactions/me` | token | ✅ |
| `POST` · `GET /transactions/:id/reviews` | bên liên quan | ✅ |
| `GET /chat/rooms` · `/messages` · `POST /messages` | thành viên phòng | ⚠️ chưa gắn cổng F07 |
| `POST /chat/rooms/:id/message-media/upload-url` | thành viên phòng | ✅ |
| `PATCH /chat/rooms/:id/read` | thành viên phòng | ✅ |
| `GET /notifications/me` · `PATCH /read` | token | ✅ |

## 30.6 Điểm, hạng, báo xấu

| Endpoint | Truy cập | Trạng thái |
| --- | --- | --- |
| `GET /points/me` · `/ledger` | token | ⚠️ chưa phản ánh mô hình rank mới |
| `GET /ranks/me` | token | ⚠️ đọc `lifetime` |
| `POST /ranks/maintenance/evaluate` | `rank.operate` | ✅ |
| `POST /reports` | token | ✅ POST/USER/COMMENT |

## 30.7 Admin

| Endpoint | Quyền | Trạng thái |
| --- | --- | --- |
| `GET` · `POST /admin/system-configs` | `config.read` / `config.write` | ✅ |
| `GET` · `PUT /admin/candidate-selection` | `config.*` | ✅ |
| `GET /admin/audit-logs` | `audit.read` | ✅ |
| `GET /admin/system-logs` | `audit.read` | ✅ |
| `GET /admin/me` · `/roles` | token | ✅ |
| `POST` · `DELETE /admin/users/:id/roles` | `admin.manage` | ✅ |
| `GET /admin/users` · `/:id` | `admin.manage` | ✅ |
| `PATCH /admin/users/:id/status` · `DELETE` | `admin.manage` | ✅ |
| `GET` · `POST /admin/points/rules` | `config.*` | ✅ |
| `POST /admin/points/ledger/:id/reversal` | `point.adjust` | ✅ |
| `GET` · `POST /admin/ranks/policy` · `/maintenance` | `rank.operate` | ✅ |
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

## 30.7b Nhóm — `/groups`

| Endpoint | Cổng | Có |
| --- | --- | --- |
| `POST /groups` | token + hồ sơ + onboarding + rank + có Default Location | ✅ |
| `GET /groups/me` | token | ✅ |
| `GET /groups/:groupId/members` | `group.member.view` **trên nhóm đó** | ✅ |
| `GET /groups/:groupId/sub-teams` | `group.member.view` **trên nhóm đó** | ✅ |
| `POST /groups/:groupId/sub-teams` | `group.subteam.manage` — chỉ Owner | ✅ |
| `PATCH /groups/:groupId/members/:memberId` | `group.member.assign_role` | ✅ |

Vào nhóm KHÔNG có endpoint riêng: `POST /auth/register` kèm `inviteCode` là đường duy nhất
(F54/BR-GRP-04). Rời nhóm và chuyển nhóm cũng không có, và đó là chủ ý (BR-GRP-06).

## 30.8 Còn thiếu gì

```mermaid
flowchart TD
    B["⛔ Affiliate"] --> B1["GET /groups/:id/affiliate<br/>GET /groups/:id/events"]
    D["⛔ Dashboard"] --> D1["GET /admin/kpi/*"]
    E["⛔ Campaign & Blog"] --> E1["/admin/campaigns · /admin/posts-blog<br/>/blog"]
    F["⛔ Dharma Hub"] --> F1["/dharma/* — sáu tiểu mục, chưa có đặc tả API"]

    A["✅ Group đã xong"] --> A1["sáu endpoint, xem §30.7b"]
    C["✅ Đổi điểm đã xong"] --> C1["POST /posts/:postId/redeem"]

    style A fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style C fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style B fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style D fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style E fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style F fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

## Chỗ cần soát

1. **Ba endpoint cần gắn cổng hồ sơ F07** (xin nhận, chat, tạo Group) — cả ba đã gắn.
2. **`POST /transactions/:id/confirm` chưa cộng điểm** — lỗ hổng lớn nhất.
3. **`GET /points/me` và `/ranks/me` chưa phản ánh mô hình rank chốt 2026-09-24.**
4. `POST /reports` nhận `COMMENT` nhưng **`targetLabel` cho bình luận** cần soát xem Admin có
   đủ thông tin để quyết mà không phải mở từng cái không.
