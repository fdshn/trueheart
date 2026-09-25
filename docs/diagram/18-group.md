# 18 · Group & Sub-team

Trạng thái: ✅ **xong Phase 1** (26/09) — bảng, RBAC có phạm vi, tạo nhóm, xem nhóm của tôi,
vào nhóm qua link mời, danh sách thành viên, sub-team và phép xếp người vào tổ, giải tán khi
Owner xoá tài khoản. Script kiểm trên Postgres thật: `npm run test:group` (39 phép kiểm).

Sáu endpoint: `POST /groups`, `GET /groups/me`, `GET /groups/:groupId/members`,
`GET|POST /groups/:groupId/sub-teams`, `PATCH /groups/:groupId/members/:memberId` — chi tiết
ở [API.md §11](../API.md#11-nhóm--groups).

⛔ **Còn thiếu (Sprint 3, cần Bên A chốt):** affiliate event engine (F56) và điều kiện địa lý
bắt buộc (F57) — xem [`19-affiliate.md`](./19-affiliate.md).

## 18.1 Tạo Group — ✅

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant DB as Postgres

    U->>API: Cá nhân → Nhóm của tôi → Tạo nhóm
    API->>API: Rank đủ CREATE_GROUP? (baseline Kim Cương)
    alt Chưa đủ
        API-->>U: Hiện điều kiện cần đạt
    else Đủ
        API->>API: Đã có default_location chưa?
        alt Chưa có
            API-->>U: Bắt thiết lập Default Location trước
        else Có
            API->>API: Đã sở hữu Group nào chưa? (tối đa 1)
            U->>API: tên, ảnh, mô tả
            API->>DB: COPY users.default_location → groups.center_location
            API->>DB: SNAPSHOT radius từ Rank Config
            API->>DB: Sinh invite_code
            API-->>U: Group ACTIVE
        end
    end
```

> **Vì sao tâm và bán kính chụp lại tại thời điểm tạo và Owner không đổi được.** Cho đổi thì
> người ta dời vùng theo nơi đang có nhiều sự kiện để gom điểm. Snapshot cũng không đổi theo
> khi Owner đổi Default Location hoặc tụt rank (BR-GRP-03).

## 18.2 Vào nhóm — chỉ tài khoản mới ✅

```mermaid
flowchart TD
    A[Nhận link mời] --> B{Đã có tài khoản chưa?}
    B -->|Đã có| C["❌ KHÔNG vào được<br/>link chỉ dành cho tài khoản MỚI"]
    B -->|Chưa| D["POST /auth/register<br/>kèm inviteCode"]
    D --> D2[Tạo tài khoản trước]
    D2 --> E{"findActiveByInviteCode<br/>Group còn ACTIVE?"}
    E -->|Không| F["⚠️ BỎ QUA — đăng ký VẪN thành công,<br/>chỉ là không vào nhóm nào"]
    E -->|Có| G[✅ Tạo membership MEMBER]
    F --> H2[Trả session, tự đăng nhập]
    G --> H2

    H["Link KHÔNG tự hết hạn<br/>KHÔNG giới hạn số lượt"] -.-> A

    style C fill:#f8d7da
    style F fill:#fff3cd
```

**Chốt 2026-09-24: KHÔNG rời, KHÔNG chuyển nhóm.** Muốn sang nhóm khác thì tạo tài khoản mới.

> **Vì sao mã hỏng không làm hỏng việc đăng ký.** Tài khoản đã tạo xong trước khi đọc mã. Ném
> lỗi ở đây là bắt người ta đăng ký lại — phạt người dùng cho lỗi của người gửi link. Mã cũng
> đi qua `trim()` + viết hoa: dán link kèm khoảng trắng là chuyện thường.

> **Vì sao đây là chủ ý chứ không phải sót.** Membership chỉ sinh ra từ link mời dành cho tài
> khoản mới, và chính ràng buộc đó là hàng rào chặn việc một người nhảy vòng quanh các nhóm
> để gom affiliate. Cho rời tự do mà vẫn giữ hàng rào thì rời xong là kẹt ở ngoài vĩnh viễn —
> tệ hơn là không cho rời.

## 18.3 RBAC nhóm — TÁCH khỏi RBAC Admin ✅

```mermaid
flowchart TD
    subgraph Admin["RBAC Admin — TOÀN CỤC"]
        A1["admin_user_roles(user_id, role_id)"]
        A2["hasPermission(userId, 'report.resolve')"]
        A3["Không có cột nào chỉ PHẠM VI"]
    end
    subgraph Nhóm["RBAC Nhóm — CÓ PHẠM VI"]
        B1["group_memberships(group_id, user_id, sub_team_id, role, status)"]
        B2["group_role_permissions(role, permission)"]
        B3["hasGroupPermission(userId, groupId, permission)"]
    end

    C["❌ CÁI BẪY: nhét group.member.remove vào admin_permissions<br/>rồi gán cho một trưởng nhóm<br/>= cho họ quyền trên MỌI nhóm trong hệ thống"]
    Admin -.-> C
    C -.vì vậy phải dùng.-> Nhóm

    style C fill:#ffe6e6
    style Nhóm fill:#e6ffe6
```

## 18.4 Ba vai trong nhóm

```mermaid
flowchart LR
    O["OWNER<br/>toàn quyền quản lý nhóm mình"] --> G1[Tổng quan]
    O --> G2[Thành viên]
    O --> G3[Tạo/quản lý Sub-team]
    O --> G4[Link mời]
    O --> G5[Hoạt động / Sự kiện]
    O --> G6[Affiliate / điểm]
    O --> G7[Cài đặt]

    S["SUBTEAM_ADMIN<br/>trưởng nhóm con"] --> H1[Xem thành viên tổ mình]
    S --> H2[Xem hoạt động tổ mình]
    S -.-> H3["❌ KHÔNG tạo sub-team<br/>❌ KHÔNG xem affiliate toàn nhóm<br/>❌ KHÔNG quản lý link mời<br/>❌ KHÔNG đổi cài đặt"]

    M["MEMBER"] --> I1[Group Detail theo quyền được cấp]

    style H3 fill:#ffe6e6
```

Bộ quyền của `SUBTEAM_ADMIN` là **cấu hình Admin hệ thống**, không hard-code — bảng
`group_role_permissions`, có audit và đánh phiên bản như mọi cấu hình động khác.

> ⚠️ **SRS không có khái niệm trưởng nhóm.** BR-GRP-05 chỉ chia Owner và Member, và §3255
> nói sub-team *"chỉ để tổ chức"*. Thêm vai này là **mở rộng SRS**, không phải làm rõ.

## 18.5 Owner xoá tài khoản → Group giải tán (CHỐT-02) — ✅

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: Tạo nhóm
    ACTIVE --> DISSOLVED: Owner xoá tài khoản

    state DISSOLVED {
        [*] --> LinkVôHiệu
        LinkVôHiệu --> DừngThànhViênMới
        DừngThànhViênMới --> DừngAffiliate
    }

    DISSOLVED --> [*]

    note right of DISSOLVED
        GIỮ NGUYÊN: lịch sử membership,
        ledger và audit — để tra lại được.
        Không có chức năng "giải tán"
        do Owner chủ động (BR-GRP-06).
    end note
```

## 18.6 Sub-team — ✅

```mermaid
flowchart TD
    G["Group<br/>ví dụ: Quận Cầu Giấy"] --> S1["Sub-team<br/>Tổ Dịch Vọng"]
    G --> S2["Sub-team<br/>Tổ Nghĩa Tân"]
    S1 -.-> X["❌ KHÔNG có sub-team của sub-team<br/>đúng 1 tầng, Phase 1"]

    S1 --> M1[Thành viên]
    S2 --> M2[Thành viên]

    Z["Xếp người vào tổ:<br/>PATCH /groups/:id/members/:memberId<br/>subTeamId=null để gỡ ra"] -.-> S1

    Y["Affiliate depth = 1:<br/>một sự kiện hợp lệ chia cho<br/>TOÀN BỘ Active Member của GROUP,<br/>KHÔNG phân tầng theo sub-team"] -.-> G

    style X fill:#ffe6e6
    style Y fill:#fff3cd
```

> **Tổ phải thuộc CHÍNH nhóm đó.** Câu `UPDATE` trong `assignMember` mang thêm một vế
> `EXISTS (… AND team.group_id = $1)`. Thiếu nó thì Owner nhóm A xếp được người của mình vào
> tổ của nhóm B — chỉ cần đoán đúng một id. `test:group` canh đúng ca này.

## Chỗ cần soát

1. ⚠️ **Trưởng nhóm là mở rộng ngoài SRS** — cần Bên A biết.
2. **Bộ quyền khởi tạo cho `SUBTEAM_ADMIN`** mới là đề xuất, chưa ai duyệt.
3. **`SUBTEAM_ADMIN` chưa xem được danh sách thành viên qua API.** Họ có
   `group.subteam.member.view`, nhưng `GET /groups/:id/members` đòi `group.member.view` và trả
   **toàn nhóm**. Muốn trưởng tổ xem được thì phải lọc theo `sub_team_id` của chính họ — chưa
   làm, vì chưa rõ Bên A muốn trưởng tổ thấy đến đâu.
4. **Không có đường xoá tổ.** `sub_teams.deleted_at` đã có cột, chưa có endpoint. Xoá tổ còn
   người trong đó thì xử lý ra sao cũng chưa ai nói.
5. Bán kính lấy theo **Rank Config lúc tạo** — hiện đọc `limit` của capability `CREATE_GROUP`,
   nhưng capability đó seed là BOOLEAN (`allowed`) nên `limit` đang rỗng và rơi về 10km mặc
   định. Cần chốt bán kính khác nhau theo rank hay chung một con số, rồi seed cho đúng.
6. Người bị `BANNED` thì membership của họ xử lý thế nào? Chưa ai nói.
