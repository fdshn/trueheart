# 04 · Bài đăng

Trạng thái: ✅ **đã hiện thực**. Năm loại bài đi chung **một** endpoint `POST /posts`.

## 4.1 Năm loại bài

```mermaid
flowchart TD
    P["POST /posts<br/>(một đường duy nhất)"] --> T{postType}
    T --> O["OFFER<br/>Muốn tặng"]
    T --> W["WANTED<br/>Muốn nhận / SOS"]
    T --> C["CHARITY<br/>Từ thiện, hoạt động"]
    T --> L["CLASSIFIED<br/>Rao vặt giá rẻ"]
    T --> M["MERIT<br/>Công đức"]

    O --> Q{Quota theo rank}
    W --> S{Bật SOS cần rank Bạc+}
    C --> A["⚠️ KHÔNG có cổng riêng<br/>ai qua onboarding cũng đăng được<br/>và nó ăn quota POST_OFFER"]
    L --> E[Tồn tại tối đa 3 tháng<br/>hết hạn → chuyển OFFER]
    M --> A

    style P fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style A fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

> ⚠️ **Sơ đồ cũ ghi CHARITY cần "Kim Cương đề xuất → Admin duyệt" — trong mã KHÔNG có gì như
> vậy.** Không cổng theo hạng, không bước duyệt. `CHARITY` và `MERIT` hiện chỉ khác `OFFER` ở
> chỗ chúng không mang trường riêng nào, và cả hai đều ăn quota `POST_OFFER`. Cần Bên A chốt
> có muốn cổng thật không.

> **Vì sao một endpoint chứ không năm.** Năm đường riêng thì năm chỗ kiểm quyền, năm chỗ kiểm
> quota, năm chỗ kiểm media — và chỉ cần sót một chỗ là có một lối vào không được canh.

## 4.2 Quota theo rank

```mermaid
flowchart LR
    A[Đăng bài] --> B["Đếm bài đang mở<br/>của người này"]
    B --> C{"< quota của rank?"}
    C -->|Không| D[❌ 403 QUOTA_EXCEEDED<br/>kèm số hiện tại / số tối đa]
    C -->|Có| E[✅ Cho đăng]

    subgraph CauHinh["POST_OPEN trong capability_rank_values<br/>Admin sửa lúc chạy"]
        R1["Viewer — 0"]
        R2["Thành viên — 3"]
        R3["Bạc — 10"]
        R4["Vàng — 20"]
        R5["Kim Cương — 50"]
        %% Nối vô hình để năm bậc xếp ĐÚNG THỨ TỰ; bỏ ra thì mermaid tự dàn và
        %% cái thang hiện lên lộn xộn.
        R1 ~~~ R2 ~~~ R3 ~~~ R4 ~~~ R5
    end
    C -.đọc.-> CauHinh

    style D fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style CauHinh fill:#8c8c8c24,stroke:#8a8a8a,stroke-width:1.5px
```

> Con số là **baseline**, Admin chỉnh qua `POST /api/v1/admin/entitlements` không cần deploy.
> Viewer 0 nghĩa là **phải xong onboarding mới đăng được bài** — đó là cổng vào thật sự.

> ✅ **Chốt 26/09: MỘT hạn mức `POST_OPEN` cho mọi loại bài.** Trước đó có hai capability
> `POST_OFFER` và `POST_WANTED`, mỗi cái một bộ số theo hạng — nhưng phép đếm vẫn là **mọi
> bài đang mở, bất kể loại**, rồi so với con số của loại đang đăng. Tức hai cái thước đo cùng
> một rổ.
>
> Hôm đó hai số bằng nhau nên không ai thấy gì. Đặt lệch đi là ra kết quả khó đoán: với
> `POST_WANTED=10`, `POST_OFFER=3` và 5 bài OFFER đang mở thì **đăng WANTED được** (5 < 10)
> mà **đăng OFFER không** (5 ≥ 3). Gộp lại không đổi hạn mức thực tế của ai — chỉ làm cấu
> hình nói đúng điều nó làm.
>
> Migration chép số từ `POST_OFFER` **đang có** chứ không từ hằng số gốc: Admin có thể đã
> chỉnh, và ghi đè bằng baseline là lặng lẽ huỷ thay đổi của họ. Các bản cấu hình **cũ giữ
> nguyên** hai capability kia — chúng là lịch sử, và một bút toán điểm cũ phải tra lại được
> nó ra đời dưới luật nào.

## 4.3 Vòng đời bài đăng

> **Chốt 26/09: bỏ duyệt TRƯỚC, chuyển sang hậu kiểm.** Bài lên thẳng. Admin vẫn gỡ được bất
> cứ lúc nào qua `PATCH /admin/posts/:postId/moderation`, nhưng **không** chạm được vào bài
> đang có giao dịch sống (`RESERVED`/`DELIVERING`) hay đã đóng — gỡ ngang một lượt trao đang
> diễn ra để lại hai người đã hẹn nhau mà bài thì biến mất.

```mermaid
stateDiagram-v2
    [*] --> PUBLISHED: MỌI bài lên thẳng<br/>KHÔNG chờ duyệt (chốt 26/09)

    PUBLISHED --> RESERVED: Đã chọn người nhận
    RESERVED --> DELIVERING: Bắt đầu bàn giao
    DELIVERING --> COMPLETED: Người nhận xác nhận
    RESERVED --> PUBLISHED: Huỷ lượt trao → trả về kho

    PUBLISHED --> REJECTED: Admin HẬU KIỂM gỡ<br/>(quyền post.moderate)
    REJECTED --> PUBLISHED: Admin trả lại<br/>giữ nguyên hạn cũ

    PUBLISHED --> EXPIRED: Quá 3 tháng<br/>(CLI post:expire)
    EXPIRED --> PUBLISHED: Gia hạn 1 lần<br/>POST /posts/:postId/renew
    PUBLISHED --> CANCELLED: Người đăng gỡ
    COMPLETED --> ARCHIVED
    CANCELLED --> ARCHIVED

    note right of PUBLISHED
        Bài hiện trong /nearby NGAY khi đăng,
        và đồng hồ ba tháng bắt đầu từ đó.
        author/type/status vẫn do SERVER quyết,
        không nhận từ client.
    end note

    note right of REJECTED
        Tác giả SỬA bài đã bị gỡ thì bài
        VẪN là REJECTED. Cho nó tự hiện lại
        là để tác giả gỡ quyết định của Admin
        bằng cách sửa một dấu phẩy.
    end note

    note right of EXPIRED
        CLASSIFIED hết hạn KHÔNG thành EXPIRED
        mà tự chuyển sang OFFER (Muốn tặng).
        CHỐT-05.
    end note
```

## 4.4 Hết hạn và gia hạn

```mermaid
sequenceDiagram
    autonumber
    participant CRON as Lịch ngoài
    participant CLI as npm run post:expire
    participant DB as Postgres

    CRON->>CLI: Chạy mỗi ngày
    CLI->>DB: Quét bài PUBLISHED quá hạn
    loop Mỗi bài
        alt postType = CLASSIFIED
            CLI->>DB: Chuyển thành OFFER, đặt lại hạn
            Note over DB: CHỐT-05 — rao vặt hết hạn<br/>thành bài tặng, không biến mất
        else Loại khác
            CLI->>DB: status = EXPIRED
        end
    end
    CLI-->>CRON: "Đã đóng N bài, chuyển M tin rao vặt"
```

```mermaid
flowchart TD
    A["POST /posts/:postId/renew"] --> A1{Là tin rao vặt?}
    A1 -->|Có| A2["❌ CLASSIFIED không gia hạn<br/>nó tự thành OFFER khi hết hạn"]
    A1 -->|Không| B{Đã gia hạn lần nào chưa?}
    B -->|Rồi| C[❌ Chỉ được 1 lần — CHỐT-07]
    B -->|Chưa| D{Đã có người nhận?}
    D -->|Có| E[❌ Không gia hạn bài đã chốt người]
    D -->|Chưa| F{Còn quota rank?}
    F -->|Hết| G[❌ Tính quota như bài mới]
    F -->|Còn| H[✅ +3 tháng, đánh dấu đã gia hạn]

    style A2 fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style C fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style E fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style G fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
```

## 4.5 Sửa và gỡ bài — ✅ siết 26/09, siết tiếp 28/09

Từ 28/09 hai đường **tách luật**: sửa nhìn giao dịch thật, gỡ vẫn nhìn trạng thái bài.

```mermaid
flowchart TD
    A["PATCH /posts/:postId<br/>POST /media · DELETE /media/:id<br/>PATCH /media/order"] --> B{Chủ bài?}
    B -->|Không| C[❌ 403]
    B -->|Có| L["🔒 Khoá hàng post<br/>pessimistic_write"]
    L --> M{"Có gift_transactions nào<br/>ACCEPTED hoặc DELIVERING?"}
    M -->|Có| E["❌ 409 POST_HAS_LIVE_TRANSACTION<br/>kể cả khi bài vẫn PUBLISHED"]
    M -->|Không| N{"Trạng thái DRAFT/PENDING_REVIEW<br/>/PUBLISHED và còn hạn?"}
    N -->|Không| O["❌ POST_INVALID_STATE"]
    N -->|Có| G["✅ Ghi nội dung mới<br/>yêu cầu REQUESTED giữ nguyên<br/>kèm mốc xếp hàng"]

    D0["DELETE /posts/:postId"] --> B2{Chủ bài?}
    B2 -->|Không| C
    B2 -->|Có| D{"Trạng thái là RESERVED<br/>hoặc DELIVERING?"}
    D -->|Có| E
    D -->|Không| H[Xoá mềm + CANCELLED]
    H --> I["Đóng mọi yêu cầu còn REQUESTED"]
    I --> J["Báo cho từng người xin<br/>GIFT_TRANSACTION_CLOSED"]

    style C fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style E fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style O fill:#f8d7da,stroke:#a52834,stroke-width:1.5px,color:#4a0d13
    style L fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
    style J fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao sửa phải nhìn GIAO DỊCH chứ không nhìn trạng thái bài.** Bài `totalQuantity: 5` đã
> duyệt một người vẫn còn 4 suất, nên trạng thái vẫn là `PUBLISHED` — luật 26/09 nhìn trạng
> thái nên cho sửa thoải mái. Người đã được duyệt vẫn bị đổi món dưới chân, đúng lỗ hổng mà
> lần siết trước tưởng đã bịt. Yêu cầu còn ở `REQUESTED` thì KHÔNG chặn: mới bấm xin là chưa
> được hứa gì, chặn ở đó là khoá bài chỉ vì có người ngó tới.
>
> **Vì sao phải khoá hàng trước khi hỏi.** Đọc rồi mới ghi mà không khoá thì duyệt-và-sửa chạy
> song song vẫn lọt qua khe. `lockEditablePost` dùng đúng `pessimistic_write` mà cấp phát kho
> đang dùng, nên hai đường không thể vượt nhau.
>
> **Vì sao `canEdit` không thay được lần kiểm ở server.** `GET /posts/{postId}` trả `canEdit`
> cho client ẩn nút Sửa, nhưng giữa lúc mở màn hình và lúc bấm Lưu có thể đã có người được
> duyệt. Cờ đó là gợi ý giao diện, không phải quyết định.
>
> **`POST /posts/:postId/media/upload` không nằm trong sơ đồ trên.** Nó chỉ cấp một presigned
> URL nên chỉ kiểm trạng thái bài (`assertEditablePost`), không khoá hàng và không hỏi giao
> dịch. Cổng thật là bước gắn ảnh — xin được URL mà không gắn được thì cùng lắm sinh ra một
> object mồ côi, và `media:sweep-orphans` đã lo phần đó.

> **Vì sao chặn cả sửa lẫn gỡ ở đúng hai trạng thái đó.** Trước 26/09 hai đường này chỉ kiểm
> chủ sở hữu. Người tặng đã chốt người nhận vẫn **gỡ được bài**, để bên kia lại với một giao
> dịch trỏ vào bài không còn tồn tại; và vẫn **sửa được nội dung**, nên người nhận đồng ý "tủ
> lạnh còn tốt" rồi mở lại thấy "quạt cũ" — với tin rao vặt thì sửa được cả giá. Không bản ghi
> nào nói nội dung từng khác.
>
> Hai trạng thái này trùng đúng danh sách mà **xoá tài khoản** và **hậu kiểm của Admin** đã
> chặn từ trước. Chỉ đường của chính tác giả là không canh gì — mà đó lại là nút dễ bấm nhất.
>
> Từ 28/09 `DELETE` vẫn giữ luật theo trạng thái; chỉ `PATCH` và các route media chuyển sang
> nhìn giao dịch thật.

> **Vì sao gỡ bài phải đóng các yêu cầu còn treo.** Không đóng thì người xin không bao giờ
> nhận được câu trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần "yêu cầu đang mở" của
> họ — tức gỡ một bài là khoá bớt chỗ của người khác. Đẩy thông báo hỏng KHÔNG làm hỏng việc
> gỡ bài: bài đã gỡ xong rồi, ném ở đây chỉ khiến client bấm lại và nhận 404.

## 4.6 Chuyển bài sang từ thiện

```mermaid
sequenceDiagram
    actor U as Chủ bài
    participant API as Core API
    actor A as Admin

    U->>API: POST /posts/:postId/charity-transfer
    API->>API: Ghi REQUESTED
    A->>API: PATCH /posts/:postId/charity-transfer
    alt Duyệt
        API->>API: APPROVED — bài gắn đơn vị từ thiện
    else Từ chối
        API->>API: REJECTED — bài giữ nguyên
    end
```

## Chỗ cần soát

1. ⚠️ **`CHARITY` và `MERIT` không có cổng nào.** Ai qua onboarding cũng đăng được, và cả hai
   ăn quota `POST_OFFER`. Sơ đồ cũ hứa một cổng không tồn tại. F65 nói Admin quản lý đơn vị
   Công đức — chưa có gì.
2. **Quota đếm "bài đang mở"** — bài `EXPIRED` và `COMPLETED` không tính. Đúng ý chưa?
3. **Gia hạn tính quota như bài mới**, nên người đang đầy quota không gia hạn được bài cũ dù
   không tạo thêm bài nào. Có thể gây khó chịu — cần xác nhận.
4. **SOS (`WANTED` gấp)** mở theo capability `POST_SOS`, mặc định Bạc trở lên. Con số này
   vẫn đang là giả định chờ Bên A xác nhận.
