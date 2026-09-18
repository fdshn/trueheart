# Onboarding Member Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate OFFER/WANTED creation behind server-verified one-time onboarding that promotes Viewer to Member, and add a canonical nearby type filter for OFFER/WANTED discovery.

**Architecture:** Create an `onboarding` resource across core-lib/domain/application/infrastructure. Task templates define immutable evidence types; server-side evaluators record idempotent completions after trusted profile and OTP actions, then promote only the current database Viewer to Member when all active required tasks are complete. Canonical nearby queries require a post type; legacy gift nearby remains OFFER-only.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL/PostGIS, class-validator, Jest, existing `ResponseDto`/error catalog patterns.

**Spec:** `docs/superpowers/specs/2026-09-18-onboarding-nearby-design.md`

## Global Constraints

- Client must never submit an onboarding completion; only trusted server use cases may record evidence.
- Default immutable evidence keys are `PROFILE_COMPLETE` and `PHONE_VERIFIED`.
- Completion of all active required tasks promotes only `VIEWER → MEMBER`; never demote an existing Member after task changes.
- Post creation must re-read database rank, never rely on JWT rank.
- Task admin policy is temporary `ONBOARDING_TASK_ADMIN_USERNAMES`, normalized like category/post operator allowlists.
- Canonical nearby requires `postType` exactly `OFFER` or `WANTED`; public results retain status, jitter, and bucket-distance rules.
- Legacy `/api/v1/gift-posts/nearby` remains canonical OFFER-only.
- Do not implement audit logging, points, referral, recurring tasks, Smart Match, SOS, or transaction logic in this plan.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `core-lib/src/consts/onboarding-task-evidence.ts` | Immutable trusted evidence enum |
| `core-lib/src/models/onboarding-task.ts` | Task template and user completion contracts |
| `core-lib/src/entities/onboarding-*.entity.ts` | Shared entity interfaces/DI tokens |
| `core-lib/src/dto/onboarding/onboarding.dto.ts` | Admin CRUD and client progress contracts |
| `core/src/domain/ports/repository/onboarding-*.repository.ts` | Persistence boundaries for templates/completions |
| `core/src/application/implementations/onboarding/*` | Evaluator, progress, task CRUD use cases/resource module |
| `core/src/infrastructure/entity/onboarding-*.entity.ts` | TypeORM mapping |
| `core/src/infrastructure/repository/onboarding-*.repository.ts` | Transactional completion/promotion implementation |
| `core/src/infrastructure/controller/api/onboarding/onboarding.controller.ts` | Admin CRUD and own progress endpoints |
| `core/src/infrastructure/persistence/migrations/*Onboarding*.ts` | Additive tables/default task seed/backfill |
| `core/src/application/implementations/post/create-*.use-case.ts` | Member gate before category/quota persistence |
| `core/src/application/contracts/post/get-nearby-posts.use-case.ts` | Canonical nearby query contract |
| `core/src/infrastructure/controller/api/post/post.controller.ts` | `GET /api/v1/posts/nearby` before `:postId` |

---

### Task 1: Shared onboarding contracts and additive migration

**Files:**
- Create: `suites/chantam.vn/chantam/core-lib/src/consts/onboarding-task-evidence.ts`
- Create: `suites/chantam.vn/chantam/core-lib/src/models/onboarding-task.ts`
- Create: `suites/chantam.vn/chantam/core-lib/src/entities/onboarding-task.entity.ts`
- Create: `suites/chantam.vn/chantam/core-lib/src/entities/user-onboarding-task-completion.entity.ts`
- Create: `suites/chantam.vn/chantam/core-lib/src/dto/onboarding/onboarding.dto.ts`
- Modify: core-lib barrels for consts/models/entities/dto
- Create: `core/src/infrastructure/persistence/migrations/1789900000003-CreateOnboardingTasks.ts`
- Modify: `core/src/infrastructure/persistence/migrations/index.ts`

**Interfaces:**
- Produces `OnboardingTaskEvidenceTypes.PROFILE_COMPLETE | PHONE_VERIFIED`.
- Produces `IOnboardingTaskEntity`, `IUserOnboardingTaskCompletionEntity` and immutable task DTO contracts.

- [ ] **Step 1: Write migration/schema test expectations**

Create a migration test that asserts the default seed has exactly the two required active task keys and that `(user_id, task_id)` is unique.

```ts
expect(taskKeys).toEqual(['PHONE_VERIFIED', 'PROFILE_COMPLETE']);
expect(completionUnique).toBe(true);
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `npm run test --workspace=@chantam.vn/chantam.core -- --runInBand src/infrastructure/persistence/migrations/onboarding-tasks.spec.ts`

Expected: FAIL because migration/task schema does not exist.

- [ ] **Step 3: Define immutable evidence and entity interfaces**

```ts
export enum OnboardingTaskEvidenceTypes {
  PROFILE_COMPLETE = 'PROFILE_COMPLETE',
  PHONE_VERIFIED = 'PHONE_VERIFIED',
}

export interface IOnboardingTask {
  key: OnboardingTaskEvidenceTypes;
  title: string;
  description: string;
  required: boolean;
  active: boolean;
  sortOrder: number;
}
```

- [ ] **Step 4: Add additive migration**

Create `onboarding_tasks` with `global_id`, immutable unique `key`, title, description, required, active, sort order, audit/soft-delete fields. Create `user_onboarding_task_completions` with `user_id`, `task_id`, `completed_at`, `evidence_ref` and unique `(user_id, task_id)`. Seed Profile + Phone tasks using `ON CONFLICT (key) DO NOTHING`.

- [ ] **Step 5: Run migration test and local migration**

Run:

```bash
npm run test --workspace=@chantam.vn/chantam.core -- --runInBand src/infrastructure/persistence/migrations/onboarding-tasks.spec.ts
npm run migration:run --workspace=@chantam.vn/chantam.core
npm run migration:show --workspace=@chantam.vn/chantam.core
```

Expected: test passes; migration is marked executed.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core-lib/src/{consts,models,entities,dto} suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations
git commit -m "feat(onboarding): thêm schema nhiệm vụ một lần"
```

### Task 2: Trusted completion evaluator and Viewer-to-Member promotion

**Files:**
- Create: `core/src/domain/ports/repository/onboarding-task.repository.ts`
- Create: `core/src/domain/ports/repository/user-onboarding-task-completion.repository.ts`
- Modify: repository port barrel
- Create: `core/src/infrastructure/entity/onboarding-task.entity.ts`
- Create: `core/src/infrastructure/entity/user-onboarding-task-completion.entity.ts`
- Modify: entity barrel/module
- Create: `core/src/infrastructure/repository/onboarding-task.repository.ts`
- Create: `core/src/infrastructure/repository/user-onboarding-task-completion.repository.ts`
- Modify: repository module
- Create: `core/src/application/implementations/onboarding/record-onboarding-evidence.use-case.ts`
- Create: `core/src/application/implementations/onboarding/record-onboarding-evidence.use-case.spec.ts`
- Create: onboarding contracts/module

**Interfaces:**
- Consumes `OnboardingTaskEvidenceTypes`, `IUserRepository`.
- Produces `IRecordOnboardingEvidenceUseCase.handle({ userId, evidenceType, evidenceRef? }): Promise<void>`.

- [ ] **Step 1: Write failing evaluator tests**

```ts
it('inserts completion idempotently and promotes only Viewer after all required active tasks');
it('does not promote Viewer while one required task is incomplete');
it('does not demote Member when task list changes');
it('ignores inactive or optional task gaps');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=@chantam.vn/chantam.core -- --runInBand src/application/implementations/onboarding/record-onboarding-evidence.use-case.spec.ts`

Expected: FAIL because evaluator does not exist.

- [ ] **Step 3: Implement transactional repository method**

Under one database transaction: resolve active task matching evidence type, insert completion with `ON CONFLICT DO NOTHING`, count active required tasks vs completions, then conditionally update `users.rank` only when current rank is `VIEWER` and all required tasks complete.

```sql
UPDATE users
SET rank = 'MEMBER'
WHERE global_id = $1 AND rank = 'VIEWER';
```

- [ ] **Step 4: Implement evaluator use case**

Call the transactional repository method; do not expose it as client completion API.

- [ ] **Step 5: Run evaluator tests**

Expected: all evaluator tests pass.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/{domain,application,infrastructure}
git commit -m "feat(onboarding): tự đánh dấu nhiệm vụ và lên Member"
```

### Task 3: Wire trusted profile and phone events, then gate post creation

**Files:**
- Modify: `core/src/application/implementations/profile/update-own-profile.use-case.ts`
- Modify: `core/src/application/implementations/profile/confirm-phone-verification.use-case.ts`
- Modify: profile tests
- Modify: `core/src/application/implementations/post/create-post.use-case.ts`
- Modify: `core/src/application/implementations/post/create-wanted-post.use-case.ts`
- Modify: post create tests
- Modify: core error catalog/exception docs if adding `ONBOARDING_INCOMPLETE`

**Interfaces:**
- Consumes `IRecordOnboardingEvidenceUseCase`.
- Post creation must throw the dedicated onboarding exception when database rank remains `VIEWER`.

- [ ] **Step 1: Write failing integration/unit tests**

```ts
it('records PROFILE_COMPLETE only after profile update leaves isProfileComplete true');
it('records PHONE_VERIFIED only after OTP verification succeeds');
it('rejects OFFER and WANTED before Member promotion even with a complete profile');
it('allows OFFER and WANTED when database rank is Member');
```

- [ ] **Step 2: Run tests to verify failure**

Run focused profile/post tests. Expected: post creation still depends only on profile/quota and permits no task evaluator integration.

- [ ] **Step 3: Inject evaluator after trusted actions succeed**

`UpdateOwnProfileUseCase` calls evaluator with `PROFILE_COMPLETE` only after database update and only when resulting profile satisfies shared helper. `ConfirmPhoneVerificationUseCase` calls evaluator after OTP verify/update with `PHONE_VERIFIED`.

- [ ] **Step 4: Add Member gate before category/quota**

In both `CreatePostUseCase` and `CreateWantedPostUseCase`, after loading the database user and profile gate:

```ts
if (user.rank === UserRanks.VIEWER) throw new OnboardingIncompleteException();
```

- [ ] **Step 5: Run focused tests and full Core tests**

Expected: profile/phone/post gate tests all pass.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/application suites/chantam.vn/chantam/core-lib/src/consts docs/API-ERRORS.md
git commit -m "feat(onboarding): yêu cầu Member trước khi đăng bài"
```

### Task 4: Admin task CRUD and client progress API

**Files:**
- Create: `core/src/application/contracts/onboarding/*`
- Create: `core/src/application/implementations/onboarding/{get,create,update}-onboarding-task.use-case.ts`
- Create: tests beside each use case
- Create: `core/src/infrastructure/controller/dto/onboarding/onboarding.dto.ts`
- Create: `core/src/infrastructure/controller/api/onboarding/onboarding.controller.ts`
- Create: `core/src/infrastructure/controller/api/onboarding/onboarding.module.ts`
- Modify: API module, application module, config interface/schema/loader/env example/tests

**Interfaces:**
- `GET /api/v1/onboarding/tasks` returns `{ tasks, completedRequiredCount, requiredCount, isComplete }` for authenticated user.
- Admin endpoints use `ONBOARDING_TASK_ADMIN_USERNAMES` and receive `principal.username` server-side.

- [ ] **Step 1: Write failing tests**

```ts
it('returns active tasks with own completion state and required progress');
it('rejects unallowlisted admin task creation/update before repository access');
it('does not allow key/evidence type mutation after task creation');
it('deactivates task instead of hard deletion');
```

- [ ] **Step 2: Run focused tests to verify failure**

Expected: onboarding controller/use cases/config do not exist.

- [ ] **Step 3: Add temporary config allowlist**

Add `ONBOARDING_TASK_ADMIN_USERNAMES` with Joi default `''`, CSV trim/lowercase/filter in loader, typed config branch, env documentation.

- [ ] **Step 4: Implement progress and CRUD use cases**

Use category admin style. Create accepts immutable key/evidence type; update accepts mutable display/required/active/sort fields only. Deactivation keeps completion history.

- [ ] **Step 5: Implement HTTP DTO/controller module**

Use resource-wrapped bodies, dedicated UUID params, `ResponseDto`, Swagger errors, `@Public()` nowhere on onboarding endpoints.

- [ ] **Step 6: Run Core tests/build and smoke progress endpoint**

Use a local test user whose profile+phone evidence are complete; verify the API reports complete/Member.

- [ ] **Step 7: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/{application,infrastructure,domain} suites/chantam.vn/chantam/core-lib/src docs
git commit -m "feat(onboarding): thêm quản lý nhiệm vụ và tiến độ user"
```

### Task 5: Canonical nearby type filter and legacy compatibility proof

**Files:**
- Create: `core/src/application/contracts/post/get-nearby-posts.use-case.ts`
- Create: `core/src/application/implementations/post/get-nearby-posts.use-case.ts` + tests
- Modify: `core-lib/src/dto/post/post.dto.ts`
- Create: `core/src/infrastructure/controller/dto/post/get-nearby-posts.dto.ts`
- Modify: `core/src/infrastructure/controller/api/post/post.controller.ts`
- Modify: post repository port/adapter if a type-parametric nearby method is not already sufficient
- Modify: legacy nearby compatibility tests

**Interfaces:**
- `GET /api/v1/posts/nearby?lat&lng&radiusMeters&postType=OFFER|WANTED&categoryId?&page&pageSize`
- Public response contains canonical posts with jittered location and bucketed distance.
- Legacy `/api/v1/gift-posts/nearby` calls canonical nearby with `PostTypes.OFFER` only.

- [ ] **Step 1: Write failing tests**

```ts
it('requires OFFER or WANTED for canonical nearby');
it('forwards requested postType to canonical repository query');
it('does not return WANTED through legacy gift nearby');
it('retains jitter and bucketed distance in both routes');
```

- [ ] **Step 2: Run focused tests to verify failure**

Expected: canonical nearby route/use case does not exist.

- [ ] **Step 3: Implement type-parametric public radius query**

Use `GeoQueryHelper.applyRadiusFilter`, `selectDistance`, `orderByDistance`, `post.deletedAt IS NULL`, public statuses, explicit `post.postType = :postType`, optional category UUID, offset/limit and total count.

- [ ] **Step 4: Implement canonical nearby use case/controller**

Validate `postType` enum; apply jitter and `bucketDistance`; declare route before `GET :postId`.

- [ ] **Step 5: Preserve legacy OFFER-only adapter**

Call the same repository with `PostTypes.OFFER` inside legacy nearby flow; retain legacy response fields through the compatibility mapper.

- [ ] **Step 6: Run full verification and smoke**

```bash
npm run test
npm run build
npm run lint:check
npm run format:check
npm run docs:errors:check
```

Start Docker/PostGIS, create/publish one OFFER and one WANTED fixture; canonical nearby must distinguish them and legacy nearby must only return OFFER.

- [ ] **Step 7: Commit**

```bash
git add suites/chantam.vn/chantam/core suites/chantam.vn/chantam/core-lib docs
git commit -m "feat(posts): thêm nearby filter theo loại bài"
```

### Task 6: Documentation and audit-log deferral

**Files:**
- Modify: `docs/SPRINT-PLAN.md`
- Modify: `docs/plan/ROADMAP.md`
- Modify: `docs/plan/DEFERRED.md`
- Modify: `suites/chantam.vn/chantam/core/README.md`

- [ ] **Step 1: Update Sprint status**

Mark onboarding/member gate and canonical nearby type filter complete only after Task 5 verification. Note remaining Sprint 2 work: Smart Match/SOS/lifecycle extensions.

- [ ] **Step 2: Record audit log scope**

Add a dedicated deferred item: centralized system audit log covering security/admin/domain flows comes after core functional milestones; task templates/completions preserve completion evidence now but are not a substitute for audit logging.

- [ ] **Step 3: Final verification and commit documentation**

```bash
npm run docs:errors:check
git add docs suites/chantam.vn/chantam/core/README.md
git commit -m "docs: cập nhật onboarding và audit deferred"
```

## Self-Review

- Spec coverage: Task 1–4 implement onboarding templates, trusted evidence, Member promotion, admin CRUD and client progress. Task 5 implements nearby type filtering and legacy OFFER-only behavior. Task 6 defers audit logging explicitly.
- Placeholder scan: no unresolved implementation placeholders; audit logging is explicitly deferred by scope.
- Type consistency: evaluator evidence enum is shared from core-lib; task keys are immutable; post gate checks database rank; canonical nearby uses `PostTypes` across DTO/contract/repository.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-18-onboarding-member-gate.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.
