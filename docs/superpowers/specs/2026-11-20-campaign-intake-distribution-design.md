# Tiếp nhận quyên góp và hình thức trao tặng — thiết kế triển khai backend

Ngày: 20/11/2026. Nguồn: `docs/plans/2026-11-20-campaign-intake-and-distribution.md` (PR #55, đã
merge `17f7463d`). Tài liệu này ghi các quyết định để đặc tả khớp với code hiện có; chỗ nào
không nhắc lại thì theo PR #55.

## Quyết định chốt với người dùng (20/11)

1. **"Chặn đóng góp tiền" khi chưa bật `MONEY`** = chặn mọi đường ghi liên quan tới tiền và ẩn
   công khai: không tạo/sửa `campaign_funding_needs`, không thêm tài khoản nhận
   (`campaign_bank_accounts`), view công khai không trả tài khoản nhận và nhu cầu tiền. App không
   giữ tiền và không có API "người dùng đóng góp tiền", nên không thêm API mới.
2. **Nhu cầu tình nguyện viên (`campaign_volunteer_needs`) KHÔNG thuộc `SERVICE`** — tuyển
   người là vận hành của BTC, không bị chặn theo loại và không tính vào điều kiện gửi duyệt.
3. **Tài khoản thụ hưởng**: backend tự so tên chủ tài khoản (bỏ dấu, không phân biệt hoa
   thường, gộp khoảng trắng) với `users.full_name` của chủ dự án (`holder_type = OWNER`) hoặc
   tên bên thụ hưởng (`campaign_parties` role `BENEFICIARY`, `holder_type = BENEFICIARY`); lệch →
   400. Admin vẫn phải xác thực (`verified_at`/`verified_by`) trước khi tài khoản dùng được; đổi
   tài khoản là bản mới, phải xác thực lại.

## Quyết định của người viết (đối chiếu code)

- **Sửa `acceptedContributionTypes`**: chủ dự án qua `PUT :id/profile` (theo khuôn
  `call_to_actions text[]` + CHECK `<@ ARRAY[...]`); Admin qua `PATCH /admin/charity-campaigns/:id`.
  Không có `PATCH /charity-campaigns/:id` cho thành viên.
- **Nhu cầu hiện vật "đang mở"** khi gửi duyệt = `is_active AND intake_status = 'OPEN'`.
  Đường đóng góp hiện vật giữ cách kiểm `is_active` hiện tại, thêm cổng loại `MATERIAL`.
- **Điều kiện gửi duyệt** áp ở cả ba đường: `POST :id/submit`, tạo kèm `submit`, Admin tạo.
  Nháp (`submit: false`) không kiểm.
- **Bằng chứng đợt trao**: cột `evidence_urls jsonb` (https, 0–20) trên
  `campaign_distribution_rounds`, theo quy ước sẵn có. Mã vận đơn ở bảng riêng tư.
- **Địa chỉ đợt trao**: `address` chỉ công khai khi `OTHER_LOCATION`; với `DIRECT_RECIPIENT`,
  `SHIPPING` thì địa chỉ nằm ở `campaign_round_private_details`, public trả `null`.
- **Đồng ý của bên thụ hưởng**: code không có `consent_at` — dùng `consent_status = CONFIRMED`.
- **`distribution` trong body tạo** giữ đúng tên của PR #55. Backend tạo **đợt trao đầu tiên**
  từ nó, và ghi khung `scheduledStart`/`scheduledEnd` vào phase `DISTRIBUTION` để luật chuyển
  giai đoạn (EVENT/SUMMARY) vẫn chạy. Response `distribution {startsAt, endsAt}` không đổi.
- **Tên enum** theo PR #55: `MATERIAL|MONEY|SERVICE`; `DIRECT_RECIPIENT|SHIPPING|OTHER_LOCATION|
  BANK_TRANSFER|SERVICE`; kênh dịch vụ `IN_PERSON|ONLINE|HOTLINE|APPOINTMENT`.
- **Chiến dịch cũ**: migration suy `accepted_contribution_types` từ dữ liệu (§5 PR #55); round cũ
  `distribution_method = NULL`. `campaign_phases.delivery_method`: giữ đọc, ngừng ghi mới;
  migration tạo/gán method cho round theo ánh xạ `SHIP→SHIPPING`, `TRANSFER→BANK_TRANSFER`,
  `ON_SITE→OTHER_LOCATION` + `needs_review = true`, chỉ khi dự án có đúng một round chưa có
  method; còn lại để `NULL`.
- **Mã lỗi** nhóm `0x13`, tiếp từ `0x13_55`: `CHARITY_CONTRIBUTION_TYPE_DISABLED` (409),
  `CHARITY_SUBMIT_REQUIREMENTS_UNMET` (409, nêu thiếu gì), `CHARITY_DISTRIBUTION_FIELD_REQUIRED`
  (400, nêu field), `CHARITY_DISTRIBUTION_METHOD_MISMATCH` (400),
  `CHARITY_ROUND_EVIDENCE_REQUIRED` (409), `CHARITY_BENEFICIARY_ACCOUNT_NAME_MISMATCH` (400),
  `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED` (409).

## Chia đợt (mỗi đợt một commit, chạy được độc lập)

- **A — Tiếp nhận**: cột `accepted_contribution_types`, tạo kèm `fundingNeeds[]` +
  `otherSupportNeeds[]`, sửa qua profile/Admin, chặn đóng góp hiện vật/dịch vụ và đường ghi tiền
  theo loại, ẩn tiền ở public khi tắt, điều kiện gửi duyệt ở 3 đường.
- **B — Hình thức trao trên đợt**: cột `distribution_method`, `contribution_types`,
  `evidence_urls`, `needs_review` trên round + bảng `campaign_round_private_details`; validation
  theo method (`FIELD_REQUIRED`/`METHOD_MISMATCH`); public/workspace tách trường riêng tư;
  `distribution` ở body tạo → round đầu + phase window; `DONE` cần bằng chứng đúng method;
  migration ánh xạ phase cũ.
- **C — Tài khoản thụ hưởng**: bảng `campaign_beneficiary_bank_accounts` (holder_type,
  verified_at/by, versioning như `campaign_bank_accounts`), so tên, Admin xác thực, round
  `BANK_TRANSFER` cần tài khoản đã xác thực, chỉ workspace thấy.
- **D — Tổng kết ba tổng**: bảng tổng kết + public summary trả `totals { material, money,
  service }`, không cộng dồn.

Mỗi đợt: TDD, kiểm tra trên PostGIS thật (`test:charity-*`), seed full không ghi cột mới,
`docs:routes`/`docs:errors`, API.md/DATABASE.md, review độc lập, đủ `test:*` trước khi push.

## Để người làm tự quyết

Tên use case/DTO, cách tách file, câu chữ Swagger và thông điệp lỗi, chi tiết SQL miễn giữ các
luật trên.
