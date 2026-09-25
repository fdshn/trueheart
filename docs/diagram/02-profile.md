# 02 · Hồ sơ, xác minh & onboarding

## 2.1 Cổng hoàn thiện hồ sơ (F07)

**Chốt 2026-09-24:** cổng chặn **4 hành vi**, không chỉ đăng bài.

```mermaid
flowchart LR
    subgraph G["Cổng hoàn thiện hồ sơ"]
        direction TB
        C{Đủ Họ tên + Avatar<br/>+ SĐT + Email?}
    end

    A1[Đăng bài] --> C
    A2[Xin nhận] --> C
    A3[Chat] --> C
    A4[Tạo Group ⛔] --> C

    C -->|Đủ| OK[✅ Cho qua]
    C -->|Thiếu| NO[❌ 403 — kèm danh sách<br/>trường còn thiếu]

    style C fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style NO fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style A4 stroke-dasharray: 5 5
```

> **Vì sao trả về danh sách trường còn thiếu chứ không chỉ "hồ sơ chưa đủ".** Người dùng
> không đoán được mình thiếu gì, và mỗi lần đoán sai là một lần họ bỏ cuộc.

| Hành vi | Trạng thái chặn |
| --- | --- |
| Đăng bài | ✅ `assertOnboarded` — cổng hồ sơ **cộng** điều kiện đã qua Viewer |
| Xin nhận | ✅ `assertComplete` |
| Chat (đường **gửi**) | ✅ `assertComplete` |
| Tạo Group | ⛔ chưa có Group |

Gom về một `ProfileGate` thay vì viết lại ở từng use case — bốn nơi tự kiểm là bốn danh sách
trường bắt buộc có thể trôi khỏi nhau, và chỗ nào quên một trường thì chỗ đó lặng lẽ mở cửa.

> **Cổng đặt ở đường GỬI tin nhắn, không ở đường đọc.** Người hồ sơ chưa đủ vẫn phải đọc được
> tin nhắn gửi cho mình, nếu không họ mất luôn lời nhắn đang chờ.
>
> **Hồ sơ kiểm TRƯỚC rank.** Viewer thiếu SĐT phải nghe "thiếu SĐT" chứ không phải "chưa
> onboard" — điền SĐT chính là việc đưa họ ra khỏi Viewer.

## 2.2 Xác minh số điện thoại

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant API as Core API
    participant R as Redis
    participant L as Point Ledger
    participant S as Kênh SMS/Zalo

    U->>API: PATCH /profile/me/phone-verification/request
    API->>API: Chuẩn hoá số (E.164)
    API->>R: Lưu OTP (purpose = PHONE_VERIFY)
    API->>S: canSend(SMS)?
    Note over S: ⛔ Production trả false —<br/>chưa có adapter nào gửi nổi
    S-->>U: SMS chứa OTP

    U->>API: PATCH /profile/me/phone-verification/confirm { otp }
    API->>R: Đối chiếu OTP + purpose
    alt Đúng
        API->>API: Mở transaction
        API->>API: SET users.phone_verified_at = now()
        API->>L: appendByRule('PHONE_VERIFIED_FIRST_TIME', 28đ)
        Note over L: idempotency_key = 'PHONE_VERIFIED:<userId>'<br/>Chạy lại KHÔNG cộng lần hai
        API->>API: Commit
        API-->>U: 200
    else Sai
        API-->>U: 400
    end
```

> **Vì sao hai việc nằm trong một transaction.** Đánh dấu đã xác minh mà chưa kịp cộng điểm
> là mất điểm vĩnh viễn — lần sau vào sẽ thấy "đã xác minh rồi" và không cộng nữa. CLI
> `point:reconcile` là lưới an toàn thứ hai cho đúng ca này.

## 2.3 Onboarding

```mermaid
stateDiagram-v2
    [*] --> Mới: Đăng ký xong
    Mới --> ĐangLàm: GET /onboarding/tasks

    state ĐangLàm {
        [*] --> Chờ
        Chờ --> HoànThiệnHồSơ: PROFILE_COMPLETE
        Chờ --> XácMinhSĐT: PHONE_VERIFIED
        HoànThiệnHồSơ --> ĐủĐiềuKiện
        XácMinhSĐT --> ĐủĐiềuKiện
    }

    ĐangLàm --> Xong: POST /onboarding/tasks/evaluate<br/>đủ hết nhiệm vụ
    Xong --> [*]: +224đ ONBOARDING_COMPLETED<br/>→ đạt ngay rank Thành viên

    note right of Xong
        224đ đúng bằng ngưỡng Thành viên.
        Nên xong onboarding là lên hạng ngay,
        không cần giao dịch nào.
    end note
```

> **Lưu ý khi soát:** `ONBOARDING_COMPLETED = 224` trùng khít ngưỡng Thành viên (224). Đây
> có vẻ là chủ ý — "xong onboarding thì thành Thành viên" — nhưng nó cũng có nghĩa là
> **mốc hạng đầu tiên không đòi hỏi bất kỳ hoạt động trao tặng nào**. Cần xác nhận.

## 2.4 Hồ sơ công khai

```mermaid
flowchart TD
    A["GET /profile/:username"] --> B{Người xem đã đăng nhập?}
    B -->|Chưa| C[Trả bản rút gọn<br/>không kèm liên hệ]
    B -->|Rồi| D[Trả đầy đủ]
    D --> E[Kèm chỉ số Giver Accuracy<br/>nếu đã đủ 5 mẫu]
    E --> F{accuracy < 75%?}
    F -->|Có| G[⚠️ Cờ REVIEW_REQUIRED<br/>chỉ Admin thấy, KHÔNG hiện công khai]
    F -->|Không| H[Hiện chỉ số bình thường]

    style G fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

> **Vì sao cờ xem xét không hiện công khai.** Cờ là tín hiệu để Admin xem, không phải một
> phán quyết. Gắn nhãn công khai lên hồ sơ một người dựa trên năm lượt đánh giá là kết tội
> trước khi có người thật nhìn qua.

## Chỗ cần soát

1. ✅ **Cổng F07 đã chặn đủ ba hành vi đang có.** Còn tạo Group thì chờ phân hệ Group.
2. **Onboarding cho 224đ = lên thẳng Thành viên** mà không cần giao dịch nào. Đúng ý chưa?
3. SMS/Zalo chưa có adapter nên **luồng xác minh SĐT không chạy được thật ở production**,
   kéo theo phần thưởng 28đ không phát sinh.
4. `last_login_at` sẽ đặt ở `users` — xem [01-auth](./01-auth.md).
