# 20 · Bản đồ toàn hệ thống

Một sơ đồ gộp mọi phân hệ và quan hệ giữa chúng. Dùng để nhìn tổng thể; chi tiết nằm ở các
sơ đồ 01–19.

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
        SEL["Countdown 7 ngày ⛔"]
        TX["Vòng đời lượt trao ✅"]
        CHAT["Chat ✅"]
    end

    subgraph T4["④ Điểm & hạng"]
        PT["Point Ledger ✅"]
        RANK["Thứ hạng ⚠️"]
        REV["Đánh giá & Accuracy ✅"]
        RED["Đổi vật phẩm bằng điểm ⛔"]
    end

    subgraph T5["⑤ Vận hành"]
        REP["Báo xấu & kiểm duyệt ✅"]
        ADM["Admin CMS & RBAC ✅"]
        JOB["7 CLI ✅"]
        NOTI["Thông báo ✅🟡"]
    end

    subgraph T6["⑥ Chưa có code"]
        GRP["Group & Sub-team ⛔"]
        AFF["Affiliate & Geo ⛔"]
        KPI["Dashboard KPI ⛔"]
        CMS["Campaign · Blog ⛔"]
    end

    AUTH --> PROF --> POST
    MEDIA --> POST
    POST --> FEED
    POST --> INT
    POST --> REQ --> SEL --> TX
    TX --> CHAT
    TX --> REV
    REV -->|"✅ 56 × x%"| PT
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

    style T6 fill:#ffe6e6
    style T4 fill:#fff9e6
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
      Trao thành công (+56 × x% mỗi lượt ✅): 5: Người dùng
      Mời bạn (+56đ, cap 3/ngày): 4: Người dùng
    section Lên hạng
      Đủ 672đ → Bạc: 5: Người dùng
      Giữ hạng 2+2 mỗi quý: 3: Người dùng
      Đủ 1792đ → Kim Cương: 5: Người dùng
      Tạo Group ⛔: 4: Người dùng
```

## 20.3 Đường điểm — nơi mọi thứ gặp nhau

```mermaid
flowchart LR
    subgraph Vào["Điểm VÀO"]
        I1["PHONE_VERIFIED_FIRST_TIME +28 ✅"]
        I2["ONBOARDING_COMPLETED +224 ✅"]
        I3["REFERRAL_QUALIFIED +56 ✅"]
        I4["REPORT_UPHELD +5 ✅"]
        I5["GIFT_COMPLETED +56 × x% ✅"]
        I6["Affiliate event ⛔"]
    end

    L[(point_ledger<br/>append-only<br/>idempotent)]

    subgraph Ra["Điểm RA"]
        O1["SHIP_UNPAID_PENALTY −50 ✅"]
        O2["ITEM_REDEMPTION âm ⛔"]
        O3["Trượt nhiệm vụ −N ⛔"]
        O4["Đảo bút toán (Admin) ✅"]
    end

    Vào --> L --> Ra
    L --> B["user_point_balances<br/>balance · raw_balance · lifetime"]
    B --> R["Xét lại RANK<br/>⚠️ code đọc lifetime,<br/>tài liệu nói balance"]

    style O2 fill:#ffe6e6
    style O3 fill:#ffe6e6
    style R fill:#fff3cd
```

## 20.4 Mức độ hoàn thiện theo phân hệ

```mermaid
pie showData
    title Phân hệ theo trạng thái
    "Đã chạy được (✅)" : 13
    "Có code, chưa dùng thật (🟡)" : 2
    "Mâu thuẫn tài liệu/code (⚠️)" : 2
    "Chưa có dòng nào (⛔)" : 5
```

| Trạng thái | Phân hệ |
| --- | --- |
| ✅ | Xác thực · Hồ sơ · Media · Bài đăng · Feed · Tương tác · Xin nhận · Lượt trao · Chat · Đánh giá · Báo xấu · Admin CMS · CLI |
| 🟡 | Thông báo (chưa có FCM) · Xác minh SĐT (chưa có adapter SMS) |
| ⚠️ | Thứ hạng (code khác tài liệu) · Tự hoàn tất (sai mốc đếm, không kiểm tranh chấp) |
| ⛔ | Countdown 7 ngày · Đổi vật phẩm bằng điểm · Group · Affiliate · Dashboard KPI · Campaign/Blog |
