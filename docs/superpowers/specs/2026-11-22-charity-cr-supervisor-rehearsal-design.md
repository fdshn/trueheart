# CR chiến dịch từ thiện: giám sát viên, tổng duyệt, đơn vị nhận, bỏ đợt trao, bảng tin điểm — thiết kế triển khai backend

Ngày: 22/11/2026. Nguồn: `docs/plans/2026-11-22-charity-campaign-supervisor-rehearsal.md` (PR #59,
đã merge vào `develop` ở `32a71941`). Gọi tắt là **CR**. Code đối chiếu: `develop` sau merge.
Phần nào không nhắc lại ở đây thì theo đúng CR.

## 1. Mục đích

CR có bốn mục đích:

1. **Tạo động lực.** Bảng tin "A vừa nhận +X điểm", cùng hệ số tăng điểm của chiến dịch được Admin duyệt.
2. **Giảm tải vận hành cho BTC.** Bỏ cơ chế nhiều đợt trao. Mỗi chiến dịch chỉ có một lần đi trao, một
   timeline, một tổng duyệt và một tổng kết.
3. **Kế hoạch trao sát thực tế.** Có đơn vị nhận kèm số suất và tiền ước tính. Số lượng vật phẩm và mục
   tiêu tiền bị ràng buộc theo tổng suất. Có ba khung thời gian.
4. **Minh bạch.** Giám sát viên, bước tổng duyệt chặn việc đi trao khi chưa sẵn sàng, thông tin người tổ
   chức, danh sách thành viên công khai. Vẫn giữ riêng tư cho địa chỉ nhà của cá nhân và lý do bị phạt
   điểm.

**Không làm:**

- Không làm lại "nhiều đợt" dưới tên khác, ví dụ tiến độ, checklist hay phân công theo từng điểm trao (CR §12.6).
- Không đẩy realtime bằng socket cho bảng tin điểm.
- Không cho giám sát viên quyền riêng nào.
- Không tính lại điểm đã ghi khi hệ số đổi.

**Hỏng dù chạy được:**

- lộ số nhà hoặc toạ độ của đơn vị `INDIVIDUAL` ra public;
- lộ lý do phạt, điều chỉnh tay hoặc `reference_id` qua bảng tin điểm;
- chiến dịch đang chạy bị ngắt (ẩn, dừng nhận đóng góp) chỉ vì owner gửi một bản sửa;
- chiến dịch tự đóng khi tổng kết chưa công khai.

## 2. Quyết định chốt với người dùng (22/11)

1. **Giám sát viên nằm trong luồng tham gia** (`campaign_participations`, thêm `role = SUPERVISOR`),
   **không** đặt ở `campaign_volunteer_needs` như CR §5 viết. Lý do: luồng tham gia đã có sẵn
   - chặn hạng;
   - BTC xác nhận;
   - check-in;
   - chấm điểm theo mức hoàn thành;
   - `show_name_publicly`;
   - đếm trong tổng kết.

   Luồng `volunteer-needs` không có những thứ đó.

   Mọi yêu cầu chức năng của CR §5 vẫn giữ nguyên. Khác biệt duy nhất: không có nhu cầu "Giám sát viên"
   tự sinh trong danh sách tuyển công sức. App có nút "Đăng ký làm giám sát viên" riêng.
   `minimumSupervisors` và `minimumSupervisorRank` là trường của chiến dịch.
2. **Sửa sau khi duyệt dùng "bản sửa chờ duyệt".** Chiến dịch vẫn chạy theo bản đã duyệt: vẫn công
   khai, vẫn nhận đóng góp và đăng ký. Admin duyệt thì áp dụng bản sửa, từ chối thì bỏ.
   - **Cần Admin duyệt:**
     - hệ số điểm;
     - tiêu đề, mô tả, ảnh bìa/media;
     - danh sách đơn vị nhận (thêm/bớt đơn vị, số suất, tiền ước tính);
     - loại tiếp nhận.
   - **Áp dụng ngay:**
     - địa điểm tiếp nhận;
     - ba khung thời gian;
     - giờ trao, địa chỉ, toạ độ, liên hệ của từng đơn vị;
     - nhu cầu vật phẩm, tiền, dịch vụ;
     - tiến độ, số và hạng giám sát viên.

     Các thay đổi này vẫn phải qua ràng buộc §5–§6 bên dưới.
3. **Thứ tự triển khai:** 5 đợt, mỗi đợt một commit trên `develop` (§12).

## 3. Quyết định của người viết (đối chiếu code)

### 3.1 Hồ sơ công khai

- `organizer` và các dòng `members` trả `{ userId, username, displayName, avatarUrl, rank }`.
  `displayName` lấy `fullName`, nếu trống thì lấy `username`.
- Code không có `nickname` hay `verified`. CR có nhắc `verified` nhưng chưa có cơ chế xác minh tài khoản,
  nên **bỏ trường này**.
- Dùng lại `toPublicAuthorSummary` (`application/implementations/shared/public-author.ts`), mở rộng thêm
  `userId`.

### 3.2 Nơi lưu các trường mới

- `intakeStartsAt` chính là cột `campaigns.start_time` hiện có (alias). Nhờ vậy list, thứ tự và mọi chỗ
  đang đọc `start_time` không phải sửa.
- Thêm cột `campaigns.intake_ends_at`.
- `distributionStartsAt`/`distributionEndsAt` là khung của phase `DISTRIBUTION` (đã có bảng
  `campaign_phases`).
- `endTime` giữ nguyên.

### 3.3 Khối `distribution` trong body tạo

- Khối này chỉ còn hình thức trao và chi tiết riêng tư.
- Giờ trao chuyển ra các trường top-level `distributionStartsAt`/`distributionEndsAt`.
- `distribution.scheduledStart/End` vẫn nhận làm alias một bản phát hành.

### 3.4 Bằng chứng trao ở cấp chiến dịch

- Thêm `campaigns.distribution_evidence_urls jsonb` (công khai, https, 0–20, không trùng), cùng quy ước
  với cột cũ trên round.
- Mã vận đơn, nội dung chuyển khoản, người nhận và `beneficiary_bank_account_id` nằm ở bảng 1-1
  `campaign_distribution_private_details`. Chỉ workspace đọc bảng này.
- Dùng lại các hàm thuần trong core-lib:
  - `charityDistributionFieldGaps`;
  - `charityDistributionMismatch`;
  - `charityRoundEvidenceGaps` (đổi tên cho đúng nghĩa: không còn "round");
  - `stripInapplicableDistributionFields`.

### 3.5 Điều kiện hoàn tất bước trao

- Chuyển giai đoạn `EVENT → SUMMARY`, kể cả qua job `charity:advance-stage`, cần đủ:
  - bằng chứng đúng hình thức trao;
  - với `BANK_TRANSFER`: tài khoản thụ hưởng đã gắn, còn hiệu lực, cùng chiến dịch và **đã xác thực**
    (luật PR #55 C2, nay ở cấp chiến dịch).
- Thiếu thì chuyển tay trả `CHARITY_ROUND_EVIDENCE_REQUIRED` /
  `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED`. Job thì **bỏ qua** chiến dịch đó và gửi nhắc owner.
- Chiến dịch legacy có hình thức `NULL` không cần bằng chứng.

### 3.6 Tổng duyệt

- Phase mới `REHEARSAL` trong `campaign_phases`, có thời gian, người phụ trách và ghi chú.
- Bảng `campaign_rehearsals` (1-1):
  - checklist jsonb gồm 7 mục theo CR §8, mỗi mục `DONE|NOT_DONE` + ghi chú;
  - `outcome READY|NOT_READY`, `reason`, `decided_by`, `decided_at`.
- Chặn `EXECUTION → EVENT` (cả chuyển tay lẫn job) khi chưa `READY`: trả `CHARITY_REHEARSAL_NOT_READY`.
  Job bỏ qua và nhắc owner.
- Chiến dịch đã qua `EVENT` không bị chặn.

### 3.7 Nhắc 48 giờ

Bỏ nhắc theo đợt. Nhắc theo chiến dịch ở hai mốc, chống trùng theo `campaign + mốc + epoch`:

- bắt đầu tổng duyệt;
- bắt đầu trao.

### 3.8 Đóng chiến dịch

- Đóng (`is_active = false`) chỉ được khi tổng kết **đã công khai**, áp cho cả đóng tay lẫn tự động.
- Hết `endTime` mà chưa công khai: vẫn ở `SUMMARY`, job nhắc owner mỗi ngày.
- Admin có bộ lọc "quá hạn chưa tổng kết" trong danh sách.

### 3.9 Chặn theo thời gian tiếp nhận

- Sau `intakeEndsAt`:
  - chặn đóng góp hiện vật và nhận hỗ trợ dịch vụ mới;
  - chặn đăng ký tham gia vai `PARTICIPANT`.

  Lỗi mới `CHARITY_INTAKE_CLOSED`.
- Giám sát viên vẫn đăng ký được tới `distributionStartsAt`.
- Rút hoặc sửa đóng góp đã có không bị chặn.

### 3.10 Riêng tư đơn vị `INDIVIDUAL`

- Địa chỉ là text tự do, không có cấp xã/huyện tách riêng. Vì vậy public trả `address = null`,
  `location = null` cho `INDIVIDUAL`, chỉ giữ tên, loại, số suất, tiền ước tính và `distributionAt`.
- `GROUP` trả đủ địa chỉ và toạ độ.
- Đây là bản chặt hơn CR §3.4 (CR cho hiện cấp xã/huyện) vì không tách được an toàn.

### 3.11 Thành viên công khai

`GET /charity-campaigns/:idOrSlug/members`:

- `CONTRIBUTOR` lấy từ:
  - đóng góp hiện vật đã được BTC chấp nhận (`MATERIAL`);
  - đề nghị hỗ trợ dịch vụ đã chấp nhận (`SERVICE`).
- `MONEY` không có nguồn theo người, vì app không giữ tiền (PR #55).
- Một user xuất hiện một lần, kèm danh sách loại đóng góp.
- `PARTICIPANT`/`SUPERVISOR` lấy từ `campaign_participations` đã xác nhận, theo `role`.
- Ẩn tên theo `show_name_publicly`; số người còn lại trả trong `anonymousCount`.
- Cursor = `(joinedAt, userId)`.
- Chiến dịch chưa công khai trả 404.

### 3.12 Bảng tin điểm

- Nguồn là `point_ledger`. Khoá chính là `id BIGSERIAL`, trả ra dưới tên `entryId`.
- Điều kiện vào feed: `delta > 0` **và** `rule_code` không thuộc tập loại trừ: `ADMIN_ADJUSTMENT`,
  `REVERSAL`, `ITEM_REDEMPTION` và mọi rule phạt. Tập loại trừ đặt thành hằng số trong core-lib, có test
  kiểm kê.
- Bảng tin chung áp thêm `delta ≥ point.feed_min_delta`.
- Không hiện:
  - user không ở trạng thái `ACTIVE`;
  - user đang bị tạm khoá (`suspended_until > now`);
  - user đã bị xoá (`deleted_at`);
  - user đã tắt `show_in_public_point_feed`.
- `ruleTitle` lấy từ `PointRuleTitles` (core-lib).
- `context` chỉ có khi `reference_type` trỏ tới chiến dịch hoặc bài đăng đang công khai. Chỉ trả tiêu đề
  và id, không trả `reference_id` thô.
- Index mới `(user_id, id)`.
- Cache Redis 5 giây theo khoá `afterId` cho feed chung, theo khuôn `home-layout-cache`.
- Rate limit theo user bằng `IRequestThrottle`.

### 3.13 Thưởng theo hệ số

- Rule mới `CHARITY_CAMPAIGN_BONUS`. Khi thêm phải cập nhật:
  - union/list trong core-lib;
  - seed `point_rules`;
  - CHECK của `campaign_point_awards`;
  - khoá trần;
  - `PointRuleTitles`;
  - CONFIG-INVENTORY.
- Bút toán thưởng ghi trong **cùng transaction** với bút toán gốc, và dùng chung trần điểm ngày với rule
  gốc. Khi chạm trần thì ưu tiên ghi phần gốc trước.
- Bút toán thưởng mang `reference_type = 'POINT_LEDGER'`, `reference_id = id bút toán gốc`, để bảng tin
  gộp được thành một dòng có `bonusPercent`.
- Hệ số tính tại thời điểm ghi điểm, dùng giá trị **hiệu lực** (`point_bonus_percent`, do Admin chốt).
  Đề xuất của owner lưu ở `requested_point_bonus_percent`.

### 3.14 `badgeName`

- Bỏ bắt buộc. Cột cho phép `NULL`.
- Vẫn trả ra (deprecated) trong một bản phát hành, rồi gỡ ở CR sau.

### 3.15 Mã lỗi

- Tiếp nối nhóm `0x13`, theo thứ tự:
  - `CHARITY_BENEFICIARY_DISTRIBUTION_TIME_OUT_OF_RANGE` (400, kèm danh sách đơn vị);
  - `CHARITY_NEED_BELOW_ESTIMATED_PORTIONS` (400, kèm `minimumQuantity` theo dòng);
  - `CHARITY_FUNDING_BELOW_ESTIMATED_AMOUNT` (400);
  - `CHARITY_REHEARSAL_NOT_READY` (409);
  - `CHARITY_INTAKE_CLOSED` (409);
  - `CHARITY_SUPERVISOR_CONFLICT` (409: owner hoặc điều phối không làm giám sát được);
  - `CHARITY_SCHEDULE_INVALID` (400: sai thứ tự các khung thời gian);
  - `CHARITY_REVISION_PENDING_EXISTS` (409);
  - `CHARITY_CHANGE_REQUIRES_REVIEW` (409);
  - `CHARITY_CAMPAIGN_SUMMARY_NOT_PUBLISHED` (409: đóng chiến dịch khi tổng kết chưa công khai).
- Mã cũ chỉ dùng cho round (`CHARITY_ROUND_NOT_FOUND`, `CHARITY_ROUND_INVALID_STATE`) **giữ số** trong
  catalog, đánh dấu ngưng dùng. Không đánh số lại.

### 3.16 Dữ liệu cũ

Chỉ có data test.

- **Đợt 1:**
  - xoá round và `round_id`;
  - chép hình thức, bằng chứng và chi tiết riêng tư của **round mới nhất chưa huỷ** lên chiến dịch;
  - bỏ các round khác.
- **Đợt 2:**
  - `intake_ends_at = PREPARATION.ends_at`, nếu không có thì `DISTRIBUTION.starts_at`, nếu không có thì
    `end_time`.
- **Đợt 3:**
  - `minimum_participants` → `minimum_supervisors`;
  - `minimum_participant_rank` → `minimum_supervisor_rank`;
  - participation cũ nhận `role = 'PARTICIPANT'`.
- Seed (`seeds/full/*`) cập nhật theo từng đợt. Seed không ghi cột của đợt sau khi đợt đó chưa có.
  `test:notification-target` chạy seed hiện tại trên schema cũ.

### 3.17 Quyết định sau buổi đọc thử của người triển khai (22/11)

**a) Cơ chế thưởng.** Thay cho §3.13 ở những điểm mâu thuẫn.

- Thưởng là **một dòng award riêng** trong `campaign_point_awards` (rule `CHARITY_CAMPAIGN_BONUS`), đi
  cặp với một award gốc qua cột mới `base_award_id`.
- Rule được nhận thưởng: mọi rule kiếm điểm từ thiện, gồm item value, participation, post media và
  contribution completed. Áp cho cả giám sát viên.
- `settle()` xử lý theo cặp:
  1. ghi phần gốc;
  2. ngay sau đó, trong cùng transaction, ghi phần thưởng
     `floor(phần gốc vừa ghi × hệ số hiệu lực tại lúc settle / 100)`.
- Bút toán thưởng trỏ về bút toán gốc: `reference_type = 'POINT_LEDGER'`, `reference_id = id bút toán gốc`.
- Trần: phần thưởng được tính chung vào **mọi trần** (ngày, dự án, chu kỳ) của rule gốc. Các truy vấn
  "đã dùng" cộng cả bút toán thưởng của rule đó.
- Phần gốc bị hoãn thì phần thưởng hoãn theo.
- Phần gốc bị giảm hoặc về 0 (bút toán điều chỉnh âm) thì phần thưởng tương ứng cũng bị điều chỉnh âm
  theo cùng tỉ lệ đã áp.
- Bảng tin gộp một dòng = bút toán gốc + các bút toán thưởng trỏ về nó.

**b) Chiến dịch không qua Admin duyệt.** Gồm chiến dịch Admin tự tạo, và chiến dịch của owner có quyền
đăng không cần duyệt.

- Hệ số hiệu lực:
  - Admin tự tạo: Admin đặt thẳng giá trị;
  - owner có quyền đăng không cần duyệt: hệ số **giữ 0** cho tới khi Admin đặt.

  Lý do: tiêu chí nghiệm thu nói "hệ số chỉ có hiệu lực sau khi Admin duyệt".
- Sau duyệt, các thay đổi thuộc nhóm "cần duyệt" của owner có quyền đăng không cần duyệt **áp ngay**,
  vì quyền đó vốn để bỏ qua bước duyệt. **Riêng hệ số** luôn phải qua Admin.

**c) "Không tự đóng" (§3.8 viết lại).**

- Trạng thái "đã kết thúc" (bộ lọc `ENDED` trong danh sách và trên public) đổi sang **tổng kết đã công
  khai**, hoặc Admin đóng.
- Qua `endTime` mà chưa công khai tổng kết: chiến dịch hiện "Đang tổng kết", không nhận gì mới
  (tiếp nhận đã đóng từ trước).
- Thao tác đóng (`CloseCharityCampaignUseCase`) yêu cầu tổng kết đã công khai, nếu chưa thì trả
  `CHARITY_CAMPAIGN_SUMMARY_NOT_PUBLISHED`. Admin được ép đóng nhưng phải ghi lý do.
- Tạm ngưng và ẩn do rút đồng thuận **không** bị điều kiện này chặn.

**d) Tên bảng bản sửa.** `campaign_revisions` đã là bảng lịch sử thay đổi. Bảng mới đặt tên
`campaign_change_requests`.

- Khi Admin duyệt một bản sửa: ghi lịch sử vào `campaign_revisions` như mọi thay đổi khác, và gửi thông báo
  "thay đổi quan trọng" theo policy hiện có.
- Sửa policy PARTY: địa chỉ của đơn vị `GROUP` không còn là riêng tư (theo §3.10). Địa chỉ của
  `INDIVIDUAL` vẫn riêng tư.

**e) Người đóng góp dịch vụ trong `/members`.** Bảng `campaign_other_support_offers` không có
`show_name_publicly`, nên dùng cờ cấp user `users.show_in_public_supporter_lists` (đã có). Hiện vật vẫn
dùng cờ theo từng đóng góp.

**f) Một người, một vai.**

- Giữ unique `(campaign, user)` của participation. Mỗi người chỉ là `PARTICIPANT` **hoặc** `SUPERVISOR`.
- Muốn đổi vai thì huỷ rồi đăng ký lại; chỉ được khi chưa check-in.
- Đăng ký qua tuyển công sức tạo participation vai `PARTICIPANT`, và cũng bị chặn sau `intakeEndsAt`.

**g) Tổng duyệt và job.**

- Thời gian của phase `REHEARSAL` **không** bắt buộc khi gửi duyệt. Không có thời gian thì không nhắc
  48 giờ cho mốc tổng duyệt.
- Cổng `READY` vẫn chặn việc sang `EVENT`.
- Job `charity:advance-stage` **không bao giờ nhảy cóc** từ `EXECUTION` sang `SUMMARY`:
  - chưa `READY` thì giữ `EXECUTION` và nhắc;
  - thiếu bằng chứng hoặc tài khoản (§3.5) thì giữ `EVENT` và nhắc.

## 4. Gỡ đợt trao (đợt 1)

Kiểm kê hiện trạng: khoảng 32 file.

- **Gỡ:**
  - bảng `campaign_distribution_rounds`, `campaign_round_private_details`;
  - cột `round_id` ở `campaign_participations`, `campaign_deliveries`, `campaign_event_steps`;
  - route `/:id/rounds*`, `/:id/round-assignments`, `GET /:idOrSlug/rounds`;
  - use case, contract, DTO tương ứng;
  - `insertDistributionRound`;
  - các mục readiness theo đợt trong core-lib;
  - blocker `ROUNDS_UNSETTLED`;
  - audience thông báo theo đợt;
  - nguồn ảnh bằng chứng đợt trong job dọn ảnh mồ côi.

  Job dọn ảnh **phải** chuyển sang nguồn `campaigns.distribution_evidence_urls`, nếu không sẽ xoá nhầm
  bằng chứng.
- **Thay:**
  - timeline 10 bước quay về một bộ theo chiến dịch, unique `(campaign_id, step_key)`;
  - `RoundConfirmedValueSql` thành biểu thức theo chiến dịch, tính trên các delivery `COMPLETED`, và
    tổng kết đợt D (PR #55) dùng biểu thức này;
  - helper `prepareCharityRoundDistribution` đổi thành `prepareCharityCampaignDistribution`, dùng chung
    cho tạo chiến dịch và `PUT :id/distribution`.
- **Route mới:**
  - `PUT /charity-campaigns/:id/distribution`: hình thức + chi tiết riêng tư + `beneficiaryBankAccountId`;
  - `PUT /:id/distribution/evidence`;
  - `GET /:id/distribution` (workspace, có chi tiết riêng tư).

  Public đọc hình thức và bằng chứng qua `GET /:idOrSlug/public`.
- **Tổng duyệt và đóng:** §3.5–§3.8.
- **Tài liệu:** API.md, DATABASE.md, API-ROUTES.md, FEATURES.md. Đánh dấu tài liệu vòng đời §3.18 là "đã bỏ".

## 5. Đơn vị nhận, địa điểm, thời gian (đợt 2)

### 5.1 Đơn vị nhận

`campaign_parties` (role `BENEFICIARY`) thêm các cột:

- `estimated_portions int ≥ 0`;
- `estimated_amount bigint ≥ 0`;
- `location geography NULL`;
- `distribution_at timestamptz NULL`.

Tạo chiến dịch `ORGANIZED_CAMPAIGN` nhận `beneficiaries[]`:

- mỗi đơn vị gồm name, kind, address, phone, picName, picPhone, consentStatus, estimatedPortions,
  estimatedAmount, lat/lng, distributionAt;
- tối đa theo `charity.max_beneficiaries_per_campaign` (mặc định 20).

`INDIVIDUAL_APPEAL`:

- vẫn một người thụ hưởng như cũ, nhận thêm hai trường ước tính;
- bỏ ngoại lệ `CharityBeneficiaryNotApplicableException` cho `ORGANIZED_CAMPAIGN` khi gửi `beneficiaries[]`.

`PUT :id/parties` nhận thêm các trường mới. Sau khi duyệt, thay đổi thuộc nhóm "cần duyệt" bị chặn bằng
`CHARITY_CHANGE_REQUIRES_REVIEW`:

- thêm hoặc bớt đơn vị;
- đổi `estimatedPortions` hoặc `estimatedAmount`.

Các trường khác của đơn vị đổi ngay được.

Read model có thêm `totalEstimatedPortions` và `totalEstimatedAmount`.

### 5.2 Ràng buộc theo số suất

- Thêm `campaign_need_items.quantity_per_portion int ≥ 1`, mặc định 1.
- `minimumQuantity = totalEstimatedPortions × quantityPerPortion`. Nếu tổng suất bằng 0 thì không áp.
- Kiểm cả hai chiều:
  - tạo/sửa vật phẩm;
  - sửa số suất của đơn vị, kể cả khi áp một bản sửa đã duyệt.
- Tổng `target_amount` của các nhu cầu tiền phải ≥ `totalEstimatedAmount`.
- Gỡ `receiving_unit`.
- Giảm mục tiêu vẫn cần giải trình phần dư như cũ, nhưng không được thấp hơn `minimumQuantity`.

### 5.3 Địa điểm tiếp nhận

- Bảng `campaign_intake_locations` theo CR §3.1.
- Tạo chiến dịch nhận `intakeLocations[]`, tối thiểu 1, tối đa theo `charity.max_intake_locations`
  (mặc định 10).
- Sửa bằng `PUT :id/intake-locations` (thay cả danh sách).
- `campaigns.location`/`location_label` tự đồng bộ theo điểm tiếp nhận đầu tiên có toạ độ.
- `lat/lng/locationLabel` cũ giữ làm alias một bản phát hành.

### 5.4 Ba khung thời gian

- Ràng buộc thứ tự theo CR §4, sai trả `CHARITY_SCHEDULE_INVALID`.
- `intakeDeadline` của nhu cầu phải ≤ `intakeEndsAt`.
- `distributionAt` của mỗi đơn vị phải nằm trong khung trao.
- Sửa bằng `PUT :id/schedule`.
- Đổi khung trao làm một đơn vị nằm ngoài khung thì từ chối, trả danh sách đơn vị cần sửa.
- Khi gửi duyệt, mọi đơn vị phải có `address` và `distributionAt`. Đưa vào điều kiện gửi duyệt của PR #55
  A5, áp ở cả ba đường.

## 6. Giám sát viên và thông tin công khai (đợt 3)

### Giám sát viên

- Thêm `campaign_participations.role` (`PARTICIPANT|SUPERVISOR`), mặc định `PARTICIPANT`.
- Đăng ký giám sát:
  - dùng route tham gia hiện có, thêm `role`;
  - kiểm `minimum_supervisor_rank`, đọc hạng từ DB như hiện nay;
  - kiểm user không phải owner hoặc điều phối, sai trả `CHARITY_SUPERVISOR_CONFLICT`.
- Vai `PARTICIPANT` không còn bị chặn theo hạng.
- Tổng kết hiện `số giám sát viên đã check-in / minimumSupervisors`. Thiếu chỉ là cảnh báo.
- Giám sát viên được điểm tham gia và hệ số như người tham gia.

### Thông tin người tổ chức

`GET /campaigns/:idOrSlug` và `GET /charity-campaigns/:idOrSlug/public` thêm `organizer` (§3.1).

### Thành viên công khai

`GET /charity-campaigns/:idOrSlug/members` theo §3.11.

## 7. Điểm (đợt 4)

### Hệ số tăng điểm

- Cột `campaigns.point_bonus_percent` và `requested_point_bonus_percent`:
  - `smallint NOT NULL DEFAULT 0`;
  - CHECK nhận `0, 20, 50, 100`.
- Owner đề xuất khi tạo chiến dịch, hoặc qua bản sửa sau duyệt.
- Admin chốt bằng `PATCH /charity-campaigns/:id/approval` (thêm `pointBonusPercent`, được hạ thấp hơn đề
  xuất) và qua Admin PATCH.

### Ghi điểm thưởng

Theo §3.13, áp cho người đóng góp, người tham gia và giám sát viên.

### Bảng tin điểm

- `GET /points/feed`, `GET /users/:userId/points/feed` theo CR §1 và §3.12.
- User tắt hiện công khai thì `/users/:userId/points/feed` trả 404 cho người khác.
- Cột `users.show_in_public_point_feed boolean NOT NULL DEFAULT true`, đọc/ghi qua `GET/PATCH /profile/me`
  theo khuôn `showOnlineStatus`.
- Khoá cấu hình INTEGER:
  - `point.feed_min_delta` (10);
  - `point.feed_poll_seconds` (15);
  - `point.feed_display_interval_ms` (2000);
  - cùng hai khoá `charity.*` của đợt 2.

  Mỗi khoá cần khai báo trong `SupportedSystemConfigKeys` và `SystemConfigValueRanges`, seed migration,
  và cập nhật CONFIG-INVENTORY.

## 8. Duyệt lại sau sửa (đợt 5)

### Bảng `campaign_change_requests`

| Cột | Ghi chú |
| --- | --- |
| `campaign_id` | |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN` |
| `proposed` | jsonb: chỉ các trường thuộc nhóm "cần duyệt" |
| `base` | jsonb: ảnh chụp giá trị đã duyệt lúc tạo bản sửa, để Admin so sánh |
| `submitted_by`, `submitted_at` | |
| `decided_by`, `decided_at`, `decision_reason` | |

Partial unique: mỗi chiến dịch tối đa một bản `PENDING`.

### Route cho owner/BTC

- `GET /charity-campaigns/:id/revision`: xem bản sửa đang chờ.
- `PUT /charity-campaigns/:id/revision`: tạo bản sửa, hoặc thay nội dung bản đang `PENDING`.
- `DELETE /charity-campaigns/:id/revision`: rút bản sửa.

Chỉ áp dụng cho chiến dịch đã `APPROVED`. Trước khi duyệt, owner sửa thẳng như hiện nay.

### Route Admin

- `GET /admin/charity-campaigns/revisions?status=PENDING`
- `GET /admin/charity-campaigns/:id/revision`: trả `base`, `proposed` và giá trị hiện tại.
- `PATCH /admin/charity-campaigns/:id/revision`: duyệt hoặc từ chối.

Duyệt bản sửa:

- áp nội dung trong một transaction, chạy lại ràng buộc §5.2 với đơn vị nhận và số suất mới;
- vi phạm thì trả 400, bản sửa giữ `PENDING`.

### Chặn sửa trực tiếp

Sau duyệt, các route sửa trực tiếp từ chối trường thuộc nhóm "cần duyệt" bằng
`CHARITY_CHANGE_REQUIRES_REVIEW`. Gồm media, đơn vị nhận, loại tiếp nhận và hệ số.

### Kiểm toán và thông báo

- Mọi quyết định ghi `admin_audit_logs`.
- Thông báo cho owner khi bản sửa được duyệt hoặc bị từ chối, dùng kênh thông báo trong app đang có.

## 9. Ràng buộc chung

- Clean Architecture theo INVARIANTS.md:
  - token DI dùng Symbol;
  - `handle()`;
  - body bọc trong khoá tài nguyên;
  - `@ApiErrorResponses` + `...ApiTokenErrors`;
  - README được cập nhật khi export thay đổi.
- SQL thô; UPDATE ... RETURNING qua `updateReturning`; không dùng backtick trong template literal SQL.
- Mỗi đợt kiểm tra:
  - real-DB `test:charity-*`;
  - `test:seed-full`;
  - `test:notification-target`;
  - `test:config-inventory` khi có khoá mới;
  - `test:permission-inventory` khi có route Admin mới;
  - `docs:routes`, `docs:errors`;
  - lint, format.
- Trước khi đẩy lên: chạy đủ tất cả `test:*`.
- Migration đánh số tiếp từ `1803900000000`, đăng ký trong barrel `migrations/index.ts`.

## 10. Cách tiếp cận đã cân nhắc

**Giám sát viên:**

- (A) luồng tham gia: **đã chọn**;
- (B) luồng tuyển công sức: phải xây lại check-in, điểm, hạng và ẩn tên.

**Sửa sau duyệt:**

- (1) sửa theo từng phần, hệ số chỉ Admin đổi: không chọn;
- (2) cơ chế duyệt lại: **đã chọn**, theo dạng (i) "bản sửa chờ duyệt".
  - Dạng (ii) "đưa chiến dịch về `PENDING_APPROVAL`" bị loại vì làm đứng chiến dịch đang chạy.

**Triển khai:**

- một khối lớn: bị loại;
- **5 đợt tuần tự: đã chọn.** Gỡ round trước để các phần sau không viết hai lần. Bản sửa chờ duyệt làm sau
  cùng vì bọc lên các trường của đợt 2 và đợt 4.

## 11. Để người làm tự quyết

- Tên use case/DTO, cách tách file, câu chữ Swagger và thông điệp lỗi.
- Chi tiết SQL, miễn là giữ đúng các luật trên.
- Cách chia task trong từng đợt.

## 12. Các đợt

| Đợt | Nội dung | Migration |
| --- | --- | --- |
| 1 | Gỡ đợt trao, trao ở cấp chiến dịch, tổng duyệt, điều kiện đóng, nhắc 48 giờ | 1804000000000 |
| 2 | Đơn vị nhận (suất, tiền, địa chỉ, giờ trao), ràng buộc số suất, địa điểm tiếp nhận, ba khung thời gian | 1804100000000 |
| 3 | Giám sát viên, `organizer`, `members` | 1804200000000 |
| 4 | Hệ số điểm, thưởng điểm, bảng tin điểm | 1804300000000 |
| 5 | Bản sửa chờ duyệt | 1804400000000 |
