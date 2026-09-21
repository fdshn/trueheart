import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  toCanonicalCategoryId,
  toCanonicalOffer,
  toLegacyGiftPost,
} from './gift-post-compat.mapper';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.OFFER,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000006',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
    },
    expiresAt: null,
    renewedCount: 0,
    isSos: false,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('gift post compatibility mapper', () => {
  it.each([
    [GiftPostCategories.HOUSEHOLD, '30000000-0000-4000-8000-000000000001'],
    [GiftPostCategories.CLOTHING, '30000000-0000-4000-8000-000000000002'],
    [GiftPostCategories.BOOKS, '30000000-0000-4000-8000-000000000003'],
    [GiftPostCategories.ELECTRONICS, '30000000-0000-4000-8000-000000000004'],
    [GiftPostCategories.FURNITURE, '30000000-0000-4000-8000-000000000005'],
    [GiftPostCategories.VEHICLE, '30000000-0000-4000-8000-000000000006'],
    [GiftPostCategories.MEDICAL, '30000000-0000-4000-8000-000000000007'],
    [GiftPostCategories.FOOD, '30000000-0000-4000-8000-000000000008'],
    [GiftPostCategories.OTHER, '30000000-0000-4000-8000-000000000009'],
    [GiftPostCategories.NON_MATERIAL, '30000000-0000-4000-8000-000000000010'],
  ])('maps %s to canonical category %s', (legacy, categoryId) => {
    expect(toCanonicalCategoryId(legacy)).toBe(categoryId);
  });

  it('projects canonical OFFER into exact legacy field names', () => {
    const legacy = toLegacyGiftPost(makePost());

    expect(legacy).toMatchObject({
      giverId: '22222222-2222-2222-2222-222222222222',
      category: GiftPostCategories.VEHICLE,
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
    });
  });

  it('maps legacy create input into canonical OFFER details', () => {
    const canonical = toCanonicalOffer({
      globalId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      giftPost: {
        title: 'Xe đạp cũ',
        description: 'Còn dùng tốt',
        category: GiftPostCategories.VEHICLE,
        condition: GiftPostConditions.USED,
        estimatedValue: 1_500_000,
        location: { lat: 10.7724, lng: 106.698 },
        areaLabel: 'Quận 1, TP.HCM',
      },
    });

    expect(canonical).toMatchObject({
      postType: PostTypes.OFFER,
      categoryId: '30000000-0000-4000-8000-000000000006',
      authorId: '22222222-2222-2222-2222-222222222222',
      details: {
        condition: GiftPostConditions.USED,
        estimatedValue: 1_500_000,
      },
    });
  });
});
