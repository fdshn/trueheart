# 01 · Xác thực & tài khoản

Trạng thái: ✅ **đã hiện thực đầy đủ**, trừ kênh gửi OTP qua SMS/Zalo.

Chín endpoint:

| Endpoint | Việc | Cần token |
| --- | --- | --- |
| `POST /auth/register` | Đăng ký, tự đăng nhập luôn | — |
| `POST /auth/login` | Đăng nhập | — |
| `POST /auth/refresh` | Làm mới phiên | — |
| `POST /auth/logout` | Đăng xuất một thiết bị | ✅ |
| `POST /auth/password-reset/request` · `/confirm` | Quên mật khẩu | — |
| `PATCH /auth/password` | **Đổi mật khẩu khi đang đăng nhập** | ✅ |
| `DELETE /auth/account` | Xoá tài khoản | ✅ |
| `GET /auth/me` | Danh tính của phiên hiện tại | ✅ |

## 1.1 Đăng ký

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as POST /auth/register
    participant DB as Postgres
    participant R as Redis

    U->>API: username, password, deviceId, referralCode?, inviteCode?
    Note over API: KHÔNG nhận email/SĐT ở bước này.<br/>Hai thứ đó thêm sau ở Hồ sơ.
    API->>R: IP này đã tạo mấy tài khoản trong 1 giờ?
    alt Quá 5
        API-->>U: 429 TOO_MANY_REQUESTS
    else Còn chỗ
        API->>API: Kiểm định dạng, mật khẩu ≥ 8 ký tự
        API->>DB: Username đã tồn tại?
        alt Đã tồn tại
            API-->>U: 409 — NÓI RÕ tên nào đã bị lấy
        else Chưa có
            API->>API: Băm mật khẩu (bcrypt)
            API->>DB: INSERT users (rank = VIEWER, status = ACTIVE)
            API->>R: Đếm thêm một tài khoản cho IP này
            opt Có referralCode hợp lệ
                API->>DB: INSERT referrals (PENDING)
                Note over DB: Chỉ tính điểm khi referee<br/>hoàn tất onboarding
            end
            opt Có inviteCode
                API->>DB: Nhóm nào còn ACTIVE mang mã này?
                alt Có
                    API->>DB: INSERT group_memberships (MEMBER)
                else Không — mã sai hoặc nhóm đã giải tán
                    Note over API: BỎ QUA, không ném.<br/>Tài khoản đã tạo xong rồi.
                end
            end
            API->>R: Lưu refresh token
            API-->>U: accessToken + refreshToken + hồ sơ
        end
    end
```

> **Vì sao 409 NÓI RÕ tên nào đã bị lấy.** Username là định danh công khai — người ta phải
> biết tên đó bận để chọn tên khác. Lập luận "thông báo chung chống dò tài khoản" chỉ đúng cho
> **email**, mà email thì không có ở bước này.

> **Vì sao có trần theo IP.** Tài khoản mới **đẻ ra điểm** qua referral và affiliate, nên tạo
> hàng loạt là một đường gian lận chứ không chỉ là rác. Trần đếm số tài khoản **tạo được**,
> không đếm lần gõ hỏng form — phạt người dùng thật vì lỗi đánh máy là sai chỗ.
> Ngưỡng: `MAX_REGISTRATIONS_PER_IP` (mặc định 5) trong `REGISTRATION_WINDOW_SECONDS` (1 giờ).

> **Vì sao `inviteCode` nằm ở đây chứ không phải một endpoint "vào nhóm" riêng.** Membership
> chỉ sinh ra cho tài khoản MỚI (F54/BR-GRP-04), và chính ràng buộc đó là hàng rào chặn việc
> một người nhảy vòng quanh các nhóm để gom affiliate. Có endpoint join riêng là phá hàng rào.
> Xem [`18-group.md §18.2`](./18-group.md).

## 1.2 Đăng nhập và làm mới phiên

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant DB as Postgres
    participant R as Redis

    rect rgba(80, 140, 220, 0.12)
    Note over U,R: Đăng nhập
    U->>API: POST /auth/login
    API->>R: Định danh này bị khoá chưa? (5 lần sai / 15 phút)
    API->>R: IP này sai quá 30 lần chưa?
    API->>DB: Lấy user theo username / email / SĐT
    API->>API: So khớp mật khẩu — CHẠY bcrypt cả khi không có tài khoản
    alt Sai mật khẩu, hoặc không có tài khoản
        API->>R: Đếm lần sai cho CẢ định danh lẫn IP
        API-->>U: 401 INVALID_CREDENTIALS — thông báo chung
    else Đúng mật khẩu nhưng đang bị treo / khoá
        API-->>U: 403 USER_SUSPENDED (kèm ngày hết treo) hoặc USER_BANNED
    else Đúng
        API->>DB: SessionIssuer đặt mốc last_active_at
        API->>R: Lưu refresh token (có TTL), thu hồi phiên cũ CÙNG thiết bị
        API-->>U: accessToken (15 phút) + refreshToken (30 ngày)
    end
    end

    rect rgba(220, 160, 40, 0.14)
    Note over U,R: Làm mới
    U->>API: POST /auth/refresh
    API->>DB: Phiên còn hiệu lực?
    alt Không còn / đã thu hồi
        API-->>U: 401
    else Còn
        API->>DB: Tài khoản còn sống, KHÔNG bị khoá, KHÔNG bị treo?
        alt Đã bị khoá hoặc đang treo
            API-->>U: 403
        else Bình thường
            API->>DB: Xoay vòng token — thu hồi cái vừa dùng
            API->>DB: SessionIssuer đặt mốc last_active_at
            API-->>U: cặp token mới
        end
    end
    end
```

> **Vì sao trạng thái tài khoản kiểm SAU khi so mật khẩu.** Trả "tài khoản bị khoá" trước khi
> biết người gọi có mật khẩu hay không là biến màn đăng nhập thành công cụ dò xem username nào
> có thật **và** đang ở trạng thái gì. Sau khi họ đã chứng minh biết mật khẩu thì nói thẳng là
> đúng — không nói thì họ chỉ thấy "sai mật khẩu" và gõ lại mãi.

> **Vì sao có hai cái trần chống dò.** Trần theo **định danh** (5 lần / 15 phút) chặn người dò
> mật khẩu của MỘT người. Trần theo **IP** (`MAX_LOGIN_ATTEMPTS_PER_IP`, mặc định 30) chặn
> người rải một mật khẩu phổ biến qua hàng nghìn username — ở kiểu đó mỗi tài khoản chỉ sai
> một lần nên không tài khoản nào chạm trần của riêng nó. Trần IP **chỉ đếm khi sai**: đếm cả
> lần đúng thì một văn phòng chung IP sẽ tự khoá nhau.

> **Vì sao tên là `last_active_at` chứ không `last_login_at`, và vì sao ghi ở nhánh refresh.**
> App mobile giữ refresh token nên người mở app hằng ngày vẫn có thể không "đăng nhập" lần nào
> suốt 90 ngày. Chỉ ghi ở nhánh login sẽ đánh nhầm người đang dùng đều thành không hoạt động,
> và họ mất phần chia affiliate.

> **Vì sao `/refresh` cũng chặn tài khoản đang treo.** Đường treo duy nhất hiện nay là Admin,
> mà Admin thì thu hồi sạch phiên — nhưng đó là một **giả định ngầm**. Ngày nào có chế tài tự
> động đặt `SUSPENDED` mà quên thu hồi, người bị treo vẫn tự gia hạn phiên thêm 30 ngày.

## 1.3 Đăng xuất

```mermaid
flowchart TD
    A["POST /auth/logout<br/>kèm refreshToken"] --> B{Phiên còn tồn tại?}
    B -->|Không| C["✅ Trả thành công<br/>đăng xuất phải LUÔN thành công"]
    B -->|Có| D{Phiên này của CHÍNH người gọi?}
    D -->|Không| C
    D -->|Có| E[Thu hồi phiên + xoá FCM token]
    E --> F["Ghi mốc thu hồi access token<br/>của tài khoản này"]
    F --> G[✅ Xong]

    style C fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style F fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao phải giết cả access token.** Thiếu bước đó thì bấm "Đăng xuất" xong token cũ vẫn gọi
> API được tới **15 phút**. Trên máy mượn hay máy công cộng, đó đúng là khoảng thời gian người
> ta sợ.
>
> Danh sách chặn ghi theo **tài khoản**, không theo thiết bị. Nên thiết bị khác của cùng người
> sẽ nhận **một lần 401** rồi tự lấy token mới bằng refresh token của nó — phiên của họ KHÔNG
> mất, chỉ tốn thêm một vòng gọi.

## 1.4 Đổi mật khẩu khi đang đăng nhập

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as PATCH /auth/password
    participant R as Redis
    participant DB as Postgres

    U->>API: currentPassword, newPassword, deviceId
    API->>DB: So khớp mật khẩu hiện tại
    alt Sai
        API-->>U: 401 — KHÔNG đụng gì tới phiên
    else Trùng mật khẩu cũ
        API-->>U: 400 — đổi mà không đổi gì thì chỉ đá mọi thiết bị ra
    else Đúng
        API->>R: 1. Ghi mốc thu hồi access token
        API->>DB: 2. Thu hồi refresh token trên MỌI thiết bị
        API->>DB: 3. Ghi mật khẩu mới
        API->>DB: 4. Cấp phiên mới cho ĐÚNG thiết bị đang gọi
        API-->>U: cặp token mới
    end
```

> **Vì sao thứ tự bốn bước không đảo được.** Ba lệnh ghi đầu KHÔNG nằm chung transaction (một
> trên Redis, hai trên Postgres). Đổi mật khẩu đứng **cuối**: nếu nó chạy trước mà lệnh thu hồi
> chưa kịp chạy, kẻ đang giữ refresh token vẫn gọi `/refresh` lấy được token mới — và việc đổi
> mật khẩu chẳng đuổi được ai. Chết giữa chừng theo thứ tự này thì mật khẩu chưa đổi, phiên đã
> mất; người dùng làm lại, không ai bị chiếm.

> **Vì sao trả về cặp token mới.** Bước 2 thu hồi cả phiên vừa gọi endpoint này. Không cấp lại
> thì người dùng vừa làm đúng một việc nên làm đã bị đá ra khỏi app.

> **Vì sao endpoint này là bắt buộc, không phải tiện nghi.** Đăng ký chỉ cần username + mật
> khẩu. Tài khoản chưa gắn email/SĐT **đã xác minh** thì luồng quên mật khẩu rơi về
> `ADMIN_SUPPORT` — mà chưa có endpoint nào cho Admin đặt lại mật khẩu hộ. Không có đường này
> thì họ không bao giờ đổi được mật khẩu.

## 1.5 Quên mật khẩu

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant R as Redis
    participant M as Kênh gửi (email ✅ / SMS ⛔)

    U->>API: POST /auth/password-reset/request { identifier }
    API->>API: Tra tài khoản
    Note over API: Phản hồi GIỐNG NHAU cho: không có tài khoản,<br/>không có kênh, kênh CHƯA XÁC MINH, đã bị khoá
    opt Có tài khoản VÀ có kênh ĐÃ XÁC MINH VÀ kênh gửi được
        API->>R: Lưu OTP (purpose = password-reset, TTL 5 phút)
        M-->>U: Mã 6 số
    end
    API-->>U: 200 — channel EMAIL / SMS / ADMIN_SUPPORT

    U->>API: POST /auth/password-reset/confirm { identifier, otp, newPassword }
    API->>R: Đối chiếu OTP + purpose + số lần nhập sai
    alt Sai / hết hạn / quá 5 lần
        API-->>U: 400 — mã bị huỷ, phải xin mã mới
    else Đúng
        API->>R: 1. Ghi mốc thu hồi access token
        API->>DB: 2. Thu hồi refresh token mọi thiết bị
        API->>DB: 3. Băm và ghi mật khẩu mới
        API-->>U: 200 + số phiên đã thu hồi
    end
```

> **Vì sao chỉ kênh ĐÃ XÁC MINH mới nhận được mã.** Email vào hồ sơ chỉ bằng cách gõ vào —
> không ai kiểm. Gõ nhầm một ký tự mà vẫn gửi mã đặt lại mật khẩu tới đó là trao đường chiếm
> tài khoản cho người lạ: họ bấm quên mật khẩu, nhận mã, đổi mật khẩu, và mọi phiên của chủ
> thật bị thu hồi. Xem [02-profile §xác minh email](./02-profile.md).

> **Vì sao OTP có `purpose`.** Cùng một mã 6 số mà dùng chung cho đổi mật khẩu và xác minh
> SĐT thì một mã lấy được ở luồng này mở được luồng kia. Tách purpose là chặn đúng chỗ đó.

> **Vì sao xin mã phải chờ 60 giây giữa hai lần.** Không có chốt đó thì endpoint quên mật khẩu
> thành công cụ dội tin nhắn vào một số điện thoại bất kỳ — nạn nhân không cần có tài khoản
> vẫn bị làm phiền.

## 1.6 Xoá tài khoản

```mermaid
flowchart TD
    A[DELETE /auth/account] --> A1{Nhập lại đúng mật khẩu?}
    A1 -->|Không| A2[❌ 401]
    A1 -->|Có| B{Còn lượt trao dở dang?}
    B -->|Có| C[❌ Từ chối — phải đóng hết trước]
    B -->|Không| G{Là Owner của Group?}
    G -->|Có| H[Group chuyển DISSOLVED<br/>link mời vô hiệu<br/>dừng affiliate mới]
    G -->|Không| D[Thu hồi mọi token]
    H --> D
    D --> E[Ẩn danh hoá hồ sơ<br/>GIỮ username]
    E --> F[Giữ nguyên ledger + audit]

    style A2 fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style C fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style G fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style H stroke-dasharray: 5 5
```

| Bước | Trạng thái |
| --- | --- |
| Bắt nhập lại mật khẩu | ✅ — access token có thể đang ở tay người mượn máy |
| Chặn "còn lượt trao dở dang" | ✅ `countOpenForUser` + `UserHasOpenTransactionsException` |
| Owner xoá → Group giải tán | ✅ `dissolveOwnedBy`, giữ nguyên membership/ledger/audit |
| Ẩn danh hoá, thu hồi token, giữ ledger | ✅ |

> **Vì sao giữ username.** Username là biệt danh tự chọn, không phải dữ liệu định danh bắt
> buộc — và giữ nó khiến người khác không đăng ký lại đúng tên đó để mạo danh trong lịch sử
> giao dịch cũ.

> **Vì sao giữ ledger thay vì xoá.** Bút toán điểm của người này là đối ứng của bút toán
> người khác. Xoá đi thì sổ của người ở lại không còn khớp, và không ai dựng lại được.

## Chỗ cần soát

1. ⛔ **Chưa có đường cho Admin đặt lại mật khẩu hộ.** Luồng quên mật khẩu trả
   `ADMIN_SUPPORT` cho tài khoản không có kênh đã xác minh, nhưng Admin chỉ có đổi trạng thái,
   cấp vai và xoá — không có nút nào ứng với nhánh đó. Cần Bên A chốt: có cho Admin đặt lại
   mật khẩu không, và nếu có thì ràng buộc gì (lý do bắt buộc, audit, thông báo cho chủ tài
   khoản).
2. ⚠️ **Mật khẩu chỉ yêu cầu 8 ký tự**, không có quy tắc nào khác — `12345678` qua được. Cần
   Bên A chốt có thêm luật độ mạnh không.
3. ✅ **Trần theo IP đã có** cho đăng nhập và đăng ký. ⛔ Vẫn **chưa có giới hạn tốc độ toàn
   hệ thống** cho các endpoint còn lại.
4. Đăng ký **không bắt buộc** SĐT. Cổng hoàn thiện hồ sơ (F07) mới là chỗ chặn — xem
   [02-profile](./02-profile.md).
5. Kênh gửi OTP: email ✅ đã chạy thật; SMS/Zalo bật được trong CMS nhưng `canSend` trả
   `false` ở production vì chưa có adapter.
