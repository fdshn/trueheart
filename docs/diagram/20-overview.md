# 20 · Bản đồ toàn hệ thống

Một sơ đồ gộp mọi phân hệ và quan hệ giữa chúng. Dùng để nhìn tổng thể; chi tiết nằm ở các
sơ đồ 01–19.

> **Cập nhật 30/09.** Bản trước ghi Group và Dashboard KPI là ⛔ *chưa có code* trong khi Group
> đã có 12 endpoint và Dashboard đã chạy. Một bảng trạng thái nói sai thì tệ hơn không có bảng
> nào: nó là thứ Bên A và người mới đọc đầu tiên, và ở đây nó **nói thiếu** những gì đã làm.

## 20.1 Toàn cảnh

```mermaid
flowchart TB
    subgraph T1["① Nền tảng"]
        AUTH["Xác thực ✅"]
        PROF["Hồ sơ & onboarding ✅"]
        MEDIA["Media S3 ✅"]
    end

    subgraph T2["② Nội dung"]
        POST["Bài đăng — 5 loại ✅"]
        FEED["Feed & bản đồ ✅"]
        INT["Cảm xúc · bình luận · chia sẻ ✅"]
    end

    subgraph T3["③ Giao dịch"]
        REQ["Xin nhận & hàng đợi ✅"]
        SEL["Countdown 7 ngày ✅"]
        TX["Vòng đời lượt trao ✅"]
        CHAT["Chat ✅"]
    end

    subgraph T4["④ Điểm & hạng"]
        PT["Point Ledger ✅"]
        RANK["Thứ hạng ✅"]
        REV["Đánh giá & Accuracy ✅"]
        RED["Đổi vật phẩm bằng điểm ✅"]
    end

    subgraph T5["⑤ Vận hành"]
        REP["Báo xấu & kiểm duyệt ✅"]
        ADM["Admin CMS & RBAC ✅"]
        JOB["12 CLI ✅"]
        NOTI["Thông báo ✅🟡"]
    end

    subgraph T6["⑥ Nhóm & affiliate"]
        GRP["Group & Sub-team ✅"]
        AFF["Affiliate — nền có, bộ máy chia thưởng ⛔"]
    end

    subgraph T7["⑦ Nội dung & chiến dịch"]
        CMS["Campaign · Blog · Từ thiện · Dharma Hub ✅<br/>backend đủ, giao diện CMS ở repo khác"]
    end

    AUTH --> PROF --> POST
    MEDIA --> POST
    POST --> FEED
    POST --> INT
    POST --> REQ --> SEL --> TX
    TX --> CHAT
    TX --> REV
    REV -->|"✅ value_bonus theo giá × x%"| PT
    TX -->|"✅ 56 phẳng tại COMPLETED"| PT
    PT --> RANK
    RANK --> POST
    PT --> RED
    RED --> SEL
    INT --> REP
    POST --> REP
    REP --> PT
    ADM --> PT
    ADM --> RANK
    ADM --> REP
    ADM --> NOTI
    JOB --> TX
    JOB --> PT
    JOB --> REV
    JOB --> POST
    GRP --> AFF --> PT
    PROF --> GRP

    style CMS fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style T4 fill:#dcb42826,stroke:#c9a227,stroke-width:1.5px
```

## 20.2 Đường đi của một người dùng mới

```mermaid
journey
    title Từ đăng ký tới Kim Cương
    section Vào hệ thống
      Đăng ký: 5: Người dùng
      Hoàn thiện hồ sơ: 4: Người dùng
      Xác minh SĐT (+28đ): 3: Người dùng
      Xong onboarding (+224đ → Thành viên): 5: Người dùng
    section Hoạt động
      Đăng bài (quota 3): 4: Người dùng
      Trao thành công (+56 phẳng, cộng value_bonus theo giá ✅): 5: Người dùng
      Mời bạn (+56đ, cap 3/ngày): 4: Người dùng
    section Lên hạng
      Đủ 672đ → Bạc: 5: Người dùng
      Giữ hạng 2+2 mỗi quý: 3: Người dùng
      Đủ 1792đ → Kim Cương: 5: Người dùng
      Tạo Group ✅: 5: Người dùng
```

## 20.3 Đường điểm — nơi mọi thứ gặp nhau

```mermaid
flowchart LR
    subgraph Vào["Điểm VÀO"]
        I1["PHONE_VERIFIED_FIRST_TIME +28 ✅"]
        I2["ONBOARDING_COMPLETED +224 ✅"]
        I3["REFERRAL_QUALIFIED +56 ✅"]
        I4["REPORT_UPHELD +5 ✅"]
        I5["GIFT_COMPLETED_GIVER +56 phẳng ✅<br/>+ GIFT_VALUE_BONUS_GIVER theo giá ✅"]
        I5b["GIFT_COMPLETED_RECEIVER ✅"]
        I6["POST_REACTED · POST_COMMENTED ✅"]
        I7["Affiliate event ⛔"]
    end

    L[(point_ledger<br/>append-only<br/>idempotent)]

    subgraph Ra["Điểm RA"]
        O1["SHIP_UNPAID_PENALTY −50 ✅"]
        O2["ITEM_REDEMPTION âm ✅"]
        O3["Trượt nhiệm vụ −224/336/448 ✅"]
        O4["Đảo bút toán (Admin) ✅"]
        O5["CONTENT_VIOLATION_PENALTY ✅"]
    end

    Vào --> L --> Ra
    L --> B["user_point_balances<br/>balance · raw_balance · lifetime"]
    B --> R["Xét lại RANK theo balance ✅<br/>+ báo sắp tụt / đã tụt"]

```

## 20.4 Mức độ hoàn thiện theo phân hệ

```mermaid
pie showData
    title Phân hệ theo trạng thái
    "Đã chạy được (✅)" : 19
    "Có code, chưa dùng thật (🟡)" : 1
    "Backend xong, chờ bên ngoài (🟠)" : 2
    "Chưa có dòng nào (⛔)" : 1
```

| Trạng thái | Phân hệ |
| --- | --- |
| ✅ | Xác thực · Hồ sơ · Media · Bài đăng · Feed · Tương tác · Xin nhận · Lượt trao · Chat · Đánh giá · Báo xấu · Admin CMS · CLI · Thứ hạng · Countdown chọn người nhận · Đổi vật phẩm bằng điểm · **Group & Sub-team** · **Dashboard KPI** · **Kiểm duyệt chat** |
| 🟡 | Xác minh SĐT (chưa có adapter SMS) — thông báo ĐẨY nằm ở hàng dưới |
| 🟠 | Thông báo đẩy FCM (backend xong, đã gọi thật tới Google 05/10, chờ client mobile gửi `fcmToken` — hiện đếm được **0**) · Campaign/Blog/Từ thiện/Dharma Hub (backend xong, chờ **giao diện CMS** ở repo khác và UAT) |
| ⛔ | Bộ máy chia thưởng affiliate — và chỉ còn đúng phần chia thưởng |

> **Hàng ⚠️ đã bỏ.** Bản trước ghi *"Tự hoàn tất (sai mốc đếm, không kiểm tranh chấp)"*, trong
> khi [21 §21.4](./21-open-issues.md) mục 2 và 3 nói cả hai đã sửa từ 25/09 — hai tài liệu nói
> ngược nhau về cùng một thứ, và một trong hai chắc chắn sai. Đếm mốc vốn đã dùng
> `COALESCE(handed_over_at, accepted_at)`, và lượt có báo xấu đang mở bị giữ lại kèm exit code
> khác 0.
>
> **Affiliate không còn là ⛔ trắng.** Nền đã có: `groups.center_location` + `radius_km`,
> `last_active_at` ghi ở mọi lần cấp phiên, và `GET /groups/:id/affiliate` đếm được ai đủ điều
> kiện. Thiếu đúng phần **chia thưởng** — mà phần đó chờ Bên A chốt cách chia, xem
> [19](./19-affiliate.md) mục 4.

> **Hai dòng sửa 07/10, vì bản trước nói sai trạng thái đo được.**
>
> - Ô **"⑦ Chưa có code"** bọc `Campaign · Blog · Từ thiện` là sai: cả ba đều có use case,
>   controller và script kiểm trên Postgres thật (`home-campaign.check.ts`, `blog.check.ts`,
>   `charity-campaign.check.ts`), và [31 mục T1](./31-open-items.md) đã ghi F63/F64/F65/F73
>   "ĐÓNG đủ" từ 04/10. Còn lại là **giao diện CMS ở repo khác** và UAT — không phải code
>   backend. Một ô "chưa có code" bọc quanh thứ đã chạy là cách làm người đọc đi tìm lại từ đầu
>   một việc đã xong.
> - **FCM** không còn nằm trong ô đó: `FcmPushSender` đã gọi thật tới Google 05/10 và khoá đã
>   cắm trên staging. Nhưng cũng chưa phải ✅ — `user_sessions.fcm_token` đếm được **0**, nên
>   đường đẩy chưa từng làm rung máy ai.
>
> Nên thêm một mức **🟠** giữa 🟡 và ⛔: *backend xong, chờ một bên ngoài*. Gộp hai thứ này vào
> ⛔ nói rằng chưa có gì, gộp vào ✅ nói rằng đã nghiệm thu — cả hai đều sai, và cái sai thứ hai
> đắt hơn.
