# 12 · Thứ hạng

Trạng thái: ⚠️ **Tài liệu và code đang mâu thuẫn.** Sơ đồ này vẽ **mô hình đã chốt ngày
2026-09-24**, và ghi rõ chỗ code còn làm khác.

## 12.1 Năm bậc

```mermaid
flowchart LR
    V["Viewer<br/>0 điểm<br/>quota 0 bài"] --> M["Thành viên<br/>224<br/>quota 3"]
    M --> S["Bạc<br/>672<br/>quota 10 · SOS ✓"]
    S --> G["Vàng<br/>896<br/>quota 20"]
    G --> D["Kim Cương<br/>1792<br/>quota 50 · tạo Group ✓"]

    style V fill:#f0f0f0
    style D fill:#fff9e6
```

## 12.2 Mô hình đã chốt 2026-09-24

```mermaid
flowchart TD
    A["MỘT căn cứ duy nhất:<br/>point balance HIỆN TẠI"] --> B[Mọi biến động điểm<br/>đều kích hoạt xét lại]

    B --> C[Cộng điểm] --> D{Vượt ngưỡng trên?}
    D -->|Có| E[⬆️ Lên hạng]

    B --> F[Tiêu điểm / bị phạt] --> G{Rơi dưới ngưỡng?}
    G -->|Có| H["⬇️ TỤT HẠNG<br/>xét lại theo ngưỡng hiện tại<br/>KHÔNG ép đúng một bậc"]

    I["❌ F76 đã HUỶ<br/>không còn 'điểm khả dụng'<br/>toàn bộ balance đều tiêu được"] -.-> F

    style A fill:#e7f3ff
    style H fill:#fff3cd
    style I fill:#ffe6e6
```

> **Vì sao chỉ một căn cứ.** Trước đây có hai con số cùng nói về hạng: `lifetime` (sàn) và
> nhiệm vụ duy trì (trần). Hai cơ chế cùng quyết một thứ thì luôn có lúc chúng nói ngược
> nhau, và không có quy tắc nào phân xử.

## 12.3 Chu kỳ duy trì 3 tháng

```mermaid
stateDiagram-v2
    [*] --> ChuKỳMới: Lên Bạc/Vàng/Kim Cương
    ChuKỳMới --> ĐangChạy: Bắt đầu đếm 3 tháng
    ĐangChạy --> Nhắc: Còn 1 tháng<br/>⛔ chưa có thông báo
    Nhắc --> Đánh giá: Hết 3 tháng

    Đánh giá --> Đạt: Đủ N lượt Cho + N referral
    Đánh giá --> Trượt: Thiếu

    Đạt --> ChuKỳMới: Giữ hạng, mở chu kỳ mới
    Trượt --> TrừĐiểm: ⛔ TRỪ N ĐIỂM<br/>(Admin cấu hình)
    TrừĐiểm --> XétLại: Rank tự xét theo balance mới
    XétLại --> ChuKỳMới

    note right of TrừĐiểm
        Chốt 2026-09-24.
        Nhiệm vụ tác động GIÁN TIẾP qua điểm,
        không trực tiếp hạ hạng —
        nếu không, hai cơ chế sẽ đá nhau:
        hạ xuống Bạc rồi lần xét sau thấy
        balance vẫn mức Vàng và đẩy ngược lên.
    end note
```

| Rank | Nhiệm vụ mỗi 3 tháng | Điểm kiếm được nếu làm đủ |
| --- | --- | ---: |
| Bạc | 2 lượt Cho + 2 referral | 2×56 + 2×56 = **224** |
| Vàng | 3 lượt Cho + 3 referral | **336** |
| Kim Cương | 4 lượt Cho + 4 referral | **448** |

## 12.4 Cảnh báo sắp tụt hạng — ⛔ chưa có

```mermaid
flowchart TD
    A[Balance thay đổi] --> B{"balance < 70% ngưỡng<br/>rank đang giữ?"}
    B -->|Có| C[Gửi cảnh báo]
    B -->|Không| D[Im lặng]

    subgraph Mốc["Mốc cảnh báo 70%"]
        M1["Thành viên 224 → cảnh báo tại 157"]
        M2["Bạc 672 → 470"]
        M3["Vàng 896 → 627"]
        M4["Kim Cương 1792 → 1254"]
    end
    B -.-> Mốc

    style C fill:#fff3cd
    style Mốc fill:#f0f0f0
```

> **Vì sao bắt buộc phải có.** Khi tiêu điểm làm tụt hạng, người dùng đổi một vật phẩm rồi
> sáng hôm sau phát hiện mình đã xuống Bạc mà không ai báo trước. Bảng ngưỡng trong
> `FEATURES.md` đã có sẵn cột này, nhưng **chưa có đường nào gửi**.

## 12.5 Hệ quả: càng lên cao càng khó tiêu

```mermaid
flowchart LR
    A["Bạc · ngưỡng 672<br/>muốn đổi món 280đ"] --> B["cần có 952đ<br/>mới đổi mà không rơi hạng"]
    C["Kim Cương · ngưỡng 1792<br/>muốn đổi món 280đ"] --> D["cần có 2072đ"]

    style B fill:#fff3cd
    style D fill:#fff3cd
```

Đây là hệ quả tự nhiên của mô hình đã chọn, không phải lỗi — nhưng cần biết trước.

## 12.6 ⚠️ Code hiện đang làm khác

```mermaid
flowchart LR
    subgraph Code["Code hiện tại"]
        A1["rank.repository.ts:387<br/>đọc balance.lifetime"]
        A2["rank_maintenance_cycles<br/>quyết tụt đúng một bậc"]
        A3["Tiêu điểm KHÔNG tụt hạng"]
    end
    subgraph Doc["Tài liệu chốt 2026-09-24"]
        B1["đọc balance hiện tại"]
        B2["trượt nhiệm vụ → trừ điểm"]
        B3["Tiêu điểm TỤT hạng"]
    end
    Code -.cần sửa thành.-> Doc

    style Code fill:#ffe6e6
    style Doc fill:#e6ffe6
```

## Chỗ cần soát

1. ⚠️ **Code đọc `lifetime`, tài liệu nói `balance`.** Mâu thuẫn đã biết, chưa sửa.
2. ⛔ **Trừ N điểm khi trượt nhiệm vụ chưa có code**, và **N chưa có con số**.
3. ⛔ **Cảnh báo sắp tụt hạng chưa có đường gửi.**
4. ⛔ **Nhắc trước 1 tháng** (SRS BR-PROF-RANK-03 yêu cầu) chưa có.
5. Quota và ngưỡng SOS theo rank vẫn là **giả định chờ Bên A xác nhận**.
