# Task 3 report — owner point reads

## Status
Implemented the F08/F39 owner-only point-read slice on the Task 2 base. It adds authenticated point summary and paginated ledger-history endpoints without changing rank behavior, rank transitions, maintenance, or any point-ledger write behavior.

## Implementation details
- Added shared point DTO interfaces under `core-lib/src/dto/point/` and exported them from the DTO barrel.
- Added separate `handle()` contracts and symbols for point summary and point history reads.
- Extended `IPointLedgerRepository` with compact domain models for projection summary and paginated ledger entries.
- `PointLedgerRepository` now reads `user_point_balances` (zero fallback for an absent row) and owner-scoped `point_ledger` history. It uses newest-first `(created_at DESC, id DESC)` ordering, count query, and explicit `Number()` conversion at the boundary. It exposes no idempotency key, reference ID, or actor and adds no update/delete SQL.
- Added directly delegated summary/history use cases; history converts pagination to skip/take and returns `PaginationMetaDto`.
- Added protected `GET /api/v1/points/me` and `GET /api/v1/points/me/ledger?page=&pageSize=` endpoints, Point controller module, and ApiModule registration. Principal `userId` is applied after query spread, so a caller-provided query `userId` cannot override it.
- Added concrete Swagger/validation DTOs using the established pagination convention.
- Updated `core` and `core-lib` READMEs with endpoints/shared DTO documentation.

## Files changed
- `suites/chantam.vn/chantam/core-lib/README.md`
- `suites/chantam.vn/chantam/core-lib/src/dto/index.ts`
- `suites/chantam.vn/chantam/core-lib/src/dto/point/index.ts`
- `suites/chantam.vn/chantam/core-lib/src/dto/point/point.dto.ts`
- `suites/chantam.vn/chantam/core/README.md`
- `suites/chantam.vn/chantam/core/src/application/contracts/point/index.ts`
- `suites/chantam.vn/chantam/core/src/application/contracts/point/get-own-point-ledger.use-case.ts`
- `suites/chantam.vn/chantam/core/src/application/contracts/point/get-own-point-summary.use-case.ts`
- `suites/chantam.vn/chantam/core/src/application/implementations/point/get-own-point-ledger.use-case.spec.ts`
- `suites/chantam.vn/chantam/core/src/application/implementations/point/get-own-point-ledger.use-case.ts`
- `suites/chantam.vn/chantam/core/src/application/implementations/point/get-own-point-summary.use-case.spec.ts`
- `suites/chantam.vn/chantam/core/src/application/implementations/point/get-own-point-summary.use-case.ts`
- `suites/chantam.vn/chantam/core/src/application/implementations/point/point.module.ts`
- `suites/chantam.vn/chantam/core/src/domain/ports/repository/point-ledger.repository.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/api/api.module.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/api/point/point.controller.spec.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/api/point/point.controller.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/api/point/point.module.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/index.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/point/index.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/point/point.dto.spec.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/point/point.dto.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/repository/point-ledger-read.repository.spec.ts`
- `suites/chantam.vn/chantam/core/src/infrastructure/repository/point-ledger.repository.ts`

## TDD evidence
### RED
Command (initially issued from workspace root, then corrected to the package command):
```powershell
npm --prefix "suites\\chantam.vn\\chantam\\core" run test -- --runInBand src/application/implementations/point/get-own-point-summary.use-case.spec.ts
```
Output: failed as expected with `TS2307: Cannot find module './get-own-point-summary.use-case'` before the implementation existed.

### GREEN
```powershell
npm --prefix "suites\\chantam.vn\\chantam\\core-lib" run build
npm --prefix "suites\\chantam.vn\\chantam\\core" run test -- --runInBand src/application/implementations/point/get-own-point-summary.use-case.spec.ts src/application/implementations/point/get-own-point-ledger.use-case.spec.ts src/infrastructure/repository/point-ledger.repository.spec.ts src/infrastructure/repository/point-ledger-read.repository.spec.ts src/infrastructure/controller/api/point/point.controller.spec.ts src/infrastructure/controller/dto/point/point.dto.spec.ts
```
Output: core-lib built successfully; 6 suites / 12 tests passed.

## Verification evidence
```powershell
npx tsc --project "suites\\chantam.vn\\chantam\\core\\tsconfig.json" --noEmit
```
Output: success (no diagnostics).

```powershell
npx prettier --check "suites/chantam.vn/chantam/core-lib/src/dto/point/**/*.ts" "suites/chantam.vn/chantam/core/src/application/contracts/point/**/*.ts" "suites/chantam.vn/chantam/core/src/application/implementations/point/**/*.ts" "suites/chantam.vn/chantam/core/src/domain/ports/repository/point-ledger.repository.ts" "suites/chantam.vn/chantam/core/src/infrastructure/repository/point-ledger.repository.ts" "suites/chantam.vn/chantam/core/src/infrastructure/repository/point-ledger-read.repository.spec.ts" "suites/chantam.vn/chantam/core/src/infrastructure/controller/api/point/**/*.ts" "suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/point/**/*.ts" "suites/chantam.vn/chantam/core-lib/src/dto/index.ts" "suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/index.ts" "suites/chantam.vn/chantam/core/src/infrastructure/controller/api/api.module.ts"
```
Output: `All matched files use Prettier code style!`

```powershell
git diff --check
```
Output: success (no whitespace errors).

## Self-review
- Confirmed read paths query the projection table and owner-scoped ledger SQL only.
- Confirmed history payload excludes sensitive/internal ledger fields and numeric raw values are converted.
- Confirmed query data cannot override the authenticated principal user ID.
- Confirmed no rank files or rank behavior changed and existing append tests still pass.

## Concerns
- No known concerns. Full repository test/lint suites were not run; verification was scoped to Task 3 plus core TypeScript and formatting checks.

## Commit
Pending commit SHA.
