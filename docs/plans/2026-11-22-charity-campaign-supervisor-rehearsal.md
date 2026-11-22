# CR chiến dịch từ thiện — giám sát viên, tổng duyệt, đơn vị nhận, bỏ đợt trao và bảng tin điểm

> Trạng thái: **đã chốt (22/11/2026, §12), chờ triển khai**. Đối chiếu với `main`
> `9bfd4a2d`. Tài liệu này điều chỉnh
> [`2026-11-20-campaign-intake-and-distribution.md`](./2026-11-20-campaign-intake-and-distribution.md)
> (PR #55): **bỏ quyết định §6.1 "mỗi đợt một hình thức"** vì không còn cơ chế đợt trao.

## Tóm tắt thay đổi

| # | Yêu cầu | Loại thay đổi |
| --- | --- | --- |
| 1 | Bảng tin biến động điểm cho app, cập nhật bằng polling | API mới |
| 2 | Thay `badgeName` bằng hệ số tăng điểm 0/20/50/100%, Admin duyệt | Schema + tính điểm |
| 3 | Nhiều địa điểm tiếp nhận; địa điểm trao gắn với từng đơn vị nhận; chỉ để hiển thị | Bảng mới + cột trên đơn vị nhận |
| 4 | Tách thời gian tiếp nhận, thời gian trao dự kiến, thời gian kết thúc | API tạo/sửa + ràng buộc |
| 5 | Vai trò giám sát viên, đăng ký như tuyển công sức, không có quyền riêng | Vai trò mới |
| 6 | Chi tiết chiến dịch trả thông tin người tạo | Bổ sung response |
| 7 | API public danh sách người tham gia, quyên góp, giám sát | API mới |
| 8 | Bước tổng duyệt trước sự kiện trao, chặn khi chưa xong | Giai đoạn mới |
| 9 | Bỏ cơ chế trao theo đợt | Gỡ tính năng |
| 10 | Nhiều đơn vị nhận kèm số suất/tiền ước tính; số lượng vật phẩm ≥ tổng số suất | API tạo + ràng buộc |

## 1. Bảng tin biến động điểm

**Hiện tại.** Admin dùng `GET /admin/system-logs?logType=POINT` (quyền `audit.read`). Endpoint
này đọc thẳng `point_ledger` và trả `subjectUserId`, `subjectUsername`, `action` (mã rule),
`resourceId` (`reference_id`), `detail` (`reason`). User chỉ có `GET /points/me/ledger` cho
sổ điểm của chính mình.

**Không mở thẳng endpoint Admin ra public**, vì nó lộ:

- `reason` của điều chỉnh tay và phạt, ví dụ lý do trừ điểm do vi phạm;
- `reference_id` trỏ tới giao dịch, báo cáo, đơn đổi quà;
- toàn bộ loại log khác (`ADMIN`, `RANK`, `TRANSACTION`) chỉ bằng cách đổi `logType`.

**Đề xuất: endpoint mới cùng cơ chế, chỉ đọc `point_ledger`.**

`GET /points/feed?afterId=&limit=` (Bearer, không cần quyền Admin)

| Trường | Ghi chú |
| --- | --- |
| `entryId` | Tăng dần, dùng làm con trỏ polling |
| `user` | `{ userId, nickname, avatarUrl, rank }`, dùng lại `public-author.dto.ts` |
| `delta` | Số điểm được cộng |
| `ruleTitle` | Tên rule hiển thị (ví dụ "Hoàn tất trao tặng"), không trả mã nội bộ |
| `occurredAt` | |
| `context` | Tuỳ chọn: tiêu đề chiến dịch/bài đăng **đã công khai** liên quan; không có thì `null` |

`GET /users/:userId/points/feed?afterId=&limit=`: cùng format, lọc một user, kèm `balance`
và `lifetime` hiện tại để app hiện số điểm "chạy" liên tục trên hồ sơ user.

Quy tắc lọc:

- Chỉ bút toán **cộng điểm** (`delta > 0`) từ rule kiếm điểm. Loại trừ điều chỉnh tay của Admin,
  hoàn bút toán, phạt và tiêu điểm đổi quà.
- Tôn trọng riêng tư: thêm `users.show_in_public_point_feed` (mặc định `true`, đọc/ghi qua
  `GET/PATCH /profile/me` như `showOnlineStatus`). User tắt thì không xuất hiện trong feed chung,
  và feed theo user trả 404 cho người khác.
- User bị khoá/ẩn không xuất hiện.
- **Ngưỡng hiển thị do Admin cấu hình:** khoá `system_configs` `point.feed_min_delta`
  (INTEGER, mặc định đề xuất 10). Chỉ bút toán có `delta ≥ ngưỡng` vào feed chung. Không giới
  hạn theo hạng (chốt 22/11): ngưỡng điểm đã đủ lọc các khoản nhỏ như điểm danh. Feed theo một
  user (`/users/:userId/points/feed`) không áp ngưỡng.
- Điểm thưởng hệ số chiến dịch (§2) gộp với điểm gốc cùng sự kiện thành **một dòng** feed
  (`delta` = tổng, kèm `bonusPercent`) để bảng tin không hiện hai dòng cho một lần nhận.

Hiển thị trên app: bảng chạy liên tục "**A** vừa nhận **+X điểm** · Hoàn tất trao tặng".

Polling:

- Lần đầu không truyền `afterId`, nhận `limit` bút toán mới nhất (mặc định 20, tối đa 50).
- Các lần sau truyền `afterId = entryId lớn nhất đã có`. Backend chỉ trả bản ghi mới hơn, sắp
  tăng dần. Không có gì mới thì trả `entries: []` kèm `latestId` (không lỗi).
- Response có `pollAfterSeconds` (khoá cấu hình `point.feed_poll_seconds`, mặc định 15). App
  dùng giá trị này thay vì hard-code, để Admin giảm tải khi cần.
- Cache Redis kết quả "mới nhất" theo `afterId` trong vài giây. Rate limit theo user.
- Cần index `point_ledger (entry_id)` (khoá chính đã có) và `(user_id, entry_id)`.

Cảm giác "realtime" khi dùng polling:

- Polling **không** đẩy từng điểm tức thì; mỗi lượt hỏi trả một lô bút toán mới. Để bảng chạy
  đều, app **đưa lô vào hàng đợi rồi nhả từng dòng** cách nhau `displayIntervalMs` (server trả,
  mặc định 2000 ms, khoá `point.feed_display_interval_ms`). Lô 8 dòng trong 15 giây hiện ra như
  8 sự kiện liên tiếp.
- Hàng đợi quá dài (hệ thống đông) thì app bỏ bớt dòng cũ, chỉ giữ tối đa `limit` dòng mới nhất,
  để bảng không trễ quá xa thời gian thật.
- Không có gì mới: app giữ dòng cuối, không quay lại hiện dòng cũ.
- App dừng polling khi màn không hiển thị hoặc ở nền.

**Vì sao chọn polling, không chọn WebSocket ở đợt này.** Bảng tin chung là cùng một dữ liệu cho
mọi user, nên một lượt polling được cache Redis vài giây phục vụ được cả nghìn client với một
truy vấn. Trễ 10–15 giây không ảnh hưởng mục đích tạo động lực. Repo đã có Socket.IO + Redis
adapter (`/charity`, `/chat`). Nếu sau này cần đẩy tức thì, thêm namespace `/points` phát
sự kiện `point.credited` sau khi ghi `point_ledger`, giữ nguyên format dòng feed. App dùng
socket khi kết nối được và quay về polling khi mất kết nối.

## 2. Hệ số tăng điểm thay `badgeName`

- Thêm `campaigns.point_bonus_percent smallint NOT NULL DEFAULT 0 CHECK (IN (0, 20, 50, 100))`.
- Áp cho **cả người đóng góp và người tham gia** (gồm giám sát viên): điểm thực nhận
  = điểm gốc × (100 + `point_bonus_percent`) / 100, làm tròn xuống. Áp ở bước tính đích điểm
  trong `charity-points.repository.ts` / `campaign_point_awards`, để phần chênh lệch cũng đi qua
  trần điểm ngày như điểm gốc.
- Ghi phần thưởng thêm thành **bút toán riêng** (rule mới `CHARITY_CAMPAIGN_BONUS`) để sổ điểm
  và bảng tin (§1) đọc được rõ "điểm gốc + thưởng chiến dịch".
- **Admin duyệt hệ số cùng bước duyệt chiến dịch.** Owner chỉ đề xuất
  (`requestedPointBonusPercent`). Hệ số có hiệu lực là giá trị Admin chốt khi duyệt. Sửa hệ
  số sau khi duyệt thì đưa chiến dịch về chờ duyệt như sửa nội dung khác. Admin có quyền hạ
  hệ số khi duyệt.
- Điểm đã ghi không tính lại khi hệ số đổi. Hệ số áp theo giá trị **tại thời điểm ghi điểm**.
- `badgeName`: bỏ bắt buộc ở API tạo/sửa, vẫn trả trong một bản phát hành (deprecated), rồi gỡ
  cột. Không ánh xạ giá trị cũ sang hệ số, dữ liệu cũ nhận `0`.

## 3. Địa điểm tiếp nhận và địa điểm trao tặng

Mục đích là **hiển thị** cho người xem biết mang đồ tới đâu và chiến dịch sẽ trao ở đâu (chốt
22/11). Hiện cả backend và app đều chỉ có **một** địa điểm (`campaigns.location` +
`location_label`).

### 3.1 Địa điểm tiếp nhận: danh sách riêng

Bảng `campaign_intake_locations`:

| Cột | Ghi chú |
| --- | --- |
| `campaign_id`, `position` | Thứ tự hiển thị |
| `label`, `address` | Tên điểm và địa chỉ |
| `location geography` | Toạ độ, nullable |
| `schedule_note` | Text tự do, ví dụ "8h–17h hằng ngày", nullable |
| `contact_name`, `contact_phone` | Người liên hệ của BTC tại điểm, nullable |

API tạo/sửa nhận `intakeLocations[]`, tối thiểu 1 điểm, tối đa theo khoá
`charity.max_intake_locations` (đề xuất 10). Sửa là thay cả danh sách (PUT), như
`PUT :id/media`. Chi tiết và trang public trả danh sách theo thứ tự.

Tìm kiếm gần đây / Map Discovery: giữ `campaigns.location`, backend tự đồng bộ bằng toạ độ của
**điểm tiếp nhận đầu tiên** có toạ độ. `locationLabel/lat/lng` cũ giữ làm alias một bản phát
hành, ánh xạ vào điểm này.

### 3.2 Địa điểm và ngày giờ trao: gắn với từng đơn vị nhận

Không có danh sách địa điểm trao riêng. **Mỗi đơn vị nhận (§10) là một điểm trao**: địa điểm
trao chính là **`address` đã có sẵn** của đơn vị trong `campaign_parties` (chốt 22/11). Chiến
dịch có bao nhiêu đơn vị thì có bấy nhiêu điểm trao, không phải nhập hai lần.

Chỉ thêm vào `campaign_parties` (role `BENEFICIARY`):

| Cột | Ghi chú |
| --- | --- |
| `location geography` | Toạ độ của `address`, nullable, để app mở bản đồ/chỉ đường |
| `distribution_at timestamptz` | Ngày giờ trao dự kiến cho đơn vị đó |

Quy tắc:

- Khi gửi duyệt, mỗi đơn vị bắt buộc có `address` và `distributionAt`.
- `distributionAt` phải nằm trong khung trao dự kiến của chiến dịch
  (`distributionStartsAt ≤ distributionAt ≤ distributionEndsAt`, §4). Sai thì trả
  `CHARITY_BENEFICIARY_DISTRIBUTION_TIME_OUT_OF_RANGE`.
- Đổi khung trao của chiến dịch làm một đơn vị nằm ngoài khung thì **từ chối** và trả danh sách
  đơn vị cần sửa giờ. Backend không tự dời giờ hộ owner.
- Trao ở chỗ khác địa chỉ đơn vị (ví dụ trao tại UBND xã): owner ghi địa chỉ điểm trao vào
  `address`. Không thêm trường địa chỉ thứ hai.
- Hiển thị điểm trao theo `distributionAt` tăng dần, cùng giờ thì theo thứ tự đơn vị
  (`sort_order`). App hiện như lịch trình: "20/12 08:00 — Trường A, xã X".

Không có checklist, trạng thái hay timeline theo từng đơn vị. Ngày giờ trao chỉ để hiển thị
(§3.3); nhắc 48 giờ vẫn tính theo mốc trao của cả chiến dịch.

### 3.3 Chỉ để hiển thị

- Địa điểm **không** có trạng thái, checklist, timeline, phân công người tham gia hay phân bổ
  đóng góp riêng. Owner không phải cập nhật tiến độ theo từng điểm.
- Nhiều điểm trao vẫn là **một lần đi trao xuyên suốt**. Timeline, tổng duyệt, bằng chứng và
  tổng kết tính cho cả chiến dịch.
- Đóng góp **không** bắt buộc chọn điểm tiếp nhận. `dropoffAddress` theo từng vật phẩm (đã có)
  giữ nguyên cho trường hợp một món phải mang tới chỗ riêng.
- Bằng chứng trao có thể ghi kèm tên đơn vị để người xem dễ theo dõi, nhưng không bắt buộc và
  không ảnh hưởng điều kiện hoàn tất.

### 3.4 Riêng tư

- Địa điểm tiếp nhận, và địa chỉ + ngày giờ trao của đơn vị `GROUP` (trường, thôn, trung tâm…)
  là thông tin **công khai**.
- Đơn vị `INDIVIDUAL` (một người, một hộ): `address` là **nhà riêng**. Public chỉ trả tên đơn vị,
  cấp xã/huyện và `distributionAt`, không trả số nhà/toạ độ. Bản đầy đủ chỉ trả qua workspace như
  PR #55 §3.4.
- `contact_phone` của điểm tiếp nhận chỉ nên là số của BTC.

## 4. Thời gian

Ba khung độc lập, đều nhận thẳng ở API tạo/sửa:

| Khung | Trường API | Ý nghĩa |
| --- | --- | --- |
| Tiếp nhận | `intakeStartsAt`, `intakeEndsAt` | Thời gian nhận quyên góp và đăng ký |
| Trao tặng dự kiến | `distributionStartsAt`, `distributionEndsAt` | Ghi vào bước `DISTRIBUTION` của tiến độ |
| Kết thúc chiến dịch | `endTime` (giữ nguyên) | Mốc dự kiến sau tổng kết |

Ràng buộc:

- `intakeStartsAt < intakeEndsAt ≤ distributionStartsAt < distributionEndsAt ≤ endTime`.
- `intakeDeadline` của từng nhu cầu ≤ `intakeEndsAt`.
- **Chiến dịch chỉ kết thúc khi Tổng kết đã công khai.** Đến `endTime` mà chưa công khai
  tổng kết thì chiến dịch **không tự đóng**: vẫn ở giai đoạn `SUMMARY`, nhắc owner, và Admin
  thấy trong danh sách quá hạn. Job `charity:advance-stage` và logic đóng theo `end_time` cần
  sửa theo quy tắc này.
- Sau `intakeEndsAt` backend chặn đóng góp/đăng ký mới (trừ giám sát viên, xem §5).
- Dữ liệu cũ: `intakeStartsAt = start_time`, `intakeEndsAt = PREPARATION.ends_at` nếu có, nếu
  không thì `DISTRIBUTION.starts_at`.

## 5. Giám sát viên

Giám sát viên **chỉ là một vai trò** trong chiến dịch (chốt 22/11): không có quyền xem thêm, không
duyệt, không chặn chuyển giai đoạn. Luồng chuyển giai đoạn của owner giữ nguyên như hiện tại.

- Thêm `role` vào `campaign_volunteer_needs` (`VOLUNTEER` | `SUPERVISOR`), dùng lại luồng đăng
  ký/xác nhận đã có (`POST /:id/volunteer-needs/:id/registrations`, `…/confirm`): user đăng ký,
  BTC xác nhận, check-in như người tham gia công sức.
- `minimumParticipants` đổi thành `minimumSupervisors`. Khi tạo chiến dịch, backend tự tạo một
  nhu cầu `SUPERVISOR` với `targetQuantity = minimumSupervisors` (0 thì không tạo).
- **`minimumParticipantRank` áp cho giám sát viên**, đổi tên thành `minimumSupervisorRank`.
  Kiểm tra ở bước đăng ký, đọc hạng từ database như hiện tại.
- Giám sát viên không được đồng thời là owner/coordinator của chính chiến dịch đó.
- Giám sát viên được hưởng điểm và hệ số tăng điểm (§2) như người tham gia.
- Tổng kết hiện `số giám sát viên đã xác nhận / minimumSupervisors`. Thiếu chỉ là cảnh báo,
  không chặn.
- Migration: `minimumParticipants` cũ chuyển thành `minimumSupervisors`,
  `minimumParticipantRank` thành `minimumSupervisorRank`. Đều là data test nên không cần giữ
  ngữ nghĩa cũ.

## 6. Thông tin người tổ chức trong chi tiết

`GET /charity-campaigns/:idOrSlug` và `GET /:idOrSlug/public` hiện chỉ trả `createdBy` (uuid).
Thêm `organizer: { userId, nickname, avatarUrl, rank, verified }` lấy từ user tạo chiến dịch,
dùng lại `public-author.dto.ts`. Không trả SĐT/email.

## 7. API public danh sách thành viên

Hiện tại danh sách đầy đủ chỉ dành cho BTC (`GET /:id/participations`, `GET /:id/contributions`);
public chỉ có mảng nickname tối đa 200, không phân trang, không avatar.

`GET /charity-campaigns/:idOrSlug/members?type=CONTRIBUTOR|PARTICIPANT|SUPERVISOR&cursor=&limit=`
(không cần đăng nhập)

- Mỗi dòng: `user` (hồ sơ ngắn như §6), `joinedAt`. Với `CONTRIBUTOR`, thêm loại đóng góp
  (`MATERIAL` | `MONEY` | `SERVICE`) nhưng **không** trả số tiền hay số lượng.
- Chỉ người đã chọn hiện tên (`show_name_publicly`, §3.17 tài liệu vòng đời). Response kèm
  `anonymousCount` cho số người còn lại.
- Chỉ tính đóng góp đã được BTC chấp nhận và người tham gia/giám sát đã được xác nhận. Không trả
  người đã huỷ hoặc bị từ chối.
- Chiến dịch chưa công khai trả 404.

## 8. Bước tổng duyệt (rehearsal)

- Thêm `REHEARSAL` vào tiến độ: `PLANNING → PREPARATION → REHEARSAL → DISTRIBUTION →
  REPORTING`. Bước này có thời gian, người phụ trách, ghi chú.
- Checklist chốt thông tin (chuyển từ checklist sẵn sàng của đợt trao): người nhận, hiện vật/tiền
  đã đủ, phương tiện, nhân sự, giám sát viên, địa điểm/thời gian trao, liên hệ địa phương. Mỗi
  mục `DONE`/`NOT_DONE` + ghi chú.
- Tổng duyệt kết thúc với trạng thái `READY` hoặc `NOT_READY` kèm lý do.
- **Chặn:** chỉ chuyển sang Sự kiện trao khi tổng duyệt `READY`. Lỗi mới
  `CHARITY_REHEARSAL_NOT_READY`.
- Nhắc 48 giờ chuyển sang mốc bắt đầu tổng duyệt và mốc trao.
- Dữ liệu cũ (data test): thêm bước `REHEARSAL` rỗng, không chặn chiến dịch đã qua giai đoạn
  trao.

## 9. Bỏ cơ chế trao theo đợt

Lý do (chốt 22/11): quản lý nhiều đợt quá nặng cho BTC (mỗi đợt có timeline, checklist,
phân công người tham gia và phân bổ đóng góp riêng) và làm tăng độ phức tạp hệ thống. Hiện chưa
có dữ liệu thật (chỉ data test), nên **gỡ hẳn** thay vì giữ tương thích:

- Hình thức trao, địa điểm, thời gian và chi tiết riêng tư (PR #55 §3.2) chuyển về cấp chiến
  dịch: `campaigns.distribution_method` và bảng `campaign_distribution_private_details` (1-1).
  Mỗi chiến dịch **một** hình thức trao.
- Gỡ API `/:id/rounds*`, `/:id/round-assignments`, `GET /:idOrSlug/rounds` và DTO liên quan.
- Gỡ cột `round_id` ở `campaign_participations`, `campaign_deliveries`, `campaign_event_steps`;
  gỡ `campaign_distribution_rounds`, `campaign_round_private_details`.
  Unique index timeline quay về `(campaign_id, step_key)`.
- Điều kiện hoàn tất của đợt (bằng chứng theo hình thức) chuyển thành điều kiện hoàn tất bước
  `DISTRIBUTION` của chiến dịch.
- Migration xoá data test của đợt trao. Seed `full/charity-project.ts` cập nhật theo.
- Cập nhật API.md, DATABASE.md, API-ROUTES.md, tài liệu vòng đời §3.18 (đánh dấu đã bỏ "nhiều
  đợt trao").

## 10. Đơn vị nhận, số suất và số lượng vật phẩm

Đơn vị nhận và bên thụ hưởng là **một khái niệm** (`campaign_parties` role `BENEFICIARY`).

**Hiện tại.** `POST /charity-campaigns` chỉ nhận **một** `beneficiary`, và chỉ cho
`INDIVIDUAL_APPEAL` + `beneficiaryRelation = OTHER`. Loại `ORGANIZED_CAMPAIGN` gửi
`beneficiary` thì bị `CharityBeneficiaryNotApplicableException`. Organizer chỉ nhập được sau
qua `PUT /:id/parties`. Nhu cầu tiền có thêm `receivingUnit` dạng text tự do.

**Đơn vị nhận.**

- API tạo/sửa nhận `beneficiaries[]` cho `ORGANIZED_CAMPAIGN`: `name`, `beneficiaryKind`
  (`INDIVIDUAL` | `GROUP`), `address`, `phone`, `picName`, `picPhone`, `consentStatus`, và hai
  trường mới:
  - `estimatedPortions` (số nguyên ≥ 0): số suất quà ước tính cho đơn vị;
  - `estimatedAmount` (VNĐ, ≥ 0): số tiền ước tính cho đơn vị.
- Lưu ở `campaign_parties` (thêm cột `estimated_portions`, `estimated_amount`). Tối đa theo
  khoá cấu hình `charity.max_beneficiaries_per_campaign` (đề xuất 20).
- `INDIVIDUAL_APPEAL` giữ nguyên luồng một người thụ hưởng hiện tại, nhận thêm hai trường trên.
- Read model trả `totalEstimatedPortions` = tổng `estimatedPortions` và `totalEstimatedAmount`
  = tổng `estimatedAmount` của các đơn vị.

**Số lượng vật phẩm là tổng số lượng ước tính.** Danh mục vật phẩm ở cấp chiến dịch, dùng chung
cho mọi đơn vị (không tách dòng theo đơn vị). Mỗi vật phẩm có số lượng tối thiểu tính từ tổng số
suất:

```
minimumQuantity = totalEstimatedPortions × quantityPerPortion
targetQuantity  ≥ minimumQuantity
```

- `quantityPerPortion` là trường mới trên `campaign_need_items`, mặc định `1`. Ví dụ mỗi suất
  có 1 áo, 1 quần, 5 kg gạo thì nhập 1, 1, 5.
- Ví dụ: đơn vị A ước tính 200 suất, B 100 suất, tổng 300. Danh mục có áo và quần (mỗi suất 1
  chiếc) thì `targetQuantity` của áo **tối thiểu 300**, quần **tối thiểu 300**. Gạo 5 kg/suất
  thì tối thiểu 1.500 kg.
- `totalEstimatedPortions = 0` thì không áp ràng buộc.
- Nhập thiếu: trả `CHARITY_NEED_BELOW_ESTIMATED_PORTIONS` kèm `minimumQuantity` cho từng dòng.
  App hiện ngay số tối thiểu bên cạnh ô nhập, và có thể điền sẵn giá trị này.
- Kiểm tra cả hai chiều:
  - tạo/sửa vật phẩm thì so với tổng số suất hiện tại;
  - sửa `estimatedPortions` của đơn vị làm tổng tăng mà vật phẩm không còn đủ thì **từ chối**,
    trả danh sách vật phẩm cần tăng. Không tự tăng `targetQuantity` hộ owner.
- Giảm mục tiêu vật phẩm vẫn theo quy tắc cũ (giải trình phần dư), nhưng không được thấp hơn
  `minimumQuantity`.
- Response vật phẩm trả thêm `quantityPerPortion` và `minimumQuantity`.

**Tiền.** Tổng `targetAmount` của các nhu cầu tiền phải ≥ `totalEstimatedAmount`, cùng logic
với vật phẩm. Thiếu thì trả `CHARITY_FUNDING_BELOW_ESTIMATED_AMOUNT`. Nhu cầu tiền bỏ
`receivingUnit` text; `beneficiaryPartyId` (đã có) dùng khi một khoản tiền dành riêng cho một
đơn vị.

**Dịch vụ/công sức** không có ràng buộc theo số suất.

**Phân bổ và tổng kết.** Khi trao, mỗi đơn vị nhận đúng số suất ước tính của mình. Tổng kết hiện
theo từng đơn vị: số suất đã trao / ước tính, số tiền đã chuyển / ước tính. Phần vật phẩm dư
(nhận nhiều hơn mức tối thiểu) dùng giải trình phần dư đã có.

**Form tạo chiến dịch tổ chức** (mobile/Admin): nhập danh sách đơn vị nhận kèm số suất và số tiền
ước tính trước, form hiện tổng số suất và tổng tiền. Sau đó ở tab Hiện vật, mỗi dòng có ô "số
lượng mỗi suất" và hiện số tối thiểu. Ở tab Tiền, form hiện tổng tiền ước tính cần đạt.

**Public:** chỉ trả tên, loại đơn vị, số suất và số tiền ước tính. SĐT, địa chỉ cá nhân là riêng
tư như PR #55 §3.4.

## 11. Phạm vi theo đội

**Backend:** migration và API theo §1–§10; error code mới; Swagger; API.md, DATABASE.md,
API-ROUTES.md, CONFIG-INVENTORY.md (các khoá `point.feed_poll_seconds`, `point.feed_min_delta`,
`point.feed_display_interval_ms`, `charity.max_beneficiaries_per_campaign`,
`charity.max_intake_locations`); seed; test.

**Admin (FE):** duyệt hệ số điểm khi duyệt chiến dịch; danh sách đơn vị nhận kèm số suất/số
tiền ước tính; gỡ màn đợt trao.

**Mobile (`next-ai-app`):**

- Form tạo:
  - thay "Huy hiệu" bằng chọn hệ số 0/20/50/100%;
  - danh sách địa điểm tiếp nhận (thêm/xoá/sắp xếp nhiều điểm);
  - ba khung thời gian;
  - số giám sát viên tối thiểu và hạng tối thiểu của giám sát viên;
  - danh sách đơn vị nhận, mỗi đơn vị có địa chỉ (cũng là địa điểm trao), ngày giờ trao, số
    suất và số tiền ước tính;
  - vật phẩm có "số lượng mỗi suất" và kiểm tra số lượng tối thiểu.
- Màn chi tiết: hiển thị thông tin người tổ chức; danh sách thành viên theo ba tab.
- Workspace:
  - bước tổng duyệt;
  - đăng ký/xác nhận giám sát viên (dùng lại màn tuyển công sức);
  - gỡ màn đợt trao (`workspace_round_distribution.dart`, `workspace_support_rounds.dart`).
- Bảng tin điểm: polling theo `pollAfterSeconds`, dừng khi app ở nền.

## 12. Quyết định đã chốt (22/11/2026)

1. Giám sát viên **chỉ là một vai trò**: không có quyền xem thêm, không duyệt chuyển giai đoạn.
2. Giám sát viên **được** hưởng hệ số tăng điểm như người tham gia.
3. Bảng tin điểm không giới hạn theo hạng. Admin cấu hình **số điểm tối thiểu** để một dòng
   được hiện (`point.feed_min_delta`, §1).
4. Mỗi đơn vị nhận có số suất và số tiền ước tính. Số lượng từng vật phẩm ≥ tổng số suất ×
   số lượng mỗi suất (§10).

5. Tổng mục tiêu các nhu cầu tiền ≥ tổng số tiền ước tính của các đơn vị (§10).
6. **Bỏ hẳn cơ chế trao theo đợt** (§9): quản lý nhiều đợt quá nặng cho BTC và làm tăng độ
   phức tạp hệ thống. Mỗi chiến dịch có **một lần đi trao xuyên suốt** và một hình thức trao.
   Lần trao đó đi qua địa điểm trao của **từng đơn vị nhận** (§3.2), nhưng điểm trao chỉ là thông tin, không có
   trạng thái hay quy trình riêng. Không làm lại "nhiều đợt" dưới tên khác (ví dụ tiến độ, checklist
   hay phân công theo từng điểm trao).

## 13. Tiêu chí nghiệm thu

- App polling bảng tin điểm, chỉ nhận bút toán mới. Không lộ lý do phạt, điều chỉnh tay hay
  `reference_id`. User tắt hiện công khai thì không xuất hiện.
- Bảng tin chung không hiện bút toán dưới `point.feed_min_delta`.
- Hệ số tăng điểm chỉ có hiệu lực sau khi Admin duyệt. Người đóng góp, người tham gia và giám sát
  viên đều nhận điểm thưởng thành bút toán riêng.
- Tạo chiến dịch với nhiều địa điểm tiếp nhận, nhiều đơn vị nhận mỗi đơn vị có địa chỉ và ngày giờ trao, ba khung thời gian, nhiều đơn vị nhận trong **một** lần gọi.
- Đơn vị A 200 suất + B 100 suất: vật phẩm `quantityPerPortion = 1` nhập dưới 300 bị từ chối,
  nhập 300 được chấp nhận. Tăng số suất của A lên 250 khi áo đang 300 bị từ chối.
- Chiến dịch không tự đóng khi tổng kết chưa công khai.
- Người chưa đủ hạng không đăng ký làm giám sát viên được khi gọi API trực tiếp. Giám sát viên
  không có thêm quyền nào so với người tham gia.
- Không sang Sự kiện trao được khi tổng duyệt chưa `READY`.
- Không còn API, bảng hoặc cột nào về đợt trao.
- `distributionAt` ngoài khung trao dự kiến bị từ chối. Đơn vị `INDIVIDUAL` không lộ số nhà/toạ độ ra
  public.
- Tạo chiến dịch với 3 đơn vị nhận ở 3 địa điểm trao: chỉ có một timeline, một tổng duyệt, một tổng kết; không có API
  cập nhật trạng thái từng điểm.
- Chi tiết chiến dịch có `organizer`. API danh sách thành viên dùng được khi không đăng nhập và
  chỉ trả người cho phép hiện tên.
