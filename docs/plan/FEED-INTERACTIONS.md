# Tương tác trên bảng tin: cảm xúc, bình luận, chia sẻ

> Thiết kế + kế hoạch + API đầy đủ. Mọi khẳng định về hiện trạng đều dẫn tới chỗ
> trong code hoặc trong SRS.

---

## 1. Hiện trạng

**Chưa có gì.** Không có bảng, không có endpoint, không có model nào cho cảm xúc,
bình luận hay chia sẻ. Bảng tin hiện chỉ có `/posts/nearby` và `/posts/map`.

Nhưng **ba thứ dùng lại được nguyên vẹn**, và chúng quyết định phần lớn thiết kế:

| Có sẵn | Dùng cho |
| --- | --- |
| Entitlement policy theo rank ([`capability_policies`](../../suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations/1790100000000-CreateEntitlementPolicies.ts)) | Admin quyết hạng nào được bình luận, hạng nào chỉ đọc |
| Point rule có `is_enabled` + `daily_cap` + `affects_lifetime` | [F41](../FEATURES.md#f41--điểm-cho-like--comment--report), điểm cho tương tác |
| Con trỏ phân trang của chat (`models/chat-cursor.ts`) | Bình luận cũng là danh sách thêm-vào-đầu |
| Bảng `notifications` + `IDispatchNotificationUseCase` | Báo có người bình luận |
| `IObjectStorage` presigned PUT | Ảnh trong bình luận, nếu sau này cần |

---

## 2. Bốn quyết định định hình thiết kế

### QĐ-1 — Bình luận **đa hình** ngay từ đầu, không gắn cứng vào bài đăng

SRS mục 3.3.12 ghi Dharma Hub "**tái sử dụng CMS/Post-Comment/Moderation/
Notification/Media hiện có**". Nghĩa là bộ bình luận này sẽ phải phục vụ ít nhất
hai loại chủ thể: bài đăng và bài diễn đàn Phật Pháp.

Gắn cứng `post_id` bây giờ thì sáu tháng nữa phải migrate cả bảng bình luận, cả
index, cả đường kiểm duyệt, cả thông báo. Nên dùng cặp `subject_type` +
`subject_id`.

> ⚠️ **Cái giá phải trả, nói thẳng:** khoá ngoại đa hình thì Postgres không giữ
> được toàn vẹn tham chiếu — không có `FOREIGN KEY` nào chặn một bình luận trỏ
> vào chủ thể không tồn tại. Bù lại bằng hai thứ: bài đăng dùng **xoá mềm**
> (`deleted_at`) nên dòng không biến mất, và một phép kiểm trong script DB thật
> khẳng định không có bình luận mồ côi.
>
> Phương án thay thế — mỗi loại chủ thể một bảng riêng — giữ được khoá ngoại
> nhưng nhân đôi toàn bộ truy vấn, index, kiểm duyệt và thông báo. Hai bản sao
> sẽ lệch nhau, đó là chuyện khi nào chứ không phải có hay không.

### QĐ-2 — Số đếm là **cột**, cập nhật trong cùng transaction

Nguyên tắc của dự án là "hai con số nói về cùng một sự thật thì sớm muộn lệch
nhau", và nó đã đúng nhiều lần. Nhưng ở đây nguyên tắc đó va vào thực tế: bảng
tin trả 20 bài mỗi lần cuộn, mỗi bài cần số cảm xúc và số bình luận. `COUNT(*)`
cho từng bài là 40 lần quét mỗi lần cuộn — cách chắc chắn nhất để giết bảng tin.

Chốt: cột đếm trên `posts`, **cập nhật trong CÙNG transaction** với lần ghi
cảm xúc/bình luận. Cùng transaction là điều làm nó khác hẳn một bộ đếm rời: tiến
trình chết giữa chừng thì cả hai cùng rollback, không có trạng thái lệch.

Kèm một CLI đối soát (`feed:reconcile-counts`) theo đúng khuôn `point:reconcile`
đã có — để nếu có đường nào đó làm lệch, ta phát hiện và sửa được thay vì tranh
cãi xem con số nào đúng.

> SRS gợi ý "Redis Counter". **Không dùng Redis làm nguồn sự thật** cho con số
> người dùng nhìn thấy: đó là một hệ thống thứ hai có thể bất đồng với database,
> và khi nó bất đồng thì không ai biết bên nào đúng. Redis làm cache đọc thì
> được, nhưng đó là việc tối ưu về sau, không phải thiết kế nền.

### QĐ-3 — "Chia sẻ" là **chia sẻ link ra ngoài**, không phải đăng lại lên tường mình

Facebook share = tạo một bản sao trên tường người chia sẻ. **Điều đó sai với ứng
dụng này.** Một bài Muốn Tặng là lời hứa của tác giả sẽ trao món đồ đó; một bản
sao trên tường người khác là lời hứa mà họ không thực hiện được. Người xem bấm
"xin nhận" trên bản sao sẽ xin ai?

SRS cũng đi hướng này: mục 3.2 ghi "**share/deep link**", tức chia sẻ một đường
dẫn.

Chốt: `POST /posts/:postId/shares` **ghi nhận** một lượt chia sẻ và trả về
đường dẫn chuẩn. Việc mở khay chia sẻ của hệ điều hành là của client. Con số
lượt chia sẻ có giá trị cho tác giả và cho Admin, nhưng không có nội dung nào
được nhân bản.

### QĐ-4 — Điểm cho tương tác: seed nhưng **TẮT sẵn**

[F41](../FEATURES.md#f41--điểm-cho-like--comment--report) chốt "chỉ phát sinh
điểm **khi Admin bật rule**". Thiết kế này tuân thủ, và đi xa hơn một bước:

| Rule | Khởi tạo | `is_enabled` | `affects_lifetime` |
| --- | --- | --- | --- |
| `POST_COMMENTED` | 2 | **false** | **false** |
| `POST_REACTED` | 1 | **false** | **false** |

**`affects_lifetime = false` là bắt buộc, không phải tuỳ chọn.** `lifetime` là
sàn của Rank. Cho bình luận đẩy hạng thì gõ 300 dòng "hay quá ạ" là lên Bạc —
trong khi tặng một món đồ thật được 56 điểm. Điều đó biến hệ thống hạng thành
thứ đo độ ồn chứ không đo lòng tốt.

Trần theo ngày làm chậm việc cày chứ không chặn được. Chống gian lận thật vẫn
thuộc F50/M5.

---

## 3. Mô hình dữ liệu

```
content_reactions                      content_comments
  subject_type  POST | DHARMA_THREAD     subject_type, subject_id
  subject_id                             parent_id        ← NULL = cấp 1
  user_id                                author_id
  kind  LIKE|LOVE|CARE|WOW|SAD           body             varchar(1000)
  UNIQUE(subject, user_id)               status  VISIBLE|HIDDEN|REMOVED
  ── một người MỘT cảm xúc               reply_count, reaction_count
                                         CHECK: parent_id IS NULL
                                                OR cấp cha là cấp 1

content_shares                         content_reports
  subject_type, subject_id               subject_type, subject_id
  user_id, channel                       reporter_id, reason
  ── chỉ ghi thêm                        status  PENDING|UPHELD|DISMISSED
                                         UNIQUE(subject, reporter_id)

posts  (+3 cột đếm)
  reaction_count, comment_count, share_count
```

**Bình luận hai cấp, không lồng vô hạn.** Ràng buộc ở database: cha của một trả
lời phải là bình luận cấp 1. Lồng vô hạn làm phân trang và giao diện không giải
được, và Facebook cũng chỉ hai cấp.

**Gỡ bình luận là đổi trạng thái, không xoá dòng.** Xoá thật thì chuỗi trả lời
bên dưới mất ngữ cảnh, và không còn gì để đối chiếu khi có khiếu nại. Trạng thái
`REMOVED` hiện thành "bình luận đã bị gỡ" và giữ nguyên cây.

**Một người báo xấu một chủ thể đúng một lần** (`UNIQUE`), nếu không thì một
nhóm người có thể bơm số lượt báo để ép Admin xử.

---

## 4. API đầy đủ

### Cảm xúc

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `PUT` | `/posts/:postId/reactions/me` | Bearer + `REACT_CONTENT` | Đặt hoặc **đổi** cảm xúc. Idempotent |
| `DELETE` | `/posts/:postId/reactions/me` | Bearer | Gỡ cảm xúc của mình |
| `GET` | `/posts/:postId/reactions` | Công khai | Ai đã bày tỏ, lọc theo loại, phân trang |
| `PUT` | `/comments/:commentId/reactions/me` | Bearer + `REACT_CONTENT` | Cảm xúc cho bình luận |
| `DELETE` | `/comments/:commentId/reactions/me` | Bearer | Gỡ |

Dùng `PUT` chứ không `POST`: đặt cảm xúc là thao tác **bình thái** — bấm hai lần
cho cùng một kết quả. `POST` gợi ý mỗi lần gọi tạo thêm một thứ, và client retry
sẽ phải đoán xem mình vừa tạo mấy cái.

### Bình luận

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts/:postId/comments` | Bearer + `COMMENT_CONTENT` | Bình luận, hoặc trả lời khi có `parentId` |
| `GET` | `/posts/:postId/comments` | Công khai | Cấp 1, **phân trang bằng con trỏ** |
| `GET` | `/comments/:commentId/replies` | Công khai | Cấp 2 của một bình luận, con trỏ |
| `PATCH` | `/comments/:commentId` | Bearer, tác giả | Sửa trong 15 phút đầu |
| `DELETE` | `/comments/:commentId` | Bearer, tác giả **hoặc** chủ bài | Gỡ |

**Chủ bài gỡ được bình luận trên bài mình** — bài đăng là không gian của họ, và
bắt họ đợi Admin để xoá một câu xúc phạm là bỏ mặc họ.

Sửa có **cửa sổ 15 phút**: sửa được mãi thì một bình luận hiền lành đã có 20
lượt đồng tình có thể bị đổi thành thứ khác hẳn.

### Chia sẻ

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/posts/:postId/shares` | Bearer | Ghi nhận lượt chia sẻ, trả về link chuẩn |

Không có nội dung nào bị nhân bản — xem [QĐ-3](#qđ-3--chia-sẻ-là-chia-sẻ-link-ra-ngoài-không-phải-đăng-lại-lên-tường-mình).

### Báo xấu và kiểm duyệt

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/comments/:commentId/reports` | Bearer | Báo xấu, mỗi người một lần |
| `GET` | `/admin/content-reports` | Admin | Hàng đợi, lọc theo trạng thái |
| `PATCH` | `/admin/content-reports/:reportId` | Admin | Chấp nhận hoặc bác, **kèm lý do bắt buộc** |
| `PATCH` | `/admin/comments/:commentId/moderation` | Admin | Ẩn hoặc khôi phục |

### Đọc kèm — không thêm endpoint, thêm trường

`/posts/:postId`, `/posts/nearby`, `/posts/me` trả thêm:

```jsonc
{
  "reactionCount": 12,
  "commentCount": 3,
  "shareCount": 1,
  "reactionBreakdown": { "LIKE": 8, "LOVE": 4 },
  "myReaction": "LOVE"   // null khi chưa bày tỏ, hoặc chưa đăng nhập
}
```

`myReaction` lấy bằng **một** truy vấn cho cả trang
(`WHERE subject_id = ANY($1) AND user_id = $2`), không phải một truy vấn mỗi
bài — N+1 ở đây là 20 lần đi database cho mỗi lần cuộn.

---

## 5. Kế hoạch theo lát

Mỗi lát chạy được và kiểm được độc lập.

| # | Lát | Nội dung | Kiểm chứng |
| --- | --- | --- | --- |
| 1 | **Nền** | Migration 4 bảng + 3 cột đếm; model thuần cho loại cảm xúc và quy tắc hai cấp; capability `REACT_CONTENT`/`COMMENT_CONTENT` | Unit test model; script DB thật cho ràng buộc |
| 2 | **Cảm xúc** | `PUT`/`DELETE`/`GET`, đếm trong cùng transaction | Đổi cảm xúc không tăng số đếm; gỡ thì giảm; hai request song song không làm lệch |
| 3 | **Bình luận** | `POST`/`GET`/`PATCH`/`DELETE`, con trỏ, hai cấp | Không lồng quá hai cấp; gỡ giữ cây; cửa sổ sửa |
| 4 | **Đọc kèm** | Nhúng số đếm + `myReaction` vào 3 endpoint bài đăng | Một truy vấn cho cả trang, không N+1 |
| 5 | **Chia sẻ** | `POST /shares` + link chuẩn | Đếm đúng, không nhân bản nội dung |
| 6 | **Thông báo** | Báo khi có bình luận và trả lời | Không dội bom tác giả bài nổi |
| 7 | **Kiểm duyệt** | Báo xấu + hàng đợi Admin + ẩn/khôi phục | Mỗi người báo một lần; ẩn thì biến khỏi API công khai |
| 8 | **Điểm (F41)** | Seed 2 rule **TẮT sẵn**, `affects_lifetime = false` | Bật rule thì cộng điểm; hạng không nhúc nhích |
| 9 | **Đối soát** | CLI `feed:reconcile-counts` | Cố tình làm lệch rồi chạy, số về đúng |

**Lát 1–4 là phần tối thiểu dùng được.** 5–9 bổ sung dần mà không phá gì.

### Thông báo: gộp, không dội bom

Một bài có 200 lượt cảm xúc mà báo 200 lần thì tác giả tắt thông báo, và từ đó
họ mất luôn thông báo về lượt xin nhận — thứ thật sự quan trọng.

- **Bình luận và trả lời:** báo từng cái, đây là thứ người ta muốn biết.
- **Cảm xúc:** chỉ báo **lần đầu tiên trong ngày** cho mỗi bài. Khoá chống trùng
  `REACTION_FIRST:<postId>:<ngày>`.

---

## 6. Cần Bên A chốt

### C-1 — Bộ cảm xúc gồm những gì?

Đề xuất **5**: `LIKE` 👍, `LOVE` ❤️, `CARE` 🤗, `WOW` 😮, `SAD` 😢.

Cố ý **không có** `ANGRY` 😡. Đây là nền tảng cho–nhận đồ; một nút phẫn nộ trên
bài của người đang cần giúp là thứ không phục vụ ai. Thêm sau thì dễ, gỡ đi khi
người dùng đã quen thì khó.

### C-2 — VIEWER được bình luận không?

Capability đã có sẵn cơ chế, chỉ cần chốt giá trị mặc định. Đề xuất: **VIEWER chỉ
đọc**, MEMBER trở lên mới bình luận và bày tỏ cảm xúc — cùng logic với việc VIEWER
chưa đăng bài được.

### C-3 — Bình luận có cần duyệt trước không?

Đề xuất **không** — duyệt trước thì cuộc trò chuyện chết, và không đủ người trực.
Thay vào đó là báo xấu + Admin xử sau (lát 7).

Nhưng cần biết trước: **đây là chi phí vận hành thật.** Bình luận mở trên một nền
tảng từ thiện sẽ có nội dung cần gỡ, và hiện **chưa có công cụ kiểm duyệt nào**
ngoài `POST_OPERATOR_USERNAMES` cho bài đăng. Lát 7 dựng phần tối thiểu; một hàng
đợi kiểm duyệt đầy đủ vẫn thuộc [F60](../FEATURES.md#f60--kiểm-duyệt--quản-lý-người-dùng).

### C-4 — Bình luận có ảnh không?

Đề xuất **Phase 1 chỉ chữ**, giống chat (F37 cũng chốt chỉ text ở phase 1). Ảnh
kéo theo kiểm duyệt ảnh, dung lượng lưu trữ, và presigned upload cho mỗi bình
luận. Hạ tầng đã có nên thêm sau rẻ.
