# Dự án Từ thiện theo vòng đời 4 giai đoạn — yêu cầu backend

> Trạng thái: **đề xuất, chưa triển khai** (04/11/2026). Nguồn: bảng yêu cầu Product
> "Tên dự án / Kế hoạch mục tiêu / Triển khai / Sự kiện trao / Tổng kết" gửi đội mobile ngày
> 04/11. Tài liệu này **mở rộng** [`CHARITY-CONTRIBUTION-DESIGN.md`](./CHARITY-CONTRIBUTION-DESIGN.md)
> (bảng nhu cầu, đề nghị đóng góp, giao nhận — đã xong) chứ không thay thế nó. Mọi đề xuất
> schema dưới đây là hướng đi để thảo luận; quyết định cuối ghi vào §7 trước khi viết migration.

## 1. Yêu cầu tóm tắt

Một dự án từ thiện đi qua bốn giai đoạn, mỗi giai đoạn là một tab trên app:

| Tab | Giai đoạn | Nội dung chính |
| --- | --- | --- |
| A | **Kế hoạch** | Hồ sơ dự án đầy đủ: thời gian, lời kêu gọi, vật phẩm, đơn vị tổ chức, bên thụ hưởng, đơn vị cấp phép, đơn vị truyền thông, loại kêu gọi tham gia; ban tổ chức 6 vai trò; tiến độ 4 bước; hạng mục từ thiện có đơn giá |
| B | **Triển khai** | Checklist 7 việc (cấp phép, truyền thông, tiếp nhận/giải đáp, theo dõi/hiệu chỉnh, kết thúc tiếp nhận, thống kê/đóng gói, thông báo/tiền trạm 48 giờ trước khi trao) |
| C | **Sự kiện trao** | Timeline 10 bước (tập hợp → họp ngắn → di chuyển → nghỉ → đến nơi → làm việc với địa phương → với bên nhận → trao quà → tổng kết/cảm ơn → trở về); người tham gia và ban tổ chức đăng ảnh/clip |
| D | **Tổng kết** | Tập hợp thông tin, báo cáo, đánh giá/khen thưởng, lời cảm ơn, rút kinh nghiệm |

Ghi chú quản trị trong bảng yêu cầu:

1. Lập xong tab A → Admin duyệt mới hiện công khai, rồi sang giai đoạn B.
2. Giai đoạn B: ban tổ chức cập nhật tiến độ; app tự hiện theo thời gian thực. Ban tổ chức
   **vẫn sửa được kế hoạch đã duyệt**, phần sửa hiện chữ đỏ.
3. Mọi trang của sự kiện có **nút báo cáo màu đỏ** gửi về Admin (mô tả + ảnh/clip bằng chứng).
4. App ghi nhận và thống kê: quan tâm, thích, bình luận, đăng ký tặng, đăng ký tham gia, báo cáo.
5. Ban tổ chức đăng clip/ảnh, bình luận về tiến độ.
6. Giai đoạn C: app **nhảy sang tab C theo mốc thời gian**; người tham gia và ban tổ chức đăng
   bình luận có clip/ảnh — tối đa **5 clip + 5 ảnh / người / ngày**.
7. Điểm: vật phẩm tặng tính khi ban tổ chức xác nhận, **10.000đ = 1 điểm**; clip **3 điểm**,
   ảnh **2 điểm**; người tham gia được ban tổ chức xác nhận nhận **100 điểm × mức hoàn thành
   (0–100)**.

## 2. Hiện trạng backend (đối chiếu)

Đã có, giữ nguyên và tái dùng:

| Bảng / endpoint | Phục vụ yêu cầu |
| --- | --- |
| `campaigns` (`approval_status`, `is_active`, `start_time`/`end_time`, `campaign_type`, `location`, `allow_over_target`) | Khung dự án, duyệt lần đầu, đóng/đình chỉ |
| `campaign_need_items` (tên, đơn vị, `target_quantity`, `accepted_quantity`, `received_quantity`, `allow_alternative`) | Hạng mục vật phẩm (thiếu đơn giá — §3.1) |
| `campaign_contributions` + `campaign_contribution_items`, `campaign_deliveries` + `campaign_delivery_items`, `campaign_external_contributions` | Đăng ký tặng, duyệt, giao nhận, nhập kho ngoài app |
| `campaign_coordinators` (cấp/thu hồi) | Quyền điều phối (khác với "ban tổ chức" thông tin — §3.1) |
| `campaign_beneficiaries` (họ tên, quan hệ, SĐT, địa chỉ, đồng ý) | Bên thụ hưởng cho `INDIVIDUAL_APPEAL` |
| `campaign_media` (≤5, ảnh/video, cover) | Ảnh hồ sơ dự án |
| `campaign_participations` (`REGISTERED`/`CANCELLED`), `campaign_reviews` | Đăng ký tham gia, đánh giá |
| `campaign_schedule_changes` (`previous_end_time`/`new_end_time`/`reason`) | Mẫu audit — chỉ cho thời hạn |
| `POST :id/close`, `POST :id/extend`, `PATCH :id/progress`, `PUT :id/media`, `PUT :id/beneficiary` | Thao tác organizer hiện có |
| `reports` (`target_type`, `description`, `evidence_urls jsonb`) | Báo cáo vi phạm có bằng chứng — **chưa có target chiến dịch** |
| `point_rules` (`CHARITY_CONTRIBUTION_COMPLETED` = 10, đang TẮT) | Khung điểm — chưa theo giá trị |
| Tác vụ định kỳ chạy **ngoài tiến trình** (`npm run post:expire`, `rank:evaluate`, `chat:purge`); repo cấm `@nestjs/schedule` | Mẫu cho việc tự chuyển giai đoạn và nhắc 48 giờ |

Chưa có: hồ sơ các đơn vị (tổ chức/cấp phép/truyền thông), tài khoản ngân hàng của dự án, ban
tổ chức 6 vai trò, tiến độ 4 bước, đơn giá/giá trị/tình trạng/nguồn cung của vật phẩm, giai
đoạn vận hành A→D, lịch sử sửa kế hoạch theo field, checklist B, timeline C, bài đăng ảnh/clip
trong dự án, tổng kết D, chấm mức hoàn thành người tham gia, thích/bình luận cho chiến dịch,
báo cáo vi phạm chiến dịch, điểm theo giá trị vật phẩm và theo ảnh/clip.

## 3. Việc backend cần làm

### 3.1 Hồ sơ kế hoạch (tab A)

**Thông tin dự án** — thêm cột vào `campaigns` (nullable để dữ liệu cũ hợp lệ):

- `appeal_purpose`, `appeal_audience`, `appeal_circumstance` (text) — "Lời kêu gọi: mục đích,
  đối tượng, hoàn cảnh". `description` hiện có giữ làm mô tả chung.
- `call_to_actions` (`text[]`, giá trị `LIKE` | `SUPPORT_AND_DONATE` | `JOIN`) — loại kêu gọi
  tham gia ban tổ chức bật cho dự án.

**Các đơn vị liên quan** — bảng mới `campaign_parties`:

| Cột | Ghi chú |
| --- | --- |
| `campaign_id`, `role` | `ORGANIZER` \| `BENEFICIARY` \| `LICENSING` \| `MEDIA` |
| `name`, `address`, `phone`, `email`, `hotline` | Tên/địa chỉ/ĐT… |
| `pic_name`, `pic_phone`, `pic_user_id` (nullable) | Người phụ trách; `pic_user_id` khi là tài khoản Chân Tâm |
| `beneficiary_kind` | `INDIVIDUAL` \| `GROUP` — chỉ cho `role = BENEFICIARY` |
| `evidence_urls jsonb` | Giấy phép/xác nhận (đơn vị cấp phép) — gắn với mục B6 checklist 01/11 |

`campaign_beneficiaries` hiện có (đồng ý của người được kêu gọi hộ) giữ nguyên cho
`INDIVIDUAL_APPEAL`; `BENEFICIARY` trong `campaign_parties` dùng cho `ORGANIZED_CAMPAIGN` có bên
nhận tập thể. Cần chốt có hợp nhất hai nơi không (§7).

**Tài khoản ngân hàng** — bảng mới `campaign_bank_accounts`, **có phiên bản** (không ghi đè):
`campaign_id`, `party_role` hoặc `team_role`, `bank_name`, `account_no`, `account_name`,
`valid_from`, `valid_to`, `created_by`. Đổi tài khoản = đóng bản cũ (`valid_to`) + tạo bản mới
và thông báo người đã ủng hộ (quy tắc B3 checklist 01/11). Lưu ý: tài liệu đóng góp hiện ghi
"luồng tiền không thuộc thiết kế này" — cần chốt phạm vi (§7).

**Ban tổ chức 6 vai trò** — bảng mới `campaign_team_members`:

| Cột | Ghi chú |
| --- | --- |
| `campaign_id`, `role` | `GENERAL_LEAD` (phụ trách chung), `LIAISON_MEDIA` (liên lạc/truyền thông), `INTAKE_LOGISTICS` (tiếp nhận/hậu cần), `FINANCE` (quỹ/thu chi), `ADVANCE_TRANSPORT` (tiền trạm/vận tải), `REPORTING` (báo cáo/điều phối) |
| `display_name` (tổ chức/cá nhân), `address`, `phone`, `email`, `position` | |
| `user_id` (nullable) | "Nick trên Chân Tâm" — cần API tìm user để chọn |
| `bank_account_id` (nullable) | Tham chiếu `campaign_bank_accounts` |

Đây là **thông tin công khai**, khác `campaign_coordinators` (quyền thao tác). Gợi ý: chọn
`user_id` cho vai trò thì cho phép (không bắt buộc) cấp quyền coordinator trong cùng thao tác.

**Tiến độ 4 bước** — bảng mới `campaign_phases`:

| Cột | Ghi chú |
| --- | --- |
| `campaign_id`, `phase` | `PLANNING` (lập dự án), `PREPARATION` (chuẩn bị), `DISTRIBUTION` (thực hiện trao), `REPORTING` (báo cáo kết quả) |
| `starts_at`, `ends_at` | Giờ/ngày/tháng/năm; tổng số ngày tính ra, không lưu |
| `pic_name`, `pic_user_id`, `hotline` | |
| `delivery_method` | `ON_SITE` \| `SHIP` \| `TRANSFER` — cho `DISTRIBUTION` |
| `report_mode` | `ONLINE` \| `OFFLINE` — cho `REPORTING` |

Ràng buộc: các bước không chồng thời gian theo thứ tự; `DISTRIBUTION.starts_at` là mốc nhảy
sang tab C và mốc nhắc 48 giờ (§3.4).

**Hạng mục vật phẩm** — thêm cột vào `campaign_need_items`:

- `unit_price` (bigint, VNĐ, nullable), giá trị = `unit_price × target_quantity` tính ở read,
  không lưu;
- `item_condition` (`NEW` | `USED` | `ANY` | `OTHER`) và `condition_note`;
- `estimated_value` (bigint, nullable) khi không có đơn giá;
- `supply_source` (`PURCHASE` | `DONATION` | `MIXED`).

Endpoint chi tiết trả thêm tổng giá trị dự án (tổng các dòng).

**Lưu nháp.** Form tab A rất dài; bảng yêu cầu ghi "lập dự án xong, Admin xét duyệt". Thiết
kế hiện tại **đã bỏ `DRAFT`** vì schema không phân biệt được nháp với chờ duyệt. Đề xuất thêm
`submitted_at timestamptz NULL`: `NULL` = nháp (chỉ chủ xem, Admin không thấy trong hàng đợi),
có giá trị = đã gửi duyệt. Không thêm giá trị mới vào `approval_status` (giữ lập luận ở §8 tài
liệu đóng góp). Cần chốt (§7).

### 3.2 Giai đoạn vận hành A → D

Thêm cột `operation_stage` vào `campaigns`: `PLAN` | `EXECUTION` | `EVENT` | `SUMMARY`.
Tách khỏi `approval_status` (quyết định duyệt) và `is_active` (đang mở) — cùng lập luận "một cột
một câu hỏi" ở tài liệu đóng góp.

| Chuyển | Điều kiện |
| --- | --- |
| `PLAN → EXECUTION` | Admin duyệt (hoặc public ngay theo capability `PUBLISH_CHARITY_WITHOUT_REVIEW`) |
| `EXECUTION → EVENT` | Tới `campaign_phases.DISTRIBUTION.starts_at`, hoặc organizer chuyển sớm |
| `EVENT → SUMMARY` | Qua `DISTRIBUTION.ends_at`, hoặc organizer chuyển |
| Quay lại | Chỉ organizer/Admin, bắt buộc lý do |

- Chuyển theo thời gian chạy bằng tác vụ ngoài tiến trình mới `npm run charity:advance-stage`
  (theo mẫu `post:expire`), idempotent, theo lô. Đọc chi tiết vẫn trả `operation_stage` đúng
  khi job trễ: tính lại theo thời gian lúc đọc nếu đã quá mốc (job chỉ để ghi xuống và gửi
  thông báo). **Mobile không tự suy giai đoạn từ ngày** — backend trả thẳng.
- Mỗi lần chuyển ghi append-only `campaign_stage_events` (`from_stage`, `to_stage`,
  `actor_id` | `SYSTEM`, `reason`, `created_at`).
- `is_active = false` (đóng/đình chỉ) vẫn ưu tiên: chiến dịch đình chỉ ở bất kỳ giai đoạn nào
  cũng không nhận thao tác mới.

### 3.3 Sửa kế hoạch sau khi duyệt (chữ đỏ)

Bảng append-only `campaign_revisions`: `campaign_id`, `entity` (`campaign` | `party` | `team` |
`phase` | `need_item` | `bank_account`), `entity_id`, `field`, `old_value jsonb`,
`new_value jsonb`, `changed_by`, `reason`, `created_at`.

- Mọi `PATCH` kế hoạch sau khi `approval_status = APPROVED` ghi revision trong cùng transaction.
- Detail trả `changedFields` (danh sách `entity.field` đã đổi kể từ lúc duyệt) để app tô đỏ, và
  `GET :id/revisions` cho changelog công khai.
- Thay đổi quan trọng (thời gian `DISTRIBUTION`, địa điểm, tài khoản ngân hàng, mục tiêu, bên
  thụ hưởng) gửi thông báo người đã ủng hộ/tham gia (checklist 01/11 mục B3).
- Không bắt duyệt lại mặc định (owner tự quản trị, Admin hậu kiểm — checklist B10).
- `campaign_schedule_changes` (audit gia hạn) có thể giữ nguyên hoặc chuyển dần sang `campaign_revisions`.

### 3.4 Tab B — Triển khai

Bảng `campaign_tasks`, tạo tự động 7 dòng mẫu lúc vào `EXECUTION`:

| `task_key` | Tên |
| --- | --- |
| `LICENSING` | Cấp phép, liên hệ |
| `PROMOTION` | Truyền thông/kêu gọi |
| `INTAKE` | Tiếp nhận/giải đáp |
| `MONITORING` | Theo dõi/hiệu chỉnh |
| `CLOSE_INTAKE` | Kết thúc tiếp nhận (mốc thời gian = hạn nhận đóng góp) |
| `PACKING` | Thống kê/đóng gói |
| `PRE_EVENT_NOTICE` | Thông báo/tiền trạm — 48 giờ trước khi trao |

Cột: `scheduled_at`, `work_note`, `remark`, `pic_name`, `pic_user_id`, `update_mode`
(`ONLINE` | `ON_SITE`), `status` (`TODO` | `IN_PROGRESS` | `DONE` | `SKIPPED`), `updated_by`,
`updated_at`. Organizer/coordinator cập nhật; mỗi lần đổi trạng thái ghi revision.

**Nhắc 48 giờ**: tác vụ ngoài tiến trình `npm run charity:pre-event-notice` gửi notification
(push + in-app) tới người đã đăng ký tham gia và người có đóng góp được chấp nhận, khi còn
≤ 48 giờ tới `DISTRIBUTION.starts_at`; đánh dấu đã gửi để không gửi lại.

### 3.5 Tab C — Sự kiện trao

**Timeline** — bảng `campaign_event_steps`, 10 bước mẫu tạo lúc vào `EVENT` (hoặc khi organizer
lập lịch sớm): `GATHER`, `BRIEFING`, `TRAVEL`, `REST_STOP`, `ARRIVE`, `MEET_LOCAL_AUTHORITY`,
`MEET_RECIPIENTS`, `DISTRIBUTE`, `WRAP_UP`, `RETURN`. Cột: `planned_at`, `actual_at`, `status`
(`PENDING` | `IN_PROGRESS` | `DONE`), `note`, `updated_by`.

"Thời gian thực": tối thiểu là polling detail/timeline; nếu cần đẩy ngay thì phát qua kênh
realtime hiện có của chat (`infrastructure/realtime/chat.gateway.ts`) — cần chốt (§7).

**Bài đăng ảnh/clip** — bảng `campaign_posts` (bình luận có media trong dự án):
`campaign_id`, `author_id`, `author_role` (`ORGANIZER` | `COORDINATOR` | `PARTICIPANT`),
`stage` (lúc đăng), `body`, `created_at`, `deleted_at`; media con `campaign_post_media`
(`storage_key`, `public_url`, `media_type` `IMAGE` | `VIDEO`, `duration_sec`, `size_bytes`).

- Quyền đăng: organizer/coordinator ở mọi giai đoạn sau duyệt; người tham gia (`REGISTERED`)
  từ `EVENT`. Bảng yêu cầu ghi "bên tổ chức up clip và hình ảnh" ở B — xác nhận ai được đăng ở
  giai đoạn nào (§7).
- **Quota 5 clip + 5 ảnh / người / ngày** kiểm ở bước ký đường tải (theo mẫu chat: kiểm quyền
  trước khi ký), đếm theo ngày giờ Việt Nam. Cần chốt quota tính theo dự án hay toàn app, và
  dung lượng/độ dài tối đa của clip.
- Có thể báo cáo vi phạm từng bài (§3.8) và Admin ẩn được.

### 3.6 Tab D — Tổng kết

- Bảng `campaign_summaries` (1-1): `summary`, `usage_report` (sử dụng tiền/vật phẩm),
  `thanks_message`, `lessons_learned`, `evidence_urls jsonb`, `published_at`, `updated_by`.
  Công khai khi `published_at` có giá trị; sửa sau khi công khai ghi revision.
- Bảng `campaign_participant_evaluations`: `campaign_id`, `participant_id`,
  `completion_score` (0–100), `note`, `evaluated_by`, `created_at`; sửa = bản ghi mới (giữ
  lịch sử). Chỉ người `REGISTERED`, không huỷ; chỉ organizer/coordinator chấm; chỉ ở `SUMMARY`.

### 3.7 Tương tác và thống kê

- **Thích** và **bình luận** cho chiến dịch: mở rộng hệ reaction/comment hiện có (đang gắn với
  `POST`) sang `CHARITY_CAMPAIGN`, hoặc bảng riêng nếu cấu trúc hiện tại không cho đa target.
- **Quan tâm**: cần định nghĩa (lượt xem? bấm "quan tâm"?) — §7.
- Endpoint thống kê cho organizer `GET :id/stats`: số thích, bình luận, đề nghị đóng góp theo
  trạng thái, người tham gia (đăng ký/huỷ), lượt báo cáo. Detail công khai trả các bộ đếm cần
  hiển thị.

### 3.8 Báo cáo vi phạm (nút đỏ)

- Thêm `CHARITY_CAMPAIGN` và `CHARITY_CAMPAIGN_POST` vào `ReportTargetTypes`
  (`core-lib/src/consts/report-types.ts`) và CHECK của `reports`. Bảng đã có
  `evidence_urls jsonb`, chỉ cần cho phép upload ảnh/clip bằng chứng qua luồng media hiện có.
- Hàng đợi Admin hiện có; xử lý (đình chỉ dự án, ẩn bài) phải có lý do + audit + thông báo
  organizer (checklist B10).

### 3.9 Điểm

Đưa các mức trong bảng yêu cầu thành **`point_rules` cấu hình được**, không hardcode:

| Rule | Mặc định theo bảng | Khi phát sinh |
| --- | --- | --- |
| `CHARITY_ITEM_VALUE` | 1 điểm / 10.000đ | Delivery `COMPLETED`, theo **giá trị ban tổ chức xác nhận** |
| `CHARITY_POST_VIDEO` | 3 điểm / clip | Clip trong `campaign_posts` không bị ẩn/báo cáo thành công |
| `CHARITY_POST_IMAGE` | 2 điểm / ảnh | Như trên |
| `CHARITY_PARTICIPATION` | 100 × `completion_score` / 100 | Khi có đánh giá ở `SUMMARY` |

- Giá trị xác nhận: thêm `confirmed_value` (bigint) vào `campaign_delivery_items` khi organizer xác
  nhận nhận hàng — gắn với quy tắc B4 checklist 01/11 (giá trị đã đối soát, % đạt yêu cầu, bút
  toán điều chỉnh âm/dương có audit, trần theo contribution và theo chu kỳ, snapshot policy).
- Trần chống lạm dụng: điểm ảnh/clip theo quota ngày (§3.5); chấm lại đánh giá tạo bút toán
  điều chỉnh, không sửa bút toán cũ.
- `CHARITY_CONTRIBUTION_COMPLETED` (cố định 10, đang tắt) được thay bằng `CHARITY_ITEM_VALUE`.

### 3.10 Thông báo

| Sự kiện | Người nhận |
| --- | --- |
| Dự án được duyệt / bị từ chối | Organizer |
| Chuyển giai đoạn B→C→D | Người tham gia, người có đóng góp được chấp nhận |
| Kế hoạch thay đổi quan trọng (§3.3) | Người đã ủng hộ/tham gia |
| Còn 48 giờ tới lúc trao | Người tham gia, người có đóng góp được chấp nhận |
| Tổng kết được công khai | Người đã ủng hộ/tham gia |
| Báo cáo được xử lý / dự án bị đình chỉ | Người báo cáo / organizer |

Cần thêm loại vào `notification-types.ts` và `notification-targets.ts`.

## 4. API đề xuất

Đặt dưới `/api/v1/charity-campaigns` (theo controller hiện có). Body bọc dưới khoá resource,
khai đủ mã lỗi (INVARIANTS §6).

| Method | Path | Mục đích |
| --- | --- | --- |
| `POST` | `/` | Tạo (mở rộng body: lời kêu gọi, `callToActions`, `submit` true/false cho nháp) |
| `PATCH` | `/:id` | Sửa kế hoạch; sau duyệt ghi revision |
| `POST` | `/:id/submit` | Gửi duyệt bản nháp |
| `PUT` | `/:id/parties` · `/:id/team` · `/:id/phases` · `/:id/bank-accounts` | Thay danh sách theo từng nhóm |
| `GET` | `/:id/revisions` | Changelog công khai |
| `POST` | `/:id/stage` | Organizer chuyển giai đoạn (có lý do khi quay lại) |
| `GET`/`PATCH` | `/:id/tasks` · `/:id/tasks/:taskId` | Checklist tab B |
| `GET`/`PATCH` | `/:id/event-steps` · `/:id/event-steps/:stepId` | Timeline tab C |
| `POST` | `/:id/posts/media/upload` | Ký đường tải (kiểm quyền + quota) |
| `GET`/`POST`/`DELETE` | `/:id/posts` · `/:id/posts/:postId` | Bài ảnh/clip |
| `GET`/`PUT` | `/:id/summary` | Tổng kết tab D |
| `GET`/`PUT` | `/:id/evaluations` | Chấm mức hoàn thành |
| `POST`/`DELETE` | `/:id/reactions` | Thích |
| `GET`/`POST` | `/:id/comments` | Bình luận |
| `GET` | `/:id/stats` | Thống kê cho organizer |

`GET /api/v1/campaigns/:idOrSlug` (detail công khai) trả thêm: `operationStage`,
`stageChangedAt`, `parties`, `team`, `phases`, `bankAccounts` (bản đang hiệu lực),
`changedFields`, `counters` (thích/bình luận/đóng góp/tham gia), và `capabilities` cho người
xem (`canEditPlan`, `canAdvanceStage`, `canPost`, `remainingImageQuota`, `remainingVideoQuota`,
`canEvaluate`, `canReport`) — app hiển thị theo `capabilities`, không tự suy luận theo rank.

## 5. Tương thích

- Mọi cột mới nullable/có default; chiến dịch cũ: `operation_stage` suy theo `approval_status`
  + thời gian lúc chạy migration (`APPROVED` và đang trong hạn → `EXECUTION`; quá `end_time` →
  `SUMMARY`; chờ duyệt/từ chối → `PLAN`); `submitted_at` = `created_at`.
- Bảng mới rỗng với chiến dịch cũ; detail trả mảng rỗng, app hiện "chưa cập nhật".
- Không đổi nghĩa của `approval_status`, `is_active`, `end_time` và các endpoint hiện có —
  app phiên bản cũ vẫn chạy.

## 6. Thứ tự đề xuất

| Đợt | Backend | Mobile dùng được |
| --- | --- | --- |
| 1 | §3.1 hồ sơ tab A + nháp, §3.2 `operation_stage` + job chuyển giai đoạn, detail mở rộng | Form tab A đầy đủ, màn chi tiết 4 tab (xem) |
| 2 | §3.3 revisions, §3.4 checklist + nhắc 48 giờ, §3.7 thích/bình luận/thống kê, §3.8 báo cáo chiến dịch | Chữ đỏ + changelog, tab B, thanh tương tác, nút đỏ |
| 3 | §3.5 timeline + bài ảnh/clip có quota | Tab C |
| 4 | §3.6 tổng kết + chấm điểm, §3.9 điểm theo giá trị/ảnh/clip/tham gia | Tab D, sổ điểm |

Mỗi đợt: migration + entity + repository + use case + spec, cập nhật `DATA-MODEL.md`,
`ROADMAP.md`, `README.md` của package và `docs/API.md` trong cùng PR (quy tắc docs/plan).

## 7. Cần Product/Bên A chốt trước khi viết migration

1. **3 tab hay 4 tab**: checklist 01/11 (B8) chốt 3 tab Kế hoạch/Tiến độ/Kết quả; bảng yêu
   cầu mới là 4 tab. Đề xuất theo 4 tab.
2. **Nháp**: có cần lưu nháp hồ sơ tab A không (đề xuất `submitted_at`, §3.1)?
3. **Duyệt**: vẫn giữ ngoại lệ `PUBLISH_CHARITY_WITHOUT_REVIEW` (Kim Cương public ngay)?
4. **Tiền**: dự án có nhận chuyển khoản không; mỗi vai trò một tài khoản hay chỉ tài khoản quỹ;
   app chỉ hiển thị (không giữ tiền) — cần mở lại phạm vi đang ghi "luồng tiền không thuộc
   thiết kế đóng góp".
5. **Bên thụ hưởng**: hợp nhất `campaign_beneficiaries` với `campaign_parties.BENEFICIARY` hay
   giữ hai nơi?
6. **Ai được đăng ảnh/clip ở giai đoạn nào**; quota 5+5 tính theo dự án hay toàn app; dung
   lượng/thời lượng tối đa của clip.
7. **Realtime tab C**: polling là đủ hay cần đẩy qua kênh realtime?
8. **Điểm**: các mức trong bảng là giá trị mặc định cấu hình được (đề xuất); trần theo ngày/chu
   kỳ; ai chấm mức hoàn thành, có cho khiếu nại không.
9. **"Quan tâm"** đếm thế nào (lượt xem, bấm theo dõi, hay gộp với thích)?
