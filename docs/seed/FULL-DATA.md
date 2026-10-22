# Bộ dữ liệu thử đầy đủ (`seed:full`)

`seed:demo` chỉ có 3 user và 16 bài — đủ để nhìn bản đồ, không đủ để test API. `seed:full` chạy
`seed:demo` trước rồi phủ thêm **mọi bảng nghiệp vụ** (80/81 bảng `public`) với dữ liệu
tiếng Việt có kịch bản: mỗi persona một vai, mỗi trạng thái của mỗi vòng đời ít nhất một dòng.

```bash
cd suites/chantam.vn/chantam/core
npm run seed:full          # máy dev (ts-node)
npm run seed:full:built    # trong Core container đã build
npm run test:seed-full     # kiểm bộ seed trên database nháp (Postgres thật)
```

> **Cảnh báo.** `demo-quan-tri` có vai trò `SUPER_ADMIN`, mật khẩu công khai `Demo@12345`.
> Chỉ seed lên môi trường có lớp chặn người ngoài (basic-auth staging). **Không** chạy ở
> production.

## Tài khoản

Mật khẩu chung: `Demo@12345`.

| Username | Hạng | Vai trò Admin | Dùng để test |
| --- | --- | --- | --- |
| `demo-nguoi-tang` | GOLD | — | Người tặng chính. Đủ 5 đánh giá → điểm sao **và** độ chính xác đều công bố. Chuỗi điểm danh 9 ngày, chu kỳ duy trì hạng. |
| `demo-nguoi-nhan` | MEMBER | — | Người nhận chính. 3 giao dịch (đang chờ lấy / hoàn tất / hoàn tất), 3 phòng chat, tụng kinh, hồi hướng. Tắt nhóm thông báo `EVENT`. |
| `demo-kiem-duyet` | DIAMOND | MODERATOR | Duyệt bài, xử lý cờ chat, báo xấu. |
| `demo-quan-tri` | DIAMOND | SUPER_ADMIN | Toàn bộ `/admin/*`. |
| `demo-kiem-toan` | MEMBER | AUDITOR | RBAC chỉ đọc: đọc được, ghi phải 403. |
| `demo-to-chuc` | DIAMOND | — | Người tổ chức từ thiện F65b (duyệt đề nghị, giao nhận, đóng góp ngoài). |
| `demo-dieu-phoi` | MEMBER | — | Coordinator đang có quyền ở hoạt động 1; tác giả bài SOS. |
| `demo-truong-nhom` | SILVER | — | Chủ nhóm "Thiện nguyện Hà Đông"; bài nhiều số lượng có hàng chờ. |
| `demo-nguoi-tang-2` | SILVER | — | Người tặng thứ hai; coordinator **đã bị thu hồi**; người đứng kêu gọi chờ đồng ý. |
| `demo-thanh-vien-moi` | VIEWER | — | Chưa xác minh SĐT, onboarding dở, lượt giới thiệu còn treo. |
| `demo-bi-tam-khoa` | MEMBER | — | `SUSPENDED` 7 ngày — đăng nhập/ghi phải bị chặn. |

## Kịch bản theo nhóm

Mọi id cố định dạng `5eedTT00-0000-4000-8000-00000000NNNN`, `TT` là mã bảng
(`SeedDomains` trong `seeds/full/seed-context.ts`). Nhìn id là biết dòng do seed tạo.

| Nhóm | Có gì |
| --- | --- |
| Bài đăng | Đủ **mọi** giá trị `gift_posts_status_enum` (DRAFT → ARCHIVED), SOS, giao tận nơi người nhận trả ship, 5 số lượng chọn `INSTANT`, xin chuyển từ thiện đang chờ, bài hết hạn để test gia hạn. Ảnh ở `post_media`. |
| Xin nhận | Hàng chờ của bài nhiều số lượng: `PENDING`, `STANDBY`, `REJECTED`, `WITHDRAWN`. |
| Giao dịch | `ACCEPTED`, `DELIVERING` (đã bàn giao), `COMPLETED` ×7, `CANCELLED` có lý do. Ảnh bàn giao/đã nhận/hoàn trả. Thưởng điểm hoàn tất ghi qua sổ thật. |
| Đánh giá | Hai chiều, và một giao dịch mới có **một** chiều — để test nhắc đánh giá. |
| Chat | Phòng `OPEN` và `READ_ONLY`, tin có ảnh, tin bị bộ lọc gắn cờ (một chờ xử lý, một đã cảnh cáo). Có báo xấu đang mở nên Admin **mở được** phòng 1 để điều tra. |
| Feed | Bình luận 2 tầng, đủ 4 trạng thái (`PENDING_REVIEW` không lộ ra công khai), đủ 5 loại cảm xúc, chia sẻ nhiều kênh; bình luận trên cả chủ đề Dharma. |
| Điểm | Mọi khoản đi qua `PointLedgerRepository` thật: xác minh SĐT, onboarding, giới thiệu, hoàn tất quà, affiliate, điểm danh. |
| Điểm danh | Chuỗi 9 ngày có một ngày **bù** (tiêu tín dụng), mốc 7 ngày, cohort tín dụng đã đóng + một cohort đang mở. |
| Nhóm | Nhóm hoạt động có 2 đội con, đủ 3 vai trò; một nhóm đã giải tán. Affiliate: sự kiện trong bán kính chia điểm (một người chạm trần), sự kiện ngoài bán kính 0 điểm. |
| Từ thiện F65b | 6 hoạt động phủ đủ §8: ACTIVE ×2, chờ duyệt, CLOSED (đã gia hạn), SUSPENDED (rút đồng ý), REJECTED. Đề nghị đủ 5 trạng thái, giao nhận hoàn tất/đang mở/huỷ, đóng góp ngoài có một lần sửa (dòng cũ `VOIDED`), coordinator, người thụ hưởng riêng tư. |
| Dharma & công đức | 11 nội dung kinh, kiến thức thực hành và giới thiệu chùa (10 công khai, 1 bản nháp); tụng xong và tụng dở, hồi hướng công khai/ẩn danh/riêng tư, diễn đàn ghim/khoá/ẩn/chờ duyệt. 4 đơn vị công đức (một ngừng), khai báo dự định/đã chuyển/ẩn danh. |
| Nội dung Admin | Blog 4 chuyên mục (một nháp), banner tài trợ đủ 3 trạng thái duyệt, giao diện trang chủ (một bật, một nháp), broadcast ALL/GROUP/AREA, báo xấu POST/USER/COMMENT đủ 4 trạng thái. |
| Thông báo | Hộp thư đã đọc/chưa đọc của nhiều loại. |

## Nguyên tắc thiết kế

1. **Dữ liệu gốc bằng SQL, dữ liệu suy ra bằng code của app.** Sự kiện đã xảy ra (bài, giao
   dịch, tin nhắn) ghi thẳng. Số dư điểm, điểm sao, độ chính xác, băm SĐT thì đi qua đúng
   repository của app — seed không chép công thức để rồi lệch ở lần sửa sau.
2. **Bộ đếm tính lại, không cộng dồn.** `comment_count`, `reaction_count`, `share_count`,
   `reply_count`, projection nhu cầu từ thiện được tính lại từ dòng gốc theo đúng quy tắc
   repository (chỉ đếm bình luận `VISIBLE`; `accepted` = giao nhận còn mở…). Chạy bao nhiêu lần
   cũng ra một số.
3. **Idempotent.** Khoá cố định + `ON CONFLICT DO NOTHING`/`WHERE NOT EXISTS`. Bảng append-only
   (sổ điểm, chat, bằng chứng, audit…) chỉ chèn, không bao giờ sửa. Bài đăng và user thì upsert
   như seed demo cũ.
4. **Không để việc cho cron thật.** Không broadcast `PENDING`/`SENDING` (worker sẽ gửi cho MỌI
   người dùng), thông báo đều có `pushed_at`, không phiên đăng nhập nào còn dùng được.
5. **Không bật tính năng chưa duyệt.** Chính sách affiliate hiện hành (v2) TẮT; chỉ seed lịch sử
   khi bảng chính sách còn trống. Không thêm revision điểm danh. Point Rule
   `CHARITY_CONTRIBUTION_COMPLETED` giữ nguyên tắt. Giao diện trang chủ chỉ bật khi chưa có bản
   nào đang bật.

## Giới hạn đã biết

- **Ảnh không có file thật.** Storage key được ghi, nhưng MinIO không có object — URL ký ra
  sẽ 404. Test upload phải đi qua API.
- **Điểm danh mới vẫn bị từ chối**: chính sách v1 do migration seed là bản nháp đang tắt. Lịch
  sử điểm danh ghi theo số của v1 chỉ để các API đọc có dữ liệu.
- Lịch sử điểm danh neo theo **ngày seed lần đầu**; chạy lại hôm khác không ghi thêm.
- `gift_posts` cố ý trống — bảng cũ đã thay bằng `posts`, chỉ còn cho backfill.

## Phép kiểm `test:seed-full`

Dựng database nháp, chạy seed **hai lần**, rồi kiểm: mọi bảng có dòng (trừ danh sách được phép
trống kèm lý do); lần hai không thêm dòng nào; số dư = dòng sổ cuối = tổng delta; bộ đếm và
projection khớp dòng gốc; đủ trạng thái §8 và đủ trạng thái bài; mọi bài OFFER có
`condition` + `estimatedValue`; không còn việc cho cron; tài khoản demo đăng nhập được.

Thêm bảng mới mà chưa seed thì phép kiểm đầu tiên đỏ — cố ý, để bộ seed không mục dần như
mô tả "ba bảng" của seed demo cũ.

## Dọn

Mọi dòng seed có id bắt đầu `5eed` hoặc thuộc user `5eed01…`. Bảng append-only (sổ điểm, chat,
audit…) có trigger chặn `DELETE`, nên cách dọn sạch là dựng lại database, không phải xoá tay.
