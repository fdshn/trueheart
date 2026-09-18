/**
 * Danh sách migration, theo đúng thứ tự áp dụng.
 *
 * Cố ý liệt kê tường minh chứ không dùng glob: glob phải trỏ `.ts` khi chạy
 * ts-node và `.js` khi chạy từ `dist`, nên luôn sai ở một trong hai môi trường.
 * `bin/generate-migration.mjs` tự dựng lại danh sách này sau mỗi lần sinh —
 * không sửa tay.
 */

export * from './1789462778931-InitGiftPost';
export * from './1789463943036-CreateUsers';
export * from './1789700000000-NormalizeUserIdentityIndexes';
export * from './1789800000000-CreateCategories';
export * from './1789800000001-SeedBaseCategories';
export * from './1789900000000-CreateCanonicalPosts';
export * from './1789900000001-ConstrainCanonicalPostQuantity';
export * from './1789900000002-MakeCanonicalPostMediaIdempotent';
export * from './1789900000003-CreateOnboardingTasks';
export * from './1790000000000-CreateRankReferralFoundation';
