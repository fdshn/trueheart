# 05 · Khám phá & feed

Trạng thái: ✅ **đã hiện thực**, gồm cả tìm kiếm theo từ khoá (26/09).

## 5.1 Bốn đường đọc bài

```mermaid
flowchart TD
    subgraph CongKhai["CÔNG KHAI — không cần token"]
        G1["GET /discovery/config"] --> G2[Trả trần bán kính, cỡ trang<br/>và danh sách loại bài]
        N1["GET /posts/nearby"] --> N2["ST_DWithin theo bán kính<br/>+ lọc loại + TÌM KIẾM từ khoá"]
        M1["GET /posts/map"] --> M2["GOM CỤM theo ô lưới<br/>trả số đếm + tổng thật"]
    end
    subgraph Rieng["Cần token"]
        O1["GET /posts/me"] --> O2[Bài của chính mình<br/>mọi trạng thái]
    end

    style CongKhai fill:#8c8c8c24,stroke:#8a8a8a,stroke-width:1.5px
    style M2 fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **`nearby` và `map` là CÔNG KHAI.** Khách chưa đăng nhập xem được, miễn là gửi kèm toạ độ —
> không có token thì không có Vị trí mặc định để lùi về.

> ✅ **Bản đồ gom cụm — làm 26/09.** Trước đó nó trả **từng marker, cắt cứng ở 200**, không
> `total`, không cờ báo đã cắt. Khu đông bài thì người dùng thấy 200 marker "nào đó" và zoom
> ra lại thấy bản đồ **thưa hơn** lúc zoom vào từng quận — ngược đời, và không có gì giải
> thích. Xem §5.6.

## 5.2 Truy vấn theo vị trí

```mermaid
flowchart LR
    A[Request] --> B{Có lat và lng?}
    B -->|Có cả hai| F[Dùng toạ độ gửi lên]
    B -->|Chỉ một trong hai| X["❌ 400 — lỗi của client,<br/>không phải ý muốn lùi"]
    B -->|Không có| C{Đã đăng nhập<br/>và có Vị trí mặc định?}
    C -->|Có| D[Dùng Vị trí mặc định]
    C -->|Không| Y["❌ 400 DISCOVERY_ORIGIN_UNAVAILABLE"]
    F --> G["ST_DWithin(location, point, radius)<br/>index GiST"]
    D --> G
    G --> H["ORDER BY khoảng cách, rồi id"]
    H --> I["OFFSET / LIMIT theo page, pageSize"]

    style G fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style X fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style Y fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
```

> **KHÔNG có nhánh lùi thứ ba.** Sơ đồ cũ vẽ "dùng vùng mặc định từ discovery config" — mã cố
> ý **không** làm thế, và có ghi chú giải thích: trả kết quả quanh một điểm người dùng không
> chọn là nói sai về thứ họ đang xem. `discovery/config` chỉ trả trần bán kính và cỡ trang,
> không trả toạ độ nào.

> **Phân trang là OFFSET, không phải keyset.** Sơ đồ cũ khẳng định ngược lại. Keyset chỉ dùng
> cho chat. Đổi `nearby` sang keyset là đổi hợp đồng API (bỏ `page`), nên tạm thời vá bằng
> **tiebreak `post.id`** trong `ORDER BY`: thiếu nó thì hai bài cùng khoảng cách không có thứ
> tự đảm bảo giữa hai lần chạy, và lật trang sẽ lặp bài hoặc bỏ sót bài.

## 5.3 Tìm kiếm — ✅ 26/09

```mermaid
flowchart TD
    A["GET /posts/nearby?keyword=..."] --> B[Bỏ dấu cả câu hỏi lẫn dữ liệu]
    B --> C["to_tsvector(simple, chantam_unaccent(title + description))<br/>@@ plainto_tsquery(simple, chantam_unaccent(keyword))"]
    C --> D["Index GIN: IDX_posts_search"]
    C --> E{Có kèm postType?}
    E -->|Có| F[Lọc chồng thêm loại bài]
    E -->|Không| G[Tìm trong mọi loại]
    F --> H["LUÔN nằm trong bán kính đang xem"]
    G --> H

    style D fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
    style H fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Tìm kiếm là một THAM SỐ của feed, không phải một endpoint riêng.** Cùng một lần gọi vừa
> lọc loại bài, vừa lọc danh mục, vừa tìm từ khoá, vừa giới hạn bán kính. Tách ra thành
> `/posts/search` sẽ có hai đường trả về hai hình dạng cho cùng một thứ, và client phải đổi
> đường gọi mỗi khi người dùng gõ hay xoá ô tìm kiếm.

> **Luôn giới hạn trong bán kính** (chốt 26/09). Đây là sàn cho–nhận: tìm ra một món ở cách
> 800 km là tìm ra một món không ai tới lấy được.

> **Không phân biệt dấu.** Gõ `noi com dien` ra `Nồi cơm điện`. `unaccent` mặc định là STABLE
> nên không đánh index được; bọc lại thành `chantam_unaccent` IMMUTABLE có chỉ rõ từ điển mới
> index được. **Biểu thức trong index phải trùng khít với biểu thức trong câu truy vấn** — sai
> một ký tự là Postgres lặng lẽ quét tuần tự cả bảng, và không ai thấy gì cho tới khi bảng đủ
> lớn. `test:lifecycle` có một phép kiểm `EXPLAIN` canh đúng chuyện đó.

> **`plainto_tsquery` chứ không `to_tsquery`:** người dùng gõ tự do, và `to_tsquery` ném lỗi
> cú pháp ngay khi gặp một dấu `&` hay dấu nháy.

> **Cách khớp:** mọi từ phải cùng xuất hiện, và khớp theo **từ trọn vẹn** — `nồi cơ` không ra
> `nồi cơm`. Muốn gõ tới đâu gợi ý tới đó thì cần thêm khớp tiền tố, chưa làm.

## 5.4 Bản đồ gom cụm — ✅ 26/09

```mermaid
flowchart TD
    A["GET /posts/map + khung nhìn"] --> B["Cỡ ô = bề ngang khung nhìn / 16<br/>lượng tử về luỹ thừa của 2"]
    B --> C["ST_SnapToGrid — lưới neo vào GỐC TOẠ ĐỘ,<br/>không neo vào khung nhìn"]
    C --> D[GROUP BY ô, đếm số bài]
    D --> E{Ô có mấy bài?}
    E -->|Nhiều| F["Trả count + TÂM Ô<br/>không kèm chi tiết bài nào"]
    E -->|Đúng một| G["Trả count = 1 + toạ độ đã làm nhiễu<br/>+ đủ dữ liệu thẻ xem nhanh"]
    F --> H["total, cellSizeDegrees, truncated"]
    G --> H

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style H fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **Vì sao lưới neo vào gốc toạ độ, không neo vào khung nhìn.** Chia đều khung nhìn thì mỗi
> lần người dùng kéo bản đồ một chút là lưới lệch một chút, và các cụm nhảy chỗ liên tục dù
> không bài nào đổi. Lượng tử cỡ ô về luỹ thừa của 2 khiến lưới đứng yên khi kéo ngang, và chỉ
> đổi cỡ khi phóng to/thu nhỏ qua một mức.

> **Vì sao ô nhiều bài vẽ ở TÂM Ô chứ không ở trọng tâm các bài.** Trọng tâm của hai bài cùng
> một địa chỉ **chính là địa chỉ đó** — gom cụm mà vẫn để lộ vị trí chính xác thì vô nghĩa. Ô
> đúng một bài thì dùng toạ độ đã làm nhiễu, y như mọi chỗ khác trong hệ thống.

> **Vì sao ô một bài kèm luôn chi tiết.** Zoom sát vào thì mỗi ô còn một bài, và đó đúng là
> lúc người dùng muốn xem thẻ xem nhanh (F29). Bắt gọi thêm một vòng nữa cho mỗi pin là quay
> lại đúng vấn đề mà gom cụm vừa giải quyết.

> **`total` đếm TRƯỚC khi cắt.** `count(*) OVER ()` và `sum(...) OVER ()` chạy trước `LIMIT`,
> nên con số trả về là số thật của cả khung nhìn. Chạm trần số ô thì `truncated = true` nói
> rõ — khác hẳn bản cũ cắt ở 200 và im lặng.

> ⚠️ **Đổi hợp đồng API.** Response không còn `markers` mà là `clusters` + `total` +
> `cellSizeDegrees` + `truncated`. Client phải sửa theo.

## 5.5 Dữ liệu đính kèm mỗi bài

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

    style G fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **Vì sao gom một truy vấn cho cả trang.** Hỏi từng bài "người này đã thả cảm xúc chưa" là
> 20 truy vấn cho một trang 20 bài. Gom lại còn một, và `isLiked` suy ra từ `myReaction` chứ
> không hỏi thêm lần nữa.

## 5.6 Smart match

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

> **Khác tìm kiếm ở §5.3.** Smart match chạy **tự động**, từ khoá lấy từ chính bài WANTED của
> người dùng chứ họ không gõ gì. Tìm kiếm là người dùng chủ động hỏi.

## Chỗ cần soát

1. ⚠️ **Phân trang `nearby` vẫn là OFFSET.** Đã vá thứ tự bằng tiebreak nên không còn lặp/sót bài,
   nhưng trang thứ 1.000 vẫn bắt Postgres đọc rồi bỏ đi 20.000 dòng. Chuyển sang keyset là
   đổi hợp đồng API.
2. **Smart match chỉ khớp theo danh mục + khoảng cách + từ khoá lấy từ tiêu đề bài.** Không
   tính rank người tặng hay lịch sử. Đủ chưa?
3. **Tìm kiếm khớp theo từ trọn vẹn**, chưa có gợi ý theo tiền tố khi đang gõ. Cần không?
4. **Khách chưa đăng nhập phải tự gửi toạ độ.** Không có token thì không có Vị trí mặc định
   để lùi về, và hệ thống cố ý không chọn hộ một vùng nào.
5. **Feed không loại bài của chính mình** — bạn thấy bài mình vừa đăng lẫn trong danh sách.
   Cần chốt.
