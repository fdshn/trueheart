# 05 · Khám phá & feed

Trạng thái: ✅ **đã hiện thực**.

## 5.1 Ba đường đọc bài

```mermaid
flowchart TD
    subgraph Khách["Chưa đăng nhập"]
        G1["GET /discovery/config"] --> G2[Trả cấu hình vùng mặc định<br/>+ loại bài công khai]
    end
    subgraph Đã["Đã đăng nhập"]
        N1["GET /posts/nearby"] --> N2[Keyset cursor<br/>ST_DWithin theo bán kính]
        M1["GET /posts/map"] --> M2[Gom cụm theo ô lưới<br/>trả số đếm, không trả từng bài]
        O1["GET /posts/me"] --> O2[Bài của chính mình<br/>mọi trạng thái]
    end

    style Khách fill:#f0f0f0
```

> **Vì sao bản đồ trả cụm chứ không trả từng bài.** Một thành phố có 50.000 bài; trả hết là
> vài chục MB cho một lần kéo bản đồ. Gom cụm cho ra vài trăm điểm, và người dùng zoom vào
> mới cần chi tiết.

## 5.2 Truy vấn theo vị trí

```mermaid
flowchart LR
    A[Request kèm lat/lng/radius] --> B{Có vị trí không?}
    B -->|Không| C[Dùng default_location của user]
    C --> D{Cũng không có?}
    D -->|Không có| E[Dùng vùng mặc định<br/>từ discovery config]
    B -->|Có| F[Dùng vị trí gửi lên]
    D -->|Có| F
    E --> F
    F --> G["ST_DWithin(location, point, radius)<br/>index GiST"]
    G --> H[Sắp theo khoảng cách + thời gian]
    H --> I[Keyset cursor — không OFFSET]

    style G fill:#e7f3ff
```

> **Vì sao keyset chứ không `OFFSET`.** `OFFSET 10000` bắt Postgres đọc và bỏ đi 10.000 dòng
> mỗi lần. Keyset mang theo mốc của dòng cuối và đọc tiếp từ đó — trang thứ 1.000 nhanh bằng
> trang đầu. Và khi có bài mới chen vào, `OFFSET` làm người dùng thấy lặp hoặc nhảy bài.

## 5.3 Dữ liệu đính kèm mỗi bài

```mermaid
flowchart TD
    P[Một bài trong danh sách] --> A["likeCount — số lượt kind = LIKE"]
    P --> B["reactionCount — tổng mọi cảm xúc"]
    P --> C["commentCount"]
    P --> D["shareCount"]
    P --> E["isLiked — suy ra từ myReaction"]
    P --> F["myReaction — LIKE/LOVE/CARE/WOW/SAD hoặc null"]

    G["findMyReactions()<br/>MỘT truy vấn cho cả trang"] -.nuôi.-> E
    G -.nuôi.-> F

    style G fill:#e6ffe6
```

> **Vì sao gom một truy vấn cho cả trang.** Hỏi từng bài "người này đã thả cảm xúc chưa" là
> 20 truy vấn cho một trang 20 bài. Gom lại còn một, và `isLiked` suy ra từ `myReaction` chứ
> không hỏi thêm lần nữa.

## 5.4 Smart match

```mermaid
sequenceDiagram
    actor U as Chủ bài WANTED
    participant API as "GET /posts/:postId/matches"
    participant DB as Postgres

    U->>API: Tìm bài OFFER khớp với bài mình đang cần
    API->>DB: Lọc theo danh mục + bán kính + còn mở
    DB-->>API: Danh sách ứng viên
    API->>API: Sắp theo khoảng cách
    API-->>U: Gợi ý
```

## Chỗ cần soát

1. **Smart match hiện chỉ khớp theo danh mục + khoảng cách.** Không tính tới rank người tặng,
   lịch sử, hay từ khoá trong mô tả. Đủ chưa?
2. **Guest discovery** trả cấu hình vùng mặc định — cần chốt vùng đó là gì (Hà Nội? toàn
   quốc?) và bán kính bao nhiêu.
3. Chưa có **bộ lọc theo loại bài** trên `nearby`. Người chỉ muốn xem Muốn Tặng vẫn thấy cả
   rao vặt và từ thiện.
