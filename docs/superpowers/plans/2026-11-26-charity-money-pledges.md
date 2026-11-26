# Implement: đăng ký ủng hộ tiền cho chiến dịch từ thiện (PR #62)

Ngày: 26/11/2026 · Nhánh: `feat/charity-money-pledges` (tách từ `docs/charity-money-pledges`,
PR vào `develop`) · Yêu cầu: `docs/plans/2026-11-25-charity-money-pledges.md`.

## 1. Đối chiếu yêu cầu với code hiện tại

| Yêu cầu | Hiện trạng | Hệ quả |
| --- | --- | --- |
| Lời khai giống Công đức | `merit_declarations` + `DeclareMeritUseCase`, `markDeclarationCompleted` khoá chủ sở hữu ngay trong `WHERE` | Dùng lại hình dạng bảng, CHECK, lối `UPDATE … WHERE status='INTENDED' RETURNING` |
| `vietQrUrl` qua `buildVietQrUrl` | `campaign_bank_accounts` **không có** `bank_bin` | Thêm cột `bank_bin` (nullable) + nhận `bankBin` khi thêm tài khoản; thiếu BIN thì `vietQrUrl = null` |
| `transferContent` "CT <mã ngắn>" | Công đức không sinh mã, chỉ dùng `note` | Sinh mã 6 ký tự (bỏ ký tự dễ nhầm), unique index, thử lại khi trùng |
| Tài khoản nhận đang hiệu lực | `valid_to IS NULL`, tối đa 2 tài khoản sống | Ưu tiên tài khoản của nhu cầu tiền (nếu còn sống), không thì tài khoản sống mới nhất |
| Giới hạn tần suất | Công đức không có; có port `IRequestThrottle` | 10 lời khai / giờ / người (`charity-money-pledge`) |
| "Dự án kết thúc" | `PublishCharitySummaryUseCase` = hoàn tất dự án (§3.18), `published_at` không gỡ được | Mốc = công bố tổng kết. Award ngay sau khi công bố; job `charity:points` vá phần thiếu |
| `totals.money` | Chỉ có khi tổng kết đã công bố | Thêm `moneyPledges { pledgedAmount, pledgeCount }` ở gốc view công khai (luôn có khi nhận MONEY), và `totals.money.pledgedAmount` |
| `members?type=CONTRIBUTOR` | UNION MATERIAL + SERVICE | Thêm nhánh MONEY từ lời khai `COMPLETED` chưa ẩn |
| Rule điểm mới | `CharityPointBaseRuleCodes` lo trần, thưởng chiến dịch, job settle | Thêm `CHARITY_MONEY_PLEDGE` vào danh sách gốc → tự có 3 khoá trần + thưởng |
| Thông báo | `notifications.type` là varchar, không CHECK | Thêm `CHARITY_MONEY_PLEDGE_HIDDEN` / `_UNHIDDEN` vào enum + group + target |

## 2. Quyết định (mặc định hợp lý, ghi lại để Product/mobile biết)

1. **Mốc kết thúc = công bố tổng kết.** Sau mốc này: không khai, không báo đã chuyển, không ẩn/bỏ
   ẩn (`CHARITY_MONEY_PLEDGE_LOCKED`).
2. **Khai được khi:** chiến dịch APPROVED, `is_active`, `end_time > now`, giai đoạn ≠ SUMMARY,
   nhận `MONEY`, trước `intakeEndsAt`, có tài khoản nhận sống, không phải chủ/điều phối viên.
3. **Báo đã chuyển** được cả sau `intakeEndsAt` (tiền có thể đến muộn), miễn chưa công bố tổng kết.
4. `pledgedAmount`/`pledgeCount` công khai = lời khai `COMPLETED`, chưa ẩn.
5. Rule `CHARITY_MONEY_PLEDGE` seed **TẮT** như mọi rule dự án lúc ship (Admin bật bằng API point rules), `points = 1` chỉ để
   qua CHECK — không dùng; mức điểm lấy từ rule `CHARITY_ITEM_VALUE` × `points_percent`.
6. Khoá `charity.money_pledge.points_percent` mặc định 50, khoảng 0…100.
7. Danh sách quản lý: chủ dự án, điều phối viên, Admin có `campaign.read`. Ẩn/bỏ ẩn: chủ dự án,
   điều phối viên, Admin `campaign.manage`.

## 3. Việc cần làm

### A. core-lib
- `models/charity-money-pledge.ts`: statuses, giới hạn, `moneyPledgePoints()`,
  `CharityMoneyPledgePointsPercentConfigKey`, alphabet + độ dài mã chuyển khoản.
- `models/charity-points.ts`: thêm `CHARITY_MONEY_PLEDGE` vào base rules (spec 12 → 15 khoá trần).
- `models/point-rule-title.ts`: tiêu đề rule.
- `consts/error-codes.ts` + `error-catalog.ts`: `0x13_66`…`0x13_6C`.
- `consts/notification-types.ts`, `notification-targets.ts`: hai loại thông báo.
- Build lại core-lib.

### B. Migration `1804600000000-CharityMoneyPledges`
- `campaign_bank_accounts.bank_bin varchar(6) NULL` + CHECK `^[0-9]{6}$`.
- Bảng `campaign_money_pledges` (cột như CR, CHECK status/amount/completed_at/hidden ba cột cùng
  null hoặc cùng có, unique `transfer_content`, index `(campaign_id, declared_at DESC)`,
  `(user_id, declared_at DESC)`, `(funding_need_id)`).
- `point_rules` thêm `CHARITY_MONEY_PLEDGE`; đổi `CHK_campaign_point_awards_rule`.
- `system_configs`: 3 khoá trần + `points_percent`.

### C. core service
- Port + repository `ICharityMoneyPledgeRepository` (raw SQL).
- Use case (một module `CharityMoneyPledgeModule` hoặc gom vào `charity-project.module`):
  declare, complete, listMine, listPublic, listManage, hide, unhide.
- `CharityPointsService.awardMoneyPledges(campaignId)` + vá trong `settlePending`.
- Gọi award sau `PublishCharitySummaryUseCase`.
- View công khai: `fundingNeeds[i].pledgedAmount/pledgeCount`, `moneyPledges`, `totals.money.pledgedAmount`.
- `listPublicMembers`: nhánh MONEY; nới type `MATERIAL|SERVICE|MONEY`.
- Point feed: `name_public` cho `CHARITY_MONEY_PLEDGE`.
- Thêm bank account nhận `bankBin` tuỳ chọn; trả `bankBin` ở view.
- Admin config: `SupportedSystemConfigKeys` + `SystemConfigValueRanges`.
- Controller `charity-money-pledge.controller.ts` (`charity-campaigns/:id/money-pledges`,
  `charity-money-pledges/...`), DTO đủ lỗi, `@Public()` cho danh sách công khai.

### D. Kiểm
- Unit spec cho use case.
- `test/charity-money-pledge.check.ts` (DB thật) + script `test:charity-money-pledge`.
- Seed full: lời khai INTENDED / COMPLETED / bị ẩn.
- `public-route-inventory.spec.ts`, config-inventory, `docs:routes`, `docs:errors`.
- Docs: `docs/API.md` mục mới, `docs/CONFIG-INVENTORY.md`, README core.
- Trước PR: lint:check, format:check, build, toàn bộ `test:*`, boot thật + smoke.
