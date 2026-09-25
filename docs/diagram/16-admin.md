# 16 · Admin CMS & RBAC

Trạng thái: ✅ **đã hiện thực**. Allowlist theo username đã bị gỡ hoàn toàn.

## 16.1 Mô hình quyền

```mermaid
erDiagram
    admin_roles ||--o{ admin_role_permissions : "có"
    admin_permissions ||--o{ admin_role_permissions : "thuộc"
    admin_roles ||--o{ admin_user_roles : "gán cho"
    users ||--o{ admin_user_roles : "nhận"
```

15 quyền hiện có:

| Nhóm | Quyền |
| --- | --- |
| Cấu hình | `config.read` · `config.write` |
| Quyền hạn | `admin.manage` |
| Kiểm toán | `audit.read` |
| Danh mục | `category.read` · `category.manage` |
| Bài đăng | `post.read` · `post.moderate` |
| Báo xấu | `report.read` · `report.resolve` |
| Điểm | `point.adjust` |
| Hạng | `rank.operate` |
| Đặc quyền | `entitlement.read` · `entitlement.write` |
| Thông báo | `notification.manage` |

## 16.2 Guard mặc định đóng

```mermaid
flowchart TD
    A[Request tới] --> B{Có @RequiresPermission?}
    B -->|Có| C{hasPermission từ DATABASE?}
    C -->|Có| D[✅ Cho qua]
    C -->|Không| E[❌ 403]
    B -->|Không| F{"URL khớp /admin?"}
    F -->|Có| G["❌ 403 — QUÊN KHAI QUYỀN<br/>route admin không khai là KHOÁ"]
    F -->|Không| D

    style G fill:#fff3cd
```

> **Vì sao mặc định đóng.** Thêm endpoint admin mà quên decorator thì nó khoá ngay lần gọi
> đầu, và người viết biết ngay. Hướng ngược lại là lặng lẽ mở một cửa quản trị mà không ai
> phát hiện cho tới khi có người đi qua.
>
> **Vì sao đọc quyền từ database chứ không từ token.** Thu hồi quyền của một người phải có
> hiệu lực ngay, không phải chờ token họ hết hạn.
>
> **Use case vẫn tự kiểm quyền** vì còn đường gọi khác ngoài HTTP — CLI và job nền không đi
> qua guard nào.

## 16.3 Cấu hình động copy-on-write

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant API as POST /admin/system-configs
    participant DB as system_configs
    participant AU as admin_audit_logs

    A->>API: key, value, reason
    API->>API: Kiểm quyền config.write
    API->>API: Mở transaction
    API->>DB: SELECT bản PUBLISHED hiện tại FOR UPDATE
    API->>DB: UPDATE bản cũ SET effective_to = now()
    API->>DB: INSERT bản mới (version + 1, PUBLISHED)
    API->>AU: Ghi before_json / after_json / reason / actor
    API->>API: Commit
```

> **Vì sao không UPDATE tại chỗ.** Khi một bút toán điểm phát sinh, phải tra được nó ra đời
> dưới phiên bản cấu hình nào. UPDATE tại chỗ xoá mất câu trả lời đó vĩnh viễn.

Các khoá cấu hình đang có:

| Khoá | Nội dung |
| --- | --- |
| `accuracy.giver` | `minSamples`, `reviewThresholdPercent` |
| `selection.candidate_priority` | Thứ tự bộ tiêu chí chọn người nhận |
| *(bí mật SMTP/Zalo)* | Mã hoá tại chỗ, **không API nào trả về** |

## 16.4 Các mặt quản trị

```mermaid
flowchart TD
    subgraph Người["Người dùng & quyền"]
        A1["GET /admin/users"]
        A2["PATCH /admin/users/:id/status"]
        A3["POST hoặc DELETE /admin/users/:id/roles"]
        A4["GET /admin/roles"]
    end
    subgraph Nội["Nội dung"]
        B1["GET /admin/posts"]
        B2["PATCH /admin/posts/:id/moderation<br/>HẬU KIỂM — gỡ hoặc trả lại"]
        B3["GET, PATCH /admin/reports"]
        B4["GET /admin/categories"]
    end
    subgraph Cấu["Cấu hình"]
        C1["GET, POST /admin/system-configs"]
        C2["GET, POST /admin/points/rules"]
        C3["GET, POST /admin/ranks/policy"]
        C4["GET, POST /admin/entitlements"]
        C5["GET, PUT /admin/candidate-selection"]
        C6["GET, PUT /admin/notification-templates/:type"]
        C7["GET, PUT /admin/notification-channels/:channel"]
    end
    subgraph Vận["Vận hành"]
        D1["POST /admin/points/ledger/:id/reversal"]
        D2["POST /admin/ranks/policy/maintenance"]
        D3["GET /admin/audit-logs"]
        D4["GET /admin/system-logs"]
    end
```

## 16.5 Bí mật không bao giờ quay ra

```mermaid
flowchart LR
    A[Admin nhập mật khẩu SMTP] --> B[Mã hoá bằng ISecretCipher]
    B --> C[(Postgres — dạng đã mã hoá)]
    C --> D[Use case gửi mail giải mã khi dùng]
    C -.-> E["❌ KHÔNG API nào trả về<br/>kể cả cho SUPER_ADMIN"]

    style E fill:#ffe6e6
```

## Chỗ cần soát

1. ⛔ **Dashboard KPI (F59) chưa có gì.** Không có số liệu người dùng mới, bài theo danh mục,
   giao dịch hoàn tất, phân bổ rank, dung lượng.
2. ⛔ **Campaign & Home động (F63), Blog (F64), quản lý Từ thiện/Quảng cáo/Công đức (F65)**
   chưa có dòng nào.
3. **Chưa có hàng đợi cho hồ sơ bị gắn cờ accuracy** và **bình luận PENDING_REVIEW**.
4. Hai vai trò đã seed là `SUPER_ADMIN` và `MODERATOR`. Vai cho vận hành Group
   (`GROUP_ADMIN` / `SUBTEAM_ADMIN`) là **hệ riêng, không dùng bảng này** — xem
   [18-group](./18-group.md).
