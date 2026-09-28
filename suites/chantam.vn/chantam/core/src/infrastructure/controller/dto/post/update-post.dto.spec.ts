import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePostDto } from './update-post.dto';

describe('UpdatePostDto', () => {
  it('accepts expanded fields and explicit delivery clearing', async () => {
    const dto = plainToInstance(UpdatePostDto, {
      categoryId: '30000000-0000-4000-8000-000000000001',
      totalQuantity: 3,
      isSos: false,
      deliveryMethod: null,
      shipPayer: null,
      price: 10000,
      negotiable: true,
      condition: 'USED',
      location: { lat: 21, lng: 105 },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    'title',
    'description',
    'categoryId',
    'totalQuantity',
    'isSos',
    'price',
    'negotiable',
    'condition',
    'location',
  ])('rejects null for %s rather than bypassing validation', async (field) => {
    expect(
      await validate(plainToInstance(UpdatePostDto, { [field]: null })),
    ).not.toHaveLength(0);
  });

  it.each([
    { totalQuantity: 0 },
    { totalQuantity: 1.5 },
    { deliveryMethod: 'OTHER' },
    { price: -1 },
  ])('rejects invalid values %p', async (input) => {
    expect(
      await validate(plainToInstance(UpdatePostDto, input)),
    ).not.toHaveLength(0);
  });
});
