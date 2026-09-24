# 14 · Đổi vật phẩm bằng điểm

Trạng thái: ⛔ **chưa có dòng code nào.** Toàn bộ sơ đồ này là thiết kế.

## 14.1 Định giá vật phẩm (F74)

```mermaid
flowchart LR
    A["Người tặng khai<br/>giá trị tham khảo (VNĐ)"] --> B["chia cho tỷ lệ quy đổi<br/>(Admin cấu hình)"]
    B --> C[Số điểm cần để đổi]

    D["Ví dụ: 1.000.000 VNĐ<br/>tỷ lệ 1 điểm = 1.000 VNĐ"] --> E["1.000 điểm"]

    style B fill:#fff3cd
```

> **Khai khống ở đây KHÔNG sinh ra điểm** — nó chỉ làm vật phẩm đắt hơn, tức khó đổi hơn.
> Ngược hẳn với [F40](./11-point.md), nơi giá người tặng khai cố ý không được tin.

## 14.2 ✅ Tỷ lệ quy đổi — chốt 2026-09-25

**2.000 VNĐ/điểm**, seed ở `system_configs.point.redemption`, Admin sửa lúc chạy.

Chọn theo câu trả lời được, chứ không theo cảm giác về giá trị một điểm:

> **Tặng bao nhiêu món thì đổi được một món giá trị tương đương?**

| Tặng N món để đổi 1 | Điểm cần cho món 1 triệu | Tỷ lệ |
| ---: | ---: | --- |
| 5 | 280 | 1 điểm ≈ 3.570 VNĐ |
| **9** | **500** | **2.000 VNĐ/điểm ← đã chọn** |
| 18 | 1.000 | 1 điểm = 1.000 VNĐ |

> Con số 1.000 VNĐ/điểm từng nằm trong `FEATURES.md` chỉ là ví dụ minh hoạ cú pháp, nhưng nó
> ngụ ý **phải tặng 18 món mới đổi được 1 món tương đương** — nhiều khả năng không ai chủ ý.

## 14.3 Luồng đổi điểm (F75 + F77)

```mermaid
sequenceDiagram
    autonumber
    actor R as Người xin
    participant API as Core API
    participant P as Point Ledger
    participant DB as Postgres

    R->>API: Xác nhận dùng điểm đổi vật phẩm
    API->>DB: Countdown còn chạy? Bài còn mở?
    API->>P: Balance đủ không?
    alt Không đủ
        API-->>R: 400 - thiếu bao nhiêu điểm
    else Đủ
        API->>API: MỘT TRANSACTION DUY NHẤT
        API->>P: Trừ điểm (rule ITEM_REDEMPTION, delta âm)
        Note over P: idempotency_key BẮT BUỘC.<br/>Bấm hai lần không trừ hai lần
        API->>DB: DỪNG countdown
        API->>DB: Chọn người này làm người nhận chính thức
        API->>DB: Các ứng viên khác chuyển STANDBY
        API->>DB: KHÔNG chạy auto-select
        API->>API: COMMIT
        API-->>R: Đã chốt
        API->>API: Xét lại rank theo balance mới - có thể TỤT
    end
```

> **Vì sao phải trọn vẹn trong một transaction.** Trừ điểm xong mà chưa kịp chốt người nhận
> là mất điểm mà không được đồ — và không có cách nào người dùng tự đòi lại.

## 14.4 Hệ quả với thứ hạng

```mermaid
flowchart TD
    A[Đổi vật phẩm 280 điểm] --> B[Balance giảm 280]
    B --> C{Rơi dưới ngưỡng rank?}
    C -->|Có| D["⬇️ TỤT HẠNG<br/>(quyết định 2026-09-24)"]
    C -->|Không| E[Giữ hạng]

    F["Người Bạc, ngưỡng 672<br/>phải có 952 điểm<br/>mới đổi mà không tụt"] -.-> C
    G["⚠️ PHẢI cảnh báo TRƯỚC khi bấm đổi<br/>không thì họ mất hạng mà không biết vì sao"] -.-> D

    style D fill:#fff3cd
    style G fill:#ffe6e6
```

## 14.5 Ghi sổ (F77)

Mỗi lần đổi **bắt buộc** vào `point_ledger`:

| Trường | Giá trị |
| --- | --- |
| `user_id` | Người tiêu điểm |
| `rule_code` | `ITEM_REDEMPTION` |
| `delta` | Âm, bằng số điểm bị trừ |
| `reference_type` / `reference_id` | Trỏ về bài đăng |
| `idempotency_key` | Bắt buộc |

## Chỗ cần soát

1. ⛔ **Toàn bộ phân hệ chưa có code**, và nó phụ thuộc countdown 7 ngày cũng chưa có
   ([07-request](./07-request.md)).
2. ⛔ **`ITEM_REDEMPTION` không vừa khuôn `point_rules`** — số điểm thay đổi theo món, cần
   một đường ghi ledger nhận số điểm làm tham số thay vì `appendByRule`.
3. ⛔ **Chưa có cảnh báo "đổi món này sẽ làm bạn tụt hạng"** trước khi người dùng bấm.
4. Vật phẩm đổi bằng điểm có được **đánh giá và tính accuracy** như lượt trao thường không?
   Chưa ai nói.
5. Người tặng có **được điểm** khi vật phẩm của họ bị đổi bằng điểm không? Chưa ai nói.
