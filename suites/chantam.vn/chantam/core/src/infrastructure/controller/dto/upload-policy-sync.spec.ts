import {
  AllowedImageContentTypes,
  MediaSizeLimits,
} from '@chantam/service.storage-lib';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestChatMediaUploadDto } from './chat/chat.dto';
import { RequestCommentMediaUploadDto } from './feed/comment.dto';
import { RequestGiftEvidenceUploadDto } from './transaction/gift-evidence.dto';

/**
 * DTO xin URL tải ảnh phải chặn ĐÚNG luật mà storage-lib áp lúc ký URL.
 *
 * Trước 17/10 mỗi DTO tự chép `5 * 1024 * 1024` và danh sách loại ảnh. Đổi luật ở
 * storage-lib thì DTO vẫn cho qua thứ storage từ chối (thành lỗi muộn), hoặc chặn
 * thứ storage nhận. Phép kiểm đo theo giá trị của storage-lib, nên lệch là đỏ.
 */
const Cases = [
  {
    name: 'ảnh bằng chứng lượt trao',
    dto: RequestGiftEvidenceUploadDto,
    limit: MediaSizeLimits.transactionEvidence,
  },
  {
    name: 'ảnh chat',
    dto: RequestChatMediaUploadDto,
    limit: MediaSizeLimits.chatMedia,
  },
  {
    name: 'ảnh bình luận',
    dto: RequestCommentMediaUploadDto,
    limit: MediaSizeLimits.commentMedia,
  },
] as const;

async function errorsFor(
  dto: (typeof Cases)[number]['dto'],
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((error) => error.property);
}

describe('DTO tải ảnh khớp chính sách storage-lib', () => {
  describe.each(Cases)('$name', ({ dto, limit }) => {
    it('đúng bằng trần của storage thì qua', async () => {
      expect(
        await errorsFor(dto, {
          contentType: 'image/webp',
          contentLength: limit,
        }),
      ).toEqual([]);
    });

    it('vượt trần một byte thì bị chặn', async () => {
      expect(
        await errorsFor(dto, {
          contentType: 'image/webp',
          contentLength: limit + 1,
        }),
      ).toEqual(['contentLength']);
    });

    it('nhận đúng mọi loại ảnh storage nhận, và chặn loại khác', async () => {
      for (const contentType of AllowedImageContentTypes)
        expect(await errorsFor(dto, { contentType, contentLength: 1 })).toEqual(
          [],
        );
      expect(
        await errorsFor(dto, { contentType: 'video/mp4', contentLength: 1 }),
      ).toEqual(['contentType']);
    });
  });
});
