# 25 · Riêng tư vị trí & lớp tương thích bài cũ

Hai chuyện khác nhau nhưng cùng nằm ở đường đọc bài, nên gộp một sơ đồ.

## 25.1 Toạ độ jitter — không bao giờ trả vị trí thật ra công khai

Trạng thái: ✅ **đã hiện thực**.

```mermaid
flowchart TD
    A[(posts.location<br/>toạ độ THẬT)] --> B{Ai đang đọc?}
    B -->|Chủ bài| C["Trả toạ độ THẬT<br/>GET /posts/me"]
    B -->|Hai bên trong lượt trao| D["Trả toạ độ THẬT<br/>để hẹn gặp"]
    B -->|Người ngoài / khách| E["JITTER trước khi trả<br/>GET /posts/:id · /nearby · /map"]

    E --> F["Xê dịch ngẫu nhiên trong bán kính nhỏ"]
    F --> G["Đủ để biết 'quanh khu này'<br/>KHÔNG đủ để biết nhà ai"]

    style E fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style G fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

> **Vì sao bắt buộc.** Bài "tặng tủ lạnh" kèm toạ độ chính xác là địa chỉ nhà một người, công
> khai cho bất kỳ ai mở app. Jitter ở tầng đọc chứ không ở tầng ghi — dữ liệu thật vẫn cần
> cho việc tính khoảng cách và hẹn gặp.
>
> **Không dùng route public để lấy vị trí thật.** Nếu có màn hình nào cần toạ độ chính xác,
> nó phải đi đường riêng có kiểm quyền, không phải đọc ké endpoint công khai.

## 25.2 Dự phòng vị trí (F26)

```mermaid
flowchart TD
    A["GET /posts/nearby"] --> B{Có lat VÀ lng?}
    B -->|Đủ cả hai| C["originSource = 'REQUEST'"]
    B -->|Chỉ có một| D["❌ 400 — gửi nửa toạ độ là LỖI,<br/>không phải ý muốn lùi vị trí"]
    B -->|Không có| E{User có Default Location?}
    E -->|Có| F["originSource = 'DEFAULT_LOCATION'"]
    E -->|Không| G["originSource = 'ALL'<br/>trả toàn bộ, distanceMeters = null"]

    G -.-> H["VẪN không tự chọn một toạ độ mặc định:<br/>kết quả quanh một điểm người dùng không chọn<br/>là nói SAI về thứ họ đang xem.<br/>Bỏ HẲN bộ lọc thì trung thực hơn là bịa ra một tâm."]

    style D fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style G fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style H fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
```

## 25.2b Ngoại lệ DUY NHẤT — chính chủ xem bài của mình

```mermaid
flowchart LR
    A["GET /posts/{postId}"] --> B{"currentUserId == authorId?"}
    B -->|Có| C["Toạ độ THẬT<br/>isLocationApproximate = false"]
    B -->|Không| D["applyGeoJitter<br/>isLocationApproximate = true"]

    style C fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style D fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao mở ngoại lệ này (chốt 28/09).** Làm nhiễu toạ độ là để che chỗ ở của người đăng
> khỏi người lạ — che nó khỏi chính họ thì không bảo vệ ai. Chủ bài mở bài mình lên sửa mà
> thấy điểm ghim lệch vài trăm mét sẽ kéo nó về "đúng chỗ" theo cái họ nhìn thấy, và mỗi lần
> sửa là vị trí thật trôi thêm một đoạn. `GET /posts/me` đã trả toạ độ thật từ trước vì đúng
> lý do đó; đây chỉ là bù nốt đường còn thiếu.
>
> Ngoại lệ này KHÔNG áp cho `/posts/nearby`, `/posts/map` hay bất kỳ kênh quét nào — ở đó mọi
> bài đều là bài của người khác.

## 25.3 Thẻ xem nhanh trên bản đồ (F29)

```mermaid
flowchart LR
    A["GET /posts/map"] --> B["Marker mang:<br/>title · thumbnailUrl · isSos · deepLinkPath"]
    B --> C["Ảnh lấy bằng truy vấn con LIMIT 1<br/>theo sort_order"]
    C -.-> D["❌ JOIN thẳng post_media sẽ NHÂN BẢN marker<br/>theo số ảnh → bản đồ hiện nhiều pin<br/>trùng chỗ cho MỘT bài"]

    B --> E["deepLinkPath là đường dẫn TƯƠNG ĐỐI<br/>server không ghép tên miền"]

    style D fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

## 25.4 Lớp tương thích `/gift-posts`

Trạng thái: ✅ đang chạy trong **compatibility window**.

```mermaid
flowchart TD
    subgraph Cũ["Client cũ"]
        A1["POST /gift-posts"]
        A2["GET /gift-posts/nearby"]
        A3["GET /gift-posts/:id"]
        A4["PATCH /gift-posts/:id"]
        A5["DELETE /gift-posts/:id"]
    end
    subgraph Mới["Canonical M2.1"]
        B1["POST /posts"]
        B2["GET /posts/nearby"]
        B3["GET /posts/:id"]
    end

    Cũ -->|gift-post-compat.mapper| Mới
    Mới --> C[(posts — MỘT bảng)]

    D["❌ KHÔNG ghi hai bảng song song"] -.-> C

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style D fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

> `gift-post-compat.mapper.ts` **hardcode `reactionCount` về 0** — đó là chủ ý. Client cũ không
> biết đến cảm xúc, và trả số thật vào một trường nó không hiểu chỉ gây nhầm.

## 25.5 Ai quyết trường nào

```mermaid
flowchart LR
    A["Client gửi lên"] --> B["title · description · ảnh<br/>danh mục · vị trí · tình trạng<br/>isSos · deliveryMethod · shipPayer"]
    C["SERVER tự quyết"] --> D["author — từ token<br/>postType — từ đường gọi<br/>status — luôn PUBLISHED<br/>(bài lên thẳng, chốt 26/09)"]

    E["❌ Nhận status từ client<br/>= ai cũng tự duyệt bài mình"] -.-> C

    style C fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style E fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

## Chỗ cần soát

1. **Bán kính jitter là hằng trong code**, chưa đưa ra cấu hình. Vùng nông thôn bán kính đó
   có thể vẫn chỉ ra đúng một nhà.
2. **Compatibility window chưa có hạn chót.** Không ai nói bao giờ gỡ `/gift-posts`.
3. **Chưa có endpoint trả vị trí thật cho hai bên trong lượt trao** — hiện họ hẹn nhau qua
   chat bằng cách tự gõ địa chỉ.
4. Jitter dùng **ngẫu nhiên mỗi lần gọi** hay cố định theo bài? Nếu ngẫu nhiên mỗi lần, gọi
   nhiều lần rồi lấy trung bình sẽ ra gần đúng vị trí thật.
