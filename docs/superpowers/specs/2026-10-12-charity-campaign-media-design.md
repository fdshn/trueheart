# Media chiến dịch từ thiện (tối đa 5 ảnh/video, ảnh bìa là một trong số đó)

Ngày: 12/10/2026 · Trạng thái: chờ duyệt spec · Liên quan: F65 / F65b, BR-CHARITY-01

## Bối cảnh

Hoạt động từ thiện (`campaigns`) hiện chỉ có `banner_url text NOT NULL`. Client tự gửi
`bannerUrl` là một URL `https://` bất kỳ. Server không xác minh URL đó có nằm trên R2 của
mình, đúng MIME hay đúng dung lượng không. Ngoài ra không có API upload, không có chỗ
lưu nhiều ảnh hoặc video, và không có API sửa nội dung sau khi gửi hồ sơ.

API media của bài đăng (`/posts/:postId/media/*`) không dùng lại được, vì ba lý do:
chiến dịch là một bảng khác, quyền sửa khác, và hạn mức khác (bài đăng đang để 10).

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | **Upload trước, tạo sau** (mẫu của comment và chat media): client xin URL, PUT lên R2, rồi gửi danh sách key trong body tạo chiến dịch. Chiến dịch và media được ghi trong **một** transaction, nên hồ sơ vào hàng chờ duyệt luôn có đủ ảnh. |
| D2 | **1–5 media**, ảnh hoặc video, có **ít nhất 1 ảnh**. |
| D3 | **Ảnh bìa là một trong các media đã upload** và phải là ảnh. Server tự suy ra `banner_url`; client không gửi URL tự do nữa. |
| D4 | Chỉ **người tạo** được sửa media, và chỉ khi hồ sơ đang **`PENDING_APPROVAL`**. Đã `APPROVED` hoặc `REJECTED` thì khoá. Chiến dịch Admin tạo vào thẳng `APPROVED`, nên khoá ngay từ đầu. |
| D5 | Sửa bằng cách **thay cả bộ** (`PUT .../media`), không làm các endpoint gắn, gỡ, sắp thứ tự riêng lẻ. Mọi luật nằm ở một hàm kiểm tra, dùng chung cho bước tạo và bước sửa. |
| D6 | **Breaking change:** bỏ `bannerUrl` khỏi body tạo, thay bằng `media` + `coverKey`. Chấp nhận được vì F65b mới xong backend, chưa có client production dùng. |

## Dữ liệu

### Bảng mới `campaign_media`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `BIGSERIAL` PK | |
| `campaign_id` | `uuid NOT NULL` | FK → `campaigns(global_id)` `ON DELETE CASCADE` |
| `storage_key` | `varchar(500) NOT NULL` | `UNIQUE`: một object không thể thuộc hai chiến dịch |
| `public_url` | `text NOT NULL` | URL CDN lúc xác nhận. Cách lưu giống `banner_url`, để repository trả URL mà không phải biết `publicBaseUrl`. `CHECK ~ '^https?://'` |
| `media_type` | `varchar(10) NOT NULL` | `CHECK IN ('IMAGE','VIDEO')`, suy từ `contentType` lúc HeadObject |
| `sort_order` | `int NOT NULL` | `CHECK 0..4`; `UNIQUE (campaign_id, sort_order)` |
| `is_cover` | `boolean NOT NULL DEFAULT false` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Ràng buộc trong DB, để lớp cuối cùng vẫn đúng kể cả khi code sai:
- Partial unique index `ON campaign_media (campaign_id) WHERE is_cover`: tối đa 1 bìa cho mỗi chiến dịch.
- `CHECK (NOT is_cover OR media_type = 'IMAGE')`: bìa phải là ảnh.
- Index `(campaign_id, sort_order)` có sẵn nhờ ràng buộc UNIQUE, dùng để đọc theo thứ tự.

Luật "đúng 1 bìa" và "1–5 media" không ép được bằng CHECK trên từng dòng. Hai luật này do
hàm kiểm tra ở tầng domain giữ (xem bên dưới), và có test chạy trên Postgres thật.

### `campaigns.banner_url`

Giữ nguyên cột. Mỗi lần tạo hoặc thay media, server ghi vào đó `publicUrl` của ảnh bìa. Nhờ
vậy mọi API đọc hiện có vẫn trả `bannerUrl` như cũ.

**Nới `CHK_campaigns_banner_url` từ `LIKE 'https://%'` sang `~ '^https?://'`.** Môi trường dev
có `STORAGE_PUBLIC_BASE_URL=http://localhost:19000/...`, nên nếu giữ CHECK cũ thì mọi lượt tạo
chiến dịch ở dev đều hỏng. Lý do ban đầu của CHECK là chặn client gửi URL `http` gây lỗi
mixed-content. Lý do đó hết hiệu lực vì giờ URL do server dựng từ cấu hình, và production
cấu hình `https`.

Chiến dịch cũ (`banner_url` ngoài, không có dòng media nào) giữ nguyên, **không backfill**.
Response trả `media: []` cho các chiến dịch này.

## Storage lib (`system/storage-lib`)

- Dùng thẳng `IStorageUploadRequest`, không cần kiểu request riêng. Key không
  chứa id chiến dịch vì lúc xin URL chiến dịch chưa tồn tại.
- `createCampaignMediaUpload(request)`: sinh key `users/<userId>/campaign-media/<uuid>.<ext>`.
- `confirmCampaignMediaUpload(userId, key)`: gọi `verifyObject` với tiền tố
  `users/<userId>/campaign-media/` (HeadObject, MIME, size), rồi trả
  `{ mediaType: 'IMAGE' | 'VIDEO', publicUrl }`.
- Thêm `campaignMedia` vào `MediaLabels`. Hạn mức giống media bài đăng: ảnh JPEG/PNG/WebP
  tối đa 5 MB, video MP4/MOV/WebM tối đa 25 MB.

## API

### `POST /charity-campaigns/media/upload` (Bearer)
Body `{ contentType, contentLength }` → `{ key, uploadUrl, publicUrl, expiresInSeconds }`.
Thành viên và Admin đều gọi được endpoint này. Bước này chưa kiểm tra quyền tạo chiến dịch:
xin URL không tạo ra gì, và quyền vẫn bị kiểm ở `POST /charity-campaigns`. Object không bao
giờ được gắn sẽ bị job dọn rác xoá.

### `POST /charity-campaigns` và `POST /admin/charity-campaigns`
Body `campaign` bỏ `bannerUrl`, thêm:
- `media: string[]`: 1–5 key, thứ tự trong mảng là `sort_order`.
- `coverKey: string`: phải là một phần tử của `media`.

Thứ tự xử lý trong use case tạo:
1. Kiểm tra quyền và nội dung như hiện nay.
2. Gọi `confirmCampaignMediaUpload` lần lượt cho từng key, giống luồng comment.
3. Gọi hàm kiểm tra bộ media.
4. Trong cùng một transaction: INSERT `campaigns` với `banner_url` = URL bìa, sau đó INSERT các dòng `campaign_media`.

### `PUT /charity-campaigns/:id/media` (Bearer)
Body `{ media: string[], coverKey: string }`. Server kiểm tra lần lượt:
- Chiến dịch có tồn tại không.
- Người gọi có phải `created_by` không. Nếu không thì trả `CHARITY_NOT_ORGANIZER`. Coordinator cũng không được sửa.
- `approval_status = 'PENDING_APPROVAL'` không. Nếu không thì trả `CHARITY_MEDIA_NOT_EDITABLE`.

Sau đó server xác minh từng key và kiểm tra bộ media như bước tạo. Trong một transaction:
`SELECT ... FOR UPDATE` dòng chiến dịch và kiểm lại trạng thái, phòng trường hợp Admin duyệt
chen vào giữa. Tiếp theo DELETE media cũ, INSERT bộ mới, rồi UPDATE `banner_url`.
Response trả chiến dịch kèm `media`. Key cũ bị thay ra không xoá ngay, mà để job dọn rác xoá
vì không còn được tham chiếu.

Key đã thuộc một chiến dịch **khác** sẽ bị chặn bởi `UNIQUE(storage_key)`. Use case phải bắt
lỗi này và trả `CHARITY_MEDIA_INVALID`, không để thành lỗi 500. Còn key đang thuộc chính chiến
dịch đang sửa thì gửi lại hợp lệ, vì dòng cũ đã bị DELETE trước khi INSERT trong cùng
transaction.

### Response
`CharityCampaignResponseDto` thêm
`media: { url, type: 'IMAGE'|'VIDEO', sortOrder, isCover }[]`, sắp theo `sortOrder`.
Áp dụng cho chi tiết public (`/campaigns/:idOrSlug`), `mine`, `joined` và danh sách admin.
Danh sách public dùng chung DTO nên cũng trả `media`. Vì tối đa 5 dòng mỗi chiến dịch, đọc
bằng một truy vấn `WHERE campaign_id = ANY($1)` cho cả trang, không gây N+1.

## Hàm kiểm tra bộ media (domain, thuần, không I/O)

Input: danh sách `{ key, mediaType }` đã xác minh, và `coverKey`. Lỗi `CHARITY_MEDIA_INVALID`
có mô tả cụ thể khi gặp một trong các trường hợp:
- Số media nằm ngoài khoảng 1–5.
- Có key trùng nhau trong danh sách.
- Không có ảnh nào.
- `coverKey` không nằm trong danh sách.
- Ảnh bìa là video.

Output: các dòng sẵn sàng INSERT (`sort_order`, `is_cover`), kèm URL bìa.

## Lỗi mới (`CoreErrors`)

Đặt tên theo nhóm `CHARITY_*` có sẵn (`0x13`):
- `CHARITY_MEDIA_INVALID` (`0x13_1d`, 400, thông điệp nêu chi tiết lỗi).
- `CHARITY_MEDIA_NOT_EDITABLE` (`0x13_1e`, 409).
- Không phải người tạo: dùng lại `CHARITY_NOT_ORGANIZER`.
- Key sai chủ, sai MIME hoặc vượt dung lượng: dùng lại lỗi storage có sẵn qua `withStorageValidation('media', ...)`.
- **Key chưa từng được upload:** HeadObject trả 404. Hiện lỗi này lọt ra thành 500 ở mọi luồng
  upload. Sửa ngay trong `verifyObject` dùng chung để nó thành `StorageValidationError`, tức
  400. Các luồng khác cũng được hưởng thay đổi này, và không luồng nào cần 500 ở đây.

## Job dọn rác

Thêm `{ label: 'campaign_media', sql: 'SELECT storage_key AS value FROM campaign_media' }` vào
`LiveKeySources` trong `sweep-orphan-media.use-case.ts`. **Bắt buộc phải có**: thiếu dòng này
thì toàn bộ ảnh chiến dịch bị xoá sau 24 giờ.

`campaigns.banner_url` không cần thêm vào danh sách, vì nó luôn trỏ tới một key đã có trong
`campaign_media`. Chiến dịch cũ dùng URL ngoài R2 thì job vốn không quét tới.

## Kiểm thử

- **Unit, hàm kiểm tra bộ media:** mỗi nhánh lỗi một case, cộng case hợp lệ 1 ảnh và case hợp lệ 5 media có video.
- **Unit, use case tạo:** xác minh key được gọi cho từng phần tử; lỗi storage được truyền đúng ra ngoài; `banner_url` lấy đúng URL bìa; đường Admin vẫn vào `APPROVED`.
- **Unit, use case thay media:** sai người, sai trạng thái, chiến dịch không tồn tại, key thuộc chiến dịch khác.
- **Unit, storage lib:** đúng tiền tố key; `confirm` từ chối key của người khác hoặc sai namespace.
- **Unit, job dọn rác:** `LiveKeySources` có `campaign_media`.
- **Postgres thật (Docker):** chạy migration; kiểm CHECK bìa là ảnh, unique bìa, unique `storage_key`; kiểm luồng DELETE rồi INSERT trong transaction của PUT.
- Cập nhật mô tả Swagger, `docs/API.md` và README của core cho các endpoint mới và body đã đổi.

## Ngoài phạm vi

- Sửa media sau khi đã duyệt, và quyền sửa của coordinator.
- "Nhật ký chiến dịch" (ảnh hoạt động thực tế đăng trong lúc chiến dịch chạy).
- Sửa các nội dung khác của chiến dịch (tiêu đề, mô tả...).
- Đổi hạn mức 10 media của bài đăng cho khớp `BR_POST_01` (1–5). Việc này tách riêng.
- Chuyển hạn mức 5 sang `system_configs`. Hiện giữ là hằng số, giống bài đăng.
