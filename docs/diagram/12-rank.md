# 12 · Thứ hạng

Trạng thái: ✅ **đã hiện thực** đúng mô hình chốt ngày 2026-09-24, có script kiểm trên
Postgres thật (`npm run test:rank-balance`).

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
    Trượt --> TrừĐiểm: ✅ TRỪ điểm theo bậc<br/>Bạc 224 · Vàng 336 · KC 448
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

## 12.4 Cảnh báo sắp tụt hạng — ✅ đã có

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
> sáng hôm sau phát hiện mình đã xuống Bạc — mất quota bài, mất quyền SOS — mà không ai báo.
>
> Gửi qua `RankChangeNotifier`, gọi sau MỌI biến động điểm. Khoá chống trùng theo
> `userId:rank:ngày VN` nên **một lời nhắc mỗi ngày cho mỗi bậc**: không có mốc ngày thì mỗi
> lượt kiếm 1 điểm rồi tiêu đi cũng đẻ một thông báo, người dùng tắt hết, và từ đó mất luôn
> thông báo về lượt xin nhận.
>
> Đã tụt rồi thì gửi `RANK_DEMOTED` thay vì cảnh báo — người đã mất hạng không cần nghe "bạn
> sắp mất hạng". `GET /ranks/me` cũng trả `warningPoints` + `demotionWarning` để client tự
> dựng được lời nhắc mà không đặt lại mốc riêng.

## 12.5 Hệ quả: càng lên cao càng khó tiêu

```mermaid
flowchart LR
    A["Bạc · ngưỡng 672<br/>muốn đổi món 280đ"] --> B["cần có 952đ<br/>mới đổi mà không rơi hạng"]
    C["Kim Cương · ngưỡng 1792<br/>muốn đổi món 280đ"] --> D["cần có 2072đ"]

    style B fill:#fff3cd
    style D fill:#fff3cd
```

Đây là hệ quả tự nhiên của mô hình đã chọn, không phải lỗi — nhưng cần biết trước.

## 12.6 Đường trừ điểm khi trượt nhiệm vụ

```mermaid
sequenceDiagram
    autonumber
    participant CLI as npm run rank:evaluate
    participant R as rank_maintenance_cycles
    participant L as point_ledger
    participant U as users

    CLI->>R: Quét chu kỳ OPEN đã quá hạn
    R-->>CLI: Thiếu chỉ tiêu → đánh FAILED
    Note over R: KHÔNG tự đổi hạng ở đây

    CLI->>R: Quét RIÊNG chu kỳ FAILED chưa bị trừ
    Note over CLI,R: Quét riêng vì chu kỳ đã FAILED thì vòng<br/>đánh giá không nhìn tới nó nữa. Tiến trình<br/>chết giữa hai bước là mất khoản trừ vĩnh viễn.
    CLI->>L: appendAdjustment −224, khoá MAINTENANCE_FAILED:&lt;cycleId&gt;
    Note over L: lifetime KHÔNG giảm — khoản trừ là sự kiện<br/>có thật, không phải phủ nhận khoản cộng cũ
    CLI->>U: reconcileNormalRank → xét lại theo balance mới
    U-->>CLI: Tụt hạng nếu rơi dưới ngưỡng
```

## 12.7 Hai lỗi có sẵn chưa từng chạy, đã sửa

```mermaid
flowchart TD
    A["evaluateDueMaintenanceCycles<br/>luôn báo 0 chu kỳ nên thân vòng lặp<br/>CHƯA TỪNG thực thi"] --> B["42P18 — tham số $2 không dùng<br/>trong câu lệnh, Postgres không suy được kiểu"]
    A --> C["42P08 — cùng tham số vừa là timestamp<br/>vừa là toán hạng cộng interval"]
    B & C --> D["Cả hai nổ ngay lần đầu có chu kỳ tới hạn thật"]
    E["Unit test mock query nên không thấy.<br/>test/rank-balance.check.ts là thứ đầu tiên<br/>chạy đoạn này trên Postgres thật."] -.-> D

    style D fill:#ffe6e6
    style E fill:#fff3cd
```

## Chỗ cần soát

1. ⛔ **Nhắc trước 1 tháng** (SRS BR-PROF-RANK-03 yêu cầu) chưa có.
2. ⚠️ **Cột `rank_transitions.points_at_transition`** (trước tên là `lifetime_points`) giữ
   ảnh chụp số điểm lúc đổi hạng. Đã đổi tên vì giá trị ghi vào đó chính là balance.
3. ⚠️ **`reconcileNormalRank` gọi sau MỌI bút toán.** Một người nhận 50 thông báo/ngày sẽ kéo
   50 lượt xét hạng — chưa đo tải, cần theo dõi khi có dữ liệu thật.
4. Quota và ngưỡng SOS theo rank vẫn là **giả định chờ Bên A xác nhận**.
5. **Nhiệm vụ duy trì vẫn dùng `countLifetimeCompletedGifts`** cho điều kiện nâng hạng — cần
   soát xem "N lượt Cho hoàn tất" là đếm trọn đời hay đếm trong chu kỳ.
