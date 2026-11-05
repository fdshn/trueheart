# Dự án Từ thiện theo vòng đời 4 giai đoạn — yêu cầu backend

> Trạng thái: **đã chốt 9 điểm mở (§7); đợt 1–4 đã triển khai đủ** (04–05/11/2026 — migration
> `1802400000000`…`1802800000000`, API ở [API.md §18](../API.md)). Ghi chú đợt 4b: điểm đi qua
> `campaign_point_awards` (đích − đã ghi, hoãn khi vướng trần, job `charity:points`); bốn rule seed
> TẮT chờ chốt mức; khiếu nại giá trị xác nhận tính trên cả lượt giao nhận
> (`confirmed_value_adjusted`). Ghi chú đợt 4a: card Home ở `GET /home/charity-cards`.
> Ghi chú đợt 3: quota tính ở lượt ký đường tải (`campaign_post_uploads`); realtime namespace
> `/charity` + Redis adapter cho mọi namespace. Ghi chú triển
> khai đợt 2: thông báo nhắc 48 giờ gộp vào job `charity:notify` (cùng outbox với các thông báo
> theo dự án khác) thay cho `charity:pre-event-notice` riêng; số thích/bình luận đếm thẳng từ
> bảng gốc, không có cột đếm trên `campaigns`. Nguồn: bảng yêu cầu Product
> "Tên dự án / Kế hoạch mục tiêu / Triển khai / Sự kiện trao / Tổng kết" và phần làm rõ
> workspace organizer/public viewer gửi đội mobile ngày 04/11. Tài liệu này **mở rộng**
> [`CHARITY-CONTRIBUTION-DESIGN.md`](./CHARITY-CONTRIBUTION-DESIGN.md)
> (bảng nhu cầu, đề nghị đóng góp, giao nhận — đã xong) chứ không thay thế nó. Quyết định của
> chủ dự án ngày 04/11 ghi ở §7.1; các mục §3.15–§3.17 là thiết kế đi kèm những quyết định đó.
> Quyết định Product ngày 05/11 (§7.2, §3.18) **chưa triển khai** — đợt 5.

## 1. Yêu cầu tóm tắt

Một dự án từ thiện đi qua bốn giai đoạn, mỗi giai đoạn là một tab trên app:

| Tab | Giai đoạn | Nội dung chính |
| --- | --- | --- |
| A | **Kế hoạch** | Hồ sơ dự án đầy đủ: thời gian, lời kêu gọi, vật phẩm, đơn vị tổ chức, bên thụ hưởng, đơn vị cấp phép, đơn vị truyền thông, loại kêu gọi tham gia; ban tổ chức 6 vai trò; tiến độ 4 bước; hạng mục từ thiện có đơn giá |
| B | **Triển khai** | Checklist 7 việc (cấp phép, truyền thông, tiếp nhận/giải đáp, theo dõi/hiệu chỉnh, kết thúc tiếp nhận, thống kê/đóng gói, thông báo/tiền trạm 48 giờ trước khi trao) |
| C | **Sự kiện trao** | Timeline 10 bước (tập hợp → họp ngắn → di chuyển → nghỉ → đến nơi → làm việc với địa phương → với bên nhận → trao quà → tổng kết/cảm ơn → trở về); người tham gia và ban tổ chức đăng ảnh/clip |
| D | **Tổng kết** | Tập hợp thông tin, báo cáo, đánh giá/khen thưởng, lời cảm ơn, rút kinh nghiệm |

Hai bề mặt bắt buộc phải tách contract:

- **Organizer workspace**: công cụ thực hiện dự án; mỗi mục A/B/C/D mở vào form sâu, có
  edit/save/publish, in/PDF, chia sẻ; thấy dữ liệu nội bộ, tiến độ hoàn thiện và lịch sử sửa.
- **Public viewer**: chỉ trả thông tin cần công khai; ưu tiên cover/cập nhật ảnh/clip,
  reaction/comment, tiến độ cần tiền/đồ/người, CTA quan tâm/ủng hộ/tham gia và báo cáo vi phạm.
  Không trả đánh giá nội bộ hoặc ghi chú điều phối.

Ghi chú quản trị trong bảng yêu cầu:

1. Lập xong tab A → gửi duyệt nếu capability hiện hành yêu cầu. Tài khoản có
   `PUBLISH_CHARITY_WITHOUT_REVIEW` được công khai ngay; mobile không tự suy theo tên rank.
2. Giai đoạn B: ban tổ chức cập nhật tiến độ; app tự hiện theo thời gian thực. Ban tổ chức
   **vẫn sửa được kế hoạch đã duyệt**, phần sửa hiện chữ đỏ.
3. Mọi trang của sự kiện có **nút báo cáo màu đỏ** gửi về Admin (mô tả + ảnh/clip bằng chứng).
4. App ghi nhận và thống kê: quan tâm, thích, bình luận, đăng ký tặng, đăng ký tham gia, báo cáo.
5. Ban tổ chức đăng clip/ảnh, bình luận về tiến độ.
6. Giai đoạn C: app **nhảy sang tab C theo mốc thời gian**; BTC được hoãn/chuyển sớm thủ công
   có lý do. Thành viên BTC và participant đã được xác nhận, check-in được đăng bình luận có
   clip/ảnh — tối đa **5 clip + 5 ảnh / người / ngày**.
7. Điểm: vật phẩm tặng tính khi ban tổ chức xác nhận, **10.000đ = 1 điểm**; media hợp lệ nhận
   **3 điểm/clip, 2 điểm/ảnh**; participant nhận trực tiếp **100 điểm × mức hoàn thành
   (0–100%)** do BTC đánh giá.

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
báo cáo vi phạm chiến dịch, điểm theo giá trị vật phẩm và theo ảnh/clip, workspace/public DTO,
hạng mục kêu gọi tiền, tuyển người, sao kê, custom section, export PDF/share và vị trí quảng bá
ngắn trên Home.

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

**Gộp bên thụ hưởng (chốt §7.5):** `campaign_parties` với `role = BENEFICIARY` là nơi **duy
nhất** lưu bên thụ hưởng cho mọi loại dự án. Thêm vào đó các cột còn thiếu từ
`campaign_beneficiaries`: `relationship`, `consent_at`, `consent_evidence_urls`. Migration chép
dữ liệu cũ sang rồi để `campaign_beneficiaries` thành bảng chỉ đọc, gỡ ở bản sau khi mọi đường
đọc đã chuyển. `PUT :id/beneficiary` hiện có giữ nguyên contract nhưng ghi vào `campaign_parties`.

**Tài khoản ngân hàng** — bảng mới `campaign_bank_accounts`, **có phiên bản** (không ghi đè):
`campaign_id`, `party_role` hoặc `team_role`, `bank_name`, `account_no`, `account_name`,
`valid_from`, `valid_to`, `created_by`. Đổi tài khoản = đóng bản cũ (`valid_to`) + tạo bản mới
và thông báo người đã ủng hộ (quy tắc B3 checklist 01/11). App **không giữ tiền**; đây chỉ là
hồ sơ minh bạch.

**Số tài khoản nhận đồng thời (chốt §7.4):** khoá `system_configs`
`charity.max_bank_accounts_per_campaign` (INTEGER, mặc định đề xuất 2) và cột ghi đè
`campaigns.max_bank_accounts` (nullable, chỉ Admin đặt). Đếm tài khoản **đang hiệu lực**
(`valid_to IS NULL`) lúc thêm, dưới khoá hàng dự án.

**Ban tổ chức 6 vai trò** — bảng mới `campaign_team_members`:

| Cột | Ghi chú |
| --- | --- |
| `campaign_id`, `role` | `GENERAL_LEAD` (phụ trách chung), `LIAISON_MEDIA` (liên lạc/truyền thông), `INTAKE_LOGISTICS` (tiếp nhận/hậu cần), `FINANCE` (quỹ/thu chi), `ADVANCE_TRANSPORT` (tiền trạm/vận tải), `REPORTING` (báo cáo/điều phối) |
| `display_name` (tổ chức/cá nhân), `address`, `phone`, `email`, `position` | |
| `user_id` (nullable) | "Nick trên Chân Tâm" — cần API tìm user để chọn |
| `bank_account_id` (nullable) | Tham chiếu `campaign_bank_accounts` |

Đây là **thông tin công khai**, khác `campaign_coordinators` (quyền thao tác). Gợi ý: chọn
`user_id` cho vai trò chỉ liên kết hồ sơ Chân Tâm, **không tự cấp quyền quản trị**. Owner phải
thêm user vào BTC/coordinator bằng thao tác riêng. Thành viên không có tài khoản vẫn được lưu
dưới dạng thông tin mô tả.

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
- `intake_deadline`, `dropoff_address`, `delivery_instruction`, `receiver_name`,
  `receiver_phone`, `intake_status` (`OPEN` | `CLOSED`).

Read model phải tách `registered_quantity`, `approved_quantity`, `received_in_app_quantity`,
`received_external_quantity`, `remaining_quantity`. Hạng mục đã có contribution không được
xóa; organizer chỉ được đóng. Cho phép giảm mục tiêu thấp hơn số đã nhận nhưng bắt buộc ghi
`surplus_explanation` công khai và tạo revision.

Endpoint chi tiết trả thêm tổng giá trị dự án (tổng các dòng).

**Lưu nháp (chốt §7.2).** Form tab A rất dài; bảng yêu cầu ghi "lập dự án xong, Admin xét
duyệt". Thiết kế hiện tại **đã bỏ `DRAFT`** vì schema không phân biệt được nháp với chờ duyệt.
Thêm `submitted_at timestamptz NULL`: `NULL` = nháp (chỉ chủ xem, Admin không thấy trong hàng
đợi, không hiện công khai), có giá trị = đã gửi duyệt. Không thêm giá trị mới vào
`approval_status` (giữ lập luận ở §8 tài liệu đóng góp).

**Trạng thái từng mục workspace.** Mỗi section A/B/C/D trả `completionStatus`
(`EMPTY` | `DRAFT` | `READY` | `PUBLISHED`), `updatedAt`, `updatedBy` và capabilities
`canEdit`, `canSave`, `canPublish`, `canExportPdf`, `canShare`. Lưu một mục không tự công khai
mục đó; public API chỉ đọc snapshot đã publish.

**Form mở.** Thêm `campaign_custom_sections` và `campaign_custom_fields` để organizer bổ sung
thông tin theo loại dự án. Field hỗ trợ `TEXT`, `LONG_TEXT`, `NUMBER`, `DATE`, `SELECT`,
`CHECKBOX`, `FILE`, `URL`; visibility `PUBLIC`, `PARTICIPANT`, `ORGANIZER_ONLY`,
`ADMIN_ONLY`; có thứ tự, validation và audit. Custom field không được thay thế các trường minh
bạch bắt buộc như tài khoản nhận, mục tiêu, số thực nhận và sao kê.

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
- Owner/BTC được hoãn `DISTRIBUTION.starts_at`, chuyển sang `EVENT` sớm hoặc chuyển thủ công
  khi job trễ; bắt buộc lý do và notification người tham gia bị ảnh hưởng. Job và action thủ
  công phải idempotent, không tạo hai stage event cho cùng một lần chuyển.
- `is_active = false` (đóng/đình chỉ) vẫn ưu tiên: chiến dịch đình chỉ ở bất kỳ giai đoạn nào
  cũng không nhận thao tác mới.

### 3.3 Sửa kế hoạch sau khi duyệt (chữ đỏ)

Bảng append-only `campaign_revisions`: `campaign_id`, `entity` (`campaign` | `party` | `team` |
`phase` | `need_item` | `bank_account`), `entity_id`, `field`, `old_value jsonb`,
`new_value jsonb`, `changed_by`, `reason`, `created_at`.

- Mọi `PATCH` kế hoạch sau khi `approval_status = APPROVED` ghi revision trong cùng transaction.
- Detail trả `changedFields` (danh sách `entity.field` đã đổi kể từ lúc duyệt) để **cả workspace
  và public UI tô đỏ**, và `GET :id/revisions` cho changelog công khai. Public chỉ nhận revision
  đã publish, không thấy draft đang sửa.
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
(push + in-app) tới Owner/BTC và participant đã được duyệt, khi còn ≤ 48 giờ tới
`DISTRIBUTION.starts_at`; đánh dấu đã gửi để không gửi lại. Mỗi đợt trao có checklist riêng.
BTC xác nhận sẵn sàng hoặc ghi lý do chưa sẵn sàng; checklist chưa xong tạo cảnh báo nhưng
không tự động hủy/chặn sự kiện. Nếu đổi thời gian sau khi đã gửi, hệ thống lập lịch nhắc lại.

### 3.5 Tab C — Sự kiện trao

**Timeline** — bảng `campaign_event_steps`, 10 bước mẫu tạo lúc vào `EVENT` (hoặc khi organizer
lập lịch sớm): `GATHER`, `BRIEFING`, `TRAVEL`, `REST_STOP`, `ARRIVE`, `MEET_LOCAL_AUTHORITY`,
`MEET_RECIPIENTS`, `DISTRIBUTE`, `WRAP_UP`, `RETURN`. Cột: `planned_at`, `actual_at`, `status`
(`PENDING` | `IN_PROGRESS` | `DONE`), `note`, `updated_by`.

"Thời gian thực": **chốt realtime** (§7.7) — thiết kế ở §3.15.

**Bài đăng ảnh/clip** — bảng `campaign_posts` (cập nhật/bình luận có media trong dự án):
`campaign_id`, `author_id`, `author_role` (`ORGANIZER` | `COORDINATOR` | `PARTICIPANT`),
`stage` (lúc đăng), `body`, `created_at`, `deleted_at`; media con `campaign_post_media`
(`storage_key`, `public_url`, `media_type` `IMAGE` | `VIDEO`, `duration_sec`, `size_bytes`).

- Quyền đăng: Owner/BTC trong thời gian dự án; participant chỉ được đăng media sự kiện sau khi
  BTC xác nhận đăng ký **và đã check-in**. Người chỉ đóng góp, đang chờ duyệt/waitlist, đã huỷ
  hoặc no-show không có quyền. Không yêu cầu participant phải có contribution.
- **Quota 5 clip + 5 ảnh / người / ngày / dự án** kiểm ở bước ký đường tải (theo mẫu chat:
  kiểm quyền trước khi ký), đếm theo ngày giờ Việt Nam. Upload lỗi, retry trùng hoặc media bị
  từ chối không sinh điểm. Hai con số là khoá cấu hình Admin (`charity.post_daily_video_quota`,
  `charity.post_daily_image_quota`). Dung lượng clip tạm dùng giới hạn video hiện có của storage
  (25 MB); độ dài tối đa và thời hạn được đăng sau khi sự kiện kết thúc còn chờ chốt (§7.3).
- Có thể báo cáo vi phạm từng bài (§3.8) và Admin ẩn được.

### 3.6 Tab D — Tổng kết

- Bảng `campaign_summaries` (1-1): `summary`, `usage_report` (sử dụng tiền/vật phẩm),
  `thanks_message`, `lessons_learned`, `evidence_urls jsonb`, `published_at`, `updated_by`.
  Công khai khi `published_at` có giá trị; sửa sau khi công khai ghi revision.
- Bảng `campaign_participant_evaluations`: `campaign_id`, `participant_id`,
  `completion_score` (0–100), `note`, `evaluated_by`, `created_at`; sửa = bản ghi mới (giữ
  lịch sử). Chỉ Owner/BTC được chấm participant đã check-in; chỉ ở `SUMMARY`. Điểm participant
  được tính trực tiếp bằng `100 × completion_score / 100`. Sửa đánh giá tạo point adjustment,
  không sửa ledger cũ. Điểm và ghi chú đánh giá là **nội bộ**, chỉ Owner/BTC và Admin xem,
  không trả qua public API.

Public summary tập trung cho quảng bá/tổng kết: media tiêu biểu, bình luận/lời cảm ơn được
chọn, tổng người quan tâm/đóng góp/tham gia, số phần quà và tổng giá trị. Danh sách nickname
người đóng góp/tham gia chỉ công khai khi người dùng cho phép — quy tắc ở §3.17.

Nếu có nhận tiền, `campaign_financial_reports` bắt buộc có kỳ báo cáo, tổng thu/chi, số dư,
diễn giải và file sao kê/bằng chứng. Không được publish tổng kết tài chính khi thiếu sao kê.

### 3.7 Tương tác và thống kê

- **Thích** và **bình luận** cho chiến dịch: hệ reaction/comment hiện có **đã đa đối tượng**
  qua `ContentSubjectTypes` (`POST`, `COMMENT`, `DHARMA_THREAD`) — thêm `CHARITY_CAMPAIGN` (và
  `CHARITY_CAMPAIGN_POST` cho bài ảnh/clip) vào enum đó, không cần bảng riêng.
- **Quan tâm**: là hành động theo dõi riêng, không đồng nghĩa lượt xem hoặc thích. Thêm
  `campaign_follows`; follower nhận thông báo thay đổi quan trọng, detail trả `followerCount`
  và `isFollowing`.
- Endpoint thống kê cho organizer `GET :id/stats`: số thích, bình luận, đề nghị đóng góp theo
  trạng thái, người tham gia (đăng ký/huỷ), lượt báo cáo. Tách `public-stats` và
  `internal-stats`; public chỉ trả số tổng hợp. Thống kê đóng góp phải tách đăng ký/đã duyệt/
  đã nhận, nguồn trong hệ thống/nguồn ngoài và số còn thiếu.

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
| `CHARITY_POST_VIDEO` | 3 điểm/clip | Clip hợp lệ trong `campaign_posts`, trong quota |
| `CHARITY_POST_IMAGE` | 2 điểm/ảnh | Ảnh hợp lệ trong `campaign_posts`, trong quota |
| `CHARITY_PARTICIPATION` | 100 × `completion_score` / 100 | Khi có đánh giá ở `SUMMARY` |

- Giá trị xác nhận: thêm `confirmed_value` (bigint) vào `campaign_delivery_items` khi organizer xác
  nhận nhận hàng — gắn với quy tắc B4 checklist 01/11 (giá trị đã đối soát, % đạt yêu cầu, bút
  toán điều chỉnh âm/dương có audit, trần theo contribution và theo chu kỳ, snapshot policy).
- **Trần điểm do Admin cấu hình (chốt §7.8):** cho từng loại (`CHARITY_ITEM_VALUE`,
  `CHARITY_POST_*`, `CHARITY_PARTICIPATION`) theo ba cửa sổ — ngày, dự án, chu kỳ duy trì hạng.
  Chạm trần thì **hoãn** chứ không bỏ (cùng cách `qualifyAndAward` của giới thiệu), để nâng trần
  sau không mất phần đã phát sinh.
- Chấm lại đánh giá — kể cả qua khiếu nại (§3.16) — tạo bút toán điều chỉnh, không sửa bút toán cũ.
- `CHARITY_CONTRIBUTION_COMPLETED` (cố định 10, đang tắt) được thay bằng `CHARITY_ITEM_VALUE`.

### 3.10 Thông báo

| Sự kiện | Người nhận |
| --- | --- |
| Dự án được duyệt / bị từ chối | Organizer |
| Chuyển giai đoạn B→C→D | Người tham gia, người có đóng góp được chấp nhận |
| Kế hoạch thay đổi quan trọng (§3.3) | Người đã ủng hộ/tham gia |
| Còn 48 giờ tới lúc trao | Owner/BTC và participant đã được duyệt (§3.4) |
| Tổng kết được công khai | Người đã ủng hộ/tham gia |
| Báo cáo được xử lý / dự án bị đình chỉ | Người báo cáo / organizer |

Cần thêm loại vào `notification-types.ts` và `notification-targets.ts`.

### 3.11 Nhu cầu tiền, hiện vật, nhân lực và hỗ trợ mở

**Kêu gọi tiền** — bảng `campaign_funding_needs`: bên/người thụ hưởng, đơn vị nhận, tài khoản
ngân hàng có phiên bản, mục tiêu, hạn nhận, số đăng ký, số xác nhận trong app, số nhập từ nguồn
ngoài, số còn thiếu và trạng thái mở/đóng. App không giữ tiền; backend quản lý hồ sơ minh bạch,
biên nhận và đối soát.

**Kêu gọi hiện vật** dùng `campaign_need_items` đã mở rộng ở §3.1.

**Tuyển người** — bảng `campaign_volunteer_needs`: tên vị trí/nhiệm vụ, mô tả công việc, yêu
cầu, số người cần, thời gian, địa điểm, số đăng ký, số xác nhận, số còn thiếu và trạng thái
`OPEN` | `CLOSED` | `STARTED`. Đăng ký tham gia độc lập với contribution; không yêu cầu user
phải ủng hộ trước. Hỗ trợ duyệt/từ chối/waitlist/xác nhận/check-in/completed/cancelled/no-show.
Người đã đăng ký được hủy cả khi sự kiện diễn ra; sau khi bước trao bắt đầu thì không nhận đăng
ký mới. Mọi thay đổi tạo audit.

**Hỗ trợ mở** — bảng `campaign_other_support_needs` bổ sung, không thay thế ba nhóm khách đã
yêu cầu: `support_type` (`TRANSPORT` | `LABOR` | `SKILL_SERVICE` | `VENUE` | `EQUIPMENT` |
`MEAL_ACCOMMODATION` | `COMMUNICATION` | `OTHER`), tên, mô tả, đơn vị, mục tiêu, thời gian,
địa điểm, yêu cầu, cách bàn giao, PIC và trạng thái mở/đóng. Dùng cho chuyến xe, phương tiện,
giờ công, chuyên môn/dịch vụ, địa điểm, thiết bị, suất ăn và nhu cầu khác.

Mọi nhóm nhu cầu dùng cùng cách tổng hợp: số đăng ký, được chấp nhận, thực nhận/hoàn thành,
nguồn trong app, nguồn ngoài và còn thiếu. Một user có thể hỗ trợ một phần, nhiều lần hoặc
nhiều hạng mục. Contribution và participation là hai vai trò độc lập; một user có thể có cả
hai nhưng không tự trở thành BTC.

### 3.12 Workspace organizer và public projection

- `GET :id/workspace`: toàn bộ section, draft, checklist, dữ liệu nội bộ, capabilities và lịch
  sử; chỉ organizer/coordinator/Admin.
- `GET :id/public`: thông tin cơ bản, cover/cập nhật đã publish, reaction/comment, các nhóm nhu
  cầu và tiến độ công khai, CTA `follow`/`support`/`join`/`report`.
- Không dùng một DTO rồi để mobile tự ẩn field nhạy cảm. Backend phải enforce visibility.
- Người xem được mở sâu từng section đã publish để xem chi tiết tiến độ; section chưa publish
  trả trạng thái "chưa cập nhật", không lộ draft.

### 3.13 In/PDF và chia sẻ

- Export PDF là bản in snapshot thông thường, không phải quy trình duyệt. Lưu `generated_at`,
  revision/snapshot ID và người tạo để nội dung không thay đổi sau khi tải.
- Share link là public deep link có thể mở web/app; link chỉ truy cập public projection.
- Organizer có thể chia sẻ cả dự án hoặc một section đã publish.

### 3.14 Card quảng bá ngắn trên Home

Thêm cấu hình quảng bá do Admin quản trị: `featured_on_home`, `featured_title`,
`featured_message`, `featured_media`, `featured_cta`, `featured_from`, `featured_until`,
`featured_priority`. Organizer có thể đề xuất, Admin mới bật/tắt. Home chỉ nhận card ngắn để
kêu gọi xem/ủng hộ/tham gia; không trả toàn bộ hồ sơ dự án.

### 3.15 Realtime (chốt §7.7)

Dùng lại hạ tầng Socket.io của chat, với sáu biện pháp kiểm soát rủi ro:

| Rủi ro | Biện pháp |
| --- | --- |
| Nhiều instance core thì sự kiện phát ở instance này không tới socket ở instance kia (`IoAdapter` mặc định, chưa lộ vì production chạy 1 container) | Gắn **Socket.io Redis adapter** (Redis đã có). Sửa luôn rủi ro tương tự của chat |
| Lộ dữ liệu nội bộ | Mỗi dự án hai phòng: `charity:{id}:public` và `charity:{id}:workspace`. Quyền đọc lại từ DB mỗi lần join (như `room:join` của chat). Payload chỉ là **tín hiệu** `{ section, version }`, không mang dữ liệu |
| Mất sự kiện khi app ở nền/mất mạng | Realtime là **gợi ý**, REST là nguồn sự thật. Client thấy `version` lệch hoặc vừa nối lại thì gọi lại API. App ở nền nhận push như thường |
| Bão sự kiện khi sự kiện đông người | Gộp tín hiệu theo dự án, tối đa 1 tín hiệu/giây; bình luận mới chỉ phát "có bài mới", không phát từng bài |
| Khách chưa đăng nhập mở socket hàng loạt | Socket chỉ cho người **đã đăng nhập**; khách xem trang công khai polling 30–60 giây. Giới hạn số kết nối mỗi người |
| Phát trước khi commit | Chỉ phát **sau** commit (như chat) |

Nginx: `deploy/nginx/chantam.conf.example` đã có `location ^~ /socket.io/` nâng cấp WebSocket
cho cả staging và production — namespace `/charity` đi chung đường đó (kiểm lại 05/11).

### 3.16 Khiếu nại đánh giá (chốt §7.8)

**Phạm vi:** hai thứ quyết định điểm — mức hoàn thành 0–100 (`campaign_participant_evaluations`)
và giá trị vật phẩm ban tổ chức xác nhận (`campaign_delivery_items.confirmed_value`).

```
Người bị đánh giá gửi khiếu nại (trong N ngày)
  → Tầng 1: Ban tổ chức xem lại (hạn M ngày)
       ├─ Điều chỉnh → người khiếu nại đồng ý (hoặc im lặng K ngày) → ĐÓNG
       ├─ Giữ nguyên (có lý do) → người khiếu nại chấp nhận → ĐÓNG
       │                          └─ không chấp nhận → Tầng 2
       └─ Quá hạn M ngày → TỰ CHUYỂN Tầng 2
  → Tầng 2: Admin — GIỮ NGUYÊN / ĐIỀU CHỈNH / BÁC — quyết định cuối
```

1. **Ai:** chỉ chính người bị đánh giá, với đánh giá của mình.
2. **Một khiếu nại cho mỗi lần đánh giá.** Đóng là xong, trừ khi Admin mở lại (lý do + audit).
3. **Bằng chứng:** mô tả + ảnh/clip qua luồng tải bằng chứng của báo cáo vi phạm.
4. **Xung đột lợi ích:** ở tầng 1, nếu ban tổ chức có người khác người đã chấm thì người đó xử
   trước; tầng 2 luôn là Admin.
5. **Điểm không bị treo:** phát lúc đánh giá; điều chỉnh ghi **bút toán chênh lệch** (cộng/trừ),
   không sửa bút toán cũ — cùng cơ chế đảo bút toán đang có.
6. **Minh bạch:** người khiếu nại thấy lý do từng quyết định; ghi chú nội bộ thì không.
7. **Chống lạm dụng:** rate limit; Admin thấy số khiếu nại bị bác của mỗi người và số lần mỗi ban
   tổ chức bị khiếu nại thành công — **không tự động phạt** (cùng triết lý báo xấu, Giver
   Accuracy).
8. **Thông báo** cả hai bên ở mọi bước; mọi quyết định ghi audit.

Cấu hình Admin: `charity.appeal_window_days` (N, mặc định 7), `charity.appeal_organizer_sla_days`
(M, 3), `charity.appeal_auto_close_days` (K, 3).

Dữ liệu: `campaign_appeals` (đối tượng, tầng, trạng thái, hạn từng tầng, kết quả),
`campaign_appeal_events` (append-only), job ngoài tiến trình `npm run charity:appeal-sla` để tự
chuyển tầng/tự đóng khi quá hạn. Quyền Admin: dùng `report.resolve` hoặc thêm `charity.appeal.resolve`.

### 3.17 Danh sách nickname công khai (chốt §7.9 — phương án C)

- **Cài đặt chung của tài khoản:** `users.show_in_public_supporter_lists` (mặc định `false`),
  đọc/ghi qua `GET/PATCH /profile/me` như `showOnlineStatus`. Đây là **giá trị mặc định**.
- **Chọn tại từng lần:** cột `show_name_publicly` trên `campaign_contributions` và
  `campaign_participations`, client điền sẵn theo cài đặt chung, người dùng đổi được ngay lúc
  gửi đóng góp/đăng ký và sửa lại sau.
- Public projection chỉ trả nickname của dòng `show_name_publicly = true`; còn lại chỉ vào con
  số tổng. Ban tổ chức (workspace) luôn thấy đủ.
- Tương thích: dữ liệu cũ `show_name_publicly = false`.

### 3.18 Các trường hợp vận hành bổ sung (chốt 05/11)

Các mục dưới đây bổ sung để tránh hở nghiệp vụ, không thay đổi form A/B/C/D của khách:

- Một dự án có thể có nhiều đợt trao/địa điểm; mỗi đợt có timeline, checklist T-48h, participant
  và phân bổ contribution riêng. Tổng dự án là số cộng có đối soát của các đợt.
- Contribution hỗ trợ một phần, nhiều lần hoặc nhiều hạng mục; trạng thái tách rõ đăng ký,
  được chấp nhận, thực nhận/hoàn thành, một phần, rút/hủy, từ chối và tranh chấp.
- Nguồn ngoài app do BTC nhập phải có nguồn/bằng chứng, được tính tiến độ nhưng không tự sinh
  điểm user; có khóa chống tính trùng với contribution trong app.
- Hạng mục đã phát sinh contribution không xoá cứng. Giảm mục tiêu dưới số thực nhận hoặc đổi
  mục đích sử dụng phần dư bắt buộc giải trình công khai và ghi revision.
- Hoãn/hủy dự án hoặc một đợt phải ghi lý do, xử lý contribution đang chờ và thông báo người
  bị ảnh hưởng; Admin tạm dừng không làm mất dữ liệu/audit.
- Contributor chọn công khai nickname/avatar hoặc ẩn danh. Public projection che số điện thoại,
  địa chỉ chi tiết, giấy tờ, số tài khoản/chứng từ nhạy cảm và dữ liệu beneficiary cần bảo vệ.
- Không cho hoàn tất dự án khi còn contribution/giao nhận chưa đối soát, hạng mục còn mở, phần
  dư chưa giải trình, báo cáo tài chính bắt buộc chưa có sao kê hoặc khiếu nại nghiêm trọng
  chưa được xử lý.
- Upload/check-in/cập nhật tại sự kiện phải idempotent để retry hoặc đồng bộ sau mất mạng không
  tạo bản ghi, quota hay điểm trùng.

## 4. API đề xuất

Đặt dưới `/api/v1/charity-campaigns` (theo controller hiện có). Body bọc dưới khoá resource,
khai đủ mã lỗi (INVARIANTS §6).

| Method | Path | Mục đích |
| --- | --- | --- |
| `POST` | `/` | Tạo (mở rộng body: lời kêu gọi, `callToActions`, `submit` true/false cho nháp) |
| `PATCH` | `/:id` | Sửa kế hoạch; sau duyệt ghi revision |
| `POST` | `/:id/submit` | Gửi duyệt bản nháp |
| `PUT` | `/:id/parties` · `/:id/team` · `/:id/phases` · `/:id/bank-accounts` | Thay danh sách theo từng nhóm |
| `GET` | `/:id/workspace` | Organizer/Admin đọc dashboard, draft và dữ liệu nội bộ |
| `GET` | `/:id/public` | Projection công khai, không lộ field nội bộ |
| `PATCH`/`POST` | `/:id/sections/:sectionKey` · `/:id/sections/:sectionKey/publish` | Lưu/publish từng mục A/B/C/D |
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
| `POST`/`DELETE` | `/:id/follow` | Quan tâm/bỏ quan tâm |
| CRUD | `/:id/funding-needs` · `/:id/item-needs` · `/:id/volunteer-needs` · `/:id/other-support-needs` | Các nhóm nhu cầu |
| `POST` | `/:id/participations/:participationId/check-in` | BTC xác nhận check-in và mở quyền media sự kiện |
| `GET`/`PUT` | `/:id/financial-report` | Báo cáo tài chính và sao kê bắt buộc |
| `GET` | `/:id/public-stats` · `/:id/internal-stats` | Thống kê theo đúng visibility |
| `GET` | `/:id/export.pdf` | Bản in PDF theo snapshot |
| `POST` | `/:id/share-links` | Tạo deep link công khai cho dự án/section |
| `POST` | `/:id/appeals` | Gửi khiếu nại đánh giá/giá trị xác nhận (§3.16) |
| `GET`/`PATCH` | `/:id/appeals` · `/:id/appeals/:appealId` | Ban tổ chức xem/xử tầng 1; người khiếu nại chấp nhận hoặc chuyển tầng 2 |
| `GET`/`PATCH` | `/admin/charity-appeals` · `/admin/charity-appeals/:appealId` | Admin xử tầng 2 |
| `PATCH` | `/admin/charity-campaigns/:id/limits` | Admin ghi đè số tài khoản nhận tiền và các trần riêng cho một dự án |

`GET /api/v1/campaigns/:idOrSlug` cũ giữ tương thích và trỏ về public projection. Public trả
`operationStage`, section đã publish, các nhóm nhu cầu với số trong app/ngoài app/còn thiếu,
`counters`, `isFollowing` và public capabilities. `workspace` mới trả thêm draft, parties,
team, phases, bank accounts, changed fields và capabilities organizer (`canEditPlan`,
`canAdvanceStage`, `canPost`, quota media, `canEvaluate`, `canExportPdf`, `canShare`). App hiển
thị theo capabilities, không tự suy luận theo rank.

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
| 1 ✅ | §3.1 hồ sơ/nháp/custom form, §3.2 stage, §3.11 ba nhóm nhu cầu, §3.12 workspace/public | Dashboard organizer, public detail và form A |
| 2 ✅ | §3.3 revisions, §3.4 checklist, §3.7 tương tác/thống kê, §3.8 báo cáo, §3.13 PDF/share | Changelog, tab B, CTA và công cụ chia sẻ |
| 3 ✅ | §3.5 timeline + media/quota/event contributor, §3.15 realtime | Tab C và cập nhật sự kiện |
| 4 ✅ | §3.6 tổng kết/tài chính, §3.9 điểm + trần, §3.16 khiếu nại, §3.17 nickname, §3.14 Home promotion | Tab D, sổ điểm, khiếu nại và card Home |
| 5 | Quyết định 05/11 (§7.2): tham gia độc lập với đóng góp, check-in thay quyền cộng tác viên sự kiện, trạng thái đăng ký đầy đủ, điểm media 3/2, người nhận nhắc 48 giờ, hỗ trợ mở (§3.11), hoãn/chuyển giai đoạn thủ công (§3.2), checklist sẵn sàng (§3.4), các trường hợp vận hành §3.18 | Tham gia không cần ủng hộ, check-in tại sự kiện, nhu cầu hỗ trợ mở |

Mỗi đợt: migration + entity + repository + use case + spec, cập nhật `DATA-MODEL.md`,
`ROADMAP.md`, `README.md` của package và `docs/API.md` trong cùng PR (quy tắc docs/plan).

## 7. Quyết định đã chốt

### 7.1 Chủ dự án, 04/11/2026

| # | Câu hỏi | Quyết định |
| --- | --- | --- |
| 1 | Nhãn 4 mục A/B/C/D | Backend chọn: **Kế hoạch · Triển khai · Sự kiện trao · Tổng kết**; khoá `PLAN`/`EXECUTION`/`EVENT`/`SUMMARY`. Đổi chữ hiển thị sau không cần migration |
| 2 | Lưu nháp | **Có** — `submitted_at` (§3.1) |
| 3 | Cấu hình duyệt | Ở **Admin**: capability `PUBLISH_CHARITY_WITHOUT_REVIEW` gán theo hạng, Admin chỉnh qua `POST /admin/entitlements` (đã có) |
| 4 | Số tài khoản nhận tiền | **Admin cấu hình được** cho các dự án: mặc định toàn hệ thống + ghi đè từng dự án (§3.1) |
| 5 | Bên thụ hưởng | **Gộp** về `campaign_parties` (`BENEFICIARY`) (§3.1) |
| 6 | Quota ảnh/clip | Tính **theo dự án** (5 clip + 5 ảnh / người / ngày / dự án, Admin chỉnh) (§3.5) |
| 7 | Realtime tab C | **Realtime**, với sáu biện pháp kiểm soát ở §3.15 |
| 8 | Điểm | Trần **Admin cấu hình** theo ngày/dự án/chu kỳ (§3.9); khiếu nại hai tầng ở §3.16 |
| 9 | Nickname công khai | **Phương án C** — cài đặt chung làm mặc định + chọn tại từng lần (§3.17) |

### 7.2 Product, 05/11/2026

- Contribution và participation độc lập; bỏ điều kiện `hasSupported → canJoin`.
- Hỗ trợ mở bổ sung chuyến xe/phương tiện, công sức, kỹ năng/dịch vụ và các loại khác mà không
  thay thế form tiền/hiện vật/nhân lực của khách.
- Media: 3 điểm/clip, 2 điểm/ảnh; quota 5 clip + 5 ảnh/người/ngày/dự án; participant phải được
  BTC xác nhận và check-in, không cần có contribution.
- Duyệt lần đầu giữ capability `PUBLISH_CHARITY_WITHOUT_REVIEW`; Mobile không suy theo tên rank.
- B→C tự chuyển theo lịch nhưng Owner/BTC được hoãn, chuyển sớm hoặc chuyển thủ công có lý do.
- Field sửa sau duyệt tô đỏ ở cả workspace và public projection; chỉ revision đã publish được public.
- `completion_score` 0–100% trực tiếp quyết định tối đa 100 điểm participant.
- Vai trò phân công vừa có thể là mô tả cá nhân/tổ chức, vừa liên kết tài khoản Chân Tâm; liên
  kết không tự cấp quyền BTC.
- Quyền hệ thống giữ đơn giản: Owner/BTC quản trị; contributor/participant thao tác dữ liệu của
  mình; viewer tương tác public; Admin giám sát/can thiệp.

### 7.3 Còn mở

1. **Clip**: độ dài tối đa và thời hạn được đăng ảnh/clip sau khi sự kiện kết thúc (dung lượng
   tạm theo giới hạn video 25 MB của storage).
