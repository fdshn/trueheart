# 19 · Group Affiliate & điều kiện địa lý

Trạng thái: ⛔ **chưa có dòng code nào.** Thiết kế theo SRS §3.7A (BR-AFF) và CHỐT-06.

## 19.1 Affiliate khác Personal Referral thế nào

```mermaid
flowchart LR
    subgraph P["Personal Referral ✅ đã có"]
        P1["Referrer → Referee"]
        P2["MỘT LẦN duy nhất"]
        P3["+56đ khi referee đủ điều kiện"]
    end
    subgraph A["Group Affiliate ⛔ chưa có"]
        A1["Sự kiện → TOÀN BỘ Active Member"]
        A2["LẶP LẠI nhiều lần"]
        A3["Điểm từng loại sự kiện do Admin cấu hình"]
    end

    style P fill:#3ca05021,stroke:#3f8f3f,stroke-width:1.5px
    style A fill:#d2464621,stroke:#c0504d,stroke-width:1.5px
```

## 19.2 Luồng xử lý một sự kiện affiliate

```mermaid
flowchart TD
    A["Sự kiện xảy ra<br/>đăng bài / trao hoàn tất / mời người mới /<br/>tham gia hoạt động / giao dịch hợp lệ"] --> B{Người gây ra sự kiện<br/>có thuộc Group nào?}
    B -->|Không| C[Bỏ qua]
    B -->|Có| D[Xác định vị trí sự kiện]

    D --> E{"ST_DWithin(vị trí, group.center, group.radius)?"}
    E -->|Ngoài vùng| F["Vẫn GHI NHẬN<br/>gắn NOT_ELIGIBLE_GEO<br/>point_delta = 0"]
    E -->|Trong vùng| G[Lấy danh sách Active Member]

    G --> H["Active Member = status ACTIVE<br/>VÀ last_login_at trong 90 ngày"]
    H --> I[Chia thưởng theo rule Admin cấu hình]
    I --> J[Ghi point_ledger cho TỪNG người]
    J --> K["Ghi audit: khoảng cách đo được<br/>+ bán kính đã áp dụng"]

    style F fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style E fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style K fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao ngoài vùng vẫn ghi nhận chứ không bỏ đi.** Bỏ đi thì khi có tranh chấp "vì sao sự
> kiện của tôi không được tính", không có gì để tra. Ghi kèm lý do `NOT_ELIGIBLE_GEO` trả lời
> được câu đó.
>
> **Vì sao audit phải lưu cả khoảng cách lẫn bán kính.** Bán kính là snapshot lúc tạo Group;
> nếu về sau Admin sửa cấu hình, không có hai con số này thì không dựng lại được phán quyết
> cũ (F58).

## 19.3 Thứ tự lấy vị trí (F58)

```mermaid
flowchart TD
    A[Cần xác định vị trí sự kiện] --> B{Sự kiện có vị trí riêng?}
    B -->|Có| Z[Dùng vị trí đó]
    B -->|Không| C{Giao dịch có vị trí?}
    C -->|Có| Z
    C -->|Không| D{Bài đăng có vị trí?}
    D -->|Có| Z
    D -->|Không| E{User có Default Location?}
    E -->|Có| Z
    E -->|Không| F["❌ CHƯA ĐỦ ĐIỀU KIỆN<br/>KHÔNG mặc định cho qua"]

    style F fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style Z fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **Vì sao không có vị trí thì từ chối chứ không cho qua.** Cho qua là mở đúng cái cửa mà
> điều kiện địa lý sinh ra để đóng: lập nhóm ảo rải khắp nơi, gửi sự kiện không kèm vị trí,
> và thu điểm ở mọi nơi.

## 19.4 Định nghĩa Active Member

```mermaid
flowchart LR
    A[Thành viên nhóm] --> B{status = ACTIVE?}
    B -->|Không| C[❌ Không nhận thưởng]
    B -->|Có| D{"last_login_at trong 90 ngày?"}
    D -->|Không| C
    D -->|Có| E[✅ Nhận phần chia]

    F["Chốt 2026-09-24.<br/>Mốc cập nhật MỖI LẦN refresh token,<br/>không chỉ lúc nhập mật khẩu"] -.-> D

    style F fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

> **Vì sao mốc phải tính cả nhánh refresh token.** App mobile giữ refresh token nên người mở
> app hằng ngày vẫn có thể không "đăng nhập" lần nào suốt 90 ngày. Chỉ ghi ở nhánh login sẽ
> đánh nhầm người đang dùng đều thành không hoạt động, và họ mất phần chia.

## 19.5 Chống gian lận

```mermaid
flowchart TD
    A[Các hàng rào] --> B["Geo eligibility — sự kiện phải trong bán kính"]
    A --> C["Link mời chỉ cho tài khoản MỚI"]
    A --> D["Không rời, không chuyển nhóm"]
    A --> E["Mỗi người tối đa 1 Group"]
    A --> F["Active Member phải đăng nhập trong 90 ngày"]
    A --> G["Depth = 1, không phân tầng sâu"]
    A --> H["Có cơ chế THU HỒI thưởng"]

    style A fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

## Chỗ cần soát

1. ⛔ **Toàn bộ phân hệ chưa có code**, và nó phụ thuộc [18-group](./18-group.md) cũng chưa có.
2. **Danh sách loại sự kiện affiliate chưa chốt cụ thể.** BR-AFF-02 liệt kê "đăng bài,
   tặng/giao dịch hoàn tất, mời user mới hợp lệ, tham gia Event, giao dịch hợp lệ trong vùng"
   — cần biến thành danh sách mã rule rõ ràng.
3. **Điểm cho từng loại sự kiện chưa có con số nào.**
4. **Cách chia thưởng chưa rõ**: mỗi Active Member nhận đủ N điểm, hay N điểm chia đều cho số
   người? Nhóm 500 người thì hai cách chênh nhau 500 lần.
5. **Cơ chế thu hồi** (BR-AFF) chưa có thiết kế — thu hồi khi nào, ai bấm, ghi sổ thế nào.
6. **Cap ngày cho affiliate chưa có.** Không có cap thì một nhóm lớn sinh điểm không giới hạn.
