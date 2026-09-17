import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetPostMapQueryDto } from './get-post-map.dto';

describe('GetPostMapQueryDto', () => {
  const validBox = {
    minLat: 10.7,
    maxLat: 10.8,
    minLng: 106.6,
    maxLng: 106.8,
  };

  it('nhận bbox hợp lệ và origin đầy đủ', async () => {
    const errors = await validate(
      plainToInstance(GetPostMapQueryDto, {
        ...validBox,
        originLat: 10.75,
        originLng: 106.7,
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each([{ originLat: 10.75 }, { originLng: 106.7 }])(
    'từ chối origin thiếu một toạ độ',
    async (origin) => {
      const errors = await validate(
        plainToInstance(GetPostMapQueryDto, { ...validBox, ...origin }),
      );

      expect(errors).not.toHaveLength(0);
    },
  );
});
