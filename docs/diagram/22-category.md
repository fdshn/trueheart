# 22 · Danh mục

Trạng thái: ✅ **đã hiện thực**, đã chuyển từ allowlist username sang quyền `category.manage`.

## 22.1 Cây danh mục

```mermaid
flowchart TD
    R["Danh mục gốc"] --> A["Đồ điện tử"]
    R --> B["Quần áo"]
    R --> C["Đồ gia dụng"]
    A --> A1["Điện thoại"]
    A --> A2["Máy tính"]
    B --> B1["Trẻ em"]
    B --> B2["Người lớn"]

    style R fill:#e7f3ff
```

Lưu theo mô hình cây với `parent_id`. Bài đăng gắn vào **nút lá**, nhưng truy vấn theo nút
cha phải lấy được cả nhánh con.

## 22.2 CRUD

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant API as Core API
    participant DB as Postgres

    A->>API: POST /categories
    API->>API: Kiểm quyền category.manage
    API->>DB: parent_id có tồn tại không?
    API->>DB: INSERT categories (is_active = true)

    A->>API: PATCH /categories/:categoryId
    API->>API: Đổi tên, đổi cha, hoặc tắt
    alt Tắt danh mục
        API->>DB: Còn bài đang dùng không?
        alt Còn
            API-->>A: 409 — không tắt danh mục đang được dùng
        else Hết
            API->>DB: is_active = false
        end
    end
```

> **Vì sao tắt chứ không xoá.** Bài cũ trỏ vào danh mục đó vẫn cần đọc được tên để hiển thị
> lịch sử. Xoá đi thì mọi bài cũ trong danh mục mất nhãn và không ai dựng lại được.
>
> **Vì sao chặn tắt khi còn bài dùng.** Tắt một danh mục đang có 3.000 bài là làm 3.000 bài
> biến mất khỏi bộ lọc mà không ai báo trước.

## 22.3 Hai đường đọc

```mermaid
flowchart LR
    A["GET /categories<br/>người dùng thường"] --> B["Chỉ trả is_active = true"]
    C["GET /admin/categories<br/>quyền category.read"] --> D["Trả CẢ danh mục đã tắt<br/>để Admin bật lại được"]

    style D fill:#fff3cd
```

## Chỗ cần soát

1. **Chưa có sắp xếp thủ công** — danh mục trả theo thứ tự tự nhiên, Admin không đổi được thứ
   tự hiển thị.
2. **Chưa có icon/ảnh cho danh mục**, trong khi app thường cần chúng ở màn hình chọn.
3. **Chưa có gộp danh mục** (merge). Tạo nhầm hai danh mục trùng nghĩa thì phải sửa tay từng
   bài.
4. Độ sâu cây **không giới hạn** — chưa có ràng buộc nào chặn ai đó tạo 20 tầng.
