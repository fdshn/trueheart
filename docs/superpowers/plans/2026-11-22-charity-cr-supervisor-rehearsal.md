# CR chiến dịch từ thiện — giám sát viên, tổng duyệt, đơn vị nhận, bỏ đợt trao, bảng tin điểm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove distribution rounds and run each campaign as one distribution with a campaign-level method, evidence, private details, a gated rehearsal step and a "close only when the summary is published" rule. Then add beneficiary units with portions, amounts, address and time; quantity and funding floors; intake locations; and three time windows. Then add supervisors as a participation role, plus `organizer` and public `members`. Then add an Admin-approved point bonus and a public point feed. Last, add a pending change request that wraps the reviewed fields.

**Architecture:** Clean Architecture as it is today. Pure rules and enums go in `core-lib/src/models` and error codes in `core-lib/src/consts`. Use cases go in the existing `charity-campaign` / `charity-project` / `point` implementation files. SQL stays raw in the existing repositories, and new tables get methods on the existing repository of their resource. The only new ports are `IPointFeedRepository`, `IPointFeedCache` and `ICharityChangeRequestRepository`. Each phase has one migration (`1804000000000` … `1804400000000`) and one commit on `develop`. Public projections are explicit picks, never spreads.

**Tech Stack:** NestJS 11 + Fastify 5, TypeORM 0.3 raw SQL, PostgreSQL 16 + PostGIS 3.4, Redis (ioredis), class-validator, Jest, ts-node real-DB checks.

**Spec:** docs/superpowers/specs/2026-11-22-charity-cr-supervisor-rehearsal-design.md

Paths below are relative to `suites/chantam.vn/chantam/` unless they start with `docs/`. `core` = `suites/chantam.vn/chantam/core`, `core-lib` = `suites/chantam.vn/chantam/core-lib`.

## Global Constraints

- Branch: work on `develop` (a push to `main` deploys production). **One commit per phase.** Tasks inside a phase stage their files (`git add <paths>`) and do not commit. The reviewer of a task reads `git diff` (unstaged) for that task. The last task of the phase commits. Push only when the user asks.
- Every commit message is in Vietnamese and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Migrations: `1804000000000` (phase 1), `1804100000000` (2), `1804200000000` (3), `1804300000000` (4), `1804400000000` (5). Each one is exported from `core/src/infrastructure/persistence/migrations/index.ts` (`barrel-guard.spec.ts`).
- Seeds (`core/src/infrastructure/persistence/seeds/full/*`) never name a column or table of a later phase. Every new column or table is behind a `to_regclass(...)` / `information_schema.columns` guard, as in `seeds/full/charity-project.ts`. `test:notification-target` runs the current seed on the schema `< 1801100000000`. Do not reuse a `$n` with two different types (42P08).
- No backticks inside SQL template literals, SQL comments included. `UPDATE/DELETE … RETURNING` goes through `updateReturning` (`core/src/infrastructure/repository/update-returning.ts`).
- Enums (core-lib):
  - `CharityPhaseKeys = ['PLANNING','PREPARATION','REHEARSAL','DISTRIBUTION','REPORTING']`
  - `CharityRehearsalOutcomes = ['READY','NOT_READY']`
  - `CharityRehearsalChecklistKeys = ['RECIPIENTS','GOODS_AND_FUNDS','TRANSPORT','STAFF','SUPERVISORS','VENUE_AND_TIME','LOCAL_CONTACT']`, each item `{ key, status: 'DONE'|'NOT_DONE', note }`
  - `CharityParticipationRoles = ['PARTICIPANT','SUPERVISOR']`
  - `CharityPointBonusPercents = [0, 20, 50, 100]`
  - `CharityChangeRequestStatuses = ['PENDING','APPROVED','REJECTED','WITHDRAWN']`
  - `CharityMemberTypes = ['CONTRIBUTOR','PARTICIPANT','SUPERVISOR']`
  - `CharityPreEventMilestones = ['REHEARSAL','DISTRIBUTION']`
- Error codes, added together in Task 1.1 in exactly this order (numbering follows the spec's order, not the phase order):
  - `CHARITY_BENEFICIARY_DISTRIBUTION_TIME_OUT_OF_RANGE = 0x13_5c` (400, `details.beneficiaries`)
  - `CHARITY_NEED_BELOW_ESTIMATED_PORTIONS = 0x13_5d` (400, `details.items[].minimumQuantity`)
  - `CHARITY_FUNDING_BELOW_ESTIMATED_AMOUNT = 0x13_5e` (400)
  - `CHARITY_REHEARSAL_NOT_READY = 0x13_5f` (409)
  - `CHARITY_INTAKE_CLOSED = 0x13_60` (409)
  - `CHARITY_SUPERVISOR_CONFLICT = 0x13_61` (409)
  - `CHARITY_SCHEDULE_INVALID = 0x13_62` (400)
  - `CHARITY_REVISION_PENDING_EXISTS = 0x13_63` (409)
  - `CHARITY_CHANGE_REQUIRES_REVIEW = 0x13_64` (409)
  - `CHARITY_CAMPAIGN_SUMMARY_NOT_PUBLISHED = 0x13_65` (409)
  - `CHARITY_ROUND_NOT_FOUND` (`0x13_4a`) and `CHARITY_ROUND_INVALID_STATE` (`0x13_4b`) keep their numbers, get a `/** @deprecated … */` comment, and are never renumbered.
- Config keys (INTEGER, `system_configs` seed + `SupportedSystemConfigKeys` + `SystemConfigValueRanges` in `core/src/application/contracts/admin-config/admin-config.use-cases.ts` + `docs/CONFIG-INVENTORY.md`):
  - `charity.max_beneficiaries_per_campaign` = 20 (range 1–100, phase 2)
  - `charity.max_intake_locations` = 10 (range 1–50, phase 2)
  - `point.feed_min_delta` = 10 (range 0–1 000 000, phase 4)
  - `point.feed_poll_seconds` = 15 (range 5–3600, phase 4)
  - `point.feed_display_interval_ms` = 2000 (range 200–60 000, phase 4)
- Schedule order: `intakeStartsAt (= campaigns.start_time) < intakeEndsAt ≤ distributionStartsAt < distributionEndsAt ≤ endTime`. `distributionStartsAt/EndsAt` live on the `DISTRIBUTION` row of `campaign_phases`.
- Privacy:
  - `INDIVIDUAL` beneficiaries return `address: null`, `location: null`, `phone`/`picName`/`picPhone` absent on every public path.
  - `GROUP` returns address and coordinates.
  - `campaign_distribution_private_details` is read by workspace routes only.
  - The point feed never returns `reason`, `rule_code`, `reference_id` or `reference_type`.
  - A `PENDING` change request is never visible on a public path.
- Point bonus: a separate award row `CHARITY_CAMPAIGN_BONUS` paired through `campaign_point_awards.base_award_id`. It is written in the same transaction right after the base entry. Ledger entry: `reference_type = 'POINT_LEDGER'`, `reference_id = <base point_ledger.id>`. It counts toward every cap (daily, project, cycle) of the base rule. When a cap is hit, the base is written first.
- Feed exclusion set (core-lib `PointFeedExcludedRuleCodes`): `ADMIN_ADJUSTMENT`, `REVERSAL`, `ITEM_REDEMPTION`, `CONTENT_VIOLATION_PENALTY`, `SHIP_UNPAID_PENALTY`, `MAINTENANCE_FAILED`, `GROUP_AFFILIATE_REVERSAL`. `CHARITY_CAMPAIGN_BONUS` is never its own row; it is merged into its base row.
- Build core-lib before testing core: `npm run build --workspace=@chantam.vn/chantam.core-lib`.
- Unit tests:
  - core: `npm run test --workspace=@chantam.vn/chantam.core -- <paths>`
  - core-lib: `npm run test --workspace=@chantam.vn/chantam.core-lib -- <paths>`
- Real-DB checks: `npm run test:<name> --workspace=@chantam.vn/chantam.core`. Start Docker first (`Start-Process` Docker Desktop, then `docker compose up -d`). The script names used here exist in `core/package.json`: `test:charity`, `test:charity-contribution`, `test:charity-project`, `test:charity-operations`, `test:charity-summary`, `test:charity-engagement`, `test:charity-event`, `test:charity-participation`, `test:charity-points`, `test:point-economy`, `test:public-profile`, `test:seed-full`, `test:notification-target`, `test:config-inventory`, `test:permission-inventory`.
- At repo root:
  - `npm run docs:errors` after adding codes, `npm run docs:routes` after changing routes;
  - `npm run docs:errors:check` and `npm run docs:routes:check` in the phase-end step;
  - `npm run lint:check` and `npm run format:check` (not `lint`/`format`).
- Before any push, run every `test:*` script in `core/package.json` plus root `npm run test`. That is a user-triggered step, not part of the phase commits.
- New endpoints:
  - Each one has `@ApiErrorResponses(...)` plus `...ApiTokenErrors` when it needs a token.
  - A `@Post` without `@HttpCode` uses `@ApiCreatedResponse`.
  - Bodies are wrapped under a resource key.
  - Params use a Params DTO.
  - DI tokens are Symbols, and use cases expose `handle()`.
  - Admin routes carry `@RequiresPermission('campaign.read' | 'campaign.manage')`.
  - A static segment (`revisions`) is declared before `:id` in the same controller.
- Exceptions: `extends ExceptionFrom(CoreErrors.X) {}` in `core/src/domain/exceptions/charity-campaign.exception.ts` (charity) or the point exceptions file. Messages and `details` live only in `core-lib/src/consts/error-catalog.ts`, with a `sample` when the message has parameters.
- Docs touched per phase: `docs/API.md`, `docs/DATABASE.md`, `docs/API-ROUTES.md` (generated), `docs/FEATURES.md`, `docs/CONFIG-INVENTORY.md` when keys change, `docs/API-ERRORS.md` (generated), and `docs/plan/CHARITY-PROJECT-LIFECYCLE.md` §3.18 (marked "đã bỏ" in phase 1). Update `core/README.md` / `core-lib/README.md` when exports change.

## Review Focus

1. **The orphan-media sweep deletes campaign distribution evidence.** `LiveKeySources` must swap `campaign_distribution_rounds.evidence_urls` for `campaigns.distribution_evidence_urls` in the same task that drops the round table. Pinned in Task 1.4: `sweep-orphan-media.use-case.spec.ts` "KHÔNG xoá ảnh bằng chứng trao của chiến dịch", plus a real-DB check that the live-key SQL returns a seeded evidence key.
2. **An `INDIVIDUAL` beneficiary's address or coordinates leak on a public path** (`GET /campaigns/:idOrSlug`, `GET /charity-campaigns/:idOrSlug/public`, members, revisions in `changedFields`, the `PLAN_CHANGED` payload). Pinned in Task 2.3: `JSON.stringify` of the real `GetCharityPublicProjectUseCase` and `GetPublicCharityCampaignUseCase` output contains neither the INDIVIDUAL address string nor its lat. Pinned in Task 5.3: an applied change request writes the `PARTY.address` revision with `is_public = false` for INDIVIDUAL and `true` for GROUP.
3. **The point feed leaks penalty or adjustment reasons or reference ids.** Pinned in Task 4.4: a real-DB check seeds `ADMIN_ADJUSTMENT +50` with a reason, `CONTENT_VIOLATION_PENALTY -20`, and a `REVERSAL`. The feed contains none of them. `JSON.stringify(response)` contains neither the reason text nor the `reference_id`. Pinned in Task 4.1: an inventory test classifies every `PointRuleTitles` key.
4. **A campaign gets stuck, never ends, or ends wrongly.** The risks:
   - the job's candidate `LIMIT` starves behind blocked rows;
   - EXECUTION jumps to SUMMARY;
   - an `ENDED` filter is still based on `end_time`;
   - `closeCampaign` refuses once `end_time` has passed.

   Pinned in Task 1.7: a real-DB check with 3 blocked campaigns plus 1 eligible and `limit = 2` still advances the eligible one; an EXECUTION campaign past `endTime` without `READY` stays EXECUTION. Pinned in Task 1.8: a campaign past `end_time` with a published summary is closable and is in `ENDED`; one without a published summary is in `ONGOING`, not in `ENDED`, and in the Admin `overdueSummary=true` list.
5. **A pending change request leaks unapproved content publicly**, or interrupts the running campaign. Pinned in Task 5.2: while a request is `PENDING`, the public project returns the approved title, media and beneficiaries; `isPubliclyVisibleProject` is still true; and `POST :id/contributions` still succeeds.

---

## Phase 1 — Gỡ đợt trao, trao ở cấp chiến dịch, tổng duyệt, điều kiện đóng, nhắc 48 giờ

### Task 1.1: core-lib error codes 0x13_5c–0x13_65 and exceptions

**Files**
- Modify: `core-lib/src/consts/error-codes.ts` (after `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED = 0x13_5b`; deprecation comments on `0x13_4a`/`0x13_4b`)
- Modify: `core-lib/src/consts/error-catalog.ts`
- Modify: `core/src/domain/exceptions/charity-campaign.exception.ts`
- Test: `core-lib/src/consts/error-catalog.spec.ts` (create if absent, else extend)

**Interfaces**
- Produces the ten exception classes:
  - `CharityBeneficiaryDistributionTimeOutOfRangeException(beneficiaries: { index: number; name: string; distributionAt: string | null }[])`: message lists the names; `details: { beneficiaries }`
  - `CharityNeedBelowEstimatedPortionsException(items: { index: number; needItemId: string | null; itemName: string; minimumQuantity: number }[])`: `details: { items }`
  - `CharityFundingBelowEstimatedAmountException(totalTargetAmount: number, totalEstimatedAmount: number)`: `details: { totalTargetAmount, totalEstimatedAmount }`
  - `CharityRehearsalNotReadyException()`
  - `CharityIntakeClosedException()`
  - `CharitySupervisorConflictException()`
  - `CharityScheduleInvalidException(gaps: string)`
  - `CharityRevisionPendingExistsException()`
  - `CharityChangeRequiresReviewException(fields: string)`: `details: { fields: string[] }`
  - `CharityCampaignSummaryNotPublishedException()`

Steps
- [ ] Failing test "mã 0x13_5c–0x13_65 đúng thứ tự spec": `ErrorCodes.CHARITY_BENEFICIARY_DISTRIBUTION_TIME_OUT_OF_RANGE === 0x135c` … `CHARITY_CAMPAIGN_SUMMARY_NOT_PUBLISHED === 0x1365`. The HTTP statuses are, in order, `[400,400,400,409,409,409,400,409,409,409]`. `CoreErrors.CHARITY_NEED_BELOW_ESTIMATED_PORTIONS.details([{index:0,needItemId:null,itemName:'Áo',minimumQuantity:300}])` deep-equals `{ items: [...] }`. `ErrorCodes.CHARITY_ROUND_NOT_FOUND === 0x134a` still holds.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core-lib -- src/consts`. Expect FAIL (undefined members).
- [ ] Implement the codes, the catalog entries (`sample` for every parameterised message) and the ten exception classes.
- [ ] Run again (pass). `npm run build --workspace=@chantam.vn/chantam.core-lib`. At root, `npm run docs:errors`, then confirm `docs/API-ERRORS.md` lists `0x135c`…`0x1365`.
- [ ] Stage: `git add suites/chantam.vn/chantam/core-lib/src/consts suites/chantam.vn/chantam/core/src/domain/exceptions docs/API-ERRORS.md`.

### Task 1.2: core-lib models — campaign-level distribution, rehearsal, gated stage

**Files**
- Modify: `core-lib/src/models/charity-distribution.ts` (+ `.spec.ts`)
- Modify: `core-lib/src/models/charity-operations.ts`: remove `CharityRoundStatuses`, `CharityRoundReadinessStatuses`, `CharityRoundChecklistKeys/Labels`, `ICharityRoundChecklistItem`, `normalizeRoundChecklist`, `CharityRoundWarningCodes`, `CharityRoundWarningHours`, `charityRoundWarnings`, and the `ROUNDS_UNSETTLED` blocker with its label
- Modify: `core-lib/src/models/charity-project.ts` (+ `charity-project.spec.ts`): `CharityPhaseKeys`, `effectiveOperationStage`
- Modify: `core-lib/src/models/charity-engagement.ts` (+ spec): drop `'ROUND_CHANGED'` from `CharityAnnouncementKinds`; `isEndedProject`
- Create: `core-lib/src/models/charity-rehearsal.ts` + `charity-rehearsal.spec.ts`; export from `core-lib/src/models/index.ts`
- Modify: `core-lib/src/consts/notification-types.ts` (`CHARITY_ORGANIZER_REMINDER`), `core-lib/src/consts/notification-targets.ts` (map it to `CHARITY_CAMPAIGN`)

**Interfaces**
- Renames (no aliases are kept):
  - `ICharityRoundPrivateDetailsInput` → `ICharityDistributionPrivateDetailsInput`
  - `ICharityRoundDistributionInput` → `ICharityDistributionInput`
  - `MaxCharityRoundEvidenceUrls` → `MaxCharityDistributionEvidenceUrls = 20`
  - `charityRoundEvidenceGaps` → `charityDistributionEvidenceGaps(input: { distributionMethod: CharityDistributionMethod | null; evidenceUrls: readonly string[]; trackingCode: string | null }): string[]`. Same rule: `null` method → `[]`.
- `export function charityDistributionSettled(input: { distributionMethod; evidenceUrls; trackingCode; beneficiaryAccount: { verified: boolean; live: boolean; sameCampaign: boolean } | null }): { settled: boolean; evidenceGaps: string[]; accountVerified: boolean }`
  - `BANK_TRANSFER` needs `beneficiaryAccount` with all three flags true.
  - A `null` method is always settled.
- `charity-rehearsal.ts`:
  - `CharityRehearsalOutcomes`
  - `CharityRehearsalChecklistKeys`
  - `CharityRehearsalChecklistLabels`
  - `ICharityRehearsalChecklistItem { key: CharityRehearsalChecklistKey; status: 'DONE' | 'NOT_DONE'; note: string | null }`
  - `normalizeRehearsalChecklist(input: readonly Partial<ICharityRehearsalChecklistItem>[]): ICharityRehearsalChecklistItem[]`: always 7 items in key order; unknown keys dropped; missing → `NOT_DONE`
  - `CharityPreEventMilestones`
  - `CharityOrganizerReminderReasons = ['REHEARSAL_NOT_READY','DISTRIBUTION_EVIDENCE_MISSING','BENEFICIARY_ACCOUNT_NOT_VERIFIED','SUMMARY_OVERDUE'] as const`
- `effectiveOperationStage(input: { stored; distribution: { startsAt; endsAt } | null; endTime; now; rehearsalReady: boolean; distributionSettled: boolean }): CharityOperationStage`
  - EXECUTION → EVENT only when `distribution && startsAt <= now && rehearsalReady`.
  - From EVENT (stored or just reached) → SUMMARY only when `(distribution?.endsAt ?? endTime) <= now && distributionSettled`.
  - EXECUTION never goes straight to SUMMARY.
- `isEndedProject(input: { isActive: boolean; endTime: Date; summaryPublishedAt: Date | null }, now: Date): boolean`. True when the summary is published, or when `!isActive && endTime <= now` (Admin close).

Steps
- [ ] Failing tests:
  - "EXECUTION quá endTime mà chưa READY vẫn ở EXECUTION": `{stored:'EXECUTION', distribution:{past,past}, rehearsalReady:false}` → `'EXECUTION'`.
  - "EXECUTION tới giờ trao + READY + đã qua endsAt + chưa đủ bằng chứng → EVENT (không nhảy SUMMARY)".
  - "EVENT qua endsAt + settled → SUMMARY"; "EVENT qua endsAt + chưa settled → EVENT".
  - "SUMMARY/PLAN giữ nguyên".
  - `normalizeRehearsalChecklist([{key:'TRANSPORT',status:'DONE'}])` has length 7, item `TRANSPORT` is `DONE` and the rest are `NOT_DONE`.
  - `charityDistributionSettled` for `BANK_TRANSFER` with evidence and `{verified:false,live:true,sameCampaign:true}` → `{ settled:false, accountVerified:false }`; `null` method → settled.
  - `CharityPhaseKeys.indexOf('REHEARSAL') === 2`; `phaseScheduleGaps` rejects REHEARSAL overlapping DISTRIBUTION.
  - `isEndedProject({isActive:true,endTime:past,summaryPublishedAt:null}) === false`.
  - `CharityCompletionBlockers` no longer contains `'ROUNDS_UNSETTLED'`; `CharityAnnouncementKinds` no longer contains `'ROUND_CHANGED'`.
  - `notification-targets.spec.ts`: `CHARITY_ORGANIZER_REMINDER` → `[CHARITY_CAMPAIGN]`.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core-lib -- src/models src/consts`. Expect failures.
- [ ] Implement. Build core-lib. Core will not compile until Task 1.4. That is expected inside the phase, so do not run core tests yet.
- [ ] Docs: core-lib `README.md` exports list (renamed symbols, `charity-rehearsal`).
- [ ] Stage the core-lib files and the README.

### Task 1.3: Migration 1804000000000 and seeds

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1804000000000-CharityCampaignLevelDistribution.ts`; modify `migrations/index.ts`
- Modify: `core/src/infrastructure/persistence/seeds/full/charity-project.ts` (`seedOperations`)
- Test: `core/test/charity-operations.check.ts` (two-step DataSource: migrations `< 1804000000000`, seed rounds, then the full set)

**Interfaces**
- `campaigns`:
  - `ADD distribution_method varchar(20) NULL CHECK IN (5 methods)`
  - `ADD distribution_contribution_types text[] NOT NULL DEFAULT '{}' CHECK <@ ARRAY['MATERIAL','MONEY','SERVICE']`
  - `ADD distribution_evidence_urls jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof = 'array' AND jsonb_array_length <= 20)`
  - `ADD distribution_service_type varchar(30)`, `distribution_service_channel varchar(15) CHECK IN (4)`
- `CREATE TABLE campaign_distribution_private_details`:
  - `campaign_id uuid PK FK campaigns ON DELETE CASCADE`
  - `beneficiary_bank_account_id uuid FK campaign_beneficiary_bank_accounts ON DELETE SET NULL`
  - the same 10 private columns as `campaign_round_private_details`
  - `updated_by`, `updated_at`
- `CREATE TABLE campaign_rehearsals`:
  - `campaign_id uuid PK FK ON DELETE CASCADE`
  - `checklist jsonb NOT NULL DEFAULT '[]'`
  - `outcome varchar(10) NULL CHECK IN ('READY','NOT_READY')`
  - `reason varchar(1000)`, `note varchar(2000)`
  - `decided_by uuid FK users ON DELETE SET NULL`, `decided_at timestamptz`
  - `CHECK (outcome IS NULL OR decided_at IS NOT NULL)`
  - `CHECK (outcome <> 'NOT_READY' OR length(btrim(reason)) > 0)`
  - `updated_by`, `updated_at`
- `campaign_phases`: replace `CHK_campaign_phases_phase` with the 5 keys including `'REHEARSAL'`.
- Data move. Code block, because the order decides correctness:
  ```sql
  -- 1. chosen round per campaign = latest non-cancelled by starts_at DESC, id DESC
  CREATE TEMP TABLE chosen_round AS
    SELECT DISTINCT ON (campaign_id) campaign_id, global_id AS round_id
    FROM campaign_distribution_rounds WHERE status <> 'CANCELLED'
    ORDER BY campaign_id, starts_at DESC, id DESC;
  -- 2. copy method, contribution types, evidence, service fields onto campaigns
  UPDATE campaigns c SET distribution_method = r.distribution_method, ... FROM chosen_round x
    JOIN campaign_distribution_rounds r ON r.global_id = x.round_id WHERE c.global_id = x.campaign_id;
  -- 3. copy private details (incl. beneficiary_bank_account_id)
  INSERT INTO campaign_distribution_private_details (...) SELECT ... FROM chosen_round x
    JOIN campaign_round_private_details p ON p.round_id = x.round_id;
  -- 4. timeline: if a campaign has no round_id IS NULL steps, adopt the chosen round's steps
  UPDATE campaign_event_steps s SET round_id = NULL FROM chosen_round x
   WHERE s.round_id = x.round_id
     AND NOT EXISTS (SELECT 1 FROM campaign_event_steps k WHERE k.campaign_id = s.campaign_id AND k.round_id IS NULL);
  DELETE FROM campaign_event_steps WHERE round_id IS NOT NULL;
  -- 5. drop round_id columns + indexes, drop UQ_campaign_event_steps_round_key,
  --    ADD CONSTRAINT UQ_campaign_event_steps_key UNIQUE (campaign_id, step_key)
  -- 6. DELETE FROM campaign_announcements WHERE kind = 'ROUND_CHANGED'; restore the 4-kind CHECK
  -- 7. DROP TABLE campaign_round_private_details, campaign_distribution_rounds
  -- 8. INSERT INTO campaign_rehearsals (campaign_id) for no one: legacy campaigns past EXECUTION are never gated
  ```
- `down()` recreates the round tables and `round_id` columns empty, using the same DDL as `1803000000000`/`1803800000000`/`1803900000000`. It drops the new columns and tables. It does not restore the data.
- Seeds: `seedOperations` guards support needs on `to_regclass('public.campaign_other_support_needs')`. The round inserts, `round_id` update and `ROUND_CHANGED` row are deleted. A new guarded block (`information_schema.columns` has `campaigns.distribution_method`) sets `OTHER_LOCATION`, one https evidence URL and a private-details row. A guarded block (`to_regclass('public.campaign_rehearsals')`) inserts one `READY` rehearsal for the seeded EVENT campaign.

Steps
- [ ] Failing real-DB checks in `charity-operations.check.ts` (two-step DataSource):
  - A campaign with rounds R1 (CANCELLED, latest), R2 (PLANNED, `SHIPPING`, `tracking_code='VN123'`, evidence 2 URLs) and R3 (older), each with 10 steps. After migrating: `distribution_method='SHIPPING'`, evidence length 2, private `tracking_code='VN123'`, exactly 10 `campaign_event_steps`, and inserting a duplicate `(campaign_id, step_key)` is rejected.
  - A campaign with campaign-level steps (`round_id NULL`) and one round keeps its own 10 steps.
  - `to_regclass('public.campaign_distribution_rounds') IS NULL`; `campaign_participations` has no `round_id` column.
  - `campaign_phases` accepts `'REHEARSAL'`; `campaign_rehearsals` rejects `NOT_READY` with an empty reason.
  - `distribution_evidence_urls` with 21 items is rejected.
- [ ] Run `npm run test:charity-operations --workspace=@chantam.vn/chantam.core`. Expect FAIL. Core does not compile yet, so run it after Task 1.4 if ts-node refuses; the migration file itself compiles.
- [ ] Implement the migration, the barrel and the seed changes.
- [ ] Docs: `docs/DATABASE.md` (new columns and tables, removed round tables, data move rule).
- [ ] Stage.

### Task 1.4: Remove the round surface; campaign-wide confirmed value; media sweep

**Files**
- Delete: `core/src/infrastructure/repository/charity-round.sql.ts`, `core/src/application/implementations/charity-project/charity-round-distribution.ts`
- Create: `core/src/infrastructure/repository/charity-distribution.sql.ts` exporting `confirmedDeliveryValueSql(alias)` (moved as-is), `CampaignConfirmedValueSql` (campaign-wide, `delivery.campaign_id = campaigns.global_id AND delivery.status = 'COMPLETED'`) and `CampaignDistributionSettledSql(campaignAlias)` (used in Task 1.7)
- Modify:
  - `core/src/domain/ports/repository/charity-operations.repository.ts`: remove `ICharityRound*`, `listRounds`, `findRound`, `createRound`, `updateRound`, `setRoundStatus`, `setRoundReadiness`, `assignToRound`, `listRoundPreEventCandidates`, `hasRounds`
  - `core/src/infrastructure/repository/charity-operations.repository.ts`: the same; `completionBlockers` drops `ROUNDS_UNSETTLED`
  - `core/src/application/contracts/charity-project/charity-operations.contract.ts`: remove every round contract
  - `charity-operations.use-cases.ts`: remove `ListCharityRoundsUseCase`, `ManageCharityRoundsUseCase`, `SaveCharityRoundUseCase`, `SetCharityRoundStatusUseCase`, `SetCharityRoundReadinessUseCase`, `AssignCharityRoundUseCase`, `toRoundPublic`
  - `charity-project.module.ts`
  - `core/src/infrastructure/controller/api/charity-campaign/charity-operations.controller.ts`: remove `GET :idOrSlug/rounds`, `GET :id/rounds/manage`, `POST :id/rounds`, `PATCH :id/rounds/:roundId`, `POST :id/rounds/:roundId/status`, `PUT :id/rounds/:roundId/readiness`, `PUT :id/round-assignments`
  - `charity-operations.dto.ts`: remove the `CharityRound*` DTOs; `charity-distribution-limits.dto.spec.ts` retargets to the Task 1.5 DTO
  - Event: `charity-event.repository.ts` port and implementation (`ensureEventSteps(campaignId)`, `listEventSteps(campaignId)`, `ON CONFLICT (campaign_id, step_key)`, drop `roundId` from `StepColumns`), `charity-event.contract.ts`, `charity-event.use-cases.ts`, `charity-event.controller.ts`, `charity-event.dto.ts`
  - Engagement: `charity-engagement.repository.ts` (`listPreEventCandidates` loses the round `NOT EXISTS`; the audience query loses `roundId`), its port, and `charity-engagement.use-cases.ts` (`ProcessCharityAnnouncementsUseCase` drops `operations` and `roundCandidates`; `announcementMessage` drops `ROUND_CHANGED` and `roundTitle`)
  - `charity-summary.repository.ts` (import from `charity-distribution.sql`)
  - `charity-campaign.repository.ts` (`create` no longer calls `insertDistributionRound`; the `ICreateCharityCampaignParams.distribution` shape is reworked in Task 1.5)
  - `core/src/application/implementations/media/sweep-orphan-media.use-case.ts` (+ `.spec.ts`)
  - Spec fixtures that `tsc` flags (`charity-operations.use-cases.spec.ts`, `charity-engagement.use-cases.spec.ts`, `charity-event.use-cases.spec.ts`)
- Test: `core/test/charity-operations.check.ts`, `core/test/charity-summary.check.ts`

**Interfaces**
- Sweep: replace the round source with `{ label: 'campaigns.distribution_evidence_urls', sql: "SELECT jsonb_array_elements_text(distribution_evidence_urls) AS value FROM campaigns WHERE jsonb_typeof(distribution_evidence_urls) = 'array'" }`.
- `ICharityEventRepository.ensureEventSteps(campaignId: string): Promise<void>` and `listEventSteps(campaignId: string)`; `ICharityEventStep` loses `roundId`.

Steps
- [ ] Failing tests:
  - Sweep spec "KHÔNG xoá ảnh bằng chứng trao của chiến dịch": the mock query for label `campaigns.distribution_evidence_urls` returns the key, and `storage.delete` is not called with it. A second test: no source label contains `campaign_distribution_rounds`.
  - "không còn route đợt trao": `Reflect.getMetadata` path scan over `CharityOperationsController.prototype` finds no path containing `round`.
  - `completionBlockers` real-DB: no `ROUNDS_UNSETTLED` key in the SELECT.
  - Real-DB (`charity-summary.check.ts`): `intakeTotals.material.confirmedValue` equals the sum of two COMPLETED deliveries (one with `confirmed_value_adjusted`) and ignores a CANCELLED one.
  - Real-DB: the sweep's live-key SQL for the new label returns the evidence URL seeded by Task 1.3.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core -- src/application/implementations/media/sweep-orphan-media.use-case.spec.ts src/application/implementations/charity-project`. Expect failures or compile errors.
- [ ] Implement the removal and the moves. `npx tsc --noEmit -p suites/chantam.vn/chantam/core/tsconfig.json` is clean, and a grep for `round_id|RoundConfirmedValueSql|insertDistributionRound|ICharityRound|prepareCharityRoundDistribution` under `core/src` finds only migration files.
- [ ] Run the unit tests, `test:charity-operations`, `test:charity-summary` and `test:charity-event` (pass). At root, `npm run docs:routes`.
- [ ] Docs:
  - `docs/API.md`: delete the round sections and add a "removed in this CR" note listing the 7 routes;
  - `docs/FEATURES.md`;
  - `docs/plan/CHARITY-PROJECT-LIFECYCLE.md` §3.18: mark "nhiều đợt trao" as "đã bỏ (CR 22/11)".
- [ ] Stage.

### Task 1.5: Campaign-level distribution — routes, create block, public read

**Files**
- Create: `core/src/application/implementations/charity-project/charity-campaign-distribution.ts` exporting `prepareCharityCampaignDistribution`
- Modify:
  - `core/src/domain/ports/repository/charity-operations.repository.ts`: new `ICharityCampaignDistribution`, `ICharityCampaignDistributionInput`, `getDistribution`, `saveDistribution`, `saveDistributionEvidence`
  - its implementation
  - `charity-operations.contract.ts`: `IGetCharityDistributionUseCase`, `ISaveCharityDistributionUseCase`, `ISaveCharityDistributionEvidenceUseCase` + Symbols
  - `charity-operations.use-cases.ts`, `charity-project.module.ts`
  - `charity-operations.controller.ts`: `GET :id/distribution`, `PUT :id/distribution`, `PUT :id/distribution/evidence`
  - `charity-operations.dto.ts`: `CharityDistributionInputDto` with the flat private fields + `beneficiaryBankAccountId?`, `CharityDistributionBodyDto { distribution }`, `CharityDistributionEvidenceBodyDto { evidence: { urls } }`, `CharityDistributionDto`, `CharityDistributionPrivateDetailsDto`, `CharityDistributionPublicDto`
- Modify: `charity-campaign.contract.ts` (`ICharityCampaignDistributionInput`: `scheduledStart/End` become optional aliases), `ICreateCharityCampaignParams.distribution: { input: ICharityCampaignDistributionInput; window: { startsAt; endsAt } | null } | null`, `charity-campaign.repository.ts` (`create` writes the campaign columns + private row + the DISTRIBUTION phase when `window`), `CreateCharityCampaignUseCase`
- Modify: `charity-project.contract.ts` (`ICharityPublicProject.distribution: { method; contributionTypes; serviceType; serviceChannel; evidenceUrls } | null`), `GetCharityPublicProjectUseCase`, `charity-project.dto.ts`
- Test: `charity-operations.use-cases.spec.ts`, `charity-campaign.use-cases.spec.ts`, `test/charity-operations.check.ts`, `test/charity-campaign.check.ts`

**Interfaces**
```ts
export interface ICharityCampaignDistributionInput {
  distributionMethod: CharityDistributionMethod | null;
  contributionTypes: readonly CharityContributionType[];
  serviceType: CharitySupportType | null;
  serviceChannel: CharityServiceChannel | null;
  privateDetails: ICharityDistributionPrivateDetailsInput & { beneficiaryBankAccountId: string | null };
}
export interface ICharityCampaignDistribution extends ICharityCampaignDistributionInput {
  campaignId: string;
  evidenceUrls: string[];
  updatedAt: Date | null;
}
prepareCharityCampaignDistribution(input: ICharityCampaignDistributionInput): ICharityCampaignDistributionInput
```
- `prepareCharityCampaignDistribution` runs the old order:
  1. trim;
  2. `stripInapplicableDistributionFields`;
  3. `charityDistributionMismatch` → 400 `0x13_58`;
  4. `charityDistributionFieldGaps` → 400 `0x13_57`.

  `OTHER_LOCATION`'s `locationLabel`/address/lat/lng no longer exist on the campaign block: the intake/beneficiary addresses replace them. The field rule drops them (Open question 1).
- `PUT :id/distribution`: `access.forEdit`. `beneficiaryBankAccountId` must be a live account of this campaign, else `ValidationFailedException(['distribution.beneficiaryBankAccountId: …'])`.
- `PUT :id/distribution/evidence`: `access.forOperate`. https only, 0–20 items, no duplicates.
- `GET :id/distribution`: `access.forOperate`; returns the private details.
- The public read picks exactly `method`, `contributionTypes`, `serviceType`, `serviceChannel`, `evidenceUrls`.

Steps
- [ ] Failing tests:
  - "PUT distribution SHIPPING thiếu carrier → 400 0x13_57".
  - "BANK_TRANSFER + ['MATERIAL'] → 400 0x13_58".
  - "beneficiaryBankAccountId của chiến dịch khác → 400".
  - "evidence http:// hoặc 21 URL → 400".
  - "public: Object.keys(project.distribution).sort() đúng 5 khoá, không có privateDetails".
  - "tạo chiến dịch có distribution + scheduledStart/End → repository.create nhận window đúng" and "không gửi scheduledStart → window null".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement, register in the module, write the controllers' `@ApiErrorResponses`.
- [ ] Real-DB:
  - Create through the real `CreateCharityCampaignUseCase` with a `DIRECT_RECIPIENT` distribution → a `campaign_distribution_private_details` row, a DISTRIBUTION phase equal to `scheduledStart`, and 0 rows in any round table (the table is gone).
  - `JSON.stringify(real GetCharityPublicProjectUseCase)` contains neither the recipient phone nor the address.
- [ ] Run unit, `test:charity`, `test:charity-operations` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (3 routes, public vs workspace table, create `distribution` block with alias note).
- [ ] Stage.

### Task 1.6: Rehearsal routes and the manual stage gates

**Files**
- Modify:
  - `core/src/domain/ports/repository/charity-project.repository.ts`: `ICharityRehearsal`, `getRehearsal(campaignId)`, `saveRehearsal(params)`, `distributionSettlement(campaignId): Promise<{ method; evidenceUrls; trackingCode; beneficiaryAccount: {...} | null }>`
  - its implementation
  - `charity-project.contract.ts`: `IGetCharityRehearsalUseCase`, `ISaveCharityRehearsalUseCase`; `ICharityWorkspace.rehearsal`
  - `charity-project.use-cases.ts`: `MoveCharityStageUseCase`, the new use cases, `GetCharityWorkspaceUseCase`, `ReplaceCharityPhasesUseCase` (accepts `REHEARSAL` with `picName/picUserId`)
  - `charity-project.module.ts`
  - `charity-project.controller.ts`: `GET :id/rehearsal`, `PUT :id/rehearsal`; `POST :id/stage` error list adds `CharityRehearsalNotReadyException`, `CharityRoundEvidenceRequiredException`, `CharityBeneficiaryAccountNotVerifiedException`
  - `charity-project.dto.ts`: `CharityRehearsalInputDto { checklist, outcome?, reason?, note? }`, `CharityRehearsalBodyDto { rehearsal }`, `CharityRehearsalDto`
- Modify: `core-lib/src/models/charity-engagement.ts` `CharityRevisionPolicies.PHASE.isImportant` adds `REHEARSAL` `startsAt`
- Test: `charity-project.use-cases.spec.ts`, `test/charity-project.check.ts`

**Interfaces**
```ts
export interface ICharityRehearsal {
  campaignId: string;
  checklist: ICharityRehearsalChecklistItem[];
  outcome: 'READY' | 'NOT_READY' | null;
  reason: string | null;
  note: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  phase: { startsAt: Date; endsAt: Date; picName: string | null; picUserId: string | null } | null;
}
```
- `PUT :id/rehearsal`:
  - `forOperate`; `normalizeRehearsalChecklist`;
  - `NOT_READY` without a reason → `ValidationFailedException`;
  - any outcome sets `decided_by/at`; `outcome` omitted keeps the stored outcome.
- `MoveCharityStageUseCase`, forward moves only:
  - `to = 'EVENT'` and `getRehearsal().outcome !== 'READY'` → `CharityRehearsalNotReadyException`.
  - `to = 'SUMMARY'`: `charityDistributionSettled(distributionSettlement())`. Evidence gaps → `CharityRoundEvidenceRequiredException(gaps.join(', '))`. `BANK_TRANSFER` without a verified, live, same-campaign account → `CharityBeneficiaryAccountNotVerifiedException`.
  - Backward moves are unchanged.

Steps
- [ ] Failing tests:
  - "chuyển tay EXECUTION→EVENT khi tổng duyệt NOT_READY → 409 0x13_5f, moveStage không gọi".
  - "chưa có dòng tổng duyệt → 409 0x13_5f".
  - "READY → chuyển được".
  - "EVENT→SUMMARY thiếu bằng chứng SHIPPING → 409 0x13_59 'trackingCode'".
  - "BANK_TRANSFER tài khoản chưa xác thực → 409 0x13_5b".
  - "method null → SUMMARY được".
  - "PUT rehearsal NOT_READY không lý do → 400".
  - "checklist 3 mục → lưu đủ 7".
- [ ] Run the focused spec. Expect failures.
- [ ] Implement.
- [ ] Real-DB (`charity-project.check.ts`): `saveRehearsal` with `READY` sets `decided_at`. `distributionSettlement` of a `BANK_TRANSFER` campaign linked to a closed (`valid_to` set) verified account → `beneficiaryAccount.live === false`. `PUT :id/phases` with a REHEARSAL window inside PREPARATION→DISTRIBUTION persists.
- [ ] Run unit and `test:charity-project` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (rehearsal routes, the 7 checklist keys, gates on `POST :id/stage`).
- [ ] Stage.

### Task 1.7: Gated job, gated read path, organizer reminders, 48-hour milestones

**Files**
- Modify:
  - `core/src/infrastructure/repository/charity-campaign.repository.ts`: `IRow` + `Columns` add `rehearsal_ready` and `distribution_settled` via `CampaignDistributionSettledSql('campaigns')`; `toCampaign` passes them into `effectiveOperationStage`
  - `charity-project.repository.ts` and its port: `listStageCandidates(limit)` returns `{ campaignId; stored; distribution; endTime; rehearsalReady; distributionSettled }[]` and only rows whose effective target differs from stored; new `listBlockedStageCampaigns(limit)` returns `{ campaignId; ownerId; reason: CharityOrganizerReminderReason }[]`
  - `charity-project.use-cases.ts` `AdvanceCharityStagesUseCase` (injects `IDispatchNotificationUseCase`)
  - `charity-engagement.repository.ts` + port: `listPreEventCandidates` returns `{ campaignId; milestone: CharityPreEventMilestone; startsAt }[]` for both REHEARSAL and DISTRIBUTION phases
  - `charity-engagement.use-cases.ts` `ProcessCharityAnnouncementsUseCase` (`dedupeKey = ${milestone}:${epochMs}`, payload `{ milestone, startsAt }`) and `announcementMessage` (`PRE_EVENT` text per milestone)
  - `core/src/infrastructure/cli/charity-advance-stage.cli.ts` (prints `reminded`)
- Test: `charity-project.use-cases.spec.ts`, `charity-engagement.use-cases.spec.ts`, `test/charity-project.check.ts`, `test/charity-engagement.check.ts`

**Interfaces**
- `CampaignDistributionSettledSql(alias)` is a boolean SQL expression equal to `charityDistributionSettled`:
  ```sql
  (c.distribution_method IS NULL OR (
     jsonb_array_length(c.distribution_evidence_urls) > 0
     AND (c.distribution_method <> 'SHIPPING' OR btrim(coalesce(p.tracking_code,'')) <> '')
     AND (c.distribution_method <> 'BANK_TRANSFER' OR EXISTS (
       SELECT 1 FROM campaign_beneficiary_bank_accounts a
        WHERE a.global_id = p.beneficiary_bank_account_id AND a.campaign_id = c.global_id
          AND a.valid_to IS NULL AND a.verified_at IS NOT NULL))))
  ```
  `p` is a correlated `campaign_distribution_private_details` lookup written inside the expression so callers do not join.
- `listStageCandidates` WHERE adds the gates:
  - EXECUTION rows need `phase.starts_at <= now() AND rehearsal.outcome = 'READY'`;
  - EVENT rows need `COALESCE(phase.ends_at, end_time) <= now() AND <settled>`.

  Blocked rows never take a `LIMIT` slot.
- `AdvanceCharityStagesUseCase.handle` returns `{ advanced; checked; reminded }`. For each blocked row it dispatches `CHARITY_ORGANIZER_REMINDER` to the owner with `idempotencyKey = CHARITY_ORGANIZER_REMINDER:${campaignId}:${reason}:${vietnamDayStart(now).toISOString()}` (one per day per reason).
- Reasons and when they fire:
  - `REHEARSAL_NOT_READY`: EXECUTION past `distribution.startsAt`;
  - `DISTRIBUTION_EVIDENCE_MISSING` / `BENEFICIARY_ACCOUNT_NOT_VERIFIED`: EVENT past the end;
  - `SUMMARY_OVERDUE`: Task 1.8.
- No REHEARSAL phase means no rehearsal 48-hour reminder (§3.17g).

Steps
- [ ] Failing unit tests:
  - "job: ứng viên chưa READY không chuyển, gửi nhắc REHEARSAL_NOT_READY một lần/ngày" (dispatch called with that key).
  - "job không bao giờ EXECUTION→SUMMARY".
  - "notify: REHEARSAL và DISTRIBUTION là hai thông báo, dedupeKey 'REHEARSAL:<ms>' và 'DISTRIBUTION:<ms>'".
  - "không có phase REHEARSAL → không nhắc mốc tổng duyệt".
- [ ] Failing real-DB checks:
  - (`charity-project.check.ts`) 3 EXECUTION campaigns past `starts_at` without READY plus 1 with READY, `listStageCandidates(2)` → contains the READY one. After the job: READY one is `EVENT`, the others `EXECUTION`.
  - An EXECUTION campaign past `end_time` without READY: `findByGlobalId().operationStage === 'EXECUTION'`.
  - An EVENT campaign past end with `SHIPPING`, evidence and no tracking code → stays `EVENT`, and `distribution_settled` is false. Adding the tracking code → the read path returns `SUMMARY` before the job runs.
  - SQL/TS parity: for 5 seeded combinations, the `CampaignDistributionSettledSql` value equals `charityDistributionSettled` over `distributionSettlement()`.
  - (`charity-engagement.check.ts`) the REHEARSAL phase 30 hours ahead → one candidate with `milestone='REHEARSAL'`. After enqueueing, a second call returns none.
- [ ] Run the focused specs, `test:charity-project`, `test:charity-engagement`. Expect failures.
- [ ] Implement.
- [ ] Run (pass), plus `test:charity` (the read model changed).
- [ ] Docs: API.md (stage gates, read-path effective stage, reminder notification type), FEATURES.md.
- [ ] Stage.

### Task 1.8: Close only when the summary is published; `ENDED`; overdue list; phase 1 checks and commit

**Files**
- Modify:
  - `charity-campaign.contract.ts`: `ICloseCharityCampaignCommand` adds `force?: boolean; reason?: string`; `IListAdminCharityCampaignsCommand` adds `overdueSummary?: boolean`
  - `charity-campaign.use-cases.ts`: `CloseCharityCampaignUseCase`, `ListAdminCharityCampaignsUseCase`
  - `charity-campaign.repository.ts` and its port: `phaseFilter`; `closeCampaign` sets `end_time = LEAST(end_time, now())` with no `end_time > now()` guard and keeps `CHK_campaigns_time_order` satisfied; admin list `overdueSummary`; `ICharityCampaign.summaryPublishedAt: Date | null`; new `listOverdueSummaries(limit)`
  - `charity-campaign.controller.ts`: `POST :id/close` takes an optional `CloseCharityCampaignBodyDto { close?: { force?: boolean; reason?: string } }`; Admin `GET` takes the `overdueSummary` query
  - `charity-campaign.dto.ts`
  - `AdvanceCharityStagesUseCase` (the `SUMMARY_OVERDUE` reminder)
  - `charity-campaign.use-cases.spec.ts` fixtures (`summaryPublishedAt: null`) and every spec that builds `ICharityCampaign`
- Test: `charity-campaign.use-cases.spec.ts`, `test/charity-campaign.check.ts`

**Interfaces**
- Close rule:
  - organizer, and Admin without `force`, need `summaryPublishedAt !== null`, else `CharityCampaignSummaryNotPublishedException`;
  - Admin with `force: true` needs a trimmed `reason` (else `ValidationFailedException`) and writes `admin.appendAudit({ action: 'CHARITY_CAMPAIGN_FORCE_CLOSE', … reason })`;
  - suspension (`SetCharityCampaignActiveUseCase`, report suspension) and consent-withdrawal hiding are unchanged.
- `phaseFilter`:
  - `ENDED`: `(EXISTS (SELECT 1 FROM campaign_summaries s WHERE s.campaign_id = campaigns.global_id AND s.published_at IS NOT NULL) OR (NOT campaigns.is_active AND campaigns.end_time <= now()))`;
  - `ONGOING`: `start_time <= now() AND NOT <ENDED>`;
  - `UPCOMING` is unchanged.
- `overdueSummary`: `campaigns.is_active AND campaigns.end_time <= now() AND NOT EXISTS published summary`.

Steps
- [ ] Failing tests:
  - "đóng khi chưa công khai tổng kết → 409 0x13_65, closeCampaign không gọi".
  - "Admin force không lý do → 400"; "Admin force có lý do → đóng + appendAudit".
  - "đã công khai → đóng được".
- [ ] Failing real-DB checks (`charity-campaign.check.ts`):
  - A campaign with `end_time` in the past and no summary → listed under `ONGOING` and not `ENDED`, `overdueSummary=true` lists it, `is_active` stays true.
  - Publish its summary → listed under `ENDED`. The real `CloseCharityCampaignUseCase` succeeds although `end_time` has passed, and `end_time` does not move forward.
  - A suspended campaign (future `end_time`, `is_active=false`) is not `ENDED`.
- [ ] Run the focused spec and `test:charity`. Expect failures.
- [ ] Implement.
- [ ] Phase 1 checks (all must pass):
  - `npm run build --workspace=@chantam.vn/chantam.core-lib`
  - `npm run test --workspace=@chantam.vn/chantam.core-lib`
  - `npm run test --workspace=@chantam.vn/chantam.core`
  - `test:charity`, `test:charity-contribution`, `test:charity-project`, `test:charity-operations`, `test:charity-summary`, `test:charity-engagement`, `test:charity-event`, `test:charity-participation`, `test:charity-points`, `test:seed-full`, `test:notification-target`
  - at root: `npm run docs:routes`, `npm run docs:errors`, `npm run docs:routes:check`, `npm run docs:errors:check`, `npm run lint:check`, `npm run format:check`
- [ ] Docs: API.md (close rule, force close, `ENDED`/`ONGOING` meaning, `overdueSummary`), FEATURES.md.
- [ ] Commit:
  ```
  git add -A suites/chantam.vn/chantam docs
  git commit -m "feat(charity): gỡ đợt trao, trao ở cấp chiến dịch, tổng duyệt chặn sự kiện, chỉ đóng khi tổng kết đã công khai (migration 1804000000000)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

## Phase 2 — Đơn vị nhận, ràng buộc số suất, địa điểm tiếp nhận, ba khung thời gian

### Task 2.1: core-lib rules — schedule, portions, beneficiary window, public beneficiary

**Files**
- Create: `core-lib/src/models/charity-beneficiary-plan.ts` + `.spec.ts`; `core-lib/src/models/charity-schedule.ts` + `.spec.ts`; export both from `models/index.ts`
- Modify: `core-lib/src/models/charity-project.ts` (config key constants), `core-lib/src/models/charity-engagement.ts` (`PARTY` policy: add the fields `estimatedPortions`, `estimatedAmount`, `distributionAt`, `location`; the `address` privacy rule)

**Interfaces**
- `charity-schedule.ts`:
  - `ICharitySchedule { intakeStartsAt: Date; intakeEndsAt: Date | null; distributionStartsAt: Date | null; distributionEndsAt: Date | null; endTime: Date }`
  - `charityScheduleGaps(schedule: ICharitySchedule): string[]`: checks each adjacent pair that is present; a missing value skips the pairs that involve it
  - `charityScheduleComplete(schedule): string[]`: missing fields for submit
- `charity-beneficiary-plan.ts`:
  - `ICharityBeneficiaryPlan { name: string; beneficiaryKind: CharityBeneficiaryKind; estimatedPortions: number; estimatedAmount: number; address: string | null; distributionAt: Date | null }`
  - `totalEstimatedPortions(list): number`, `totalEstimatedAmount(list): number`
  - `minimumQuantityFor(totalPortions: number, quantityPerPortion: number): number` (0 when `totalPortions = 0`)
  - `needPortionShortfalls(needs: readonly { index: number; needItemId: string | null; itemName: string; targetQuantity: number; quantityPerPortion: number }[], totalPortions: number)`: rows below the minimum, with `minimumQuantity`
  - `fundingBelowEstimate(totalTargetAmount: number, totalEstimatedAmount: number): boolean`
  - `beneficiariesOutsideWindow(list, window: { startsAt: Date; endsAt: Date } | null): { index; name; distributionAt }[]`: a `null` `distributionAt` is not "outside"; `null` window → `[]`
  - `beneficiarySubmitGaps(list): string[]`: `beneficiaries[i].address` / `.distributionAt` missing
  - `toPublicBeneficiary(party: ICharityBeneficiaryPartyLike): ICharityPublicBeneficiary`: explicit pick. `INDIVIDUAL` → `address: null, location: null`; `GROUP` → address + `{ lat, lng }`. Always `name`, `beneficiaryKind`, `estimatedPortions`, `estimatedAmount`, `distributionAt`. Never phone or PIC fields.
- Config constants:
  - `CharityMaxBeneficiariesConfigKey = 'charity.max_beneficiaries_per_campaign'`, `DefaultCharityMaxBeneficiaries = 20`
  - `CharityMaxIntakeLocationsConfigKey = 'charity.max_intake_locations'`, `DefaultCharityMaxIntakeLocations = 10`
  - `normalizeMaxBeneficiaries`, `normalizeMaxIntakeLocations`
- `CharityRevisionPolicies.PARTY.isPrivate`: `address`/`location` are private only when `row.beneficiaryKind === 'INDIVIDUAL'`, while `phone`/`picName`/`picPhone`/`picUserId`/`evidenceUrls` stay private. This applies §3.17d now, so phase 2 edits already log correctly.

Steps
- [ ] Failing tests:
  - "A 200 + B 100, quantityPerPortion 1, target 299 → minimumQuantity 300"; "target 300 → không thiếu"; "gạo 5/suất → 1500"; "tổng suất 0 → không áp".
  - `fundingBelowEstimate(999, 1000) === true`.
  - "distributionAt ngoài khung → trả đúng đơn vị"; "khung null → []".
  - `charityScheduleGaps`: `intakeEndsAt > distributionStartsAt` → one gap; equal is allowed; `distributionEndsAt > endTime` → one gap.
  - "public INDIVIDUAL: address null, location null, không có khoá phone/picPhone": `Object.keys(toPublicBeneficiary(x))` has no `phone`.
  - "PARTY address của GROUP là công khai, của INDIVIDUAL là riêng tư" via `CharityRevisionPolicies.PARTY.isPrivate('address', {beneficiaryKind:'GROUP'}) === false`.
- [ ] Run the core-lib specs. Expect failures.
- [ ] Implement. Build core-lib.
- [ ] Stage.

### Task 2.2: Migration 1804100000000, read models, config keys, seeds

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1804100000000-CharityBeneficiaryPlanAndSchedule.ts`; barrel
- Modify:
  - `charity-campaign.repository.ts` (`IRow`, `Columns`, `toCampaign`) and port `ICharityCampaign`: `intakeEndsAt`, `intakeStartsAt` (= `startTime`), `totalEstimatedPortions`, `totalEstimatedAmount`, `intakeLocations: ICharityIntakeLocation[]`
  - `charity-project.repository.ts` + port: `ICharityPartyInput`/`ICharityParty` add `estimatedPortions`, `estimatedAmount`, `lat`, `lng`, `distributionAt`, `consentStatus`; `ICharityItemNeed` adds `quantityPerPortion`, `minimumQuantity`; `ICharityFundingNeedInput` drops `receivingUnit`
  - DTOs: `charity-campaign.dto.ts` (`CharityCampaignResponseDto`), `charity-project.dto.ts`
  - `core/src/application/contracts/admin-config/admin-config.use-cases.ts` (two keys)
  - `seeds/full/charity-project.ts` (funding need insert drops `receiving_unit`; guarded intake-location and beneficiary-plan blocks), `seeds/full/charity.ts` if it names parties
  - Spec fixtures building `ICharityCampaign` / `ICharityParty`
- Test: `core/test/charity-project.check.ts`, `core/test/config-inventory.check.ts` (via `test:config-inventory`)

**Interfaces**
- `campaign_parties`:
  - `ADD estimated_portions integer NOT NULL DEFAULT 0 CHECK (>= 0)`
  - `ADD estimated_amount bigint NOT NULL DEFAULT 0 CHECK (>= 0)`
  - `ADD location geography(Point,4326) NULL` + GiST `IDX_campaign_parties_location`
  - `ADD distribution_at timestamptz NULL`
- `campaign_need_items`: `ADD quantity_per_portion integer NOT NULL DEFAULT 1 CHECK (>= 1)`.
- `campaign_funding_needs`: `DROP COLUMN receiving_unit`. `down()` re-adds it as `varchar(200)`.
- `campaigns`: `ADD intake_ends_at timestamptz NULL`, backfilled with `COALESCE(PREPARATION.ends_at, DISTRIBUTION.starts_at, end_time)` per §3.16. The values are not range-checked in SQL: the existing data is test data and the rule lives in `charityScheduleGaps`.
- `CREATE TABLE campaign_intake_locations`:
  - `id BIGSERIAL`, `global_id uuid UNIQUE DEFAULT gen_random_uuid()`
  - `campaign_id FK ON DELETE CASCADE`, `position smallint NOT NULL`
  - `label varchar(200) NOT NULL CHECK (length(btrim) > 0)`, `address varchar(500)`
  - `location geography(Point,4326)`
  - `schedule_note varchar(300)`, `contact_name varchar(200)`, `contact_phone varchar(30)`
  - `created_at`, `updated_at`
  - `UNIQUE (campaign_id, position)`; GiST index
- Backfill one intake location per campaign from `location_label`/`location` (`label = COALESCE(location_label, 'Điểm tiếp nhận')`).
- Seed `system_configs` for the two keys (`ON CONFLICT DO NOTHING`).
- `ICharityIntakeLocation { locationId; position; label; address; lat; lng; scheduleNote; contactName; contactPhone }`.

Steps
- [ ] Failing real-DB checks (two-step DataSource, `< 1804100000000`):
  - A campaign with PREPARATION ending D1 and DISTRIBUTION starting D2 → `intake_ends_at = D1`. With no PREPARATION → D2. With neither → `end_time`.
  - The campaign's `location_label` becomes intake location position 0 with the same coordinates.
  - `quantity_per_portion = 0` is rejected; `estimated_portions = -1` is rejected.
  - `findByGlobalId().totalEstimatedPortions` equals the sum over BENEFICIARY parties.
- [ ] Run `test:charity-project` and `test:config-inventory`. Expect FAIL.
- [ ] Implement; register both keys with ranges; add both keys to `docs/CONFIG-INVENTORY.md`.
- [ ] Run (pass), plus `test:seed-full` and `test:notification-target`.
- [ ] Docs: DATABASE.md.
- [ ] Stage.

### Task 2.3: Beneficiaries on create and `PUT :id/parties`, portion and funding floors, public projection

**Files**
- Create: `core/src/application/implementations/charity-project/charity-change-review.ts` exporting `directChangeAllowed(deps: { entitlements: IEntitlementRepository; admin: IAdminConfigRepository }, params: { campaign: ICharityCampaign; actorUserId: string; asAdmin: boolean }): Promise<boolean>`. It returns true when the campaign is not `APPROVED`, when the actor is Admin (`campaign.manage`), or when `resolveCharityApprovalStatus(...)` would publish without review (§3.17b).
- Create: `core/src/application/implementations/charity-project/charity-portion-guard.ts` exporting `assertPortionFloors(input: { needs; fundingTargets: number[]; beneficiaries: readonly ICharityBeneficiaryPlan[] }): void`. It throws `CharityNeedBelowEstimatedPortionsException` first, then `CharityFundingBelowEstimatedAmountException`.
- Modify:
  - `charity-campaign.contract.ts` (`ICreateCharityCampaignInput.beneficiaries?: ICharityBeneficiaryUnitInput[]`, `needs[].quantityPerPortion?`, `beneficiary.estimatedPortions?/estimatedAmount?`)
  - `ICreateCharityCampaignParams.beneficiaries`
  - `charity-campaign.repository.ts` (`create` inserts BENEFICIARY parties with `sort_order = index`)
  - `CreateCharityCampaignUseCase`: removes `CharityBeneficiaryNotApplicableException` for `ORGANIZED_CAMPAIGN` + `beneficiaries[]`, enforces the max from config, runs `assertPortionFloors`
  - `ReplaceCharityPartiesUseCase`, `UpdateCharityItemNeedUseCase`, `SaveCharityFundingNeedUseCase` (both directions)
  - `GetCharityPublicProjectUseCase` + `ICharityPublicProject.beneficiaries: ICharityPublicBeneficiary[]` sorted by `distributionAt ASC NULLS LAST, sortOrder`
  - `GetPublicCharityCampaignUseCase` (`GET /campaigns/:idOrSlug` returns the same `beneficiaries`)
- Modify DTOs:
  - `charity-campaign.dto.ts`: `CharityBeneficiaryUnitDto` with `name`, `beneficiaryKind`, `address?`, `phone?`, `picName?`, `picPhone?`, `consentStatus?`, `estimatedPortions`, `estimatedAmount`, `lat?`, `lng?`, `distributionAt?`; `WriteCharityCampaignDto.beneficiaries?` `@ArrayMaxSize(100)` (the real max comes from config); `quantityPerPortion?` on the need DTO
  - `charity-project.dto.ts`: party DTO fields, `CharityPublicBeneficiaryDto`, item-need `quantityPerPortion`/`minimumQuantity`; drop `receivingUnit` from funding DTOs
- Test: `charity-campaign.use-cases.spec.ts`, `charity-project.use-cases.spec.ts`, `test/charity-project.check.ts`, `test/charity-campaign.check.ts`

**Interfaces**
- `PUT :id/parties` after approval, when `directChangeAllowed` is false: compare with `listParties`. Adding or removing a BENEFICIARY row, or changing `estimatedPortions`/`estimatedAmount`, → `CharityChangeRequiresReviewException('beneficiaries')`. Other fields apply. Before approval everything applies.
- Both directions:
  - Item need create/update: `targetQuantity < minimumQuantityFor(totalPortions, quantityPerPortion)` → `0x13_5d`. This sits next to the existing surplus-explanation rule, so a lowered target still has to explain the surplus and still cannot go below the minimum.
  - Parties update: recompute against all active item needs and the sum of funding `targetAmount`; a shortfall → `0x13_5d`/`0x13_5e` listing the needs to raise.
  - Funding need save: the sum of `target_amount` over non-closed funding needs after the change must be ≥ `totalEstimatedAmount`, else `0x13_5e`.
- Public: `toPublicBeneficiary` only (Review Focus 2).

Steps
- [ ] Failing tests:
  - "ORGANIZED_CAMPAIGN gửi beneficiaries[] → tạo, không ném NotApplicable".
  - "vượt charity.max_beneficiaries_per_campaign (cấu hình 2, gửi 3) → 400".
  - "A 200 + B 100, áo quantityPerPortion 1 target 299 → 400 0x13_5d details.items[0].minimumQuantity = 300"; "300 → tạo".
  - "PUT parties A lên 250 khi áo 300 → 400 0x13_5d" (acceptance §13).
  - "tổng tiền mục tiêu < tổng ước tính → 400 0x13_5e".
  - "sau duyệt, owner thường đổi estimatedPortions → 409 0x13_64; đổi phone → áp ngay".
  - "owner có quyền đăng không cần duyệt đổi estimatedPortions → áp ngay".
  - "public: INDIVIDUAL address null, GROUP có address".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB:
  - Create through the real use case with 3 beneficiaries (2 GROUP, 1 INDIVIDUAL with address `'Số 12 ngõ 3, Hẻm Riêng'` and lat `21.0123`) → 3 BENEFICIARY rows. `JSON.stringify` of the real `GetCharityPublicProjectUseCase` and `GetPublicCharityCampaignUseCase` contains neither `'Hẻm Riêng'` nor `'21.0123'` (Review Focus 2).
  - `PUT parties` then `listChangedFields({ publicOnly: true })` has no INDIVIDUAL address revision.
- [ ] Run unit, `test:charity`, `test:charity-project` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (create `beneficiaries[]`, parties body, the two floors with error details, public beneficiary shape), FEATURES.md.
- [ ] Stage.

### Task 2.4: Intake locations and the three time windows

**Files**
- Modify:
  - `charity-campaign.contract.ts` (`intakeLocations?`, `intakeStartsAt?` alias of `startTime`, `intakeEndsAt?`, `distributionStartsAt?`, `distributionEndsAt?`)
  - `ICreateCharityCampaignParams` (`intakeLocations`, `intakeEndsAt`, `distributionWindow`)
  - `charity-campaign.repository.ts`: `create`; new `replaceIntakeLocations(params)` syncs `campaigns.location`/`location_label` to the first location with coordinates in the same transaction; new `saveSchedule(params)` updates `start_time`, `intake_ends_at`, `end_time` and upserts the DISTRIBUTION phase in one transaction
  - `CreateCharityCampaignUseCase` (the legacy `lat/lng/locationLabel` alias becomes one intake location when `intakeLocations` is absent; neither given → `ValidationFailedException(['intakeLocations: tối thiểu 1'])`; the max comes from config)
  - `charity-project.contract.ts` + `charity-project.use-cases.ts`: `ReplaceCharityIntakeLocationsUseCase`, `SaveCharityScheduleUseCase`; `ReplaceCharityPhasesUseCase` runs `beneficiariesOutsideWindow` when DISTRIBUTION moves
  - `UpdateCharityItemNeedUseCase` (`intakeDeadline <= intakeEndsAt`)
  - `ReplaceCharityPartiesUseCase` (`distributionAt` inside the window)
  - `PostponeCharityDistributionUseCase` (same window check)
  - `charity-project.module.ts`
  - `charity-project.controller.ts`: `PUT :id/intake-locations`, `PUT :id/schedule`
  - DTOs: `CharityIntakeLocationDto`, `CharityIntakeLocationsBodyDto { intakeLocations }`, `CharityScheduleDto`, `CharityScheduleBodyDto { schedule }`
  - Public project and `GET /campaigns/:idOrSlug` return `intakeLocations` (full: they are public by CR §3.4)
- Test: `charity-campaign.use-cases.spec.ts`, `charity-project.use-cases.spec.ts`, `test/charity-campaign.check.ts`

**Interfaces**
- `SaveCharityScheduleUseCase.handle({ campaignId, userId, schedule: { intakeStartsAt; intakeEndsAt; distributionStartsAt; distributionEndsAt; endTime } })`:
  1. `charityScheduleGaps` → `CharityScheduleInvalidException(gaps.join('; '))`;
  2. `beneficiariesOutsideWindow` → `CharityBeneficiaryDistributionTimeOutOfRangeException(list)`;
  3. any need with `intakeDeadline > intakeEndsAt` → `CharityScheduleInvalidException`.
- Applies directly after approval (§2.2 "Áp dụng ngay").

Steps
- [ ] Failing tests:
  - "tạo với 3 intakeLocations + ba khung + 3 đơn vị trong một lần gọi → repository.create nhận đủ" (acceptance §13).
  - "intakeEndsAt > distributionStartsAt → 400 0x13_62".
  - "đơn vị distributionAt ngoài khung trao → 400 0x13_5c details.beneficiaries[0].name".
  - "PUT schedule rút khung trao làm đơn vị B ra ngoài → 400 0x13_5c, saveSchedule không gọi".
  - "không gửi intakeLocations nhưng có lat/lng/locationLabel → một điểm"; "không có gì → 400".
  - "intakeLocations 11 với cấu hình 10 → 400".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB: `replaceIntakeLocations` with [no coords, coords X] → `campaigns.location` equals X and `location_label` equals the second label. `/nearby`-style discovery (`ICharityCampaignRepository` list with `near`) still finds the campaign at X.
- [ ] Run unit and `test:charity` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (intake locations, schedule route, the order rule, aliases kept one release).
- [ ] Stage.

### Task 2.5: Submit requirements and `CHARITY_INTAKE_CLOSED`; phase 2 checks and commit

**Files**
- Modify:
  - `SubmitCharityProjectUseCase`, `CreateCharityCampaignUseCase` (`submit` true) and the Admin create path: add `beneficiarySubmitGaps(...)` and `charityScheduleComplete(...)` to the gaps that feed `CharitySubmitRequirementsUnmetException`
  - Intake gate: `SubmitCharityContributionUseCase` (not on `WITHDRAW` or edits of existing contributions), `OfferCharitySupportUseCase`, `JoinCharityCampaignUseCase` (every role in this phase; Task 3.2 narrows it), `RegisterCharityVolunteerUseCase`
  - The controllers' `@ApiErrorResponses` (`CharityIntakeClosedException`): `POST :id/contributions`, `POST :id/other-support-needs/:supportNeedId/offers`, `POST :id/participation`, `POST :id/volunteer-needs/:volunteerNeedId/registrations`
- Modify: `core-lib/src/models/charity-schedule.ts` (from Task 2.1) adds `isIntakeClosed(campaign: { intakeEndsAt: Date | null }, now: Date): boolean` (`null` → false)
- Test: the use-case specs, `test/charity-contribution.check.ts`, `test/charity-participation.check.ts`

**Interfaces**
- `UpdateCharityContributionUseCase` and the withdraw paths are never gated (§3.9).

Steps
- [ ] Failing tests:
  - "gửi duyệt khi đơn vị thiếu distributionAt → 409 0x13_56 'beneficiaries[0].distributionAt'" on all three paths (create-submit, `POST :id/submit`, Admin create).
  - "nháp submit:false không kiểm".
  - "sau intakeEndsAt: đóng góp mới → 409 0x13_60; rút đóng góp → được; nhận hỗ trợ → 409; đăng ký tham gia → 409; đăng ký tuyển công sức → 409".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB (`charity-contribution.check.ts`): set `intake_ends_at = now() - interval '1 minute'` by SQL. The real `SubmitCharityContributionUseCase` rejects, and the `campaign_contributions` count is unchanged.
- [ ] Phase 2 checks:
  - the same list as Task 1.8;
  - plus `test:config-inventory`;
  - plus a grep confirming `receiving_unit`/`receivingUnit` appear only in migrations.
- [ ] Docs: API.md (submit requirements, the `0x13_60` routes), FEATURES.md.
- [ ] Commit:
  ```
  git add -A suites/chantam.vn/chantam docs
  git commit -m "feat(charity): đơn vị nhận có suất, tiền, địa chỉ, giờ trao; ràng buộc số suất; địa điểm tiếp nhận; ba khung thời gian (migration 1804100000000)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

## Phase 3 — Giám sát viên, `organizer`, `members`

### Task 3.1: Migration 1804200000000 and the role in the model

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1804200000000-CharitySupervisorRole.ts`; barrel
- Modify:
  - `core-lib/src/models/charity-campaign.ts` (`CharityParticipationRoles`, `CharityParticipationRole`)
  - `core-lib/src/models/charity-participation-requirements.ts`: rename `MaxCharityMinimumParticipants` → `MaxCharityMinimumSupervisors`, `charityParticipationRequirementGaps` → `charitySupervisorRequirementGaps`, `charityMinimumParticipantsMet` → `charityMinimumSupervisorsMet`
  - `ICharityCampaign`: `minimumParticipants` → `minimumSupervisors`, `minimumParticipantRank` → `minimumSupervisorRank`
  - `ICreateCharityCampaignParams`, `IUpdateAdminCharityCampaignCommand`, `ICreateCharityCampaignInput`
  - `charity-campaign.repository.ts` (`IRow`, `Columns`, insert/update SQL)
  - `charity-participation.repository.ts` + port (`role` on rows; `register(params & { role })`)
  - DTOs `charity-campaign.dto.ts` (`minimumSupervisors`, `minimumSupervisorRank`), `charity-participation.dto.ts` (`role`)
  - Every spec fixture that `tsc` flags
- Test: `core/test/charity-participation.check.ts`

**Interfaces**
- `campaign_participations`: `ADD role varchar(12) NOT NULL DEFAULT 'PARTICIPANT' CHECK IN ('PARTICIPANT','SUPERVISOR')`. The unique `(campaign_id, user_id)` stays.
- `campaigns`: `RENAME COLUMN minimum_participants TO minimum_supervisors`, `minimum_participant_rank TO minimum_supervisor_rank`, and rename their CHECK constraints. `down()` reverses this.
- Seeds name neither column. If `seeds/full/charity.ts` inserts `minimum_participants`, guard it by `information_schema.columns`.

Steps
- [ ] Failing real-DB check (two-step `< 1804200000000`): a campaign with `minimum_participants = 3` and rank `SILVER` → after migrating, `minimum_supervisors = 3` and `minimum_supervisor_rank = 'SILVER'`; an existing participation → `role = 'PARTICIPANT'`; `role = 'BOSS'` is rejected.
- [ ] Run `test:charity-participation`. Expect FAIL.
- [ ] Implement the migration and the renames across the code. `tsc --noEmit` is clean, and a grep for `minimumParticipant|minimum_participant` finds only migrations.
- [ ] Run (pass), `test:seed-full`, `test:notification-target`.
- [ ] Docs: DATABASE.md.
- [ ] Stage.

### Task 3.2: Supervisor registration, intake exemption, summary count

**Files**
- Modify:
  - `charity-campaign.contract.ts` (`IJoinCharityCampaignCommand.role?: CharityParticipationRole`, default `'PARTICIPANT'`)
  - `JoinCharityCampaignUseCase`
  - `ICharityCampaignRepository.register({ campaignId; userId; role })` and `findParticipation({ campaignId; userId }): Promise<{ status; role; checkedInAt } | null>` (replaces `findParticipationStatus` at the call sites that need the role)
  - `ManageCharityCoordinatorsUseCase`: adding a coordinator who is an active supervisor → `CharitySupervisorConflictException`
  - `charity-campaign.controller.ts` (`POST :id/participation` takes an optional body `JoinCharityCampaignBodyDto { participation?: { role? } }`; errors add `CharitySupervisorConflictException`, `CharityIntakeClosedException`)
  - `charity-campaign.dto.ts`
  - `charity-summary.use-cases.ts` + `charity-summary.contract.ts` (board `supervisors: { checkedIn: number; minimumSupervisors: number; met: boolean }`, replacing `minimumParticipants`/`minimumParticipantsMet`)
  - `charity-summary.repository.ts` (count `role = 'SUPERVISOR' AND status IN ('CHECKED_IN','COMPLETED')`)
  - `charity-summary.dto.ts`
- Test: `charity-campaign.use-cases.spec.ts`, `charity-summary.use-cases.spec.ts`, `test/charity-participation.check.ts`

**Interfaces**
- Join rules, in order:
  1. Visible and active as today.
  2. `SUPERVISOR`: the actor is `createdBy` or an active coordinator → `CharitySupervisorConflictException`.
  3. Intake gate: `PARTICIPANT` closes at `intakeEndsAt`. `SUPERVISOR` closes at `distribution.startsAt` (`null` → `endTime`), both with `CharityIntakeClosedException`.
  4. Rank: only `SUPERVISOR` checks `minimumSupervisorRank` against the DB rank (`CharityParticipantRankTooLowException`). `PARTICIPANT` has no rank gate.
  5. One person, one role: an active row with the other role → `CharityAlreadyRegisteredException`. Switching role = cancel, then register again, allowed only while `checkedInAt === null` (cancellation already enforces this).
- Supervisors earn participation points exactly like participants (no code change; asserted in Task 4.3).

Steps
- [ ] Failing tests:
  - "SUPERVISOR hạng thấp hơn minimumSupervisorRank (đọc DB) → 403 0x13_54".
  - "PARTICIPANT không bị chặn hạng".
  - "owner đăng ký SUPERVISOR → 409 0x13_61"; "coordinator → 409 0x13_61"; "thêm coordinator là giám sát viên đang hiệu lực → 409 0x13_61".
  - "sau intakeEndsAt: PARTICIPANT → 409 0x13_60; SUPERVISOR trước distributionStartsAt → được; sau → 409".
  - "đang là PARTICIPANT đăng ký SUPERVISOR → 409 đã đăng ký".
  - "tổng kết supervisors.checkedIn/minimumSupervisors, thiếu chỉ là met=false".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB: register a supervisor through the real use case → `role = 'SUPERVISOR'`. Check-in, then the board shows `checkedIn = 1`.
- [ ] Run unit, `test:charity-participation`, `test:charity-summary` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (participation body `role`, rules), FEATURES.md.
- [ ] Stage.

### Task 3.3: `organizer` and `GET /charity-campaigns/:idOrSlug/members`; phase 3 checks and commit

**Files**
- Modify: `core-lib/src/dto/author/author.dto.ts` (`IPublicUserProfileDto { userId; username; displayName; avatarUrl; rank }`), `core/src/application/implementations/shared/public-author.ts` (`toPublicUserProfile(user)`, built on `toPublicAuthorSummary`, with `displayName = fullName ?? username`)
- Modify: `charity-campaign.repository.ts` (`findOrganizerProfile(campaignId)`), `GetPublicCharityCampaignUseCase` + `IGetPublicCharityCampaignResult.organizer`, `GetCharityPublicProjectUseCase` + `ICharityPublicProject.organizer`
- Modify:
  - `charity-summary.repository.ts` + port: `listPublicMembers(params: { campaignId; type: CharityMemberType; cursor: { joinedAt: Date; userId: string } | null; limit: number }): Promise<{ rows: ICharityPublicMemberRow[]; anonymousCount: number }>`
  - `charity-summary.contract.ts`: `IListCharityMembersUseCase` + Symbol
  - `charity-summary.use-cases.ts`: `ListCharityMembersUseCase`
  - `charity-project.module.ts`
  - `charity-summary.controller.ts`: `@Public() @Get(':idOrSlug/members')`
  - `charity-summary.dto.ts`: `CharityMembersQueryDto { type; cursor?; limit? (1–50, default 20) }`, `CharityMemberDto`, `CharityMembersResponseDto`, `PublicUserProfileDto`
- Test: `charity-summary.use-cases.spec.ts`, `charity-campaign.use-cases.spec.ts`, `test/charity-summary.check.ts`, `test/public-profile.check.ts`

**Interfaces**
- Member row: `{ user: IPublicUserProfileDto; joinedAt: Date; contributionTypes?: ('MATERIAL'|'SERVICE')[] }`. No quantity or amount.
- Response: `{ members; anonymousCount; nextCursor: string | null }`. The cursor is base64url of `${joinedAt.toISOString()}|${userId}`. Order: `joinedAt ASC, userId ASC`.
- Sources:
  - `CONTRIBUTOR`: the union of `campaign_contributions` with status `IN ('ACCEPTED','PARTIALLY_ACCEPTED')`, which is visible when `show_name_publicly` holds on any of the user's rows; and `campaign_other_support_offers` with `status IN ('ACCEPTED','COMPLETED')`, which is visible when `users.show_in_public_supporter_lists` (§3.17e). Group by user; `joinedAt = MIN(created_at)`.
  - `PARTICIPANT`/`SUPERVISOR`: `campaign_participations` with that role and `status IN ('CONFIRMED','CHECKED_IN','COMPLETED')`, visible when `show_name_publicly`; `joinedAt = registered_at`.
  - `anonymousCount` = qualifying users who are not visible. Deleted users are excluded from both counts.
- The campaign is resolved through `ICharityProjectRepository.findVisibleCampaignId`; none → `CharityCampaignNotFoundException` (404).

Steps
- [ ] Failing tests:
  - "organizer có userId, displayName = fullName, không có phone/email" (`Object.keys` exactly the five).
  - "fullName trống → displayName = username".
  - "members chưa công khai → 404".
  - "CONTRIBUTOR gộp một người hai loại → contributionTypes ['MATERIAL','SERVICE']".
  - "ẩn tên → không có trong members, anonymousCount +1".
  - "cursor trang 2 không lặp dòng".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB (`charity-summary.check.ts`):
  - 3 contributors (one hidden), 1 service offerer whose user flag is false, 2 participants, 1 supervisor → `CONTRIBUTOR`: 2 members, `anonymousCount` 2; `SUPERVISOR`: 1.
  - `limit 1` paging over `PARTICIPANT` returns 2 distinct users.
  - A rejected participant never appears.
  - `JSON.stringify` has no `phone`.
- [ ] Phase 3 checks: the Task 1.8 list plus `test:public-profile`.
- [ ] Docs: API.md (`organizer`, members endpoint), FEATURES.md, core-lib README (new DTO).
- [ ] Commit:
  ```
  git add -A suites/chantam.vn/chantam docs
  git commit -m "feat(charity): giám sát viên trong luồng tham gia, thông tin người tổ chức, danh sách thành viên công khai (migration 1804200000000)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

## Phase 4 — Hệ số điểm, thưởng điểm, bảng tin điểm

### Task 4.1: core-lib — bonus percent, bonus rule, feed classification

**Files**
- Modify: `core-lib/src/models/charity-points.ts` (+ spec), `core-lib/src/models/point-rule-title.ts` (+ spec)
- Create: `core-lib/src/models/point-feed.ts` + `point-feed.spec.ts`; export from `models/index.ts`
- Modify: `core-lib/src/dto/point/point.dto.ts` (`IPointFeedEntryDto`, `IPointFeedResponseDto`, `IUserPointFeedResponseDto`), `core-lib/src/dto/profile/profile.dto.ts` (`showInPublicPointFeed`)

**Interfaces**
- `charity-points.ts`:
  - `CharityPointBonusPercents = [0, 20, 50, 100] as const`; `CharityPointBonusPercent`; `isCharityPointBonusPercent(value: unknown): value is CharityPointBonusPercent`
  - `CharityPointBaseRuleCodes = ['CHARITY_ITEM_VALUE','CHARITY_POST_VIDEO','CHARITY_POST_IMAGE','CHARITY_PARTICIPATION'] as const` (bonus-eligible, award-backed)
  - `CharityPointRuleCodes = [...CharityPointBaseRuleCodes, 'CHARITY_CAMPAIGN_BONUS']`
  - `CharityPointCapConfigKeys` keeps deriving from `CharityPointBaseRuleCodes` only, so the list is unchanged (Open question 3)
  - `bonusPoints(baseApplied: number, percent: number): number` = `Math.floor(baseApplied * percent / 100)`; ≤ 0 → 0
  - `bonusAdjustmentTarget(input: { bonusApplied: number; baseAppliedBefore: number; baseAppliedAfter: number }): number` = `baseAppliedBefore <= 0 ? 0 : Math.floor(bonusApplied * baseAppliedAfter / baseAppliedBefore)`
- `point-feed.ts`:
  - `PointFeedExcludedRuleCodes` (the 7 codes in Global Constraints)
  - `PointFeedMergedRuleCodes = ['CHARITY_CAMPAIGN_BONUS']`
  - `PointFeedMaxLimit = 50`, `PointFeedDefaultLimit = 20`, `PointFeedCacheTtlSeconds = 5`
  - `PointFeedMinDeltaConfigKey`/`Default 10`, `PointFeedPollSecondsConfigKey`/`15`, `PointFeedDisplayIntervalMsConfigKey`/`2000`, with `normalize…` helpers
- `PointRuleTitles.CHARITY_CAMPAIGN_BONUS = 'Thưởng hệ số chiến dịch từ thiện'`.
- `IPointFeedEntryDto { entryId: number; user: IPublicUserProfileDto; delta: number; bonusPercent: number | null; ruleTitle: string; occurredAt: string; context: { type: 'CHARITY_CAMPAIGN' | 'POST'; id: string; title: string } | null }`.

Steps
- [ ] Failing tests:
  - "kiểm kê: mọi khoá PointRuleTitles thuộc đúng một nhóm (hiện / loại trừ / gộp)". Eligible = keys minus excluded minus merged. Assert `excluded ∩ merged = ∅`, `excluded ⊂ keys`, and a hard-coded snapshot of the excluded set equal to the spec's 7 codes. Adding a penalty title without classifying it fails the snapshot test.
  - `bonusPoints(15, 50) === 7`.
  - `bonusAdjustmentTarget({bonusApplied:7, baseAppliedBefore:15, baseAppliedAfter:0}) === 0`; `({7,15,10}) === 4`.
  - `isCharityPointBonusPercent(30) === false`.
  - `CharityPointCapConfigKeys.length === 12`.
- [ ] Run the core-lib specs. Expect failures.
- [ ] Implement. Build core-lib. Run `point-rule-title.inventory.spec.ts` in core (passes: the new title exists).
- [ ] Stage.

### Task 4.2: Migration 1804300000000, the bonus percent on create, approval and Admin PATCH

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1804300000000-CharityPointBonusAndFeed.ts`; barrel
- Modify:
  - `ICharityCampaign` (`pointBonusPercent`, `requestedPointBonusPercent`, `badgeName: string | null`)
  - `ICreateCharityCampaignParams` (`requestedPointBonusPercent`, `pointBonusPercent`, `badgeName: string | null`)
  - `charity-campaign.repository.ts` (columns, `insertCampaign`, `decideApproval` takes `pointBonusPercent`, Admin update)
  - `charity-campaign.contract.ts`: `ICharityCampaignWriteInput.badgeName?` (optional, deprecated), `requestedPointBonusPercent?`; `IDecideCharityApprovalCommand.pointBonusPercent?`; `IUpdateAdminCharityCampaignCommand.pointBonusPercent?`
  - `CreateCharityCampaignUseCase` (§3.17b: Admin create sets `pointBonusPercent = requested`; an owner with publish-without-review gets effective `0`)
  - `DecideCharityApprovalUseCase` (approve: effective = `pointBonusPercent ?? requested`; Open question 5), `UpdateAdminCharityCampaignUseCase`
  - DTOs: `@IsIn(CharityPointBonusPercents)`, `badgeName` `@IsOptional()` with `deprecated: true` in Swagger
  - `admin-config.use-cases.ts` (three `point.feed_*` keys)
  - `docs/CONFIG-INVENTORY.md`
  - Spec fixtures
- Test: `charity-campaign.use-cases.spec.ts`, `test/charity-points.check.ts`, `test:config-inventory`

**Interfaces**
- `campaigns`:
  - `ADD point_bonus_percent smallint NOT NULL DEFAULT 0 CHECK IN (0,20,50,100)`
  - `ADD requested_point_bonus_percent smallint NOT NULL DEFAULT 0 CHECK IN (0,20,50,100)`
  - `ALTER badge_name DROP NOT NULL`; the existing `CHK_campaigns_badge_name` still passes on NULL
- `campaign_point_awards`:
  - replace `CHK_campaign_point_awards_rule` with the 5 codes
  - `ADD base_award_id uuid NULL REFERENCES campaign_point_awards(global_id) ON DELETE CASCADE`
  - `UNIQUE (base_award_id)`
  - `CHECK ((rule_code = 'CHARITY_CAMPAIGN_BONUS') = (base_award_id IS NOT NULL))`
- `point_rules`: insert `CHARITY_CAMPAIGN_BONUS` with points `0`, `is_enabled true`, version 1, `ON CONFLICT DO NOTHING`. It is inventory only, since the bonus goes through `appendAdjustmentWithinTransaction`.
- `users`: `ADD show_in_public_point_feed boolean NOT NULL DEFAULT true`.
- `point_ledger`:
  - `CREATE INDEX IDX_point_ledger_user_id ON point_ledger (user_id, id)`
  - `CREATE INDEX IDX_point_ledger_bonus_ref ON point_ledger (reference_id) WHERE rule_code = 'CHARITY_CAMPAIGN_BONUS'`
- `system_configs`: the three `point.feed_*` keys.

Steps
- [ ] Failing tests:
  - "owner đề xuất 50 → requested 50, hiệu lực 0".
  - "owner có quyền đăng không cần duyệt đề xuất 50 → hiệu lực vẫn 0".
  - "Admin tạo 100 → hiệu lực 100".
  - "Admin duyệt không gửi pointBonusPercent → hiệu lực = requested"; "Admin duyệt hạ 20 → 20"; "Admin duyệt 100 khi requested 50 → 400".
  - "pointBonusPercent 30 → 400 validate".
  - "tạo không gửi badgeName → được".
- [ ] Failing real-DB check (`charity-points.check.ts`): a bonus award without `base_award_id` is rejected; a base award with `base_award_id` is rejected; `point_bonus_percent = 30` is rejected.
- [ ] Run the focused specs, `test:charity-points`, `test:config-inventory`. Expect FAIL.
- [ ] Implement.
- [ ] Run (pass), `test:seed-full`, `test:notification-target`, `test:charity`.
- [ ] Docs: DATABASE.md, API.md (create, approval, Admin PATCH fields, `badgeName` deprecated).
- [ ] Stage.

### Task 4.3: Bonus settle pairing under shared caps

**Files**
- Modify:
  - `core/src/domain/ports/repository/charity-points.repository.ts`: `ICharityPointAward.baseAwardId: string | null`; `settle(params: { awardId; caps; dayStart }): Promise<ICharitySettleResult & { bonusApplied: number }>`; `ICharitySettleResult` stays
  - `core/src/infrastructure/repository/charity-points.repository.ts` (`settle`, `AwardColumns`, `toAward`, `listUnsettled` skips bonus rows whose base is unsettled)
  - `core/src/application/implementations/charity-project/charity-points.service.ts` (`settle` passes the base rule caps; `settlePending` handles bonus rows through their base)
  - `charity-campaign.repository.ts` `completeDelivery` (the bonus for `CHARITY_CONTRIBUTION_COMPLETED`; Open question 2)
- Test: `charity-points.service.spec.ts` (create if absent), `test/charity-points.check.ts`

**Interfaces / algorithm** (inside the existing transaction, after the base append). Code block, because the pairing and the shared caps decide correctness:
```ts
// base: award row of a CharityPointBaseRuleCodes rule; lock key stays charity-points:<user>:<base rule>
const baseEntry = await this.ledger.appendAdjustmentWithinTransaction(manager, { ...base, delta: applied });
const percent = (await manager.query(`SELECT point_bonus_percent FROM campaigns WHERE global_id = $1`, [award.campaign_id]))[0].point_bonus_percent;
let bonus = await findOrCreateBonusAward(manager, award);            // rule CHARITY_CAMPAIGN_BONUS, base_award_id = award.global_id
let bonusDelta = 0;
if (applied > 0) {
  const wanted = bonusPoints(applied, percent);                       // floor at settle time
  bonus.target_points += wanted;
  bonusDelta = allowedUnderCaps(bonus.target_points - bonus.applied_points,
                                windowsWithUsedPlus(applied));       // base already counted → base first
} else if (applied < 0) {
  bonus.target_points = bonusAdjustmentTarget({ bonusApplied: bonus.applied_points,
                         baseAppliedBefore: award.applied_points, baseAppliedAfter: award.applied_points + applied });
  bonusDelta = bonus.target_points - bonus.applied_points;            // negative, applied immediately
}
if (bonusDelta !== 0) append({ ruleCode: 'CHARITY_CAMPAIGN_BONUS', delta: bonusDelta,
   referenceType: 'POINT_LEDGER', referenceId: String(baseEntry.entryId),
   idempotencyKey: `CHARITY_AWARD:${bonus.global_id}:${bonus.ledger_seq + 1}` });
```
- A bonus award row is only created when `percent > 0` or a bonus row already exists, so lowering the percent later still allows negative adjustment.
- The "used" query sums entries with `rule_code = $base` **plus** entries with `rule_code = 'CHARITY_CAMPAIGN_BONUS'` whose `reference_type = 'POINT_LEDGER'` points to an entry with `rule_code = $base`. The project window joins through the base entry's award.
- Deferred base → `applied = 0` → no bonus. When the job later settles the base, the bonus is computed with the percent at that moment.
- A deferred bonus remainder settled alone by `settlePending` references the latest base ledger entry of its base award (Open question 4).

Steps
- [ ] Failing real-DB checks (`charity-points.check.ts`), all through the real `CharityPointsService`:
  - "hệ số 50, điểm gốc 15 → hai bút toán 15 và 7; bút toán thưởng reference_type POINT_LEDGER, reference_id = id bút toán gốc, cùng transaction" (both rows have the same `xmin`, or both are absent after a forced rollback).
  - "trần ngày 20, gốc 15 hệ số 50 → gốc 15, thưởng 5, phần thưởng còn 2 hoãn".
  - "trần ngày 10, gốc 15 → gốc 10 hoãn 5, thưởng 0; nâng trần → job ghi gốc 5 rồi thưởng".
  - "chấm lại về 0 → bút toán gốc −15 và thưởng −7".
  - "đổi hệ số 50→100 sau khi ghi → bút toán cũ không đổi" (no recompute).
  - "giám sát viên được chấm mức hoàn thành → CHARITY_PARTICIPATION + thưởng".
  - "hệ số 0 → không tạo award thưởng".
- [ ] Run `test:charity-points`. Expect FAIL.
- [ ] Implement.
- [ ] Run (pass), plus `test:point-economy` and the unit tests for `charity-points`.
- [ ] Docs: API.md (point section: the bonus as a separate entry), DATABASE.md (`base_award_id`).
- [ ] Stage.

### Task 4.4: Point feed endpoints, profile flag, cache, throttle; phase 4 checks and commit

**Files**
- Create:
  - `core/src/domain/ports/repository/point-feed.repository.ts` (`IPointFeedRepository` + Symbol)
  - `core/src/infrastructure/repository/point-feed.repository.ts` (register in `RepositoryModule`)
  - `core/src/domain/ports/cache/point-feed-cache.ts` (`IPointFeedCache` + Symbol; export from `ports/cache/index.ts`)
  - `core/src/infrastructure/cache/point-feed-cache.ts` (register in `cache.module.ts`)
  - `core/src/application/contracts/point/get-point-feed.use-case.ts`
  - `core/src/application/implementations/point/get-point-feed.use-case.ts` (+ `.spec.ts`; register in `point.module.ts`)
  - `core/src/infrastructure/controller/api/point/point-feed.controller.ts` (register in `point.module.ts` under `controller/api/point`)
  - `core/src/infrastructure/controller/dto/point/point-feed.dto.ts`
- Modify: profile `update-own-profile.use-case.ts`, `profile.mapper.ts`, `controller/dto/profile/profile.dto.ts`, `core/src/infrastructure/entity/user.entity.ts` (`showInPublicPointFeed`), `core-lib/src/entities/user.entity.ts`
- Test: `get-point-feed.use-case.spec.ts`, `test/point-economy.check.ts` (feed section) or a new block in `test/charity-points.check.ts`

**Interfaces**
```ts
export interface IPointFeedRow { entryId: number; userId: string; username: string | null; fullName: string | null;
  avatarUrl: string | null; rank: UserRanks; ruleCode: string; delta: number; bonusDelta: number;
  occurredAt: Date; context: { type: 'CHARITY_CAMPAIGN' | 'POST'; id: string; title: string } | null }
export interface IPointFeedRepository {
  list(params: { afterId: number | null; limit: number; userId: string | null; minDelta: number;
                 excludedRuleCodes: readonly string[]; mergedRuleCodes: readonly string[] }): Promise<IPointFeedRow[]>;
  latestId(userId: string | null): Promise<number | null>;
  isFeedVisible(userId: string): Promise<boolean>;          // ACTIVE, not suspended, not deleted, flag on
}
export interface IPointFeedCache { read(key: string): Promise<IPointFeedResponse | null>; write(key: string, value: IPointFeedResponse): Promise<void> }
```
- Feed predicate. Code block, because the merge and privacy rules decide correctness:
  ```sql
  SELECT entry.id, entry.user_id, entry.rule_code, entry.delta, entry.created_at,
         COALESCE((SELECT SUM(bonus.delta) FROM point_ledger bonus
                    WHERE bonus.rule_code = ANY($6::text[]) AND bonus.reference_type = 'POINT_LEDGER'
                      AND bonus.reference_id = entry.id::text), 0) AS bonus_delta, ...context subselects...
  FROM point_ledger entry JOIN users account ON account.global_id = entry.user_id
  WHERE entry.delta > 0
    AND entry.rule_code <> ALL($5::text[])           -- excluded
    AND entry.rule_code <> ALL($6::text[])           -- merged never a row
    AND account.status = 'ACTIVE' AND account.deleted_at IS NULL
    AND (account.suspended_until IS NULL OR account.suspended_until <= now())
    AND account.show_in_public_point_feed
    AND ($1::bigint IS NULL OR entry.id > $1::bigint)
    AND ($3::uuid IS NULL OR entry.user_id = $3::uuid)
    AND (entry.delta + COALESCE(...bonus...)) >= $4::int   -- $4 = 0 for the per-user feed
  ORDER BY entry.id DESC LIMIT $2      -- first poll (no afterId); with afterId: ORDER BY entry.id ASC
  ```
  The first poll is reversed to ascending in TS before returning.
- `context` is resolved only for `reference_type = 'CHARITY_POINT_AWARD'` (via `campaign_point_awards.campaign_id`) and `'CHARITY_CONTRIBUTION'` (via `campaign_contributions.campaign_id`). The campaign must be `approval_status = 'APPROVED' AND deleted_at IS NULL AND (is_active OR end_time <= now())`. The implementer lists POST-backed `referenceType:` values in the code (grep) and maps them only when the post is publicly visible. Everything else → `null`. The context returns only `{ type, id, title }`.
- `bonusPercent` = the campaign's `point_bonus_percent` when `bonusDelta > 0`, else `null`. `delta` returned = `delta + bonusDelta`. `ruleTitle = pointRuleTitle(ruleCode)`.
- Use case `GetPointFeedUseCase.handle({ viewerId; userId: string | null; afterId: number | null; limit })`:
  1. `throttle.assertWithinLimit({ bucket: 'point-feed', key: viewerId, limit: 30 })`, then `registerHit({ windowSeconds: 60 })`.
  2. Per-user feed: `userId !== viewerId && !isFeedVisible(userId)` → `UserNotFoundException` (404). It skips `minDelta` and adds `balance`/`lifetime` from `IPointLedgerRepository.getSummary`.
  3. General feed: cache key `cache:point_feed:${afterId ?? 'latest'}:${limit}`, TTL `PointFeedCacheTtlSeconds`.
  4. Response `{ entries; latestId; pollAfterSeconds; displayIntervalMs }`. An empty result → `entries: []` with the current `latestId`.
- Routes: `GET /points/feed?afterId=&limit=`, `GET /users/:userId/points/feed?afterId=&limit=` (Bearer, no permission). DTOs: `PointFeedQueryDto` (`limit` 1–50, default 20), `UserPointFeedParamsDto`.
- Profile: `GET/PATCH /profile/me` read and write `showInPublicPointFeed`, in the same pattern as `showOnlineStatus`.

Steps
- [ ] Failing unit tests:
  - "afterId → chỉ bản ghi mới hơn, tăng dần".
  - "không có gì mới → entries [] kèm latestId".
  - "người khác xem feed user đã tắt → 404"; "chính mình xem được".
  - "feed chung lần hai trong 5 giây đọc cache, repository.list gọi một lần".
  - "vượt rate limit → TooManyRequests".
  - "pollAfterSeconds/displayIntervalMs lấy từ cấu hình".
- [ ] Failing real-DB checks (Review Focus 3):
  - Seed for user U: `CHARITY_PARTICIPATION +60` with bonus `+30`; `ADMIN_ADJUSTMENT +50` reason `'Bù lỗi hệ thống XYZ'`; `CONTENT_VIOLATION_PENALTY -20`; `REVERSAL`; `CHECK_IN_DAILY +5`.
  - General feed (min 10): exactly one row for U, `delta 90`, `bonusPercent 50`, `ruleTitle 'Tham gia dự án từ thiện'`. `JSON.stringify(response)` does not contain `'XYZ'`, any `reference_id` value, `'rule_code'` or `'reason'`. `CHECK_IN_DAILY +5` is absent from the general feed but present in U's own feed.
  - U sets `show_in_public_point_feed = false` → U is absent from the general feed, and another viewer gets 404 on U's feed.
  - A user with `suspended_until` in the future → absent.
  - `EXPLAIN` of the per-user query uses `IDX_point_ledger_user_id`.
- [ ] Run the focused spec and the check. Expect failures.
- [ ] Implement.
- [ ] Phase 4 checks: the Task 1.8 list plus `test:point-economy`, `test:config-inventory`, `test:public-profile`.
- [ ] Docs: API.md (feed endpoints, polling contract, profile flag), CONFIG-INVENTORY.md (already updated in 4.2), FEATURES.md, core README.
- [ ] Commit:
  ```
  git add -A suites/chantam.vn/chantam docs
  git commit -m "feat(points): hệ số tăng điểm chiến dịch do Admin chốt, bút toán thưởng riêng chung trần, bảng tin điểm polling (migration 1804300000000)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

## Phase 5 — Bản sửa chờ duyệt

### Task 5.1: Migration 1804400000000, reviewed-field model, repository

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1804400000000-CharityChangeRequests.ts`; barrel
- Create: `core-lib/src/models/charity-change-request.ts` + `.spec.ts`; export from the index
- Create: `core/src/domain/ports/repository/charity-change-request.repository.ts`, `core/src/infrastructure/repository/charity-change-request.repository.ts` (register in `RepositoryModule`)
- Test: `core/test/charity-project.check.ts` (change-request block)

**Interfaces**
- Table `campaign_change_requests`:
  - `id BIGSERIAL`, `global_id uuid UNIQUE`
  - `campaign_id FK ON DELETE CASCADE`
  - `status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK IN (4)`
  - `proposed jsonb NOT NULL`, `base jsonb NOT NULL`
  - `submitted_by uuid FK users ON DELETE SET NULL`, `submitted_at timestamptz NOT NULL DEFAULT now()`
  - `decided_by`, `decided_at`, `decision_reason varchar(1000)`
  - `CHECK (status = 'PENDING') = (decided_at IS NULL)`, with `WITHDRAWN` setting `decided_at`
  - `CREATE UNIQUE INDEX UQ_campaign_change_requests_pending ON campaign_change_requests (campaign_id) WHERE status = 'PENDING'`
- core-lib:
  ```ts
  export interface ICharityReviewedFields {
    title?: string; description?: string;
    media?: { keys: string[]; coverKey: string };           // R2 keys, confirmed on apply
    beneficiaries?: ICharityReviewedBeneficiary[];          // partyId?|name|kind|estimatedPortions|estimatedAmount (+ address/distributionAt for new rows)
    acceptedContributionTypes?: CharityContributionType[];
    pointBonusPercent?: CharityPointBonusPercent;
  }
  export const CharityReviewedFieldKeys = ['title','description','media','beneficiaries','acceptedContributionTypes','pointBonusPercent'] as const;
  export function reviewedFieldsChanged(base: ICharityReviewedFields, proposed: ICharityReviewedFields): string[]; // keys whose normalized value differs
  ```
- Port `ICharityChangeRequestRepository`:
  - `findPending(campaignId)`
  - `upsertPending({ campaignId; actorId; proposed; base }): Promise<ICharityChangeRequest>` (`INSERT … ON CONFLICT (campaign_id) WHERE status = 'PENDING' DO UPDATE SET proposed = EXCLUDED.proposed, submitted_at = now()`; `base` is kept from the first submission)
  - `withdraw({ campaignId; actorId }): Promise<boolean>`
  - `listByStatus({ status; limit; offset })`
  - `decide({ requestId; actorId; status: 'APPROVED'|'REJECTED'; reason; manager?: EntityManager }): Promise<ICharityChangeRequest | null>` (conditional on `PENDING`, through `updateReturning`)

Steps
- [ ] Failing tests:
  - core-lib: `reviewedFieldsChanged({title:'A'},{title:'A'})` → `[]`; a reordered beneficiary list with the same values → `[]`; a changed portion → `['beneficiaries']`.
  - Real-DB: a second `PENDING` insert for the same campaign by plain SQL → rejected by `UQ_campaign_change_requests_pending`. `upsertPending` twice keeps one row and the original `base`. After `withdraw`, a new `upsertPending` creates a new row.
- [ ] Run the core-lib spec and `test:charity-project`. Expect FAIL.
- [ ] Implement.
- [ ] Run (pass), `test:seed-full`, `test:notification-target` (seeds do not touch the new table).
- [ ] Docs: DATABASE.md.
- [ ] Stage.

### Task 5.2: Owner routes `GET/PUT/DELETE :id/revision`, direct-edit blocking

**Files**
- Modify:
  - `charity-project.contract.ts`: `IGetCharityChangeRequestUseCase`, `ISaveCharityChangeRequestUseCase`, `IWithdrawCharityChangeRequestUseCase` + Symbols
  - `charity-project.use-cases.ts` (three classes; `ReplaceCharityPartiesUseCase` keeps its phase 2 block)
  - `charity-campaign.use-cases.ts`: `ReplaceCharityMediaUseCase` blocks after approval unless `directChangeAllowed` → `CharityChangeRequiresReviewException('media')`
  - `UpdateCharityProfileUseCase`: `acceptedContributionTypes` gets the same block
  - `charity-project.module.ts`
  - `charity-project.controller.ts`: `GET :id/revision`, `PUT :id/revision` (`@HttpCode(200)`), `DELETE :id/revision`
  - `charity-campaign.controller.ts` error lists (`PUT :id/media`)
  - `charity-project.dto.ts`: `CharityChangeRequestInputDto` (the six optional reviewed fields), `CharityChangeRequestBodyDto { revision }`, `CharityChangeRequestDto`
- Test: `charity-project.use-cases.spec.ts`, `charity-campaign.use-cases.spec.ts`, `test/charity-project.check.ts`

**Interfaces**
- `PUT :id/revision`:
  - `access.forEdit`. The campaign must be `APPROVED`, else `CharityStageTransitionInvalidException('chỉ sửa qua bản sửa khi đã duyệt')`. Use the existing generic invalid-state exception of the project resource; the implementer picks the closest existing one.
  - `proposed` is limited to the given keys with `reviewedFieldsChanged(base, proposed)` non-empty, else `ValidationFailedException`.
  - `base` = a snapshot of the current approved values.
  - Media keys are validated (HeadObject through the existing `confirmCharityMedia` helper) at PUT time and are not attached until apply.
  - `pointBonusPercent` alone from an owner with publish-without-review still makes a request (§3.17b). Their other reviewed fields apply directly through the existing routes.
- `GET :id/revision`: the workspace (`forOperate`) gets `{ request: ICharityChangeRequest | null }`.
- `DELETE :id/revision`: owner only; no pending → `CharityCampaignNotFoundException`-style 404 (reuse the closest existing not-found).
- Public paths never read `campaign_change_requests`.

Steps
- [ ] Failing tests:
  - "PUT revision trước khi duyệt → 409".
  - "PUT revision lần hai thay nội dung, base giữ nguyên".
  - "PUT :id/media sau duyệt (owner thường) → 409 0x13_64"; "trước duyệt → áp ngay".
  - "PUT profile acceptedContributionTypes sau duyệt → 409 0x13_64".
  - "owner có quyền đăng không cần duyệt đổi media → áp ngay, đổi pointBonusPercent → phải qua bản sửa".
- [ ] Failing real-DB check (Review Focus 5): an approved campaign plus a `PENDING` request with a new title, new media keys and +1 beneficiary. The real `GetCharityPublicProjectUseCase` returns the old title, old media and old beneficiary count, and `JSON.stringify` does not contain the proposed title. `isPubliclyVisibleProject` is true, and the real `SubmitCharityContributionUseCase` succeeds.
- [ ] Run the focused specs and `test:charity-project`. Expect FAIL.
- [ ] Implement.
- [ ] Run (pass). `npm run docs:routes`.
- [ ] Docs: API.md (owner revision routes, which fields need review vs apply directly), FEATURES.md.
- [ ] Stage.

### Task 5.3: Admin review routes, apply in one transaction, audit, notify; phase 5 checks and commit

**Files**
- Modify:
  - `charity-campaign.contract.ts` (or `charity-project.contract.ts`, wherever the Admin campaign contracts live): `IListCharityChangeRequestsUseCase`, `IGetAdminCharityChangeRequestUseCase`, `IDecideCharityChangeRequestUseCase` + Symbols
  - The use-case implementations in `charity-project.use-cases.ts`; module registration
  - `ICharityChangeRequestRepository.applyApproved({ request; actorId }): Promise<void>`: a transaction that updates `campaigns` title/description/`point_bonus_percent`/`requested_point_bonus_percent`/`accepted_contribution_types`, replaces media, replaces BENEFICIARY parties by `partyId`, calls `recordCharityRevisions` and `decide(..., manager)`
  - `core-lib/src/models/charity-engagement.ts` `CharityRevisionPolicies.CAMPAIGN.fields` adds `title`, `description`, `media`, `pointBonusPercent`, `acceptedContributionTypes` (public; `isImportant` true for `pointBonusPercent`, `media`, `acceptedContributionTypes`); `PARTY.fields` adds the phase 2 fields
  - `charity-project.controller.ts` `@Controller('admin/charity-campaigns')`: `GET revisions` (declared before any `:id` route of this controller; the route-order guard must stay green), `GET :id/revision`, `PATCH :id/revision`, with `@RequiresPermission('campaign.read')`, `'campaign.read'` and `'campaign.manage'`
  - DTOs: `CharityChangeRequestsQueryDto { status?; limit?; offset? }`, `DecideCharityChangeRequestBodyDto { decision: { approve: boolean; reason?: string } }`, `AdminCharityChangeRequestDto { request; current }`
  - `CharityNotifier` gets a `changeRequestDecided({ campaign, ownerId, approved, reason })` method using the existing in-app notification type (`CHARITY_PLAN_CHANGED` payload `{ changeRequest: 'APPROVED' | 'REJECTED' }`, owner only; Open question 6)
- Test: `charity-project.use-cases.spec.ts`, `test/charity-project.check.ts`, `test:permission-inventory`

**Interfaces**
- `PATCH :id/revision` approve:
  1. Load the pending request; none → 404.
  2. Run `assertPortionFloors` with the proposed beneficiaries against the current needs and funding. A violation → 400 `0x13_5d`/`0x13_5e`, and the request stays `PENDING` (the check runs before the transaction and again inside it on locked rows).
  3. Run `beneficiariesOutsideWindow` for new rows → 400 `0x13_5c`.
  4. `applyApproved`.
  5. `admin.appendAudit({ action: 'CHARITY_CHANGE_REQUEST_APPROVE', resourceType: 'CAMPAIGN', resourceId, before: base, after: proposed, reason })`.
  6. Notify the owner.
- Reject: `decide(REJECTED)`, a trimmed `reason` is required, then audit and notify. Nothing is applied.
- While a `PENDING` request exists, `UpdateAdminCharityCampaignUseCase` changing a reviewed field → `CharityRevisionPendingExistsException` (Open question 7).
- `GET :id/revision` (Admin) returns `{ request: { base, proposed, … }, current: <ICharityReviewedFields read now> }`.

Steps
- [ ] Failing tests:
  - "duyệt bản sửa làm tổng suất 300→400 khi áo 300 → 400 0x13_5d, bản sửa vẫn PENDING, không appendAudit".
  - "duyệt hợp lệ → applyApproved, appendAudit APPROVE, notifier gọi owner".
  - "từ chối không lý do → 400"; "từ chối → không áp, audit REJECT".
  - "Admin PATCH title khi có PENDING → 409 0x13_63".
  - "GET /admin/charity-campaigns/revisions không bị bắt bởi :id" (route-order guard spec).
- [ ] Failing real-DB checks:
  - Approve through the real use case → title updated, `campaign_revisions` has a `CAMPAIGN.title` row (public) and `PARTY.estimatedPortions` rows. An INDIVIDUAL `PARTY.address` revision has `is_public = false` and a GROUP one `true` (Review Focus 2). One `PLAN_CHANGED` announcement is written, and the request is `APPROVED`.
  - An approve that violates the floor leaves `status = 'PENDING'` and the title unchanged.
  - `test:permission-inventory` lists the three Admin routes.
- [ ] Run the focused spec, `test:charity-project`, `test:permission-inventory`. Expect FAIL.
- [ ] Implement.
- [ ] Phase 5 checks: the Task 1.8 list plus `test:permission-inventory` and `test:config-inventory`.
- [ ] Docs: API.md (Admin revision routes, apply semantics, audit, notification), FEATURES.md, DATABASE.md (revision policy changes).
- [ ] Commit:
  ```
  git add -A suites/chantam.vn/chantam docs
  git commit -m "feat(charity): bản sửa chờ duyệt sau khi duyệt — chiến dịch vẫn chạy theo bản đã duyệt, Admin duyệt thì áp trong một transaction (migration 1804400000000)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

## Final verification (before the user asks to push)

- [ ] `npm run build`, `npm run test` (root)
- [ ] Every `test:*` script in `core/package.json` (Docker up; smoke-type checks with `LOG_LEVEL=debug` where they need OTP)
- [ ] `npm run lint:check`, `npm run format:check`, `npm run docs:errors:check`, `npm run docs:routes:check`
- [ ] An independent review of each phase commit (`git show <sha>`).

## Self-Review

**Spec coverage:**

| Spec section | Tasks |
| --- | --- |
| §1 goals and "hỏng dù chạy được" | Review Focus 2–5 → 2.3, 4.4, 5.2, 1.7/1.8 |
| §2.1 supervisor in participations | 3.1, 3.2 |
| §2.2 pending change request, reviewed vs direct | 2.3 (parties), 5.1–5.3 |
| §2.3 five phases, one commit each | phase headings; commits in 1.8, 2.5, 3.3, 4.4, 5.3 |
| §3.1 profile shape | 3.3 |
| §3.2 storage of the new time fields | 2.2, 2.4 |
| §3.3 `distribution` block | 1.5 |
| §3.4 campaign-level evidence and private table | 1.3, 1.5 |
| §3.5 EVENT→SUMMARY conditions | 1.6 (manual), 1.7 (job and read path) |
| §3.6 rehearsal | 1.2, 1.3, 1.6, 1.7 |
| §3.7 48-hour reminders | 1.7 |
| §3.8 / §3.17c closing and `ENDED` | 1.8 |
| §3.9 intake closed | 2.5, 3.2 (supervisor exemption) |
| §3.10 INDIVIDUAL privacy | 2.1, 2.3 |
| §3.11 members | 3.3 |
| §3.12 point feed | 4.1, 4.4 |
| §3.13 / §3.17a bonus | 4.1, 4.2, 4.3 |
| §3.14 `badgeName` | 4.2 |
| §3.15 error codes | 1.1 |
| §3.16 legacy data | 1.3, 2.2, 3.1 |
| §3.17b effective percent | 4.2, 5.2 |
| §3.17d table name, revisions, PARTY policy | 2.1, 5.1, 5.3 |
| §3.17e service contributors | 3.3 |
| §3.17f one person, one role | 3.2 |
| §3.17g rehearsal optional, no skipping | 1.2, 1.7 |
| §4 round removal | 1.3, 1.4 |
| §5.1–§5.4 | 2.1–2.5 |
| §6 | 3.1–3.3 |
| §7 | 4.1–4.4 |
| §8 | 5.1–5.3 |
| §9 constraints | Global Constraints + each phase-end step |
| §12 migrations | 1.3, 2.2, 3.1, 4.2, 5.1 |

**Type consistency:**
- `ICharityDistributionPrivateDetailsInput` (core-lib, 1.2) flows into `ICharityCampaignDistributionInput` (1.5), `distributionSettlement` (1.6) and `CampaignDistributionSettledSql` (1.7, with parity checked).
- `effectiveOperationStage` gets `rehearsalReady`/`distributionSettled` from the same SQL in the repository read path and in `listStageCandidates`.
- `ICharityBeneficiaryPlan` (2.1) is used by `assertPortionFloors` (2.3), the schedule checks (2.4) and change-request apply (5.3).
- `IPublicUserProfileDto` (3.3) is reused by `IPointFeedEntryDto.user` (4.1/4.4).
- `CharityPointBaseRuleCodes` vs `CharityPointRuleCodes` keeps the cap keys unchanged (4.1).
- `directChangeAllowed` (2.3) is shared by 5.2.
- Exception class names match the catalog keys (1.1).

**Proportion:** 23 tasks (8 / 5 / 3 / 4 / 3). One migration per phase, three new ports. Function bodies are left to the implementer, except the round data move, the gated stage SQL, the bonus pairing and the feed predicate.

## Open questions for the controller

1. **`OTHER_LOCATION` location fields at campaign level.** The old round rule required `locationLabel` and an address or coordinates. Campaigns now carry intake locations and beneficiary addresses instead, and the spec's §3.4 lists only method, evidence and private details. Proposed default: drop `locationLabel/address/lat/lng` from the campaign distribution block, and make `charityDistributionFieldGaps` for `OTHER_LOCATION` require only `coordinatorName` (Task 1.5).
2. **The bonus on `CHARITY_CONTRIBUTION_COMPLETED`.** §3.17a lists it as bonus-eligible, but it is written straight to the ledger in `completeDelivery`, not through `campaign_point_awards`, so it has no award row for `base_award_id`. The rule is also disabled today. Proposed default: in the same transaction, right after the base append succeeds, append a `CHARITY_CAMPAIGN_BONUS` entry `floor(delta × percent / 100)` referencing that `POINT_LEDGER` id. It has no award row and no caps (that rule has none), and is never adjusted (Task 4.3).
3. **Cap keys for `CHARITY_CAMPAIGN_BONUS`.** §3.13 lists "khoá trần", but §3.17a makes the bonus share the base rule's caps. Proposed default: no `charity.points_cap.charity_campaign_bonus.*` keys; `CharityPointCapConfigKeys` keeps 12 entries (Task 4.1).
4. **A cap-deferred bonus remainder settled later by the job.** Proposed default: it references the latest base ledger entry of its base award. The feed merges bonuses into the base row as it exists at read time and does not re-surface an old row whose `entryId ≤ afterId` (Task 4.3/4.4).
5. **Can Admin raise the percent above the owner's request when approving?** The spec says only "được hạ". Proposed default: on approval, `pointBonusPercent ≤ requestedPointBonusPercent`, else 400 validation. Admin PATCH and Admin create may set any allowed value (Task 4.2).
6. **The notification type for a change-request decision.** The spec says "kênh thông báo trong app đang có". Proposed default: reuse `CHARITY_PLAN_CHANGED`, sent to the owner only with payload `{ changeRequest: 'APPROVED' | 'REJECTED', reason }`, instead of a new `NotificationTypes` member (Task 5.3).
7. **When `CHARITY_REVISION_PENDING_EXISTS` (0x13_63) is thrown**, since owner `PUT :id/revision` replaces the pending request instead of failing. Proposed default: it is thrown by Admin `PATCH /admin/charity-campaigns/:id` (and by an owner with publish-without-review using a direct route) when changing a reviewed field while a `PENDING` request exists, so the request's `base` cannot drift (Task 5.3).
