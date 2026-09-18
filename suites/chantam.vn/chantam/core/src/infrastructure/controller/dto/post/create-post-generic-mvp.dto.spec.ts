import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostBodyDto } from './create-post.dto';

const common = {
  title: 'Bài đăng canonical dùng chung',
  description: 'Mô tả đủ dài cho Generic MVP của mọi loại bài đăng.',
  categoryId: '30000000-0000-4000-8000-000000000001',
  location: { lat: 10.7724, lng: 106.698 },
  areaLabel: 'Quận 1, TP.HCM',
};

describe('CreatePostBodyDto Generic MVP', () => {
  it.each(['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'])(
    'accepts Generic MVP post type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(CreatePostBodyDto, {
          post: {
            ...common,
            postType,
            ...(postType === 'OFFER'
              ? { condition: 'USED', estimatedValue: 1_500_000 }
              : {}),
          },
        }),
      );

      expect(errors).toHaveLength(0);
    },
  );
});
