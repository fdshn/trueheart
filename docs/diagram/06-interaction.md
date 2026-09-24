# 06 · Tương tác — cảm xúc, bình luận, chia sẻ

Trạng thái: ✅ **đã hiện thực**, gồm cả việc gộp hai hệ thống "thích" trùng nhau.

## 6.1 Một nguồn sự thật, hai lối vào

```mermaid
flowchart TD
    subgraph Lối vào
        A["POST /posts/:postId/like<br/>Lối tắt nhị phân"]
        B["PUT //posts/:subjectId/reactions/me<br/>Chọn 1 trong 5 cảm xúc"]
    end

    A -->|kind = LIKE| T[(content_reactions<br/>NGUỒN SỰ THẬT DUY NHẤT)]
    B -->|kind tuỳ chọn| T

    T --> C1["posts.like_count<br/>= số kind = LIKE"]
    T --> C2["posts.reaction_count<br/>= tổng mọi kind"]

    style T fill:#e7f3ff
```

> **Vì sao giữ cả hai lối vào.** Trước đây hai nhánh code tạo ra hai bảng riêng, và
> `GET /posts/:id` trả **hai con số thích khác nhau** cho cùng một bài. Gộp về một bảng giữ
> được cả nút thích quen thuộc lẫn năm cảm xúc, mà chỉ còn một con số đúng.

## 6.2 Đổi cảm xúc — chỗ dễ sai nhất

```mermaid
flowchart TD
    A[Người dùng đổi LIKE → LOVE] --> B{Cần cập nhật gì?}
    B --> C["like_count −1<br/>(không còn là LIKE)"]
    B --> D["reaction_count GIỮ NGUYÊN<br/>(vẫn là một người bày tỏ)"]

    E[Người dùng thả LIKE lần đầu] --> F["like_count +1<br/>reaction_count +1"]
    G[Người dùng gỡ LIKE] --> H["like_count −1<br/>reaction_count −1"]

    style C fill:#fff3cd
    style D fill:#fff3cd
```

Câu SQL phải biết **loại cũ** trước khi ghi loại mới:

```sql
WITH prev AS (
  SELECT kind FROM content_reactions
  WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3
  FOR UPDATE
), upserted AS (
  INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (subject_type, subject_id, user_id)
  DO UPDATE SET kind = EXCLUDED.kind, updated_at = now()
  RETURNING (xmax = 0) AS inserted
)
SELECT upserted.inserted, prev.kind AS old_kind
FROM upserted LEFT JOIN prev ON true
```

> `xmax = 0` phân biệt **chèn mới** với **cập nhật do đụng khoá**. Không có nó thì không biết
> nên cộng `reaction_count` hay giữ nguyên.

## 6.3 Bình luận và trả lời

```mermaid
sequenceDiagram
    autonumber
    actor U as Người bình luận
    participant API as Core API
    participant F as Bộ lọc từ ngữ
    participant DB as Postgres
    participant N as Thông báo

    U->>API: POST //posts/:subjectId/comments { body, parentId?, mediaKeys }
    API->>F: Kiểm nội dung
    alt Dính từ cấm
        F-->>API: PENDING_REVIEW
        API->>DB: INSERT (ẩn khỏi công khai)
        Note over N: KHÔNG gửi thông báo —<br/>báo là làm lộ thứ chưa được duyệt
    else Sạch
        F-->>API: VISIBLE
        API->>DB: INSERT + tăng comment_count
        API->>API: Commit
        alt Bình luận gốc
            API->>N: Báo CHỦ BÀI
        else Trả lời
            API->>N: Báo TÁC GIẢ BÌNH LUẬN CHA
            Note over N: Nếu người đó cũng là chủ bài<br/>thì CHỈ MỘT thông báo
        end
        Note over N: Không bao giờ tự báo chính mình
    end
```

## 6.4 Cảm xúc — chỉ báo lần đầu trong ngày

```mermaid
flowchart TD
    A[Có người thả cảm xúc] --> B{Là lượt bày tỏ MỚI?}
    B -->|Không, chỉ đổi loại| C[Không báo]
    B -->|Có| D{Đã báo hôm nay chưa?}
    D -->|Rồi| E[Không báo]
    D -->|Chưa| F[Gửi thông báo]

    G["Khoá chống trùng:<br/>CONTENT_REACTION_FIRST:postId:YYYY-MM-DD<br/>ngày cắt theo Asia/Ho_Chi_Minh"] -.-> D

    style F fill:#e6ffe6
    style G fill:#f0f0f0
```

> **Vì sao chỉ một lần mỗi ngày.** Một bài 200 lượt cảm xúc mà báo 200 lần thì tác giả tắt
> thông báo, và từ đó mất luôn thông báo về lượt xin nhận — thứ thật sự quan trọng.
>
> **Vì sao cắt ngày theo giờ Việt Nam.** Cắt theo UTC thì "lần đầu trong ngày" rơi vào 7 giờ
> sáng, và người dùng thấy hai thông báo trong cùng một buổi sáng.

## 6.5 Chia sẻ

```mermaid
flowchart LR
    A["POST //posts/:subjectId/shares"] --> B[Ghi bản ghi chia sẻ]
    B --> C[Tăng share_count]
    C --> D[Trả link chia sẻ]
```

## Chỗ cần soát

1. **Bình luận `PENDING_REVIEW` hiện không có hàng đợi Admin riêng.** Nó nằm đó chờ, nhưng
   không ai được nhắc là có thứ đang chờ duyệt.
2. Bộ lọc từ ngữ dùng **danh sách tĩnh trong code** — chưa đưa ra cấu hình Admin.
3. Cảm xúc trên **bình luận** có `reaction_count` nhưng không có `like_count` (bình luận
   không có nút thích riêng). Đúng ý chưa?
4. Chưa có giới hạn số bình luận / phút — chống spam hiện chỉ dựa vào bộ lọc từ ngữ.
