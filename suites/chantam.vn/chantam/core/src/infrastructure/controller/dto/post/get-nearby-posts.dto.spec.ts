import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetNearbyPostsQueryDto } from './get-nearby-posts.dto';

const validQuery = {
  lat: 10.7724,
  lng: 106.698,
  radiusMeters: 5_000,
  postType: 'OFFER',
};

describe('GetNearbyPostsQueryDto', () => {
  it.each(['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'])(
    'accepts public post type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(GetNearbyPostsQueryDto, { ...validQuery, postType }),
      );

      expect(errors).toHaveLength(0);
    },
  );

  it('reports the same allowed values advertised by Swagger', async () => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, {
        ...validQuery,
        postType: 'ADS',
      }),
    );

    expect(errors[0].constraints?.isIn).toBe(
      'postType must be one of the following values: OFFER, WANTED, CHARITY, CLASSIFIED, MERIT',
    );
  });

  it.each([
    { postType: undefined },
    { postType: 'ADS' },
    { categoryId: 'not-a-uuid' },
    { radiusMeters: 99 },
    { radiusMeters: 50_001 },
    { pageSize: 51 },
  ])('rejects invalid public discovery query %#', async (override) => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, { ...validQuery, ...override }),
    );

    expect(errors).not.toHaveLength(0);
  });
});
