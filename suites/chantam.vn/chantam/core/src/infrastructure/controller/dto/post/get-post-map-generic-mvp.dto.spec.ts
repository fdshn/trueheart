import { PublicDiscoveryPostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetPostMapQueryDto } from './get-post-map.dto';

describe('GetPostMapQueryDto Generic MVP', () => {
  const validBox = {
    minLat: 10.7,
    maxLat: 10.8,
    minLng: 106.6,
    maxLng: 106.8,
  };

  it.each(PublicDiscoveryPostTypes)(
    'accepts public Generic MVP type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(GetPostMapQueryDto, { ...validBox, postType }),
      );

      expect(errors).toHaveLength(0);
    },
  );

  it.each(['ADS', 'offer'])(
    'rejects non-public map type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(GetPostMapQueryDto, { ...validBox, postType }),
      );

      expect(errors).not.toHaveLength(0);
    },
  );
});
