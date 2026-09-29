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

    style V fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
    style D fill:#fff9e6,stroke:#c9a227,stroke-width:1.5px,color:#3d3000
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

    style A fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style H fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style I fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

> **Vì sao chỉ một căn cứ.** Trước đây có hai con số cùng nói về hạng: `lifetime` (sàn) và
> nhiệm vụ duy trì (trần). Hai cơ chế cùng quyết một thứ thì luôn có lúc chúng nói ngược
> nhau, và không có quy tắc nào phân xử.

## 12.3 Chu kỳ duy trì 3 tháng

```mermaid
stateDiagram-v2
    [*] --> ChuKỳMới: Lên Bạc/Vàng/Kim Cương
    ChuKỳMới --> ĐangChạy: Bắt đầu đếm 3 tháng
    ĐangChạy --> Nhắc: Còn 1 tháng<br/>✅ RANK_MAINTENANCE_REMINDER
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

    style C fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style Mốc fill:#8c8c8c24,stroke:#8a8a8a,stroke-width:1.5px
```

> **Vì sao bắt buộc phải có.** Khi tiêu điểm làm tụt hạng, người dùng đổi một vật phẩm rồi
> sáng hôm sau phát hiện mình đã xuống Bạc — mất quota bài, mất quyền SOS — mà không ai báo.
>
> ⚠️ **Và đúng đường đó từng bị quên (sửa 29/09).** `RankChangeNotifier` được dựng để gom bốn
> đường làm đổi balance — cộng theo rule, hoàn bút toán, khoản trừ số truyền vào, và **đổi vật
> phẩm** — nhưng đổi vật phẩm gọi thẳng `appendAdjustment`, không qua nó. Người hạng Vàng đổi
> món 300 điểm còn 596 (dưới cả ngưỡng Bạc) mà `users.rank` vẫn là GOLD, nên họ giữ quota 20
> bài và quyền SOS không còn đủ điều kiện cho tới khi một biến động điểm KHÔNG liên quan nào
> đó tình cờ kích hoạt xét lại. `rank-balance.check.ts` gọi `reconcileNormalRank` **bằng tay**
> sau khi tiêu điểm, nên nó xanh trong khi đường thật hỏng — nay có phép kiểm canh chính chỗ
> nối đó. Hai đường khác cũng đã sửa: trừ điểm trượt nhiệm vụ và referral đủ điều kiện từng
> gọi `reconcileNormalRank` trần, nên hạng CÓ đổi nhưng không thông báo nào được gửi.
>
> Gửi qua `RankChangeNotifier`, gọi sau MỌI biến động điểm. Khoá chống trùng theo
> `userId:rank:ngày VN` nên **một lời nhắc mỗi ngày cho mỗi bậc**: không có mốc ngày thì mỗi
> lượt kiếm 1 điểm rồi tiêu đi cũng đẻ một thông báo, người dùng tắt hết, và từ đó mất luôn
> thông báo về lượt xin nhận.
>
> Đã tụt rồi thì gửi `RANK_DEMOTED` thay vì cảnh báo — người đã mất hạng không cần nghe "bạn
> sắp mất hạng". Lên hạng thì gửi `RANK_PROMOTED` (thêm 29/09) và **không** kèm cảnh báo:
> người vừa vượt ngưỡng lên trên thì không thể đang dưới mốc cảnh báo của bậc cũ.
>
> `GET /ranks/me` trả `warningPoints` + `demotionWarning`, và từ 29/09 trả thêm `rankPoints`
> + `rankPointsSource`. **Client phải so với `rankPoints`, không phải `balancePoints`**: cấu
> hình `rank.points_source` áp cho chỗ quyết hạng, nên đọc `balancePoints` là đúng hôm nay và
> sai ngay lần Admin đổi nguồn sang LIFETIME — cảnh báo tính theo một con số còn tụt hạng tính
> theo con số khác. Chính `RankChangeNotifier` trước đây mắc đúng lỗi đó.

## 12.5 Hệ quả: càng lên cao càng khó tiêu

```mermaid
flowchart LR
    A["Bạc · ngưỡng 672<br/>muốn đổi món 280đ"] --> B["cần có 952đ<br/>mới đổi mà không rơi hạng"]
    C["Kim Cương · ngưỡng 1792<br/>muốn đổi món 280đ"] --> D["cần có 2072đ"]

    style B fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style D fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
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
    CLI->>L: appendAdjustment −224, khoá MAINTENANCE_FAILED:#lt;cycleId#gt;
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

    style D fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style E fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

## Chỗ cần soát

1. ✅ **Nhắc trước 1 tháng đã có** (SRS BR-PROF-RANK-03) — `RANK_MAINTENANCE_REMINDER`,
   `RemindMaintenanceBeforeDays = 30`, chạy bằng `notify:reminders`.
   ⚠️ Nội dung lời nhắc từng nói sai: câu quét đọc `cycle.gifts_done`/`referrals_done`, hai
   cột chỉ ghi lúc **đánh giá**, nên với chu kỳ còn OPEN chúng luôn bằng 0 — người đã trao
   xong cả hai món vẫn nhận câu "bạn đã hoàn tất 0/2 lượt trao". Sửa 29/09: đếm sống theo
   cửa sổ chu kỳ, bằng đúng hai câu mà bước đánh giá dùng.
2. ⚠️ **Cột `rank_transitions.points_at_transition`** (trước tên là `lifetime_points`) giữ
   ảnh chụp số điểm lúc đổi hạng. Đã đổi tên vì giá trị ghi vào đó chính là balance.
3. ⚠️ **`reconcileNormalRank` gọi sau MỌI bút toán.** Một người nhận 50 thông báo/ngày sẽ kéo
   50 lượt xét hạng — chưa đo tải, cần theo dõi khi có dữ liệu thật.
4. Quota và ngưỡng SOS theo rank vẫn là **giả định chờ Bên A xác nhận**.
5. ✅ **Đã quyết trong code, có chủ ý.** **Nâng hạng** đếm trọn đời
   (`countLifetimeCompletedGifts` — "thăng hạng thường xét cả quá trình, không bó trong một
   quý"); **duy trì** đếm trong cửa sổ chu kỳ (`countCompletedGifts` với `cycleStart`/
   `cycleEnd`). Hai câu hỏi khác nhau nên hai cách đếm khác nhau.
6. ⚠️ **Chưa có thông báo nào khi tiến độ nhiệm vụ duy trì về đích.** Người làm đủ 2/2 giữa
   chu kỳ vẫn nhận lời nhắc ở mốc 30 ngày (nay nói đúng "2/2"), nhưng không có lời xác nhận
   "bạn đã đủ chỉ tiêu, không bị trừ điểm kỳ này" — mà đó là thứ họ muốn nghe nhất.
