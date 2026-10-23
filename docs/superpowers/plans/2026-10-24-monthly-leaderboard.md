# Bảng thành tích tháng — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ba bảng thành tích tháng (Người cho, Từ thiện, Chuyên cần), chốt sổ hằng tháng, huy hiệu top N có hạn, ẩn danh, và route Admin.

**Architecture:**
- Có một repository `LeaderboardRepository` (SQL thô) với hai nhiệm vụ:
  - Tính bảng "trực tiếp" từ ba bảng nghiệp vụ.
  - Đọc/ghi bản chốt, huy hiệu và danh sách loại.
- Use case nằm trong module `leaderboard`.
- Việc chốt sổ là một CLI theo mẫu `rank-evaluate.cli.ts`.
- Route công khai, route người dùng và route Admin ở ba controller riêng, theo luật route-order-guard quét theo file.

**Tech Stack:** NestJS + Fastify, TypeORM raw SQL, Postgres 17, Jest, script kiểm `test/*.check.ts`.

**Spec:** `docs/superpowers/specs/2026-10-24-monthly-leaderboard-design.md` (đọc kèm, nhất là mục 3–6 và 8b).

## Global Constraints

- Tháng = `[00:00 ngày 1, 00:00 ngày 1 tháng sau)` theo `BusinessTimeZone` (`Asia/Ho_Chi_Minh`). `month` trong API dạng `YYYY-MM`. Trong DB lưu kiểu `date` = ngày 1 của tháng.
- Mã bảng: `GIVERS`, `CHARITY`, `CONSISTENCY`.
- Đếm SỐ LẦN từ bảng nghiệp vụ, **không** dùng `point_ledger`.
- Xếp hạng: `count` giảm dần → `reached_at` tăng dần (mốc của lần đếm cuối cùng = lần thứ N) → `user_id` tăng dần. Hạng liền 1..n.
- Đủ điều kiện: `users.status = 'ACTIVE'`, `count >= sàn`, không có exclusion đang hiệu lực cho (tháng, bảng) hoặc (tháng, mọi bảng).
- Cấu hình (`system_configs`, INTEGER, đọc qua `IAdminConfigRepository.getConfigValue`):
  - `leaderboard.enabled` = 1
  - `leaderboard.min_givers` = 1
  - `leaderboard.min_charity` = 1
  - `leaderboard.min_consistency_days` = 10
  - `leaderboard.badge_ranks` = 3
  - `leaderboard.badge_months` = 3
  - Thiếu hoặc sai kiểu thì dùng đúng các mặc định này.
- Response công khai **không bao giờ** chứa `userId`/username/tên/avatar/rank của dòng ẩn danh hoặc dòng tài khoản không còn ACTIVE. Tên thật không ra khỏi repository (SQL trả `NULL`), theo mẫu `dharma.repository.ts:653`.
- Quyền Admin: `leaderboard.read`, `leaderboard.moderate`, seed cho `SUPER_ADMIN`.
- Audit Admin: ghi `admin_audit_logs` (`actor_user_id, action, resource_type, resource_id, before_json, after_json, reason`).
- Nếp repo:
  - `updateReturning()` cho UPDATE/DELETE … RETURNING.
  - Lỗi khai ở `core-lib/src/consts/error-codes.ts` + `error-catalog.ts`, `ExceptionFrom(CoreErrors.X)`, chạy lại `npm run docs:errors`.
  - Body wrapper bắt buộc dùng `@IsDefined @ValidateNested @Type`.
  - Route `@Public` thêm vào `public-route-inventory.spec.ts`.
  - Sửa `core-lib` thì `npm run build`.
- Script patch bằng Python phải ghi `newline='\n'`.
- Mọi task kết thúc bằng: `npx tsc --noEmit`, jest phần liên quan, rồi commit trên `main`.

## Review Focus

1. **Ranh giới tháng giờ Việt Nam:** lượt trao `completed_at = 2026-10-31T17:30Z` (00:30 ngày 1/11 VN) thuộc tháng 11; `2026-10-31T16:30Z` (23:30 31/10 VN) thuộc tháng 10. Test ở Task 2.
2. **Ẩn danh lọt qua đường phụ:** `GET /leaderboards/monthly` kèm token của người khác, trường `me`, và `GET /profile/:username` (huy hiệu ẩn danh) đều không lộ. Test ở Task 2 (SQL), Task 3 (mapper) và Task 5 (hồ sơ).
3. **Chốt hai lần hoặc chạy song song:** không nhân đôi entry, huy hiệu hay thông báo. Có UNIQUE ở DB, idempotency key ở thông báo. Test ở Task 4.
4. **Dữ liệu đổi sau khi chốt** (lượt trao mở lại, user đổi cờ ẩn danh, user bị khoá): bản chốt không đổi, chỉ phần hiển thị danh tính của user không còn ACTIVE bị che. Test ở Task 2 và Task 4.
5. **Tháng chưa tới hoặc sai định dạng** (`2026-13`, `abc`, tháng tương lai): `month` sai định dạng trả 400. Tháng tương lai trả danh sách rỗng `LIVE`, không 500. Test ở Task 3.

---

### Task 1: Schema, hằng số, cấu hình, quyền

**Files:**
- Create: `core/src/infrastructure/persistence/migrations/1801200000000-CreateMonthlyLeaderboards.ts` (và export trong `migrations/index.ts`)
- Create: `core-lib/src/consts/leaderboard.ts` (+ export ở `core-lib/src/consts/index.ts`)
- Create: `core-lib/src/consts/leaderboard.spec.ts`
- Modify: `core-lib/src/consts/notification-types.ts`, `core-lib/src/consts/notification-targets.ts`
- Modify: `core/src/infrastructure/entity/user.entity.ts` (cột mới, nếu entity liệt kê cột)

**Interfaces — Produces:**
- `enum LeaderboardBoards { GIVERS='GIVERS', CHARITY='CHARITY', CONSISTENCY='CONSISTENCY' }`
- `LeaderboardConfigKeys` (6 khoá ở Global Constraints) và `LeaderboardConfigDefaults`
- `parseLeaderboardMonth(value: string): string | null`: nhận `YYYY-MM`, trả `'YYYY-MM-01'`, sai thì `null`
- `vietnamMonthOf(now: Date): string` (`'YYYY-MM-01'`), `previousMonth(month: string): string`, `addMonths(month: string, n: number): string`
- `monthBoundsUtc(month: string): { start: Date; end: Date }`
- `NotificationTypes.LEADERBOARD_BADGE_AWARDED`
- `NotificationTargetTypes.LEADERBOARD`: đích singleton (`targetId` null), mở `GET /leaderboards/monthly/me`. Thêm vào `SingletonNotificationTargets`. `NotificationTargetsByType[LEADERBOARD_BADGE_AWARDED] = [LEADERBOARD]`.
- Bảng (migration):
  - `users.leaderboard_anonymous boolean NOT NULL DEFAULT false`
  - `leaderboard_snapshots(id bigserial, global_id uuid, month date, board varchar(16) CHECK IN 3 mã, closed_at timestamptz, badges_awarded boolean, UNIQUE(month, board))`
  - `leaderboard_entries(id, snapshot_id → snapshots ON DELETE CASCADE, user_id → users ON DELETE CASCADE, rank int >0, count int >0, reached_at timestamptz, is_anonymous boolean, UNIQUE(snapshot_id,user_id), UNIQUE(snapshot_id,rank))`
  - `leaderboard_exclusions(id, global_id, month date, board varchar(16) NULL = mọi bảng, user_id, reason text NOT NULL, created_by uuid, created_at, removed_at, removed_by)` + partial unique `(month, COALESCE(board,'*'), user_id) WHERE removed_at IS NULL`
  - `user_badges(id, global_id, user_id → users ON DELETE CASCADE, board, month date, rank int, is_anonymous boolean, awarded_at, expires_at timestamptz, revoked_at, revoked_by, revoke_reason, UNIQUE(user_id, board, month), CHECK((revoked_at IS NULL) = (revoke_reason IS NULL))`
  - Index: `user_badges(user_id, expires_at)`, `leaderboard_entries(snapshot_id, rank)`
  - Seed 6 khoá `system_configs` (`value_type 'INTEGER'`, theo mẫu `1793000000000-SeedGiverAccuracyConfig.ts`)
  - Seed 2 quyền + gán `SUPER_ADMIN` (mẫu `1791900000000-CreateReports.ts:53-67`)
  - Nới `CHK_notifications_target`: thêm `'LEADERBOARD'` vào nhánh `target_id IS NULL`
  - `down()` gỡ đủ

- [ ] **Step 1: Viết test RED** `leaderboard.spec.ts`:
  - `parseLeaderboardMonth('2026-10') === '2026-10-01'`, còn `'2026-13'`, `'2026-1'`, `'abc'` thì `null`
  - `vietnamMonthOf(new Date('2026-10-31T17:30:00Z')) === '2026-11-01'` và `vietnamMonthOf(new Date('2026-10-31T16:30:00Z')) === '2026-10-01'`
  - `previousMonth('2026-01-01') === '2025-12-01'`, `addMonths('2026-10-01', 3) === '2027-01-01'`
  - `monthBoundsUtc('2026-10-01')` = `{start: 2026-09-30T17:00Z, end: 2026-10-31T17:00Z}`
- [ ] **Step 2:** `cd core-lib && npx jest src/consts/leaderboard.spec.ts`, kỳ vọng FAIL (module không tồn tại).
- [ ] **Step 3:** Cài các hàm trên và cập nhật enum thông báo/đích, rồi `npm run build`.
- [ ] **Step 4:** Viết migration. Chạy `cd core && npx jest notification-target-guard notification-targets`, kỳ vọng PASS.
- [ ] **Step 5:** `npm run test:permission-inventory` và `npm run test:notification-target` (cần Docker), kỳ vọng PASS. Nếu inventory liệt kê quyền tường minh thì thêm hai quyền mới vào đó.
- [ ] **Step 6:** Commit `feat(leaderboard): schema, hằng số tháng VN, cấu hình và quyền`.

### Task 2: `LeaderboardRepository` + script kiểm DB thật

**Files:**
- Create: `core/src/domain/ports/repository/leaderboard.repository.ts` (+ export index)
- Create: `core/src/infrastructure/repository/leaderboard.repository.ts`
- Modify: `core/src/infrastructure/repository/repository.module.ts` (provide + export `ILeaderboardRepository`)
- Create: `core/test/leaderboard.check.ts`; Modify: `core/package.json` (`"test:leaderboard": "ts-node -r tsconfig-paths/register test/leaderboard.check.ts"`)

**Interfaces — Produces** (`ILeaderboardRepository`, symbol cùng tên):
```ts
interface ILeaderboardRow {
  rank: number; count: number; reachedAt: Date;
  userId: string;            // luôn có — chỉ tầng use case dùng; mapper công khai bỏ đi
  isAnonymous: boolean;
  /** chỉ ở bản chốt: tài khoản bị khoá/xoá SAU khi chốt — mobile hiện "Tài khoản không còn hoạt động" */
  isInactive: boolean;
  /** null khi ẩn danh hoặc isInactive */
  identity: { username: string; fullName: string | null; avatarKey: string | null; rank: UserRanks } | null;
  excluded?: boolean;        // chỉ có ở biến thể Admin
}
computeLive(p: { month: string; board: LeaderboardBoards; minCount: number; includeExcluded?: boolean; revealIdentity?: boolean }): Promise<ILeaderboardRow[]>;
findSnapshot(month: string, board: LeaderboardBoards): Promise<{ id: string; closedAt: Date; badgesAwarded: boolean } | null>;
listSnapshotEntries(p: { snapshotId: string; skip: number; take: number; revealIdentity?: boolean }): Promise<{ items: ILeaderboardRow[]; total: number }>;
findSnapshotEntry(snapshotId: string, userId: string): Promise<ILeaderboardRow | null>;
listClosedMonths(): Promise<string[]>;            // 'YYYY-MM-01', mới nhất trước
closeBoard(p: { month: string; board: LeaderboardBoards; rows: ILeaderboardRow[]; awardBadges: { ranks: number; expiresAt: Date } | null }): Promise<{ created: boolean; badges: { userId: string; rank: number }[] }>;
listBadges(p: { userId: string; scope: 'PUBLIC_ACTIVE' | 'OWN_ACTIVE' | 'ALL'; now: Date }): Promise<IUserBadge[]>;
listBadgesForAdmin(p: { month?: string; board?: LeaderboardBoards; userId?: string; skip: number; take: number }): Promise<{ items: IUserBadge[]; total: number }>;
revokeBadge(p: { badgeId: string; actorUserId: string; reason: string }): Promise<IUserBadge | null>;   // null = không có / đã gỡ
createExclusion(p: { month: string; board: LeaderboardBoards | null; userId: string; reason: string; actorUserId: string }): Promise<ILeaderboardExclusion>;
removeExclusion(p: { exclusionId: string; actorUserId: string }): Promise<ILeaderboardExclusion | null>;
listExclusions(p: { month?: string; board?: LeaderboardBoards; skip: number; take: number }): Promise<{ items: ILeaderboardExclusion[]; total: number }>;
setAnonymous(userId: string, value: boolean): Promise<void>;
isAnonymous(userId: string): Promise<boolean>;
```
`IUserBadge = { badgeId, userId, board, month, rank, isAnonymous, awardedAt, expiresAt, revokedAt, revokeReason }`.

Nguồn đếm của `computeLive` (một CTE cho mỗi bảng; `[start,end)` lấy từ `monthBoundsUtc`):
- `GIVERS`: `gift_transactions WHERE status='COMPLETED' AND completed_at ∈ [start,end)`, gom theo `giver_id`, `reached_at = MAX(completed_at)`.
- `CHARITY`: `campaign_deliveries d JOIN campaign_contributions c ON c.global_id = d.contribution_id WHERE d.status='COMPLETED' AND d.completed_at ∈ [start,end) AND EXISTS (campaign_delivery_items i WHERE i.delivery_id=d.global_id AND i.received_quantity > 0)`, gom theo `c.contributor_id`, `reached_at = MAX(d.completed_at)`.
- `CONSISTENCY`: `check_in_entries WHERE kind='NORMAL' AND policy_date >= month AND policy_date < month + 1 tháng`, gom theo `user_id`, `reached_at = MAX(created_at)`.

Sau đó JOIN `users` (status ACTIVE), lọc exclusion, `HAVING count >= minCount`, rồi `ROW_NUMBER() OVER (ORDER BY count DESC, reached_at ASC, user_id ASC)`. Danh tính dùng `CASE WHEN anonymous AND NOT revealIdentity THEN NULL`.

Với bản chốt: danh tính `NULL` khi `entry.is_anonymous` hoặc `users.status <> 'ACTIVE'` (trừ khi `revealIdentity`).

`closeBoard` chạy trong một transaction:
1. `INSERT … snapshots ON CONFLICT (month,board) DO NOTHING RETURNING id`. Không có dòng trả về thì trả `{created:false, badges:[]}`.
2. Chèn entries.
3. Nếu `awardBadges` khác null: chèn `user_badges` cho `rank <= ranks` với `is_anonymous` của entry, `ON CONFLICT DO NOTHING`, rồi set `badges_awarded = true`.

`listBadges`:
- `PUBLIC_ACTIVE` = chưa gỡ ∧ `expires_at > now` ∧ `is_anonymous = false`.
- `OWN_ACTIVE` = chưa gỡ ∧ `expires_at > now`.
- `ALL` = mọi dòng.

`createExclusion` vi phạm unique thì để use case dịch lỗi (Task 6).

- [ ] **Step 1: Viết `test/leaderboard.check.ts` RED** theo khung `test/post-visibility.check.ts`: database nháp, chạy migrations, seed users/posts/transactions/contributions/deliveries/check-ins bằng SQL. Các phép kiểm (nhãn → điều kiện):
  - `GIVERS đếm lượt COMPLETED của người tặng ở cả OFFER lẫn WANTED` → count đúng; lượt `CANCELLED`/`DELIVERING` không tính.
  - `ranh giới tháng VN`: lượt ở `2026-10-31T16:30Z` vào tháng 10, lượt ở `2026-10-31T17:30Z` vào tháng 11.
  - `CHARITY bỏ lượt giao nhận không thực nhận gì` → delivery COMPLETED mà mọi item `received_quantity = 0` không tính.
  - `CONSISTENCY không tính ngày bù` → entry `REPAIR` không tính.
  - `sàn`: `minCount = 10` thì user 9 ngày vắng mặt.
  - `phá hoà đạt sớm hơn`: hai user cùng 2 lượt, người có `MAX(completed_at)` sớm hơn hạng 1.
  - `exclusion theo bảng và mọi bảng` đều loại; exclusion đã `removed_at` thì không loại.
  - `ẩn danh: identity null, userId vẫn có`; `revealIdentity` thì có identity.
  - `closeBoard hai lần` → lần hai `created:false`, số entries và badges không đổi.
  - `huy hiệu ẩn danh không vào PUBLIC_ACTIVE nhưng có ở OWN_ACTIVE`.
  - `huy hiệu hết hạn không vào OWN_ACTIVE, vẫn có ở ALL`.
  - `bản chốt không đổi khi dữ liệu nghiệp vụ đổi`: chuyển một lượt trao sang CANCELLED sau khi chốt, entries giữ nguyên.
  - `user bị khoá sau chốt`: entry còn, identity null, rank không đổi.
  - `revokeBadge lần hai trả null`.
- [ ] **Step 2:** `npm run test:leaderboard`, kỳ vọng FAIL (import không có).
- [ ] **Step 3:** Cài repository + port, đăng ký module.
- [ ] **Step 4:** `npm run test:leaderboard`, kỳ vọng mọi dòng OK.
- [ ] **Step 5:** Commit `feat(leaderboard): repository tính bảng trực tiếp và bản chốt`.

### Task 3: Use case + route đọc công khai và của tôi

**Files:**
- Create: `core/src/application/contracts/leaderboard/{get-monthly-leaderboard,get-my-leaderboard-positions,list-leaderboard-months}.use-case.ts` + `index.ts`
- Create: `core/src/application/implementations/leaderboard/leaderboard-config.ts`, `leaderboard.use-cases.ts`, `leaderboard.module.ts` (`@Global`, theo mẫu `rank.module.ts`); đăng ký trong `application.module.ts` và `cli/cli-infrastructure.module.ts`
- Create: `core-lib/src/dto/leaderboard/leaderboard.dto.ts` (+ export)
- Create: `core/src/infrastructure/controller/api/leaderboard/leaderboard.controller.ts`, `leaderboard.module.ts`, DTO ở `controller/dto/leaderboard/`; đăng ký controller module như `DharmaControllerModule`
- Create: spec `leaderboard.use-cases.spec.ts`
- Modify: `public-route-inventory.spec.ts` (thêm `GET /leaderboards/monthly`, `GET /leaderboards/months`)

**Interfaces:**
- Consumes: `ILeaderboardRepository` (Task 2), hằng số tháng (Task 1).
- Produces:
  - `readLeaderboardConfig(adminConfig): Promise<{ enabled: boolean; minCount: Record<LeaderboardBoards, number>; badgeRanks: number; badgeMonths: number }>`
  - DTO `ILeaderboardEntryDto = { rank, count, isAnonymous, isInactive, user: { username, fullName, avatarUrl, rank } | null }`
  - `IMonthlyLeaderboardDto = { month: 'YYYY-MM', board, status: 'LIVE'|'CLOSED', enabled, closedAt: Date|null, entries, meta, me: ILeaderboardEntryDto|null }`
  - `IMyLeaderboardPositionDto = { board, rank|null, count, minCount, badgeRanks, gapToBadge: number|null, gapToNext: number|null }`
  - `IMyLeaderboardPositionsDto = { month: 'YYYY-MM', status, positions: IMyLeaderboardPositionDto[] }`

Hành vi:
- **`GetMonthlyLeaderboardUseCase`:**
  - Tắt tính năng: `enabled:false` và `entries: []`.
  - Có snapshot: `CLOSED`, đọc `listSnapshotEntries`.
  - Chưa có snapshot (kể cả tháng tương lai): `LIVE` từ `computeLive`, phân trang trong bộ nhớ, cache theo `(month, board)` tối đa 60 giây.
  - `me` chỉ khi có `viewerId`. Lấy dòng của viewer: dòng của chính mình **trả đủ danh tính** dù ẩn danh.
  - `avatarUrl` dựng từ key như các DTO hồ sơ hiện có.
- **`GetMyLeaderboardPositionsUseCase`:**
  - Trả đủ ba bảng.
  - `gapToBadge = count của hạng badgeRanks − count của tôi`, null khi tôi đã ≤ badgeRanks hoặc bảng chưa đủ badgeRanks người.
  - `gapToNext = count người ngay trên − count của tôi`, null khi hạng 1.
  - Chưa đủ sàn: `rank:null`, `gapToBadge` và `gapToNext` cũng null.
- `month` không đúng `YYYY-MM` thì `ValidationFailedException` (400).

Route trong `leaderboard.controller.ts`, tĩnh trước, **không** có route tham số:
- `GET leaderboards/monthly` (`@Public`, query `board` bắt buộc, `month?`, `page?`, `pageSize?` mặc định 20, tối đa 100)
- `GET leaderboards/monthly/me` (Bearer, `month?`)
- `GET leaderboards/months` (`@Public`)

- [ ] **Step 1: spec RED** `leaderboard.use-cases.spec.ts` (mock repository + adminConfig):
  - `tháng đã chốt đọc bản chốt, không gọi computeLive`
  - `tháng chưa chốt tính trực tiếp, status LIVE`
  - `tắt tính năng → enabled false, entries rỗng, không gọi repository`
  - `mapper bỏ userId: JSON.stringify(result) không chứa userId của dòng ẩn danh`
  - `me của chính người ẩn danh có user khác null`
  - `month 'abc' → ValidationFailedException`
  - `gapToBadge: tôi 3 lượt, hạng 3 có 5 → 2`
  - `chưa đủ sàn → rank null, gaps null`
  - `config thiếu → dùng mặc định 1/1/10/3/3`
- [ ] **Step 2:** `npx jest leaderboard.use-cases`, kỳ vọng FAIL.
- [ ] **Step 3:** Cài use case, DTO, controller, module.
- [ ] **Step 4:** `npx jest leaderboard public-route-inventory route-order`, kỳ vọng PASS.
- [ ] **Step 5:** Commit `feat(leaderboard): xem bảng tháng và vị trí của tôi`.

### Task 4: Chốt sổ tháng (use case + CLI + thông báo)

**Files:**
- Create: contract `close-leaderboard-month.use-case.ts`; implementation trong `leaderboard.use-cases.ts` (hoặc file riêng `close-leaderboard-month.use-case.ts`)
- Create: `core/src/infrastructure/cli/leaderboard-close-month.cli.ts`, `leaderboard-cli.module.ts` (mẫu `rank-evaluate.cli.ts`, có `selfCheckIfRequested`)
- Modify: `core/package.json`: `"leaderboard:close-month"` và `"leaderboard:close-month:built"`
- Modify: `test/leaderboard.check.ts` (thêm nhóm chốt sổ end-to-end với `DispatchNotificationUseCase` thật như `test/dharma-forum.check.ts`)
- Test: spec `close-leaderboard-month.use-case.spec.ts`

**Interfaces:**
- Produces: `ICloseLeaderboardMonthUseCase.handle({ month?: string; now?: Date }): Promise<{ month: string; boards: { board; created: boolean; entries: number; badges: number }[] }>`. `month` mặc định `previousMonth(vietnamMonthOf(now))`.

Hành vi:
- Từ chối chốt tháng hiện tại hoặc tháng tương lai (`ValidationFailedException`).
- Cho mỗi bảng: `computeLive({ minCount, revealIdentity:true })` rồi `closeBoard`.
- `awardBadges` là null khi tính năng tắt, hoặc khi `addMonths(month, badgeMonths + 1)` (theo `monthBoundsUtc(...).start`) ≤ `now`, tức huy hiệu đã hết hạn lúc chốt bù. Ngược lại là `{ ranks: badgeRanks, expiresAt: monthBoundsUtc(addMonths(month, badgeMonths + 1)).start }`. Tháng 10, N=3 thì hết hạn lúc 00:00 VN ngày 1/2.
- Mỗi huy hiệu mới gửi `LEADERBOARD_BADGE_AWARDED`:
  - title `Bạn lọt top bảng thành tích tháng`
  - body `Bạn đứng thứ {rank} bảng {Người cho|Tấm lòng từ thiện|Chuyên cần} tháng {MM/YYYY}.`
  - `target: { type: NotificationTargetTypes.LEADERBOARD, id: null }`
  - `idempotencyKey: LEADERBOARD_BADGE:{board}:{YYYY-MM}:{userId}`
- Gửi SAU commit. Lỗi gửi chỉ log, không làm hỏng lượt chốt.

- [ ] **Step 1: spec RED:**
  - `mặc định chốt tháng trước theo giờ VN (now = 2026-11-01T00:05+07)` → month `2026-10-01`
  - `từ chối tháng hiện tại`
  - `tắt tính năng → vẫn closeBoard nhưng awardBadges null, không gửi thông báo`
  - `chốt bù tháng đã quá hạn huy hiệu → awardBadges null`
  - `expiresAt tháng 10 N=3 = 2027-01-31T17:00Z`
  - `closeBoard created:false → không gửi thông báo`
  - `dispatch ném lỗi → vẫn trả kết quả`
- [ ] **Step 2:** chạy spec, kỳ vọng FAIL.
- [ ] **Step 3:** Cài use case + CLI.
- [ ] **Step 4:** Thêm nhóm vào `test:leaderboard`:
  - Chốt tháng 10 thật thì có 3 snapshot, huy hiệu top 3.
  - Thông báo có `target_type='LEADERBOARD'`, `target_id IS NULL`, qua được `CHK_notifications_target`.
  - Chạy lại lần hai thì số thông báo không tăng.

  Chạy `npm run test:leaderboard`, kỳ vọng OK. Chạy `npm run build && node dist/infrastructure/cli/leaderboard-close-month.cli.js --self-check`, kỳ vọng exit 0.
- [ ] **Step 5:** Commit `feat(leaderboard): chốt sổ tháng, trao huy hiệu và thông báo`.

### Task 5: Hồ sơ — huy hiệu và cài đặt ẩn danh

**Files:**
- Modify: `core-lib/src/dto/profile/profile.dto.ts`:
  - `IPublicProfileDto.badges: IProfileBadgeDto[]`
  - `IOwnProfileDto.badges?: IProfileBadgeDto[]` và `leaderboardAnonymous?: boolean`
  - `IUpdateOwnProfileDto.leaderboardAnonymous?: boolean`
  - `IProfileBadgeDto = { badgeId, board, month: 'YYYY-MM', rank, expiresAt, isAnonymous, status: 'ACTIVE'|'EXPIRED'|'REVOKED' }`
- Modify: use case public profile, own profile, update profile trong `application/implementations/profile/`; controller DTO tương ứng.
- Create: route `GET /profile/me/badges` trong controller profile hiện có, đặt trước `profile/:username`.

**Interfaces:** Consumes `listBadges`, `setAnonymous`, `isAnonymous` (Task 2).

- [ ] **Step 1: spec RED** (mở rộng spec hồ sơ hiện có):
  - `hồ sơ công khai gọi listBadges scope PUBLIC_ACTIVE`
  - `hồ sơ của tôi có badges OWN_ACTIVE và leaderboardAnonymous`
  - `PATCH profile.leaderboardAnonymous=true gọi setAnonymous(userId,true)`
  - `bỏ trống leaderboardAnonymous thì không gọi setAnonymous`
  - `/profile/me/badges trả ALL kèm status EXPIRED/REVOKED đúng`
- [ ] **Step 2:** chạy spec, FAIL.
- [ ] **Step 3:** Cài đặt. DTO body nhận `@IsOptional() @IsBoolean()`.
- [ ] **Step 4:** `npx jest profile route-order`, PASS. Thêm vào `test:leaderboard`: user bật ẩn danh → chốt → `GetPublicProfileUseCase` thật không có huy hiệu, `GetOwnProfile` có. Chạy `npm run test:leaderboard`, OK.
- [ ] **Step 5:** Commit `feat(profile): huy hiệu bảng thành tích và cài đặt ẩn danh`.

### Task 6: Admin — xem, loại, gỡ huy hiệu

**Files:**
- Create: use case Admin trong `implementations/leaderboard/admin-leaderboard.use-cases.ts` + contracts
- Create: `controller/api/leaderboard/admin-leaderboard.controller.ts`, routes `admin/leaderboards/...` và `admin/badges/...`
- Modify: `core-lib/src/consts/error-codes.ts` + `error-catalog.ts`:
  - `LEADERBOARD_MONTH_CLOSED` (409): loại người ở tháng đã chốt
  - `LEADERBOARD_EXCLUSION_EXISTS` (409)
  - `LEADERBOARD_EXCLUSION_NOT_FOUND` (404)
  - `LEADERBOARD_BADGE_NOT_FOUND` (404)
  - Exception tương ứng trong `core/src/domain/exceptions`; `npm run docs:errors`
- Test: `admin-leaderboard.use-cases.spec.ts`

Route (`@RequiresPermission`):

| Method | Path | Quyền | Body |
| --- | --- | --- | --- |
| GET | `admin/leaderboards/monthly` | `leaderboard.read` | — |
| GET | `admin/leaderboards/exclusions` | `leaderboard.read` | — |
| POST | `admin/leaderboards/exclusions` | `leaderboard.moderate` | `{ exclusion: { month, board?: board\|null, userId, reason (5–500) } }` |
| DELETE | `admin/leaderboards/exclusions/:exclusionId` | `leaderboard.moderate` | — |
| GET | `admin/badges` | `leaderboard.read` | — |
| PATCH | `admin/badges/:badgeId/revoke` | `leaderboard.moderate` | `{ revoke: { reason (5–500) } }` |

Ghi chú route:
- `admin/leaderboards/monthly` có query `board, month, page, pageSize`. Dùng `revealIdentity:true`, và `includeExcluded:true` khi tháng LIVE.
- Audit action dùng `LEADERBOARD_EXCLUDE`, `LEADERBOARD_EXCLUSION_REMOVE`, `BADGE_REVOKE`.

- [ ] **Step 1: spec RED:**
  - `loại ở tháng đã có snapshot → LeaderboardMonthClosedException`
  - `loại trùng → LeaderboardExclusionExistsException`
  - `loại hợp lệ ghi audit LEADERBOARD_EXCLUDE với reason`
  - `gỡ huy hiệu không có → LeaderboardBadgeNotFoundException`
  - `gỡ huy hiệu ghi audit BADGE_REVOKE, không đụng entries`
  - `bảng Admin gọi computeLive với revealIdentity true`
- [ ] **Step 2:** chạy spec, FAIL.
- [ ] **Step 3:** Cài đặt, regenerate error docs.
- [ ] **Step 4:** `npx jest admin-leaderboard error-catalog` PASS; `npm run test:permission-inventory` PASS. Thêm vào `test:leaderboard`: exclusion qua use case thật làm user biến khỏi `computeLive`, và audit có dòng. Chạy `npm run test:leaderboard`, OK.
- [ ] **Step 5:** Commit `feat(leaderboard): route Admin loại người và gỡ huy hiệu`.

### Task 7: Tài liệu, seed, kiểm toàn bộ

**Files:**
- Modify: `docs/API.md` (mục "Bảng thành tích tháng": bảng route của spec mục 7 + ghi chú ẩn danh/hạn huy hiệu/chốt sổ + loại thông báo `LEADERBOARD_BADGE_AWARDED` và đích `LEADERBOARD` vào bảng đích điều hướng)
- Modify: `D:\tmp\cms-backlog\mobile-notification-navigation.md` (thêm đích `LEADERBOARD`)
- Modify: seed `seed:full` (nếu `test:seed-full` đòi mọi bảng có dữ liệu, xem memory "Seed đầy đủ"): thêm một snapshot + vài huy hiệu demo
- Modify: `docs/FEATURES.md` nếu có danh mục tính năng

- [ ] **Step 1:** Cập nhật tài liệu và seed.
- [ ] **Step 2:** `cd core-lib && npm run build`; `cd core && npx tsc --noEmit && npx jest` (toàn bộ PASS).
- [ ] **Step 3:** `bash /d/tmp/sdd5/run-all-checks.sh > /d/tmp/sdd5/all-checks.log`. Kỳ vọng mọi script PASS, kể cả `test:leaderboard` và `test:seed-full`.
- [ ] **Step 4:** Gốc repo `npm run lint:check`, sạch.
- [ ] **Step 5:** Smoke trên server `PORT=3100 node dist/main.js`:
  - `GET /leaderboards/monthly?board=GIVERS` khách → 200 LIVE
  - `?month=abc` → 400
  - `/leaderboards/monthly/me` có token → 3 vị trí
  - Chạy `leaderboard:close-month --month=<tháng trước>` → `GET ?month=` → CLOSED
  - Dọn dữ liệu smoke khỏi DB local
- [ ] **Step 6:** Commit `docs(leaderboard): API, đích thông báo, seed`.
