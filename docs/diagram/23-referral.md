# 23 · Personal Referral

Trạng thái: ✅ **đã hiện thực**.

## 23.1 Khác Group Affiliate thế nào

```mermaid
flowchart LR
    subgraph P["Personal Referral ✅"]
        P1["Referrer → Referee"]
        P2["MỘT LẦN cho mỗi referee"]
        P3["+56đ, cap 3/ngày"]
        P4["Không cần Group"]
    end
    subgraph A["Group Affiliate ⛔"]
        A1["Sự kiện → toàn bộ Active Member"]
        A2["LẶP LẠI nhiều lần"]
        A3["Cần Group + điều kiện địa lý"]
    end

    style P fill:#e6ffe6
    style A fill:#ffe6e6
```

## 23.2 Vòng đời một referral

```mermaid
stateDiagram-v2
    [*] --> PENDING: Người mới đăng ký kèm referralCode
    PENDING --> QUALIFIED: Referee hoàn tất onboarding
    PENDING --> [*]: Referee bỏ giữa chừng

    QUALIFIED --> ĐãThưởng: +56đ cho REFERRER

    note right of QUALIFIED
        Vì sao không thưởng ngay lúc đăng ký:
        tài khoản ảo đăng ký hàng loạt là việc
        rẻ nhất trên đời. Bắt hoàn tất onboarding
        (hồ sơ đủ + xác minh SĐT) làm chi phí
        tạo một referral giả cao hơn 56 điểm.
    end note

    ĐãThưởng --> [*]
```

## 23.3 Luồng đầy đủ

```mermaid
sequenceDiagram
    autonumber
    actor R as Người giới thiệu
    actor N as Người được mời
    participant API as Core API
    participant L as Point Ledger

    R->>API: GET /referrals/me
    API-->>R: Mã giới thiệu + danh sách đã mời + trạng thái

    N->>API: POST /auth/register { referralCode }
    API->>API: Mã có hợp lệ? Có tự giới thiệu mình không?
    API->>API: INSERT referrals (PENDING)

    N->>API: Hoàn thiện hồ sơ + xác minh SĐT
    N->>API: POST /onboarding/tasks/evaluate
    API->>API: Đủ nhiệm vụ → referral chuyển QUALIFIED
    API->>L: appendByRule('REFERRAL_QUALIFIED', +56đ) cho REFERRER
    Note over L: idempotency_key theo referralId.<br/>Cap 3/ngày — chạm trần thì KHÔNG cộng,<br/>và KHÔNG báo lỗi ra ngoài
    API->>L: appendByRule('ONBOARDING_COMPLETED', +224đ) cho REFEREE
```

## 23.4 Cap theo ngày

```mermaid
flowchart TD
    A[Referral thứ N trong ngày] --> B{N <= 3?}
    B -->|Có| C[✅ +56đ]
    B -->|Không| D["❌ Không cộng<br/>ném PointDailyCapReachedException<br/>use case NUỐT ngoại lệ này"]
    D --> E["Referral VẪN chuyển QUALIFIED<br/>chỉ là không có điểm"]

    style D fill:#fff3cd
```

> **Vì sao chạm trần vẫn cho referral thành công.** Quan hệ giới thiệu là dữ liệu thật, cần
> ghi dù không thưởng. Từ chối cả quan hệ chỉ vì hết quota điểm là làm mất dữ liệu để tiết
> kiệm một con số.

## Chỗ cần soát

1. **Referral chạm cap ngày thì mất điểm vĩnh viễn** — không có hàng đợi trả bù ngày hôm sau.
   Người mời 10 người trong một ngày chỉ được điểm cho 3. Đúng ý chưa?
2. **Chưa có thông báo cho người giới thiệu** khi referee của họ đủ điều kiện.
3. **Chưa chống được referral vòng tròn** giữa nhiều tài khoản do cùng một người tạo — mới chỉ
   chặn tự giới thiệu chính mình.
4. Nhiệm vụ duy trì rank đòi "N Personal Referral **hợp lệ**" mỗi quý — cần xác nhận "hợp lệ"
   ở đây chính là `QUALIFIED`.
