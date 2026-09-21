import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AcceptGiftRequestParamDto,
  CreateGiftRequestBodyDto,
  CreateGiftRequestParamDto,
  ListPostRequestsParamDto,
  ListPostRequestsQueryDto,
  WithdrawGiftRequestParamDto,
} from './index';

const ValidUuid = '4182a141-a5c5-5c25-92ab-0d4488158e8f';

async function errorsOf(
  dto: new (...args: never[]) => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, payload));
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('CreateGiftRequestBodyDto', () => {
  it('nhận lời nhắn hợp lệ', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'Em xin món này ạ' }),
    ).toEqual([]);
  });

  it('từ chối lời nhắn rỗng', async () => {
    // Lời nhắn là thứ người tặng dựa vào để chọn người nhận; rỗng thì họ không
    // có gì để cân nhắc.
    expect(await errorsOf(CreateGiftRequestBodyDto, { message: '' })).toContain(
      'isNotEmpty',
    );
  });

  it('từ chối lời nhắn quá 500 ký tự', async () => {
    // Trần này phải khớp `varchar(500)` của cột trong database — vượt mà lọt
    // xuống thì Postgres ném lỗi và người dùng nhận 500 thay vì lỗi validate.
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'a'.repeat(501) }),
    ).toContain('maxLength');
  });

  it('chấp nhận đúng 500 ký tự', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'a'.repeat(500) }),
    ).toEqual([]);
  });

  it('từ chối message không phải chuỗi', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 123 }),
    ).toContain('isString');
  });
});

describe('Tham số đường dẫn của gift-request', () => {
  const paramDtos = [
    ['CreateGiftRequestParamDto', CreateGiftRequestParamDto],
    ['WithdrawGiftRequestParamDto', WithdrawGiftRequestParamDto],
    ['ListPostRequestsParamDto', ListPostRequestsParamDto],
  ] as const;

  it.each(paramDtos)('%s nhận postId là UUID hợp lệ', async (_name, dto) => {
    expect(await errorsOf(dto, { postId: ValidUuid })).toEqual([]);
  });

  it.each(paramDtos)(
    '%s từ chối postId không phải UUID',
    async (_name, dto) => {
      expect(await errorsOf(dto, { postId: 'khong-phai-uuid' })).toContain(
        'isUuid',
      );
    },
  );

  it('AcceptGiftRequestParamDto đòi cả postId lẫn requestId', async () => {
    expect(
      await errorsOf(AcceptGiftRequestParamDto, {
        postId: ValidUuid,
        requestId: ValidUuid,
      }),
    ).toEqual([]);
    expect(
      await errorsOf(AcceptGiftRequestParamDto, {
        postId: ValidUuid,
        requestId: 'khong-phai-uuid',
      }),
    ).toContain('isUuid');
  });
});

describe('ListPostRequestsQueryDto', () => {
  it('bỏ trống thì hợp lệ, phân trang rơi về mặc định', async () => {
    expect(await errorsOf(ListPostRequestsQueryDto, {})).toEqual([]);
  });

  it('chặn pageSize vượt trần', async () => {
    // Trần tồn tại để một bài có hàng nghìn lượt xin không kéo hết về một
    // response.
    expect(
      await errorsOf(ListPostRequestsQueryDto, { page: 1, pageSize: 5000 }),
    ).toContain('max');
  });

  it('chặn page nhỏ hơn 1', async () => {
    expect(await errorsOf(ListPostRequestsQueryDto, { page: 0 })).toContain(
      'min',
    );
  });
});
