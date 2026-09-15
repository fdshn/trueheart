# Kiến trúc kỹ thuật — Chân Tâm

Tài liệu này giải thích **vì sao** hệ thống được dựng như hiện tại. Quy tắc bắt buộc nằm ở
`INVARIANTS.md`; hướng dẫn thao tác nằm ở `AGENTS.md`.

---

## 1. Năm ràng buộc chi phối mọi lựa chọn

| # | Ràng buộc | Nguồn | Hệ quả kỹ thuật |
| --- | --- | --- | --- |
| 1 | Chạy mượt trên điện thoại Android đời cũ | Mục 1.4 đặc tả | Payload API phải nhỏ; ảnh resize phía server; phân trang mọi danh sách |
| 2 | Truy vấn theo bán kính GPS là nghiệp vụ lõi | Mục 1.1, 3.4, 5.5 | **Bắt buộc PostGIS.** Không dùng document DB làm store chính |
| 3 | Bàn giao toàn bộ mã nguồn, Bên A đăng ký bản quyền | Mục 7.2 | Không phụ thuộc backend độc quyền (Firebase, Sendbird). Mọi thứ tự chủ, tự host được |
| 4 | Thu thập dữ liệu định danh người Việt (CCCD, SĐT, vị trí) | Mục 2.1 | Nghị định 53/2022 → máy chủ đặt tại Việt Nam. Không lưu ảnh CCCD |
| 5 | Nhóm nhỏ, ngân sách hữu hạn | Bối cảnh dự án | Monolith có module rõ ràng, KHÔNG microservices. Một database |

---

## 2. Vì sao là monolith có cấu trúc, không phải microservices

Nhóm 3–4 người trong 6 tháng không vận hành nổi nhiều service. Nhưng monolith không có kỷ
luật sẽ thành khối bùi nhùi sau một năm. Giải pháp: **một tiến trình triển khai, nhiều ranh
giới module được cưỡng chế bằng Clean Architecture**.

Lợi ích thực tế: khi một module cần tách ra thành service riêng (ứng viên rõ nhất là `chat`
và `push-fanout`), việc tách chỉ là chuyển thư mục `application/` + `infrastructure/` sang
package mới — vì use case vốn đã không biết gì về HTTP hay TypeORM.

---

## 3. Vì sao tách package `-lib`

`core-lib` chứa interface DTO, interface entity, model, enum và mã lỗi — **không chứa
implementation**. Ba lý do:

1. **Chia sẻ kiểu dữ liệu với frontend.** Next.js web và Admin CMS import trực tiếp
   `@chantam.vn/chantam.core-lib/dto`, không cần sinh client hay đồng bộ thủ công.
2. **Ranh giới thật.** Service không thể vô tình import chi tiết implementation của module
   khác nếu contract nằm ở package riêng.
3. **Chuẩn bị tách service.** Khi `chat` tách ra, nó vẫn dùng chung `core-lib`.

---

## 4. PostGIS — trung tâm của nghiệp vụ

Toàn bộ trải nghiệm "ưu tiên cự ly gần" dựa trên hai hàm:

```sql
-- Lọc trong bán kính (dùng index GiST — nhanh)
ST_DWithin(location, ST_MakePoint(:lng, :lat)::geography, :radiusMeters)

-- Tính khoảng cách để sắp xếp
ST_Distance(location, ST_MakePoint(:lng, :lat)::geography)
```

Cột lưu kiểu `geography(Point, 4326)` — đơn vị mét, tính đúng trên mặt cầu, không phải đổi
đơn vị thủ công. Khai báo qua `@GeoColumn()` của `persistency-lib` để mọi entity đồng nhất
và luôn kèm index GiST.

Chế độ xem bản đồ (mục 5.5 đặc tả) dùng `applyBoundingBox()` thay vì bán kính — khớp đúng
khung nhìn màn hình khi người dùng kéo hoặc phóng to bản đồ.

### Làm nhiễu toạ độ (geo-jitter)

Mục 1.3 đặc tả yêu cầu **chỉ người được duyệt nhận mới biết địa chỉ chính xác**. Nhưng bản
đồ lại phải hiển thị pin. Hai điều này chỉ dung hoà được bằng cách trả toạ độ đã làm nhiễu
cho người xem chưa được duyệt.

`applyGeoJitter()` dịch chuyển toạ độ một khoảng trong bán kính cấu hình được (mặc định
300m), nhưng **ổn định theo `globalId`** — cùng một bài đăng luôn nhiễu về đúng một vị trí.
Nếu nhiễu ngẫu nhiên mỗi lần gọi, kẻ tấn công chỉ cần gọi API nhiều lần rồi lấy tâm của cụm
điểm là suy ra được vị trí thật.

---

## 5. Xử lý dữ liệu cá nhân

| Dữ liệu | Cách xử lý |
| --- | --- |
| Ảnh CCCD | **Không lưu.** Ảnh đi thẳng từ app lên SDK của nhà cung cấp eKYC; backend chỉ nhận `{verification_id, status}` |
| Số CCCD | Chỉ lưu `HMAC-SHA256(số CCCD + pepper)` để chặn tái đăng ký sau khi bị khoá vĩnh viễn (mục 4.2 đặc tả) |
| Số điện thoại | Lưu đầy đủ (cần để liên lạc sau khi duyệt), nhưng che khi trả ra API công khai và không bao giờ ghi log |
| Toạ độ | Lưu chính xác; chỉ trả chính xác cho bên đã được duyệt. Xem geo-jitter ở trên |

Bộ redact của `logger-lib` là lớp phòng vệ cuối cùng, không phải giấy phép để log bừa.

---

## 6. Mã lỗi

Định dạng `0x<ResourceId><ReasonId>`, mỗi package sở hữu mã tự đếm lại từ `0x01`. Trùng số
giữa các package là **cố ý** — chúng được phân biệt ở tầng giao thức bằng trường
`errorOrigin` trong `ResponseDto`. Cặp `(errorOrigin, errorCode)` là duy nhất toàn hệ thống.

Nhờ vậy client bắt lỗi ổn định mà không cần một bảng mã lỗi tập trung phải sửa mỗi lần thêm
resource mới.

---

## 7. Lộ trình package

| Giai đoạn | Package | Ghi chú |
| --- | --- | --- |
| Hiện tại | `kernel/*`, `core-lib`, `core` | Nền tảng + resource mẫu `gift-post` |
| Kế tiếp | `system/auth-lib`, `system/otp-lib` | JWT + OTP qua Zalo ZNS |
| Kế tiếp | resource `user`, `request`, `transaction` | Luồng xin → duyệt → mở khoá liên hệ |
| Sau đó | `system/storage-lib`, `system/notification-lib` | Cloudflare R2 + FCM |
| Sau đó | `system/ekyc-lib` | Tích hợp FPT.AI / VNPT |
| Sau đó | `chat` (tách service), `worker` (BullMQ) | Khi tải thực tế đòi hỏi |
| Sau đó | `apps/web`, `apps/admin` | Next.js, import `core-lib` để dùng chung kiểu dữ liệu |

---

## 8. Nợ kỹ thuật đã biết

1. ~~`synchronize: true` ở môi trường dev.~~ **Đã đóng.** Toàn bộ schema do migration
   TypeORM dựng, `synchronize` tắt ở mọi môi trường. Production tự chạy migration còn
   thiếu lúc khởi động; dev và CI chạy tay bằng `npm run migration:run`.
2. **`gift-post` vẫn đang mở.** `system/auth-lib` đã xong và guard mặc định khoá mọi
   endpoint, nhưng resource mẫu `gift-post` được đánh dấu `@Public()` tạm thời vì nó dựng
   trước khi có xác thực. Bỏ `@Public()` ở các endpoint ghi khi làm M2.
3. **Chưa có rate limit.** Cần trước khi mở công khai (mục 4.2 đặc tả yêu cầu chống spam).
4. ~~Dockerfile chưa được build thử.~~ **Đã đóng.** Job `docker` của CI build image, chạy
   nó, và gọi `/health` trên chính container đó mỗi lần có PR.

---

## 9. Pipeline tự động

| Workflow | Khi nào chạy | Làm gì |
| --- | --- | --- |
| `ci.yaml` | mọi PR và push nhánh chính | 3 job song song: `verify` (lint/format/build/test), `integration` (PostGIS thật + smoke test), `docker` (chống lệch Dockerfile + build + chạy thử image) |
| `release.yaml` | push nhánh chính → staging; tag `v*` → production | Build và đẩy image lên GHCR, rồi gọi `deploy.yaml` |
| `deploy.yaml` | được `release.yaml` gọi | SSH + `docker compose up -d --wait`, cổng kiểm tra sau triển khai, tự rollback khi hỏng |
| `codeql.yaml` | PR, push nhánh chính, hàng tuần | Phân tích bảo mật mã nguồn |
| `security-audit.yaml` | PR đụng dependency, hàng tuần | `npm audit --omit=dev --audit-level=high` |

Điểm đáng chú ý về thiết kế: **`scripts/smoke-test.sh` được dùng ở cả hai đầu** — CI chạy
đầy đủ (có ghi dữ liệu), cổng kiểm tra sau triển khai chạy `--read-only`. Nếu hai bên kiểm
những thứ khác nhau thì "CI xanh" không nói lên điều gì về production.

Job `integration` là nơi duy nhất chuỗi `ST_DWithin → repository → use case → controller`
được kiểm tự động — unit test mock repository nên không chạm tới PostGIS.

Hướng dẫn dựng server và khai secret: `deploy/README.md`.
