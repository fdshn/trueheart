# Campaign intake & distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep intake (what a campaign accepts: `MATERIAL|MONEY|SERVICE`) separate from distribution (how each round reaches beneficiaries). Add type gates, submit requirements, a distribution method per round with public/private fields, beneficiary bank accounts checked by name and verified by Admin, and three separate summary totals.

**Architecture:** Clean Architecture as it is today. Enums and pure rules go in `core-lib/src/models` and error codes in `core-lib/src/consts`. Use cases go in the existing `charity-campaign` / `charity-project` implementation files. SQL stays raw in the existing repositories (`charity-campaign`, `charity-project`, `charity-operations`, `charity-summary`). Each phase has one migration from `1803700000000` on. Public projections are explicit picks, never spreads.

**Tech Stack:** NestJS 11 + Fastify 5, TypeORM 0.3 raw SQL, PostgreSQL 16 + PostGIS 3.4, class-validator, Jest, ts-node real-DB checks.

**Spec:** `docs/superpowers/specs/2026-11-20-campaign-intake-distribution-design.md` (binding), on top of `docs/plans/2026-11-20-campaign-intake-and-distribution.md` (PR #55).

## Global Constraints

- Contribution types: `CharityContributionTypes = ['MATERIAL', 'MONEY', 'SERVICE']`.
- Distribution methods: `CharityDistributionMethods = ['DIRECT_RECIPIENT', 'SHIPPING', 'OTHER_LOCATION', 'BANK_TRANSFER', 'SERVICE']`, one value per round.
- Service channels: `CharityServiceChannels = ['IN_PERSON', 'ONLINE', 'HOTLINE', 'APPOINTMENT']`.
- Holder types: `CharityBeneficiaryHolderTypes = ['OWNER', 'BENEFICIARY']`.
- Legacy mapping: `SHIP→SHIPPING`, `TRANSFER→BANK_TRANSFER`, `ON_SITE→OTHER_LOCATION` with `needs_review = true`, only when the campaign has exactly one round with no method; otherwise `NULL`.
- Error codes, in this order:
  - `CHARITY_CONTRIBUTION_TYPE_DISABLED = 0x13_55` (409)
  - `CHARITY_SUBMIT_REQUIREMENTS_UNMET = 0x13_56` (409, says what is missing)
  - `CHARITY_DISTRIBUTION_FIELD_REQUIRED = 0x13_57` (400, names the field)
  - `CHARITY_DISTRIBUTION_METHOD_MISMATCH = 0x13_58` (400)
  - `CHARITY_ROUND_EVIDENCE_REQUIRED = 0x13_59` (409)
  - `CHARITY_BENEFICIARY_ACCOUNT_NAME_MISMATCH = 0x13_5a` (400)
  - `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED = 0x13_5b` (409)
- `evidence_urls jsonb` on rounds: https only, 0–20 items (`MaxCharityRoundEvidenceUrls = 20`).
- Open material need = `is_active AND intake_status = 'OPEN'`. Open funding/support need = `status = 'OPEN'`. Live bank account = `valid_to IS NULL`.
- Volunteer needs (`campaign_volunteer_needs`) are never gated and never count toward submit.
- Submit requirements apply on `POST :id/submit`, on create with `submit` (default `true`), and on Admin create. Drafts (`submit: false`) are not checked.
- Migration timestamps: `1803700000000` (A), `1803800000000` (B), `1803900000000` (C). Phase D has no migration. Each new file is exported from `migrations/index.ts` (`barrel-guard.spec.ts`).
- `seeds/full/*` must NOT name the new columns. New columns are nullable or have defaults.
- No backticks inside SQL template literals, including SQL comments.
- Build core-lib before testing core: `npm run build --workspace=@chantam.vn/chantam.core-lib`.
- Focused unit tests: `npm run test --workspace=@chantam.vn/chantam.core -- <paths>`. core-lib: `npm run test --workspace=@chantam.vn/chantam.core-lib -- <paths>`.
- Real-DB scripts: `npm run test:<name> --workspace=@chantam.vn/chantam.core` (Docker PostGIS must be running: `docker compose up -d`).
- At repo root: `npm run docs:errors` after adding codes; `npm run docs:routes` after adding or changing routes.
- `npm run lint:check` and `npm run format:check` must pass.
- Commit only to the current branch `main`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Error messages come from the catalog (`defineErrorCatalog`, with `sample` when the message has parameters). Exceptions are `extends ExceptionFrom(CoreErrors.X) {}` in `core/src/domain/exceptions/charity-campaign.exception.ts`.
- Each new endpoint has `@ApiErrorResponses(...)` plus `...ApiTokenErrors`. A `@Post` without `@HttpCode` uses `@ApiCreatedResponse`.

## Review Focus

1. **Private distribution data leaking to public** (address for `DIRECT_RECIPIENT`/`SHIPPING`, `privateDetails`, beneficiary accounts, coordinator phone, tracking code). Pinned in B3: `ListCharityRoundsUseCase` returns `address: null` and has no `privateDetails` key for a `SHIPPING` round. Also a real-DB public-rounds check in `test/charity-operations.check.ts`.
2. **The orphan-media sweep deletes round evidence** unless `campaign_distribution_rounds.evidence_urls` is in `LiveKeySources`. Pinned in B2: `sweep-orphan-media.use-case.spec.ts` "KHÔNG xoá ảnh bằng chứng đợt trao".
3. **Name-matching input classes:** `đ`/`Đ` (NFD does not split it), uppercase bank names with no accents, double and edge spaces, `users.full_name = NULL`. Pinned in C1: `normalizeHolderName('  NGUYỄN  Văn Đức ') === normalizeHolderName('NGUYEN VAN DUC')`, and a null name gives a mismatch.
4. **Legacy/default contribution types:** old clients leave the field out, migrated campaigns, seeded campaigns. Contributions to legacy material campaigns must not start returning 409. Pinned in A2 (real-DB backfill check) and A3 (create without the field and with `needs` → `['MATERIAL']`).
5. **Beneficiary account identity at `DONE`:** an account from another campaign, a closed or replaced version, or an unverified one. Pinned in C2: each case → 409 `CHARITY_BENEFICIARY_ACCOUNT_NOT_VERIFIED`; real-DB check: a replaced account loses `verified_at`.

---

## Phase A — Intake

### Task A1: core-lib intake contract and codes 0x13_55/0x13_56

**Files**
- Create: `suites/chantam.vn/chantam/core-lib/src/models/charity-intake.ts`
- Create (test): `suites/chantam.vn/chantam/core-lib/src/models/charity-intake.spec.ts`
- Modify: `core-lib/src/models/index.ts` (add `export * from './charity-intake'`), `core-lib/src/consts/error-codes.ts`, `core-lib/src/consts/error-catalog.ts`
- Modify: `core/src/domain/exceptions/charity-campaign.exception.ts`

**Interfaces**
- Produces:
  - `export const CharityContributionTypes = ['MATERIAL','MONEY','SERVICE'] as const; export type CharityContributionType`
  - `export interface ICharityIntakeCounts { openMaterialNeeds: number; openFundingNeeds: number; openSupportNeeds: number; liveBankAccounts: number }`
  - `export function charitySubmitRequirementGaps(types: readonly CharityContributionType[], counts: ICharityIntakeCounts): string[]`
  - `export function deriveAcceptedContributionTypes(input: { materialNeeds: number; fundingNeeds: number; supportNeeds: number }): CharityContributionType[]` (order follows `CharityContributionTypes`)
  - `export function normalizeContributionTypes(values: readonly CharityContributionType[]): CharityContributionType[]` (removes duplicates, sorts in canonical order)
- Exceptions:
  - `CharityContributionTypeDisabledException`: message `(type: string)`, sample `['MONEY']`
  - `CharitySubmitRequirementsUnmetException`: message `(missing: string)`, sample `['MONEY: chưa có tài khoản nhận đang hiệu lực']`

Steps
- [ ] Write failing tests in `charity-intake.spec.ts`:
  - "không bật loại nào → không thiếu gì": `charitySubmitRequirementGaps([], zero)` → `[]`.
  - "bật MATERIAL mà không có nhu cầu mở" → `['MATERIAL: chưa có nhu cầu hiện vật đang mở']`.
  - "bật MONEY có nhu cầu tiền nhưng không có tài khoản" → exactly one gap, starting `'MONEY: chưa có tài khoản'`.
  - "bật MONEY thiếu cả hai" → 2 gaps.
  - "SERVICE thiếu" → `['SERVICE: chưa có nhu cầu dịch vụ đang mở']`.
  - `deriveAcceptedContributionTypes({materialNeeds:1,fundingNeeds:0,supportNeeds:2})` → `['MATERIAL','SERVICE']`.
  - `normalizeContributionTypes(['SERVICE','MATERIAL','SERVICE'])` → `['MATERIAL','SERVICE']`.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core-lib -- src/models/charity-intake.spec.ts`. Expect failure: module not found.
- [ ] Implement the module. Add the two codes after `CHARITY_PARTICIPANT_RANK_TOO_LOW = 0x13_54` and their catalog entries (`HttpStatus.CONFLICT` for both). Add the two exception classes.
- [ ] Run the test again (passes). Build core-lib. `npm run docs:errors` at root and confirm `docs/API-ERRORS.md` lists `0x1355`/`0x1356`.
- [ ] Commit: `feat(charity): hằng số loại tiếp nhận và điều kiện gửi duyệt ở core-lib (0x13_55, 0x13_56)` plus the trailer line.

### Task A2: Migration 1803700000000 and campaign read model

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1803700000000-CampaignAcceptedContributionTypes.ts`; modify `migrations/index.ts`
- Modify: `core/src/domain/ports/repository/charity-campaign.repository.ts` (`ICharityCampaign`), `core/src/infrastructure/repository/charity-campaign.repository.ts` (`IRow`, `Columns`, `toCampaign`)
- Modify: `core/src/infrastructure/controller/dto/charity-campaign/charity-campaign.dto.ts` (`CharityCampaignResponseDto`)
- Modify the fixtures that build `ICharityCampaign`: `charity-campaign.use-cases.spec.ts`, `charity-project.use-cases.spec.ts`, `charity-engagement.use-cases.spec.ts`, `charity-operations.use-cases.spec.ts`, `charity-summary.use-cases.spec.ts` (and any other spec `tsc` flags)
- Test: `core/test/charity-campaign.check.ts`

**Interfaces**
- Column: `campaigns.accepted_contribution_types text[] NOT NULL DEFAULT ARRAY['MATERIAL','MONEY','SERVICE']::text[]` (controller ruling: raw-SQL inserts from seeds and check scripts keep the pre-feature permissive behaviour; existing rows are then backfilled from data per §5; API creates always write an explicit value) with `CHK_campaigns_accepted_contribution_types CHECK (accepted_contribution_types <@ ARRAY['MATERIAL','MONEY','SERVICE']::text[])`.
- Backfill in `up()`, from existing data: `MATERIAL` if any `campaign_need_items` row, `MONEY` if any `campaign_funding_needs` row, `SERVICE` if any `campaign_other_support_needs` row, via `array_remove(ARRAY[CASE…END, …], NULL)`.
- `down()` drops the constraint and the column.
- `ICharityCampaign.acceptedContributionTypes: readonly CharityContributionType[]`. Response DTO: `@ApiProperty({ enum: CharityContributionTypes, isArray: true }) acceptedContributionTypes`.

Steps
- [ ] Failing real-DB check (two-step DataSource) in `charity-campaign.check.ts`:
  - Open a DataSource whose `migrations` are filtered to those named `< 1803700000000`; run them.
  - Insert by raw SQL: campaign L1 with one need item, L2 with a funding need plus a support need, L3 with nothing.
  - Destroy it, open the full DataSource, `runMigrations()`.
  - Assert L1 → `{MATERIAL}`, L2 → `{MONEY,SERVICE}`, L3 → `{}`, and `findByGlobalId(L1).acceptedContributionTypes` deep-equals `['MATERIAL']`.
  - Also assert the CHECK rejects `ARRAY['CASH']` (`rejects(...)` is true).
- [ ] Run `npm run test:charity --workspace=@chantam.vn/chantam.core`. Expect FAIL: column does not exist.
- [ ] Implement the migration, the barrel export, the read model and the DTO. Add `acceptedContributionTypes: []` to the spec fixtures.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core -- src/infrastructure/persistence/migrations/barrel-guard.spec.ts src/application/implementations/charity-campaign` (passes). Rerun `test:charity` (passes). Run `npm run test:seed-full` to show the seeds still apply.
- [ ] Docs: `docs/DATABASE.md` (column, CHECK, backfill rule), `docs/API.md` (field on campaign views).
- [ ] Commit: `feat(charity): cột accepted_contribution_types và suy từ dữ liệu cũ (migration 1803700000000)` plus the trailer.

### Task A3: Create with three intake groups; edit via profile and Admin

**Files**
- Modify: `core/src/application/contracts/charity-campaign/charity-campaign.contract.ts`:
  - `ICreateCharityCampaignInput`: `acceptedContributionTypes?`, `fundingNeeds?`, `otherSupportNeeds?`
  - `IUpdateAdminCharityCampaignCommand`: `acceptedContributionTypes?`
- Modify: `core/src/domain/ports/repository/charity-campaign.repository.ts`:
  - `ICreateCharityCampaignParams`: `acceptedContributionTypes`, `fundingNeeds: readonly ICharityFundingNeedInput[]`, `supportNeeds: readonly ICharitySupportNeedInput[]`
  - the Admin update params at L518: `acceptedContributionTypes`
- Modify: `core/src/infrastructure/repository/charity-campaign.repository.ts`:
  - `insertCampaign` writes `$22::text[]`
  - new `insertFundingNeeds` / `insertSupportNeeds` (one `UNNEST` each), called inside `create`'s transaction
  - the Admin update (L2399) writes the column
- Modify: `core/src/application/implementations/charity-campaign/charity-campaign.use-cases.ts` (`CreateCharityCampaignUseCase`, `UpdateAdminCharityCampaignUseCase`)
- Modify: `core/src/domain/ports/repository/charity-project.repository.ts` (`ICharityProjectProfile.acceptedContributionTypes`), `core/src/infrastructure/repository/charity-project.repository.ts` (`getProfile` L351, `updateProfile` L382), `core/src/application/contracts/charity-project/charity-project.contract.ts` (`IUpdateCharityProfileCommand.profile.acceptedContributionTypes?`), `charity-project.use-cases.ts` (`UpdateCharityProfileUseCase`)
- Modify DTOs:
  - `charity-campaign.dto.ts`: `WriteCharityCampaignDto` gets `acceptedContributionTypes?`, `fundingNeeds?: CharityFundingNeedDto[]`, `otherSupportNeeds?: CharitySupportNeedInputDto[]`, each `@ArrayMaxSize(MaxNeedItemsPerCampaign)`; `UpdateAdminCharityCampaignDto.acceptedContributionTypes?`
  - `charity-project.dto.ts`: `CharityProfileDto.acceptedContributionTypes?`, `CharityProfileViewDto.acceptedContributionTypes`
- Test: `charity-campaign.use-cases.spec.ts`, `charity-project.use-cases.spec.ts`, `test/charity-campaign.check.ts`

**Interfaces**
- If `acceptedContributionTypes` is `undefined` on create, use `deriveAcceptedContributionTypes` on the lengths of the three arrays (Open question 2). If given, `normalizeContributionTypes`.
- `fundingNeeds[i].beneficiaryPartyId` / `bankAccountId` given on create → `ValidationFailedException(['fundingNeeds[i].bankAccountId: chưa có ở lượt tạo — thêm sau khi tạo'])` (Open question 4).
- `fundingNeeds` non-empty while `MONEY` is not accepted → `CharityContributionTypeDisabledException('MONEY')` (decision 1).
- Trimming and `sortOrder = index` work as in `needs`.
- Profile: `undefined` keeps the value, an array replaces it (normalized), same as `callToActions`.

Steps
- [ ] Failing unit tests in `charity-campaign.use-cases.spec.ts`:
  - "tạo không gửi acceptedContributionTypes + có needs → ['MATERIAL']" (assert `repository.create` called with `acceptedContributionTypes: ['MATERIAL']`).
  - "gửi ['SERVICE','MATERIAL','SERVICE'] → ['MATERIAL','SERVICE']".
  - "fundingNeeds khi chưa bật MONEY → CharityContributionTypeDisabledException".
  - "fundingNeeds có bankAccountId → ValidationFailedException".
  - "fundingNeeds và otherSupportNeeds được trim, sortOrder theo thứ tự" (`create.mock.calls[0][0].fundingNeeds[1].sortOrder === 1`).
  - "Admin PATCH acceptedContributionTypes undefined giữ nguyên".
  - In `charity-project.use-cases.spec.ts`: "PUT profile acceptedContributionTypes undefined giữ nguyên, mảng thì thay".
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core -- src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts src/application/implementations/charity-project/charity-project.use-cases.spec.ts`. Expect failures (properties missing).
- [ ] Implement.
- [ ] Real-DB check: create through the real `CreateCharityCampaignUseCase` with all three arrays, `submit: false`. Assert 1 `campaign_need_items`, 1 `campaign_funding_needs`, 1 `campaign_other_support_needs` and the column `{MATERIAL,MONEY,SERVICE}`. Then a duplicate need name+unit forces a rollback: assert 0 funding rows for that slug (same transaction).
- [ ] Run unit and `test:charity` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (create body, profile body, Admin PATCH), DATABASE.md unchanged.
- [ ] Commit: `feat(charity): tạo chiến dịch kèm nhu cầu tiền và dịch vụ, sửa loại tiếp nhận qua profile và Admin` plus the trailer.

### Task A4: Type gates and hiding money publicly

**Files**
- Modify: `charity-campaign.use-cases.ts`: `SubmitCharityContributionUseCase` (after `acceptsContributions`), `UpdateCharityContributionUseCase` (only `action !== 'WITHDRAW'`, which needs `findByGlobalId(existing.campaignId)`)
- Modify: `charity-operations.use-cases.ts`: `OfferCharitySupportUseCase` (`SERVICE`)
- Modify: `charity-project.use-cases.ts`:
  - `SaveCharityFundingNeedUseCase` and `AddCharityBankAccountUseCase` gate on `MONEY` (after `access.forEdit`)
  - `GetCharityPublicProjectUseCase`: `bankAccounts: []` and `fundingNeeds: []` when `MONEY` is off
- Modify controllers' `@ApiErrorResponses` to add `CharityContributionTypeDisabledException`: `charity-campaign.controller.ts` (`POST :id/contributions`), `charity-contribution.controller.ts` (`PATCH :id`), `charity-operations.controller.ts` (support offer route), `charity-project.controller.ts` (`POST :id/funding-needs`, `PATCH :id/funding-needs/:fundingNeedId`, `POST :id/bank-accounts`)
- Test: the three use-case specs and `test/charity-contribution.check.ts`

**Interfaces**
- Helper (module-level in each file, or exported from core-lib `charity-intake.ts`): `assertContributionTypeAccepted(campaign: { acceptedContributionTypes: readonly CharityContributionType[] }, type: CharityContributionType): void`, which throws `CharityContributionTypeDisabledException(type)`.
- Closing a bank account, the Admin path and volunteer needs are not gated.

Steps
- [ ] Failing tests:
  - "đóng góp hiện vật vào chiến dịch không bật MATERIAL → 409 0x13_55, không gọi createContribution".
  - "rút đề nghị vẫn được khi đã tắt MATERIAL".
  - "nhận hỗ trợ khi tắt SERVICE → 409".
  - "tạo/sửa funding need khi tắt MONEY → 409".
  - "thêm tài khoản nhận khi tắt MONEY → 409".
  - "public: tắt MONEY → bankAccounts [] và fundingNeeds [] dù repo có dữ liệu".
  - "đăng ký tình nguyện viên không bị chặn khi accepted = []".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB: in `charity-contribution.check.ts`, a campaign with `accepted_contribution_types = '{}'` set by SQL → the real use case rejects a contribution, and `campaign_contributions` count is unchanged.
- [ ] Run unit, `test:charity-contribution`, `test:charity-project` (pass).
- [ ] Docs: API.md (409 on the listed routes), `npm run docs:routes`.
- [ ] Commit: `feat(charity): chặn đóng góp và ghi tiền theo loại tiếp nhận, ẩn tiền ở public khi tắt MONEY` plus the trailer.

### Task A5: Submit requirements on all three paths

**Files**
- Modify: `core/src/domain/ports/repository/charity-project.repository.ts`: `intakeCounts(campaignId: string): Promise<ICharityIntakeCounts>`
- Modify: `core/src/infrastructure/repository/charity-project.repository.ts`: one SELECT with four `count(*)` subqueries using the open/live definitions in Global Constraints
- Modify: `charity-project.use-cases.ts`: `SubmitCharityProjectUseCase` calls the check after the not-draft check and before `submitDraft`
- Modify: `charity-campaign.use-cases.ts`: `CreateCharityCampaignUseCase`, when `submitted` is true, computes counts in memory:
  - material = `needs.length` (new rows are active and `OPEN` by default)
  - funding = `fundingNeeds.length`
  - support = `otherSupportNeeds.length`
  - bank accounts = 0
  - checked before `confirmCharityMedia` (no R2 call)
- Modify: `charity-project.controller.ts` (`POST :id/submit`) and `charity-campaign.controller.ts` (both `POST` routes) error lists
- Test: the specs and `test/charity-project.check.ts`

**Interfaces**
- Throws `CharitySubmitRequirementsUnmetException(gaps.join('; '))`.

Steps
- [ ] Failing tests:
  - "tạo submit mặc định, bật SERVICE không có otherSupportNeeds → 409 0x13_56, storage không được gọi".
  - "tạo nháp submit:false, bật SERVICE rỗng → tạo được".
  - "Admin tạo, bật MONEY → 409 (không có tài khoản)" (documents Open question 1).
  - "POST :id/submit: intakeCounts thiếu tài khoản → 409, submitDraft không được gọi".
  - "đủ điều kiện → submitDraft được gọi".
  - "volunteer needs không tính".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB (`charity-project.check.ts`): a draft with `MATERIAL` and one need set `is_active = false` → `intakeCounts.openMaterialNeeds === 0`. Set `intake_status = 'CLOSED'` on an active one → still 0. A closed bank account (`valid_to` set) → `liveBankAccounts === 0`.
- [ ] Run unit and `test:charity-project` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (what is required for submit, the 409 body).
- [ ] Commit: `feat(charity): điều kiện gửi duyệt theo loại tiếp nhận ở cả ba đường` plus the trailer.

## Phase B — Distribution on rounds

### Task B1: core-lib distribution rules and codes 0x13_57–0x13_59

**Files**
- Create: `core-lib/src/models/charity-distribution.ts`, `core-lib/src/models/charity-distribution.spec.ts`; export it from `models/index.ts`
- Modify: `error-codes.ts`, `error-catalog.ts`, `charity-campaign.exception.ts`

**Interfaces**
- `CharityDistributionMethods`, `CharityServiceChannels`, `CharityShippingFeePayers = ['ORGANIZER','RECIPIENT'] as const` (Open question 7), `MaxCharityRoundEvidenceUrls = 20`.
- Input type:
  ```ts
  export interface ICharityRoundDistributionInput {
    distributionMethod: CharityDistributionMethod | null;
    contributionTypes: readonly CharityContributionType[];
    locationLabel: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    serviceType: CharitySupportType | null;
    serviceChannel: CharityServiceChannel | null;
    privateDetails: ICharityRoundPrivateDetailsInput;
  }
  ```
- Private details: `ICharityRoundPrivateDetailsInput { recipientName, recipientPhone, recipientAddress, coordinatorName, coordinatorPhone, carrier, shippingFeePayer, estimatedShippingFee, trackingCode, transferContent }`, all `| null`.
- `export function charityDistributionFieldGaps(input): string[]` returns missing field paths:
  - `DIRECT_RECIPIENT`: `recipientAddress`, `coordinatorName`, `coordinatorPhone`
  - `SHIPPING`: `recipientName`, `recipientPhone`, `recipientAddress`, `carrier`, `shippingFeePayer`, `estimatedShippingFee`
  - `OTHER_LOCATION`: `locationLabel`, and `address` or both `lat`/`lng`, plus `coordinatorName`
  - `BANK_TRANSFER`: `transferContent`
  - `SERVICE`: `serviceType`, `serviceChannel`, `coordinatorName`
  - any method: `contributionTypes` must be non-empty
  - `null` method → `[]`
- `export function charityDistributionMismatch(input): string | null`: `BANK_TRANSFER` without `MONEY` → message, else `null`.
- `export function charityRoundEvidenceGaps(round: { distributionMethod; evidenceUrls: readonly string[]; trackingCode: string | null }): string[]`: method `null` → `[]`; any method needs ≥1 `evidenceUrls`; `SHIPPING` also needs `trackingCode`.
- `export function stripInapplicableDistributionFields(input): ICharityRoundDistributionInput` sets fields that do not belong to the method to `null` (Open question 5).
- Exceptions:
  - `CharityDistributionFieldRequiredException(fields: string)`, sample `['privateDetails.recipientAddress']`, 400
  - `CharityDistributionMethodMismatchException(reason: string)`, 400
  - `CharityRoundEvidenceRequiredException(missing: string)`, 409

Steps
- [ ] Failing tests:
  - a table test, per method: a complete input gives `[]`; dropping each required field gives exactly that path.
  - `BANK_TRANSFER` + `['MATERIAL']` gives a mismatch.
  - `null` method gives no gaps and no evidence requirement.
  - `SHIPPING` with evidence but no tracking code → `['trackingCode']`.
  - `OTHER_LOCATION` with `lat` and no `lng` and no address → `address` gap.
  - whitespace-only `coordinatorName` counts as missing.
- [ ] Run the core-lib spec. Expect failures.
- [ ] Implement, add the codes and catalog entries, build core-lib, `npm run docs:errors`.
- [ ] Commit: `feat(charity): quy tắc hình thức trao theo đợt ở core-lib (0x13_57–0x13_59)` plus the trailer.

### Task B2: Migration 1803800000000, round repository, media sweep

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1803800000000-CampaignRoundDistributionMethods.ts`; update the barrel
- Modify: `core/src/domain/ports/repository/charity-operations.repository.ts` (`ICharityRoundInput`, `ICharityRound`, new `ICharityRoundPrivateDetails`)
- Modify: `core/src/infrastructure/repository/charity-operations.repository.ts` (`RoundSelect`, `IRoundRow`, `toRound`, `createRound`, `updateRound`)
- Create: `core/src/infrastructure/repository/charity-round.sql.ts` exporting `insertDistributionRound(manager: EntityManager, params: { campaignId: string; actorId: string; round: ICharityRoundInput }): Promise<string>`. It inserts the round, the private details row and the 10 event steps (moved out of `createRound` so A/B4 reuse it).
- Modify: `core/src/application/implementations/media/sweep-orphan-media.use-case.ts` and its `.spec.ts`
- Test: `core/test/charity-operations.check.ts`

**Interfaces**
- Round columns:
  - `distribution_method varchar(20) NULL CHECK IN (5 values)`
  - `contribution_types text[] NOT NULL DEFAULT '{}' CHECK <@ ARRAY['MATERIAL','MONEY','SERVICE']`
  - `evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(...)='array' AND jsonb_array_length(...) <= 20)`
  - `needs_review boolean NOT NULL DEFAULT false`
  - `service_type varchar(30) NULL`
  - `service_channel varchar(15) NULL CHECK IN (4 values)`
  - `location geography(Point,4326) NULL` with GiST index `IDX_campaign_distribution_rounds_location`
- `CREATE TABLE campaign_round_private_details`:
  - `round_id uuid PRIMARY KEY REFERENCES campaign_distribution_rounds(global_id) ON DELETE CASCADE`
  - `campaign_id uuid NOT NULL REFERENCES campaigns(global_id) ON DELETE CASCADE`
  - `recipient_name varchar(200)`, `recipient_phone varchar(30)`, `recipient_address varchar(500)`, `coordinator_name varchar(200)`, `coordinator_phone varchar(30)`, `carrier varchar(200)`
  - `shipping_fee_payer varchar(12) CHECK IN ('ORGANIZER','RECIPIENT')`
  - `estimated_shipping_fee integer CHECK (>= 0 AND <= 10000000)`
  - `tracking_code varchar(100)`, `transfer_content varchar(200)`
  - `updated_by uuid REFERENCES users(global_id) ON DELETE SET NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`
- Legacy mapping `UPDATE … FROM campaign_phases` per Global Constraints. The single-round test counts rounds with `distribution_method IS NULL` per campaign. Rounds get `contribution_types` left at `'{}'`.
- `down()` drops the table and the columns. It does not restore the mapping, since phase data is untouched.
- `ICharityRound` adds `distributionMethod`, `contributionTypes`, `evidenceUrls`, `needsReview`, `serviceType`, `serviceChannel`, `lat`, `lng`, and `privateDetails: ICharityRoundPrivateDetails | null` (LEFT JOIN).
- `updateRound` upserts private details (`ON CONFLICT (round_id) DO UPDATE`), sets `needs_review = false`, and includes method/location in the "moved" fields only through the existing `locationLabel`/`address`/time.
- Sweep: add `{ label: 'campaign_distribution_rounds.evidence_urls', sql: 'SELECT jsonb_array_elements_text(evidence_urls) AS value FROM campaign_distribution_rounds WHERE jsonb_typeof(evidence_urls) = \'array\'' }`.

Steps
- [ ] Failing sweep spec "KHÔNG xoá ảnh bằng chứng đợt trao": the mocked query for that label returns a key, and the storage delete is not called for it. Failing real-DB checks (two-step DataSource like A2, migrations `< 1803800000000`):
  - A campaign with DISTRIBUTION `delivery_method='SHIP'` and one round → after migrating, `SHIPPING`, `needs_review=false`.
  - `ON_SITE` with one round → `OTHER_LOCATION`, `needs_review=true`.
  - `TRANSFER` with two rounds → both `NULL`.
  - No phase method → `NULL`.
  - `createRound` with `privateDetails.recipientPhone='0901234567'` → a row in `campaign_round_private_details`.
  - `evidence_urls` with 21 items → CHECK rejects.
  - Deleting the round cascades the details.
- [ ] Run `npm run test --workspace=@chantam.vn/chantam.core -- src/application/implementations/media/sweep-orphan-media.use-case.spec.ts` and `npm run test:charity-operations --workspace=@chantam.vn/chantam.core`. Expect failures.
- [ ] Implement. Update `charity-operations.use-cases.spec.ts` round fixtures with the new fields.
- [ ] Run unit, `test:charity-operations`, `test:seed-full` (pass; seeds insert rounds without the new columns).
- [ ] Docs: DATABASE.md (columns, new table, mapping rule).
- [ ] Commit: `feat(charity): cột hình thức trao trên đợt, bảng chi tiết riêng tư và ánh xạ phase cũ (migration 1803800000000)` plus the trailer.

### Task B3: Round save validation, public/workspace split, evidence for DONE

**Files**
- Modify: `charity-operations.contract.ts`:
  - `ICharityRoundPublic = Omit<ICharityRound, 'readiness'|'readinessNote'|'readinessBy'|'readinessAt'|'checklist'|'privateDetails'|'needsReview'>`
  - `ISaveCharityRoundCommand.round` is the extended `ICharityRoundInput`
- Modify: `charity-operations.use-cases.ts` (`toRoundPublic`, `SaveCharityRoundUseCase`, `SetCharityRoundStatusUseCase`)
- Modify: `charity-operations.dto.ts`:
  - `CharityRoundInputDto` adds `distributionMethod?`, `contributionTypes?`, `lat?`, `lng?`, `serviceType?`, `serviceChannel?`, `evidenceUrls?` (`@ArrayMaxSize(20)`, `@Matches(/^https:\/\/\S+$/, {each:true})`), and flat private fields `recipientName?`, `recipientPhone?`, `recipientAddress?`, `coordinatorName?`, `coordinatorPhone?`, `carrier?`, `shippingFeePayer?`, `estimatedShippingFee?`, `trackingCode?`, `transferContent?`
  - `CharityRoundPublicDto` adds the public fields
  - `CharityRoundDto` adds `needsReview` and `privateDetails` (`CharityRoundPrivateDetailsDto`)
- Modify: `charity-operations.controller.ts` (`saveRound` mapping, error lists on `POST :id/rounds`, `PATCH :id/rounds/:roundId`, `POST :id/rounds/:roundId/status`)
- Test: `charity-operations.use-cases.spec.ts`, `test/charity-operations.check.ts`

**Interfaces**
- Save order:
  1. trim
  2. `stripInapplicableDistributionFields`
  3. evidence: https, at most 20, duplicates removed (`ValidationFailedException`)
  4. `charityDistributionMismatch` → 400 `0x13_58`
  5. `charityDistributionFieldGaps` → 400 `0x13_57` with `gaps.join(', ')`
  6. for `DIRECT_RECIPIENT`/`SHIPPING` the public `address` is forced to `null`, and the address goes in `recipientAddress`
- `toRoundPublic` picks fields explicitly:
  - `address`: when `distributionMethod === 'OTHER_LOCATION' || distributionMethod === null` (Open question 8); otherwise `null`
  - `lat`/`lng`: only for `OTHER_LOCATION`
  - `evidenceUrls`: always (§6.3)
- `SetCharityRoundStatusUseCase` with `DONE`: `charityRoundEvidenceGaps(current)` non-empty → `CharityRoundEvidenceRequiredException(gaps.join(', '))`. `CANCELLED` is unchanged.

Steps
- [ ] Failing tests:
  - "SHIPPING thiếu carrier → 400 0x13_57 với 'carrier'".
  - "BANK_TRANSFER contributionTypes ['MATERIAL'] → 400 0x13_58".
  - "DIRECT_RECIPIENT gửi address → lưu address null, recipientAddress = địa chỉ".
  - "evidenceUrls http:// → 400".
  - "public: SHIPPING round → address null, không có key privateDetails/needsReview" (`expect(Object.keys(result[0])).not.toContain('privateDetails')`).
  - "public: OTHER_LOCATION → address và lat/lng có".
  - "workspace: privateDetails.recipientPhone có".
  - "DONE SHIPPING thiếu trackingCode → 409 0x13_59, setRoundStatus không được gọi".
  - "DONE round cũ method null không cần bằng chứng".
  - "PATCH lưu xong needsReview = false".
- [ ] Run the focused spec. Expect failures.
- [ ] Implement.
- [ ] Real-DB: through the real `ListCharityRoundsUseCase` on a `DIRECT_RECIPIENT` round, `JSON.stringify(result)` does not contain the recipient phone or address strings, and `GET` manage returns them.
- [ ] Run unit and `test:charity-operations` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (round body by method, public vs workspace table §3.4, DONE rule), Swagger `deprecated` on `CharityPhaseDto.deliveryMethod`.
- [ ] Commit: `feat(charity): validate hình thức trao theo đợt, tách trường riêng tư, DONE cần bằng chứng` plus the trailer.

### Task B4: `distribution` in the create body → first round + DISTRIBUTION phase

**Files**
- Modify: `charity-campaign.contract.ts` (`ICreateCharityCampaignInput.distribution?: ICharityCampaignDistributionInput`)
- Modify: the `ICreateCharityCampaignParams` port (`distribution: { round: ICharityRoundInput; startsAt: Date; endsAt: Date } | null`)
- Modify: `charity-campaign.repository.ts` (`create`: inside the transaction, `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at, updated_by) VALUES ($1,'DISTRIBUTION',$2,$3,$4)`, then `insertDistributionRound`)
- Modify: `charity-campaign.use-cases.ts` (`CreateCharityCampaignUseCase`)
- Modify: `charity-campaign.dto.ts` (`CharityCampaignDistributionDto`, `CharityDistributionLocationDto { label?, address?, lat?, lng? }`)
- Test: the campaign spec and `test/charity-campaign.check.ts`

**Interfaces**
- PR #55 names: `method`, `contributionTypes`, `location{label,address,lat,lng}`, `scheduledStart`, `scheduledEnd`, `coordinatorName`, `coordinatorPhone`, plus the same flat private fields as B3.
- Maps to round title `'Đợt trao 1'` (wording is up to the implementer). `scheduledEnd <= scheduledStart` → `ValidationFailedException(['distribution.scheduledEnd: phải sau scheduledStart'])`.
- Same validation chain as B3, run before `confirmCharityMedia`.
- `delivery_method` is not written. The response `distribution {startsAt, endsAt}` is unchanged.

Steps
- [ ] Failing tests:
  - "tạo có distribution OTHER_LOCATION đủ trường → repository.create nhận distribution.round.locationLabel = 'Nhà văn hoá xã'".
  - "distribution SHIPPING thiếu recipientPhone → 400 0x13_57, storage không gọi".
  - "BANK_TRANSFER không MONEY → 400 0x13_58".
- [ ] Run the focused spec. Expect failures.
- [ ] Implement.
- [ ] Real-DB: create with `distribution` → exactly 1 `campaign_distribution_rounds` row, 10 `campaign_event_steps` with that `round_id`, a DISTRIBUTION phase whose `starts_at` equals `scheduledStart`, `delivery_method IS NULL`, and `findByGlobalId(...).distribution.startsAt` equals it. Reading the workspace back has every field (§7 acceptance).
- [ ] Run unit and `test:charity` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (create payload §3.3).
- [ ] Commit: `feat(charity): khối distribution khi tạo chiến dịch thành đợt trao đầu tiên và khung bước trao` plus the trailer.

## Phase C — Beneficiary bank accounts

### Task C1: Migration 1803900000000, name normaliser, repository

**Files**
- Create: `core/src/infrastructure/persistence/migrations/1803900000000-CampaignBeneficiaryBankAccounts.ts`; update the barrel
- Create: `core-lib/src/models/charity-beneficiary-account.ts` and its `.spec.ts`; export from the index
- Modify: codes `0x13_5a`/`0x13_5b`, catalog, exceptions
- Modify: the `charity-project.repository.ts` port and implementation (new methods), `charity-operations.repository.ts` (private details `beneficiary_bank_account_id`)
- Test: `test/charity-project.check.ts`

**Interfaces**
- Table `campaign_beneficiary_bank_accounts`:
  - `id BIGSERIAL`, `global_id uuid UNIQUE`
  - `campaign_id uuid FK campaigns ON DELETE CASCADE`
  - `holder_type varchar(12) CHECK IN ('OWNER','BENEFICIARY')`
  - `party_id uuid REFERENCES campaign_parties(global_id) ON DELETE SET NULL`
  - `CHECK (holder_type = 'BENEFICIARY' OR party_id IS NULL)`
  - `bank_name varchar(200)`, `account_no varchar(40)` with the same regex CHECK as `campaign_bank_accounts`, `account_name varchar(200)`
  - `valid_from`, `valid_to`, `close_reason` with the same window/close CHECKs
  - `verified_at timestamptz`, `verified_by uuid REFERENCES users ON DELETE SET NULL`
  - `CHECK (verified_by IS NULL OR verified_at IS NOT NULL)`. Do not pair them both ways, or `SET NULL` would break the CHECK.
  - `created_by`, `closed_by`
  - partial index on live rows
- Round link: `ALTER TABLE campaign_round_private_details ADD COLUMN beneficiary_bank_account_id uuid REFERENCES campaign_beneficiary_bank_accounts(global_id) ON DELETE SET NULL`.
- core-lib:
  - `normalizeHolderName(value: string | null): string`: replace `đ→d`, `Đ→D` before `normalize('NFD')`, strip `\p{M}`, lowercase, collapse `\s+`, trim
  - `holderNameMatches(accountName: string, expected: string | null): boolean` (false when `expected` is empty or null)
- Port methods:
  - `listBeneficiaryBankAccounts(campaignId): Promise<ICharityBeneficiaryBankAccount[]>`
  - `addBeneficiaryBankAccount({campaignId, actorId, account: ICharityBeneficiaryBankAccountInput, replacesAccountId: string|null, replaceReason: string|null}): Promise<{status:'CREATED'; account} | {status:'REPLACED_NOT_FOUND'}>`: a new version, always unverified
  - `closeBeneficiaryBankAccount({campaignId, accountId, actorId, reason}): Promise<boolean>`
  - `verifyBeneficiaryBankAccount({campaignId, accountId, actorId}): Promise<ICharityBeneficiaryBankAccount|null>`: only live rows
  - `findOwnerFullName(campaignId): Promise<string|null>` (`users.full_name` of `campaigns.created_by`)
- Exceptions:
  - `CharityBeneficiaryAccountNameMismatchException(expected: string)`, 400
  - `CharityBeneficiaryAccountNotVerifiedException()`, 409

Steps
- [ ] Failing core-lib spec:
  - `normalizeHolderName('  NGUYỄN  Văn Đức ') === 'nguyen van duc'`
  - `holderNameMatches('NGUYEN VAN DUC','Nguyễn Văn Đức')` is true
  - `holderNameMatches('NGUYEN VAN DUC', null)` is false
  - `holderNameMatches('TRAN THI B','Trần Thị Bé')` is false
- [ ] Failing real-DB checks:
  - adding with `replacesAccountId` closes the old row (`valid_to` not null) and the new row has `verified_at IS NULL` even when the old one was verified
  - deleting the verifier user leaves `verified_at` set and `verified_by` null (no CHECK violation)
  - `OWNER` with `party_id` → CHECK rejects
- [ ] Run the core-lib spec and `test:charity-project`. Expect failures.
- [ ] Implement, build core-lib, `npm run docs:errors`.
- [ ] Run them again (pass), plus `test:seed-full`.
- [ ] Docs: DATABASE.md.
- [ ] Commit: `feat(charity): bảng tài khoản thụ hưởng có xác thực và chuẩn hoá tên chủ tài khoản (migration 1803900000000)` plus the trailer.

### Task C2: Use cases, endpoints, party guard, BANK_TRANSFER

**Files**
- Modify: `charity-project.contract.ts` (`IAddCharityBeneficiaryBankAccountUseCase`, `ICloseCharityBeneficiaryBankAccountUseCase`, `IVerifyCharityBeneficiaryBankAccountUseCase` with Symbols; `ICharityWorkspace.beneficiaryBankAccounts`)
- Modify: `charity-project.use-cases.ts` (the three classes, `GetCharityWorkspaceUseCase`, `ReplaceCharityPartiesUseCase` guard), `charity-project.module.ts`
- Modify: `charity-project.dto.ts` (`CharityBeneficiaryBankAccountDto`, `…BodyDto`, `…ViewDto`, `CharityProjectBeneficiaryAccountParamsDto`)
- Modify: `charity-project.controller.ts`:
  - `POST :id/beneficiary-bank-accounts`
  - `POST :id/beneficiary-bank-accounts/:accountId/close`
  - Admin `POST :id/beneficiary-bank-accounts/:accountId/verify` with `@RequiresPermission('campaign.manage')`
- Modify: `charity-operations.use-cases.ts` (save: `beneficiaryBankAccountId` must be a live account of this campaign, else `ValidationFailedException`; DONE for `BANK_TRANSFER`: the linked account must be live, in the same campaign and verified, else `CharityBeneficiaryAccountNotVerifiedException`), `charity-operations.dto.ts` (`beneficiaryBankAccountId?`), the B1 field rules unchanged (Open question 11)
- Test: `charity-project.use-cases.spec.ts`, `charity-operations.use-cases.spec.ts`, `test/charity-project.check.ts`, `test/charity-operations.check.ts`

**Interfaces**
- Add (forEdit; `MONEY` gate as in A4):
  - `OWNER` → `holderNameMatches(accountName, findOwnerFullName)`
  - `BENEFICIARY` → `partyId` must be a `BENEFICIARY` party of this campaign (else 400 validation), and `holderNameMatches(accountName, party.name)`
  - mismatch → `CharityBeneficiaryAccountNameMismatchException`
- Verify: Admin only, writes `verified_at = now(), verified_by = actor`; missing or closed → `CharityBankAccountNotFoundException`.
- Workspace only. Public never selects this table.
- Parties guard: removing a party (not in `keep`) that has a live beneficiary account → `ValidationFailedException(['parties: bên thụ hưởng "<name>" còn tài khoản thụ hưởng đang hiệu lực — đóng tài khoản trước'])`.

Steps
- [ ] Failing tests:
  - "OWNER tên lệch → 400 0x13_5a".
  - "OWNER 'NGUYEN VAN DUC' với full_name 'Nguyễn Văn Đức' → tạo".
  - "BENEFICIARY partyId không phải BENEFICIARY → 400".
  - "workspace có beneficiaryBankAccounts; public project không có key này".
  - "DONE BANK_TRANSFER: chưa gắn / gắn tài khoản chưa xác thực / tài khoản dự án khác / tài khoản đã bị thay → 409 0x13_5b".
  - "đã xác thực + đủ bằng chứng → DONE".
  - "PUT parties bỏ bên thụ hưởng còn tài khoản → 400".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement and register in the module.
- [ ] Real-DB:
  - verify via the real repository, then replace → new row unverified → round DONE rejected.
  - `JSON.stringify` of the real `GetCharityPublicProjectUseCase` output does not contain the account number.
- [ ] Run unit, `test:charity-project`, `test:charity-operations`, `test:permission-inventory` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (3 routes, rules), FEATURES.md.
- [ ] Commit: `feat(charity): tài khoản thụ hưởng — so tên, Admin xác thực, đợt BANK_TRANSFER cần tài khoản đã xác thực` plus the trailer.

## Phase D — Summary totals

### Task D1: Three separate totals on the summary board and the public project

**Files**
- Modify: `core/src/domain/ports/repository/charity-summary.repository.ts` (`ICharityIntakeTotals`, `intakeTotals(campaignId: string): Promise<ICharityIntakeTotals>`)
- Modify: `core/src/infrastructure/repository/charity-summary.repository.ts`
- Modify: `charity-summary.contract.ts` (`ICharitySummaryBoard.totals: ICharityIntakeTotals`), `charity-project.contract.ts` (`ICharityPublicProject.totals: ICharityIntakeTotals | null`)
- Modify: `charity-summary.use-cases.ts` (`GetCharitySummaryUseCase`), `charity-project.use-cases.ts` (`GetCharityPublicProjectUseCase`)
- Modify: `charity-summary.dto.ts`, `charity-project.dto.ts`
- Test: `charity-summary.use-cases.spec.ts`, `charity-project.use-cases.spec.ts`, `test/charity-summary.check.ts`

**Interfaces**
```ts
interface ICharityIntakeTotals {
  material: { lines: { unit: string; receivedQuantity: number }[]; confirmedValue: number };
  money: { confirmedAmount: number; externalAmount: number; totalAmount: number; reportedIncome: number } | null;
  service: { lines: { supportType: CharitySupportType; unit: string; completedQuantity: number }[] };
}
```
- Material: `SUM(campaign_need_items.received_quantity)` grouped by `unit`. `confirmedValue` uses the same expression as `RoundSelect.confirmed_value`, but campaign-wide over COMPLETED deliveries.
- Money: `SUM(confirmed_amount)` and `SUM(external_amount)` from `campaign_funding_needs`; `reportedIncome = SUM(total_income)` from `campaign_financial_reports`.
- Service: `SUM(completed_quantity of COMPLETED offers) + external_quantity`, grouped by `(support_type, unit)`.
- The board always has all three. Public: `null` until the summary is published. Inside it, `money` is `null` when `MONEY` is not accepted (Open question 13).
- No single grand total exists anywhere.

Steps
- [ ] Failing tests:
  - "board totals có 3 khối riêng, không có trường tổng chung" (`Object.keys(board.totals).sort()` equals `['material','money','service']`).
  - "public: chưa công khai tổng kết → totals null".
  - "public: tắt MONEY → totals.money null".
- [ ] Run the focused specs. Expect failures.
- [ ] Implement.
- [ ] Real-DB (`charity-summary.check.ts`):
  - two need items with units `chiếc` and `kg` → two material lines
  - a completed offer with `completed_quantity=2` plus `external_quantity=1` → `completedQuantity=3`
  - a funding need `confirmed 1_000_000`, `external 500_000` and a report `total_income 1_200_000` → `{1000000, 500000, 1500000, 1200000}`
- [ ] Run unit and `test:charity-summary` (pass). `npm run docs:routes`.
- [ ] Docs: API.md (summary board and public `totals`).
- [ ] Commit: `feat(charity): tổng kết ba tổng riêng — hiện vật, tiền, dịch vụ` plus the trailer.

## Final verification

- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run lint:check`
- [ ] `npm run format:check`
- [ ] `npm run docs:errors:check`
- [ ] `npm run docs:routes:check`
- [ ] `test:charity`, `test:charity-contribution`, `test:charity-project`, `test:charity-operations`, `test:charity-summary`, `test:charity-engagement`, `test:charity-event`, `test:charity-participation`, `test:charity-points`, `test:seed-full`, `test:permission-inventory` (Docker up)
- [ ] An independent review of each phase before pushing.

## Open questions for the controller

The same 14 questions as at the top of this reply. Each one is marked in the plan as "Open question N" with its default.

## Self-Review

- **Spec coverage:**
  - The three decisions of 20/11 are in A4 (money writes and public hiding), A5 (volunteer needs excluded) and C1/C2 (name match plus verification, new version gets re-verified).
  - Writer decisions:
    - profile/Admin editing: A3
    - open material need definition: A5
    - submit on 3 paths, drafts skipped: A5
    - evidence column: B2
    - address privacy: B3
    - consent: no new column, evidence public: B3
    - `distribution` → first round plus phase: B4
    - enum names: A1/B1
    - legacy migration: A2/B2
    - codes `0x13_55`–`0x13_5b` in design order: A1, B1, C1
  - Each phase ends with its real-DB checks, a seed check, docs and a review step.
- **Type consistency:**
  - `CharityContributionType` flows from core-lib into `ICharityCampaign.acceptedContributionTypes`, `ICharityProjectProfile`, the create params and `ICharityRound.contributionTypes`.
  - `ICharityRoundInput` is shared by B3, B4 (via `insertDistributionRound`) and C2 (`privateDetails.beneficiaryBankAccountId`).
  - Error class names match the catalog keys.
- **Review focus:** each of the 5 items has a named test in its task (B3, B2, C1, A2/A3, C2).
- **Proportion:** 12 tasks, one migration per phase, no new repository classes. Rules live in pure core-lib functions so they are unit-tested once and reused by round save, create-time distribution and `DONE`. Function bodies are left to the implementer, except where a rule (an SQL predicate, a CHECK, or the order of validation) decides correctness.

### Critical Files for Implementation
- `D:/works/freelancer_dev/true-heart/suites/chantam.vn/chantam/core/src/application/implementations/charity-campaign/charity-campaign.use-cases.ts`
- `D:/works/freelancer_dev/true-heart/suites/chantam.vn/chantam/core/src/application/implementations/charity-project/charity-operations.use-cases.ts`
- `D:/works/freelancer_dev/true-heart/suites/chantam.vn/chantam/core/src/infrastructure/repository/charity-operations.repository.ts`
- `D:/works/freelancer_dev/true-heart/suites/chantam.vn/chantam/core/src/application/implementations/charity-project/charity-project.use-cases.ts`
