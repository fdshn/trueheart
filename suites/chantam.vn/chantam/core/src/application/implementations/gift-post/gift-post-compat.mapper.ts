import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGiftPostEntity,
  IPostEntity,
} from '@chantam.vn/chantam.core-lib/entities';

const CategoryIdByLegacyCategory: Readonly<Record<GiftPostCategories, string>> =
  {
    [GiftPostCategories.HOUSEHOLD]: '30000000-0000-4000-8000-000000000001',
    [GiftPostCategories.CLOTHING]: '30000000-0000-4000-8000-000000000002',
    [GiftPostCategories.BOOKS]: '30000000-0000-4000-8000-000000000003',
    [GiftPostCategories.ELECTRONICS]: '30000000-0000-4000-8000-000000000004',
    [GiftPostCategories.FURNITURE]: '30000000-0000-4000-8000-000000000005',
    [GiftPostCategories.VEHICLE]: '30000000-0000-4000-8000-000000000006',
    [GiftPostCategories.MEDICAL]: '30000000-0000-4000-8000-000000000007',
    [GiftPostCategories.FOOD]: '30000000-0000-4000-8000-000000000008',
    [GiftPostCategories.OTHER]: '30000000-0000-4000-8000-000000000009',
    [GiftPostCategories.NON_MATERIAL]: '30000000-0000-4000-8000-000000000010',
  };

const LegacyCategoryByCategoryId = new Map(
  Object.entries(CategoryIdByLegacyCategory).map(([category, categoryId]) => [
    categoryId,
    category as GiftPostCategories,
  ]),
);

export function toCanonicalCategoryId(category: GiftPostCategories): string {
  return CategoryIdByLegacyCategory[category];
}

export function toLegacyGiftPost(post: IPostEntity): IGiftPostEntity {
  const category = LegacyCategoryByCategoryId.get(post.categoryId);
  if (!category)
    throw new Error('Canonical post category không có legacy mapping.');

  const condition = post.details.condition;
  const estimatedValue = post.details.estimatedValue;
  if (
    !Object.values(GiftPostConditions).includes(condition as GiftPostConditions)
  )
    throw new Error('Canonical OFFER không có condition legacy hợp lệ.');
  if (typeof estimatedValue !== 'number')
    throw new Error('Canonical OFFER không có estimatedValue legacy hợp lệ.');

  return {
    id: post.id,
    globalId: post.globalId,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    deletedAt: post.deletedAt,
    title: post.title,
    description: post.description,
    category,
    condition: condition as GiftPostConditions,
    estimatedValue,
    location: post.location,
    areaLabel: post.areaLabel,
    status: post.status,
    totalQuantity: post.totalQuantity,
    remainingQuantity: post.remainingQuantity,
    giverId: post.authorId,
  };
}

export function toCanonicalOffer(input: {
  globalId: string;
  userId: string;
  giftPost: {
    title: string;
    description: string;
    category: GiftPostCategories;
    condition: GiftPostConditions;
    estimatedValue: number;
    location: { lat: number; lng: number };
    areaLabel: string;
    totalQuantity?: number;
  };
}): Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'> {
  const totalQuantity = input.giftPost.totalQuantity ?? 1;
  return {
    globalId: input.globalId,
    postType: PostTypes.OFFER,
    authorId: input.userId,
    categoryId: toCanonicalCategoryId(input.giftPost.category),
    title: input.giftPost.title,
    description: input.giftPost.description,
    location: input.giftPost.location,
    areaLabel: input.giftPost.areaLabel,
    status: GiftPostStatuses.PENDING_REVIEW,
    totalQuantity,
    remainingQuantity: totalQuantity,
    details: {
      condition: input.giftPost.condition,
      estimatedValue: input.giftPost.estimatedValue,
    },
    expiresAt: null,
    renewedCount: 0,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    deletedAt: null,
  };
}
