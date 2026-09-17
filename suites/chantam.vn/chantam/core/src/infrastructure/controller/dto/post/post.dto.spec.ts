import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetPostParamsDto } from './post.dto';

describe('GetPostParamsDto', () => {
  it('nhận postId UUID hợp lệ', async () => {
    const errors = await validate(
      plainToInstance(GetPostParamsDto, {
        postId: '4182a141-a5c5-5c25-92ab-0d4488158e8f',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each([{}, { postId: 'khong-phai-uuid' }])(
    'từ chối postId thiếu hoặc sai định dạng',
    async (input) => {
      const errors = await validate(plainToInstance(GetPostParamsDto, input));

      expect(errors).not.toHaveLength(0);
    },
  );
});
