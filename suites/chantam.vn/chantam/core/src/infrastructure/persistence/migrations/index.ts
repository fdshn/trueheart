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
export * from './1790100000000-CreateEntitlementPolicies';
export * from './1790200000000-CreateSystemConfigAdminAudit';
export * from './1790300000000-CreateNotificationChannels';
export * from './1790400000000-CreateGiftTransactions';
export * from './1790500000000-AddEntitlementAdminPermissions';
export * from './1790600000000-AddCategoryPostTypes';
export * from './1790700000000-CreateGiftRequests';
export * from './1790800000000-AddPostSosAndCharityTransfer';
export * from './1790900000000-CreateChatAndNotifications';
export * from './1791000000000-AddGiftTransactionClosedBy';
export * from './1791100000000-AddNegativePointsAndShipping';
export * from './1791200000000-SeedGiftCompletionPointRules';
export * from './1791300000000-AddHandoverAndEvidence';
export * from './1791400000000-AddChatRetention';
export * from './1791500000000-CreateFeedInteractions';
export * from './1791600000000-AddSelectionModeAndLikes';
export * from './1791700000000-SeedOnboardingCompletedPointRule';
export * from './1791800000000-AddAdminPostPermissions';
export * from './1791900000000-CreateReports';
export * from './1792000000000-AddAdminCategoryPermissions';
export * from './1792100000000-SnapshotRankMaintenancePolicy';
export * from './1792200000000-MergePostLikesIntoReactions';
export * from './1792300000000-AddCommentReportTarget';
export * from './1792400000000-AddChatMessageMedia';
export * from './1792500000000-ReplaceOperatorAllowlistsWithRbac';
export * from './1792600000000-CreateTransactionReviews';
export * from './1792700000000-SeedReportUpheldPointRule';
export * from './1792800000000-AddPointAdjustPermission';
