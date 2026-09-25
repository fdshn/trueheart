# 01 · Xác thực & tài khoản

Trạng thái: ✅ **đã hiện thực đầy đủ**, trừ kênh gửi OTP qua SMS/Zalo.

## 1.1 Đăng ký

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as POST /auth/register
    participant DB as Postgres
    participant R as Redis

    U->>API: username, email, password, referralCode?
    API->>API: Kiểm định dạng, độ mạnh mật khẩu
    API->>DB: Username/email đã tồn tại?
    alt Đã tồn tại
        DB-->>API: có
        API-->>U: 409 — thông báo CHUNG, không nói trùng cái nào
    else Chưa có
        API->>API: Băm mật khẩu (argon2)
        API->>DB: INSERT users (rank = VIEWER, status = ACTIVE)
        opt Có referralCode hợp lệ
            API->>DB: INSERT referrals (PENDING)
            Note over DB: Chỉ tính điểm khi referee<br/>hoàn tất onboarding
        end
        API->>R: Lưu refresh token
        API-->>U: accessToken + refreshToken
    end
```

> **Vì sao 409 không nói trùng cái nào.** Trả "email này đã tồn tại" biến form đăng ký thành
> công cụ dò xem một địa chỉ có tài khoản hay không. Thông báo chung làm người dùng hợp lệ
> khó chịu hơn một chút, nhưng đó là cái giá rẻ.

## 1.2 Đăng nhập và làm mới phiên

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant DB as Postgres
    participant R as Redis

    rect rgb(240, 248, 255)
    Note over U,R: Đăng nhập
    U->>API: POST /auth/login
    API->>DB: Lấy user theo username/email
    API->>API: So khớp mật khẩu
    alt Sai, hoặc user SUSPENDED/BANNED
        API-->>U: 401 — thông báo chung
    else Đúng
        API->>DB: SessionIssuer đặt mốc last_active_at ✅
        API->>R: Lưu refresh token (có TTL)
        API-->>U: accessToken (ngắn) + refreshToken (dài)
    end
    end

    rect rgb(255, 250, 240)
    Note over U,R: Làm mới
    U->>API: POST /auth/refresh
    API->>R: Token còn hiệu lực?
    alt Không còn / đã thu hồi
        API-->>U: 401
    else Còn
        API->>R: Thu hồi token cũ, cấp token mới
        API->>DB: SessionIssuer đặt mốc last_active_at ✅
        Note right of DB: Mốc đếm ở ĐÂY nữa, không chỉ lúc<br/>nhập mật khẩu — xem ghi chú dưới
        API-->>U: cặp token mới
    end
    end
```

> **Vì sao tên là `last_active_at` chứ không `last_login_at`, và vì sao ghi ở nhánh refresh.** App mobile giữ refresh token nên
> người mở app hằng ngày vẫn có thể không "đăng nhập" lần nào suốt 90 ngày. Chỉ ghi ở nhánh
> login sẽ đánh nhầm người đang dùng đều thành không hoạt động, và họ mất phần chia affiliate.

## 1.3 Quên mật khẩu

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant R as Redis
    participant M as Kênh gửi (email ✅ / SMS ⛔)

    U->>API: POST /auth/password-reset/request { email }
    API->>API: Tra tài khoản
    Note over API: Phản hồi GIỐNG NHAU dù có hay không có<br/>tài khoản — chống dò tài khoản
    opt Tài khoản tồn tại
        API->>R: Lưu OTP (purpose = PASSWORD_RESET, có TTL)
        API->>M: canSend(EMAIL)?
        alt Kênh gửi được
            M-->>U: Email chứa OTP
        else Chưa cấu hình
            Note over M: Ở production fail-closed:<br/>không gửi, KHÔNG báo lỗi ra ngoài
        end
    end
    API-->>U: 200 "nếu tồn tại thì đã gửi"

    U->>API: POST /auth/password-reset/confirm { otp, newPassword }
    API->>R: Đối chiếu OTP + purpose
    alt Sai / hết hạn / sai purpose
        API-->>U: 400
    else Đúng
        API->>API: Băm mật khẩu mới
        API->>R: Xoá OTP, THU HỒI TOÀN BỘ refresh token
        API-->>U: 200
    end
```

> **Vì sao OTP có `purpose`.** Cùng một mã 6 số mà dùng chung cho đổi mật khẩu và xác minh
> SĐT thì một mã lấy được ở luồng này mở được luồng kia. Tách purpose là chặn đúng chỗ đó.
>
> **Vì sao thu hồi toàn bộ refresh token.** Đổi mật khẩu thường là phản ứng với việc bị chiếm
> tài khoản. Không thu hồi thì kẻ đang giữ phiên vẫn ở nguyên trong đó.

## 1.4 Xoá tài khoản

```mermaid
flowchart TD
    A[DELETE /auth/account] --> B{Còn lượt trao dở dang?}
    B -->|Có| C[❌ Từ chối — phải đóng hết trước]
    B -->|Không| D[Ẩn danh hoá hồ sơ]
    D --> E[Thu hồi mọi refresh token]
    D --> F[Giữ nguyên ledger + audit]
    D --> G{Là Owner của Group?}
    G -->|Có| H[Group chuyển DISSOLVED<br/>link mời vô hiệu<br/>dừng affiliate mới]
    G -->|Không| I[Xong]
    H --> I

    style B fill:#fff3cd
    style C fill:#f8d7da
    style G fill:#e7f3ff
    style H stroke-dasharray: 5 5
```

| Bước | Trạng thái |
| --- | --- |
| Ẩn danh hoá, thu hồi token, giữ ledger | ✅ đã có |
| Chặn "còn lượt trao dở dang" | ✅ `countOpenForUser` + `UserHasOpenTransactionsException`, có test |
| Owner xoá → Group giải tán | ✅ `dissolveOwnedBy`, giữ nguyên membership/ledger/audit |

> **Vì sao giữ ledger thay vì xoá.** Bút toán điểm của người này là đối ứng của bút toán
> người khác. Xoá đi thì sổ của người ở lại không còn khớp, và không ai dựng lại được.

## Chỗ cần soát

1. ✅ **`users.last_active_at` đã có** (không đặt tên `last_login_at` vì nó không chỉ ghi lúc
   đăng nhập). `SessionIssuer` là chỗ chung của đăng ký, đăng nhập và làm mới token nên chỉ
   có MỘT chỗ ghi mốc. Cột `NOT NULL DEFAULT now()`, có index cho job quét Active Member.
2. ✅ **Chặn xoá khi còn lượt trao dở dang đã có** — và chặn TRƯỚC khi thu hồi token, vì thu
   hồi rồi mới phát hiện không xoá được là đá người dùng ra khỏi phiên dù tài khoản vẫn nguyên.
3. Đăng ký hiện **không bắt buộc** SĐT. Cổng hoàn thiện hồ sơ (F07) mới là chỗ chặn — xem
   [02-profile](./02-profile.md).
4. Kênh gửi OTP: email ✅ đã chạy thật; SMS/Zalo bật được trong CMS nhưng `canSend` trả
   `false` ở production vì chưa có adapter.
