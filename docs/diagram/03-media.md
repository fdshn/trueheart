# 03 · Media & lưu trữ

Trạng thái: ✅ **đã hiện thực** (MinIO ở local/CI). 🟡 R2 staging/production chưa dựng.

## 3.1 Vì sao không upload thẳng qua API

```mermaid
flowchart LR
    subgraph X["❌ Cách không dùng"]
        A1[Client] -->|file 10MB| A2[API server] -->|file| A3[S3]
    end
    subgraph Y["✅ Cách đang dùng"]
        B1[Client] -->|xin URL| B2[API server]
        B2 -->|URL có chữ ký, hết hạn ngắn| B1
        B1 -->|PUT file| B3[S3/R2]
        B1 -->|báo key| B2
        B2 -->|HEAD kiểm tra| B3
    end

    style X fill:#d2464621,stroke:#c0504d,stroke-width:1.5px
    style Y fill:#3ca05021,stroke:#3f8f3f,stroke-width:1.5px
```

> File không đi qua API server: không ăn băng thông, không chiếm worker, và một người upload
> video 500MB không làm chậm mọi request khác.

## 3.2 Luồng đầy đủ

```mermaid
sequenceDiagram
    autonumber
    actor C as Client
    participant API as Core API
    participant S3 as MinIO / R2
    participant DB as Postgres

    C->>API: POST /posts/:postId/media/upload { contentType, size }
    API->>API: Kiểm quyền sở hữu bài
    API->>API: Kiểm loại file + kích thước tối đa
    API->>S3: Sinh presigned PUT URL (TTL ngắn)
    API-->>C: { uploadUrl, objectKey }

    C->>S3: PUT uploadUrl (file thật)
    S3-->>C: 200

    C->>API: POST /posts/:postId/media { objectKey }
    API->>S3: HEAD objectKey — có thật không, kích thước bao nhiêu?
    alt Không tồn tại / sai chủ
        API-->>C: 400
    else Hợp lệ
        API->>DB: INSERT post_media (order = cuối)
        API-->>C: 201
    end
```

> **Vì sao phải `HEAD` lại sau khi client báo key.** Client nói "tôi upload xong rồi" là một
> lời khai, không phải bằng chứng. Không kiểm thì một người gửi key trỏ vào object của người
> khác là gắn được ảnh của họ vào bài mình.

## 3.3 Ba nơi dùng cùng một khuôn

```mermaid
flowchart TD
    M["Khuôn presign + verify"] --> A["POST /posts/:postId/media/upload<br/>Ảnh bài đăng ✅"]
    M --> B["PATCH /profile/me/avatar-upload<br/>Ảnh đại diện ✅"]
    M --> C["POST /chat/rooms/:roomId/message-media/upload-url<br/>Ảnh trong chat ✅"]
    M --> D["POST //posts/:subjectId/comment-media/upload-url<br/>Ảnh bình luận ✅"]
    M --> E["POST /transactions/:transactionId/evidence/upload-url<br/>Ảnh bằng chứng bàn giao ✅"]
```

## 3.4 Sắp xếp và xoá

```mermaid
flowchart LR
    A["PATCH /posts/:postId/media/order"] --> B[Nhận MẢNG mediaId theo thứ tự mới]
    B --> C{Mảng có đúng<br/>tập id hiện có?}
    C -->|Không| D[❌ 400 — không sắp xếp một phần]
    C -->|Có| E[Ghi lại order trong một transaction]

    F["DELETE /posts/:postId/media/:mediaId"] --> G[Xoá bản ghi]
    G --> H[Đánh dấu object để dọn sau]

    style D fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
```

> **Vì sao sắp xếp phải gửi trọn mảng.** Gửi từng cặp "đổi chỗ A với B" thì hai request chồng
> nhau cho ra thứ tự không ai đoán được. Gửi trọn mảng là một phép gán, chạy lại bao nhiêu
> lần cũng ra cùng kết quả.

## Chỗ cần soát

1. **Object mồ côi chưa có ai dọn.** Client xin URL rồi bỏ ngang, hoặc upload xong không gọi
   bước xác nhận — object nằm lại trong bucket mãi mãi. Cần một job quét theo tuổi.
2. R2 staging/production chưa có bucket, key, CORS, CDN domain — hiện chỉ chạy MinIO.
3. Chưa có giới hạn tổng dung lượng theo người dùng. Dashboard KPI (F59) có mục "dung lượng
   lưu trữ" nhưng không có hạn mức nào chặn.
